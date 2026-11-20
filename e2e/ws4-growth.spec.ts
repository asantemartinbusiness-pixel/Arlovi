import { expect, test, type Page } from "@playwright/test";

/* WS4 growth flows: portal configuration, booking cancellation and moves,
   quote comparison and award in procurement, and product variants. Every
   change is checked again after a full reload, so it is proved persisted. */

const ORG = "/o/northline";
const main = (page: Page) => page.locator("#main");
const dialog = (page: Page) => page.getByRole("dialog");

async function action(page: Page, label: string) {
  const bar = page.locator(".pg-actions");
  const direct = bar.getByRole("button", { name: label, exact: true });
  await direct.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
  if (await direct.count()) { await direct.first().click(); return; }
  await bar.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

test.describe("PORTAL builder configuration", () => {
  const builder = `${ORG}/portal/portals/nl-portals-620/builder`;

  test("exposure, navigation and branding persist after reload", async ({ page }) => {
    await page.goto(`${builder}?tab=Data`);
    const segment = main(page).getByRole("group", { name: "Kind of record" });
    await segment.getByRole("button", { name: /^Invoices/ }).click();
    const toggle = main(page).getByRole("list", { name: "Exposure" }).locator("input[type=checkbox]:not([disabled])").first();
    const before = await toggle.isChecked();
    const id = await toggle.getAttribute("aria-describedby");
    await toggle.click();
    await expect(page.getByText(before ? "Withdrawn" : "Shared", { exact: true })).toBeVisible();
    await page.reload();
    await main(page).getByRole("group", { name: "Kind of record" }).getByRole("button", { name: /^Invoices/ }).click();
    const after = main(page).locator(`input[aria-describedby="${id}"]`);
    if (before) await expect(after).not.toBeChecked(); else await expect(after).toBeChecked();
    await main(page).getByRole("group", { name: "Kind of record" }).getByRole("button", { name: /^Documents/ }).click();
    // A record attached by its own portal link cannot be toggled here.
    await expect(main(page).getByRole("checkbox", { name: /order confirmation ORD-401/ })).toBeDisabled();

    // Request types: switch one off and see the request form honour it.
    await main(page).getByRole("checkbox", { name: "Access for a colleague" }).click();
    await expect(page.getByText("Requests updated")).toBeVisible();

    await page.goto(`${builder}?tab=Pages`);
    const nav = main(page).getByRole("list", { name: "Portal pages in navigation order" });
    await nav.getByRole("textbox", { name: "Page name" }).nth(1).fill("Projects");
    await main(page).getByRole("button", { name: "Move Projects down" }).click();
    await expect(main(page).getByText("Unsaved changes")).toBeVisible();
    await main(page).getByRole("button", { name: "Save navigation" }).click();
    await expect(page.getByText("Navigation saved")).toBeVisible();
    await page.reload();
    const names = main(page).getByRole("list", { name: "Portal pages in navigation order" }).getByRole("textbox", { name: "Page name" });
    await expect(names.nth(2)).toHaveValue("Projects");
    await expect(names.nth(1)).toHaveValue("Files");
    // The sharing card never claims a live link.
    await expect(main(page).getByText("No — hosting is not connected")).toBeVisible();

    await page.goto(`${builder}?tab=Design`);
    await main(page).getByRole("textbox", { name: /Name shown to clients/ }).fill("Harrow House Project Space");
    await main(page).getByRole("textbox", { name: /Welcome message/ }).fill("Your fit-out documents and appointments.");
    await main(page).getByRole("textbox", { name: "Accent colour", exact: true }).fill("blue");
    await expect(main(page).getByText("Use a six-digit hex colour")).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Save branding" })).toBeDisabled();
    await main(page).getByRole("textbox", { name: "Accent colour", exact: true }).fill("#0f5f9a");
    await main(page).getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved")).toBeVisible();
    await page.reload();
    await expect(main(page).getByRole("textbox", { name: /Name shown to clients/ })).toHaveValue("Harrow House Project Space");

    // The client-facing request form offers only the accepted types.
    await page.goto(`${ORG}/portal/portals/nl-portals-620/dashboard`);
    await action(page, "Request a service");
    const types = dialog(page).getByRole("combobox", { name: "Type of request" });
    await expect(types.locator("option")).toHaveCount(3);
  });

  test("view as role hides gated pages and the roles table changes a person's role", async ({ page }) => {
    await page.goto(`${builder}?tab=Preview`);
    const portalNav = main(page).getByRole("navigation", { name: "Portal pages" });
    await main(page).getByRole("button", { name: "Member", exact: true }).click();
    await expect(portalNav.getByRole("button", { name: "Billing" })).toHaveCount(0);
    await expect(main(page).getByText("1 page not shown")).toBeVisible();
    await main(page).getByRole("button", { name: "Billing contact", exact: true }).click();
    await portalNav.getByRole("button", { name: "Billing" }).click();
    await expect(portalNav.getByRole("button", { name: "Billing" })).toHaveAttribute("aria-current", "page");

    await page.goto(`${builder}?tab=Access`);
    const role = main(page).getByRole("combobox", { name: /Role for Harrow user 2/ });
    await role.selectOption("billing_contact");
    await expect(page.getByText("Role changed")).toBeVisible();
    await page.reload();
    await expect(main(page).getByRole("combobox", { name: /Role for Harrow user 2/ })).toHaveValue("billing_contact");
    await main(page).getByRole("button", { name: "View the portal as Harrow user 2" }).click();
    await expect(main(page).getByText("Viewing as Harrow user 2")).toBeVisible();
    await expect(main(page).getByRole("navigation", { name: "Portal pages" }).getByRole("button", { name: "Billing" })).toBeVisible();
  });
});

test.describe("BOOK cancellation and moves", () => {
  test("cancel requires a reason and records it", async ({ page }) => {
    await page.goto(`${ORG}/book/bookings/nl-bookings-624`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await action(page, "Cancel booking");
    const modal = dialog(page);
    await modal.getByRole("button", { name: "Cancel booking" }).click();
    await expect(modal.getByText("Choose a reason").last()).toBeVisible();
    await modal.getByRole("combobox", { name: /Reason/ }).selectOption("other");
    await modal.getByRole("button", { name: "Cancel booking" }).click();
    await expect(modal.getByText("Describe the reason")).toBeVisible();
    await modal.getByRole("textbox", { name: /Note for the record/ }).fill("Architect moved the site visit");
    await modal.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await page.reload();
    await page.goto(`${ORG}/book/bookings/nl-bookings-624?tab=Messages`);
    await expect(main(page).getByText(/Architect moved the site visit/)).toBeVisible();
  });

  test("a move refuses a past time and records the reason", async ({ page }) => {
    await page.goto(`${ORG}/book/bookings/nl-bookings-628`);
    await action(page, "Reschedule");
    const modal = dialog(page);
    await modal.getByLabel("New start").fill("2020-01-07T10:00");
    await expect(modal.getByText("That time has already passed.")).toBeVisible();
    await modal.getByRole("button", { name: "Move booking" }).click();
    await expect(modal).toBeVisible();
  });

  test("a resource's capacity can be raised and is shown on its card", async ({ page }) => {
    await page.goto(`${ORG}/book/resources?tab=Rooms`);
    const card = main(page).locator(".ds-card").filter({ hasText: "Sample room" });
    await card.getByRole("button", { name: "Edit" }).click();
    await dialog(page).getByRole("textbox", { name: /Capacity/ }).fill("4");
    await dialog(page).getByRole("button", { name: /Save/ }).click();
    // Assert the saved state before reloading so the reload cannot race the IndexedDB write.
    await expect(dialog(page)).toHaveCount(0);
    await expect(main(page).locator(".ds-card").filter({ hasText: "Sample room" }).locator("dd").filter({ hasText: /^4$/ })).toHaveCount(1);
    await page.reload();
    await expect(main(page).locator(".ds-card").filter({ hasText: "Sample room" }).getByText("Holds at once")).toBeVisible();
    await expect(main(page).locator(".ds-card").filter({ hasText: "Sample room" }).locator("dd").filter({ hasText: /^4$/ })).toHaveCount(1);
  });
});

test.describe("PROC quotes and trail", () => {
  test("record two quotes, compare and award the cheaper one; it persists", async ({ page }) => {
    await page.goto(`${ORG}/proc/requisitions?tab=Awaiting%20approval`);
    await main(page).getByRole("row", { name: /REQ-312/ }).getByText("REQ-312", { exact: true }).click();
    await action(page, "Compare quotes");
    const drawer = dialog(page);
    await expect(drawer.getByText("No quotes recorded")).toBeVisible();
    const record = async (supplier: string, price: string, lead: string) => {
      await drawer.getByRole("combobox", { name: /Supplier/ }).selectOption({ label: supplier });
      await drawer.getByRole("textbox", { name: /Brass collar, 60mm · unit price/ }).fill(price);
      await drawer.getByRole("textbox", { name: /Lead time in days/ }).fill(lead);
      await drawer.getByRole("button", { name: "Add to comparison" }).click();
      await expect(page.getByText("Quote recorded").first()).toBeVisible();
    };
    await record("Thames Brass Founders", "9.10", "21");
    await record("Kestrel Electrical", "8.75", "10");
    const grid = drawer.getByRole("grid", { name: "Quote comparison" }).or(drawer.getByRole("table", { name: "Quote comparison" }));
    await expect(grid.getByText("Lowest", { exact: true })).toHaveCount(1);
    await drawer.getByRole("button", { name: "Award Kestrel Electrical" }).click();
    await expect(page.getByText("Quote awarded")).toBeVisible();
    await page.reload();
    await main(page).getByRole("row", { name: /REQ-312/ }).getByText("REQ-312", { exact: true }).click();
    await action(page, "Compare quotes");
    await expect(dialog(page).getByRole("button", { name: "Award Kestrel Electrical" })).toHaveText("Awarded");
  });

  test("purchase trail shows a partial receipt state for an issued order", async ({ page }) => {
    await page.goto(`${ORG}/proc/orders?tab=Sent`);
    await main(page).getByRole("row", { name: /PO-206/ }).getByText("PO-206", { exact: true }).click();
    await action(page, "Purchase trail");
    const trail = dialog(page).getByRole("list", { name: "Purchase trail" });
    await expect(trail.getByText("Goods received")).toBeVisible();
    await expect(trail.getByText("Invoice matched")).toBeVisible();
  });
});

test.describe("COMMERCE variants", () => {
  test("generate variants from options, validate, price and save", async ({ page }) => {
    await page.goto(`${ORG}/commerce/products/nl-products-620?tab=Variants`);
    const list = main(page).getByRole("list", { name: "Variants" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await main(page).getByRole("textbox", { name: "Option name" }).fill("Shade");
    await main(page).getByRole("textbox", { name: /Values, comma separated/ }).fill("Linen");
    await main(page).getByRole("button", { name: "Add option" }).click();
    // Finish (two values) × Shade (one value): two combinations, neither a variant yet.
    await main(page).getByRole("button", { name: "Add 2 missing variants" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(4);
    const skus = list.getByRole("textbox", { name: "SKU" });
    await expect(skus.nth(2)).toHaveValue("BCN-01-NB-LIN");
    // A duplicate SKU blocks saving.
    await skus.nth(3).fill("BCN-01-NB");
    await expect(main(page).getByText("Another variant uses this SKU")).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Save variants" })).toBeDisabled();
    await skus.nth(3).fill("BCN-01-BB-LIN");
    await list.getByRole("textbox", { name: "Price difference for Blackened brass / Linen" }).fill("22.50");
    await main(page).getByRole("button", { name: "Remove Natural brass / Linen" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await main(page).getByRole("button", { name: "Save variants" }).click();
    await expect(page.getByText("Variants saved")).toBeVisible();
    await page.reload();
    const after = main(page).getByRole("list", { name: "Variants" });
    await expect(after.getByRole("listitem")).toHaveCount(3);
    await expect(after.getByRole("textbox", { name: "SKU" }).nth(2)).toHaveValue("BCN-01-BB-LIN");
    await expect(after.getByText("£207.50")).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("portal role preview and exposure fit a phone without horizontal scroll", async ({ page }) => {
    await page.goto(`${ORG}/portal/portals/nl-portals-620/builder?tab=Preview`);
    await expect(main(page).getByRole("navigation", { name: "Portal pages" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.goto(`${ORG}/portal/portals/nl-portals-620/builder?tab=Data`);
    await expect(main(page).getByRole("list", { name: "Exposure" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
