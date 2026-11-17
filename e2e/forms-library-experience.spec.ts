import { expect, test } from "@playwright/test";

test("Forms library retains hierarchy and recovers from empty search", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Forms and their responses." })).toBeVisible();
  await expect(main.getByLabel("Forms library overview")).toBeVisible();
  await expect(main.getByLabel("Forms activity summary")).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a form" }).fill("qa-no-form-matches-this");
  await expect(main.getByText("No forms match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a form" })).toHaveValue("");
});

test("Forms templates retain overview when a search finds no templates", async ({ page }) => {
  await page.goto("/o/northline/forms/forms?tab=Templates");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Start from a proven structure." })).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a template" }).fill("qa-no-template-matches-this");
  await expect(main.getByText("No templates match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a template" })).toHaveValue("");
});
