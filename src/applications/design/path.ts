/* ====================================================================== *
 * Bezier path model.
 *
 * A path is a list of anchors with incoming and outgoing handles stored as
 * offsets from the anchor, which is what a pen tool actually manipulates.
 * Everything here is pure so the point inspector, the keyboard nudge and the
 * pointer drag all go through the same maths.
 * ====================================================================== */

import type { Pt, Rect } from "@/applications/visual/geometry";
import { boundsOfPoints, distance } from "@/applications/visual/geometry";

export interface Anchor {
  id: string;
  x: number;
  y: number;
  /** Handle offsets relative to the anchor. */
  in: Pt;
  out: Pt;
  /** smooth keeps handles collinear; corner lets them move freely. */
  type: "smooth" | "corner" | "symmetric";
}

export interface SubPath { anchors: Anchor[]; closed: boolean }

export interface PathNodeData {
  anchors: Anchor[];
  closed: boolean;
  fillRule: "nonzero" | "evenodd";
  /**
   * Extra closed contours. Combining two shapes puts the second contour here
   * and lets the fill rule decide what is solid; see `combinePaths`.
   */
  subpaths?: SubPath[];
}

export function emptyPath(): PathNodeData {
  return { anchors: [], closed: false, fillRule: "nonzero" };
}

export function anchor(id: string, x: number, y: number, out: Pt = { x: 0, y: 0 }, type: Anchor["type"] = "smooth"): Anchor {
  return { id, x, y, in: { x: -out.x, y: -out.y }, out, type };
}

/** SVG `d` for the path, in the node's own coordinate space. */
export function pathToD(path: PathNodeData): string {
  const { anchors, closed } = path;
  if (anchors.length === 0) return "";
  const parts: string[] = [`M ${round(anchors[0].x)} ${round(anchors[0].y)}`];
  for (let index = 1; index < anchors.length; index += 1) {
    parts.push(segment(anchors[index - 1], anchors[index]));
  }
  if (closed && anchors.length > 2) {
    parts.push(segment(anchors[anchors.length - 1], anchors[0]));
    parts.push("Z");
  }
  for (const sub of path.subpaths ?? []) {
    if (sub.anchors.length === 0) continue;
    parts.push(`M ${round(sub.anchors[0].x)} ${round(sub.anchors[0].y)}`);
    for (let index = 1; index < sub.anchors.length; index += 1) parts.push(segment(sub.anchors[index - 1], sub.anchors[index]));
    if (sub.closed && sub.anchors.length > 2) {
      parts.push(segment(sub.anchors[sub.anchors.length - 1], sub.anchors[0]));
      parts.push("Z");
    }
  }
  return parts.join(" ");
}

