import { expect, test, type Page } from "@playwright/test";

/* W2E — LAYOUT: several frames selected at once are aligned, distributed and
   moved together; a frame turns with its rotate handle; both survive a reload.
   PHOTO: a masked image turns and mirrors with its mask, which keeps hiding
   the same part of the picture. */

async function createPublication(page: Page): Promise<string> {
  await page.goto("/o/northline/layout/publications");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const modelPath = "/src/applications/layout/model.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/layout/model");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const doc = model.starterPublication("W2E multi-select check");
    /* Three shapes at known places on the first page. */
    const shapes = [
      { id: "fr-w2e-a", kind: "shape" as const, box: { x: 60, y: 120, w: 80, h: 40 }, fill: "#234FE8" },
      { id: "fr-w2e-b", kind: "shape" as const, box: { x: 180, y: 220, w: 60, h: 60 }, fill: "#36C5BA" },
      { id: "fr-w2e-c", kind: "shape" as const, box: { x: 420, y: 160, w: 70, h: 30 }, fill: "#FFAE7C" },
    ];
    const body = { ...doc, pages: doc.pages.map((item, index) => (index === 0 ? { ...item, frames: [...item.frames, ...shapes] } : item)) };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "publications", currency: "GBP",
      title: "W2E multi-select check", status: "draft", body, fields: { kind: "publication" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  return `/o/northline/layout/publications/${id}`;
}

async function storedFrames(page: Page, id: string) {
  return page.evaluate(async (recordId) => {
    const dbPath = "/src/runtime/db.ts";
    const { db } = await import(/* @vite-ignore */ dbPath) as typeof import("../src/runtime/db");
    const record = await db.records.get(recordId);
    const body = record?.body as { pages: { frames: { id: string; box: { x: number; y: number; w: number; h: number }; rotation?: number }[] }[] };
    return body.pages.flatMap((item) => item.frames).filter((frame) => frame.id.startsWith("fr-w2e"));
  }, id);
}

test("select several frames, align and distribute them, turn one, and reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = await createPublication(page);
  const id = url.split("/").pop()!;
  await page.goto(url);
  const main = page.locator("#main");
  const layers = main.getByRole("list", { name: "Frames on this page, top first" });
  await expect(layers.getByRole("button", { name: /^Shape ·/ })).toHaveCount(3);

  /* Click one on the page, Shift-click the other two in the list. */
  await main.locator("[data-frame-id='fr-w2e-a']").click();
  await expect(main.locator("[data-selection='fr-w2e-a']")).toHaveCount(1);
  const shapeButtons = layers.getByRole("button", { name: /^Shape ·/ });
  await shapeButtons.nth(0).click({ modifiers: ["Shift"] });
  await shapeButtons.nth(1).click({ modifiers: ["Shift"] });
  await expect(main.getByText("3 frames selected")).toBeVisible();
  await expect(main.locator("[data-multiselect='3']")).toHaveCount(1);
  await expect(main.locator("[data-selection]")).toHaveCount(0);

  await main.getByRole("button", { name: "Align top" }).click();
  await main.getByRole("button", { name: "Distribute horizontally" }).click();
  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await storedFrames(page, id)).map((frame) => frame.box.y)).toEqual([120, 120, 120]);
  const spaced = (await storedFrames(page, id)).map((frame) => frame.box).sort((p, q) => p.x - q.x);
  expect(spaced[1].x - (spaced[0].x + spaced[0].w)).toBeCloseTo(spaced[2].x - (spaced[1].x + spaced[1].w), 3);

  /* Arrows move all three; one undo puts them back. */
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await storedFrames(page, id)).map((frame) => frame.box.y)).toEqual([130, 130, 130]);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await storedFrames(page, id)).map((frame) => frame.box.y)).toEqual([120, 120, 120]);

  /* Turn a single frame with its rotate handle, then set it exactly. */
  await page.keyboard.press("Escape");
  await main.locator("[data-frame-id='fr-w2e-b']").click();
  const knob = main.locator("[data-handle='rotate']");
  const kb = (await knob.boundingBox())!;
  const frameBox = (await main.locator("[data-frame-id='fr-w2e-b']").boundingBox())!;
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width + 80, frameBox.y + frameBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await main.getByLabel("Rotation (°)").inputValue())).toBeGreaterThan(45);
  await main.getByLabel("Rotation (°)").fill("30");
  await expect(main.locator("g[data-rotation='30'] [data-frame-id='fr-w2e-b']")).toHaveCount(1);

  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await storedFrames(page, id)).find((frame) => frame.id === "fr-w2e-b")?.rotation).toBe(30);
  await page.reload();
  await expect(main.locator("g[data-rotation='30'] [data-frame-id='fr-w2e-b']")).toHaveCount(1);
});

