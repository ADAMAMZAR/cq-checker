(async function () {
  // ── Re-entrant guard — prevent double-execution if injected twice ─────
  if (window.__aribaAutomationRunning) {
    console.warn('[Ariba Ext] Automation already in progress, skipping duplicate injection.');
    return;
  }
  window.__aribaAutomationRunning = true;

  // ── Localization Dictionaries for Ariba UI Language & Theme Customizations ──
  const DESCRIPTION_LABELS = [
    'description',
    'keterangan', 'penerangan', // Malay
    'descripción',               // Spanish
    'description',               // French
    'beschreibung',              // German
    'descrizione',               // Italian
    '描述', '说明'                // Chinese
  ];

  const CERTIFICATE_TYPE_LABELS = [
    'certificate type',
    'jenis sijil',               // Malay
    'tipo de certificado',       // Spanish
    'type de certificat',        // French
    'zertifikatstyp',            // German
    '证书类型', '證書類型'          // Chinese
  ];

  const CERTIFICATE_PREFIX_REGEXES = [
    /^[0-9.]+\s+/,
    /^certificate of\s+/i,
    /^sijil\s+/i,
    /^certificado de\s+/i,
    /^certificat de\s+/i,
    /^zertifikat für\s+/i
  ];

  // Supplier name sanitiser
  function sanitiseSupplierName(raw) {
    if (typeof SUPPLIER_CLEAN_RULES === 'undefined') {
      return raw.replace(/["']/g, '').trim();
    }
    return SUPPLIER_CLEAN_RULES
      .reduce((s, [re, rep]) => s.replace(re, rep), raw)
      .trim();
  }

  // ── Loading Overlay ───────────────────────────────────────────────────
  function showOverlay() {
    let overlay = document.getElementById('ariba-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ariba-loading-overlay';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.6); z-index: 999998;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: sans-serif; font-size: 20px; font-weight: 500;
        backdrop-filter: blur(2px);
      `;
      
      const spinner = document.createElement('div');
      spinner.style.cssText = `
        border: 4px solid rgba(255, 255, 255, 0.3); border-top: 4px solid white;
        border-radius: 50%; width: 48px; height: 48px;
        animation: ariba-spin 1s linear infinite; margin-bottom: 20px;
      `;
      
      const style = document.createElement('style');
      style.textContent = '@keyframes ariba-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
      document.head.appendChild(style);

      const text = document.createElement('div');
      text.id = 'ariba-loading-text';
      text.textContent = 'Preparing Audit...';

      overlay.appendChild(spinner);
      overlay.appendChild(text);
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  function hideOverlay() {
    const overlay = document.getElementById('ariba-loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function updateOverlayText(txt) {
    const el = document.getElementById('ariba-loading-text');
    if (el) el.textContent = txt;
  }

  // ── Toast notifications ───────────────────────────────────────────────
  function showToast(text, isError = false) {
    let container = document.getElementById('ariba-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ariba-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'ariba-toast' + (isError ? ' ariba-toast--error' : '');
    toast.textContent = text;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('ariba-toast--visible');
    });

    setTimeout(() => {
      toast.classList.remove('ariba-toast--visible');
      toast.classList.add('ariba-toast--exit');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ── Scraper Targets ──────────────────────────────
  const allButtons = Array.from(document.querySelectorAll(
    '[aria-label="expand"], [aria-label="collapse"], ' +
    '[aria-label*="expand" i], [aria-label*="collapse" i], ' +
    '[aria-expanded], .expansion-button, .w-node-expand, .w-node-collapse, ' +
    '[awname*="expand" i], [awname*="collapse" i], [awname*="toggle" i], ' +
    '[awname*="disclosure" i], [awname*="outline" i], ' +
    '[class*="node-expand" i], [class*="node-collapse" i], ' +
    '[class*="tree-expand" i], [class*="tree-collapse" i], ' +
    'img[src*="expand" i], img[src*="collapse" i], img[src*="toggle" i], ' +
    'img[src*="plus" i], img[src*="minus" i]'
  ));

  let supplierElement = document.querySelector(
    '#supplier-name, [aria-label^="Supplier name " i], .supplier-name, [awname="SupplierName"], [awname*="SupplierName" i]'
  );

  if (!supplierElement) {
    const keyNodes = Array.from(document.querySelectorAll('.key-value-container .key.line'));
    for (const keyNode of keyNodes) {
      if (keyNode.textContent.trim().toLowerCase() === 'supplier') {
        const container = keyNode.closest('.key-value-container');
        if (container) {
          const valNode = container.querySelector('.link.line, .value.line');
          if (valNode && valNode.textContent.trim()) {
            supplierElement = valNode;
            break;
          }
        }
      }
    }
  }

  if (!supplierElement) {
    const candidates = [
      '.supplier-header .name', '.entity-name', '[class*="supplier"][class*="name"]',
      '.header-title', '.page-title', 'h1'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim();
        if (txt && txt.toLowerCase() !== 'supplier management') {
          supplierElement = el;
          break;
        }
      }
    }
  }

  if (!supplierElement) {
    const labelElements = Array.from(document.querySelectorAll('label, span, td, th, div'));
    for (const labelEl of labelElements) {
      const text = labelEl.textContent.trim().toLowerCase();
      if (text === 'supplier name' || text === 'supplier name:' || text === 'supplier' || text === 'supplier:') {
        const parent = labelEl.parentElement;
        if (parent) {
          const sibling = labelEl.nextElementSibling;
          if (sibling && sibling.textContent.trim()) {
            supplierElement = sibling;
            break;
          }
          if (labelEl.tagName === 'TD' || labelEl.tagName === 'TH') {
            const row = labelEl.closest('tr');
            if (row) {
              const cells = Array.from(row.cells);
              const idx = cells.indexOf(labelEl);
              if (idx !== -1 && cells[idx + 1]) {
                supplierElement = cells[idx + 1];
                break;
              }
            }
          }
        }
      }
    }
  }

  const allAnchors = Array.from(document.querySelectorAll('a')).filter(a => {
    const text = a.textContent.trim().toLowerCase();
    const href = (a.getAttribute('href') || '').toLowerCase();
    const awname = (a.getAttribute('awname') || '').toLowerCase();
    
    const isMockFormat = a.classList.contains('file-name') || (a.parentElement && a.parentElement.classList.contains('file-name-container'));
    if (isMockFormat) return true;

    const hasFileExtension = /\.(pdf|docx?|xlsx?|zip|jpe?g|png)$/i.test(text);
    const isAttachmentLink = href.includes('attachment') || href.includes('download') || href.includes('awcontent') || href.includes('/ad/document/') ||
                             awname.includes('attachment') || awname.includes('download');
    
    return hasFileExtension || isAttachmentLink;
  });

  // Listen for control actions from background/panel
  if (!window.hasAribaToastListener) {
    window.hasAribaToastListener = true;
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'showToast') {
        showToast(message.text, message.isError);
      } else if (message.action === 'updateOverlay') {
        updateOverlayText(message.text);
      } else if (message.action === 'hideOverlay') {
        hideOverlay();
      } else if (message.action === 'showOverlay') {
        showOverlay();
      } else if (message.action === 'hideToasts') {
        const c = document.getElementById('ariba-toast-container');
        if (c) c.style.visibility = 'hidden';
      } else if (message.action === 'showToasts') {
        const c = document.getElementById('ariba-toast-container');
        if (c) c.style.visibility = '';
      } else if (message.action === 'stopAutomation') {
        window.__aribaStop = true;
        hideOverlay();
        showToast('Stopping audit automation...', false);
      }
    });
  }

  // Set Scope Mode (content-2 is preferred updated questionnaire container)
  let scopeLabel = 'all';
  let scopeFilter = null;
  const content2Container = document.querySelector('.content-2, [content2]');
  if (content2Container) {
    scopeLabel = 'content-2-only';
    scopeFilter = el => el.closest('.content-2, [content2]');
  }

  let expansionButtons = scopeFilter ? allButtons.filter(scopeFilter) : allButtons;

  // Resolve supplier name with sync storage backup
  let supplierName = 'Unknown Supplier';
  let rawSupplierName = 'Unknown Supplier';
  if (supplierElement) {
    rawSupplierName = supplierElement.textContent.trim();
    supplierName = sanitiseSupplierName(rawSupplierName);

    // Cache the supplier name in storage so peer frames can read it
    chrome.storage.local.set({ lastSupplierName: supplierName, lastRawSupplierName: rawSupplierName }).catch(err => {
      console.warn('[Ariba Ext] Failed to cache supplier name:', err);
    });
  }

  if (supplierName === 'Unknown Supplier' || !supplierName) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const stored = await chrome.storage.local.get(['lastSupplierName', 'lastRawSupplierName']);
        if (stored.lastSupplierName) {
          supplierName = stored.lastSupplierName;
          rawSupplierName = stored.lastRawSupplierName || stored.lastSupplierName;
          break;
        }
      } catch (err) {
        console.warn('[Ariba Ext] Failed to read supplier name from storage:', err);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Page title fallback
  if (supplierName === 'Unknown Supplier' || !supplierName || supplierName.toLowerCase() === 'supplier management') {
    const pageTitle = document.title.trim();
    if (pageTitle && pageTitle !== 'Ariba' && pageTitle !== '') {
      const titleParts = pageTitle.split(/[|\-–]/);
      const candidate = titleParts[0].trim();
      if (candidate && candidate.toLowerCase() !== 'ariba' && candidate.toLowerCase() !== 'supplier management') {
        rawSupplierName = candidate;
        supplierName = sanitiseSupplierName(candidate);
      }
    }
  }

  if (supplierName.toLowerCase() === 'supplier management') {
    supplierName = 'Unknown Supplier';
  }

  if (allButtons.length === 0 && allAnchors.length === 0) {
    console.log('[Ariba Ext] Helper frame finished caching supplier name. Returning early.');
    window.__aribaAutomationRunning = false;
    return;
  }

  try {
    showOverlay();
    showToast('Initializing scraper pipeline...');

    let workspaceTitle = 'Questionnaire';
    const titleElement = document.getElementById('workspace-title');
    if (titleElement) {
      workspaceTitle = titleElement.textContent.trim();
    }

    // Step 1: Expand sections
    function isAlreadyExpanded(btn) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const iconText = btn.textContent.trim().toLowerCase();
      return label === 'collapse' || iconText === 'remove' || (label.startsWith('toggle') && iconText === 'expand_less');
    }

    if (expansionButtons.length > 0) {
      updateOverlayText(`Expanding ${expansionButtons.length} sections...`);
      for (const btn of expansionButtons) {
        if (window.__aribaStop) throw new Error('Stopped by user.');
        if (isAlreadyExpanded(btn)) continue;
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
          btn.dispatchEvent(new MouseEvent(type, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
        });
        try { btn.click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // Step 2: Poll file links
    updateOverlayText('Locating file links...');
    let finalAnchors = [];
    for (let i = 0; i < 20; i++) {
      if (window.__aribaStop) throw new Error('Stopped by user.');
      const currentAnchors = Array.from(document.querySelectorAll('a')).filter(a => {
        const text = a.textContent.trim().toLowerCase();
        const href = (a.getAttribute('href') || '').toLowerCase();
        const awname = (a.getAttribute('awname') || '').toLowerCase();
        
        const isMockFormat = a.classList.contains('file-name') || (a.parentElement && a.parentElement.classList.contains('file-name-container'));
        if (isMockFormat) return true;

        const hasFileExtension = /\.(pdf|docx?|xlsx?|zip|jpe?g|png)$/i.test(text);
        const isAttachmentLink = href.includes('attachment') || href.includes('download') || href.includes('awcontent') || href.includes('/ad/document/') ||
                                 awname.includes('attachment') || awname.includes('download');
        
        return hasFileExtension || isAttachmentLink;
      });

      if (currentAnchors.length > 0) {
        finalAnchors = scopeFilter ? currentAnchors.filter(scopeFilter) : currentAnchors;
        if (finalAnchors.length > 0) break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (finalAnchors.length === 0) {
      showToast('No compliance documents found.', true);
      hideOverlay();
      chrome.runtime.sendMessage({
        type: 'AUDIT_ERROR',
        error: 'No compliance documents (attachments) were detected on this page.'
      }).catch(() => {});
      window.__aribaAutomationRunning = false;
      return;
    }

    const files = [];
    finalAnchors.forEach(a => {
      a.style.outline = '2px solid green';
      files.push({
        url: a.href,
        filename: a.getAttribute('download') || a.textContent.trim() || 'document.pdf'
      });
    });

    // Step 3: Extract QA form values
    updateOverlayText('Parsing QA entries...');
    const extractedQAData = [];
    const processedContainers = new Set();
    const currentExpansionButtons = Array.from(document.querySelectorAll(
      '.expansion-button, [aria-label="collapse"], [aria-label="expand"], [aria-label*="expand" i], [aria-expanded]'
    ));

    for (const btn of currentExpansionButtons) {
      let mainContainer = btn.closest('[flexlayout="row"]') || btn.closest('.smq-item-container') || btn.closest('.renderer-container');
      if (!mainContainer || processedContainers.has(mainContainer)) continue;
      processedContainers.add(mainContainer);

      const qaBlock = { sectionLabel: '', questionLabel: '', answers: [], attachedFile: '' };

      const sectionContainer = mainContainer.closest('.smq-section-item-container');
      if (sectionContainer) {
        const sectionLabelSpan = sectionContainer.querySelector('.view-mode-header .label-span');
        if (sectionLabelSpan) qaBlock.sectionLabel = sectionLabelSpan.textContent.replace(/\s+/g, ' ').trim();
      }

      const labelSpan = mainContainer.querySelector('.label-span');
      if (labelSpan) qaBlock.questionLabel = labelSpan.textContent.replace(/\s+/g, ' ').trim();

      let contentBlock = mainContainer.querySelector('.content-2, [content2]') || mainContainer.querySelector('.content-1, [content1]') || mainContainer;
      
      // Parse QA answers
      const rows = contentBlock.querySelectorAll('.row-container');
      rows.forEach(row => {
        const rowLabelEl = row.querySelector('.row-label');
        const rowContentEl = row.querySelector('.row-content');
        if (rowLabelEl && rowContentEl) {
          const l = rowLabelEl.textContent.trim();
          const c = rowContentEl.textContent.trim();
          if (DESCRIPTION_LABELS.includes(l.toLowerCase())) return;
          if (l) qaBlock.answers.push({ label: l, value: c });
        }
      });

      // Fallback parsing for real Ariba dynamic form tables
      if (qaBlock.answers.length === 0) {
        const tableRows = contentBlock.querySelectorAll('tr, div.w-form-row, div.aw-form-row');
        tableRows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td, th, span.w-form-label, div.aw-form-label'));
          if (cells.length >= 2) {
            const l = cells[0].textContent.trim();
            const c = cells[1].textContent.trim();
            if (l && c && !DESCRIPTION_LABELS.includes(l.toLowerCase())) {
              qaBlock.answers.push({ label: l, value: c });
            }
          }
        });
      }

      // Derived certificate type mapping
      const certTypeAnswer = qaBlock.answers.find(a => CERTIFICATE_TYPE_LABELS.includes(a.label.toLowerCase()));
      if (certTypeAnswer && !certTypeAnswer.value) {
        let derivedType = qaBlock.questionLabel;
        for (const rx of CERTIFICATE_PREFIX_REGEXES) {
          derivedType = derivedType.replace(rx, '');
        }
        derivedType = derivedType.replace(/\([^)]+\)/g, '').split('-')[0];
        certTypeAnswer.value = derivedType.trim();
      }

      // Find specific file anchor inside content block
      const fileAnchor = Array.from(contentBlock.querySelectorAll('a')).find(a => {
        const text = a.textContent.trim().toLowerCase();
        const href = (a.getAttribute('href') || '').toLowerCase();
        const awname = (a.getAttribute('awname') || '').toLowerCase();
        
        const isMockFormat = a.classList.contains('file-name') || (a.parentElement && a.parentElement.classList.contains('file-name-container'));
        if (isMockFormat) return true;

        const hasFileExtension = /\.(pdf|docx?|xlsx?|zip|jpe?g|png)$/i.test(text);
        const isAttachmentLink = href.includes('attachment') || href.includes('download') || href.includes('awcontent') || href.includes('/ad/document/') ||
                                 awname.includes('attachment') || awname.includes('download');
        
        return hasFileExtension || isAttachmentLink;
      });

      if (fileAnchor) {
        qaBlock.attachedFile = fileAnchor.getAttribute('download') || fileAnchor.textContent.trim();
      }

      if (qaBlock.questionLabel || qaBlock.answers.length > 0 || qaBlock.attachedFile) {
        extractedQAData.push(qaBlock);
      }
    }

    // Step 4: Dispatch data payload to background worker
    chrome.runtime.sendMessage({
      action: 'PROCESS_AUDIT_DATA',
      supplierName,
      rawSupplierName,
      workspaceTitle,
      files,
      extractedQAData
    });

  } catch (err) {
    console.error('[Ariba Ext] Scraping failed:', err);
    showToast('Automation Error: ' + err.message, true);
    hideOverlay();
    chrome.runtime.sendMessage({
      type: 'AUDIT_ERROR',
      error: err.message
    }).catch(() => {});
  } finally {
    window.__aribaStop = false;
    window.__aribaAutomationRunning = false;
  }
})();
