import { expect, test } from "@playwright/test";

test("recent places survive a reload and can be saved", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  // The work area now has a dedicated execution desk heading.
  await expect(page.getByRole("heading", { level:1,name: "Work, moving forward." })).toBeVisible();
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recently visited" });
  await expect(recent.getByRole("link", { name: /Work/ })).toBeVisible();
  await recent.getByRole("button", { name: "Save Work" }).click();
  await page.reload();
  const saved = page.getByRole("region", { name: "Saved places" });
  await expect(saved.getByRole("link", { name: /Work/ })).toBeVisible();
  await page.getByRole("link", { name: "View all recent work" }).click();
  await expect(page.getByRole("heading", { name: "Recent and saved work" }).first()).toBeVisible();
});

test("global search finds organisation workspaces and saved destinations", async ({ page }) => {
  await page.goto("/o/northline/workspace/spaces");
  // The unified header (af2a2d8) names the search control "Search anything in <company>".
  await page.getByRole("button", { name: /Search anything in Northline/ }).click();
  const search = page.getByRole("combobox", { name: /Search screens, records and actions/ });
  await search.fill("Work");
  await expect(page.getByRole("option", { name: /Work/ }).first()).toBeVisible();
});
