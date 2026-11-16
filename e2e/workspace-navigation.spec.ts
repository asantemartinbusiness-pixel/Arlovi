import { expect, test } from "@playwright/test";

test("global spaces, work and apps navigate without losing organisational scope", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading", { name: "Your day, in one place." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Spaces" })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Spaces" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/workspace\/spaces/);
  await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();
  await page.goto("/o/northline/workspace/work");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.goto("/o/northline/workspace/apps");
  await page.getByRole("textbox", { name: "Find an application" }).fill("finance");
  await expect(page.getByRole("link", { name: "Finance" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Design" })).toHaveCount(0);
});

test("unknown project space cannot show another company's record", async ({ page }) => {
  await page.goto("/o/northline/workspace/work/project/does-not-exist");
  await expect(page.getByRole("heading", { name: "Space not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Work" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/workspace\/work$/);
});
