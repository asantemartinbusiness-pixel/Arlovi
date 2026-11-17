import { expect, test } from "@playwright/test";

test("Websites library exposes work, release context and recoverable search", async ({ page }) => {
  await page.goto("/o/northline/web/sites");
  const main = page.locator("#main");
  await expect(main.getByLabel("Website library overview")).toBeVisible();
  await expect(main.getByLabel("Website summary")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Build, manage and prepare your websites." })).toBeVisible();
  await expect(main.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.locator(".web-library-card").first()).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a website" }).fill("qa-websites-unfindable-query-2026");
  await expect(main.getByText("No websites match your search")).toBeVisible();
  await main.getByRole("button", { name: "Clear website search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a website" })).toHaveValue("");
  await main.getByRole("button", { name: "Table view" }).click();
  await expect(main.getByRole("button", { name: "Table view" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByLabel("Sites")).toBeVisible();
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
  await expect(editor).toContainText("PAGE EDITOR");
  await expect(editor).toContainText("blocks");
  await editor.getByRole("button", { name: "Quality" }).click();
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
