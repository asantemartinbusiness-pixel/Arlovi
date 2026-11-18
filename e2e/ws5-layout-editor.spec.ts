import { expect, test, type Page } from "@playwright/test";

/* WS5 — the publication editor arranges real frames: place, select, nudge,
   align, resize from a handle, undo, change the page grid, and reopen. */

async function createPublication(page: Page): Promise<string> {
  await page.goto("/o/northline/layout/publications");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const modelPath = "/src/applications/layout/model.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/layout/model");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "publications", currency: "GBP",
      title: "WS5 arranging check", status: "draft", body: model.starterPublication("WS5 arranging check"),
      fields: { kind: "publication" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  const url = `/o/northline/layout/publications/${id}`;
  await page.goto(url);
  return url;
}

const geometry = (page: Page, key: "X" | "Y" | "W" | "H") => page.getByLabel(key, { exact: true });

test("place, nudge, align, resize and undo a frame, then reopen it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = await createPublication(page);
  const main = page.locator("#main");

  await main.getByRole("button", { name: "Shape (R)" }).click();
  const pageSvg = main.locator("svg[data-page-svg]").first();
  const bounds = (await pageSvg.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);

  const layers = main.getByRole("list", { name: "Frames on this page, top first" });
  await expect(layers.getByRole("button", { name: /^Shape ·/ })).toBeVisible();
  await expect(main.locator("[data-selection]")).toHaveCount(1);

  const startX = Number(await geometry(page, "X").inputValue());
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => Number(await geometry(page, "X").inputValue())).toBeCloseTo(startX + 3.5, 0);

  await main.getByRole("button", { name: "Align left" }).click();
  await expect(geometry(page, "X")).toHaveValue("20");

  const widthBefore = Number(await geometry(page, "W").inputValue());
  const handle = main.locator("[data-handle='e']");
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await geometry(page, "W").inputValue())).toBeGreaterThan(widthBefore + 5);

  await main.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect.poll(async () => Number(await geometry(page, "W").inputValue())).toBeCloseTo(widthBefore, 0);

  await main.getByRole("tab", { name: "Layout" }).click();
  await main.getByLabel("Columns", { exact: true }).fill("3");
  await expect(main.getByText(/Each column is/)).toBeVisible();

  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.goto(url);
  await expect(main.getByRole("list", { name: "Frames on this page, top first" }).getByRole("button", { name: /^Shape ·/ })).toBeVisible();
  await main.getByRole("tab", { name: "Layout" }).click();
  await expect(main.getByLabel("Columns", { exact: true })).toHaveValue("3");
});

test("text frames carry their own copy and the page exports as SVG", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createPublication(page);
  const main = page.locator("#main");
  await main.getByRole("button", { name: "Text frame (T)" }).click();
  const bounds = (await main.locator("svg[data-page-svg]").first().boundingBox())!;
  await page.mouse.click(bounds.x + 40, bounds.y + bounds.height * 0.7);
  const copy = main.getByLabel("Frame copy");
  await copy.fill("Spring catalogue\nNew finishes arrive in March.");
  await copy.blur();
  await expect(main.getByRole("list", { name: "Frames on this page, top first" }).getByRole("button", { name: "Text · Spring catalogue", exact: true })).toBeVisible();
  await expect(main.locator("svg[data-page-svg] text", { hasText: "Spring catalogue" })).toBeVisible();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "SVG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/page-1\.svg$/);

  await page.keyboard.press("Escape");
  await main.getByRole("button", { name: "Text · Spring catalogue", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(main.getByRole("button", { name: "Text · Spring catalogue", exact: true })).toHaveCount(0);
});

test("the editor works on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPublication(page);
  const main = page.locator("#main");
  await expect(main.locator("svg[data-page-svg]").first()).toBeVisible();
  await main.getByRole("button", { name: "Show Pages" }).click();
  await expect(main.getByRole("list", { name: "Frames on this page, top first" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
