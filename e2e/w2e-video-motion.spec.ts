import { expect, test, type Page } from "@playwright/test";

/* W2E — VIDEO: split and trim at the playhead from the keyboard, lock a
   track so its clips refuse edits, and edit caption cues on the timeline's
   caption lane; all of it survives a reload. */

async function copyVideo(page: Page): Promise<string> {
  await page.goto("/o/northline/video/projects/nl-videos-020");
  await expect(page.getByTestId("video-preview")).toBeVisible();
  return page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const dbPath = "/src/runtime/db.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const { db } = await import(/* @vite-ignore */ dbPath) as typeof import("../src/runtime/db");
    const source = await db.records.get("nl-videos-020");
    if (!source?.body) throw new Error("The seeded film has no body");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "videos", currency: "GBP",
      title: "W2E cut check", status: "in_review", body: source.body, fields: { kind: "sequence", fps: 25 },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
}

test("split and trim at the playhead, lock a track, and keep the cut across a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyVideo(page);
  await page.goto(`/o/northline/video/projects/${id}`);
  const main = page.locator("#main");
  const app = main.getByRole("application", { name: /Timeline and programme monitor/ });

  await main.getByRole("button", { name: /^Arc Lamp, / }).click();
  await app.focus();
  for (let second = 0; second < 12; second += 1) await page.keyboard.press("Shift+ArrowRight");
  await expect(main.getByText("00:00:12:00").first()).toBeVisible();
  await page.keyboard.press("s");
  await expect(main.getByRole("button", { name: /^Arc Lamp, 00:00:12:00 to / })).toBeVisible();

  /* The right half is selected; Q trims its head to the playhead two seconds on. */
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("q");
  await expect(main.getByRole("button", { name: /^Arc Lamp, 00:00:14:00 to / })).toBeVisible();

  /* Lock the picture track: the clips on it refuse a split. */
  await main.getByRole("button", { name: "Lock Picture" }).click();
  await expect(main.getByRole("button", { name: "Unlock Picture" })).toHaveAttribute("aria-pressed", "true");
  await app.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("s");
  await expect(page.getByText("Nothing to split").first()).toBeVisible();
  await expect(main.getByRole("complementary", { name: "Clip" }).getByText(/Picture track is locked/)).toBeVisible();

  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(main.getByRole("button", { name: /^Arc Lamp, 00:00:14:00 to / })).toBeVisible();
  await expect(main.getByRole("button", { name: "Unlock Picture" })).toBeVisible();
});

test("edit a caption cue on the timeline's caption lane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyVideo(page);
  await page.goto(`/o/northline/video/projects/${id}`);
  const main = page.locator("#main");
  const lane = main.getByRole("group", { name: "Caption cues, en" });
  const first = lane.getByRole("button").first();
  await first.click();
  const panel = main.getByRole("complementary", { name: "Captions" });
  await expect(panel.getByText("Selected cue")).toBeVisible();
  const text = panel.getByLabel("Selected cue text");
  await text.fill("Edited on the caption lane.");
  await text.blur();
  await expect(lane.getByRole("button", { name: /Edited on the caption lane\./ })).toBeVisible();

  const label = await lane.getByRole("button", { name: /Edited on the caption lane\./ }).getAttribute("aria-label");
  await panel.getByRole("button", { name: "out −1" }).click();
  await expect(lane.getByRole("button", { name: /Edited on the caption lane\./ })).not.toHaveAttribute("aria-label", label!);

  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(main.getByRole("group", { name: "Caption cues, en" }).getByRole("button", { name: /Edited on the caption lane\./ })).toBeVisible();
});

test("the caption lane and cut tools fit a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await copyVideo(page);
  await page.goto(`/o/northline/video/projects/${id}`);
  const main = page.locator("#main");
  await expect(main.getByRole("button", { name: "Split at the playhead (S)" })).toBeVisible();
  await expect(main.getByRole("group", { name: "Caption cues, en" })).toBeAttached();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
