/* ====================================================================== *
 * Whole-image transforms and placing a photograph as a layer. Every layer
 * keeps its own pixels: rotating or flipping the image moves and turns the
 * layers rather than rewriting them, so the edit stays non-destructive and
 * undo restores it exactly.
 * ====================================================================== */

import type { PhotoLayer, RasterDoc } from "./raster";

export type ImageTransform = "rotate-cw" | "rotate-ccw" | "flip-x" | "flip-y";

/**
 * Why the whole image cannot be transformed, if it cannot. Masks are no
 * longer a reason: they are turned with the image (see `maskMatrix`). Only a
 * mask whose pixels could not be decoded blocks, because it could not be
 * carried to the new orientation.
 */
export function transformBlocked(doc: RasterDoc, undecodable: string[] = []): string | undefined {
  const broken = doc.layers.filter((layer) => layer.mask && undecodable.includes(layer.id));
  if (broken.length > 0) {
    return `The mask on ${broken.map((layer) => layer.name).join(", ")} could not be decoded, so it cannot be turned with the image. Delete or repaint it first.`;
  }
  return undefined;
}

/** A 2D affine matrix in canvas `setTransform(a, b, c, d, e, f)` order. */
export type Affine = [number, number, number, number, number, number];

/**
 * The matrix that carries a point of a W × H image to the same point of the
 * transformed image: x' = a·x + c·y + e, y' = b·x + d·y + f. Masks are
 * greyscale images in document space, so redrawing them through this matrix
 * keeps every masked pixel over the same picture pixel.
 */
export function maskMatrix(width: number, height: number, transform: ImageTransform): Affine {
  switch (transform) {
    case "rotate-cw": return [0, 1, -1, 0, height, 0];
    case "rotate-ccw": return [0, -1, 1, 0, 0, width];
    case "flip-x": return [-1, 0, 0, 1, width, 0];
    case "flip-y": return [1, 0, 0, -1, 0, height];
  }
}

export function applyAffine(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** The canvas size after a transform: a quarter turn swaps the sides. */
export function transformedSize(width: number, height: number, transform: ImageTransform): { width: number; height: number } {
  return transform === "rotate-cw" || transform === "rotate-ccw" ? { width: height, height: width } : { width, height };
}

/**
 * Redraw a mask for the transformed image, in this browser, as a PNG data
 * URL. The source is stretched to the document size first, which is how the
 * compositor draws it.
 */
export function transformMaskImage(
  source: CanvasImageSource,
  doc: { width: number; height: number },
  transform: ImageTransform,
  makeCanvas: (width: number, height: number) => HTMLCanvasElement,
): string {
  const size = transformedSize(doc.width, doc.height, transform);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser gave no 2D canvas for the mask.");
  ctx.setTransform(...maskMatrix(doc.width, doc.height, transform));
  ctx.drawImage(source, 0, 0, doc.width, doc.height);
  return canvas.toDataURL("image/png");
}

const normalise = (angle: number) => ((angle % 360) + 360) % 360;

type Placement = Pick<PhotoLayer, "x" | "y" | "w" | "h" | "rotation" | "flipX">;
type Turn = (cx: number, cy: number) => { x: number; y: number };

function movePlacement<T extends Placement>(item: T, center: Turn, patch: (item: Placement) => Partial<Placement>): T {
  const next = center(item.x + item.w / 2, item.y + item.h / 2);
  return { ...item, ...patch(item), x: next.x - item.w / 2, y: next.y - item.h / 2 };
}

/* The layer and the frame its mask was painted for move together, so the
   mask's placement relative to the layer is unchanged by the turn. */
function moveLayer(layer: PhotoLayer, center: Turn, patch: (item: Placement) => Partial<Placement>): PhotoLayer {
  if (layer.kind === "adjustment") return layer;
  const moved = movePlacement(layer, center, patch);
  return layer.maskFrame ? { ...moved, maskFrame: movePlacement(layer.maskFrame, center, patch) } : moved;
}

/**
 * Rotate the image by 90° or flip it. Each layer's centre is carried to its
 * new place and its rotation and mirroring are updated; the canvas swaps its
 * width and height for a quarter turn. Masks are redrawn by the caller with
 * `transformMaskImage` and passed in by layer id. A selection or a pending
 * crop belongs to the old orientation, so both are cleared.
 */
export function transformImage(doc: RasterDoc, transform: ImageTransform, masks: Record<string, string> = {}): RasterDoc {
  const { width: W, height: H } = doc;
  let layers: PhotoLayer[];
  let width = W;
  let height = H;
  switch (transform) {
    case "rotate-cw":
      width = H; height = W;
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: H - cy, y: cx }), (item) => ({ rotation: normalise(item.rotation + 90) })));
      break;
    case "rotate-ccw":
      width = H; height = W;
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: cy, y: W - cx }), (item) => ({ rotation: normalise(item.rotation - 90) })));
      break;
    case "flip-x":
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: W - cx, y: cy }), (item) => ({ flipX: !item.flipX, rotation: normalise(-item.rotation) })));
      break;
    case "flip-y":
      /* A vertical mirror is a horizontal mirror turned half way round. */
      layers = doc.layers.map((layer) => moveLayer(layer, (cx, cy) => ({ x: cx, y: H - cy }), (item) => ({ flipX: !item.flipX, rotation: normalise(180 - item.rotation) })));
      break;
  }
  /* Each mask turned with the picture replaces the old one; a mask without a
     turned copy is left as it was (the caller blocks that case). */
  layers = layers.map((layer) => (layer.mask && masks[layer.id] ? { ...layer, mask: masks[layer.id] } : layer));
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
