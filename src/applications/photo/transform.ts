/* ====================================================================== *
 * Whole-image transforms and placing a photograph as a layer. Every layer
 * keeps its own pixels: rotating or flipping the image moves and turns the
 * layers rather than rewriting them, so the edit stays non-destructive and
 * undo restores it exactly.
 * ====================================================================== */

import type { PhotoLayer, RasterDoc } from "./raster";

export type ImageTransform = "rotate-cw" | "rotate-ccw" | "flip-x" | "flip-y";

/** Why the whole image cannot be transformed, if it cannot. */
export function transformBlocked(doc: RasterDoc): string | undefined {
  if (doc.layers.some((layer) => layer.mask && layer.maskEnabled)) {
    return "A layer has a mask painted at the current orientation. Apply or disable the mask first.";
  }
  return undefined;
}

const normalise = (angle: number) => ((angle % 360) + 360) % 360;

function moveLayer(layer: PhotoLayer, center: (cx: number, cy: number) => { x: number; y: number }, patch: Partial<PhotoLayer>): PhotoLayer {
  if (layer.kind === "adjustment") return layer;
  const next = center(layer.x + layer.w / 2, layer.y + layer.h / 2);
  return { ...layer, ...patch, x: next.x - layer.w / 2, y: next.y - layer.h / 2 };
}

/**
 * Rotate the image by 90° or flip it. Each layer's centre is carried to its
 * new place and its rotation and mirroring are updated; the canvas swaps its
 * width and height for a quarter turn. A selection or a pending crop belongs
 * to the old orientation, so both are cleared.
 */
export function transformImage(doc: RasterDoc, transform: ImageTransform): RasterDoc {
  const { width: W, height: H } = doc;
  let layers: PhotoLayer[];
  let width = W;
  let height = H;
  switch (transform) {
    case "rotate-cw":
      width = H; height = W;
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: H - cy, y: cx }), { rotation: normalise(layer.rotation + 90) }));
      break;
    case "rotate-ccw":
      width = H; height = W;
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: cy, y: W - cx }), { rotation: normalise(layer.rotation - 90) }));
      break;
    case "flip-x":
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: W - cx, y: cy }), { flipX: !layer.flipX, rotation: normalise(-layer.rotation) }));
      break;
    case "flip-y":
      /* A vertical mirror is a horizontal mirror turned half way round. */
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: cx, y: H - cy }), { flipX: !layer.flipX, rotation: normalise(180 - layer.rotation) }));
      break;
  }
  return { ...doc, width, height, layers, selection: undefined, crop: undefined };
}

/** The size a picture takes when fitted inside the canvas without cropping. */
export function containBox(natural: { width: number; height: number }, canvas: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(canvas.width / natural.width, canvas.height / natural.height, 1);
  const w = Math.round(natural.width * scale);
  const h = Math.round(natural.height * scale);
  return { x: Math.round((canvas.width - w) / 2), y: Math.round((canvas.height - h) / 2), w, h };
}

/**
 * Place a photograph as a new pixel layer above the active one. With
 * `resizeCanvas` the image takes the photograph's own size, which is what
 * opening a photo over a generated background should do.
 */
export function placePhoto(
  doc: RasterDoc,
  photo: { id: string; name: string; src: string; width: number; height: number },
  resizeCanvas: boolean,
): RasterDoc {
  const canvas = resizeCanvas ? { width: photo.width, height: photo.height } : { width: doc.width, height: doc.height };
  const box = containBox({ width: photo.width, height: photo.height }, canvas);
  const layer: PhotoLayer = {
    id: photo.id, name: photo.name, kind: "pixel", visible: true, locked: false, opacity: 1, blend: "normal",
    src: photo.src, naturalWidth: photo.width, naturalHeight: photo.height,
    x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0,
  };
  const base = resizeCanvas
    ? {
      ...doc,
      width: photo.width,
      height: photo.height,
      selection: undefined,
      crop: undefined,
      /* Layers that filled the old canvas fill the new one. */
      layers: doc.layers.map((item) => (item.kind === "adjustment" ? item : item.x === 0 && item.y === 0 && item.w === doc.width && item.h === doc.height
        ? { ...item, w: photo.width, h: photo.height }
        : item)),
      origin: `Opened from ${photo.name} in this browser. The earlier layers are kept beneath it.`,
    }
    : doc;
  /* Above every picture layer, beneath the adjustments stacked on top, so
     the grade already in the document applies to the new photograph. */
  let insertAt = base.layers.length;
  while (insertAt > 0 && base.layers[insertAt - 1].kind === "adjustment") insertAt -= 1;
  const layers = [...base.layers];
  layers.splice(insertAt, 0, layer);
  return { ...base, layers, activeLayerId: layer.id };
}
