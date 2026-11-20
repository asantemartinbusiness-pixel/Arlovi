import { expect, test, type Page } from "@playwright/test";

/* W2G growth depth: booking lanes on a multi-seat resource, measured supplier
   performance and quality returns, partial shipments, returns and refund
   records, stock adjustments with history, portal page reorder by keyboard
   and drag, and plan approval decisions. Saved state is re-checked after reload. */

const ORG = "/o/northline";
const main = (page: Page) => page.locator("#main");
const dialog = (page: Page) => page.getByRole("dialog");

async function action(page: Page, label: string) {
  const bar = page.locator(".pg-actions");
  const direct = bar.getByRole("button", { name: label, exact: true });
  // The application may still be opening; its bar is complete once either control shows.
  await expect(page.locator('.pg[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await direct.or(bar.getByRole("button", { name: "More actions" })).first().waitFor({ state: "visible" });
  if (await direct.count()) { await direct.first().click(); return; }
  await bar.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test("BOOK draws overlapping seats on the showroom floor side by side", async ({ page }) => {
  await page.goto(`${ORG}/book/calendar?tab=Resource`);
  await expect(main(page).getByRole("columnheader", { name: "Showroom floor" })).toBeVisible();
  // Seeded trade morning is on 17 November 2026 (seed clock + 3 days).
  const diff = await page.evaluate(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(2026, 10, 17).getTime() - today.getTime()) / 86_400_000);
  });
  for (let i = 0; i < Math.abs(diff); i += 1) await page.getByRole("button", { name: diff < 0 ? "Previous day" : "Next day" }).click();
  await expect(main(page).getByText("Tuesday 17 November")).toBeVisible();
  const trade = main(page).getByRole("button", { name: /^Trade sample morning/ });
  const seat = main(page).getByRole("button", { name: /^Oriel Architects/ });
  await expect(trade).toHaveAttribute("title", /4 of 6 seats/);
  await expect(seat).toBeVisible();
  const a = (await trade.boundingBox())!;
  const b = (await seat.boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
  await expect(main(page).getByRole("button", { name: /Add booking at 10:00, 2 of 6 seats free/ })).toBeVisible();
});

test("PROC measures supplier performance and records a quality return into stock", async ({ page }) => {
  await page.goto(`${ORG}/proc/suppliers/nl-suppliers-620`);
  const perf = main(page).locator(".ds-card").filter({ hasText: "Delivery performance" });
  await expect(perf.getByText("Price variance")).toBeVisible();
  await expect(perf.getByRole("grid", { name: "Deliveries measured" }).or(perf.getByRole("table", { name: "Deliveries measured" }))).toBeVisible();
  await expect(perf.getByText("Weighted base, 180mm").first()).toBeVisible();
  await expect(main(page).getByText("Catalogue items from this supplier")).toBeVisible();

  await page.goto(`${ORG}/proc/receiving?tab=Exceptions`);
  await main(page).getByRole("row", { name: /GRN-82/ }).first().click();
  await action(page, "Return to supplier");
  const modal = dialog(page);
  await modal.getByRole("combobox", { name: /Line/ }).selectOption({ label: "Brass collar, 60mm" });
  await modal.getByRole("textbox", { name: /Units returned/ }).fill("500");
  await modal.getByRole("combobox", { name: /Reason/ }).selectOption("damaged");
  await modal.getByRole("button", { name: "Record return" }).click();
  await expect(modal.getByRole("alert")).toContainText("can still be returned");
  await modal.getByRole("textbox", { name: /Units returned/ }).fill("4");
  await modal.getByRole("button", { name: "Record return" }).click();
  await expect(page.getByText("Return recorded")).toBeVisible();

  await page.goto(`${ORG}/proc/suppliers/nl-suppliers-620`);
  await expect(main(page).getByRole("row", { name: /Brass collar, 60mm.*Damaged in transit/ })).toBeVisible();
  await page.reload();
  await expect(main(page).getByRole("row", { name: /Brass collar, 60mm.*Damaged in transit/ })).toBeVisible();
  await page.goto(`${ORG}/proc/movements`);
  await expect(main(page).getByRole("row", { name: /return to supplier/i }).first()).toBeVisible();
});

test("COMMERCE ships part of an order, then records a return and a refund", async ({ page }) => {
  await page.goto(`${ORG}/commerce/orders/nl-orders-623?tab=Fulfilment`);
  await expect(main(page).getByText("3 units not yet on a shipment")).toBeVisible();
  await action(page, "Fulfil lines");
  const drawer = dialog(page);
  await drawer.getByRole("textbox", { name: /Units of Drift Pendant/ }).fill("2");
  await drawer.getByRole("button", { name: "Start shipment" }).click();
  await expect(page.getByText("Shipment started")).toBeVisible();
  const shipment = main(page).getByRole("listitem", { name: "Shipment ORD-404-S1" });
  await shipment.getByRole("button", { name: "Mark packed" }).click();
  await dialog(page).getByRole("button", { name: "Record" }).click();
  await shipment.getByRole("button", { name: "Mark shipped" }).click();
  await dialog(page).getByRole("textbox", { name: /Tracking number/ }).fill("RM-55120");
  await dialog(page).getByRole("button", { name: "Record" }).click();
  await expect(shipment.getByText(/RM-55120/)).toBeVisible();
  await expect(main(page).getByText("1 unit not yet on a shipment")).toBeVisible();
  await page.reload();
  await expect(main(page).getByRole("listitem", { name: "Shipment ORD-404-S1" }).getByText("Shipped", { exact: true }).first()).toBeVisible();

  // A return can be raised only against shipped units, then refunded by recording it.
  await page.goto(`${ORG}/commerce/orders/nl-orders-623?tab=Returns`);
  await action(page, "Raise a return");
  // Two shipped, one already covered by the seeded RET-21, so one is returnable.
  await dialog(page).getByRole("textbox", { name: /Units/ }).fill("2");
  await dialog(page).getByRole("combobox", { name: /Reason/ }).selectOption("damaged");
  await dialog(page).getByRole("button", { name: "Raise return" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Only 1 can be returned");
  await dialog(page).getByRole("textbox", { name: /Units/ }).fill("1");
  await dialog(page).getByRole("button", { name: "Raise return" }).click();
  await expect(page.getByText("Return raised")).toBeVisible();

  await page.goto(`${ORG}/commerce/returns?tab=Requested`);
  const row = main(page).getByRole("row", { name: /ORD-404.*Drift Pendant/ }).first();
  await row.click();
  await action(page, "Review and approve");
  await dialog(page).getByRole("button", { name: "Approve the return" }).click();
  await expect(page.getByText("Return approved")).toBeVisible();
  await page.goto(`${ORG}/commerce/returns?tab=Approved`);
  await main(page).getByRole("row", { name: /ORD-404.*Drift Pendant/ }).first().click();
  await action(page, "Record a refund");
  await expect(dialog(page).getByText("No payment provider is connected")).toBeVisible();
  await dialog(page).getByRole("combobox", { name: /How it was refunded/ }).selectOption("bank_transfer");
  await dialog(page).getByRole("button", { name: "Record refund" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("reference");
  await dialog(page).getByRole("textbox", { name: /Reference/ }).fill("BACS-778");
  await dialog(page).getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText("Refund recorded")).toBeVisible();
  await page.goto(`${ORG}/commerce/orders/nl-orders-623?tab=Returns`);
  await expect(main(page).getByRole("row", { name: /BACS-778/ })).toBeVisible();
  await page.reload();
  await expect(main(page).getByRole("row", { name: /BACS-778/ })).toBeVisible();
});

test("COMMERCE stock adjustments need a reason and show in the running history", async ({ page }) => {
  await page.goto(`${ORG}/commerce/inventory`);
  await expect(main(page).getByRole("row", { name: /Drift Pendant/ }).first()).toBeVisible();
  await action(page, "Adjust stock");
  const modal = dialog(page);
  await modal.getByRole("combobox", { name: "Product" }).selectOption({ label: "Beacon Floor Lamp" });
  await modal.getByRole("textbox", { name: /Adjustment/ }).fill("-1");
  await modal.getByRole("combobox", { name: /Reason/ }).selectOption("damage");
  await modal.getByRole("button", { name: "Record movement" }).click();
  await expect(modal.getByRole("alert")).toContainText("needs a note");
  await modal.getByRole("textbox", { name: /Note/ }).fill("Shade dented while moving the display");
  await modal.getByRole("button", { name: "Record movement" }).click();
  await expect(page.getByText("Stock adjusted")).toBeVisible();
  await page.reload();
  await action(page, "Stock history");
  await dialog(page).getByRole("combobox", { name: "Product" }).selectOption({ label: "Beacon Floor Lamp" });
  await expect(dialog(page).getByRole("row", { name: /Shade dented while moving the display/ })).toBeVisible();
});

test("PORTAL pages reorder by keyboard and by drag, and persist", async ({ page }) => {
  // Tall enough that the drag source and target are both on screen, as they would be for a person dragging.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(`${ORG}/portal/portals/nl-portals-620/builder?tab=Pages`);
  const list = main(page).getByRole("list", { name: "Portal pages in navigation order" });
  const names = list.getByRole("textbox", { name: "Page name" });
  await expect(names.first()).toBeVisible();
  const before = await names.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(before.length).toBeGreaterThanOrEqual(3);

  const handle = list.getByRole("button", { name: new RegExp(`^Reorder ${before[0]},`) });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(names.nth(2)).toHaveValue(before[0]);
  await expect(main(page).getByText(new RegExp(`${before[0]} dropped at position 3`))).toBeVisible();

  // Escape puts a picked-up page back.
  const second = list.getByRole("button", { name: new RegExp(`^Reorder ${before[1]},`) });
  await second.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(names.nth(0)).toHaveValue(before[1]);

  // Drag the last page to the top.
  const last = before[before.length - 1];
  await list.getByRole("button", { name: new RegExp(`^Reorder ${last},`) }).dragTo(list.getByRole("listitem").first());
  await expect(names.first()).toHaveValue(last);

  await main(page).getByRole("button", { name: "Save navigation" }).click();
  await expect(page.getByText("Navigation saved")).toBeVisible();
  const saved = await names.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await page.reload();
  await expect(names.first()).toHaveValue(saved[0]);
  expect(await names.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(saved);
});

test("MARKET plan approval can send a plan back with a recorded reason", async ({ page }) => {
  await page.goto(`${ORG}/market/campaigns/nl-campaigns-621`);
  await action(page, "Approve plan");
  const modal = dialog(page);
  await modal.getByRole("combobox", { name: "Decision" }).selectOption("changes");
  await modal.getByRole("button", { name: "Record approval" }).click();
  await expect(modal.getByText("Say what needs to change")).toBeVisible();
  await modal.getByRole("textbox", { name: /What needs to change/ }).fill("Swap the hero image for one with cleared rights.");
  await modal.getByRole("button", { name: "Record approval" }).click();
  await expect(page.getByText("Changes requested", { exact: true }).first()).toBeVisible();
  await page.reload();
  await action(page, "Approve plan");
  await expect(dialog(page).getByText("Swap the hero image for one with cleared rights.")).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("shipments, stock history and page order fit a phone", async ({ page }) => {
    await page.goto(`${ORG}/commerce/orders/nl-orders-623?tab=Fulfilment`);
    await expect(main(page).getByText("Fulfilment by line").first()).toBeVisible();
    await noOverflow(page);
    await page.goto(`${ORG}/proc/suppliers/nl-suppliers-620`);
    await expect(main(page).getByText("Delivery performance")).toBeVisible();
    await noOverflow(page);
    await page.goto(`${ORG}/portal/portals/nl-portals-620/builder?tab=Pages`);
    const list = main(page).getByRole("list", { name: "Portal pages in navigation order" });
    await expect(list.getByRole("button", { name: /^Reorder / }).first()).toBeVisible();
    await noOverflow(page);
  });
});
