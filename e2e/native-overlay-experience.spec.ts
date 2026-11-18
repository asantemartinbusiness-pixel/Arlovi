import { expect, test } from "@playwright/test";

test("bookings deposit keeps its own identity, record and action workflow", async ({ page }) => {
  await page.goto("/o/northline/book/bookings/nl-bookings-628?clock=2026-11-14T09:30:00Z");
  await page.getByRole("button", { name: "Take payment (deposit)" }).click();
  const dialog = page.getByRole("dialog", { name: "Deposit" });
  await expect(dialog).toHaveAttribute("data-native-app", "BOOK");
  await expect(dialog.locator(".native-overlay-origin")).toContainText("Bookings");
  await expect(dialog.locator(".native-overlay-record")).toContainText("Ledbury Hotel Group");
  await expect(dialog.getByRole("button", { name: "Money received elsewhere" })).toBeVisible();
});

test("finance drawer keeps account evidence and its own application context", async ({ page }) => {
  await page.goto("/o/northline/fin/budgets?clock=2026-11-14T09:30:00Z");
  await page.getByRole("button", { name: /^Explain / }).first().click();
  const drawer = page.getByRole("dialog", { name: "Explain a variance" });
  await expect(drawer).toHaveAttribute("data-native-app", "FIN");
  await expect(drawer.locator(".native-overlay-origin")).toContainText("Finance");
  await expect(drawer.getByRole("region", { name: "Budget variance overview" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save explanation" })).toBeVisible();
});

test("an unselected automation cannot activate an arbitrary first workflow", async ({ page }) => {
  await page.goto("/o/northline/auto/workflows?overlay=activation%20review");
  const dialog = page.getByRole("dialog", { name: "Activation review" });
  await expect(dialog).toHaveAttribute("data-native-app", "AUTO");
  await expect(dialog).toContainText("Choose a record first");
  await expect(dialog.getByRole("button", { name: /^Activate$/ })).toHaveCount(0);
});
