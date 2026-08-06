import { test, expect } from "@playwright/test";

const SUPPLIERS = [
  {
    audit_id: "AUDIT-1",
    supplier_id: 1,
    supplier_name: "ACME Construction",
    result: "Match",
    timestamp: "2026-07-21 10:00:00",
    cert_type: "QSHE",
    document_count: 1,
    suggested_comment: "Audit passed. All documents verified.",
  },
  {
    audit_id: "AUDIT-2",
    supplier_id: 2,
    supplier_name: "Old Supplier",
    result: "Mismatch",
    timestamp: "2026-07-20 09:00:00",
    cert_type: "QSHE",
    document_count: 1,
    suggested_comment: "Audit failed. One or more fields require revisions.",
  },
];

async function mockRegistryApi(page: import("@playwright/test").Page) {
  await page.route(/\/api\/audit-registry$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SUPPLIERS),
    });
  });
  await page.route(/\/api\/logs\/.*\/(assets|evidence)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        screenshots: [],
        documents: [
          { name: "ACME_CIDB.pdf", url: "/api/files/local/ACME/ACME_CIDB.pdf" },
        ],
      }),
    });
  });
  await page.route(/\/api\/evidence$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function openCqCheck(page: import("@playwright/test").Page) {
  await page.goto("/");
  // Subnav is hidden on the home page; reach it via the Certificate Checker card first.
  await page.locator("a").filter({ hasText: "Certificate Checker" }).click();
  await page.getByRole("button", { name: "CQ Check" }).click();
}

test.describe("CQ Check (demo flow)", () => {
  test.beforeEach(async ({ page }) => {
    await mockRegistryApi(page);
    await openCqCheck(page);
  });

  test("searches and selects a supplier from the database list", async ({ page }) => {
    const input = page.getByLabel("Supplier Name");
    await expect(input).toBeVisible();

    // Full list appears on focus
    await input.click();
    await expect(page.getByRole("option", { name: /ACME Construction/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Old Supplier/ })).toBeVisible();

    // Search filters the list
    await input.fill("ACME");
    await expect(page.getByRole("option", { name: /ACME Construction/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Old Supplier/ })).not.toBeVisible();

    // Selecting fills the input and closes the dropdown
    await page.getByRole("option", { name: /ACME Construction/ }).click();
    await expect(input).toHaveValue("ACME Construction");
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("runs the demo verification and lands on the registry log for that supplier", async ({ page }) => {
    const input = page.getByLabel("Supplier Name");
    await input.click();
    await page.getByRole("option", { name: /ACME Construction/ }).click();

    await page.getByRole("button", { name: "Run CQ Check" }).click();

    // Staged loading animation
    await expect(page.getByText("Extracting user input")).toBeVisible();
    await expect(page.getByText("Extracting document evidence")).toBeVisible();
    await expect(page.getByText("Auditing the supplier")).toBeVisible();

    // Lands on the Audit Registry detail for the selected supplier
    await expect(page.locator("h2").filter({ hasText: "ACME Construction" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Overall Auditor Verdict")).toBeVisible();
  });
});
