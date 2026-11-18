import { expect, test } from "@playwright/test";

test("global bell separates notifications from decisions and opens settings", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /^Notifications, / }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "For you" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Updates" })).toBeVisible();
  await page.getByRole("button", { name: "Notification settings" }).click();
  await expect(page.getByRole("heading", { name: "Your notification preferences" })).toBeVisible();
  await expect(page.getByText(/in this browser/).first()).toBeVisible();
});

test("personal focus and category preferences survive reload without claiming external delivery", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Notifications & focus/ }).click();
  await page.getByRole("checkbox", { name: /Focus mode/ }).check();
  await page.getByRole("combobox", { name: "Messages & mentions notification frequency" }).selectOption("quiet");
  await expect(page.getByText("Requires verified mail provider")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Notifications & focus/ }).click();
  await expect(page.getByRole("checkbox", { name: /Focus mode/ })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Messages & mentions notification frequency" })).toHaveValue("quiet");
});

for (const width of [390, 820, 1440]) {
  test("notifications panel stays within viewport at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/workspace/home");
    await page.getByRole("button", { name: /^Notifications, / }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
