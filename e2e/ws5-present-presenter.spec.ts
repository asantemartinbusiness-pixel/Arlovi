import { expect, test, type Page } from "@playwright/test";

/* WS5 — presenting is driven from the keyboard, the audience display can be
   blanked and ended, and slides reorder by dragging and stay reordered. */

async function copyDeck(page: Page): Promise<string> {
  await page.goto("/o/northline/present/decks/nl-decks-320");
  await expect.poll(() => page.locator("#main .px-thumb-row").count()).toBeGreaterThan(2);
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const dbPath = "/src/runtime/db.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const { db } = await import(/* @vite-ignore */ dbPath) as typeof import("../src/runtime/db");
    const source = await db.records.get("nl-decks-320");
    if (!source?.body) throw new Error("The seeded deck has no body");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "WS5 presenter check", status: "active", body: source?.body, fields: { folder: "Marketing" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  return id;
}

test("keyboard drives the presenter view and the audience display", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyDeck(page);
  await page.goto(`/o/northline/present/decks/${id}/present?tab=Presenter`);
  const main = page.locator("#main");
  const position = main.getByText(/^Slide \d+ of \d+$/).first();
  await expect(position).toHaveText(/^Slide 1 of (\d+)$/);
  const total = Number((await position.textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(2);

  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText(`Slide 2 of ${total}`);
  await page.keyboard.press("End");
  await expect(position).toHaveText(`Slide ${total} of ${total}`);
  await page.keyboard.press("2");
  await page.keyboard.press("Enter");
  await expect(position).toHaveText(`Slide 2 of ${total}`);
  await page.keyboard.press("Home");
  await expect(position).toHaveText(`Slide 1 of ${total}`);

  await main.getByRole("button", { name: "Audience display" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("The audience screen is extended, not mirrored").check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  const audience = page.getByRole("region", { name: "Audience display" });
  await expect(audience).toBeVisible();
  await page.keyboard.press("PageDown");
  await expect(page.getByText(new RegExp(`^Slide 2 of ${total}`))).toBeVisible();
  await page.keyboard.press("b");
  await expect(audience).toContainText("Screen blanked");
  await page.keyboard.press("b");
  await expect(audience).not.toContainText("Screen blanked");
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(audience).toHaveCount(0);
});

test("slides reorder by dragging and the order is kept", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyDeck(page);
  await page.goto(`/o/northline/present/decks/${id}`);
  const main = page.locator("#main");
  const rows = main.locator(".px-thumb-row");
  const first = (await rows.nth(0).locator(".px-thumb-label .ds-truncate").textContent())!;
  const second = (await rows.nth(1).locator(".px-thumb-label .ds-truncate").textContent())!;
  await rows.nth(0).dragTo(rows.nth(1));
  await expect(rows.nth(0).locator(".px-thumb-label .ds-truncate")).toHaveText(second);
  await expect(rows.nth(1).locator(".px-thumb-label .ds-truncate")).toHaveText(first);
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(main.locator(".px-thumb-row").nth(0).locator(".px-thumb-label .ds-truncate")).toHaveText(second);
});

test("the presenter view fits a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await copyDeck(page);
  await page.goto(`/o/northline/present/decks/${id}/present?tab=Presenter`);
  await expect(page.locator("#main").getByText(/^Slide 1 of \d+$/).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
