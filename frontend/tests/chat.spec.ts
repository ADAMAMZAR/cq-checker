import { test, expect } from "@playwright/test";

const SSE_BODY = [
  `data: {"delta":"Hello "}\n\n`,
  `data: {"delta":"world from CQ"}\n\n`,
  `data: {"done":true,"sources":[{"title":"Safety Manual","page_number":3,"file_url":"/api/files/local/manuals/safety.pdf"}],"cost_usd":0.00012,"cache_hit":false,"session_id":"sess-e2e"}\n\n`,
].join("");

async function mockChatApi(page: import("@playwright/test").Page) {
  await page.route(/\/api\/chat\/history/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session_id: "sess-e2e", messages: [] }),
    });
  });
  await page.route(/\/api\/chat$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: SSE_BODY,
    });
  });
  await page.route(/\/api\/files\/local\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from("not a real pdf, viewer will show fallback"),
    });
  });
}

test.describe("RAG Chatbot", () => {
  test.beforeEach(async ({ page }) => {
    await mockChatApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "RAG Chatbot" }).click();
  });

  test("streams an answer with citation chips", async ({ page }) => {
    const input = page.getByLabel("Ask CQ Assistant");
    await expect(input).toBeVisible();

    await input.fill("What are the safety requirements?");
    await page.getByLabel("Send message").click();

    // Streamed answer rendered as markdown
    await expect(page.getByText("Hello world from CQ")).toBeVisible();

    // Citation chip appears with the source title and page
    const chip = page.locator("button").filter({ hasText: "Safety Manual" });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("p.3");
  });

  test("citation chip opens the PDF side panel", async ({ page }) => {
    await page.getByLabel("Ask CQ Assistant").fill("Show me the manual");
    await page.getByLabel("Send message").click();

    const chip = page.locator("button").filter({ hasText: "Safety Manual" });
    await expect(chip).toBeVisible();
    await chip.click();

    // Side panel header + page navigation appear
    await expect(page.getByLabel("Close viewer")).toBeVisible();
    await expect(page.getByLabel("Current page number")).toBeVisible();
    await expect(page.getByLabel("Current page number")).toHaveValue("3");
  });
});
