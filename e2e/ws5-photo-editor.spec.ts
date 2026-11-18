import { expect, test, type Page } from "@playwright/test";

/* WS5 — the raster editor opens a real file, turns and mirrors the whole
   image on the undo stack, compares before and after, and writes a PNG. */

async function createPhoto(page: Page): Promise<string> {
  await page.goto("/o/northline/photo/photos");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const modelPath = "/src/applications/photo/model.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/photo/model");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "photos", currency: "GBP",
      title: "WS5 raster check", status: "active", body: model.starterPhoto("WS5 raster check", 900, 600),
      fields: { kind: "image", width: 900, height: 600 },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  const url = `/o/northline/photo/photos/${id}`;
  await page.goto(url);
  return url;
}

/** A real 40 × 20 PNG made by the browser's own encoder. */
async function pngBytes(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40; canvas.height = 20;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = "#2980b9"; ctx.fillRect(20, 0, 20, 20);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test("open a photo, rotate and undo, compare, export a PNG and reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = await createPhoto(page);
  const main = page.locator("#main");
  await expect(main.getByText("900 × 600 · 1 layers")).toBeVisible();

  await main.getByLabel("Photo file to open").setInputFiles({ name: "swatch.png", mimeType: "image/png", buffer: await pngBytes(page) });
  await expect(main.getByRole("list", { name: "Layers, topmost first" })).toContainText("swatch.png");
  await expect(main.getByText(/40 × 20 · 2 layers/)).toBeVisible();

  await main.getByRole("button", { name: "Rotate the image 90° right" }).click();
  await expect(main.getByText(/20 × 40 · 2 layers/)).toBeVisible();
  await main.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect(main.getByText(/40 × 20 · 2 layers/)).toBeVisible();
  await main.getByRole("button", { name: "Flip the image horizontally" }).click();

  const before = main.getByRole("button", { name: "Before", exact: true });
  await before.click();
  await expect(before).toHaveAttribute("aria-pressed", "true");
  await before.click();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "PNG", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/40x20\.png$/);

  await expect(main.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.goto(url);
  await expect(main.getByRole("list", { name: "Layers, topmost first" })).toContainText("swatch.png");
  await expect(main.getByText(/40 × 20 · 2 layers/)).toBeVisible();
});

test("the raster editor fits a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPhoto(page);
  const main = page.locator("#main");
  await expect(main.getByRole("application", { name: /Image canvas/ })).toBeVisible();
  const box = (await main.getByRole("application", { name: /Image canvas/ }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
