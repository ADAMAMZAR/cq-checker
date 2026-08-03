import { test, expect } from "@playwright/test";

const MOCK_PDF = Buffer.from("%PDF-1.4 fake cert");

async function mockVerifyApi(page: import("@playwright/test").Page) {
  await page.route(/\/api\/certificates\/verify$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "PASS",
        extracted_data: {
          certificateOwnerName: "ACME Construction",
          issuerName: "CIDB Malaysia",
          certificateType: "CIDB Grade G7",
          certificateNumber: "CIDB-778899",
          expirationDate: "31/12/2029",
          effectiveDate: "01/01/2026",
        },
        reasoning_trace: "All fields matched the QA form values. Certificate is valid until 31/12/2029.",
        confidence: 0.95,
        judge_source: "qwen",
        record_id: "rec-1",
      }),
    });
  });
  await page.route(/\/api\/certificates$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "rec-1",
          file_url: "/api/files/local/ACME/ACME.pdf",
          extracted_data: { certificateOwnerName: "ACME Construction" },
          status: "PASS",
          judge_reasoning: "All fields matched.",
          confidence: 0.95,
          created_at: "2026-07-21T10:00:00Z",
        },
        {
          id: "rec-2",
          file_url: "/api/files/local/OLD/OLD.pdf",
          extracted_data: { certificateOwnerName: "Old Supplier" },
          status: "FAIL",
          judge_reasoning: "Expired certificate.",
          confidence: 0.8,
          created_at: "2026-07-20T09:00:00Z",
        },
      ]),
    });
  });
}

test.describe("Certificate Verification", () => {
  test.beforeEach(async ({ page }) => {
    await mockVerifyApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Certificate Verify" }).click();
  });

  test("runs verification and shows the verdict + reasoning", async ({ page }) => {
    await expect(page.getByText("Verify a Certificate")).toBeVisible();

    await page.getByLabel("Supplier Name *").fill("ACME Construction");
    await page.setInputFiles("#verify-file-input", {
      name: "ACME_CIDB.pdf",
      mimeType: "application/pdf",
      buffer: MOCK_PDF,
    });

    await page.getByRole("button", { name: "Run Verification" }).click();

    // Verdict badge + extracted fields
    await expect(page.getByText("PASS").first()).toBeVisible();
    await expect(page.getByText("ACME Construction").first()).toBeVisible();
    await expect(page.getByText("CIDB Malaysia")).toBeVisible();

    // Judge reasoning rendered
    await expect(page.getByText("All fields matched the QA form values.")).toBeVisible();
  });

  test("shows verification history from the backend", async ({ page }) => {
    // History loaded on mount
    await expect(page.getByText("ACME Construction").first()).toBeVisible();
    await expect(page.getByText("Old Supplier")).toBeVisible();

    // Expand a record
    const oldRecord = page.locator("button").filter({ hasText: "Old Supplier" });
    await oldRecord.click();
    await expect(page.getByText("Expired certificate.")).toBeVisible();
  });
});
