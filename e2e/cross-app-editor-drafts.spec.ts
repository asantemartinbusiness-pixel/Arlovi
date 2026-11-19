import { expect, test } from "@playwright/test";

test("CRM contact draft survives closing and reopening the form without a saved record", async ({ page }) => {
  await page.goto("/o/northline/crm/contacts?overlay=Contact+form");
  const form = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "Full name" }).fill("Draft contact — QA");
  await form.getByRole("textbox", { name: "Email" }).fill("draft-contact@example.test");
  await form.getByRole("button", { name: "Close & keep draft" }).click();
  await expect(form).toHaveCount(0);
  await page.locator("#main").getByRole("button", { name: "Create a contact" }).click();
  await expect(form.getByRole("textbox", { name: "Full name" })).toHaveValue("Draft contact — QA");
  await expect(form.getByRole("textbox", { name: "Email" })).toHaveValue("draft-contact@example.test");
  await form.getByRole("button", { name: "Discard draft" }).click();
  await page.locator("#main").getByRole("button", { name: "Create a contact" }).click();
  await expect(form.getByRole("textbox", { name: "Full name" })).toHaveValue("");
});

test("People position draft survives a closed modal", async ({ page }) => {
  await page.goto("/o/northline/hr/home?overlay=new+position");
  const dialog = page.getByRole("dialog", { name: "Open a position" });
  await expect(dialog).toBeVisible();
  const role = dialog.locator('#hr-position input').first();
  await role.fill("Platform experience designer — draft");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#main").getByRole("button", { name: "Start a hire" }).click();
  await expect(dialog.locator('#hr-position input').first()).toHaveValue("Platform experience designer — draft");
  await dialog.getByRole("button", { name: "Discard draft" }).click();
});

test("Docs creation retains title, folder and confidential toggle then discards cleanly", async ({ page }) => {
  await page.goto("/o/northline/docs/files?overlay=New+doc");
  const dialog = page.getByRole("dialog", { name: "New document" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Title" }).fill("Unfinished design brief — QA");
  await dialog.getByRole("combobox", { name: "Folder" }).selectOption("Proposals");
  await dialog.getByRole("checkbox", { name: /Confidential/ }).check();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#main").getByRole("button", { name: "New document" }).first().click();
  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Unfinished design brief — QA");
  await expect(dialog.getByRole("combobox", { name: "Folder" })).toHaveValue("Proposals");
  await expect(dialog.getByRole("checkbox", { name: /Confidential/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await page.locator("#main").getByRole("button", { name: "New document" }).first().click();
  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("");
});
