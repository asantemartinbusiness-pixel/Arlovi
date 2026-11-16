import { expect, test } from "@playwright/test";

test("headquarters navigation prioritises places and keeps the 35 tools in a real launcher", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/o/northline/hq/home");
  const nav = page.getByRole("navigation", { name: "Headquarters navigation" });
  await expect(nav).toBeVisible();
  for (const name of ["Home", "My Workspace", "Inbox", "Company Overview", "Departments", "Mission Control", "Intelligence", "Studio"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  const visibleDestinations = await nav.getByRole("link").count();
  expect(visibleDestinations).toBeLessThan(25);
  await nav.getByRole("button", { name: "Browse all applications" }).click();
  const launcher = page.getByRole("dialog", { name: "Your complete workspace." });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator(".hq-launcher-app")).toHaveCount(35);
  await launcher.getByRole("button", { name: /^Studio\s/ }).click();
  await expect(launcher.locator(".hq-launcher-app")).toHaveCount(8);
  await launcher.getByRole("button", { name: /^All applications/ }).click();
  await launcher.getByRole("searchbox", { name: "Search applications" }).fill("Finance");
  await expect(launcher.locator(".hq-launcher-app")).toHaveCount(1);
  await launcher.getByRole("link", { name: /Finance/ }).click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\//);
  await expect(launcher).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Finance pages" })).toBeVisible();
});

test("primary hierarchy and contextual workspace behave as separate levels", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/o/northline/hq/home");
  const nav = page.getByRole("navigation", { name: "Headquarters navigation" });
  await nav.getByRole("link", { name: "My Workspace" }).click();
  await expect(page).toHaveURL(/\/hq\/my-work/);
  await nav.getByRole("link", { name: "Company Overview" }).click();
  await expect(page).toHaveURL(/\/hq\/company/);
  await nav.getByRole("link", { name: "Departments" }).click();
  await expect(page).toHaveURL(/\/hq\/departments/);
  await nav.getByRole("link", { name: "Mission Control" }).click();
  await expect(page).toHaveURL(/\/mission\//);

  await nav.getByRole("link", { name: "Studio" }).click();
  await expect(page).toHaveURL(/\/design\//);
  await expect(nav.getByRole("link", { name: "Studio" })).toHaveAttribute("data-active", "true");
  await page.getByRole("button", { name: "Collapse Design pages" }).click();
  await expect(page.locator(".hq-frame")).toHaveAttribute("data-context-collapsed", "true");
  await page.getByRole("button", { name: "Show Design pages" }).click();
  await expect(page.locator(".hq-frame")).toHaveAttribute("data-context-collapsed", "false");

  await page.getByRole("button", { name: "Collapse headquarters sidebar" }).click();
  await expect(page.locator(".hq")).toHaveAttribute("data-sidebar-collapsed", "true");
  await page.reload();
  await expect(page.locator(".hq")).toHaveAttribute("data-sidebar-collapsed", "true");
  await page.getByRole("button", { name: "Expand headquarters sidebar" }).click();
  await expect(page.locator(".hq")).toHaveAttribute("data-sidebar-collapsed", "false");
});

test("mobile navigation is a compact hierarchy, not a scrolling icon wall", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/o/northline/hq/home");
  const bottom = page.getByRole("navigation", { name: "Primary" });
  await expect(bottom).toBeVisible();
  for (const label of ["Home", "My work", "Inbox", "Studio"]) {
    await expect(bottom.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await bottom.getByRole("button", { name: "Browse all applications" }).click();
  await expect(page.getByRole("dialog", { name: "Your complete workspace." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Your complete workspace." })).toHaveCount(0);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Headquarters navigation" });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Departments" }).click();
  await expect(page).toHaveURL(/\/hq\/departments/);
  await expect(page.locator(".hq")).toHaveAttribute("data-nav-open", "false");

  await bottom.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("button", { name: "Open Design pages" }).click();
  await expect(page.getByRole("navigation", { name: "Design pages" })).toBeVisible();
  await page.getByRole("button", { name: "Back to headquarters navigation" }).click();
  await expect(nav).toBeVisible();
});

test("contextual navigation never links a list page to a seeded detail ID from another company", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/o/northline/design/files");
  const pages = page.getByRole("navigation", { name: "Design pages" });
  await expect(pages).toBeVisible();
  const hrefs = await pages.locator("a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") || ""));
  expect(hrefs.every((href) => !href.includes("/files/nl-"))).toBe(true);
});
