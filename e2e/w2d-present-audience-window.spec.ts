import { expect, test, type Page } from "@playwright/test";

/* W2D — two-window presenting: the presenter window opens a second audience
   window that follows it over a BroadcastChannel, and the audience window's
   keyboard steps the presentation back in the presenter window. */

async function copyDeck(page: Page): Promise<string> {
  await page.goto("/o/northline/present/decks/nl-decks-320");
  await expect.poll(() => page.locator("#main .px-thumb-row").count()).toBeGreaterThan(2);
  return page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const dbPath = "/src/runtime/db.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const { db } = await import(/* @vite-ignore */ dbPath) as typeof import("../src/runtime/db");
    const source = await db.records.get("nl-decks-320");
    if (!source?.body) throw new Error("The seeded deck has no body");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "W2D audience window", status: "active", body: source.body, fields: { folder: "Marketing" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
}

test("the audience window follows the presenter and drives it back", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyDeck(page);
  await page.goto(`/o/northline/present/decks/${id}/present?tab=Presenter`);
  const main = page.locator("#main");
  const position = main.getByText(/^Slide \d+ of \d+$/).first();
  await expect(position).toHaveText(/^Slide 1 of (\d+)$/);
  const total = Number((await position.textContent())!.match(/of (\d+)/)![1]);

  const [audience] = await Promise.all([
    context.waitForEvent("page"),
    main.getByRole("button", { name: "Open audience window" }).click(),
  ]);
  await audience.waitForLoadState();
  expect(new URL(audience.url()).searchParams.get("display")).toBe("window");
  const region = audience.getByRole("region", { name: "Audience window" });
  await expect(region).toBeVisible();
  const audiencePosition = audience.getByTestId("audience-window-position");
  await expect(audiencePosition).toHaveText(`Slide 1 of ${total}`);
  await expect(main.getByText("Audience window connected")).toBeVisible();
  // Speaker notes never reach the room.
  await expect(region.locator(".px-notes")).toHaveCount(0);

  // Presenter keyboard → audience window.
  await page.bringToFront();
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText(`Slide 2 of ${total}`);
  await expect(audiencePosition).toHaveText(`Slide 2 of ${total}`);

  // Audience keyboard → presenter window.
  await audience.bringToFront();
  await audience.locator("body").press("ArrowRight");
  await expect(position).toHaveText(`Slide 3 of ${total}`);
  await expect(audiencePosition).toHaveText(`Slide 3 of ${total}`);
  await audience.locator("body").press("Home");
  await expect(position).toHaveText(`Slide 1 of ${total}`);

  // Blanking from the presenter blanks the other window.
  await page.bringToFront();
  await main.getByRole("button", { name: "Blank (B)" }).click();
  await expect(region).toContainText("Screen blanked");
  await main.getByRole("button", { name: "Show slide" }).click();
  await expect(region).not.toContainText("Screen blanked");

  // A reloaded audience window picks the session back up.
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText(`Slide 2 of ${total}`);
  await audience.reload();
  await expect(audience.getByTestId("audience-window-position")).toHaveText(`Slide 2 of ${total}`);

  // Closing it from the presenter ends the link.
  await main.getByRole("button", { name: "Close audience window" }).click();
  await expect(main.getByRole("button", { name: "Open audience window" })).toBeVisible();
});

test("phone-width presenter view offers the audience window without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await copyDeck(page);
  await page.goto(`/o/northline/present/decks/${id}/present?tab=Presenter`);
  const main = page.locator("#main");
  await expect(main.getByRole("button", { name: "Open audience window" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
