import { expect, test } from "@playwright/test";

test("portal directory and client dashboard display the same unique shared record count", async ({ page }) => {
  await page.goto("/o/northline/portal/portals");
  const harrow = page.locator(".ds-card").filter({ hasText: "Harrow House Interiors" }).first();
  await expect(harrow).toBeVisible();
  const count = harrow.locator("dt", { hasText: "Records shared" })
    .locator("xpath=following-sibling::dd");
  await expect(count).not.toHaveText("");
  const sharedCount = (await count.innerText()).trim();
  expect(Number(sharedCount)).toBeGreaterThan(0);

  // Legacy URL resolves to the canonical Harrow House portal, not the empty stub.
  await page.goto("/o/northline/portal/portals/nl-portals-001/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Client dashboard" })).toBeVisible();
  const dashboardCount = page.locator(".ds-stat").filter({ hasText: "Shared with you" })
    .locator(".ds-stat-value");
  await expect(dashboardCount).toHaveText(sharedCount);
  await expect(page.getByText("Ledbury Hotel Group", { exact: true })).toHaveCount(0);
});

test("unmatched browser-local client role never falls back to another client's portal", async ({ page }) => {
  await page.goto("/o/northline/portal/portals/nl-portals-001/dashboard");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Preview as/ }).press("ArrowRight");
  await page.getByRole("menuitemradio", { name: "Client", exact: true }).press("Enter");
  await expect(page.getByText("No portal is shared with this view")).toBeVisible();
  await expect(page.getByText("Harrow House Interiors", { exact: true })).toHaveCount(0);
});
