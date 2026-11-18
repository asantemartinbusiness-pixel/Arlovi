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

test("cancelling an edited receipt asks whether to discard changes", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices/nl-invoices-001?overlay=payment%20form");
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Amount received" }).fill("1.00");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  const confirm = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Amount received" })).toHaveValue("1.00");
});

test("an invoice receipt refuses a booking ID instead of showing a different invoice", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices/nl-bookings-001?overlay=payment%20form");
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The selected record is unavailable");
  await expect(dialog.getByRole("button", { name: "Post the receipt" })).toHaveCount(0);
});
