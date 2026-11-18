/* ====================================================================== *
 * Raster engine.
 *
 * Real pixel work: adjustment pipelines that run over a Uint8ClampedArray,
 * curves built as a 256-entry lookup table from control points, histograms
 * counted from the composited pixels, and a brush that writes into a layer's
 * own canvas. The pure functions here are unit tested; the canvas functions
 * at the end need a DOM and are used by the editor.
 * ====================================================================== */

import { clamp, type Pt, type Rect } from "@/applications/visual/geometry";
import { drawMaskAligned, frameOf } from "./maskSpace";

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference"
  | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

export const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
];

export interface CurvePoint { x: number; y: number }

export interface Adjust {
  /** Stops of exposure, −3 to +3. */
  exposure: number;
  /** −100 to 100. */
  contrast: number;
  saturation: number;
  /** Positive is warmer (more red, less blue). */
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  /** Control points in 0–255 space, ascending in x. */
  curve: CurvePoint[];
}

export const NEUTRAL_ADJUST: Adjust = {
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
};

export function isNeutral(adjust: Adjust): boolean {
  return adjust.exposure === 0 && adjust.contrast === 0 && adjust.saturation === 0
    && adjust.temperature === 0 && adjust.tint === 0 && adjust.highlights === 0 && adjust.shadows === 0
    && adjust.curve.length === 2 && adjust.curve[0].y === 0 && adjust.curve[1].y === 255;
}

export type LayerKind = "pixel" | "fill" | "adjustment" | "group";

export interface PhotoLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  /** Pixel layers hold a PNG data URL; it is the layer's actual image data. */
  src?: string;
  /** Natural pixel size of `src`. */
  naturalWidth?: number;
  naturalHeight?: number;
  color?: string;
  adjust?: Adjust;
  /** Greyscale PNG data URL: white shows, black hides. */
  mask?: string;
  maskEnabled?: boolean;
  /** The layer geometry the mask was painted for; the mask follows the layer from there. */
  maskFrame?: { x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean };
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  /** Mirror the layer horizontally about its centre. */
  flipX?: boolean;
  /** An adjustment layer with this set only affects the layer directly below. */
  clipToBelow?: boolean;
  parentId?: string;
}

export interface Selection {
  kind: "rect" | "ellipse" | "lasso";
  rect?: Rect;
  points?: Pt[];
  feather: number;
  inverted: boolean;
}

export interface RasterDoc {
  version: 2;
  width: number;
  height: number;
  /** Bottom first, which is the order the compositor paints. */
  layers: PhotoLayer[];
  activeLayerId: string;
  selection?: Selection;
  crop?: { rect: Rect; angle: number };
  presets: { id: string; name: string; adjust: Adjust }[];
  profile: string;
  rights: { license: string; credit: string };
  /** What produced the base pixels, stated plainly in the interface. */
  origin: string;
  history: { id: string; at: string; by: string; label: string }[];
}

/* ====================================================================== *
 * Curves
 * ====================================================================== */

/**
 * Monotone cubic interpolation through the control points, sampled into a
 * 256-entry lookup table. Monotone rather than plain Catmull-Rom so a curve
 * never overshoots and invents contrast that was not asked for.
 */
export function curveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  if (sorted.length === 1) {
    lut.fill(clamp(Math.round(sorted[0].y), 0, 255));
    return lut;
  }
  const n = sorted.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = sorted[i + 1].x - sorted[i].x;
    slopes.push(dx === 0 ? 0 : (sorted[i + 1].y - sorted[i].y) / dx);
  }
  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (slopes[i - 1] * slopes[i] <= 0) tangents[i] = 0;
    else tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const m = slopes[i];
    if (m === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
    const a = tangents[i] / m;
    const b = tangents[i + 1] / m;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * m;
      tangents[i + 1] = t * b * m;
    }
  }
  for (let x = 0; x < 256; x += 1) {
    if (x <= sorted[0].x) { lut[x] = clamp(Math.round(sorted[0].y), 0, 255); continue; }
    if (x >= sorted[n - 1].x) { lut[x] = clamp(Math.round(sorted[n - 1].y), 0, 255); continue; }
    let segment = 0;
    while (segment < n - 2 && x > sorted[segment + 1].x) segment += 1;
    const x0 = sorted[segment].x;
    const x1 = sorted[segment + 1].x;
    const h = x1 - x0 || 1;
    const t = (x - x0) / h;
    const y0 = sorted[segment].y;
    const y1 = sorted[segment + 1].y;
    const m0 = tangents[segment];
    const m1 = tangents[segment + 1];
    const t2 = t * t;
    const t3 = t2 * t;
    const value = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
    lut[x] = clamp(Math.round(value), 0, 255);
  }
  return lut;
}

