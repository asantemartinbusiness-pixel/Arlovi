/* ====================================================================== *
 * Shared 2-D geometry for the visual applications.
 *
 * Pure functions only: no React, no DOM. Everything the canvases do to a
 * shape — move, resize from a handle, rotate, snap, marquee-select, convert
 * between screen and world space — is computed here so it can be unit
 * tested and so the keyboard path and the pointer path run the same maths.
 * ====================================================================== */

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Affine matrix [a c e / b d f / 0 0 1], the same layout as SVG/canvas. */
export interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function apply(m: Mat, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) return IDENTITY;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function translation(tx: number, ty: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaling(sx: number, sy = sx): Mat {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotation(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 };
}

export function matToString(m: Mat): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

/* ------------------------------ viewport ------------------------------ */

export interface Viewport { x: number; y: number; zoom: number }

/** World → screen for a pan/zoom viewport. */
export function viewMatrix(view: Viewport): Mat {
  return { a: view.zoom, b: 0, c: 0, d: view.zoom, e: view.x, f: view.y };
}

export function screenToWorld(view: Viewport, p: Pt): Pt {
  return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
}

export function worldToScreen(view: Viewport, p: Pt): Pt {
  return { x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y };
}

/** Zoom about a fixed screen point, so the cursor stays over the same world point. */
export function zoomAt(view: Viewport, screen: Pt, factor: number, min = 0.02, max = 64): Viewport {
  const zoom = clamp(view.zoom * factor, min, max);
  const world = screenToWorld(view, screen);
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom };
}

/** Fit a world rect into a viewport of the given pixel size with padding. */
export function fitRect(rect: Rect, width: number, height: number, pad = 48): Viewport {
  const w = Math.max(rect.w, 1);
  const h = Math.max(rect.h, 1);
  const zoom = clamp(Math.min((width - pad * 2) / w, (height - pad * 2) / h), 0.02, 64);
  return {
    zoom,
    x: width / 2 - (rect.x + w / 2) * zoom,
    y: height / 2 - (rect.y + h / 2) * zoom,
  };
}

