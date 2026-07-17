import { test, expect } from "@playwright/test";

test.describe("GPO Certificate Auditor Frontend Dashboard E2E", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Mock API call for the master logs list (using bulletproof regex matcher to intercept any localhost/127.0.0.1 variation)
    await page.route(/\/api\/logs$/, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
          }
        });
        return;
      }
      
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        },
        body: JSON.stringify([
          {
            timestamp: "2026-07-17 11:42:54",
            supplier_name: "Mock Supplier Ltd",
            workspace_title: "Compliance Workspace 101",
            cert_type: "QSHE",
            filename: "dummy_cert.pdf",
            result: "Match",
            expiration_date: "2029-12-31",
            suggested_comment: "Audit passed. | Comparison: | Field Name | QA Form Value | Certificate Value | Status |\n|---|---|---|---|\n| Supplier Name | Mock Supplier Ltd | Mock Supplier Ltd | Match |\n| Expiration Date | 2029-12-31 | 2029-12-31 | Match |"
          },
          {
            timestamp: "2026-07-17 11:55:10",
            supplier_name: "Outdated Cert Pty Ltd",
            workspace_title: "Verification Workspace Australia",
            cert_type: "Workplace Safety",
            filename: "expired_report.pdf",
            result: "Mismatch",
            expiration_date: "2025-06-30",
            suggested_comment: "Certificate Expired | Comparison: | Field Name | QA Form Value | Certificate Value | Status |\n|---|---|---|---|\n| Expiration Date | 2025-06-30 | 2025-06-30 (Expired) | Mismatch |"
          }
        ])
      });
    });

    // 2. Mock API call for supplier assets (using regex matcher)
    await page.route(/\/api\/logs\/.*\/assets/, async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
          }
        });
        return;
      }
      
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        },
        body: JSON.stringify({
          screenshots: ["/static/Mock_Supplier_Ltd/screenshot_20260717_114254.png"],
          documents: [
            { name: "dummy_cert.pdf", url: "/static/Mock_Supplier_Ltd/dummy_cert.pdf" }
          ]
        })
      });
    });

    await page.goto("/");
  });

  test("Renders header and database online state", async ({ page }) => {
    // Assert title headers are visible
    await expect(page.locator("h1")).toContainText("GPO Automatic Certificate Auditor");
    
    // Assert status indicator shows Database Live
    await expect(page.locator("text=Database Live")).toBeVisible();
  });

  test("Renders list of audit logs and allows selection", async ({ page }) => {
    // Wait for the mock log cards to render (using h4 tag filter to resolve strict mode conflicts)
    const mockCard = page.locator("h4").filter({ hasText: "Mock Supplier Ltd" });
    await expect(mockCard).toBeVisible();

    const outdatedCard = page.locator("h4").filter({ hasText: "Outdated Cert Pty Ltd" });
    await expect(outdatedCard).toBeVisible();

    // Select the first log card
    await mockCard.click();

    // Assert detail pane loads with details (checking h2 tag)
    const detailTitle = page.locator("h2").filter({ hasText: "Mock Supplier Ltd" });
    await expect(detailTitle).toBeVisible();

    // Assert parsed suggested comment is visible
    const commentBox = page.locator("text=Audit passed.");
    await expect(commentBox).toBeVisible();

    // Assert parsed table cells are visible
    const tableHeader = page.locator("th").first();
    await expect(tableHeader).toBeVisible();
    await expect(page.locator("td").first()).toContainText("Supplier Name");
  });

  test("Search query filters logs correctly", async ({ page }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeVisible();

    // Type query matching second item only
    await searchInput.fill("Outdated");

    // First card should disappear
    await expect(page.locator("h4").filter({ hasText: "Mock Supplier Ltd" })).toBeHidden();

    // Second card should remain visible
    await expect(page.locator("h4").filter({ hasText: "Outdated Cert Pty Ltd" })).toBeVisible();
  });

  test("Tab switching changes view to assets panel", async ({ page }) => {
    // Select a card first
    const mockCard = page.locator("h4").filter({ hasText: "Mock Supplier Ltd" });
    await expect(mockCard).toBeVisible();
    await mockCard.click();

    // Locate and click tab button
    const assetsTab = page.locator("text=Files & Screenshot Evidence");
    await expect(assetsTab).toBeVisible();
    await assetsTab.click();

    // Assert files are listed in panel
    await expect(page.locator("text=Audited Attachments (1)")).toBeVisible();
    await expect(page.locator("text=dummy_cert.pdf")).toBeVisible();
  });
});
