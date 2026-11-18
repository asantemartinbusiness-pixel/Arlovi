/* ====================================================================== *
 * Arranging frames on a page: the live area, the column grid, snapping,
 * resizing from a handle, alignment, nudging and stacking order. Pure
 * functions over the publication document, so the editor, the actions and
 * the tests all use the same geometry.
 * ====================================================================== */

import type { Box, Frame, Page, PublicationDoc } from "./flow";

/** The smallest a frame may be resized to, in points (about 3mm). */
export const MIN_FRAME = 8;

/** The live area of a page: inside the margins, mirrored for a left-hand page. */
export function pageArea(doc: PublicationDoc, pageIndex: number): Box {
  const leftHand = doc.facingPages && pageIndex % 2 === 1;
  const left = leftHand ? doc.margins.outside : doc.margins.inside;
  const right = leftHand ? doc.margins.inside : doc.margins.outside;
  return { x: left, y: doc.margins.top, w: doc.size.width - left - right, h: doc.size.height - doc.margins.top - doc.margins.bottom };
}

/** The column grid inside the live area. */
export function gridColumns(doc: PublicationDoc, pageIndex: number): Box[] {
  const area = pageArea(doc, pageIndex);
  const count = Math.max(1, Math.round(doc.columns.count));
  const width = (area.w - doc.columns.gutter * (count - 1)) / count;
  return Array.from({ length: count }, (_, column) => ({ x: area.x + column * (width + doc.columns.gutter), y: area.y, w: width, h: area.h }));
}

/** Every vertical and horizontal line a frame edge can snap to on a page. */
export function snapLines(doc: PublicationDoc, pageIndex: number, others: Box[] = []): { xs: number[]; ys: number[] } {
  const area = pageArea(doc, pageIndex);
  const xs = new Set<number>([0, doc.size.width, area.x, area.x + area.w, area.x + area.w / 2]);
  const ys = new Set<number>([0, doc.size.height, area.y, area.y + area.h, area.y + area.h / 2]);
  for (const column of gridColumns(doc, pageIndex)) { xs.add(column.x); xs.add(column.x + column.w); }
  for (const box of others) {
    xs.add(box.x); xs.add(box.x + box.w); xs.add(box.x + box.w / 2);
    ys.add(box.y); ys.add(box.y + box.h); ys.add(box.y + box.h / 2);
  }
  return { xs: [...xs].sort((a, b) => a - b), ys: [...ys].sort((a, b) => a - b) };
}

/** The nearest line within the tolerance, or undefined. */
export function nearestLine(value: number, lines: number[], tolerance: number): number | undefined {
  let best: number | undefined;
  for (const line of lines) {
    if (Math.abs(line - value) <= tolerance && (best === undefined || Math.abs(line - value) < Math.abs(best - value))) best = line;
  }
  return best;
}

/**
 * Snap a moving box: whichever of its left, centre or right edge is nearest
 * a line wins (and the same vertically). The size never changes.
 */
export function snapMove(box: Box, lines: { xs: number[]; ys: number[] }, tolerance: number): { box: Box; guideX?: number; guideY?: number } {
  const pick = (edges: number[], available: number[]) => {
    let best: { delta: number; line: number } | undefined;
    for (const edge of edges) {
      const line = nearestLine(edge, available, tolerance);
      if (line !== undefined && (!best || Math.abs(line - edge) < Math.abs(best.delta))) best = { delta: line - edge, line };
    }
    return best;
  };
  const sx = pick([box.x, box.x + box.w / 2, box.x + box.w], lines.xs);
  const sy = pick([box.y, box.y + box.h / 2, box.y + box.h], lines.ys);
  return {
    box: { ...box, x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0) },
    guideX: sx?.line,
    guideY: sy?.line,
  };
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Where a handle sits on a box. */
export function handlePoint(box: Box, handle: Handle): { x: number; y: number } {
  const x = handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : box.x + box.w / 2;
  const y = handle.startsWith("n") ? box.y : handle.startsWith("s") ? box.y + box.h : box.y + box.h / 2;
  return { x, y };
}

/**
 * Resize a box by dragging one handle by (dx, dy). The opposite edge stays
 * put; with keepRatio a corner handle keeps the starting proportions. Edges
 * that move are snapped to the given lines when a tolerance is given.
 */
