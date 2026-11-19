import { expect, test, type Page } from "@playwright/test";

/* A2 refinement: the three-way chain on procurement overlays, the receiving scan
   field, and the refund and margin surfaces in commerce. Every check reads real
   seeded records; nothing here claims a processor or supplier connection. */

const ORG = "/o/northline";
const main = (page: Page) => page.locator("#main");
const dialog = (page: Page) => page.getByRole("dialog");

async function action(page: Page, label: string) {
  const bar = page.locator(".pg-actions");
  const direct = bar.getByRole("button", { name: label, exact: true });
  await direct.first().waitFor({ state: "visible", timeout: 1500 }).catch(() => undefined);
  if (await direct.count()) { await direct.first().click(); return; }
  await bar.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

test("PROC revising an issued order shows its chain and the value change before saving", async ({ page }) => {
  await page.goto(`${ORG}/proc/orders?tab=Sent`);
  await main(page).getByRole("row", { name: /PO-206/ }).getByText("PO-206", { exact: true }).click();
  await action(page, "Revise selected");
  const drawer = dialog(page);
  await expect(drawer.getByRole("list", { name: "Request to payment" })).toBeVisible();
  await expect(drawer.getByText("Saving records version 3 of the same order")).toBeVisible();
  await expect(drawer.getByText("Change impact")).toBeVisible();
  await drawer.getByRole("textbox", { name: "Quantity" }).first().fill("210");
  await expect(drawer.getByText("After this save")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save order" })).toBeEnabled();
});

test("PROC order record lists lines ordered against received and related documents", async ({ page }) => {
  await page.goto(`${ORG}/proc/orders?tab=Sent`);
  await main(page).getByRole("row", { name: /PO-206/ }).getByText("PO-206", { exact: true }).click();
  await action(page, "Revision history");
  const drawer = dialog(page);
  await expect(drawer.getByRole("heading", { name: "Purchase order" })).toBeVisible();
  await expect(drawer.getByRole("grid", { name: "Order lines" }).or(drawer.getByRole("table", { name: "Order lines" }))).toBeVisible();
  await expect(drawer.getByRole("list", { name: "Request to payment" })).toBeVisible();
  await expect(drawer.getByText("Revision history")).toBeVisible();
});

test("PROC issuing an order records it as issued without claiming it was sent", async ({ page }) => {
  await page.goto(`${ORG}/proc/orders?tab=Sent`);
  await main(page).getByRole("row", { name: /PO-206/ }).getByText("PO-206", { exact: true }).click();
  await action(page, "Issue selected");
  const drawer = dialog(page);
  await expect(drawer.getByText("The order cannot be transmitted")).toBeVisible();
  await expect(drawer.getByText(/^To Thames Brass Founders · /)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Re-record the issue date" })).toBeVisible();
});

test("PROC the scan field adds a code on Enter and does not record the receipt", async ({ page }) => {
  await page.goto(`${ORG}/proc/receiving`);
  await action(page, "Scan a delivery");
  const drawer = dialog(page);
  const field = drawer.getByRole("textbox", { name: "Scan a barcode" });
  await field.fill("tb-col-60");
  await field.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("TB-COL-60", { exact: true })).toBeVisible();
  await field.fill("TB-COL-60");
  await field.press("Enter");
  await expect(page.getByText("Already scanned")).toBeVisible();
  await expect(drawer.getByText("TB-COL-60", { exact: true })).toHaveCount(1);
});

test("PROC a receipt opens with its chain and a way to match its invoice", async ({ page }) => {
  await page.goto(`${ORG}/proc/receiving?tab=Exceptions`);
  await main(page).getByRole("row", { name: /GRN-82/ }).first().click();
  await action(page, "Open selected");
  const drawer = dialog(page);
  await expect(drawer.getByRole("list", { name: "Request to payment" })).toBeVisible();
  await drawer.getByRole("button", { name: /^Match / }).click();
  await expect(drawer.getByText("Three-way match").first()).toBeVisible();
});

test("COMMERCE the refund state never claims money moved", async ({ page }) => {
  await page.goto(`${ORG}/commerce/orders/nl-orders-623`);
  await expect(page.getByRole("heading", { level: 1, name: "ORD-404" })).toBeVisible();
  await action(page, "Refund state");
  const drawer = dialog(page);
  const stages = drawer.getByRole("list", { name: "Refund stages" });
  await expect(stages.getByText("Not possible here")).toBeVisible();
  await expect(drawer.getByText("Arlovi shows no processor receipt because none exists.")).toBeVisible();
});

test("COMMERCE a refund proposal cannot exceed what is left to refund", async ({ page }) => {
  await page.goto(`${ORG}/commerce/orders/nl-orders-623`);
  await action(page, "Propose a refund");
  const modal = dialog(page);
  await expect(modal.getByText("Left to refund")).toBeVisible();
  await modal.getByRole("textbox", { name: "Refund amount" }).fill("9999.00");
  await expect(modal.getByText(/More than the .* that remains/)).toBeVisible();
  await modal.getByRole("textbox", { name: "Refund amount" }).fill("10.00");
  await modal.getByRole("textbox", { name: /Reason/ }).fill("Damaged on arrival");
  await modal.getByRole("button", { name: "Record proposal" }).click();
  await expect(page.getByText("Refund proposed")).toBeVisible();
});

test("COMMERCE returns show a plain refund state and the inspector offers its actions in the footer", async ({ page }) => {
  await page.goto(`${ORG}/commerce/returns?tab=Requested`);
  await expect(main(page).getByText("Not refunded").first()).toBeVisible();
  await expect(main(page).getByText("UNDEFINED", { exact: true })).toHaveCount(0);
  await main(page).getByRole("row", { name: /RET-18/ }).first().click();
  await action(page, "Review and approve");
  const drawer = dialog(page);
  await expect(drawer.getByRole("button", { name: "Approve the return" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Record a refund" })).toBeVisible();
});

test("COMMERCE margin impact previews a price against live offers and saves nothing", async ({ page }) => {
  await page.goto(`${ORG}/commerce/products/nl-products-620`);
  await expect(page.getByRole("heading", { level: 1, name: "Beacon Floor Lamp" })).toBeVisible();
  await action(page, "Margin impact");
  const drawer = dialog(page);
  await expect(drawer.getByText("This previews only.")).toBeVisible();
  await drawer.getByRole("textbox", { name: "Proposed price" }).fill("120.00");
  await expect(drawer.getByText("At the proposed price")).toBeVisible();
  await expect(drawer.getByText("Breaks a margin floor").or(drawer.getByText("Within floors"))).toBeVisible();
});

test("COMMERCE the order record shows no overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ORG}/commerce/orders/nl-orders-623`);
  await expect(page.getByRole("heading", { level: 1, name: "ORD-404" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("PROC receiving against an issued order shows what the receipt will become and writes it", async ({ page }) => {
  await page.goto(`${ORG}/proc/orders?tab=Sent`);
  await main(page).getByRole("row", { name: /PO-206/ }).getByText("PO-206", { exact: true }).click();
  await action(page, "Receive against it");
  const drawer = dialog(page);
  await expect(drawer.getByText("Count what arrived")).toBeVisible();
  await drawer.getByRole("textbox", { name: "Received now for Brass collar, 60mm" }).fill("20");
  await expect(drawer.getByText("An exception (short)")).toBeVisible();
  await drawer.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.getByText("Goods received")).toBeVisible();
});

test("PROC requisition review shows approval need and limit, and a rejection needs a reason", async ({ page }) => {
  await page.goto(`${ORG}/proc/requisitions?tab=Awaiting%20approval`);
  await main(page).getByRole("row", { name: /REQ-312/ }).getByText("REQ-312", { exact: true }).click();
  await action(page, "Approve selected");
  const drawer = dialog(page);
  await expect(drawer.getByText("Approval needed")).toBeVisible();
  await expect(drawer.getByText("Your limit")).toBeVisible();
  await expect(drawer.getByRole("list", { name: "Request to payment" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Reject with reason" })).toBeDisabled();
  await drawer.getByRole("textbox", { name: /Note for the record/ }).fill("Not this quarter");
  await expect(drawer.getByRole("button", { name: "Reject with reason" })).toBeEnabled();
});
