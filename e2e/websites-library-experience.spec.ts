import { expect, test } from "@playwright/test";

test("Websites library exposes work, release context and recoverable search", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  const main = page.locator("#main");
  await expect(main.getByLabel("Website library overview")).toBeVisible();
  await expect(main.getByLabel("Website summary")).toBeVisible();
  await expect(main.getByLabel("Website summary")).toContainText("Verified domains");
  await expect(main.getByLabel(/^Routes of /).first()).toBeVisible();
  await expect(main.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.locator(".web-library-card").first()).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a website" }).fill("qa-websites-unfindable-query-2026");
  await expect(main.getByText("No websites match your search")).toBeVisible();
  await main.getByRole("button", { name: "Clear website search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a website" })).toHaveValue("");
  await main.getByRole("button", { name: "Table view" }).click();
  await expect(main.getByRole("button", { name: "Table view" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByRole("table", { name: "Sites" })).toBeVisible();
  await main.getByRole("button", { name: "Card view" }).click();
  await expect(main.locator(".web-library-card").first()).toBeVisible();
});

test("Site dashboard connects real site tools without changing the active record", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  const firstSite = page.locator(".web-library-card").first();
  const destination = await firstSite.getByRole("link", { name: "Dashboard" }).getAttribute("href");
  expect(destination).toMatch(/^\/o\/northline\/web\/sites\/[^/]+$/);
  await page.goto(destination!);
  const main = page.locator("#main");
  const workspace = main.getByLabel("Website working area");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("navigation", { name: "Site work areas" })).toBeVisible();
  await workspace.getByRole("button", { name: /Content/ }).click();
  await expect(page).toHaveURL(new RegExp(destination + "/cms$"));
  await expect(main).not.toContainText("Record not found");
});

test("Unknown website details do not show another site's dashboard", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  await page.goto("/o/northline/web/sites/qa-unknown-site-id-2026");
  const main = page.locator("#main");
  await expect(main).toContainText(/Record not found|No site in this workspace/);
  await expect(main.getByLabel("Website working area")).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  test("Websites library controls and cards fit " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/web/sites");
    const main = page.locator("#main");
    await expect(main.getByRole("searchbox", { name: "Find a website" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Card view" })).toBeVisible();
    await expect(main.locator(".web-library-card").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}


test("Website editor exposes the current page and routes back into its connected tools", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  const editorPath = await page.locator(".web-library-card").first()
    .getByRole("link", { name: "Editor" }).getAttribute("href");
  expect(editorPath).toContain("/web/sites/");
  await page.goto(editorPath!);
  const main = page.locator("#main");
  const editor = main.getByLabel("Website editor overview");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Page being edited")).toBeVisible();
  await expect(editor).toContainText("blocks");
  await editor.getByRole("button", { name: "More site tools" }).click();
  await page.getByRole("menuitem", { name: "Quality" }).click();
  await expect(page).toHaveURL(new RegExp(editorPath!.replace(/\/builder$/, "") + "/quality$"));
  await expect(main).not.toContainText("Record not found");
});

test("Unknown website builder URLs cannot substitute a real site", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  await page.goto("/o/northline/web/sites/qa-unknown-site-id-2026/builder");
  const main = page.locator("#main");
  await expect(main).toContainText(/Record not found|No site in this workspace/);
  await expect(main.getByLabel("Website editor overview")).toHaveCount(0);
});


test("Website quality review filters long check lists and returns to the same editor", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  const dashboard = await page.locator(".web-library-card").first()
    .getByRole("link", { name: "Dashboard" }).getAttribute("href");
  await page.goto(dashboard + "/quality?tab=Accessibility");
  const main = page.locator("#main");
  const review = main.getByLabel("Website quality review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Accessibility checks");
  const filters = main.getByRole("group", { name: "Quality issue filter" });
  await expect(filters.getByRole("button", { name: /Needs attention/ })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: /All checks/ }).click();
  await expect(filters.getByRole("button", { name: /All checks/ })).toHaveAttribute("aria-pressed", "true");
  await review.getByRole("button", { name: "Open editor" }).click();
  await expect(page).toHaveURL(new RegExp(dashboard + "/builder$"));
  await expect(main.getByLabel("Website editor overview")).toBeVisible();
});

async function newSite(page: import("@playwright/test").Page, title: string) {
  await page.goto("/o/northline/web/sites");
  return page.evaluate(async (name) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "sites", currency: "GBP", title: name, status: "draft", fields: {},
      body: {
        pages: [{ id: "home", name: "Home", path: "/", blocks: [
          { id: "b1", type: "hero", props: { title: "First block" } },
          { id: "b2", type: "text", props: { title: "Second block", body: "Body copy" } },
          { id: "b3", type: "text", props: { title: "Third block", body: "More copy" } },
        ] }],
      },
    } as Parameters<typeof repo.newRecord>[0], ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  }, title);
}

test("Builder inspector follows the selection and the layout popover moves the block", async ({ page }) => {
  const id = await newSite(page, "QA Builder Inspector");
  await page.goto(`/o/northline/web/sites/${id}/builder`);
  const main = page.locator("#main");
  await expect(main.getByText("Select a block on the canvas or in the list to edit it here.")).toBeVisible();
  await main.getByRole("button", { name: /^2\s*Text/ }).click();
  await expect(main.getByText("Selected · 2 of 3")).toBeVisible();
  await expect(main.getByLabel("Heading")).toHaveValue("Second block");
  await main.getByRole("button", { name: "Block layout" }).click();
  await page.getByRole("button", { name: "Up", exact: true }).click();
  await expect(main.getByText("Selected · 1 of 3")).toBeVisible();
});

test("Publish review says nothing is uploaded and records a blocked attempt", async ({ page }) => {
  const id = await newSite(page, "QA Publish Review");
  await page.goto(`/o/northline/web/sites/${id}/deploy`);
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nothing is uploaded and no address changes.");
  await expect(dialog).toContainText("Hosting connection · not connected");
  await dialog.getByRole("button", { name: "Record a blocked attempt" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: "Deployments" }).click();
  await expect(page.locator("#main").getByRole("table", { name: "Deployments" })).toContainText(/blocked/i);
});
