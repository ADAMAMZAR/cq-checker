// Load constants
importScripts('../shared/constants.js');

let _stopController = null;
let _activeAribaTabId = null;

// Spawns the standalone panel window when the extension icon is clicked
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('panel/panel.html') });
  if (tabs.length > 0) {
    const tab = tabs[0];
    try {
      chrome.windows.update(tab.windowId, { focused: true });
      chrome.tabs.update(tab.id, { active: true });
    } catch (e) {
      chrome.windows.create({
        url: chrome.runtime.getURL('panel/panel.html'),
        type: 'popup',
        width: POPUP_WIDTH,
        height: POPUP_HEIGHT,
        focused: true
      });
    }
  } else {
    chrome.windows.create({
      url: chrome.runtime.getURL('panel/panel.html'),
      type: 'popup',
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      focused: true
    });
  }
});

// Listener for messages from panel.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PROCESS_AUDIT_DATA') {
    handleAuditData(sender.tab.id, message);
  } else if (message.action === 'stopAutomation') {
    if (_stopController) {
      _stopController.abort();
    }
    if (_activeAribaTabId) {
      chrome.tabs.sendMessage(_activeAribaTabId, { action: 'stopAutomation' }).catch(() => {});
    }
  } else if (message.action === 'reportError') {
    console.error(`[Ariba SW Error] Source: ${message.source}, Message: ${message.message}`);
    notifyPanel(`Error in ${message.source}: ${message.message}`, true);
  }
  return true; // Keep message channel open
});

// ── Helpers ────────────────────────────────────────────────────────────

function notifyPanel(text, error = false, done = false) {
  chrome.runtime.sendMessage({
    type: 'status',
    text,
    error,
    done
  }).catch(() => {
    // Ignore error if panel has closed
  });
}

function notifyAribaTab(tabId, text, isError = false) {
  chrome.tabs.sendMessage(tabId, { action: 'showToast', text, isError }).catch(() => {});
}