/** Combine exposure, contrast, highlight/shadow recovery and the curve. */
export function toneLut(adjust: Adjust): Uint8Array {
  const curve = curveLut(adjust.curve);
  const gain = 2 ** adjust.exposure;
  const contrast = 1 + adjust.contrast / 100;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i * gain;
    value = (value - 127.5) * contrast + 127.5;
    const normal = clamp(value / 255, 0, 1);
    if (adjust.shadows !== 0) {
      const weight = (1 - normal) ** 2;
      value += adjust.shadows * 1.2 * weight;
    }
    if (adjust.highlights !== 0) {
      const weight = normal ** 2;
      value += adjust.highlights * 1.2 * weight;
    }
    lut[i] = curve[clamp(Math.round(value), 0, 255)];
  }
  return lut;
}

/* ====================================================================== *
 * Pixel pipeline
 * ====================================================================== */

/**
 * Apply an adjustment to RGBA pixel data in place. Alpha is untouched, so a
 * transparent region stays transparent and an adjustment layer never fills
 * the pixels it was not meant to reach.
 */
export function applyAdjust(data: Uint8ClampedArray, adjust: Adjust): void {
  const lut = toneLut(adjust);
  const saturation = 1 + adjust.saturation / 100;
  const warm = adjust.temperature / 100;
  const tint = adjust.tint / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];

    if (warm !== 0) {
      r = clamp(r + warm * 28, 0, 255);
      b = clamp(b - warm * 28, 0, 255);
    }
    if (tint !== 0) {
      g = clamp(g + tint * 22, 0, 255);
      r = clamp(r - tint * 6, 0, 255);
    }
    if (saturation !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = clamp(luma + (r - luma) * saturation, 0, 255);
      g = clamp(luma + (g - luma) * saturation, 0, 255);
      b = clamp(luma + (b - luma) * saturation, 0, 255);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

export interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
  /** Pixels counted, excluding fully transparent ones. */
  counted: number;
  clippedBlack: number;
  clippedWhite: number;
  mean: number;
}

/** Count a histogram from real pixel data. */
export function histogram(data: Uint8ClampedArray): Histogram {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const luma = new Array(256).fill(0);
  let counted = 0;
  let clippedBlack = 0;
  let clippedWhite = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    counted += 1;
    r[data[i]] += 1;
    g[data[i + 1]] += 1;
    b[data[i + 2]] += 1;
    const value = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    luma[value] += 1;
    total += value;
    if (value <= 2) clippedBlack += 1;
    if (value >= 253) clippedWhite += 1;
  }
  return { r, g, b, luma, counted, clippedBlack, clippedWhite, mean: counted === 0 ? 0 : total / counted };
}

/* ====================================================================== *
 * Selections and masks
 * ====================================================================== */

export function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function selectionContains(selection: Selection, point: Pt): boolean {
  let inside = false;
  if (selection.kind === "rect" && selection.rect) {
    const r = selection.rect;
    inside = point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;
  } else if (selection.kind === "ellipse" && selection.rect) {
    const r = selection.rect;
    const nx = (point.x - (r.x + r.w / 2)) / (r.w / 2 || 1);
    const ny = (point.y - (r.y + r.h / 2)) / (r.h / 2 || 1);
    inside = nx * nx + ny * ny <= 1;
  } else if (selection.kind === "lasso" && selection.points && selection.points.length > 2) {
    inside = pointInPolygon(point, selection.points);
  }
  return selection.inverted ? !inside : inside;
}

export function selectionBoundsOf(selection: Selection, width: number, height: number): Rect {
  if (selection.inverted) return { x: 0, y: 0, w: width, h: height };
  if (selection.rect) return selection.rect;
  if (selection.points && selection.points.length > 0) {
    const xs = selection.points.map((p) => p.x);
    const ys = selection.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: 0, y: 0, w: width, h: height };
}

/**
 * Transform a selection by the same affine the image gets, so a selection
 * survives a crop, a straighten or a flip instead of drifting.
 */
