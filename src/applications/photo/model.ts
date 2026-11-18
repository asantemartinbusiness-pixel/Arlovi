/* ====================================================================== *
 * Photo document loading and the editor's shared tool state.
 * ====================================================================== */

import { createStore, type Store } from "@/applications/visual/kit";
import { uid, type Rect } from "@/applications/visual/geometry";
import {
  NEUTRAL_ADJUST, generateBasePixels, newAdjustmentLayer,
  type BrushSettings, type PhotoLayer, type RasterDoc,
} from "./raster";

export type PhotoTool = "move" | "brush" | "eraser" | "clone" | "crop" | "marquee" | "ellipse" | "lasso" | "eyedropper" | "hand";

export interface PhotoUi {
  tool: PhotoTool;
  brush: BrushSettings;
  zoom: number;
  pan: { x: number; y: number };
  compare: boolean;
  showSelection: boolean;
  quickMask: boolean;
  cloneSource?: { x: number; y: number };
  cropDraft?: { rect: Rect; angle: number };
  /** Bumped whenever pixels change so dependent panels recompute. */
  pixelVersion: number;
}

export const photoUi: Store<PhotoUi> = createStore<PhotoUi>({
  tool: "brush",
  brush: { size: 48, softness: 0.6, opacity: 0.9, color: "#FFFFFF", mode: "paint" },
  zoom: 1,
  pan: { x: 0, y: 0 },
  compare: false,
  showSelection: true,
  quickMask: false,
  pixelVersion: 0,
});

export function setPhotoTool(tool: PhotoTool): void {
  photoUi.set((current) => ({ ...current, tool, brush: { ...current.brush, mode: tool === "eraser" ? "erase" : "paint" } }));
}

export function bumpPixels(): void {
  photoUi.set((current) => ({ ...current, pixelVersion: current.pixelVersion + 1 }));
}

/* ------------------------------ document ------------------------------ */

interface LegacyLayer {
  id: string; name: string; kind: string; color: string; opacity: number;
  brightness: number; contrast: number; hidden: boolean;
  x?: number; y?: number; w?: number; h?: number; src?: string;
}

interface LegacyBody { width?: number; height?: number; layers?: LegacyLayer[] }

function isRasterDoc(body: unknown): body is RasterDoc {
  return Boolean(body && typeof body === "object" && (body as RasterDoc).version === 2 && Array.isArray((body as RasterDoc).layers));
}

/* A stored document without pixels (a seeded one) gets the same generated
   base raster the legacy path uses, cached per size so library thumbnails
   do not regenerate it on every render. */
const generatedBases = new Map<string, string>();
function generatedBase(width: number, height: number): string {
  const key = `${width}x${height}`;
  let src = generatedBases.get(key);
  if (!src) {
    src = generateBasePixels(width, height, 212, "generated in-canvas");
    generatedBases.set(key, src);
  }
  return src;
}

/**
 * Open a photo record. The old studio body is a list of coloured rectangles
 * with brightness and contrast; it is lifted into real layers, and a base
 * raster is generated so there are actual pixels to edit rather than a
 * coloured block standing in for a photograph.
 */
