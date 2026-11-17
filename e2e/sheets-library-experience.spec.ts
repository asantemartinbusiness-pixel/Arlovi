import { expect, test } from "@playwright/test";

test("Sheets library presents workbook context and useful filtering", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Your workbook workspace." })).toBeVisible();
  await expect(main.getByLabel("Workbook library overview")).toBeVisible();
  await main.getByRole("searchbox", { name: "Search" }).fill("sheets-qa-no-match-9283");
  await expect(main).toContainText("No workbooks match your filters");
  await main.getByRole("button", { name: "Reset filters" }).click();
  await expect(main.getByRole("searchbox", { name: "Search" })).toHaveValue("");
});

test("Sheets shared tab shows records of collaboration without promising external access", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks?tab=Shared");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Recorded collaboration." })).toBeVisible();
  await expect(main).toContainText("This is not an external permission or invitation.");
});