export function transformSelection(selection: Selection, move: { dx: number; dy: number; angle: number; origin: Pt }): Selection {
  const spin = (point: Pt): Pt => {
    const rad = (move.angle * Math.PI) / 180;
    const dx = point.x - move.origin.x;
    const dy = point.y - move.origin.y;
    return {
      x: move.origin.x + dx * Math.cos(rad) - dy * Math.sin(rad) + move.dx,
      y: move.origin.y + dx * Math.sin(rad) + dy * Math.cos(rad) + move.dy,
    };
  };
  if (selection.points) {
    return { ...selection, points: selection.points.map(spin) };
  }
  if (selection.rect) {
    if (move.angle === 0) {
      return { ...selection, rect: { ...selection.rect, x: selection.rect.x + move.dx, y: selection.rect.y + move.dy } };
    }
    const corners = [
      { x: selection.rect.x, y: selection.rect.y },
      { x: selection.rect.x + selection.rect.w, y: selection.rect.y },
      { x: selection.rect.x + selection.rect.w, y: selection.rect.y + selection.rect.h },
      { x: selection.rect.x, y: selection.rect.y + selection.rect.h },
    ].map(spin);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return { ...selection, kind: "lasso", points: corners, rect: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  }
  return selection;
}

/* ====================================================================== *
 * Brush
 * ====================================================================== */

export interface BrushSettings {
  size: number;
  /** 0 is a hard edge, 1 is fully feathered. */
  softness: number;
  opacity: number;
  color: string;
  mode: "paint" | "erase";
}

/** Points along a stroke so a fast drag does not leave gaps. */
export function strokePoints(from: Pt, to: Pt, spacing: number): Pt[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, spacing)));
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/* ====================================================================== *
 * Layer model
 * ====================================================================== */

export function layerById(doc: RasterDoc, id: string): PhotoLayer | undefined {
  return doc.layers.find((layer) => layer.id === id);
}

export function patchLayer(doc: RasterDoc, id: string, patch: Partial<PhotoLayer>): RasterDoc {
  return { ...doc, layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)) };
}

export function addLayer(doc: RasterDoc, layer: PhotoLayer, aboveId?: string): RasterDoc {
  const index = aboveId ? doc.layers.findIndex((item) => item.id === aboveId) + 1 : doc.layers.length;
  const layers = [...doc.layers];
  layers.splice(index, 0, layer);
  return { ...doc, layers, activeLayerId: layer.id };
}

export function removeLayer(doc: RasterDoc, id: string): RasterDoc {
  if (doc.layers.length <= 1) return doc;
  const layers = doc.layers.filter((layer) => layer.id !== id);
  return { ...doc, layers, activeLayerId: layers[layers.length - 1].id };
}

/** Move a layer in the stack. Positive delta moves it up (later paint). */
export function moveLayer(doc: RasterDoc, id: string, delta: number): RasterDoc {
  const from = doc.layers.findIndex((layer) => layer.id === id);
  if (from < 0) return doc;
  const to = clamp(from + delta, 0, doc.layers.length - 1);
  if (to === from) return doc;
  const layers = [...doc.layers];
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
  return { ...doc, layers };
}

export function groupLayers(doc: RasterDoc, ids: string[], name: string, groupId: string): RasterDoc {
  if (ids.length === 0) return doc;
  const first = doc.layers.findIndex((layer) => layer.id === ids[0]);
  const group: PhotoLayer = {
    id: groupId, name, kind: "group", visible: true, locked: false, opacity: 1, blend: "normal",
    x: 0, y: 0, w: doc.width, h: doc.height, rotation: 0,
  };
  const layers = [...doc.layers];
  layers.splice(Math.max(0, first), 0, group);
  return {
    ...doc,
    layers: layers.map((layer) => (ids.includes(layer.id) ? { ...layer, parentId: groupId } : layer)),
  };
}

/** The layers a compositor paints, in order, honouring groups. */
export function paintOrder(doc: RasterDoc): PhotoLayer[] {
  const out: PhotoLayer[] = [];
  for (const layer of doc.layers) {
    if (layer.kind === "group") {
      out.push(layer);
      continue;
    }
    const parent = layer.parentId ? layerById(doc, layer.parentId) : undefined;
    if (parent && (!parent.visible || parent.opacity === 0)) continue;
    out.push(layer);
  }
  return out.filter((layer) => layer.kind !== "group");
}