/* ------------------------------ rectangles ------------------------------ */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function rectCenter(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

export function rectFromPoints(a: Pt, b: Pt): Rect {
  return normalizeRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

export function boundsOfPoints(points: Pt[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  return boundsOfPoints(rects.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]));
}

/** The four corners of a rect after rotating `deg` about its own centre. */
export function rotatedCorners(r: Rect, deg: number): Pt[] {
  const c = rectCenter(r);
  const corners: Pt[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  return corners.map((p) => rotatePoint(p, c, deg));
}

/** Axis-aligned bounding box of a rotated rect — what a marquee must test. */
export function rotatedBounds(r: Rect, deg: number): Rect {
  return deg % 360 === 0 ? { ...r } : boundsOfPoints(rotatedCorners(r, deg));
}

export function rotatePoint(p: Pt, origin: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

export function angleBetween(origin: Pt, p: Pt): number {
  return (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI;
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ------------------------------ handles ------------------------------ */

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const HANDLE_LABEL: Record<Handle, string> = {
  nw: "top left", n: "top", ne: "top right", e: "right",
  se: "bottom right", s: "bottom", sw: "bottom left", w: "left",
};

/** Handle position in the shape's own un-rotated space. */
export function handlePoint(r: Rect, handle: Handle): Pt {
  const x = handle.includes("w") ? r.x : handle.includes("e") ? r.x + r.w : r.x + r.w / 2;
  const y = handle.startsWith("n") ? r.y : handle.startsWith("s") ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

/** Handle position on screen, honouring the shape's rotation. */
export function handleWorldPoint(r: Rect, deg: number, handle: Handle): Pt {
  return rotatePoint(handlePoint(r, handle), rectCenter(r), deg);
}

export interface ResizeOptions {
  /** Keep the original aspect ratio (shift). */
  aspect?: boolean;
  /** Resize about the centre rather than the opposite edge (alt). */
  fromCenter?: boolean;
  /** Smallest permitted edge. */
  min?: number;
}

/**
 * Resize a rect by dragging one handle. `dx`/`dy` are a world-space pointer
 * delta; for a rotated shape they are projected into the shape's own axes so
 * dragging the right handle of a shape rotated 90° still widens it.
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, deg = 0, options: ResizeOptions = {}): Rect {
  const min = options.min ?? 1;
  const rad = (-deg * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.startsWith("n");
  const south = handle.startsWith("s");

  let { x, y, w, h } = rect;
  const factor = options.fromCenter ? 2 : 1;

  if (east) w = rect.w + lx * factor;
  if (west) w = rect.w - lx * factor;
  if (south) h = rect.h + ly * factor;
  if (north) h = rect.h - ly * factor;

  if (options.aspect && rect.w > 0 && rect.h > 0 && (east || west) && (north || south)) {
    const ratio = rect.w / rect.h;
    if (Math.abs(w / ratio) > Math.abs(h)) h = w / ratio; else w = h * ratio;
  }

  w = Math.max(min, w);
  h = Math.max(min, h);

  if (options.fromCenter) {
    const c = rectCenter(rect);
    x = c.x - w / 2;
    y = c.y - h / 2;
  } else {
    if (west) x = rect.x + rect.w - w;
    if (north) y = rect.y + rect.h - h;
  }

  // A rotated shape pivots about its centre, so keep the opposite corner put
  // in rotated space rather than in axis-aligned space.
  if (deg % 360 !== 0) {
    const before = rectCenter(rect);
    const after = rectCenter({ x, y, w, h });
    const spun = rotatePoint(after, before, deg);
    x += spun.x - after.x;
    y += spun.y - after.y;
  }

  return { x, y, w, h };
}

/** Rotation in degrees for a pointer, with optional 15° stepping (shift). */
export function rotateTo(center: Pt, pointer: Pt, startAngle: number, startDeg: number, step = 0): number {
  const delta = angleBetween(center, pointer) - startAngle;
  const raw = startDeg + delta;
  const wrapped = ((raw % 360) + 360) % 360;
  return step > 0 ? Math.round(wrapped / step) * step % 360 : Math.round(wrapped * 10) / 10;
}

/* ------------------------------ snapping ------------------------------ */

export interface SnapGuide { axis: "x" | "y"; at: number; from: string; kind: "edge" | "center" | "grid" | "spacing" }

export interface SnapResult { dx: number; dy: number; guides: SnapGuide[] }

/**
 * Snap a moving rect to the edges and centres of its peers and to the grid.
 * Returns the adjustment to add to the proposed position plus the guides to
 * draw, so the canvas shows exactly why a shape jumped.
 */
export function snapRect(moving: Rect, peers: { id: string; rect: Rect }[], tolerance = 6, grid = 0): SnapResult {
  const guides: SnapGuide[] = [];
  const movingX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movingY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let bestX: { delta: number; guide: SnapGuide } | null = null;
  let bestY: { delta: number; guide: SnapGuide } | null = null;

  const consider = (
    axis: "x" | "y",
    target: number,
    own: number,
    from: string,
    kind: SnapGuide["kind"],
  ) => {
    const delta = target - own;
    if (Math.abs(delta) > tolerance) return;
    const entry = { delta, guide: { axis, at: target, from, kind } as SnapGuide };
    if (axis === "x") { if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) bestX = entry; }
    else if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) bestY = entry;
  };

  for (const peer of peers) {
    const px = [peer.rect.x, peer.rect.x + peer.rect.w / 2, peer.rect.x + peer.rect.w];
    const py = [peer.rect.y, peer.rect.y + peer.rect.h / 2, peer.rect.y + peer.rect.h];
    for (const target of px) for (const own of movingX) consider("x", target, own, peer.id, target === px[1] ? "center" : "edge");
    for (const target of py) for (const own of movingY) consider("y", target, own, peer.id, target === py[1] ? "center" : "edge");
  }

  if (grid > 0) {
    consider("x", Math.round(moving.x / grid) * grid, moving.x, "grid", "grid");
    consider("y", Math.round(moving.y / grid) * grid, moving.y, "grid", "grid");
  }

  const x = bestX as { delta: number; guide: SnapGuide } | null;
  const y = bestY as { delta: number; guide: SnapGuide } | null;
  if (x) guides.push(x.guide);
  if (y) guides.push(y.guide);
  return { dx: x ? x.delta : 0, dy: y ? y.delta : 0, guides };
}

/* ------------------------------ alignment ------------------------------ */

export type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

export function alignOffset(rect: Rect, bounds: Rect, mode: AlignMode): Pt {
  switch (mode) {
    case "left": return { x: bounds.x - rect.x, y: 0 };
    case "right": return { x: bounds.x + bounds.w - (rect.x + rect.w), y: 0 };
    case "center-x": return { x: bounds.x + bounds.w / 2 - (rect.x + rect.w / 2), y: 0 };
    case "top": return { x: 0, y: bounds.y - rect.y };
    case "bottom": return { x: 0, y: bounds.y + bounds.h - (rect.y + rect.h) };
    case "center-y": return { x: 0, y: bounds.y + bounds.h / 2 - (rect.y + rect.h / 2) };
  }
}

/** Even spacing between rects along one axis, returning each new offset. */
export function distribute(rects: { id: string; rect: Rect }[], axis: "x" | "y"): Record<string, number> {
  if (rects.length < 3) return {};
  const sorted = [...rects].sort((a, b) => (axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const size = (r: Rect) => (axis === "x" ? r.w : r.h);
  const start = axis === "x" ? sorted[0].rect.x : sorted[0].rect.y;
  const last = sorted[sorted.length - 1].rect;
  const end = (axis === "x" ? last.x + last.w : last.y + last.h);
  const total = sorted.reduce((sum, item) => sum + size(item.rect), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  const out: Record<string, number> = {};
  let cursor = start;
  for (const item of sorted) {
    out[item.id] = cursor - (axis === "x" ? item.rect.x : item.rect.y);
    cursor += size(item.rect) + gap;
  }
  return out;
}

/* ------------------------------ easing ------------------------------ */

/** Cubic-bezier easing value at `t`, Newton-solved on x like CSS does. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = (u: number) => 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
  const cy = (u: number) => 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
  const dx = (u: number) => 3 * (1 - u) * (1 - u) * x1 + 6 * u * (1 - u) * (x2 - x1) + 3 * u * u * (1 - x2);
  let u = t;
  for (let i = 0; i < 8; i += 1) {
    const diff = cx(u) - t;
    if (Math.abs(diff) < 1e-6) return cy(u);
    const slope = dx(u);
    if (Math.abs(slope) < 1e-6) break;
    u -= diff / slope;
  }
  let low = 0; let high = 1; u = t;
  for (let i = 0; i < 24; i += 1) {
    u = (low + high) / 2;
    if (cx(u) < t) low = u; else high = u;
  }
  return cy(u);
}

/** Critically-parameterised spring, sampled at a time in seconds. */
export function springValue(t: number, stiffness = 170, damping = 26, mass = 1): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/* ------------------------------ misc ------------------------------ */

export function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function uid(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}
