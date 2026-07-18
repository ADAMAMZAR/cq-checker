import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Chrome Extension loads background worker and popup, and triggers audit', async () => {
  const extensionPath = path.resolve(__dirname, '..');
  const fixturePath = path.resolve(__dirname, 'fixtures', 'mock_ariba.html');
  const userDataDir = path.resolve(__dirname, '..', '.temp-user-data');

  // Start a local HTTP server to host the mock Ariba page (bypasses extension file:// injection locks)
  const server = http.createServer((req, res) => {
    if (req.url === '/mock_ariba.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(fixturePath));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const localUrl = `http://127.0.0.1:${port}/mock_ariba.html`;
  console.log(`Test server running at: ${localUrl}`);

  // Launch Chromium loading the unpacked extension
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--headless=new' // Enables headless browser extension execution in CI/CD environments
    ],
  });

  try {
    // 1. Locate the background service worker and extract the extension ID
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    
    const extensionId = background.url().split('/')[2];
    expect(extensionId).toBeTruthy();
    console.log(`Extension loaded successfully with ID: ${extensionId}`);

    // 2. Open our mock Ariba page in the browser
    const aribaTab = await context.newPage();
    await aribaTab.goto(localUrl);
    await expect(aribaTab.locator('.supplier-header')).toContainText('Ariba Test Supplier Ltd');

    // 3. Open the extension popup panel URL directly
    const popupTab = await context.newPage();
    await popupTab.goto(`chrome-extension://${extensionId}/panel/panel.html`);

    // Verify panel UI is rendered
    const title = popupTab.locator('.panel-header h2');
    await expect(title).toHaveText('GPO Certificate Auditor');

    const runBtn = popupTab.locator('#download-btn');
    await expect(runBtn).toBeVisible();

    // Bring the mock Ariba tab to the front so it becomes the active tab in the context
    await aribaTab.bringToFront();

    // 4. Click the audit trigger button on the panel tab
    await runBtn.click();

    // Verify the panel transitions to logging state
    const logEntries = popupTab.locator('#log-entries');
    await expect(logEntries).toBeVisible();

    console.log('E2E automation flow completed successfully.');
  } finally {
    await context.close();
    server.close();
  }
});
