import { expect, test } from "@playwright/test";

test("workspace remains navigable while optional resource and people panels load", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading", { name: "Your day, in one place." })).toBeVisible();
  await page.goto("/o/northline/workspace/resources");
  await expect(page.getByRole("heading", { level:1, name: "Files & resources" })).toBeVisible();
  await expect(page.getByRole("region",{name:"Company resources"})).toBeVisible();
  await page.goto("/o/northline/workspace/people");
  await expect(page.getByRole("heading", { name: "Company directory & collaboration" })).toBeVisible();
});

test("optional diagnostic and account panels work on direct navigation and after reload", async ({ page }) => {
  await page.goto("/o/northline/workspace/health");
  await expect(page.getByRole("heading",{name:"Workspace diagnostics"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Workspace diagnostics"})).toBeVisible();
  await page.goto("/o/northline/workspace/account");
  await expect(page.getByRole("heading",{name:"Local workspace — cloud not connected"})).toBeVisible();
});

test("lazy search dialog opens and closes with a keyboard shortcut", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-search")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog",{name:/Search/});
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
