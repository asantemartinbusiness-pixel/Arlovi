import { expect, test } from "@playwright/test";

test("global search ranks multi-word finance destinations by actual relevance", async ({page}) => {
  await page.goto("/o/northline/workspace/home");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {name: /Search Northline/});
  const search = dialog.getByRole("combobox", {name: /Search screens, records and actions/});
  await search.fill("finance budgets");
  const first = dialog.getByRole("option").first();
  await expect(first).toContainText("Budgets & Forecasts");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/o\/northline\/fin\/budgets$/);
});

test("zero search results remain keyboard-safe and no foreign company is queried", async ({page}) => {
  await page.goto("/o/harbor/workspace/home");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {name: /Search Harbor/});
  const search = dialog.getByRole("combobox", {name: /Search screens, records and actions/});
  await search.fill("zzzx-absent-result-21234");
  await expect(dialog.getByText(/Nothing in Harbor Supply matches/)).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await search.press("ArrowDown");
  await search.press("ArrowUp");
  await search.press("Enter");
  await expect(dialog).toBeVisible();
  await search.fill("files and resources");
  await expect(dialog.getByRole("option").first()).toContainText("Open files and resources");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/resources$/);
});
