import { expect, test } from "@playwright/test";

test("connected search is hidden until authenticated backend configuration is ready", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await expect(dialog).toBeVisible();
  // Vite demo workspace intentionally has no trusted server session or
  // Nango credentials. Never display a fake connected source there.
  await expect(dialog.getByRole("button", { name: "Connected", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Integrations", exact: true })).toBeVisible();
  await dialog.getByRole("combobox").fill("Finance");
  await expect(dialog.getByRole("option", { name: /Finance/ }).first()).toBeVisible();
});

test("search retains local source provenance when no backend is configured", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("combobox").fill("Workshop handbook");
  const result = dialog.getByRole("option").filter({ hasText: "Workshop handbook" }).first();
  await expect(result).toBeVisible();
  await result.hover();
  await expect(dialog.getByLabel("Selected result preview")).toContainText("Arlovi workspace");
});