test("multi-selection works on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const url = await createPublication(page);
  await page.goto(url);
  const main = page.locator("#main");
  await expect(main.locator("svg[data-page-svg]").first()).toBeVisible();
  await main.getByRole("button", { name: "Show Pages" }).click();
  await main.getByRole("button", { name: "Select all (⌘A)" }).click();
  await expect(main.locator("[data-multiselect]")).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

/* ------------------------------ PHOTO ------------------------------ */

async function createMaskedPhoto(page: Page): Promise<string> {
  await page.goto("/o/northline/photo/photos");
  return page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const modelPath = "/src/applications/photo/model.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/photo/model");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const doc = model.starterPhoto("W2E mask check", 300, 200);
    /* A mask that hides the left half: black on the left, white on the right. */
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 200;
    const c2d = canvas.getContext("2d")!;
    c2d.fillStyle = "#000000"; c2d.fillRect(0, 0, 150, 200);
    c2d.fillStyle = "#ffffff"; c2d.fillRect(150, 0, 150, 200);
    const body = { ...doc, layers: doc.layers.map((layer) => ({ ...layer, mask: canvas.toDataURL("image/png"), maskEnabled: true })) };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "photos", currency: "GBP",
      title: "W2E mask check", status: "active", body, fields: { kind: "image", width: 300, height: 200 },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
}

/** Alpha of the composite at fractional points, computed by the editor's own compositor from the saved record. */
async function alphaAt(page: Page, id: string, points: [number, number][]) {
  return page.evaluate(async ({ recordId, at }) => {
    const dbPath = "/src/runtime/db.ts";
    const modelPath = "/src/applications/photo/model.ts";
    const jobsPath = "/src/applications/photo/jobs.ts";
    const rasterPath = "/src/applications/photo/raster.ts";
    const { db } = await import(/* @vite-ignore */ dbPath) as typeof import("../src/runtime/db");
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/photo/model");
    const jobs = await import(/* @vite-ignore */ jobsPath) as typeof import("../src/applications/photo/jobs");
    const raster = await import(/* @vite-ignore */ rasterPath) as typeof import("../src/applications/photo/raster");
    const record = await db.records.get(recordId);
    const doc = model.parsePhoto(record?.body);
    const { images, masks } = await jobs.loadBank(doc);
    const frame = raster.compositeImageData(doc, images, masks, {}, 400);
    return {
      size: [doc.width, doc.height],
      alpha: at.map(([fx, fy]) => frame.data[(Math.floor(fy * frame.height) * frame.width + Math.floor(fx * frame.width)) * 4 + 3]),
    };
  }, { recordId: id, at: points });
}

test("a masked image turns with its mask, and the mask keeps hiding the same pixels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createMaskedPhoto(page);
  const before = await alphaAt(page, id, [[0.25, 0.5], [0.75, 0.5]]);
  expect(before.alpha).toEqual([0, 255]);

  await page.goto(`/o/northline/photo/photos/${id}`);
  const main = page.locator("#main");
  await expect(main.getByText("300 × 200 · 1 layers")).toBeVisible();
  await main.getByRole("button", { name: "Rotate the image 90° right" }).click();
  await expect(main.getByText(/200 × 300 · 1 layers/)).toBeVisible();
  await expect(page.getByText("The image cannot be turned yet")).toHaveCount(0);
  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  /* The hidden left half is now the top half. */
  await expect.poll(async () => (await alphaAt(page, id, [[0.5, 0.25], [0.5, 0.75]])).alpha).toEqual([0, 255]);
  const turned = await alphaAt(page, id, [[0.5, 0.25], [0.5, 0.75]]);
  expect(turned.size).toEqual([200, 300]);

  await main.getByRole("button", { name: "Flip the image vertically" }).click();
  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await alphaAt(page, id, [[0.5, 0.25], [0.5, 0.75]])).alpha).toEqual([255, 0]);

  await page.reload();
  await expect(main.getByText(/200 × 300 · 1 layers/)).toBeVisible();
});
