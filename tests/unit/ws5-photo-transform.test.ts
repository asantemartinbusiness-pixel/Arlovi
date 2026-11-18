import { describe, expect, it } from "vitest";
import { containBox, placePhoto, transformBlocked, transformImage } from "@/applications/photo/transform";
import type { PhotoLayer, RasterDoc } from "@/applications/photo/raster";

const pixel = (id: string, box: { x: number; y: number; w: number; h: number }, extra: Partial<PhotoLayer> = {}): PhotoLayer => ({
  id, name: id, kind: "pixel", visible: true, locked: false, opacity: 1, blend: "normal", rotation: 0, ...box, ...extra,
});

const doc = (layers: PhotoLayer[], width = 400, height = 200): RasterDoc => ({
  version: 2, width, height, layers, activeLayerId: layers[layers.length - 1].id,
  presets: [], profile: "sRGB", rights: { license: "Company-owned", credit: "" }, origin: "generated in-canvas", history: [],
} as unknown as RasterDoc);

describe("WS5 photo whole-image transforms", () => {
  it("a quarter turn swaps the canvas and carries each layer's centre", () => {
    const start = doc([pixel("a", { x: 0, y: 0, w: 100, h: 50 })]);
    const turned = transformImage(start, "rotate-cw");
    expect([turned.width, turned.height]).toEqual([200, 400]);
    const layer = turned.layers[0];
    /* Centre (50, 25) → (H - 25, 50) = (175, 50). */
    expect(layer.x + layer.w / 2).toBe(175);
    expect(layer.y + layer.h / 2).toBe(50);
    expect(layer.rotation).toBe(90);
  });

  it("four quarter turns and two flips return to the start", () => {
    const start = doc([pixel("a", { x: 10, y: 20, w: 100, h: 50 }, { rotation: 30 })]);
    let next = start;
    for (let turn = 0; turn < 4; turn += 1) next = transformImage(next, "rotate-cw");
    expect(next.layers[0]).toMatchObject({ x: 10, y: 20, rotation: 30 });
    const flipped = transformImage(transformImage(start, "flip-x"), "flip-x");
    expect(flipped.layers[0]).toMatchObject({ x: 10, y: 20, rotation: 30, flipX: false });
    const vertical = transformImage(transformImage(start, "flip-y"), "flip-y");
    expect(vertical.layers[0]).toMatchObject({ x: 10, y: 20, rotation: 30, flipX: false });
  });

  it("left and right turns cancel out", () => {
    const start = doc([pixel("a", { x: 30, y: 40, w: 60, h: 20 })]);
    const back = transformImage(transformImage(start, "rotate-cw"), "rotate-ccw");
    expect(back.layers[0]).toMatchObject({ x: 30, y: 40, rotation: 0 });
    expect([back.width, back.height]).toEqual([400, 200]);
  });

  it("turns masks with the image; only an undecodable mask blocks the turn", () => {
    /* W2E: masks are now redrawn for the new orientation, so a mask alone no longer blocks. */
    const masked = doc([pixel("a", { x: 0, y: 0, w: 1, h: 1 }, { mask: "data:", maskEnabled: true })]);
    expect(transformBlocked(masked)).toBeUndefined();
    expect(transformBlocked(masked, ["a"])).toMatch(/mask/);
    expect(transformBlocked(doc([pixel("a", { x: 0, y: 0, w: 1, h: 1 })]))).toBeUndefined();
  });

  it("fits a photo inside the canvas without enlarging it", () => {
    expect(containBox({ width: 800, height: 400 }, { width: 400, height: 400 })).toEqual({ x: 0, y: 100, w: 400, h: 200 });
    expect(containBox({ width: 40, height: 20 }, { width: 400, height: 400 })).toEqual({ x: 180, y: 190, w: 40, h: 20 });
  });

  it("places a photo beneath the adjustments, resizing a generated canvas to it", () => {
    const adjustment = { ...pixel("grade", { x: 0, y: 0, w: 0, h: 0 }), kind: "adjustment" } as PhotoLayer;
    const start = doc([pixel("base", { x: 0, y: 0, w: 400, h: 200 }), adjustment]);
    const placed = placePhoto(start, { id: "photo", name: "shot.jpg", src: "data:", width: 1200, height: 900 }, true);
    expect([placed.width, placed.height]).toEqual([1200, 900]);
    expect(placed.layers.map((layer) => layer.id)).toEqual(["base", "photo", "grade"]);
    expect(placed.layers[0]).toMatchObject({ w: 1200, h: 900 });
    expect(placed.activeLayerId).toBe("photo");
  });
});
