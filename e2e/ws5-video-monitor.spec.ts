import { expect, test, type Page } from "@playwright/test";

/* WS5 — the video monitor keeps its transport on screen, trims are frame
   accurate and undoable, and the trimmed edit survives a reload. */

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
      title: "WS5 timeline check", status: "in_review", body: source.body, fields: { kind: "sequence", fps: 25 },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`the transport is reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const id = await copyVideo(page);
    await page.goto(`/o/northline/video/projects/${id}`);
    const main = page.locator("#main");
    const play = main.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeInViewport();
    const monitor = (await page.getByTestId("video-preview").boundingBox())!;
    const transport = (await play.boundingBox())!;
    expect(transport.y).toBeGreaterThanOrEqual(monitor.y + monitor.height - 1);
    await main.getByRole("button", { name: "Forward one frame" }).click();
    await expect(main.getByText("00:00:00:01").first()).toBeVisible();
  });
}

test("trim a clip by one frame, undo it, then keep a trim across a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await copyVideo(page);
  await page.goto(`/o/northline/video/projects/${id}`);
  const main = page.locator("#main");
  await main.getByText("Arc Lamp", { exact: true }).first().click();
  const clipPanel = main.getByRole("complementary", { name: "Clip" });
  await expect(clipPanel).toContainText("00:00:23:00");
  await clipPanel.getByRole("button", { name: "end +1" }).click();
  await expect(clipPanel).toContainText("00:00:23:01");
  await page.keyboard.press("Control+z");
  await expect(clipPanel).toContainText("00:00:23:00");
  await clipPanel.getByRole("button", { name: "end −1" }).click();
  await expect(clipPanel).toContainText("00:00:22:24");
  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await main.getByText("Arc Lamp", { exact: true }).first().click();
  await expect(main.getByRole("complementary", { name: "Clip" })).toContainText("00:00:22:24");
});