function cleanName(n) {
  if (typeof SUPPLIER_CLEAN_RULES === 'undefined') {
    return n.replace(/["']/g, '').trim();
  }
  return SUPPLIER_CLEAN_RULES
    .reduce((s, [re, rep]) => s.replace(re, rep), n)
    .trim();
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = uint8ArrayToBase64(bytes);
  return `data:${blob.type};base64,${base64}`;
}

// Disk save queue lock to protect memory usage during base64 conversions
let _diskSaveLock = Promise.resolve();
function withDiskSaveLock(fn) {
  const run = _diskSaveLock.then(fn, fn);
  _diskSaveLock = run.then(() => { }, () => { });
  return run;
}

async function hashArrayBuffer(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fetch helpers with timeout + external abort controller signals
async function fetchWithTimeout(url, timeoutMs = 30000, stopSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onStop = () => controller.abort();
  if (stopSignal) stopSignal.addEventListener('abort', onStop, { once: true });

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (stopSignal?.aborted) throw new Error('Stopped by user.');
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
    if (stopSignal) stopSignal.removeEventListener('abort', onStop);
  }
}

async function fetchWithRetry(url, { retries = 2, timeoutMs = 30000, delayMs = 2000, tabId = null, filename = '', stopSignal = null } = {}) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (stopSignal?.aborted) throw new Error('Stopped by user.');
    try {
      const resp = await fetchWithTimeout(url, timeoutMs, stopSignal);
      if (resp.ok) return resp;
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    } catch (err) {
      if (err.message === 'Stopped by user.' || attempt > retries) throw err;
      if (tabId) notifyAribaTab(tabId, `Retry ${attempt}/${retries} for "${filename}"...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ── Main Audit and Ingestion Refactored Flow ───────────────────────────

async function handleAuditData(tabId, data) {
  const { supplierName, rawSupplierName, workspaceTitle, files, extractedQAData } = data;
  
  _stopController = new AbortController();
  _activeAribaTabId = tabId;
  const stopSignal = _stopController.signal;

  const s = cleanName(supplierName);

  const AUTOMATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 mins
  let timeoutHandle = setTimeout(() => {
    _stopController.abort();
    notifyPanel('Audit pipeline timed out after 10 minutes.', true);
  }, AUTOMATION_TIMEOUT_MS);

  try {
    // Step 1: Download attachments into RAM & Disk first
    notifyPanel('Downloading attachments into RAM & Disk...');
    notifyAribaTab(tabId, 'Downloading attachments into RAM & Disk...');

    const DOWNLOAD_CONCURRENCY = 4;
    const fileBlobs = [];
    const diskDownloadIds = [];
    const usedFilenames = new Set();
    const seenHashes = new Map();

    async function processFile(idx) {
      if (stopSignal.aborted) throw new Error('Stopped by user.');
      const file = files[idx];
      let realFilename = file.filename.replace(/["']/g, '').trim();
      let mimeType = '';
      let blob = null;

      notifyPanel(`Fetching file ${idx + 1}/${files.length}: ${realFilename}...`);
      notifyAribaTab(tabId, `Fetching file ${idx + 1}/${files.length}: ${realFilename}...`);

      try {
        const resp = await fetchWithRetry(file.url, {
          retries: 2, timeoutMs: 30000, delayMs: 2000, tabId, filename: realFilename, stopSignal
        });

        // Resolve clean filename from Content-Disposition header
        const disp = resp.headers.get('Content-Disposition');
        if (disp) {
          const utf8Match = disp.match(/filename\*=UTF-8''([^;\n]*)/i);
          if (utf8Match && utf8Match[1]) {
            try { realFilename = decodeURIComponent(utf8Match[1]); } catch (e) { realFilename = utf8Match[1]; }
          } else {
            const match = disp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
            if (match && match[1]) {
              let extracted = match[1].replace(/['"]/g, '').trim();
              if (extracted.includes('%')) {
                try { extracted = decodeURIComponent(extracted); } catch (e) { }
              }
              if (extracted) realFilename = extracted;
            }
          }
        }

        blob = await resp.blob();
        mimeType = blob.type || resp.headers.get('Content-Type') || '';

        // Content-hash deduplication (skips duplicates in this run)
        const arrayBuf = await blob.arrayBuffer();
        const fileHash = await hashArrayBuffer(arrayBuf);
        if (seenHashes.has(fileHash)) {
          const dupFile = seenHashes.get(fileHash);
          notifyPanel(`Skipped "${realFilename}" — duplicate of "${dupFile}" (already processed).`);
          notifyAribaTab(tabId, `Skipped "${realFilename}" — duplicate of "${dupFile}"`);
          return;
        }
        seenHashes.set(fileHash, realFilename);

        // Guess extension if missing
        if (!realFilename.includes('.')) {
          if (mimeType.includes('pdf')) realFilename += '.pdf';
          else if (mimeType.includes('png')) realFilename += '.png';
          else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) realFilename += '.jpg';
          else if (mimeType.includes('word') || mimeType.includes('document')) realFilename += '.docx';
          else if (mimeType.includes('excel') || mimeType.includes('sheet')) realFilename += '.xlsx';
          else realFilename += '.pdf';
        }

        // Deduplicate filenames
        let uniqueFilename = realFilename;
        let counter = 1;
        while (usedFilenames.has(uniqueFilename.toLowerCase())) {
          const lastDot = realFilename.lastIndexOf('.');
          if (lastDot !== -1) {
            uniqueFilename = `${realFilename.substring(0, lastDot)} (${counter})${realFilename.substring(lastDot)}`;
          } else {
            uniqueFilename = `${realFilename} (${counter})`;
          }
          counter++;
        }
        usedFilenames.add(uniqueFilename.toLowerCase());
        realFilename = uniqueFilename;

        fileBlobs.push({ blob, filename: realFilename });

        if (stopSignal.aborted) throw new Error('Stopped by user.');

        // Save original file to disk inside withDiskSaveLock
        try {
          await withDiskSaveLock(async () => {
            const rawDataUrl = await blobToDataUrl(blob);
            await new Promise((resolve) => {
              const destFilename = `${DOWNLOAD_ROOT}/${s}/${s} - ${cleanName(realFilename)}`;
              chrome.downloads.download({ url: rawDataUrl, filename: destFilename, saveAs: false }, (downloadId) => {
                if (chrome.runtime.lastError || downloadId === undefined) {
                  const errMsg = chrome.runtime.lastError?.message || 'Unknown download error';
                  console.error(`[Ariba SW] Disk save failed for ${realFilename}:`, errMsg);
                  notifyPanel(`Disk save failed for "${realFilename}": ${errMsg}`, true);
                } else {
                  diskDownloadIds.push(downloadId);
                }
                resolve();
              });
            });
          });
        } catch (diskErr) {
          console.error(`[Ariba SW] Disk save failed for ${realFilename}:`, diskErr);
          notifyPanel(`Disk save exception for "${realFilename}": ${diskErr.message}`, true);
        }

      } catch (err) {
        if (err.message === 'Stopped by user.') throw err;
        notifyPanel(`Failed to fetch file "${realFilename}": ${err.message}`, true);
      }
    }

    // Process files with bounded worker concurrency
    let nextFileIdx = 0;
    let firstFatalError = null;
    async function fileWorker() {
      while (nextFileIdx < files.length) {
        if (firstFatalError) return;
        const idx = nextFileIdx++;
        try {
          await processFile(idx);
        } catch (err) {
          firstFatalError = firstFatalError || err;
          return;
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, files.length) }, fileWorker)
    );

    if (firstFatalError) throw firstFatalError;
    if (stopSignal.aborted) throw new Error('Stopped by user.');

    // Step 2: Capture screenshot (JPEG format)
    notifyPanel('Capturing verification screenshot (JPEG format)...');
    notifyAribaTab(tabId, 'Capturing verification screenshot...');
    
    // Hide overlay so it is not visible in screenshot
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});
    await new Promise(r => setTimeout(r, 200));

    let screenshotBlob = null;
    try {
      screenshotBlob = await captureFullPageScreenshot(tabId);
    } catch (err) {
      console.warn('[Ariba SW] Debugger screenshot failed, running visible fallback:', err);
      try {
        screenshotBlob = await captureVisibleTabFallback(tabId);
      } catch (fbErr) {
        console.error('[Ariba SW] Fallback screenshot failed:', fbErr);
      }
    }

    // Restore overlay
    chrome.tabs.sendMessage(tabId, { action: 'showOverlay' }).catch(() => {});

    if (stopSignal.aborted) throw new Error('Stopped by user.');

    // Step 3: Save remaining logs and evidence to disk locally FIRST
    notifyPanel('Consolidating files and audit reports to local disk...');

    // Save QA data as raw JSON structured with metadata
    if (extractedQAData.length > 0) {
      const jsonDump = {
        supplierName: s,
        rawSupplierName: rawSupplierName,
        workspaceTitle: workspaceTitle,
        extractedQAData: extractedQAData
      };
      const jsonBlob = new Blob([JSON.stringify(jsonDump, null, 2)], { type: 'application/json' });
      try {
        await withDiskSaveLock(async () => {
          const jsonDataUrl = await blobToDataUrl(jsonBlob);
          const destJsonFilename = `${DOWNLOAD_ROOT}/${s}/qa_data.json`;
          await new Promise((resolve) => {
            chrome.downloads.download({ url: jsonDataUrl, filename: destJsonFilename, saveAs: false }, (downloadId) => {
              if (chrome.runtime.lastError || downloadId === undefined) {
                const errMsg = chrome.runtime.lastError?.message || 'Unknown download error';
                console.error('[Ariba SW] QA JSON save failed:', errMsg);
                notifyPanel(`QA JSON save failed: ${errMsg}`, true);
              } else {
                notifyPanel(`Saved Q&A JSON: qa_data.json`);
                notifyAribaTab(tabId, `Saved Q&A JSON → ${destJsonFilename}`);
              }
              resolve();
            });
          });
        });
      } catch (err) {
        console.error('[Ariba SW] QA JSON save failed:', err);
        notifyPanel(`QA JSON save exception: ${err.message}`, true);
      }
    } else {
      notifyPanel('Scraped Q&A form data is empty. Skipping Q&A files saving.', false);
    }

    // Save screenshot (JPEG)
    if (screenshotBlob) {
      try {
        await withDiskSaveLock(async () => {
          const screenshotDataUrl = await blobToDataUrl(screenshotBlob);
          const destImgFilename = `${DOWNLOAD_ROOT}/${s}/${s} - Screenshot.jpeg`;
          await new Promise((resolve) => {
            chrome.downloads.download({ url: screenshotDataUrl, filename: destImgFilename, saveAs: false }, (downloadId) => {
              if (chrome.runtime.lastError || downloadId === undefined) {
                const errMsg = chrome.runtime.lastError?.message || 'Unknown download error';
                console.error('[Ariba SW] Screenshot save failed:', errMsg);
                notifyPanel(`Screenshot save failed: ${errMsg}`, true);
              } else {
                notifyPanel(`Saved Verification Screenshot: ${s} - Screenshot.jpeg`);
                notifyAribaTab(tabId, `Saved Screenshot → ${destImgFilename}`);
              }
              resolve();
            });
          });
        });
      } catch (err) {
        console.error('[Ariba SW] Screenshot save failed:', err);
        notifyPanel(`Screenshot save exception: ${err.message}`, true);
      }
    } else {
      notifyPanel('No screenshot captured. Skipping screenshot save.', true);
    }

    if (stopSignal.aborted) throw new Error('Stopped by user.');

    // Step 4a: Phase 1 — Upload files & run Gemini extraction (Worker + LLM Judge)
    notifyPanel('Phase 1/2: Extracting certificate data with Gemini (Worker + LLM Judge)...');
    notifyAribaTab(tabId, 'Running Gemini extraction & LLM Judge verification...');

    const formData = new FormData();
    // Use the original (uncleaned) name for the database and all API responses
    formData.append('supplier_name', rawSupplierName);
    // Pass the folder-safe name separately so the backend uses it only for file paths
    formData.append('supplier_folder', s);
    formData.append('workspace_title', workspaceTitle);

    let certType = 'QSHE';
    if (extractedQAData.length > 0) {
      const answers = extractedQAData[0].answers;
      const typeAns = answers.find(a => a.label.toLowerCase().includes('type') || a.label.toLowerCase().includes('sijil'));
      if (typeAns && typeAns.value) certType = typeAns.value;
    }
    formData.append('cert_type', certType);
    formData.append('qa_data', JSON.stringify(extractedQAData));

    fileBlobs.forEach(fb => {
      formData.append('files', fb.blob, fb.filename);
    });

    if (screenshotBlob) {
      formData.append('screenshot', screenshotBlob, 'verification_screenshot.jpg');
    }

    const extractUrl = `${BACKEND_URL}/api/extract`;
    const extractResponse = await fetch(extractUrl, {
      method: 'POST',
      body: formData
    });

    if (!extractResponse.ok) {
      throw new Error(`Extraction endpoint returned HTTP ${extractResponse.status}`);
    }

    const extractResult = await extractResponse.json();
    notifyPanel(`Phase 1 complete — ${extractResult.file_count} file(s) extracted and verified by LLM Judge.`);
    notifyPanel('Phase 2/2: Running code-based comparison audit...');
    notifyAribaTab(tabId, 'Extraction done. Running comparison audit...');

    // Step 4b: Phase 2 — Run code-based comparison
    const compareForm = new FormData();
    compareForm.append('audit_id', extractResult.audit_id);
    compareForm.append('supplier_name', extractResult.supplier_name);
    compareForm.append('workspace_title', extractResult.workspace_title);
    compareForm.append('cert_type', extractResult.cert_type);
    compareForm.append('qa_data', extractResult.qa_data);
    compareForm.append('screenshot_url', extractResult.screenshot_url || '');
    compareForm.append('timestamp', extractResult.timestamp);

    const compareUrl = `${BACKEND_URL}/api/audit/comparison`;
    const compareResponse = await fetch(compareUrl, {
      method: 'POST',
      body: compareForm
    });

    if (!compareResponse.ok) {
      throw new Error(`Comparison audit endpoint returned HTTP ${compareResponse.status}`);
    }

    const auditResult = await compareResponse.json();

    // Complete audit state
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});
    notifyPanel(`Audit Complete! Result: ${auditResult.result}`, false, true);
    notifyPanel(`Suggested auditor comment: "${auditResult.suggested_comment}"`, false, true);
    notifyAribaTab(tabId, `Audit completed. Result: ${auditResult.result}`);

  } catch (err) {
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});
    console.error('[Ariba SW] Pipeline error:', err);
    notifyPanel(`Error running audit: ${err.message}`, true);
    notifyAribaTab(tabId, `Audit failed: ${err.message}`, true);
  } finally {
    clearTimeout(timeoutHandle);
    _stopController = null;
    _activeAribaTabId = null;
  }
}

// Full-page screenshot logic using DevTools Protocol Page.captureScreenshot
async function captureFullPageScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});

    setTimeout(() => {
      chrome.debugger.attach({ tabId: tabId }, '1.3', async () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }

        try {
          chrome.debugger.sendCommand({ tabId: tabId }, 'Page.getLayoutMetrics', {}, (metrics) => {
            // Cap dimensions to prevent GPU texture tiling limits from glitching/repeating the image
            const width = Math.max(1280, Math.ceil(metrics.cssContentSize.width || 1280));
            const height = Math.min(2500, Math.max(800, Math.ceil(metrics.cssContentSize.height || 1000)));

            chrome.debugger.sendCommand({ tabId: tabId }, 'Emulation.setDeviceMetricsOverride', {
              width: width,
              height: height,
              deviceScaleFactor: 1,
              mobile: false
            }, () => {
              chrome.debugger.sendCommand({ tabId: tabId }, 'Page.captureScreenshot', {
                format: 'jpeg',
                quality: 90,
                captureBeyondViewport: true
              }, (result) => {
                const base64Data = result ? result.data : null;

                chrome.debugger.sendCommand({ tabId: tabId }, 'Emulation.clearDeviceMetricsOverride', {});
                chrome.debugger.detach({ tabId: tabId });

                chrome.tabs.sendMessage(tabId, { action: 'showOverlay' }).catch(() => {});

                if (!base64Data) {
                  return reject(new Error('Page.captureScreenshot returned empty payload'));
                }

                resolve(base64ToBlob(base64Data, 'image/jpeg'));
              });
            });
          });
        } catch (e) {
          chrome.debugger.detach({ tabId: tabId });
          reject(e);
        }
      });
    }, 150);
  });
}

async function captureVisibleTabFallback(tabId) {
  return new Promise(async (resolve, reject) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!dataUrl) {
          return reject(new Error('captureVisibleTab returned empty string'));
        }
        const base64 = dataUrl.split(',')[1];
        resolve(base64ToBlob(base64, 'image/jpeg'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

function base64ToBlob(base64, mimeType) {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}
