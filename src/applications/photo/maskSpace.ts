/* ====================================================================== *
 * Masks that follow their layer.
 *
 * A mask is a greyscale image the size of the document. Each mask records
 * the layer geometry it was painted for (`maskFrame`). When the layer is
 * later moved, resized, rotated or mirrored, the compositor carries the
 * mask through the same change, so the hidden pixels stay hidden instead
 * of the mask staying put while the picture slides out from under it.
 * Nothing is resampled until the mask is painted on again.
 * ====================================================================== */

import { IDENTITY, invert, mul, rotation, scaling, translation, type Mat } from "@/applications/visual/geometry";
import type { PhotoLayer } from "./raster";

export interface LayerFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipX?: boolean;
}

export function frameOf(layer: Pick<PhotoLayer, "x" | "y" | "w" | "h" | "rotation" | "flipX">): LayerFrame {
  return { x: layer.x, y: layer.y, w: layer.w, h: layer.h, rotation: layer.rotation, flipX: Boolean(layer.flipX) };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export function sameFrame(a: LayerFrame, b: LayerFrame): boolean {
  return near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h) && near(a.rotation, b.rotation) && Boolean(a.flipX) === Boolean(b.flipX);
}

/**
 * The layer's placement: a point of its unrotated box (x, y, w, h) to the
 * document, exactly as the compositor draws it — translate to the centre,
 * rotate, mirror, translate back.
 */
export function frameMatrix(frame: LayerFrame): Mat {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return mul(translation(cx, cy), mul(rotation(frame.rotation), mul(scaling(frame.flipX ? -1 : 1, 1), translation(-cx, -cy))));
}

/**
 * Where a document point of the mask painted for `from` belongs once the
 * layer sits at `to`: undo the old placement, stretch the old box onto the
 * new one, apply the new placement.
 */
export function maskFollowMatrix(from: LayerFrame, to: LayerFrame): Mat {
  if (sameFrame(from, to) || from.w === 0 || from.h === 0) return IDENTITY;
  const stretch = mul(translation(to.x, to.y), mul(scaling(to.w / from.w, to.h / from.h), translation(-from.x, -from.y)));
  return mul(frameMatrix(to), mul(stretch, invert(frameMatrix(from))));
}

/** The matrix that draws a layer's mask, in document units, where it belongs now. */
export function maskPlacement(layer: PhotoLayer): Mat {
  return layer.maskFrame ? maskFollowMatrix(layer.maskFrame, frameOf(layer)) : IDENTITY;
}

/**
 * Draw a layer's mask, in its current place, onto a document-sized canvas
 * context whose transform is already set to document units. Areas the moved
 * mask no longer covers are left clear (they hide the layer).
 */
export function drawMaskAligned(ctx: CanvasRenderingContext2D, mask: CanvasImageSource, layer: PhotoLayer, doc: { width: number; height: number }): void {
  const m = maskPlacement(layer);
  ctx.save();
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(mask, 0, 0, doc.width, doc.height);
  ctx.restore();
}

/** Old documents stored masks without a frame: treat them as painted for where the layer is now. */
export function withMaskFrames(layers: PhotoLayer[]): PhotoLayer[] {
  return layers.map((layer) => (layer.mask && !layer.maskFrame ? { ...layer, maskFrame: frameOf(layer) } : layer));
}

/*
 * A mask is stored as an opaque greyscale picture (white shows, black
 * hides), but canvas compositing masks by alpha. The compositor uses this
 * alpha version: each pixel's alpha becomes its brightness. Converted once
 * per decoded mask image.
 */
const alphaCache = new WeakMap<object, HTMLCanvasElement>();

export function luminanceToAlpha(data: Uint8ClampedArray): void {
  for (let index = 0; index < data.length; index += 4) {
    const light = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    data[index + 3] = Math.round((light * data[index + 3]) / 255);
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
  }
}

export function maskAlpha(mask: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const cached = alphaCache.get(mask);
  if (cached) return cached;
  const width = mask instanceof HTMLImageElement ? mask.naturalWidth : mask.width;
  const height = mask instanceof HTMLImageElement ? mask.naturalHeight : mask.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  luminanceToAlpha(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  alphaCache.set(mask, canvas);
  return canvas;
}
