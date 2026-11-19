import { expect, test } from "@playwright/test";

test("global search finds visible text inside a local document and opens the real editor", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button", { name: /Search anything in Northline/ }).click();
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("button", { name: "Files", exact: true }).click();
  await dialog.getByRole("combobox").fill("Lacquer only");
  const hit = dialog.getByRole("option").filter({ hasText: /Document/ }).first();
  await expect(hit).toBeVisible();
  await expect(dialog.getByLabel("Selected result preview")).toContainText("Lacquer only");
  await hit.click();
  await expect(page).toHaveURL(/\/o\/northline\/docs\/documents\/[^/]+$/);
});

test("global search excludes a confidential document body from file-content matches", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button", { name: /Search anything in Northline/ }).click();
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("button", { name: "Files", exact: true }).click();
  await dialog.getByRole("combobox").fill("Twelve Arc Lamps across two phases");
  await expect(dialog.getByRole("option").filter({ hasText: "Clerkenwell showroom — lighting proposal" })).toHaveCount(0);
});

test("global search finds message text in locally stored mail without a provider connection", async ({ page }) => {
  await page.goto("/o/northline/comms/email");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button", { name: /Search anything in Northline/ }).click();
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("button", { name: "Mail", exact: true }).click();
  await dialog.getByRole("combobox").fill("kiln run slipped");
  const hit = dialog.getByRole("option", { name: /Oak for the trade counter/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/\/o\/northline\/comms\/email\/[^/]+$/);
});
