import { expect, test, type Page } from "@playwright/test";

/*
 * A3 refinement: the seller-facing deal drawer, the contact and booking record
 * pages, and the quote editor deep link that used to crash the screen.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const go = (page: Page, path: string) => page.goto(`/o/northline${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);

test("quote editor opens from a deep link without crashing the screen", async ({ page }) => {
  await go(page, "/crm/quotes?overlay=Quote%20editor");
  await expect(page.getByRole("dialog", { name: "Quote" })).toBeVisible();
  await expect(page.getByText("This screen could not be shown")).toHaveCount(0);
  await expect(page.getByLabel("Quote number")).toHaveValue(/^Q-\d+$/);
});

test("deal drawer is a form-width panel with weighted value and account context", async ({ page }) => {
  await go(page, "/crm/deals");
  await page.getByRole("button", { name: /Details/ }).nth(4).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("What it is worth")).toBeVisible();
  await expect(drawer.getByText("Weighted value")).toBeVisible();
  await expect(drawer.getByText("Recent activity")).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(540);
  await expect(drawer.getByRole("button", { name: "Save the deal" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close & keep draft" })).toBeVisible();
});

test("contact record has one identity block and the consent status", async ({ page }) => {
  await go(page, "/crm/contacts/nl-contacts-001");
  await expect(page.getByRole("heading", { level: 1, name: "Amina Rahman" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next actions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible();
});

test("booking record separates a requested deposit from a received one", async ({ page }) => {
  await go(page, "/book/home?tab=Week");
  await page.getByText("Harrow House · specification").first().dblclick();
  await expect(page).toHaveURL(/\/book\/bookings\//);
  const deposit = page.locator("#main").getByRole("heading", { name: "Deposit" }).locator("xpath=ancestor::*[contains(@class,'pk-section')][1]");
  await expect(deposit.getByText("Requested", { exact: true }).first()).toBeVisible();
  await expect(deposit.getByText("Not received")).toBeVisible();
});
