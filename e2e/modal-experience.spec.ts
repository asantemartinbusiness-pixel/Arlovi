import { expect, test } from "@playwright/test";

const bookingPath = "/o/northline/book/bookings/nl-bookings-628?clock=2026-11-14T09:30:00Z";

async function openDeposit(page: import("@playwright/test").Page) {
  await page.goto(bookingPath);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.getByRole("button", { name: "Take payment (deposit)" }).click();
  const dialog = page.getByRole("dialog", { name: "Deposit" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("deposit modal shows truthful payment summary and sticky actions", async ({ page }) => {
  const dialog = await openDeposit(page);
  await expect(dialog.getByRole("region", { name: "Booking context" })).toContainText("Ledbury Hotel Group");
  await expect(dialog.getByRole("region", { name: "Deposit calculation" })).toBeVisible();
  await expect(dialog).toContainText("Payment collection is not connected");
  await expect(dialog).toContainText("No card details are entered");
  await expect(dialog.locator(".ds-modal-foot")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Request already recorded" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Money received elsewhere" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/book\/bookings\/nl-bookings-628/);
});

test("deposit amount edit cannot be dismissed without a choice", async ({ page }) => {
  const dialog = await openDeposit(page);
  const amount = dialog.getByRole("textbox", { name: "Deposit amount" });
  await amount.fill("65.00");
  await expect(dialog.getByRole("button", { name: "Update deposit request" })).toBeEnabled();
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep editing" }).first().click();
  await expect(dialog).toBeVisible();
  await expect(amount).toHaveValue("65.00");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog).toHaveCount(0);
});

test("external payment receipt requires a second deliberate confirmation", async ({ page }) => {
  const dialog = await openDeposit(page);
  await dialog.getByRole("button", { name: "Money received elsewhere" }).click();
  await expect(dialog).toContainText("Only confirm receipt if the payment is visible");
  await expect(dialog.getByRole("button", { name: "Confirm external receipt" })).toBeVisible();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("button", { name: "Request already recorded" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm external receipt" })).toHaveCount(0);
});

test("modals remain within mobile viewport and keep their actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openDeposit(page);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  await expect(dialog.getByRole("button", { name: "Request already recorded" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
