import { expect, test, type Page } from "@playwright/test";

/*
 * WS1 — Executive Home as a command centre: exceptions that open the record,
 * objectives with key results that can be checked in, department health and a
 * decision log. Each change is read back after a reload.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const go = async (page: Page, path: string) => {
  await page.goto(`/o/northline${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
  await expect(page.locator("h1").first()).toBeVisible();
};

test("objective check-in updates key results and survives a reload", async ({ page }) => {
  await go(page, "/hq/home");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  const objectives = main.getByRole("list", { name: "Active objectives" });
  await expect(objectives.getByText("Cut lead time to fourteen days")).toBeVisible();

  await main.getByRole("button", { name: "Check in on Cut lead time to fourteen days" }).click();
  await dialog.getByLabel("Current value for Median days from order to dispatch").fill("15");
  await dialog.getByLabel("Key result", { exact: true }).fill("Orders shipped inside fourteen days");
  await dialog.getByLabel("Target").fill("10");
  await dialog.getByLabel("Unit").fill("orders");
  await dialog.getByRole("button", { name: "Add key result" }).click();
  await expect(dialog.getByLabel("Current value for Orders shipped inside fourteen days")).toBeVisible();
  await dialog.getByLabel("Check-in note").fill("New finishing rota");
  await expect(dialog.getByText(/Progress after saving:\s*40%/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save check-in" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  const item = main.getByRole("list", { name: "Active objectives" }).getByRole("listitem").filter({ hasText: "Cut lead time" });
  await expect(item).toContainText("40% · 0 of 3 key results met");

  await go(page, "/hq/goals");
  const results = main.getByRole("list", { name: "Key results for Cut lead time to fourteen days" });
  await expect(results).toContainText("Median days from order to dispatch");
  await expect(results).toContainText("15 days");
  await expect(results).toContainText("Orders shipped inside fourteen days");
  await expect(main.getByText(/Last check-in .* by Maya Chen/).first()).toBeVisible();
});

test("a decision is logged with its reason and related record, then appears on the timeline", async ({ page }) => {
  await go(page, "/hq/home");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  await expect(main.getByText("Decision log")).toBeVisible();
  await main.getByRole("button", { name: "Log a decision" }).click();
  await dialog.getByLabel("Decision").fill("Move finishing to a two-shift rota");
  await dialog.getByLabel("Why").fill("Lead time is the objective furthest behind; a second shift clears the queue.");
  await dialog.getByLabel("Related record").selectOption({ label: "Cut lead time to fourteen days" });
  await dialog.getByRole("button", { name: "Record decision" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  const log = main.getByRole("list", { name: "Recent decisions" });
  await expect(log).toContainText("Move finishing to a two-shift rota");
  await expect(log).toContainText("Decided by Maya Chen");

  await go(page, "/hq/timeline?tab=Decisions");
  await expect(main.getByText("Move finishing to a two-shift rota")).toBeVisible();
  await main.getByRole("button", { name: "Cut lead time to fourteen days" }).first().click();
  await expect(page).toHaveURL(/\/hq\/goals/);
});

test("exceptions and department health open the records behind them", async ({ page }) => {
  // The asset library seeds its records when it is first opened.
  await go(page, "/asset/assets");
  await expect(page.locator("#main .asset-tile").first()).toBeVisible();
  await go(page, "/hq/home");
  const main = page.locator("#main");
  await main.getByRole("group", { name: "Exception source" }).getByRole("button", { name: /Assets/ }).click();
  const exceptions = main.getByRole("list", { name: "Exceptions" });
  await expect(exceptions).toContainText("Workshop bench — process: licence ends in 9 days");
  await main.getByRole("button", { name: "Open Workshop bench — process: licence ends in 9 days" }).click();
  await expect(page).toHaveURL(/\/asset\/assets\/nl-assets-028/);

  await go(page, "/hq/home");
  const health = main.getByRole("list", { name: "Department health" });
  await expect(health.getByRole("listitem").filter({ hasText: "Workshop" })).toContainText("Needs attention");
  await health.getByRole("button", { name: "Workshop" }).click();
  await expect(page).toHaveURL(/\/hq\/departments\/nl-departments-020/);
});

test("executive home stays readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/hq/home");
  const main = page.locator("#main");
  await expect(main.getByRole("list", { name: "Active objectives" })).toBeVisible();
  await expect(main.getByRole("list", { name: "Department health" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
