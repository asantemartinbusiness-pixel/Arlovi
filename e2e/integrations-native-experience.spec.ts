import { expect, test } from "@playwright/test";

test("Integrations marketplace provides scoped discovery and recoverable search", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace");
  const main = page.locator("#main");
  await expect(main.getByLabel("Integration catalogue overview")).toBeVisible();
  await expect(main.getByLabel("Integration catalogue summary")).toBeVisible();
  await expect(main.getByLabel("Integration catalogue").locator(".connect-marketplace-card").first()).toBeVisible();
  const search = main.getByRole("searchbox", { name: "Search integration capabilities" });
  await search.fill("this-is-not-a-provider-2026");
  await expect(main.getByText("No integrations match")).toBeVisible();
  await main.getByRole("button", { name: "Clear integration search" }).click();
  await expect(search).toHaveValue("");
  await expect(main.locator(".connect-marketplace-card").first()).toBeVisible();
  await main.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Compare connectors");
});

test("Marketplace categories show one manageable group at a time", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace?tab=Categories");
  const main = page.locator("#main");
  const nav = main.getByRole("navigation", { name: "Integration categories" });
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: /Money/ }).click();
  await expect(nav.getByRole("button", { name: /Money/ })).toHaveAttribute("aria-current", "true");
  const money = await main.locator(".connect-marketplace-card").count();
  expect(money).toBeGreaterThan(0);
  await nav.getByRole("button", { name: /All categories/ }).click();
  await expect(main.locator(".connect-marketplace-card").first()).toBeVisible();
  expect(await main.locator(".connect-marketplace-card").count()).toBeGreaterThan(money);
});

test("Connection records support search, recovery and strict connector identity", async ({ page }) => {
  await page.goto("/o/northline/connect/connections");
  const main = page.locator("#main");
  await expect(main.getByLabel("Connection management overview")).toBeVisible();
  await expect(main.getByLabel("Connection status summary")).toBeVisible();
  const search = main.getByRole("searchbox", { name: "Find a connection" });
  await search.fill("no-such-connector-request-2026");
  await expect(main.getByText("No connections match your search")).toBeVisible();
  await main.getByRole("button", { name: "Clear connection search" }).click();
  await expect(search).toHaveValue("");
  await page.goto("/o/northline/connect/connections/no-connector-with-this-id-2026");
  await expect(main).toContainText(/No connection|Record not found/);
  await expect(main).not.toContainText("Connection activity");
});

test("Sync centre shows work areas, real local conflict counts and meaningful empty states", async ({ page }) => {
  await page.goto("/o/northline/connect/sync");
  const main = page.locator("#main");
  await expect(main.getByLabel("Synchronisation overview")).toBeVisible();
  await expect(main.getByLabel("Synchronisation status summary")).toBeVisible();
  const nav = main.getByRole("navigation", { name: "Synchronisation work areas" });
  await nav.getByRole("button", { name: "Conflicts" }).click();
  await expect(page).toHaveURL(/tab=Conflicts/);
  const search = main.getByRole("searchbox", { name: "Search sync conflicts" });
  await search.fill("unfindable-conflict-2026");
  await expect(main.getByText("No conflicts match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear conflict search" }).click();
  await main.getByRole("group", { name: "Conflict status filter" }).getByRole("button", { name: "All" }).click();
  await expect(main.getByRole("group", { name: "Conflict status filter" }).getByRole("button", { name: "All" }))
    .toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "Schedules" }).click();
  await expect(main).toContainText("Planned safeguards, not enabled settings");
  await expect(main.getByRole("checkbox")).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  test("Integration marketplace has no horizontal page overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/connect/marketplace?tab=Categories");
    const main = page.locator("#main");
    await expect(main.getByRole("searchbox", { name: "Search integration capabilities" })).toBeVisible();
    await expect(main.getByRole("navigation", { name: "Integration categories" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}


test("Connector details and authorisation preview preserve capability and permissions context", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace");
  const main = page.locator("#main");
  const card = main.locator(".connect-marketplace-card").first();
  await card.getByRole("button", { name: "View details" }).click();
  const detailUrl = page.url();
  const detail = main.getByLabel("Connector details overview");
  await expect(detail).toBeVisible();
  await expect(detail.getByLabel("Connector scope summary")).toBeVisible();
  await detail.getByRole("button", { name: "Review permissions" }).click();
  await expect(page).toHaveURL(/tab=Permissions/);
  await detail.getByRole("button", { name: "Connection requirements" }).click();
  await expect(page).not.toHaveURL(detailUrl);
  const authorisation = main.getByLabel("Connector authorisation overview");
  await expect(authorisation).toBeVisible();
  await expect(authorisation).toContainText("redirect and callback are not available");
  await authorisation.getByRole("button", { name: "Connector details" }).click();
  await expect(main.getByLabel("Connector details overview")).toBeVisible();
});


test("Connector health provides real diagnostic context across all tabs", async ({ page }) => {
  await page.goto("/o/northline/connect/health");
  const main = page.locator("#main");
  const overview = main.getByLabel("Connector health overview");
  await expect(overview).toBeVisible();
  const nav = overview.getByRole("navigation", { name: "Connector health areas" });
  await nav.getByRole("button", { name: "Rate limits" }).click();
  await expect(page).toHaveURL(/tab=Rate/);
  await expect(main).toContainText("A quota figure would have to come from a provider");
  await nav.getByRole("button", { name: "Deprecations" }).click();
  await expect(main).toContainText("No provider version is being tracked");
  await nav.getByRole("button", { name: "Overview" }).click();
  await expect(main.getByRole("button", { name: "Run the health test" })).toBeVisible();
  await overview.getByRole("button", { name: "Review connections" }).click();
  await expect(page).toHaveURL(/\/connect\/connections$/);
});


test("Action receipts expose audit provenance with searchable empty-state recovery", async ({ page }) => {
  await page.goto("/o/northline/connect/receipts");
  const main = page.locator("#main");
  const overview = main.getByLabel("Action receipt overview");
  await expect(overview).toBeVisible();
  await expect(overview).toContainText("A local log entry is not proof");
  const search = main.getByRole("searchbox", { name: "Search action receipts" });
  await search.fill("no-receipt-matches-this-2026");
  await expect(main.getByText("No receipts match your search")).toBeVisible();
  await main.getByRole("button", { name: "Clear receipt search" }).click();
  await expect(search).toHaveValue("");
  await overview.getByRole("button", { name: "Synchronisation" }).click();
  await expect(page).toHaveURL(/\/connect\/sync$/);
  await expect(main.getByLabel("Synchronisation overview")).toBeVisible();
});
