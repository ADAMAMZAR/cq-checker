(async function () {
  // Prevent double injection
  if (window.__aribaAutomationRunning) {
    console.warn('[Ariba Ext] Automation already in progress, skipping duplicate injection.');
    return;
  }
  window.__aribaAutomationRunning = true;

  const DESCRIPTION_LABELS = [
    'description', 'keterangan', 'penerangan', 'descripción', 'description', 'beschreibung', 'descrizione', '描述', '说明'
  ];

  const CERTIFICATE_TYPE_LABELS = [
    'certificate type', 'jenis sijil', 'tipo de certificado', 'type de certificat', 'zertifikatstyp', '证书类型', '證書類型'
  ];

  const CERTIFICATE_PREFIX_REGEXES = [
    /^[0-9.]+\s+/,
    /^certificate of\s+/i,
    /^sijil\s+/i,
    /^certificado de\s+/i,
    /^certificat de\s+/i,
    /^zertifikat für\s+/i
  ];

  function sanitiseSupplierName(raw) {
    // SUPPLIER_CLEAN_RULES is loaded from constants.js
    if (typeof SUPPLIER_CLEAN_RULES === 'undefined') {
      return raw.replace(/["']/g, '').trim();
    }
    return SUPPLIER_CLEAN_RULES
      .reduce((s, [re, rep]) => s.replace(re, rep), raw)
      .trim();
  }

  // ── Overlay / Toast Helpers ──
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

  // ── Scraper Strategies ──
  const allButtons = Array.from(document.querySelectorAll(
    '[aria-label="expand"], [aria-label="collapse"], ' +
    '[aria-label*="expand" i], [aria-label*="collapse" i], ' +
    '[aria-expanded="false"], .expansion-button, .w-node-expand'
  ));

  let supplierElement = document.querySelector(
    '#supplier-name, [aria-label^="Supplier name " i], .supplier-name'
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

  const allAnchors = Array.from(document.querySelectorAll('.file-name-container a.file-name'));

  // Listen for control actions from background.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'showToast') {
      showToast(message.text, message.isError);
    } else if (message.action === 'updateOverlay') {
      updateOverlayText(message.text);
    } else if (message.action === 'hideOverlay') {
      hideOverlay();
    } else if (message.action === 'showOverlay') {
      showOverlay();
    }
  });

  // Set Scope Mode (content-2 is preferred updated questionnaire container)
  let scopeLabel = 'all';
  let scopeFilter = null;
  const content2Container = document.querySelector('.content-2, [content2]');
  if (content2Container) {
    scopeLabel = 'content-2-only';
    scopeFilter = el => el.closest('.content-2, [content2]');
  }

  let expansionButtons = scopeFilter ? allButtons.filter(scopeFilter) : allButtons;
  let rawSupplierName = supplierElement ? supplierElement.textContent.trim() : 'Unknown Supplier';
  let supplierName = sanitiseSupplierName(rawSupplierName);

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

  try {
    console.log(`[Ariba Scraper] Starting audit. Found ${allButtons.length} expand buttons, supplierElement:`, supplierElement, `anchors: ${allAnchors.length}`);

    if (allButtons.length === 0 && !supplierElement && allAnchors.length === 0) {
      console.log('[Ariba Scraper] Silence exit: no elements found in this frame.');
      window.__aribaAutomationRunning = false;
      return;
    }

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
      const currentAnchors = Array.from(document.querySelectorAll('.file-name-container a.file-name'));
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
        error: 'No compliance documents (attachments) were detected on this page. Please ensure you are viewing a questionnaire with uploaded certificate files.'
      }).catch(() => {});
      window.__aribaAutomationRunning = false;
      return;
    }

    const files = finalAnchors.map(a => ({
      url: a.href,
      filename: a.getAttribute('download') || a.textContent.trim() || 'document.pdf'
    }));

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

      const fileAnchor = contentBlock.querySelector('.file-name-container a.file-name');
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
    window.__aribaAutomationRunning = false;
  }
})();
