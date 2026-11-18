import { expect, test } from "@playwright/test";

async function openProfileMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  return page.getByRole("menu", { name: "Account and preferences" });
}

test("profile menu groups identity, reliable destinations and browser-local context", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  const menu = await openProfileMenu(page);
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Local workspace profile")).toBeVisible();
  await expect(menu.getByText("Northline Atelier")).toBeVisible();
  await expect(menu.getByText("Browser-local workspace")).toBeVisible();
  await expect(menu.getByText("Role view (not a security boundary)")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Recent & saved/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Display & scaling/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Account & data readiness/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Sign out/i })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: /Recent & saved/ }).click();
  await expect(page).toHaveURL(/\/workspace\/recent$/);
});

test("appearance preference is actionable without overwhelming the menu", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await openProfileMenu(page);
  const dark = page.getByRole("menuitemcheckbox", { name: /Dark appearance/ });
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("menuitem", { name: /Interface density/ }).click();
  await page.getByRole("menuitemradio", { name: "Compact" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
});

test("role view is an explicit local navigation preview, not access management", async ({ page }) => {
  await page.goto("/o/northline/mission/missions");
  const menu = await openProfileMenu(page);
  await expect(menu.getByText("Role view (not a security boundary)")).toBeVisible();
  await page.getByRole("menuitem", { name: /Preview as Owner/ }).click();
  await expect(page.getByText(/does not change account permissions or grant access/)).toBeVisible();
  await page.getByRole("menuitemradio", { name: "Client", exact: true }).click();
  await expect(page).toHaveURL(/\/o\/northline\/portal\//);
  await expect(page.getByRole("button", { name: /Local role view Client/ })).toBeVisible();
});

test("profile menu fits a small mobile viewport and supports Escape focus restoration", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto("/o/northline/workspace/home");
  const trigger = page.getByRole("button", { name: /Profile and preferences/ });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Account and preferences" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(361);
  expect(box!.height).toBeLessThanOrEqual(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow).toBe(false);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
