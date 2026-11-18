import { describe, expect, it } from "vitest";
import { apply } from "@/applications/visual/geometry";
import { frameMatrix, frameOf, luminanceToAlpha, maskFollowMatrix, maskPlacement, withMaskFrames } from "@/applications/photo/maskSpace";
import { applyAffine, maskMatrix, transformImage, transformedSize, type ImageTransform } from "@/applications/photo/transform";
import type { PhotoLayer, RasterDoc } from "@/applications/photo/raster";

const pixel = (id: string, box: { x: number; y: number; w: number; h: number }, extra: Partial<PhotoLayer> = {}): PhotoLayer => ({
  id, name: id, kind: "pixel", visible: true, locked: false, opacity: 1, blend: "normal", rotation: 0, ...box, ...extra,
});

const doc = (layers: PhotoLayer[], width = 400, height = 200): RasterDoc => ({
  version: 2, width, height, layers, activeLayerId: layers[layers.length - 1].id,
  presets: [], profile: "sRGB", rights: { license: "Company-owned", credit: "" }, origin: "generated", history: [],
} as unknown as RasterDoc);

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("W2E photo: masks follow their layer", () => {
  it("is the identity while the layer has not moved", () => {
    const layer = pixel("a", { x: 10, y: 20, w: 100, h: 50 });
    const m = maskFollowMatrix(frameOf(layer), frameOf(layer));
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it("carries the mask with a move and a resize", () => {
    const from = frameOf(pixel("a", { x: 10, y: 20, w: 100, h: 50 }));
    const to = { ...from, x: 60, y: 30, w: 200, h: 100 };
    const m = maskFollowMatrix(from, to);
    close(apply(m, { x: 10, y: 20 }), { x: 60, y: 30 });
    close(apply(m, { x: 110, y: 70 }), { x: 260, y: 130 });
    close(apply(m, { x: 60, y: 45 }), { x: 160, y: 80 });
  });

  it("turns the mask about the layer centre when the layer is rotated or mirrored", () => {
    const from = frameOf(pixel("a", { x: 0, y: 0, w: 100, h: 40 }));
    const turned = { ...from, rotation: 90 };
    /* The top-left corner of the layer goes where the rotated layer draws it. */
    close(apply(maskFollowMatrix(from, turned), { x: 0, y: 0 }), apply(frameMatrix(turned), { x: 0, y: 0 }));
    close(apply(maskFollowMatrix(from, turned), { x: 0, y: 0 }), { x: 70, y: -30 });
    const mirrored = { ...from, flipX: true };
    close(apply(maskFollowMatrix(from, mirrored), { x: 10, y: 5 }), { x: 90, y: 5 });
  });

  it("composes: following twice equals following once", () => {
    const a = frameOf(pixel("a", { x: 5, y: 5, w: 80, h: 60 }));
    const b = { ...a, x: 40, rotation: 30 };
    const c = { ...b, w: 120, flipX: true };
    const once = maskFollowMatrix(a, c);
    const p = { x: 33, y: 17 };
    close(apply(maskFollowMatrix(b, c), apply(maskFollowMatrix(a, b), p)), apply(once, p));
  });

  it("gives old masks a frame at the layer's current place", () => {
    const [layer] = withMaskFrames([pixel("a", { x: 3, y: 4, w: 5, h: 6 }, { mask: "data:" })]);
    expect(layer.maskFrame).toEqual({ x: 3, y: 4, w: 5, h: 6, rotation: 0, flipX: false });
    expect(maskPlacement(layer)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});

describe("W2E photo: whole-image turns carry masks", () => {
  const transforms: ImageTransform[] = ["rotate-cw", "rotate-ccw", "flip-x", "flip-y"];

  it("maps the image corners onto the turned canvas", () => {
    for (const transform of transforms) {
      const size = transformedSize(400, 200, transform);
      const corners = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 200 }, { x: 400, y: 200 }].map((p) => applyAffine(maskMatrix(400, 200, transform), p.x, p.y));
      for (const corner of corners) {
        expect([0, size.width]).toContain(Math.round(corner.x));
        expect([0, size.height]).toContain(Math.round(corner.y));
      }
    }
  });

  it("matches where the layer itself lands, so masked pixels stay over the same picture", () => {
    for (const transform of transforms) {
      const layer = pixel("a", { x: 40, y: 30, w: 120, h: 60 }, { mask: "data:old", maskEnabled: true, maskFrame: frameOf(pixel("a", { x: 40, y: 30, w: 120, h: 60 })) });
      const start = doc([layer]);
      const turned = transformImage(start, transform, { a: "data:new" });
      const after = turned.layers[0];
      expect(after.mask).toBe("data:new");
      /* A point on the layer: where the layer draws it after the turn equals the turn of where it drew it before. */
      const p = { x: 70, y: 45 };
      const before = apply(frameMatrix(frameOf(layer)), p);
      const viaImage = applyAffine(maskMatrix(400, 200, transform), before.x, before.y);
      const viaLayer = apply(frameMatrix(frameOf(after)), { x: after.x + (p.x - layer.x), y: after.y + (p.y - layer.y) });
      close(viaLayer, viaImage);
      /* The mask's frame moved with the layer, so the mask needs no further placement. */
      expect(maskPlacement(after).a).toBeCloseTo(1, 6);
      expect(maskPlacement(after).e).toBeCloseTo(0, 6);
    }
  });
});

describe("W2E photo: masks hide by brightness", () => {
  it("turns white into opaque, black into clear, grey into partial", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 0]);
    luminanceToAlpha(data);
    expect([data[3], data[7], data[11], data[15]]).toEqual([255, 0, 128, 0]);
  });
});
