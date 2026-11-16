import { expect, test } from "@playwright/test";

test("favourite apps are independently pinned, unpinned and restored on reload", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  const settings = page.getByRole("button", { name: /Account and view settings/ });
  await settings.click();
  await page.getByRole("menuitem", { name: "Pin Finance to favourites" }).click();
  await expect(page.locator(".hq-rail-group").first().getByRole("link", { name: "Finance" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".hq-rail-group").first().getByRole("link", { name: "Finance" })).toBeVisible();
  await settings.click();
  await page.getByRole("menuitem", { name: "Remove Finance from favourites" }).click();
  await expect(page.locator(".hq-rail-group").first().getByRole("link", { name: "Finance" })).toHaveCount(0);
});
