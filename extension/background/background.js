// Load constants
importScripts('../shared/constants.js');

// Listener for messages from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AUDIT') {
    startScrapingPipeline(message.tabId);
  } else if (message.action === 'PROCESS_AUDIT_DATA') {
    handleAuditData(sender.tab.id, message);
  }
  return true; // Keep message channel open
});

let pendingAuditTimeout = null;

// Step 1: Inject constants, content styles, and content script into the active tab
async function startScrapingPipeline(tabId) {
  try {
    if (pendingAuditTimeout) {
      clearTimeout(pendingAuditTimeout);
    }

    // Inject stylesheet into all frames
    await chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ['content/content.css']
    });

    // Inject scripts sequentially into all frames (constants first, then scraper)
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['shared/constants.js', 'content/content.js']
    });

    console.log('[Ariba SW] Scraper injected successfully in all frames.');

    // Set a 30-second timeout. If no frame sends PROCESS_AUDIT_DATA within 30 seconds, raise an error.
    pendingAuditTimeout = setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'AUDIT_ERROR',
        error: 'The audit automation timed out. No compliance document attachments or Q&A data could be retrieved from the page.'
      }).catch(() => {});
      pendingAuditTimeout = null;
    }, 30000);

  } catch (err) {
    console.error('[Ariba SW] Injection failed:', err);
    chrome.runtime.sendMessage({ type: 'AUDIT_ERROR', error: 'Failed to inject content scraper: ' + err.message });
  }
}

// Step 2: Handle data extracted by content.js, orchestrate screenshot, download, and upload
async function handleAuditData(tabId, data) {
  const { supplierName, rawSupplierName, workspaceTitle, files, extractedQAData } = data;
  
  try {
    // Clear the timeout as we successfully received data from at least one frame
    if (pendingAuditTimeout) {
      clearTimeout(pendingAuditTimeout);
      pendingAuditTimeout = null;
    }

    // 1. Notify progress
    sendProgress(1, 'Downloading compliance files into RAM...');
    
    // Download attachments from Ariba in parallel
    const fileBlobs = [];
    for (const file of files) {
      try {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        fileBlobs.push({ blob, filename: file.filename });
      } catch (err) {
        console.error(`[Ariba SW] Failed to download file ${file.filename}:`, err);
        // Continue downloading others even if one fails
      }
    }

    if (fileBlobs.length === 0) {
      throw new Error('All document downloads from Ariba failed.');
    }

    // 2. Notify progress
    sendProgress(2, 'Capturing full-page validation screenshot...');
    
    // Capture screenshot using chrome.debugger
    let screenshotBlob = null;
    try {
      screenshotBlob = await captureFullPageScreenshot(tabId);
    } catch (err) {
      console.warn('[Ariba SW] Debugger screenshot failed, falling back to visible area:', err);
      try {
        screenshotBlob = await captureVisibleTabFallback();
      } catch (fbErr) {
        console.error('[Ariba SW] Fallback screenshot also failed:', fbErr);
        // Continue audit pipeline without screenshot if both fail
      }
    }

    // 3. Notify progress
    sendProgress(3, 'Uploading data to FastAPI backend & running Gemini Audit...');

    // Package as FormData
    const formData = new FormData();
    formData.append('supplier_name', supplierName);
    formData.append('workspace_title', workspaceTitle);
    
    // Determine a primary cert type for logging (e.g. QSHE or first available)
    let certType = 'QSHE';
    if (extractedQAData.length > 0) {
      const answers = extractedQAData[0].answers;
      const typeAns = answers.find(a => a.label.toLowerCase().includes('type') || a.label.toLowerCase().includes('sijil'));
      if (typeAns && typeAns.value) certType = typeAns.value;
    }
    formData.append('cert_type', certType);
    formData.append('qa_data', JSON.stringify(extractedQAData));

    // Append files
    fileBlobs.forEach(fb => {
      formData.append('files', fb.blob, fb.filename);
    });

    // Append screenshot
    if (screenshotBlob) {
      formData.append('screenshot', screenshotBlob, 'verification_screenshot.png');
    }

    // POST to FastAPI
    const backendUrl = `${BACKEND_URL}/api/audit`;
    const response = await fetch(backendUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`FastAPI audit endpoint returned HTTP ${response.status}`);
    }

    const auditResult = await response.json();

    // 4. Notify progress
    sendProgress(4, 'Saving audit logs and evidence on local disk...');

    // Trigger local downloads of files and screenshot into a dedicated supplier folder
    const safeSupplier = supplierName.replace(/[^a-z0-9]/gi, '_');
    
    for (const fb of fileBlobs) {
      const fileDataUrl = await blobToDataURL(fb.blob);
      chrome.downloads.download({
        url: fileDataUrl,
        filename: `${safeSupplier}/${fb.filename}`,
        conflictAction: 'overwrite'
      });
    }

    if (screenshotBlob) {
      const screenshotDataUrl = await blobToDataURL(screenshotBlob);
      chrome.downloads.download({
        url: screenshotDataUrl,
        filename: `${safeSupplier}/verification_screenshot.png`,
        conflictAction: 'overwrite'
      });
    }

    // Hide the Ariba page overlay
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});

    // Notify complete state
    chrome.runtime.sendMessage({
      type: 'AUDIT_COMPLETE',
      result: auditResult.result,
      comment: auditResult.suggested_comment
    });

  } catch (err) {
    console.error('[Ariba SW] Pipeline error:', err);
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});
    chrome.runtime.sendMessage({ type: 'AUDIT_ERROR', error: err.message });
  }
}

