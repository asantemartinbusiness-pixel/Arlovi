import { expect, test } from "@playwright/test";

test("global search resumes the previously open Finance view after visiting Projects", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Draft");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/o/northline/project/home");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await expect(dialog).toBeVisible();
  const back = dialog.getByRole("option", { name: /Back to Finance/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/invoices\?tab=Draft/);
});

test("Recent & Saved shows actual app resume destinations, not only app home", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Draft");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/o/northline/workspace/recent");
  const resume = page.getByRole("navigation", { name: "Resume native application work" });
  await expect(resume.getByRole("link", { name: /Continue Finance: / })).toBeVisible();
  await resume.getByRole("link", { name: /Continue Finance: / }).click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/invoices\?tab=Draft/);
});
