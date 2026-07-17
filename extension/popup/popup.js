document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('runBtn');
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');
  const progressContainer = document.getElementById('progressContainer');

  const steps = {
    1: document.getElementById('step1'),
    2: document.getElementById('step2'),
    3: document.getElementById('step3'),
    4: document.getElementById('step4')
  };

  runBtn.addEventListener('click', async () => {
    // 1. Reset and transition UI
    runBtn.disabled = true;
    statusBox.className = 'status-box active';
    statusText.textContent = 'Orchestrating audit flow...';
    progressContainer.classList.remove('hidden');
    
    // Reset steps
    Object.keys(steps).forEach(s => {
      steps[s].className = 'step';
    });

    // 2. Query active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        showError('No active tab found.');
        return;
      }
      
      const activeTab = tabs[0];
      const isAllowedUrl = activeTab.url && (
        activeTab.url.includes('ariba.com') || 
        activeTab.url.startsWith('file://') ||
        activeTab.url.includes('localhost') ||
        activeTab.url.includes('127.0.0.1')
      );

      if (!isAllowedUrl) {
        showError('Please open this extension on an SAP Ariba page.');
        return;
      }

      // 3. Trigger audit in background script
      chrome.runtime.sendMessage({
        action: 'START_AUDIT',
        tabId: activeTab.id,
        url: activeTab.url
      });
    });
  });

  // Listen for progress messages from background.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUDIT_PROGRESS') {
      const { step, statusText: text } = message;
      statusText.textContent = text;
      
      // Update steps visual states
      for (let i = 1; i <= 4; i++) {
        if (i < step) {
          steps[i].className = 'step completed';
        } else if (i === step) {
          steps[i].className = 'step active';
        } else {
          steps[i].className = 'step';
        }
      }
    } else if (message.type === 'AUDIT_COMPLETE') {
      // Mark all completed
      Object.keys(steps).forEach(s => {
        steps[s].className = 'step completed';
      });

      statusBox.className = 'status-box success';
      statusText.textContent = `Audit Complete! Result: ${message.result}. Evidence files downloaded.`;
      runBtn.disabled = false;
    } else if (message.type === 'AUDIT_ERROR') {
      showError(message.error);
    }
  });

  function showError(errorText) {
    statusBox.className = 'status-box';
    statusBox.style.borderColor = 'var(--error-color)';
    statusText.innerHTML = `<span style="color: var(--error-color); font-weight:600">Error:</span> ${errorText}`;
    runBtn.disabled = false;
    progressContainer.classList.add('hidden');
  }
});