export function effectiveOpacity(doc: RasterDoc, layer: PhotoLayer): number {
  const parent = layer.parentId ? layerById(doc, layer.parentId) : undefined;
  return layer.opacity * (parent ? parent.opacity : 1);
}

/** The adjustment stack a given pixel layer sits under, newest last. */
export function adjustmentsAbove(doc: RasterDoc, layerId: string): PhotoLayer[] {
  const index = doc.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return [];
  return doc.layers.slice(index + 1).filter((layer) => layer.kind === "adjustment" && layer.visible);
}

export function newAdjustmentLayer(id: string, name: string, adjust: Partial<Adjust> = {}): PhotoLayer {
  return {
    id, name, kind: "adjustment", visible: true, locked: false, opacity: 1, blend: "normal",
    x: 0, y: 0, w: 0, h: 0, rotation: 0,
    adjust: { ...NEUTRAL_ADJUST, ...adjust, curve: adjust.curve ?? [...NEUTRAL_ADJUST.curve] },
  };
}

export function describeAdjust(adjust: Adjust): string {
  const parts: string[] = [];
  if (adjust.exposure) parts.push(`${adjust.exposure > 0 ? "+" : ""}${adjust.exposure.toFixed(2)} EV`);
  if (adjust.contrast) parts.push(`contrast ${adjust.contrast > 0 ? "+" : ""}${Math.round(adjust.contrast)}`);
  if (adjust.saturation) parts.push(`saturation ${adjust.saturation > 0 ? "+" : ""}${Math.round(adjust.saturation)}`);
  if (adjust.temperature) parts.push(`${adjust.temperature > 0 ? "warmer" : "cooler"} ${Math.abs(Math.round(adjust.temperature))}`);
  if (adjust.tint) parts.push(`tint ${Math.round(adjust.tint)}`);
  if (adjust.highlights) parts.push(`highlights ${Math.round(adjust.highlights)}`);
  if (adjust.shadows) parts.push(`shadows ${Math.round(adjust.shadows)}`);
  if (adjust.curve.length > 2) parts.push(`curve with ${adjust.curve.length} points`);
  return parts.length ? parts.join(", ") : "neutral";
}

/* ====================================================================== *
 * Canvas side (needs a DOM)
 * ====================================================================== */

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser did not provide a 2-D canvas context.");
  return ctx;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The browser could not decode this image data."));
    image.src = src;
  });
  return image;
}

/**
 * Generate a real raster in the canvas when a document has no photograph:
 * a lit gradient, a soft shadow, a specular highlight and film grain. It is
 * actual pixel data — the interface says it was generated here.
 */
export function generateBasePixels(width: number, height: number, hue: number, label: string): string {
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `hsl(${hue} 42% 22%)`);
  sky.addColorStop(0.55, `hsl(${(hue + 18) % 360} 34% 38%)`);
  sky.addColorStop(1, `hsl(${(hue + 36) % 360} 26% 14%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.68, height * 0.3, 8, width * 0.68, height * 0.3, Math.max(width, height) * 0.55);
  glow.addColorStop(0, "rgba(255,238,205,0.95)");
  glow.addColorStop(0.35, "rgba(255,196,130,0.42)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width * 0.3, height * 0.62);
  ctx.rotate(-0.12);
  ctx.fillStyle = "rgba(14,18,30,0.8)";
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.22, height * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(230,214,186,0.9)";
  ctx.fillRect(-6, -height * 0.34, 12, height * 0.34);
  ctx.restore();

  ctx.globalAlpha = 0.5;
  for (let index = 0; index < 28; index += 1) {
    const x = ((index * 97) % width);
    const y = ((index * 173) % height);
    ctx.fillStyle = `hsla(${(hue + index * 7) % 360} 60% ${55 + (index % 5) * 4}% / 0.12)`;
    ctx.beginPath();
    ctx.arc(x, y, 18 + (index % 7) * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* Film grain over real pixels, written through the image data. */
  const frame = ctx.getImageData(0, 0, width, height);
  let seed = 1337;
  for (let i = 0; i < frame.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((seed >> 16) % 23) - 11;
    frame.data[i] = clamp(frame.data[i] + noise, 0, 255);
    frame.data[i + 1] = clamp(frame.data[i + 1] + noise, 0, 255);
    frame.data[i + 2] = clamp(frame.data[i + 2] + noise, 0, 255);
  }
  ctx.putImageData(frame, 0, 0);

  ctx.font = `600 ${Math.max(11, Math.round(width / 46))}px Inter, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(label, 16, height - 16);

  return canvas.toDataURL("image/png");
}

