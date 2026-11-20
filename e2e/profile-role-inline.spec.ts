import { expect, test } from "@playwright/test";

for (const width of [390, 820, 1440]) {
  test(`role preview stays accessible inside one profile menu at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/workspace/apps");
    await page.getByRole("button", { name: /Profile and preferences/ }).click();
    const menu = page.getByRole("menu", { name: "Account and preferences" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Preview as/ }).click();
    await expect(menu.getByRole("menuitemradio", { name: "Client", exact: true })).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "Client", exact: true }).click();
    // The role view re-scopes the current page instead of ejecting the user (apps-directory.spec asserts the Client list).
    await expect(page).toHaveURL(/\/o\/northline\/workspace\/apps/);
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#main")).toBeVisible();
  });
}