function segment(from: Anchor, to: Anchor): string {
  const c1 = { x: from.x + from.out.x, y: from.y + from.out.y };
  const c2 = { x: to.x + to.in.x, y: to.y + to.in.y };
  const straight = from.out.x === 0 && from.out.y === 0 && to.in.x === 0 && to.in.y === 0;
  return straight
    ? `L ${round(to.x)} ${round(to.y)}`
    : `C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------ sampling ------------------------------ */

export function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Sample the whole path; used for bounds, hit testing and length. */
export function samplePath(path: PathNodeData, perSegment = 16): Pt[] {
  const out: Pt[] = [];
  const { anchors, closed } = path;
  if (anchors.length === 0) return out;
  const pairs: [Anchor, Anchor][] = [];
  for (let index = 1; index < anchors.length; index += 1) pairs.push([anchors[index - 1], anchors[index]]);
  if (closed && anchors.length > 2) pairs.push([anchors[anchors.length - 1], anchors[0]]);
  out.push({ x: anchors[0].x, y: anchors[0].y });
  for (const [from, to] of pairs) {
    const p0 = { x: from.x, y: from.y };
    const p1 = { x: from.x + from.out.x, y: from.y + from.out.y };
    const p2 = { x: to.x + to.in.x, y: to.y + to.in.y };
    const p3 = { x: to.x, y: to.y };
    for (let step = 1; step <= perSegment; step += 1) out.push(cubicPoint(p0, p1, p2, p3, step / perSegment));
  }
  for (const sub of path.subpaths ?? []) {
    out.push(...samplePath({ anchors: sub.anchors, closed: sub.closed, fillRule: path.fillRule }, perSegment));
  }
  return out;
}

export function pathBounds(path: PathNodeData): Rect {
  return boundsOfPoints(samplePath(path, 24));
}

export function pathLength(path: PathNodeData): number {
  const points = samplePath(path, 24);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return Math.round(total * 100) / 100;
}

/* ------------------------------ editing ------------------------------ */

export function movePoint(path: PathNodeData, id: string, dx: number, dy: number): PathNodeData {
  return {
    ...path,
    anchors: path.anchors.map((item) => (item.id === id ? { ...item, x: item.x + dx, y: item.y + dy } : item)),
  };
}

/** Drag a handle; smooth and symmetric anchors mirror the opposite handle. */
export function moveHandle(path: PathNodeData, id: string, which: "in" | "out", to: Pt): PathNodeData {
  return {
    ...path,
    anchors: path.anchors.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, [which]: to } as Anchor;
      if (item.type === "corner") return next;
      const other = which === "in" ? "out" : "in";
      const length = item.type === "symmetric"
        ? Math.hypot(to.x, to.y)
        : Math.hypot(item[other].x, item[other].y);
      const magnitude = Math.hypot(to.x, to.y) || 1;
      next[other] = { x: (-to.x / magnitude) * length, y: (-to.y / magnitude) * length };
      return next;
    }),
  };
}

export function setAnchorType(path: PathNodeData, id: string, type: Anchor["type"]): PathNodeData {
  return {
    ...path,
    anchors: path.anchors.map((item) => {
      if (item.id !== id) return item;
      if (type === "corner") return { ...item, type };
      const magnitude = Math.hypot(item.out.x, item.out.y) || 24;
      const angle = Math.atan2(item.out.y, item.out.x);
      const out = { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
      return { ...item, type, out, in: { x: -out.x, y: -out.y } };
    }),
  };
}

export function appendAnchor(path: PathNodeData, point: Pt, id: string): PathNodeData {
  return { ...path, anchors: [...path.anchors, anchor(id, point.x, point.y, { x: 0, y: 0 }, "corner")] };
}

export function removeAnchor(path: PathNodeData, id: string): PathNodeData {
  return { ...path, anchors: path.anchors.filter((item) => item.id !== id) };
}

/** Insert an anchor at the midpoint of the segment after `afterId`. */
export function splitSegment(path: PathNodeData, afterId: string, id: string): PathNodeData {
  const index = path.anchors.findIndex((item) => item.id === afterId);
  if (index < 0) return path;
  const from = path.anchors[index];
  const to = path.anchors[index + 1] ?? (path.closed ? path.anchors[0] : undefined);
  if (!to) return path;
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.out.x, y: from.y + from.out.y };
  const p2 = { x: to.x + to.in.x, y: to.y + to.in.y };
  const p3 = { x: to.x, y: to.y };
  const mid = cubicPoint(p0, p1, p2, p3, 0.5);
  const tangent = {
    x: (cubicPoint(p0, p1, p2, p3, 0.55).x - cubicPoint(p0, p1, p2, p3, 0.45).x) * 2,
    y: (cubicPoint(p0, p1, p2, p3, 0.55).y - cubicPoint(p0, p1, p2, p3, 0.45).y) * 2,
  };
  const made = anchor(id, mid.x, mid.y, tangent, "smooth");
  const anchors = [...path.anchors];
  anchors.splice(index + 1, 0, made);
  return { ...path, anchors };
}

/** Close the path, or join its two ends into one anchor. */
export function joinEnds(path: PathNodeData): PathNodeData {
  if (path.anchors.length < 3) return path;
  if (path.closed) return path;
  const first = path.anchors[0];
  const last = path.anchors[path.anchors.length - 1];
  if (distance(first, last) < 6) {
    return {
      ...path,
      closed: true,
      anchors: path.anchors.slice(0, -1).map((item, index) => (index === 0 ? { ...item, in: last.in } : item)),
    };
  }
  return { ...path, closed: true };
}

/**
 * Ramer–Douglas–Peucker simplification on the anchor polyline, then handles
 * re-fitted as smooth tangents. Reversible because the caller keeps the
 * previous document in the undo stack.
 */
export function simplifyPath(path: PathNodeData, tolerance = 4): PathNodeData {
  if (path.anchors.length < 3) return path;
  const keep = rdp(path.anchors, tolerance);
  const anchors = keep.map((item, index) => {
    const prev = keep[index - 1] ?? keep[keep.length - 1];
    const next = keep[index + 1] ?? keep[0];
    const tangent = { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
    return { ...item, type: "smooth" as const, out: tangent, in: { x: -tangent.x, y: -tangent.y } };
  });
  return { ...path, anchors };
}

function rdp(points: Anchor[], tolerance: number): Anchor[] {
  if (points.length < 3) return points;
  let index = 0;
  let maxDistance = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicular(points[i], first, last);
    if (d > maxDistance) { maxDistance = d; index = i; }
  }
  if (maxDistance <= tolerance) return [first, last];
  return [...rdp(points.slice(0, index + 1), tolerance).slice(0, -1), ...rdp(points.slice(index), tolerance)];
}

function perpendicular(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return distance(p, a);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / length;
}

/** Offset the path along its normals — a real outline/offset operation. */
export function offsetPath(path: PathNodeData, amount: number): PathNodeData {
  const anchors = path.anchors.map((item, index, all) => {
    const prev = all[(index - 1 + all.length) % all.length];
    const next = all[(index + 1) % all.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    const nx = -ty / length;
    const ny = tx / length;
    return { ...item, x: item.x + nx * amount, y: item.y + ny * amount };
  });
  return { ...path, anchors };
}

export function reversePath(path: PathNodeData): PathNodeData {
  return {
    ...path,
    anchors: [...path.anchors].reverse().map((item) => ({ ...item, in: item.out, out: item.in })),
  };
}

/* ------------------------------ shape conversion ------------------------------ */

export function rectToPath(w: number, h: number, radius: number, ids: string[]): PathNodeData {
  const r = Math.min(radius, Math.min(w, h) / 2);
  if (r <= 0) {
    return {
      closed: true, fillRule: "nonzero",
      anchors: [
        anchor(ids[0], 0, 0, { x: 0, y: 0 }, "corner"),
        anchor(ids[1], w, 0, { x: 0, y: 0 }, "corner"),
        anchor(ids[2], w, h, { x: 0, y: 0 }, "corner"),
        anchor(ids[3], 0, h, { x: 0, y: 0 }, "corner"),
      ],
    };
  }
  const k = r * 0.5523;
  return {
    closed: true, fillRule: "nonzero",
    anchors: [
      { id: ids[0], x: r, y: 0, in: { x: -k, y: 0 }, out: { x: w - 2 * r, y: 0 }, type: "corner" },
      { id: ids[1], x: w - r, y: 0, in: { x: -(w - 2 * r), y: 0 }, out: { x: k, y: 0 }, type: "corner" },
      { id: ids[2], x: w, y: r, in: { x: 0, y: -k }, out: { x: 0, y: h - 2 * r }, type: "corner" },
      { id: ids[3], x: w, y: h - r, in: { x: 0, y: -(h - 2 * r) }, out: { x: 0, y: k }, type: "corner" },
      { id: ids[4], x: w - r, y: h, in: { x: k, y: 0 }, out: { x: -(w - 2 * r), y: 0 }, type: "corner" },
      { id: ids[5], x: r, y: h, in: { x: w - 2 * r, y: 0 }, out: { x: -k, y: 0 }, type: "corner" },
      { id: ids[6], x: 0, y: h - r, in: { x: 0, y: k }, out: { x: 0, y: -(h - 2 * r) }, type: "corner" },
      { id: ids[7], x: 0, y: r, in: { x: 0, y: h - 2 * r }, out: { x: 0, y: -k }, type: "corner" },
    ],
  };
}

export function ellipseToPath(w: number, h: number, ids: string[]): PathNodeData {
  const rx = w / 2;
  const ry = h / 2;
  const kx = rx * 0.5523;
  const ky = ry * 0.5523;
  return {
    closed: true, fillRule: "nonzero",
    anchors: [
      { id: ids[0], x: rx, y: 0, in: { x: -kx, y: 0 }, out: { x: kx, y: 0 }, type: "symmetric" },
      { id: ids[1], x: w, y: ry, in: { x: 0, y: -ky }, out: { x: 0, y: ky }, type: "symmetric" },
      { id: ids[2], x: rx, y: h, in: { x: kx, y: 0 }, out: { x: -kx, y: 0 }, type: "symmetric" },
      { id: ids[3], x: 0, y: ry, in: { x: 0, y: ky }, out: { x: 0, y: -ky }, type: "symmetric" },
    ],
  };
}

export function polygonPoints(w: number, h: number, sides: number): Pt[] {
  const count = Math.max(3, Math.round(sides));
  const cx = w / 2;
  const cy = h / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * cx, y: cy + Math.sin(angle) * cy };
  });
}

export function polygonToPath(w: number, h: number, sides: number, ids: string[]): PathNodeData {
  return {
    closed: true, fillRule: "nonzero",
    anchors: polygonPoints(w, h, sides).map((point, index) => anchor(ids[index] ?? `p${index}`, point.x, point.y, { x: 0, y: 0 }, "corner")),
  };
}

/**
 * Combine two contours into one path node.
 *
 * This is contour composition with a fill rule, not boolean geometry: no new
 * intersection anchors are computed, so "subtract" is the even-odd rule and
 * "unite" is the non-zero rule. The screen says so where it is offered.
 */
export function combinePaths(base: PathNodeData, other: PathNodeData, offset: Pt, mode: "unite" | "subtract"): PathNodeData {
  const shifted: SubPath = {
    closed: other.closed || other.anchors.length > 2,
    anchors: other.anchors.map((item) => ({ ...item, x: item.x + offset.x, y: item.y + offset.y })),
  };
  return {
    ...base,
    closed: base.closed || base.anchors.length > 2,
    fillRule: mode === "subtract" ? "evenodd" : "nonzero",
    subpaths: [...(base.subpaths ?? []), shifted, ...(other.subpaths ?? []).map((sub) => ({
      closed: sub.closed,
      anchors: sub.anchors.map((item) => ({ ...item, x: item.x + offset.x, y: item.y + offset.y })),
    }))],
  };
}

export function subpathCount(path: PathNodeData): number {
  return 1 + (path.subpaths?.length ?? 0);
}

/** Nearest anchor to a world point, for hit testing in the pen tool. */
export function nearestAnchor(path: PathNodeData, point: Pt, within = 8): Anchor | undefined {
  let best: Anchor | undefined;
  let bestDistance = within;
  for (const item of path.anchors) {
    const d = distance(item, point);
    if (d <= bestDistance) { best = item; bestDistance = d; }
  }
  return best;
}
