import { expect, test } from "@playwright/test";

/*
 * W2C — Company Brain collections (ARL-BRAIN-001): rename with validation, and
 * delete without deleting records — they move to "No collection".
 */

const HOME = "/o/northline/brain/home?clock=2026-11-14T09:30:00Z";

test("rename a collection, then delete it and keep its records under No collection", async ({ page }) => {
  await page.goto(HOME);
  const nav = page.getByRole("navigation", { name: "Knowledge collections" });
  const list = page.getByRole("region", { name: "Knowledge records" });
  await nav.getByRole("button", { name: /Trade and pricing/ }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // A duplicate name is refused.
  await nav.getByRole("button", { name: "Rename or edit" }).click();
  const form = nav.getByRole("form", { name: "Edit collection" });
  await form.getByLabel("Name").fill("customer care answers");
  await form.getByRole("button", { name: "Save collection" }).click();
  await expect(form.getByText("A collection with this name exists.")).toBeVisible();

  await form.getByLabel("Name").fill("Trade, pricing and terms");
  await form.getByLabel("Review every (days)").fill("30");
  await form.getByRole("button", { name: "Save collection" }).click();
  await expect(nav.getByRole("button", { name: /Trade, pricing and terms/ })).toBeVisible();
  await expect(nav.getByText("reviewed every 30 days")).toBeVisible();

  // Delete: the confirmation says what happens to the records.
  await nav.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = nav.getByRole("alertdialog", { name: /Delete Trade, pricing and terms/ });
  await expect(confirm.getByText(/move to No collection with their content, sources and review state unchanged\. No record is deleted\./)).toBeVisible();
  await confirm.getByRole("button", { name: "Delete collection" }).click();

  await expect(nav.getByRole("button", { name: /Trade, pricing and terms/ })).toHaveCount(0);
  const unfiled = nav.getByRole("button", { name: /No collection/ });
  await expect(unfiled).toHaveAttribute("aria-current", "true");
  await expect(list.getByRole("button", { name: /Answering a trade price question/ })).toBeVisible();

  // After a reload the records are still there, unfiled.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Knowledge collections" }).getByRole("button", { name: /Customer care answers/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Knowledge collections" }).getByRole("button", { name: /Trade/ })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Knowledge collections" }).getByRole("button", { name: /No collection/ }).click();
  await expect(page.getByRole("region", { name: "Knowledge records" }).getByRole("button", { name: /Answering a trade price question/ })).toBeVisible();
  await page.getByRole("region", { name: "Knowledge records" }).getByRole("button", { name: /Answering a trade price question/ }).click();
  await expect(page.getByRole("region", { name: "Knowledge record", exact: true }).getByText("None", { exact: true })).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("collection editing fits a phone", async ({ page }) => {
    await page.goto(HOME);
    const nav = page.getByRole("navigation", { name: "Knowledge collections" });
    await nav.getByRole("button", { name: /Operations procedures/ }).click();
    await nav.getByRole("button", { name: "Rename or edit" }).click();
    await expect(nav.getByRole("form", { name: "Edit collection" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test("resolving Saturday closing time leaves a current assertion in the Fact registry", async ({ page }) => {
  await page.goto("/o/northline/brain/conflicts?clock=2026-11-14T09:30:00Z");
  await page.getByRole("button", { name: "Choose the source of truth" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Saturday closing time" })).toBeVisible();
  await dialog.getByRole("radio", { name: /18:00/ }).check();
  await dialog.getByLabel("Why this one").fill("The location record was checked against the door sign.");
  await dialog.getByRole("button", { name: "Record the resolution" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/o/northline/brain/facts?clock=2026-11-14T09:30:00Z");
  await page.getByRole("tab", { name: "Verified" }).click();
  const row = page.getByRole("row", { name: /Saturday closing time/ });
  await expect(row).toContainText("18:00");
  await page.getByRole("tab", { name: "Conflicting" }).click();
  await expect(page.getByRole("row", { name: /Saturday closing time/ })).toHaveCount(0);
});
