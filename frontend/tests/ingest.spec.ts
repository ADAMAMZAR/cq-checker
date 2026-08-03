import { test, expect } from "@playwright/test";

const MOCK_PDF = Buffer.from("%PDF-1.4 fake manual");

async function mockIngestApi(page: import("@playwright/test").Page) {
  await page.route(/\/api\/documents$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "doc-1",
          title: "Safety Manual.pdf",
          file_url: "/api/files/local/manuals/safety.pdf",
          parent_count: 3,
          child_count: 12,
          created_at: "2026-07-20T09:00:00Z",
        },
      ]),
    });
  });
  await page.route(/\/api\/documents\/upload$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document_id: "doc-2",
        title: "QA Manual.pdf",
        status: "created",
        parent_count: 4,
        child_count: 16,
        cost_usd: 0.00005,
        message: "Ingested successfully.",
      }),
    });
  });
}

test.describe("Document Ingest", () => {
  test.beforeEach(async ({ page }) => {
    await mockIngestApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Document Ingest" }).click();
  });

  test("uploads a PDF and shows the ingested result", async ({ page }) => {
    await expect(page.getByText("Ingest a Manual")).toBeVisible();

    await page.setInputFiles("#ingest-file-input", {
      name: "QA Manual.pdf",
      mimeType: "application/pdf",
      buffer: MOCK_PDF,
    });

    await page.getByRole("button", { name: "Ingest Document" }).click();

    // Result card with counts + cost
    await expect(page.getByText("INGESTED")).toBeVisible();
    await expect(page.getByText("QA Manual.pdf")).toBeVisible();
    await expect(page.getByText("4").first()).toBeVisible();
    await expect(page.getByText("16").first()).toBeVisible();

    // Ingested documents list refreshes
    await expect(page.getByText("Safety Manual.pdf")).toBeVisible();
  });
});