export function resizeBox(
  start: Box, handle: Handle, dx: number, dy: number,
  options: { keepRatio?: boolean; lines?: { xs: number[]; ys: number[] }; tolerance?: number; min?: number } = {},
): Box {
  const min = options.min ?? MIN_FRAME;
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  const snapX = (value: number) => (options.lines && options.tolerance ? nearestLine(value, options.lines.xs, options.tolerance) ?? value : value);
  const snapY = (value: number) => (options.lines && options.tolerance ? nearestLine(value, options.lines.ys, options.tolerance) ?? value : value);
  if (handle.includes("w")) left = Math.min(snapX(start.x + dx), right - min);
  if (handle.includes("e")) right = Math.max(snapX(start.x + start.w + dx), left + min);
  if (handle.startsWith("n")) top = Math.min(snapY(start.y + dy), bottom - min);
  if (handle.startsWith("s")) bottom = Math.max(snapY(start.y + start.h + dy), top + min);

  if (options.keepRatio && handle.length === 2 && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    const width = right - left;
    const height = bottom - top;
    if (width / height > ratio) {
      const next = height * ratio;
      if (handle.includes("w")) left = right - next; else right = left + next;
    } else {
      const next = width / ratio;
      if (handle.startsWith("n")) top = bottom - next; else bottom = top + next;
    }
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export type Alignment = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Align a box to an edge or the centre of a target area. */
export function alignBox(box: Box, alignment: Alignment, target: Box): Box {
  switch (alignment) {
    case "left": return { ...box, x: target.x };
    case "hcenter": return { ...box, x: target.x + (target.w - box.w) / 2 };
    case "right": return { ...box, x: target.x + target.w - box.w };
    case "top": return { ...box, y: target.y };
    case "vcenter": return { ...box, y: target.y + (target.h - box.h) / 2 };
    case "bottom": return { ...box, y: target.y + target.h - box.h };
  }
}

/** Fit a box across columns [from, from + span) of the grid, keeping its height. */
export function fitToColumns(box: Box, columns: Box[], from: number, span: number): Box {
  if (columns.length === 0) return box;
  const first = columns[Math.max(0, Math.min(columns.length - 1, from))];
  const last = columns[Math.max(0, Math.min(columns.length - 1, from + Math.max(1, span) - 1))];
  return { ...box, x: first.x, w: last.x + last.w - first.x };
}

/** Which column the left edge of a box sits closest to. */
export function columnAt(box: Box, columns: Box[]): number {
  let best = 0;
  columns.forEach((column, index) => {
    if (Math.abs(column.x - box.x) < Math.abs(columns[best].x - box.x)) best = index;
  });
  return best;
}

/** Find a frame anywhere in the document. */
export function locateFrame(doc: PublicationDoc, id: string | undefined): { frame: Frame; pageIndex: number } | undefined {
  if (!id) return undefined;
  for (const [pageIndex, page] of doc.pages.entries()) {
    const frame = page.frames.find((item) => item.id === id);
    if (frame) return { frame, pageIndex };
  }
  return undefined;
}

export function updateFrame(doc: PublicationDoc, id: string, patch: Partial<Frame> | ((frame: Frame) => Partial<Frame>)): PublicationDoc {
  return {
    ...doc,
    pages: doc.pages.map((page) => (page.frames.some((frame) => frame.id === id)
      ? { ...page, frames: page.frames.map((frame) => (frame.id === id ? { ...frame, ...(typeof patch === "function" ? patch(frame) : patch) } : frame)) }
      : page)),
  };
}

/** Move a frame by (dx, dy) points. Locked frames stay where they are. */
export function nudgeFrame(doc: PublicationDoc, id: string, dx: number, dy: number): PublicationDoc {
  const found = locateFrame(doc, id);
  if (!found || found.frame.locked) return doc;
  return updateFrame(doc, id, (frame) => ({ box: { ...frame.box, x: frame.box.x + dx, y: frame.box.y + dy } }));
}

/**
 * Remove a frame. Any frame that flowed into it is relinked to whatever it
 * flowed into, so a thread is shortened rather than cut. A locked frame is
 * kept: locking protects it from being deleted as well as moved.
 */
export function removeFrame(doc: PublicationDoc, id: string): PublicationDoc {
  const found = locateFrame(doc, id);
  if (!found || found.frame.locked) return doc;
  const after = found.frame.next;
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      frames: page.frames.filter((frame) => frame.id !== id).map((frame) => (frame.next === id ? { ...frame, next: after } : frame)),
    })),
  };
}