export interface CompositeOptions {
  /** Stop before this layer id, for a before/after comparison. */
  upTo?: string;
  /** Ignore every adjustment layer. */
  bypassAdjustments?: boolean;
  /** Only this layer, for a layer thumbnail. */
  onlyLayer?: string;
  /** Apply the crop rectangle. */
  applyCrop?: boolean;
}

/**
 * Composite the document onto a canvas. Pixel and fill layers are drawn with
 * their blend mode; an adjustment layer re-reads everything painted so far
 * and rewrites it, which is what makes it non-destructive.
 */
export function compositeDoc(
  target: HTMLCanvasElement,
  doc: RasterDoc,
  images: Map<string, HTMLImageElement>,
  masks: Map<string, HTMLImageElement>,
  options: CompositeOptions = {},
): void {
  const ctx = context2d(target);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, target.width, target.height);
  const scaleX = target.width / doc.width;
  const scaleY = target.height / doc.height;

  for (const layer of paintOrder(doc)) {
    if (!layer.visible || layer.opacity === 0) continue;
    if (options.onlyLayer && layer.id !== options.onlyLayer) continue;
    if (options.upTo && doc.layers.findIndex((item) => item.id === layer.id) > doc.layers.findIndex((item) => item.id === options.upTo)) continue;

    if (layer.kind === "adjustment") {
      if (options.bypassAdjustments || !layer.adjust) continue;
      const region = layer.clipToBelow ? { x: 0, y: 0, w: target.width, h: target.height } : { x: 0, y: 0, w: target.width, h: target.height };
      const frame = ctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h));
      applyAdjust(frame.data, layer.adjust);
      if (layer.opacity < 1) {
        /* Blend the adjusted pixels back at the layer's opacity. */
        const before = ctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h));
        for (let i = 0; i < frame.data.length; i += 1) {
          frame.data[i] = before.data[i] + (frame.data[i] - before.data[i]) * layer.opacity;
        }
      }
      ctx.putImageData(frame, region.x, region.y);
      continue;
    }

    const maskImage = layer.maskEnabled && layer.mask ? masks.get(layer.id) : undefined;
    const needsBuffer = Boolean(maskImage);
    const buffer = needsBuffer ? makeCanvas(target.width, target.height) : null;
    const paint = buffer ? context2d(buffer) : ctx;

    paint.save();
    paint.globalAlpha = effectiveOpacity(doc, layer);
    paint.globalCompositeOperation = buffer ? "source-over" : (layer.blend === "normal" ? "source-over" : layer.blend);
    const cx = (layer.x + layer.w / 2) * scaleX;
    const cy = (layer.y + layer.h / 2) * scaleY;
    paint.translate(cx, cy);
    if (layer.rotation) paint.rotate((layer.rotation * Math.PI) / 180);
    if (layer.flipX) paint.scale(-1, 1);
    paint.translate(-cx, -cy);

    if (layer.kind === "fill" && layer.color) {
      paint.fillStyle = layer.color;
      paint.fillRect(layer.x * scaleX, layer.y * scaleY, layer.w * scaleX, layer.h * scaleY);
    } else if (layer.kind === "pixel") {
      const image = images.get(layer.id);
      if (image) paint.drawImage(image, layer.x * scaleX, layer.y * scaleY, layer.w * scaleX, layer.h * scaleY);
    }
    paint.restore();

    if (buffer && maskImage) {
      const maskCtx = context2d(buffer);
      maskCtx.save();
      maskCtx.globalCompositeOperation = "destination-in";
      maskCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      drawMaskAligned(maskCtx, maskImage, layer, doc);
      maskCtx.restore();
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = layer.blend === "normal" ? "source-over" : layer.blend;
      ctx.drawImage(buffer, 0, 0);
      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** Read the composited pixels so the histogram is of what is on screen. */
export function compositeImageData(
  doc: RasterDoc,
  images: Map<string, HTMLImageElement>,
  masks: Map<string, HTMLImageElement>,
  options: CompositeOptions = {},
  sample = 320,
): ImageData {
  const ratio = doc.height / Math.max(1, doc.width);
  const canvas = makeCanvas(sample, Math.max(1, Math.round(sample * ratio)));
  compositeDoc(canvas, doc, images, masks, options);
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

/** Paint one dab of a soft round brush into a layer's own canvas. */
export function brushDab(ctx: CanvasRenderingContext2D, point: Pt, brush: BrushSettings): void {
  const radius = Math.max(0.5, brush.size / 2);
  ctx.save();
  ctx.globalCompositeOperation = brush.mode === "erase" ? "destination-out" : "source-over";
  if (brush.softness <= 0.02) {
    ctx.globalAlpha = brush.opacity;
    ctx.fillStyle = brush.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const gradient = ctx.createRadialGradient(point.x, point.y, radius * (1 - brush.softness), point.x, point.y, radius);
    const paint = brush.mode === "erase" ? "#000000" : brush.color;
    gradient.addColorStop(0, withAlpha(paint, brush.opacity));
    gradient.addColorStop(1, withAlpha(paint, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

/** Crop and straighten, producing new pixel data for each pixel layer. */
export async function bakeCrop(doc: RasterDoc, rect: Rect, angle: number): Promise<RasterDoc> {
  const output = makeCanvas(rect.w, rect.h);
  const layers: PhotoLayer[] = [];
  for (const layer of doc.layers) {
    if (layer.kind !== "pixel" || !layer.src) {
      layers.push(layer.kind === "adjustment" ? layer : { ...layer, x: layer.x - rect.x, y: layer.y - rect.y });
      continue;
    }
    const image = await loadImage(layer.src);
    const ctx = context2d(output);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.save();
    ctx.translate(output.width / 2, output.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.translate(-output.width / 2, -output.height / 2);
    ctx.drawImage(image, layer.x - rect.x, layer.y - rect.y, layer.w, layer.h);
    ctx.restore();
    layers.push({
      ...layer, src: output.toDataURL("image/png"),
      x: 0, y: 0, w: rect.w, h: rect.h,
      naturalWidth: Math.round(rect.w), naturalHeight: Math.round(rect.h),
    });
  }
  /* Masks are cut by the same crop and turned by the same straighten as the
     pixels they cover, then recorded as painted for the layer's new place. */
  for (let index = 0; index < layers.length; index += 1) {
    const before = doc.layers[index];
    const after = layers[index];
    if (!before.mask || after.kind === "adjustment") continue;
    try {
      const mask = await loadImage(before.mask);
      const canvas = makeCanvas(Math.round(rect.w), Math.round(rect.h));
      const ctx = context2d(canvas);
      if (before.kind === "pixel" && before.src) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      ctx.translate(-rect.x, -rect.y);
      drawMaskAligned(ctx, mask, before, doc);
      layers[index] = { ...after, mask: canvas.toDataURL("image/png"), maskFrame: frameOf(after) };
    } catch {
      /* An undecodable mask is kept as it was; the layer panel reports it. */
    }
  }
  return {
    ...doc, width: Math.round(rect.w), height: Math.round(rect.h), layers,
    crop: undefined,
    selection: doc.selection
      ? transformSelection(doc.selection, { dx: -rect.x, dy: -rect.y, angle, origin: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } })
      : undefined,
  };
}

export function exportComposite(
  doc: RasterDoc,
  images: Map<string, HTMLImageElement>,
  masks: Map<string, HTMLImageElement>,
  options: { format: "png" | "jpeg" | "webp"; quality: number; width?: number; height?: number; background?: string },
): Promise<{ blob: Blob; width: number; height: number }> {
  const width = Math.max(1, Math.round(options.width ?? doc.width));
  const height = Math.max(1, Math.round(options.height ?? doc.height));
  const canvas = makeCanvas(width, height);
  if (options.background) {
    const ctx = context2d(canvas);
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  const layer = makeCanvas(width, height);
  compositeDoc(layer, doc, images, masks);
  const ctx = context2d(canvas);
  ctx.drawImage(layer, 0, 0);
  const mime = options.format === "png" ? "image/png" : options.format === "webp" ? "image/webp" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error(`This browser produced no ${options.format.toUpperCase()} data.`))),
      mime,
      options.format === "png" ? undefined : clamp(options.quality, 0.05, 1),
    );
  });
}
