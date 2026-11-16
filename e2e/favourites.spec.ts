import { expect, test } from "@playwright/test";

test("favourite apps are independently pinned, unpinned and restored on reload", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  const settings = page.getByRole("button", { name: /Profile and preferences/ });
  await settings.click();
  await page.getByRole("menuitem", { name: "Pin Finance to favourites" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Finance" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Finance" })).toBeVisible();
  await settings.click();
  await page.getByRole("menuitem", { name: "Remove Finance from favourites" }).click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Finance" })).toHaveCount(0);
});

test("app pinning is only offered when a native application is open", async ({ page }) => {
  await page.goto("/o/northline/workspace/company");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await expect(page.getByRole("menuitem", { name: /Pin .* to favourites/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/o/northline/fin/invoices");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await expect(page.getByRole("menuitem", { name: "Pin Finance to favourites" })).toBeVisible();
});
