import { expect, test } from "@playwright/test";

test("notification drawer offers scoped tabs and personal settings", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Notifications, .*unread updates/ }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Notification views" })).toBeVisible();
  await page.getByRole("button", { name: "Urgent", exact: true }).click();
  await expect(page.getByRole("button", { name: "Urgent", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Notification settings" }).click();
  await expect(page.getByRole("heading", { name: "Your notification preferences" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Focus mode/ }).check();
  await expect(page.getByRole("checkbox", { name: /Focus mode/ })).toBeChecked();
  await page.getByRole("button", { name: "Back to notifications" }).click();
  await expect(page.getByText("Reading is not approval.")).toBeVisible();
});

test("notification settings are retained for the same workspace profile", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Notifications, .*unread updates/ }).click();
  await page.getByRole("button", { name: "Notification settings" }).click();
  await page.getByRole("checkbox", { name: /Focus mode/ }).check();
  await page.reload();
  await page.getByRole("button", { name: /Notifications, .*unread updates/ }).click();
  await page.getByRole("button", { name: "Notification settings" }).click();
  await expect(page.getByRole("checkbox", { name: /Focus mode/ })).toBeChecked();
});

test("notification drawer and preference panel reflow on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Notifications, .*unread updates/ }).click();
  await page.getByRole("button", { name: "Notification settings" }).click();
  await expect(page.getByRole("heading", { name: "Your notification preferences" })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflows).toBe(false);
});