/**
 * Duplicate a frame on its own page, offset by (offset, offset). A copied
 * text frame does not join the thread; it gets a copy of its story so the
 * two frames can be edited independently.
 */
export function duplicateFrame(doc: PublicationDoc, id: string, newId: string, offset = 12): { doc: PublicationDoc; id?: string } {
  const found = locateFrame(doc, id);
  if (!found) return { doc };
  const source = found.frame;
  const copy: Frame = { ...source, id: newId, next: undefined, locked: false, overriddenFrom: undefined, box: { ...source.box, x: source.box.x + offset, y: source.box.y + offset } };
  let stories = doc.stories;
  if (source.kind === "text" && source.storyId) {
    const story = doc.stories.find((item) => item.id === source.storyId);
    const storyId = `${newId}-story`;
    stories = [...doc.stories, { id: storyId, name: `${story?.name ?? "Story"} (copy)`, text: story?.text ?? "", styleByParagraph: story?.styleByParagraph }];
    copy.storyId = storyId;
  }
  return {
    id: newId,
    doc: {
      ...doc,
      stories,
      pages: doc.pages.map((page, index) => {
        if (index !== found.pageIndex) return page;
        const at = page.frames.findIndex((frame) => frame.id === id);
        const frames = [...page.frames];
        frames.splice(at + 1, 0, copy);
        return { ...page, frames };
      }),
    },
  };
}

export type StackMove = "front" | "forward" | "backward" | "back";

/** Change where a frame sits in its page's stacking order (last draws on top). */
export function restack(page: Page, id: string, move: StackMove): Page {
  const at = page.frames.findIndex((frame) => frame.id === id);
  if (at < 0) return page;
  const frames = [...page.frames];
  const [frame] = frames.splice(at, 1);
  const target = move === "front" ? frames.length
    : move === "back" ? 0
      : move === "forward" ? Math.min(frames.length, at + 1)
        : Math.max(0, at - 1);
  frames.splice(target, 0, frame);
  return { ...page, frames };
}

export function restackFrame(doc: PublicationDoc, id: string, move: StackMove): PublicationDoc {
  return { ...doc, pages: doc.pages.map((page) => (page.frames.some((frame) => frame.id === id) ? restack(page, id, move) : page)) };
}

/** A readable name for a frame in the layers list. */
export function frameLabel(doc: PublicationDoc, frame: Frame): string {
  if (frame.kind === "text") {
    const story = doc.stories.find((item) => item.id === frame.storyId);
    const first = story?.text.split("\n").find((line) => line.trim())?.trim();
    return first ? `Text · ${first.length > 28 ? `${first.slice(0, 27)}…` : first}` : "Text · empty";
  }
  if (frame.kind === "image") return frame.src ? `Image · ${frame.naturalWidth ?? "?"}×${frame.naturalHeight ?? "?"}px` : "Image · no file linked";
  if (frame.kind === "shape") return `Shape · ${frame.fill ?? "no fill"}`;
  return `Folio · ${frame.template ?? ""}`;
}

/** Change the page grid: margins in points and the column count and gutter. */
export function setGrid(
  doc: PublicationDoc,
  patch: { margins?: Partial<PublicationDoc["margins"]>; columns?: Partial<PublicationDoc["columns"]>; baselineStep?: number },
): PublicationDoc {
  const margins = { ...doc.margins, ...patch.margins };
  for (const key of Object.keys(margins) as (keyof typeof margins)[]) margins[key] = Math.max(0, margins[key]);
  const columns = { ...doc.columns, ...patch.columns };
  columns.count = Math.max(1, Math.min(12, Math.round(columns.count)));
  columns.gutter = Math.max(0, columns.gutter);
  const baseline = patch.baselineStep && patch.baselineStep > 0 ? { ...doc.baseline, step: patch.baselineStep, start: margins.top } : { ...doc.baseline, start: margins.top };
  return { ...doc, margins, columns, baseline };
}
