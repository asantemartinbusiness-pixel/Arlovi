import { expect, test, type Page } from "@playwright/test";

/* W2D — Docs editing depth: Markdown-style autoformat while typing, and table
   rows/columns added and removed in place, all persisting after a reload. */

async function newDocument(page: Page): Promise<string> {
  await page.goto("/o/northline/docs/files");
  return page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "W2D editing check", status: "draft", fields: { folder: "Policies" },
      body: {
        blocks: [
          { id: "w2d-intro", type: "paragraph", runs: [{ text: "Opening paragraph.", marks: [] }] },
          { id: "w2d-table", type: "table", runs: [{ text: "", marks: [] }], table: { header: true, rows: [["Item", "Qty"], ["Lamp", "2"]] } },
          { id: "w2d-end", type: "paragraph", runs: [{ text: "Closing paragraph.", marks: [] }] },
        ],
      },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
}

test("autoformat and table structure edits persist", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await newDocument(page);
  await page.goto(`/o/northline/docs/documents/${id}`);
  const body = page.locator("#main").getByLabel("Document body");
  await expect(body).toContainText("Closing paragraph.");

  // Caret to the end of the closing paragraph, then new paragraphs with Markdown prefixes.
  await body.getByText("Closing paragraph.").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Delivery terms");
  await expect(body.locator("h2", { hasText: "Delivery terms" })).toBeVisible();
  await expect(body).not.toContainText("## Delivery");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- First bullet");
  await expect(body.locator("li", { hasText: "First bullet" })).toBeVisible();

  // Undo returns the characters that were typed before the shortcut applied.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> ");
  await expect(body.locator("blockquote")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(body.locator("blockquote")).toHaveCount(0);
  await expect(body).toContainText(">");

  // Table: Tab from the last cell adds a row; the toolbar adds and removes columns.
  const table = body.locator(".dx-tablewrap");
  await table.getByLabel("Row 2 column 2").click();
  await page.keyboard.press("Tab");
  await expect(table.getByLabel("Row 3 column 1")).toBeFocused();
  await page.keyboard.type("Survey");
  await expect(table.getByLabel("Row 3 column 1")).toHaveValue("Survey");
  await table.getByRole("button", { name: "Add column" }).click();
  await expect(table.getByLabel("Column 2 heading")).toHaveValue("");
  await expect(table.getByLabel("Column 3 heading")).toHaveValue("Qty");
  await table.getByLabel("Column 2 heading").fill("Finish");
  await table.getByLabel("Row 2 column 3").click();
  await table.getByRole("button", { name: "Remove column" }).click();
  await expect(table.getByLabel("Column 3 heading")).toHaveCount(0);

  // Persistence.
  await expect(page.getByText(/^Saved/).first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(body.locator("h2", { hasText: "Delivery terms" })).toBeVisible();
  await expect(body.locator("li", { hasText: "First bullet" })).toBeVisible();
  await expect(table.getByLabel("Row 3 column 1")).toHaveValue("Survey");
  await expect(table.getByLabel("Column 2 heading")).toHaveValue("Finish");
  await expect(table.getByLabel("Column 3 heading")).toHaveCount(0);
});

test("the document editor with table tools fits a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await newDocument(page);
  await page.goto(`/o/northline/docs/documents/${id}`);
  const body = page.locator("#main").getByLabel("Document body");
  await expect(body.locator(".dx-tablewrap").getByRole("button", { name: "Add row" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
