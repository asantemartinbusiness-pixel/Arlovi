import { expect, test } from "@playwright/test";

/* Attribution counts Commerce's orders. On a first visit it must wait until every
   application's records are read, and it counts the seeded campaign links. */
test("metric notes count every order on first load, with recorded campaign links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/o/northline/market/analytics?overlay=metric%20notes&clock=2026-11-14T09:30:00Z");
  const dialog = page.getByRole("dialog", { name: "Metric notes" });
  await expect(dialog.getByText("Unattributed orders").first()).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText("7 of 9");
  await expect(dialog).not.toContainText("2 of 2");
});
