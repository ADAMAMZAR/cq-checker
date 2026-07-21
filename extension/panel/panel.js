document.addEventListener('DOMContentLoaded', () => {
  // Populate the version badge from the manifest
  const versionEl = document.getElementById('ext-version');
  if (versionEl) versionEl.textContent = 'v' + chrome.runtime.getManifest().version;

  const downloadBtn = document.getElementById('download-btn');
  const stopBtn     = document.getElementById('stop-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const logEntries = document.getElementById('log-entries');

  function addLog(text, type = 'info') {
    const el = document.createElement('div');
    el.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString();
    el.textContent = `[${time}] ${text}`;
    logEntries.appendChild(el);
    logEntries.scrollTop = logEntries.scrollHeight;
  }

  /** Toggle running state: disable/enable button, show/hide Stop button. */
  function setRunning(isRunning) {
    downloadBtn.disabled = isRunning;
    stopBtn.style.display = isRunning ? 'block' : 'none';
    if (!isRunning) stopBtn.disabled = false;
  }

  // Clear Cache Button
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      clearCacheBtn.disabled = true;
      try {
        const keys = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(keys).filter(key => 
          key.startsWith('processed_hashes_')
        );
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          addLog(`Successfully cleared ${keysToRemove.length} cached duplicate hash entries.`, 'info');
        } else {
          addLog('No cached duplicate hash entries found.', 'info');
        }
      } catch (err) {
        addLog(`Failed to clear cache: ${err.message}`, 'error');
      } finally {
        clearCacheBtn.disabled = false;
      }
    });
  }

  // Download & Run Audit Button
  downloadBtn.addEventListener('click', async () => {
    logEntries.innerHTML = '';
    setRunning(true);
    addLog('Starting extraction & audit pipeline...', 'info');

    try {
      const aribaTabs = await chrome.tabs.query({ url: '*://*.ariba.com/*' });
      if (!aribaTabs.length) {
        addLog('No Ariba tab found. Please open the Ariba supplier page first.', 'error');
        setRunning(false);
        return;
      }

      const aribaTab = aribaTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      addLog(`Found Ariba tab: ${aribaTab.title || aribaTab.url}`, 'info');

      // Clear any cached supplier name from a previous run to avoid stale data
      addLog('Clearing cached supplier details...', 'info');
      await chrome.storage.local.remove(['lastSupplierName', 'lastRawSupplierName']);

      // Inject toast CSS before the script so classes are available on first call
      addLog('Injecting toast stylesheet...', 'info');
      await chrome.scripting.insertCSS({
        target: { tabId: aribaTab.id, allFrames: true },
        files: ['content/content.css']
      });
      addLog('Toast stylesheet injected.', 'info');

      // Check for already-running automation before resetting
      addLog('Checking page automation state...', 'info');
      const stateResult = await chrome.scripting.executeScript({
        target: { tabId: aribaTab.id, allFrames: true },
        func: () => window.__aribaAutomationRunning === true
      });
      const alreadyRunning = stateResult?.some(r => r.result === true);
      if (alreadyRunning) {
        addLog('Automation is already running on this page. Please wait or click Stop first.', 'error');
        setRunning(false);
        return;
      }

      // Reset stop flag only — do NOT clear __aribaAutomationRunning (prevents duplicate injection)
      addLog('Resetting page stop state...', 'info');
      const currentVersion = chrome.runtime.getManifest().version;
      await chrome.scripting.executeScript({
        target: { tabId: aribaTab.id, allFrames: true },
        func: (version) => {
          window.__aribaStop = false;
          window.__aribaContentVersion = version;
        },
        args: [currentVersion]
      });
      addLog('Page state ready.', 'info');

      // shared/constants.js must be injected first so sanitiseSupplierName()
      // in content.js has access to SUPPLIER_CLEAN_RULES at runtime.
      addLog('Injecting main automation scripts...', 'info');
      await chrome.scripting.executeScript({
        target: { tabId: aribaTab.id, allFrames: true },
        files: ['shared/constants.js', 'content/content.js']
      });
      addLog('Automation scripts successfully injected into page.', 'info');

    } catch (err) {
      addLog('Error: ' + err.message, 'error');
      chrome.runtime.sendMessage({
        action: 'reportError',
        source: 'panel.js',
        context: 'downloadBtn click',
        message: err.message,
        stack: err.stack,
      }).catch(() => { });
      setRunning(false);
    }
  });

  // Stop button — sends cancellation signal to background
  stopBtn.addEventListener('click', () => {
    addLog('Stop requested by user.', 'info');
    chrome.runtime.sendMessage({ action: 'stopAutomation' });
    stopBtn.disabled = true;
  });

  // Listen for status messages from content / background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'status') {
      const type = message.error ? 'error' : (message.done ? 'done' : 'info');
      addLog(message.text, type);
      if (message.done || message.error) {
        setRunning(false);
      }
    }
  });
});
