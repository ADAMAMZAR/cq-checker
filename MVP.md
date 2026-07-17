# MVP Implementation Plan
## Project Name: GPO Automatic Certificate Auditor (API & Google Sheets Edition)

This plan provides a step-by-step roadmap to establish the new system in a separate folder, reusing Ariba extraction logic from the current extension, utilizing direct Gemini API calls (no Web UI), and writing to Google Sheets.

---

### Step 1: Initialize New Project Folder Structure
Create a new root directory named `gpo-api-auditor`. Structure the files as follows:

```text
gpo-api-auditor/
├── manifest.json
├── background/
│   └── background.js
├── content/
│   ├── content.js
│   └── content.css
├── shared/
│   └── constants.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── google_apps_script.js (For Google Sheets reference)
```

---

### Step 2: Set Up the Google Sheet Database & Apps Script
1. Create a new Google Sheet in Google Drive. Name it `GPO Auditor Logs Database`.
2. Enter the following headers in row 1:
   * **A1:** `Timestamp`
   * **B1:** `Supplier Name`
   * **C1:** `Workspace Title`
   * **D1:** `Certificate Type`
   * **E1:** `Filename`
   * **F1:** `Audit Result (Match/Mismatch)`
   * **G1:** `Expiration Date`
   * **H1:** `Suggested Comments`
3. Go to **Extensions $\rightarrow$ Apps Script**.
4. Replace the default function with the code from `google_apps_script.js` (detailed below).
5. Click **Deploy $\rightarrow$ New Deployment**. Select **Web App**.
   * *Execute as:* **Me**
   * *Who has access:* **Anyone** (This allows the extension to make POST requests without OAuth complications).
6. Copy the generated Web App URL.

---

### Step 3: Write files

#### 3.1 `google_apps_script.js`
This script runs inside Google Workspace to act as your database endpoint:
```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Append a new row containing the audit logs
    sheet.appendRow([
      new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" }), // Local time
      data.supplierName,
      data.workspaceTitle,
      data.certType,
      data.filename,
      data.result,
      data.expirationDate,
      data.suggestedComment
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
```

#### 3.2 `shared/constants.js`
Configure your centralized endpoints:
```javascript
var GOOGLE_SHEET_API_URL = "YOUR_DEPLOYED_GOOGLE_APPS_SCRIPT_WEB_APP_URL";
var GEMINI_API_KEY = "YOUR_PAID_GEMINI_API_KEY"; // Keep secure or inject via settings
var DOWNLOAD_ROOT = "GPO - Automatic Certificate Checker";
```

#### 3.3 `manifest.json`
Define standard extension permissions (without tesseract assets or web UI tab requirements):
```json
{
  "manifest_version": 3,
  "name": "GPO - Automatic Certificate Auditor",
  "version": "1.0.0",
  "description": "Audits certificates using Gemini API and logs results into a central Google Sheet.",
  "permissions": [
    "scripting",
    "downloads",
    "storage",
    "debugger",
    "tabs"
  ],
  "host_permissions": [
    "*://*.ariba.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "background": {
    "service_worker": "background/background.js"
  }
}
```

---

### Step 4: Port Ariba Extraction & Screenshot Code
Copy these core components from your current workspace:

1. **Ariba DOM Scraper:** Copy the logic inside `content/content.js` that:
   * Extracts the supplier name (`sanitiseSupplierName`).
   * Expands buttons (`isAlreadyExpanded` check + `.click()` events).
   * Finds anchors (`.file-name-container a.file-name`).
   * Extracts Q&A blocks.
2. **Overlay Control:** Keep the `ariba-loading-overlay` show/hide listener logic we just refined (hiding it during the debugger screenshot capture).
3. **Full-page Screenshot (`background.js`):** Reuse the `captureFullPageScreenshot(tabId)` function using `chrome.debugger`.

---

### Step 5: Implement Gemini API Direct Call Pipeline

In `background.js`, replace the old `maybeOpenGemini` function with direct HTTP calls:

```javascript
// Step 5.1: Call Gemini 2.5 Flash to extract JSON data from PDF / Image blob
async function extractDataFromDoc(fileBlob, mimeType) {
  // Convert blob to base64 for API payload
  const reader = new FileReader();
  const base64Data = await new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(fileBlob);
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: "Extract the following details from this certificate: Supplier Name, Issuer, Certificate Type, Certificate Number, Expiration Date, Effective Date. Return strictly as a JSON object matching these keys." },
        { inlineData: { mimeType: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const json = await response.json();
  return JSON.parse(json.candidates[0].content.parts[0].text);
}

// Step 5.2: Call Gemini 3.5 Flash to compare extracted document results with QA_Data.md text
async function runAuditComparison(qaText, compiledJsonText) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  // Read system instructions locally or compile them
  const instructions = `You are a High-Precision Document Auditor... [Inject contents of Simplified_System_Instruction.md here]`;

  const payload = {
    contents: [{
      parts: [{
        text: `Instructions:\n${instructions}\n\nQA Data Form:\n${qaText}\n\nEvidence Document JSON:\n${compiledJsonText}`
      }]
    }]
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const json = await response.json();
  return json.candidates[0].content.parts[0].text;
}
```

---

### Step 6: Log Data to Google Sheet
Add the Google Sheet logging step in the background script pipeline:

```javascript
async function logToGoogleSheet(auditData) {
  try {
    const response = await fetch(GOOGLE_SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditData)
    });
    const result = await response.json();
    return result.status === 'success';
  } catch (err) {
    console.error('[Ariba Ext] Failed database upload to Google Sheets:', err);
    return false;
  }
}
```

---

### Step 7: Verify MVP
1. Install the `gpo-api-auditor` extension in Chrome developer mode.
2. Visit a supplier page in Ariba.
3. Click the extension popup and run the auditor.
4. Verify that:
   * The page is expanded and the screenshot is taken cleanly (no overlay).
   * Files download successfully.
   * Gemini API is called without opening any secondary Gemini tabs.
   * A new row is successfully added to your Google Sheet detailing the timestamp, supplier, and audit status.
