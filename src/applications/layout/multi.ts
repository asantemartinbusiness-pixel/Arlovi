/* ====================================================================== *
 * Working on several frames at once, and turning a frame. Pure functions
 * over the publication document: the editor, the keyboard and the tests
 * share them. Locked frames never move; they still count as a reference
 * when a selection is aligned to its own bounds.
 * ====================================================================== */

import type { Box, Frame, PublicationDoc } from "./flow";
import { alignBox, handlePoint, locateFrame, removeFrame, resizeBox, type Alignment, type Handle } from "./arrange";

/** The frames with these ids, in page order, with the page each is on. */
export function framesById(doc: PublicationDoc, ids: string[]): { frame: Frame; pageIndex: number }[] {
  return ids.map((id) => locateFrame(doc, id)).filter((item): item is { frame: Frame; pageIndex: number } => Boolean(item));
}

/** The smallest box around all of the given boxes (rotated frames by their turned corners). */
export function boundsOf(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The page-space bounding box of a frame, taking its rotation into account. */
export function visualBox(frame: Pick<Frame, "box" | "rotation">): Box {
  const deg = frame.rotation ?? 0;
  if (!deg) return frame.box;
  const { x, y, w, h } = frame.box;
  const c = { x: x + w / 2, y: y + h / 2 };
  const corners = [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }].map((p) => rotateAround(p, c, deg));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function rotateAround(p: { x: number; y: number }, c: { x: number; y: number }, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

function patchFrames(doc: PublicationDoc, patches: Map<string, Partial<Frame>>): PublicationDoc {
  if (patches.size === 0) return doc;
  return {
    ...doc,
    pages: doc.pages.map((page) => (page.frames.some((frame) => patches.has(frame.id))
      ? { ...page, frames: page.frames.map((frame) => (patches.has(frame.id) ? { ...frame, ...patches.get(frame.id) } : frame)) }
      : page)),
  };
}

/** Move every unlocked frame in the selection by (dx, dy) points. */
export function moveFrames(doc: PublicationDoc, ids: string[], dx: number, dy: number): PublicationDoc {
  const patches = new Map<string, Partial<Frame>>();
  for (const { frame } of framesById(doc, ids)) {
    if (!frame.locked) patches.set(frame.id, { box: { ...frame.box, x: frame.box.x + dx, y: frame.box.y + dy } });
  }
  return patchFrames(doc, patches);
}

/**
 * Align the selection. With no target the frames line up with the edge or
 * centre of the selection's own bounds (the usual "align selected"); with a
 * target (the margins or the trim) each frame goes to that edge. Alignment
 * uses what is drawn, so a turned frame lines up by its turned outline.
 */
export function alignFrames(doc: PublicationDoc, ids: string[], alignment: Alignment, target?: Box): PublicationDoc {
  const found = framesById(doc, ids);
  if (found.length === 0) return doc;
  const area = target ?? boundsOf(found.map(({ frame }) => visualBox(frame)));
  const patches = new Map<string, Partial<Frame>>();
  for (const { frame } of found) {
    if (frame.locked) continue;
    const shown = visualBox(frame);
    const placed = alignBox(shown, alignment, area);
    const dx = placed.x - shown.x;
    const dy = placed.y - shown.y;
    if (dx !== 0 || dy !== 0) patches.set(frame.id, { box: { ...frame.box, x: frame.box.x + dx, y: frame.box.y + dy } });
  }
  return patchFrames(doc, patches);
}

/**
 * Distribute three or more frames so the gaps between them are equal. The
 * outermost two stay where they are; the rest are spaced between them in
 * their current order. Locked frames keep their place but still take up room.
 */
export function distributeFrames(doc: PublicationDoc, ids: string[], axis: "x" | "y"): PublicationDoc {
  const found = framesById(doc, ids);
  if (found.length < 3) return doc;
  const size = axis === "x" ? "w" : "h";
  const items = found
    .map(({ frame }) => ({ frame, shown: visualBox(frame) }))
    .sort((a, b) => a.shown[axis] - b.shown[axis] || a.frame.id.localeCompare(b.frame.id));
  const first = items[0].shown;
  const last = items[items.length - 1].shown;
  const span = last[axis] + last[size] - first[axis];
  const occupied = items.reduce((sum, item) => sum + item.shown[size], 0);
  const gap = (span - occupied) / (items.length - 1);
  const patches = new Map<string, Partial<Frame>>();
  let cursor = first[axis] + first[size] + gap;
  for (const item of items.slice(1, -1)) {
    const delta = cursor - item.shown[axis];
    if (!item.frame.locked && Math.abs(delta) > 1e-9) {
      patches.set(item.frame.id, { box: { ...item.frame.box, [axis]: item.frame.box[axis] + delta } });
    }
    cursor += item.shown[size] + gap;
  }
  return patchFrames(doc, patches);
}

/** Remove every frame in the selection, relinking threads as single deletes do. */
export function removeFrames(doc: PublicationDoc, ids: string[]): PublicationDoc {
  return ids.reduce((current, id) => removeFrame(current, id), doc);
}

/** Lock or unlock every frame in the selection. */
export function lockFrames(doc: PublicationDoc, ids: string[], locked: boolean): PublicationDoc {
  return patchFrames(doc, new Map(ids.map((id) => [id, { locked }] as [string, Partial<Frame>])));
}

/* ------------------------------ rotation ------------------------------ */

/** An angle in (-180, 180], rounded to a tenth of a degree. */
export function normaliseAngle(deg: number): number {
  let value = ((deg % 360) + 360) % 360;
  if (value > 180) value -= 360;
  return Math.round(value * 10) / 10;
}

/**
 * The rotation a frame takes when its rotate handle (above the top edge) is
 * dragged to `pointer`: the angle of the pointer around the frame centre,
 * measured from straight up. With `step` it snaps (Shift gives 15°).
 */
export function rotationFromPointer(box: Box, pointer: { x: number; y: number }, step = 0): number {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const deg = (Math.atan2(pointer.y - c.y, pointer.x - c.x) * 180) / Math.PI + 90;
  const snapped = step > 0 ? Math.round(deg / step) * step : deg;
  return normaliseAngle(snapped);
}

const OPPOSITE: Record<Handle, Handle> = { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" };

/**
 * Resize a turned frame from a handle. The pointer movement is taken in the
 * frame's own axes, and the box is shifted afterwards so the opposite handle
 * stays exactly where it was on the page.
 */
export function resizeRotated(start: Box, deg: number, handle: Handle, dx: number, dy: number, options: { keepRatio?: boolean; min?: number } = {}): Box {
  if (!deg) return resizeBox(start, handle, dx, dy, options);
  const local = rotateAround({ x: dx, y: dy }, { x: 0, y: 0 }, -deg);
  const box = resizeBox(start, handle, local.x, local.y, options);
  const anchor = OPPOSITE[handle];
  const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const before = rotateAround(handlePoint(start, anchor), centre(start), deg);
  const after = rotateAround(handlePoint(box, anchor), centre(box), deg);
  return { ...box, x: box.x + before.x - after.x, y: box.y + before.y - after.y };
}
