import { expect, test, type Page } from "@playwright/test";

/* W2D — Sheets editing depth: function suggestions in the cell editor,
   pointing at cells to write references, keyboard fill/undo/bold, Ctrl+arrow
   data-edge jumps, the wider function library, and persistence after reload. */

async function newWorkbook(page: Page, cells: Record<string, string>): Promise<string> {
  await page.goto("/o/northline/sheets/workbooks");
  return page.evaluate(async (seedCells) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "W2D editing check", status: "active", fields: { folder: "Models" },
      body: {
        sheets: [{ id: "sh-w2d", name: "Data", rows: 1000, cols: 64, cells: seedCells, styles: {}, colWidths: {}, freeze: { rows: 0, cols: 0 }, filters: [] }],
        activeSheetId: "sh-w2d", namedRanges: [], tables: [], charts: [], comments: [], protection: [], io: [],
      },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  }, cells);
}

const cell = (page: Page, address: string) => page.locator(`#main [role="gridcell"][data-address="${address}"]`);

test("formulas are typed with suggestions and pointing, and survive a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await newWorkbook(page, {
    A1: "Stage", B1: "Net",
    A2: "won", B2: "100",
    A3: "open", B3: "250",
    A4: "won", B4: "40",
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}`);
  await expect(cell(page, "B3")).toContainText("250");

  // Type =SUMI, pick SUMIFS from the suggestions with the keyboard.
  await cell(page, "D1").click();
  await page.keyboard.type("=SUMI");
  const list = page.getByRole("listbox", { name: "Matching functions" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option").first()).toContainText("SUMIF(");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  const editorInput = page.getByLabel("Edit D1");
  await expect(editorInput).toHaveValue("=SUMIFS(");

  // Point at B2:B4 by dragging, then type the rest.
  await cell(page, "B2").hover();
  await page.mouse.down();
  await cell(page, "B4").hover();
  await page.mouse.up();
  await expect(editorInput).toHaveValue("=SUMIFS(B2:B4");
  await page.keyboard.type(",");
  await cell(page, "A2").click();
  await page.keyboard.type(':A4,"won")');
  await expect(editorInput).toHaveValue('=SUMIFS(B2:B4,A2:A4,"won")');
  await page.keyboard.press("Enter");
  await expect(cell(page, "D1")).toHaveText("140");

  // MATCH / INDEX from the new library.
  await cell(page, "D2").click();
  await page.keyboard.type('=INDEX(B1:B4,MATCH("open",A1:A4,0))');
  await page.keyboard.press("Enter");
  await expect(cell(page, "D2")).toHaveText("250");

  // Ctrl+B bolds; Ctrl+Z undoes it; Ctrl+Y redoes it.
  await cell(page, "D1").click();
  await page.keyboard.press("Control+b");
  await expect(cell(page, "D1")).toHaveCSS("font-weight", "600");
  await page.keyboard.press("Control+z");
  await expect(cell(page, "D1")).not.toHaveCSS("font-weight", "600");
  await page.keyboard.press("Control+y");
  await expect(cell(page, "D1")).toHaveCSS("font-weight", "600");

  // Fill down with Ctrl+D copies a relative formula.
  await cell(page, "C2").click();
  await page.keyboard.type("=B2*2");
  await page.keyboard.press("Enter");
  await cell(page, "C2").click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Control+d");
  await expect(cell(page, "C4")).toHaveText("80");

  // Ctrl+ArrowDown jumps to the last filled row of the block.
  await cell(page, "B1").click();
  await page.keyboard.press("Control+ArrowDown");
  await expect(page.getByLabel("Name box — type an address or a named range")).toHaveValue("B4");

  // Persistence: saved state visible first, then reload.
  await expect(page.getByText(/^(Saved|No unsaved changes)$/).first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(cell(page, "D1")).toHaveText("140");
  await expect(cell(page, "D2")).toHaveText("250");
  await expect(cell(page, "C4")).toHaveText("80");
  await expect(cell(page, "D1")).toHaveCSS("font-weight", "600");
});

test("the grid and its suggestions fit a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await newWorkbook(page, { A1: "1", A2: "2" });
  await page.goto(`/o/northline/sheets/workbooks/${id}`);
  await expect(cell(page, "A2")).toContainText("2");
  await cell(page, "B1").click();
  await page.keyboard.type("=MED");
  await expect(page.getByRole("listbox", { name: "Matching functions" })).toContainText("MEDIAN(");
  await page.keyboard.press("Tab");
  await page.keyboard.type("A1:A2)");
  await page.keyboard.press("Enter");
  await expect(cell(page, "B1")).toHaveText("1.5");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a range edit that overwrites values is previewed first, and only Apply writes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await newWorkbook(page, { A1: "Stage", B1: "Net", A2: "won", B2: "100", A3: "open", B3: "250", A4: "won", B4: "40" });
  await page.goto(`/o/northline/sheets/workbooks/${id}`);
  await expect(cell(page, "B3")).toContainText("250");

  // Select A2:B4 with the keyboard and clear it.
  await cell(page, "A2").click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  const preview = page.getByRole("region", { name: "Change preview" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("6 cells change");
  // Nothing has been written yet.
  await expect(cell(page, "B3")).toContainText("250");

  await preview.getByRole("button", { name: "Cancel" }).click();
  await expect(preview).toHaveCount(0);
  await expect(cell(page, "B3")).toContainText("250");

  await cell(page, "A2").click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  await preview.getByRole("button", { name: /^Apply to 6 cells/ }).click();
  await expect(cell(page, "B3")).not.toContainText("250");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(cell(page, "B3")).toContainText("250");
});