export function parsePhoto(body: unknown): RasterDoc {
  if (isRasterDoc(body)) {
    return {
      ...body,
      layers: body.layers.map((layer, index) => (index === 0 && layer.kind === "pixel" && !layer.src && typeof document !== "undefined"
        ? { ...layer, src: generatedBase(layer.w || body.width, layer.h || body.height), naturalWidth: layer.w || body.width, naturalHeight: layer.h || body.height }
        : layer)),
      presets: body.presets ?? defaultPresets(),
      profile: body.profile ?? "sRGB IEC61966-2.1",
      rights: body.rights ?? { license: "Company-owned", credit: "not recorded" },
      origin: body.origin ?? "Opened from the record.",
      history: body.history ?? [],
    };
  }

  const legacy = body as LegacyBody | undefined;
  const width = legacy?.width ?? 800;
  const height = legacy?.height ?? 500;
  const layers: PhotoLayer[] = [];

  const base = legacy?.layers?.find((layer) => layer.kind !== "adjustment");
  layers.push({
    id: "layer-base",
    name: base?.name ?? "Background",
    kind: "pixel",
    visible: true,
    locked: false,
    opacity: 1,
    blend: "normal",
    src: typeof document === "undefined" ? undefined : generateBasePixels(width, height, 212, "generated in-canvas"),
    naturalWidth: width,
    naturalHeight: height,
    x: 0, y: 0, w: width, h: height, rotation: 0,
  });

  for (const layer of legacy?.layers ?? []) {
    if (layer.kind === "adjustment") {
      layers.push({
        ...newAdjustmentLayer(layer.id, layer.name, {
          exposure: Number(layer.brightness ?? 0) / 40,
          contrast: Number(layer.contrast ?? 0),
        }),
        visible: !layer.hidden,
        opacity: layer.opacity ?? 1,
      });
    } else if (layer !== base) {
      layers.push({
        id: layer.id, name: layer.name, kind: "fill",
        visible: !layer.hidden, locked: false, opacity: layer.opacity ?? 1, blend: "screen",
        color: layer.color,
        x: layer.x ?? 0, y: layer.y ?? 0, w: layer.w ?? width, h: layer.h ?? height, rotation: 0,
      });
    }
  }

  return {
    version: 2,
    width, height,
    layers,
    activeLayerId: layers[layers.length - 1]?.id ?? "layer-base",
    presets: defaultPresets(),
    profile: "sRGB IEC61966-2.1",
    rights: { license: "Company-owned", credit: "not recorded" },
    origin: "No photograph was stored on this record, so the background layer holds a raster generated in this canvas: a lit gradient with film grain. It is real pixel data, not a preview.",
    history: [],
  };
}

export function defaultPresets() {
  return [
    { id: "pr-neutral", name: "Neutral", adjust: { ...NEUTRAL_ADJUST, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } },
    { id: "pr-product", name: "Product — clean and bright", adjust: { ...NEUTRAL_ADJUST, exposure: 0.35, contrast: 12, saturation: 6, highlights: -10, curve: [{ x: 0, y: 6 }, { x: 128, y: 136 }, { x: 255, y: 250 }] } },
    { id: "pr-warm", name: "Showroom warmth", adjust: { ...NEUTRAL_ADJUST, exposure: 0.1, temperature: 22, saturation: 10, shadows: 8, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } },
    { id: "pr-mono", name: "Monochrome press", adjust: { ...NEUTRAL_ADJUST, saturation: -100, contrast: 20, curve: [{ x: 0, y: 0 }, { x: 110, y: 96 }, { x: 255, y: 255 }] } },
  ];
}

export function starterPhoto(name: string, width = 900, height = 600, hue = 212): RasterDoc {
  return {
    version: 2,
    width, height,
    layers: [
      {
        id: "layer-base", name: "Background", kind: "pixel",
        visible: true, locked: false, opacity: 1, blend: "normal",
        src: generateBasePixels(width, height, hue, `${name} — generated in-canvas`),
        naturalWidth: width, naturalHeight: height,
        x: 0, y: 0, w: width, h: height, rotation: 0,
      },
    ],
    activeLayerId: "layer-base",
    presets: defaultPresets(),
    profile: "sRGB IEC61966-2.1",
    rights: { license: "Company-owned", credit: "not recorded" },
    origin: "The background layer is a raster generated in this canvas. Replace it by loading an image from an asset record or from a file.",
    history: [],
  };
}

export function newPixelLayer(name: string, width: number, height: number): PhotoLayer {
  return {
    id: uid("layer"), name, kind: "pixel",
    visible: true, locked: false, opacity: 1, blend: "normal",
    src: undefined, naturalWidth: width, naturalHeight: height,
    x: 0, y: 0, w: width, h: height, rotation: 0,
  };
}

/** Formats a browser can decode, with the reason for anything it cannot. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"];

export function unsupportedReason(file: File): string | null {
  if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
    return "HEIC is not decoded by browsers. Convert it to JPEG or PNG before importing.";
  }
  if (file.type === "image/tiff" || /\.tiff?$/i.test(file.name)) {
    return "TIFF is not decoded by browsers. Convert it to PNG to keep the full quality.";
  }
  if (/\.(cr2|nef|arw|dng|raf|orf)$/i.test(file.name)) {
    return "Camera raw files need a raw converter, which is not available in a browser.";
  }
  if (/\.(psd|xcf|ai)$/i.test(file.name)) {
    return "Layered editor documents cannot be read here. Export a flattened PNG first.";
  }
  if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
    return `${file.type || "This file type"} is not an image this browser can decode.`;
  }
  return null;
}
