import { expect, test } from "@playwright/test";

test("CRM identifies a tab-only draft, restores it, and clears the header count on discard", async ({ page }) => {
  await page.goto("/o/northline/crm/contacts?overlay=Contact+form");
  const dialog = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(dialog).toBeVisible();
  const status = dialog.locator(".arl-draft-status");
  await expect(status).toContainText("No temporary draft");

  await dialog.getByRole("textbox", { name: "Full name" }).fill("Unsaved test customer");
  await expect(status).toContainText("Kept in this tab only");
  await expect(status).toContainText("not saved to the record");
  await expect(page.locator(".arl-draft-counter")).toContainText("1 draft");

  await dialog.getByRole("button", { name: "Close & keep draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".arl-draft-counter")).toContainText("1 draft");
  await page.locator("#main").getByRole("button", { name: "Create a contact" }).click();
  await expect(dialog.getByRole("textbox", { name: "Full name" })).toHaveValue("Unsaved test customer");
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.locator(".arl-draft-counter")).toHaveCount(0);
});

test("Finance new-invoice working state is not presented as a saved invoice", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?overlay=New+invoice");
  const dialog = page.getByRole("dialog", { name: "New invoice" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "First line" }).fill("Unsaved test invoice");
  await expect(dialog.locator(".arl-draft-status")).toContainText("not saved to the record");
  await expect(page.locator(".arl-draft-counter")).toContainText("1 draft");
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.locator(".arl-draft-counter")).toHaveCount(0);
});
