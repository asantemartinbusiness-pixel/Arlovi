import { expect, test } from "@playwright/test";

test("switching companies from project Files returns to the target company's Work area", async ({page})=>{
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('.ww-projects a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await expect(page).toHaveURL(/tab=files/);
  await page.getByRole("button",{name:/Switch company/}).click();
  await page.getByRole("menuitem",{name:/Harbor Supply/}).click();
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/work$/);
  await expect(page.locator(".hq-header")).toBeVisible();
});

test("switching companies from Company utilities preserves a safe section", async ({page})=>{
  await page.goto("/o/northline/workspace/people");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button",{name:/Switch company/}).click();
  await page.getByRole("menuitem",{name:/Harbor Supply/}).click();
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/people$/);
});

test("search does not expose synthetic detail URLs and keeps keyboard focus inside its modal",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog=page.getByRole("dialog",{name:/Search Northline/});
  const search=dialog.getByRole("combobox",{name:/Search screens, records and actions/});
  await expect(search).toBeFocused();
  const urls=await dialog.locator('[role="option"][id^="page-"]').count();
  expect(urls).toBeGreaterThan(0);
  await search.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await search.focus();
  await search.fill("files and resources");
  await expect(dialog.getByRole("option",{name:/Open files and resources/})).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/resources$/);
});

test("account menu and search survive navigation between two native applications",async({page})=>{
  await page.goto("/o/northline/workspace/apps");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button",{name:/Profile and preferences/}).click();
  await expect(page.getByText(/Role view \(not a security boundary\)/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox",{name:/Search screens, records and actions/}).fill("Account and data settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/account$/);
});

test("native sidebar disables detail-only links until a real company record is open", async ({page}) => {
  await page.goto("/o/harbor/mission/missions");
  const nav = page.getByRole("navigation", {name: "Missions navigation"});
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-disabled="true"]', {hasText: "Task board"})).toBeVisible();
  await expect(nav.getByRole("link", {name: "Task board", exact: true})).toHaveCount(0);
  await expect(nav.getByRole("link", {name: "Plan", exact: true})).toHaveCount(0);
  await expect(nav.getByRole("link", {name: "Mission library"})).toBeVisible();
});

test("native sidebar follows the active mission record between detail screens", async ({page}) => {
  await page.goto("/o/northline/mission/missions");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const existing = (await repo.listByCollection("org-northline", "missions"))[0];
    if (existing) return existing.id;
    // A browser-local test fixture makes record continuity deterministic even
    // when this company has no starter missions. It never reaches a server.
    const context = {actor: "Browser QA", now: new Date().toISOString()};
    const fixture = repo.newRecord({
      organizationId: "org-northline", collection: "missions",
      title: "Browser navigation fixture", status: "proposed",
      ownerName: "Browser QA", currency: "GBP",
      fields: { objective: "Verify native detail navigation" },
    }, context);
    await repo.putRecord(fixture, context);
    return fixture.id;
  });
  await page.goto(`/o/northline/mission/missions/${encodeURIComponent(id)}`);
  const nav = page.getByRole("navigation", {name: "Missions navigation"});
  const plan = nav.getByRole("link", {name: "Plan", exact: true});
  await expect(plan).toHaveAttribute("href", `/o/northline/mission/missions/${encodeURIComponent(id)}/plan`);
  // Below 1024px native navigation lives in the real off-canvas drawer.
  const openNavigation = page.getByRole("button", {name: "Open navigation", exact: true});
  if (await openNavigation.isVisible()) {
    await openNavigation.click();
    await expect(page.locator(".hq")).toHaveAttribute("data-nav-open", "true");
  }
  await plan.click();
  await expect(page).toHaveURL(new RegExp(`/mission/missions/${encodeURIComponent(id)}/plan$`));
});

test("switching a local role view never strands the user on a hidden native application", async ({page}) => {
  await page.goto("/o/northline/mission/missions");
  await page.getByRole("button", {name: /Profile and preferences/}).click();
  await page.getByRole("menuitem", {name: /Preview as Owner/}).click();
  await page.getByRole("menuitemradio", {name: "Client", exact: true}).press("Enter");
  await expect(page).toHaveURL(/\/o\/northline\/portal\//);
  await expect(page.getByText(/Outside the Client view/)).toHaveCount(0);
});