// Full-page screenshot logic using DevTools Protocol Page.captureScreenshot
async function captureFullPageScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    // 1. Hide overlay spinner first
    chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' }).catch(() => {});

    setTimeout(() => {
      chrome.debugger.attach({ tabId: tabId }, '1.3', async () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }

        try {
          // Get layout dimensions
          chrome.debugger.sendCommand({ tabId: tabId }, 'Page.getLayoutMetrics', {}, (metrics) => {
            const width = Math.ceil(metrics.cssContentSize.width);
            const height = Math.ceil(metrics.cssContentSize.height);

            // Override device metrics to match full scroll height
            chrome.debugger.sendCommand({ tabId: tabId }, 'Emulation.setDeviceMetricsOverride', {
              width: width,
              height: height,
              deviceScaleFactor: 1,
              mobile: false
            }, () => {
              // Capture screenshot beyond visible viewport
              chrome.debugger.sendCommand({ tabId: tabId }, 'Page.captureScreenshot', {
                format: 'png',
                captureBeyondViewport: true
              }, (result) => {
                const base64Data = result ? result.data : null;

                // Cleanup and detach
                chrome.debugger.sendCommand({ tabId: tabId }, 'Emulation.clearDeviceMetricsOverride', {});
                chrome.debugger.detach({ tabId: tabId });

                // Restore overlay spinner
                chrome.tabs.sendMessage(tabId, { action: 'showOverlay' }).catch(() => {});

                if (!base64Data) {
                  return reject(new Error('Page.captureScreenshot returned empty payload'));
                }

                resolve(base64ToBlob(base64Data, 'image/png'));
              });
            });
          });
        } catch (e) {
          chrome.debugger.detach({ tabId: tabId });
          reject(e);
        }
      });
    }, 150); // Small delay to let overlay hide
  });
}

// Fallback to simple tab screenshot
async function captureVisibleTabFallback() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!dataUrl) {
        return reject(new Error('captureVisibleTab returned empty string'));
      }
      const base64 = dataUrl.split(',')[1];
      resolve(base64ToBlob(base64, 'image/png'));
    });
  });
}

// Helper: send status update message to popup.js
function sendProgress(step, statusText) {
  chrome.runtime.sendMessage({
    type: 'AUDIT_PROGRESS',
    step,
    statusText
  }).catch(() => {
    // Ignore error if popup has closed
  });
}

// Helper: Base64 to Blob converter
function base64ToBlob(base64, mimeType) {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

// Helper: Blob to base64 Data URL converter (works in MV3 service workers)
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}
