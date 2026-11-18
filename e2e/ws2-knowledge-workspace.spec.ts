import { expect, test, type Page } from "@playwright/test";

/*
 * WS2 — Company Brain knowledge workspace (ARL-BRAIN-001 Overview).
 * Drives collections, search, the record editor, the review workflow and
 * persistence across a reload, then the narrow single-column layout.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const HOME = `/o/northline/brain/home?${CLOCK}`;

async function openHome(page: Page) {
  await page.goto(HOME);
  await expect(page.getByRole("heading", { level: 1, name: "Knowledge home" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Knowledge records" }).getByRole("button", { name: /Shade warranty: what we cover/ })).toBeVisible();
}

test("search, filter and the model-generated verification guard", async ({ page }) => {
  await openHome(page);
  const list = page.getByRole("region", { name: "Knowledge records" });

  await list.getByRole("searchbox", { name: "Search knowledge" }).fill("warranty shades");
  await expect(list.getByRole("button", { name: /Shade warranty/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Receiving a brass delivery/ })).toHaveCount(0);
  await list.getByRole("button", { name: "Clear" }).click();

  await list.getByRole("combobox", { name: "Provenance" }).selectOption("model_generated");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await list.getByRole("button", { name: /Answering a trade price question/ }).click();

  const detail = page.getByRole("region", { name: "Knowledge record", exact: true });
  await expect(detail.getByText("Model-generated text cannot be verified until it cites at least one source")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Verify", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/record=nl-knowledge-003/);

  // A collection narrows the list; archived records stay out of the active list.
  await list.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("navigation", { name: "Knowledge collections" }).getByRole("button", { name: /Trade and pricing/ }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await list.getByRole("combobox", { name: "Status" }).selectOption("archived");
  await expect(list.getByRole("button", { name: /Retail prices including VAT/ })).toBeVisible();
});

test("create, review, verify and re-review a record; it persists across a reload", async ({ page }) => {
  await openHome(page);

  // New collection.
  const nav = page.getByRole("navigation", { name: "Knowledge collections" });
  await nav.getByRole("button", { name: "New" }).click();
  const colForm = nav.getByRole("form", { name: "New collection" });
  await colForm.getByLabel("Name").fill("Showroom returns");
  await colForm.getByLabel("Review every (days)").fill("30");
  await colForm.getByRole("button", { name: "Create collection" }).click();
  await expect(nav.getByRole("button", { name: /Showroom returns/ })).toHaveAttribute("aria-current", "true");

  // New record with a cited source and a related link.
  await page.getByRole("button", { name: "New record" }).click();
  const editor = page.getByRole("form", { name: "New knowledge record" });
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor.getByText("Give the record a title.")).toBeVisible();
  await editor.getByLabel("Title").fill("Returns window for showroom sales");
  await editor.getByLabel("Summary").fill("Showroom purchases can be returned within 30 days.");
  await editor.getByLabel("Content").fill("Accept a return within 30 days of purchase with proof of purchase.\nShades must be unused.");
  await editor.getByLabel("Tags").fill("returns, showroom");
  await editor.getByRole("button", { name: "Cite a source" }).click();
  await editor.getByRole("combobox", { name: "Source 1" }).selectOption({ label: "Customer care article set" });
  await editor.getByLabel("Page or section").fill("Article 7");
  await editor.getByRole("combobox", { name: "Record to link" }).selectOption({ label: "Shade warranty: what we cover" });
  await editor.getByRole("button", { name: "Link", exact: true }).click();
  await editor.getByRole("button", { name: "Save draft" }).click();

  const detail = page.getByRole("region", { name: "Knowledge record", exact: true });
  await expect(detail.getByRole("heading", { name: "Returns window for showroom sales" })).toBeVisible();
  await expect(detail.getByText("Draft", { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: /Customer care article set/ })).toBeVisible();
  await expect(detail.getByRole("button", { name: /Shade warranty: what we cover/ })).toBeVisible();

  // Request a review, then verify it.
  await detail.getByRole("button", { name: "Request review" }).click();
  const request = detail.getByRole("form", { name: "Request a review" });
  await request.getByRole("combobox", { name: "Reviewer" }).selectOption("Maya Chen");
  await request.getByRole("button", { name: "Send for review" }).click();
  await expect(detail.getByText("Needs review", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(detail.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(detail.getByRole("listitem").filter({ hasText: "Review requested" })).toBeVisible();

  // Reload: the record, its status and its history come back from storage.
  await page.reload();
  const reloaded = page.getByRole("region", { name: "Knowledge record", exact: true });
  await expect(reloaded.getByRole("heading", { name: "Returns window for showroom sales" })).toBeVisible();
  await expect(reloaded.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(reloaded.getByRole("listitem").filter({ hasText: /Verified · / })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Knowledge collections" }).getByRole("button", { name: /Showroom returns/ })).toBeVisible();

  // Editing the substance of a verified record sends it back to review.
  await reloaded.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: /Edit Returns window/ });
  await edit.getByLabel("Content").fill("Accept a return within 14 days of purchase with proof of purchase.");
  await expect(edit.getByText("You changed what was verified.")).toBeVisible();
  await edit.getByRole("button", { name: "Save and return to review" }).click();
  await expect(reloaded.getByText("Needs review", { exact: true })).toBeVisible();
  await expect(reloaded.getByText("Accept a return within 14 days")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Knowledge record", exact: true }).getByText("Needs review", { exact: true })).toBeVisible();
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("list and record take turns on a phone", async ({ page }) => {
    await openHome(page);
    const list = page.getByRole("region", { name: "Knowledge records" });
    await list.getByRole("button", { name: /Receiving a brass delivery/ }).click();
    const detail = page.getByRole("region", { name: "Knowledge record", exact: true });
    await expect(detail.getByRole("heading", { name: "Receiving a brass delivery" })).toBeVisible();
    await expect(list).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await detail.getByRole("button", { name: "All records" }).click();
    await expect(list).toBeVisible();
  });
});
