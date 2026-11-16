import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Uses the actual off-canvas navigation on small screens, never force-clicks
 * invisible sidebar controls. */
async function openNativeSidebar(page: Page) {
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await trigger.isVisible()) await trigger.click();
  await expect(page.getByRole("navigation", { name: "Finance navigation" })).toBeVisible();
}

test("every Finance breadcrumb returns to its registered app entry, not a broken /fin route", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  const crumb = page.locator(".pg-head").getByRole("link", { name: "Finance", exact: true });
  await expect(crumb).toHaveAttribute("href", "/o/northline/fin/home");
  await crumb.click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/home$/);
  await expect(page.getByRole("heading", { level: 1, name: "Finance Overview" })).toBeVisible();
});

for (const width of [390, 820, 1440]) {
  test("native tabs never bleed between Finance screens at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto("/o/northline/fin/home");
    await page.getByRole("tab", { name: "Cashflow" }).click();
    await expect(page).toHaveURL(/\/fin\/home\?tab=Cashflow$/);
    await openNativeSidebar(page);
    await page.getByRole("navigation", { name: "Finance navigation" })
      .getByRole("link", { name: "Invoices", exact: true }).click();
    await expect(page).toHaveURL(/\/fin\/invoices$/);
    await expect(page.getByRole("tab", { name: "Draft", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await openNativeSidebar(page);
    await page.getByRole("navigation", { name: "Finance navigation" })
      .getByRole("link", { name: "Finance Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/fin\/home$/);
    await expect(page.getByRole("tab", { name: "Overview", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Cashflow" }))
      .toHaveAttribute("aria-selected", "false");
  });
}

test("invalid deep-linked Finance tab resolves to the first valid screen tab", async ({ page }) => {
  await page.goto("/o/northline/fin/accounts?tab=NotARealTab");
  await expect(page.getByRole("tab", { name: "All", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
});

test("company-scoped app breadcrumb cannot change companies or invent a record ID", async ({ page }) => {
  await page.goto("/o/harbor/crm/contacts");
  const crumb = page.locator(".pg-head").getByRole("link", { name: "CRM", exact: true });
  await expect(crumb).toHaveAttribute("href", "/o/harbor/crm/home");
  await crumb.click();
  await expect(page).toHaveURL(/\/o\/harbor\/crm\/home$/);
  await expect(page.getByText(/This screen is not built yet/)).toHaveCount(0);
});

test("native-app header control labels match visible text for screen readers", async ({ page }) => {
  await page.goto("/o/northline/fin/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  const search = page.locator(".hq-search");
  await expect(search).toHaveAttribute("aria-label", /Search anything in Northline (Ctrl\+K|⌘K)/);
  await expect(page.locator(".hq-orgdot")).toHaveAttribute("aria-hidden", "true");
  const results = await new AxeBuilder({ page })
    .include(".hq-header")
    .withRules(["label-content-name-mismatch"])
    .analyze();
  expect(results.violations.map(issue => ({
    rule: issue.id,
    elements: issue.nodes.map(node => node.html.slice(0, 140)),
  }))).toEqual([]);
});
