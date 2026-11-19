import { expect, test } from "@playwright/test";

test("global search offers a compact app finder and keyboard navigation", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Apps", exact: true }).click();
  const finance = dialog.getByRole("option", { name: /Finance/ }).first();
  await expect(finance).toBeVisible();
  await dialog.getByRole("combobox").fill("Finance");
  await expect(dialog.getByRole("option", { name: /Finance/ }).first()).toBeVisible();
  await dialog.getByRole("combobox").press("ArrowDown");
  await expect(dialog.getByRole("option", { selected: true })).toHaveCount(1);
  await dialog.getByRole("combobox").press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the global search offers a context preview and a recoverable empty state", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("combobox").fill("Finance");
  await expect(dialog.getByLabel("Selected result preview")).toBeVisible();
  await dialog.getByRole("combobox").fill("no-such-record-xyzz");
  await expect(dialog.getByText("No matching results")).toBeVisible();
  await dialog.getByRole("button", { name: /Reset search/ }).click();
  await expect(dialog.getByRole("combobox")).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
});

test("global search continues to restore the exact previous native app location", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Draft");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/o/northline/project/home");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  const returnResult = dialog.getByRole("option", { name: /Back to Finance/ });
  await expect(returnResult).toBeVisible();
  await returnResult.click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/invoices\?tab=Draft/);
});
