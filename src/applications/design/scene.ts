/* ====================================================================== *
 * Design scene graph.
 *
 * A design file is a list of pages; each page holds a flat node table plus a
 * children index, which keeps reordering, reparenting and z-order cheap and
 * makes every operation a pure function of the document. Frames, groups,
 * components and instances are all nodes; nothing is special-cased in the
 * renderer.
 * ====================================================================== */

import { rotatedBounds, type Rect, uid, unionRects } from "@/applications/visual/geometry";
import type { PathNodeData } from "./path";

export type NodeKind =
  | "frame" | "group" | "rect" | "ellipse" | "line" | "polygon" | "path" | "text" | "instance";

export type Constraint = "min" | "max" | "center" | "stretch" | "scale";

export interface Shadow { x: number; y: number; blur: number; spread: number; color: string }

export interface Fill { type: "solid" | "linear"; color: string; to?: string; angle?: number }

export interface AutoLayout {
  direction: "horizontal" | "vertical";
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  align: "start" | "center" | "end";
  wrap: boolean;
  /** How the frame itself sizes against its content. */
  widthMode: "fixed" | "hug" | "fill";
  heightMode: "fixed" | "hug" | "fill";
}

export interface SceneNode {
  id: string;
  kind: NodeKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill?: Fill;
  stroke?: { color: string; width: number; align: "center" | "inside" | "outside"; dash?: number };
  radius?: number;
  shadow?: Shadow;
  /** text nodes */
  text?: string;
  textStyle?: { family: string; size: number; weight: number; lineHeight: number; letterSpacing: number; align: "start" | "center" | "end"; color: string; styleId?: string };
  /** path nodes */
  path?: PathNodeData;
  /** polygon nodes */
  sides?: number;
  /** auto layout on frames and groups */
  layout?: AutoLayout;
  /** per-child response to its parent resizing */
  constraints?: { h: Constraint; v: Constraint };
  /** component authoring */
  componentId?: string;
  variant?: Record<string, string>;
  overrides?: Record<string, string | number | boolean>;
  styleRefs?: { fill?: string; text?: string; effect?: string };
  /** prototype link */
  link?: { to: string; trigger: "click" | "hover" | "drag" | "key"; transition: "instant" | "dissolve" | "slide-left" | "slide-up" | "smart"; duration: number };
}

export interface ScenePage {
  id: string;
  name: string;
  background: string;
  grid: { kind: "square" | "columns"; size: number; count: number; gutter: number; visible: boolean };
  /** Parent id → ordered child ids. The root key is the page id. */
  children: Record<string, string[]>;
  nodes: Record<string, SceneNode>;
}

export interface ComponentDef {
  id: string;
  name: string;
  description: string;
  /** The authored node tree, stored as a page-shaped fragment. */
  root: string;
  nodes: Record<string, SceneNode>;
  children: Record<string, string[]>;
  properties: { name: string; values: string[] }[];
  published: boolean;
  version: number;
}

export interface TextStyle { id: string; name: string; family: string; size: number; weight: number; lineHeight: number; letterSpacing: number }
export interface ColorToken { id: string; name: string; value: string; group: string }
export interface EffectStyle { id: string; name: string; shadow: Shadow }

export interface DesignDoc {
  version: 2;
  pages: ScenePage[];
  activePageId: string;
  components: ComponentDef[];
  textStyles: TextStyle[];
  colors: ColorToken[];
  effects: EffectStyle[];
  breakpoints: { id: string; name: string; width: number }[];
  comments: { id: string; pageId: string; x: number; y: number; author: string; at: string; text: string; resolved: boolean; nodeId?: string; taskId?: string }[];
  reviews: { id: string; version: number; digest?: string; by: string; at: string; state: "approved" | "changes" | "pending"; note: string }[];
  versions: { id: string; at: string; by: string; label: string; nodeCount: number }[];
  assets: { id: string; name: string; kind: "image" | "icon"; src?: string; license: string; credit: string; width: number; height: number }[];
  exports: { id: string; nodeId: string; format: "svg" | "png"; scale: number; suffix: string }[];
  prototype: { startNodeId?: string; device: string; publication?: { state: "queued_local"; at: string; by: string; digest: string } };
  unsupported: string[];
}

/* ------------------------------ defaults ------------------------------ */

export const DEFAULT_LAYOUT: AutoLayout = {
  direction: "vertical", gap: 12,
  padding: { top: 16, right: 16, bottom: 16, left: 16 },
  align: "start", wrap: false, widthMode: "fixed", heightMode: "hug",
};

export function emptyPage(id: string, name: string): ScenePage {
  return {
    id, name, background: "#F2F4F8",
    grid: { kind: "square", size: 8, count: 12, gutter: 24, visible: true },
    children: { [id]: [] }, nodes: {},
  };
}

export function makeNode(kind: NodeKind, rect: Rect, extra: Partial<SceneNode> = {}): SceneNode {
  const base: SceneNode = {
    id: uid(kind), kind, name: KIND_LABEL[kind],
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    rotation: 0, opacity: 1, visible: true, locked: false,
    constraints: { h: "min", v: "min" },
  };
  if (kind === "frame") return { ...base, fill: { type: "solid", color: "#FFFFFF" }, radius: 0, ...extra };
  if (kind === "group") return { ...base, ...extra };
  if (kind === "text") {
    return {
      ...base, text: "Text",
      textStyle: { family: "Inter", size: 20, weight: 600, lineHeight: 1.3, letterSpacing: 0, align: "start", color: "#17223A" },
      ...extra,
    };
  }
  if (kind === "line") return { ...base, stroke: { color: "#17223A", width: 2, align: "center" }, ...extra };
  if (kind === "polygon") return { ...base, sides: 6, fill: { type: "solid", color: "#5B4DFF" }, ...extra };
  if (kind === "path") return { ...base, stroke: { color: "#17223A", width: 2, align: "center" }, ...extra };
  return { ...base, fill: { type: "solid", color: "#234FE8" }, radius: kind === "rect" ? 8 : 0, ...extra };
}

export const KIND_LABEL: Record<NodeKind, string> = {
  frame: "Frame", group: "Group", rect: "Rectangle", ellipse: "Ellipse",
  line: "Line", polygon: "Polygon", path: "Path", text: "Text", instance: "Instance",
};

/* ------------------------------ reads ------------------------------ */

export function activePage(doc: DesignDoc): ScenePage {
  return doc.pages.find((page) => page.id === doc.activePageId) ?? doc.pages[0];
}

export function childrenOf(page: ScenePage, parentId: string): SceneNode[] {
  return (page.children[parentId] ?? []).map((id) => page.nodes[id]).filter(Boolean);
}

export function parentOf(page: ScenePage, nodeId: string): string | undefined {
  for (const [parent, kids] of Object.entries(page.children)) {
    if (kids.includes(nodeId)) return parent;
  }
  return undefined;
}

/** Absolute position: node coordinates are relative to their parent frame. */
export function absoluteOffset(page: ScenePage, nodeId: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cursor = parentOf(page, nodeId);
  const seen = new Set<string>();
  while (cursor && cursor !== page.id && !seen.has(cursor)) {
    seen.add(cursor);
    const node = page.nodes[cursor];
    if (!node) break;
    x += node.x;
    y += node.y;
    cursor = parentOf(page, cursor);
  }
  return { x, y };
}

export function absoluteRect(page: ScenePage, node: SceneNode): Rect {
  const offset = absoluteOffset(page, node.id);
  return { x: node.x + offset.x, y: node.y + offset.y, w: node.w, h: node.h };
}

export function descendants(page: ScenePage, nodeId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    for (const child of page.children[id] ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(nodeId);
  return out;
}

/** Depth-first order used by the layers panel and by paint order. */
export function flatten(page: ScenePage, parentId = page.id, depth = 0): { node: SceneNode; depth: number; parentId: string }[] {
  const out: { node: SceneNode; depth: number; parentId: string }[] = [];
  for (const id of page.children[parentId] ?? []) {
    const node = page.nodes[id];
    if (!node) continue;
    out.push({ node, depth, parentId });
    if (node.kind === "frame" || node.kind === "group") out.push(...flatten(page, id, depth + 1));
  }
  return out;
}

export function isEditable(page: ScenePage, nodeId: string): boolean {
  let cursor: string | undefined = nodeId;
  const seen = new Set<string>();
  while (cursor && cursor !== page.id && !seen.has(cursor)) {
    seen.add(cursor);
    const node = page.nodes[cursor];
    if (!node) return false;
    if (node.locked || !node.visible) return false;
    cursor = parentOf(page, cursor);
  }
  return true;
}

export function selectionBounds(page: ScenePage, ids: string[]): Rect | null {
  const rects = ids.map((id) => page.nodes[id]).filter(Boolean).map((node) => rotatedBounds(absoluteRect(page, node), node.rotation));
  return rects.length === 0 ? null : unionRects(rects);
}

export function pageBounds(page: ScenePage): Rect {
  const roots = childrenOf(page, page.id);
  if (roots.length === 0) return { x: 0, y: 0, w: 1200, h: 800 };
  return unionRects(roots.map((node) => rotatedBounds(absoluteRect(page, node), node.rotation)));
}

/** Topmost node whose box contains the point, honouring locks and hiding. */
export function hitTest(page: ScenePage, point: { x: number; y: number }, options: { deep?: boolean } = {}): SceneNode | undefined {
  const order = flatten(page);
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const { node } = order[index];
    if (!node.visible || node.locked) continue;
    if (!options.deep && node.kind !== "frame" && parentOf(page, node.id) !== page.id) {
      // shallow pass still allows clicking frame children directly
    }
    const rect = absoluteRect(page, node);
    const bounds = rotatedBounds(rect, node.rotation);
    if (point.x >= bounds.x && point.x <= bounds.x + bounds.w && point.y >= bounds.y && point.y <= bounds.y + bounds.h) {
      if (node.kind === "frame" && !options.deep) {
        const inner = childrenOf(page, node.id).some((child) => {
          const childRect = absoluteRect(page, child);
          return child.visible && point.x >= childRect.x && point.x <= childRect.x + childRect.w
            && point.y >= childRect.y && point.y <= childRect.y + childRect.h;
        });
        if (inner) continue;
      }
      return node;
    }
  }
  return undefined;
}

export function marqueeHits(page: ScenePage, rect: Rect): string[] {
  return flatten(page)
    .filter(({ node }) => node.visible && !node.locked)
    .filter(({ node }) => {
      const bounds = rotatedBounds(absoluteRect(page, node), node.rotation);
      return bounds.x < rect.x + rect.w && rect.x < bounds.x + bounds.w
        && bounds.y < rect.y + rect.h && rect.y < bounds.y + bounds.h;
    })
    .map(({ node }) => node.id);
}

/* ------------------------------ writes ------------------------------ */

function withPage(doc: DesignDoc, pageId: string, change: (page: ScenePage) => ScenePage): DesignDoc {
  return { ...doc, pages: doc.pages.map((page) => (page.id === pageId ? change(page) : page)) };
}

export function updatePage(doc: DesignDoc, change: (page: ScenePage) => ScenePage): DesignDoc {
  return withPage(doc, doc.activePageId, change);
}

export function patchNode(page: ScenePage, id: string, patch: Partial<SceneNode>): ScenePage {
  const node = page.nodes[id];
  if (!node) return page;
  return { ...page, nodes: { ...page.nodes, [id]: { ...node, ...patch } } };
}

export function patchNodes(page: ScenePage, ids: string[], patch: (node: SceneNode) => Partial<SceneNode>): ScenePage {
  const nodes = { ...page.nodes };
  for (const id of ids) {
    const node = nodes[id];
    if (node) nodes[id] = { ...node, ...patch(node) };
  }
  return { ...page, nodes };
}

export function addNode(page: ScenePage, node: SceneNode, parentId = page.id, index?: number): ScenePage {
  const kids = [...(page.children[parentId] ?? [])];
  kids.splice(index ?? kids.length, 0, node.id);
  return {
    ...page,
    nodes: { ...page.nodes, [node.id]: node },
    children: { ...page.children, [parentId]: kids, ...(node.kind === "frame" || node.kind === "group" ? { [node.id]: page.children[node.id] ?? [] } : {}) },
  };
}

export function removeNodes(page: ScenePage, ids: string[]): ScenePage {
  const doomed = new Set<string>();
  for (const id of ids) {
    doomed.add(id);
    for (const child of descendants(page, id)) doomed.add(child);
  }
  const nodes = { ...page.nodes };
  const children: Record<string, string[]> = {};
  for (const id of doomed) delete nodes[id];
  for (const [parent, kids] of Object.entries(page.children)) {
    if (doomed.has(parent)) continue;
    children[parent] = kids.filter((id) => !doomed.has(id));
  }
  return { ...page, nodes, children };
}

/** Move a node inside its parent's z-order. Negative delta is backwards. */
export function reorder(page: ScenePage, id: string, delta: number): ScenePage {
  const parent = parentOf(page, id);
  if (!parent) return page;
  const kids = [...(page.children[parent] ?? [])];
  const from = kids.indexOf(id);
  if (from < 0) return page;
  const to = Math.max(0, Math.min(kids.length - 1, from + delta));
  if (to === from) return page;
  kids.splice(from, 1);
  kids.splice(to, 0, id);
  return { ...page, children: { ...page.children, [parent]: kids } };
}

export function reorderTo(page: ScenePage, id: string, index: number): ScenePage {
  const parent = parentOf(page, id);
  if (!parent) return page;
  const kids = [...(page.children[parent] ?? [])];
  const from = kids.indexOf(id);
  if (from < 0) return page;
  kids.splice(from, 1);
  kids.splice(Math.max(0, Math.min(kids.length, index)), 0, id);
  return { ...page, children: { ...page.children, [parent]: kids } };
}

/** Reparent, keeping the node's position on the page. */
export function reparent(page: ScenePage, id: string, nextParent: string, index?: number): ScenePage {
  if (id === nextParent) return page;
  if (descendants(page, id).includes(nextParent)) return page;
  const node = page.nodes[id];
  if (!node) return page;
  const before = absoluteOffset(page, id);
  const oldParent = parentOf(page, id);
  const children = { ...page.children };
  if (oldParent) children[oldParent] = (children[oldParent] ?? []).filter((kid) => kid !== id);
  const kids = [...(children[nextParent] ?? [])];
  kids.splice(index ?? kids.length, 0, id);
  children[nextParent] = kids;
  const next: ScenePage = { ...page, children };
  const after = absoluteOffset(next, id);
  return patchNode(next, id, { x: node.x + before.x - after.x, y: node.y + before.y - after.y });
}

/** Wrap a selection in a new group that hugs it. */
export function groupNodes(page: ScenePage, ids: string[], name = "Group"): { page: ScenePage; groupId: string } {
  const live = ids.filter((id) => page.nodes[id]);
  if (live.length === 0) return { page, groupId: "" };
  const parent = parentOf(page, live[0]) ?? page.id;
  const bounds = unionRects(live.map((id) => absoluteRect(page, page.nodes[id])));
  const parentOffset = parent === page.id ? { x: 0, y: 0 } : absoluteOffset(page, parent);
  const parentNode = parent === page.id ? null : page.nodes[parent];
  const originX = parentOffset.x + (parentNode?.x ?? 0);
  const originY = parentOffset.y + (parentNode?.y ?? 0);
  const group = makeNode("group", { x: bounds.x - originX, y: bounds.y - originY, w: bounds.w, h: bounds.h }, { name });
  const index = Math.min(...live.map((id) => (page.children[parent] ?? []).indexOf(id)).filter((i) => i >= 0));
  let next = addNode(page, group, parent, index < 0 ? undefined : index);
  for (const id of live) {
    const node = next.nodes[id];
    const abs = absoluteRect(next, node);
    next = reparent(next, id, group.id);
    next = patchNode(next, id, { x: abs.x - bounds.x, y: abs.y - bounds.y });
  }
  return { page: next, groupId: group.id };
}

export function ungroup(page: ScenePage, groupId: string): ScenePage {
  const group = page.nodes[groupId];
  if (!group || (group.kind !== "group" && group.kind !== "frame")) return page;
  const parent = parentOf(page, groupId) ?? page.id;
  const kids = [...(page.children[groupId] ?? [])];
  let next = page;
  const index = (page.children[parent] ?? []).indexOf(groupId);
  for (const [offset, id] of kids.entries()) {
    next = reparent(next, id, parent, index + offset);
  }
  return removeNodes(next, [groupId]);
}

export function duplicateNodes(page: ScenePage, ids: string[], offset = 16): { page: ScenePage; ids: string[] } {
  /* A layer inside another selected layer is copied with its parent, not twice. */
  const roots = ids.filter((id) => page.nodes[id] && !ids.some((other) => other !== id && descendants(page, other).includes(id)));
  let next = page;
  const made: string[] = [];
  const map = new Map<string, string>();
  for (const id of roots) {
    const parent = parentOf(page, id) ?? page.id;
    const clone = (sourceId: string, targetParent: string): void => {
      const source = page.nodes[sourceId];
      if (!source) return;
      const copy: SceneNode = {
        ...structuredCloneSafe(source),
        id: uid(source.kind),
        name: `${source.name} copy`,
        x: source.x + (sourceId === id ? offset : 0),
        y: source.y + (sourceId === id ? offset : 0),
      };
      map.set(sourceId, copy.id);
      next = addNode(next, copy, targetParent);
      for (const child of page.children[sourceId] ?? []) clone(child, copy.id);
    };
    clone(id, parent);
    const root = map.get(id);
    if (root) made.push(root);
  }
  return { page: remapLinks(next, map), ids: made };
}

/**
 * Point the prototype links of freshly copied layers at the copies of their
 * targets. A link to a layer outside the copied set keeps its target when that
 * layer is on the page, and is dropped when it is not (pasted to another page or file).
 */
function remapLinks(page: ScenePage, map: Map<string, string>): ScenePage {
  const nodes = { ...page.nodes };
  for (const copyId of map.values()) {
    const node = nodes[copyId];
    if (!node?.link) continue;
    const mapped = map.get(node.link.to);
    if (mapped) {
      nodes[copyId] = { ...node, link: { ...node.link, to: mapped } };
    } else if (!page.nodes[node.link.to]) {
      const { link: _dropped, ...rest } = node;
      nodes[copyId] = rest;
    }
  }
  return { ...page, nodes };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ------------------------------ clipboard ------------------------------ */

/** Copied layers with their descendants; roots carry page-absolute positions. */
export interface SceneClip {
  roots: string[];
  nodes: Record<string, SceneNode>;
  children: Record<string, string[]>;
}

/** Copy layers (and everything inside them) so they can be pasted on any page. */
export function copyNodes(page: ScenePage, ids: string[]): SceneClip | null {
  /* A layer inside another selected layer comes along with its parent. */
  const roots = ids.filter((id) => page.nodes[id] && !ids.some((other) => other !== id && descendants(page, other).includes(id)));
  if (roots.length === 0) return null;
  const nodes: Record<string, SceneNode> = {};
  const children: Record<string, string[]> = {};
  for (const root of roots) {
    const abs = absoluteRect(page, page.nodes[root]);
    nodes[root] = { ...structuredCloneSafe(page.nodes[root]), x: abs.x, y: abs.y };
    for (const id of descendants(page, root)) {
      nodes[id] = structuredCloneSafe(page.nodes[id]);
    }
    for (const id of [root, ...descendants(page, root)]) {
      if (page.children[id]?.length) children[id] = [...page.children[id]];
    }
  }
  return { roots, nodes, children };
}

/** Paste a clip at the top level of a page with fresh ids, offset from where it was copied. */
export function pasteNodes(page: ScenePage, clip: SceneClip, offset = 16): { page: ScenePage; ids: string[] } {
  let next = page;
  const made: string[] = [];
  const map = new Map<string, string>();
  const place = (sourceId: string, parent: string, isRoot: boolean) => {
    const source = clip.nodes[sourceId];
    if (!source) return;
    const copy: SceneNode = {
      ...structuredCloneSafe(source),
      id: uid(source.kind),
      x: source.x + (isRoot ? offset : 0),
      y: source.y + (isRoot ? offset : 0),
    };
    map.set(sourceId, copy.id);
    next = addNode(next, copy, parent);
    if (isRoot) made.push(copy.id);
    for (const child of clip.children[sourceId] ?? []) place(child, copy.id, false);
  };
  for (const root of clip.roots) place(root, page.id, true);
  return { page: remapLinks(next, map), ids: made };
}

/** Where a selection aligns: its own bounds for two or more layers, the parent frame for one. */
export function alignTarget(page: ScenePage, ids: string[]): Rect | null {
  if (ids.length >= 2) return selectionBounds(page, ids);
  if (ids.length !== 1) return null;
  const parent = parentOf(page, ids[0]);
  const parentNode = parent && parent !== page.id ? page.nodes[parent] : undefined;
  return parentNode ? absoluteRect(page, parentNode) : null;
}

/* ------------------------------ auto layout ------------------------------ */

/**
 * Lay a frame's children out along its direction, applying gap and padding
 * and resolving hug/fill. Returns a page with the children repositioned; the
 * frame grows if it hugs its content.
 */
export function applyAutoLayout(page: ScenePage, frameId: string): ScenePage {
  const frame = page.nodes[frameId];
  if (!frame?.layout) return page;
  const layout = frame.layout;
  const kids = childrenOf(page, frameId).filter((node) => node.visible);
  const horizontal = layout.direction === "horizontal";
  const innerWidth = frame.w - layout.padding.left - layout.padding.right;
  const innerHeight = frame.h - layout.padding.top - layout.padding.bottom;

  let next = page;
  let cursor = horizontal ? layout.padding.left : layout.padding.top;
  let line = 0;
  let lineExtent = 0;
  const fillCount = kids.filter((node) => (horizontal ? node.constraints?.h === "stretch" : node.constraints?.v === "stretch")).length;
  const fixedExtent = kids
    .filter((node) => !(horizontal ? node.constraints?.h === "stretch" : node.constraints?.v === "stretch"))
    .reduce((sum, node) => sum + (horizontal ? node.w : node.h), 0);
  const available = (horizontal ? innerWidth : innerHeight) - fixedExtent - layout.gap * Math.max(0, kids.length - 1);
  const fillSize = fillCount > 0 ? Math.max(8, available / fillCount) : 0;

  for (const node of kids) {
    const stretch = horizontal ? node.constraints?.h === "stretch" : node.constraints?.v === "stretch";
    const extent = stretch && fillCount > 0 ? fillSize : (horizontal ? node.w : node.h);
    const cross = horizontal ? node.h : node.w;
    const crossInner = horizontal ? innerHeight : innerWidth;
    if (layout.wrap && cursor + extent > (horizontal ? innerWidth : innerHeight) + (horizontal ? layout.padding.left : layout.padding.top)) {
      cursor = horizontal ? layout.padding.left : layout.padding.top;
      line += lineExtent + layout.gap;
      lineExtent = 0;
    }
    const crossOffset = layout.align === "center"
      ? (crossInner - cross) / 2
      : layout.align === "end" ? crossInner - cross : 0;
    const basePad = horizontal ? layout.padding.top : layout.padding.left;
    next = patchNode(next, node.id, horizontal
      ? { x: cursor, y: basePad + line + crossOffset, w: stretch ? extent : node.w }
      : { y: cursor, x: basePad + line + crossOffset, h: stretch ? extent : node.h });
    cursor += extent + layout.gap;
    lineExtent = Math.max(lineExtent, cross);
  }

  const contentExtent = Math.max(0, cursor - layout.gap) + (horizontal ? layout.padding.right : layout.padding.bottom);
  const contentCross = line + lineExtent + (horizontal ? layout.padding.bottom : layout.padding.right);
  const patch: Partial<SceneNode> = {};
  if (horizontal) {
    if (layout.widthMode === "hug") patch.w = contentExtent;
    if (layout.heightMode === "hug") patch.h = contentCross + layout.padding.top;
  } else {
    if (layout.heightMode === "hug") patch.h = contentExtent;
    if (layout.widthMode === "hug") patch.w = contentCross + layout.padding.left;
  }
  return Object.keys(patch).length ? patchNode(next, frameId, patch) : next;
}

/** Conflicts a mixed fixed/responsive child set produces, named plainly. */
export function layoutConflicts(page: ScenePage, frameId: string): string[] {
  const frame = page.nodes[frameId];
  if (!frame?.layout) return [];
  const kids = childrenOf(page, frameId);
  const out: string[] = [];
  const horizontal = frame.layout.direction === "horizontal";
  const inner = (horizontal ? frame.w - frame.layout.padding.left - frame.layout.padding.right : frame.h - frame.layout.padding.top - frame.layout.padding.bottom);
  const needed = kids.reduce((sum, node) => sum + (horizontal ? node.w : node.h), 0) + frame.layout.gap * Math.max(0, kids.length - 1);
  if (needed > inner && !frame.layout.wrap) {
    out.push(`Children need ${Math.round(needed)}px along the ${horizontal ? "horizontal" : "vertical"} axis but the frame offers ${Math.round(inner)}px. Turn wrapping on, reduce the gap, or set a child to fill.`);
  }
  if (frame.layout.widthMode === "hug" && kids.some((node) => node.constraints?.h === "stretch")) {
    out.push("A child set to fill cannot resolve inside a frame that hugs its width: the frame would size to the child and the child to the frame.");
  }
  if (frame.layout.heightMode === "hug" && kids.some((node) => node.constraints?.v === "stretch")) {
    out.push("A child set to fill cannot resolve inside a frame that hugs its height.");
  }
  return out;
}

/** Resize a frame and let each child answer with its own constraint. */
export function resizeFrame(page: ScenePage, frameId: string, width: number, height: number): ScenePage {
  const frame = page.nodes[frameId];
  if (!frame) return page;
  const scaleX = frame.w === 0 ? 1 : width / frame.w;
  const scaleY = frame.h === 0 ? 1 : height / frame.h;
  let next = patchNode(page, frameId, { w: width, h: height });
  for (const child of childrenOf(page, frameId)) {
    const h = child.constraints?.h ?? "min";
    const v = child.constraints?.v ?? "min";
    const patch: Partial<SceneNode> = {};
    if (h === "max") patch.x = width - (frame.w - child.x - child.w) - child.w;
    else if (h === "center") patch.x = (width - child.w) / 2;
    else if (h === "stretch") { patch.x = child.x; patch.w = Math.max(1, width - child.x - (frame.w - child.x - child.w)); }
    else if (h === "scale") { patch.x = child.x * scaleX; patch.w = child.w * scaleX; }
    if (v === "max") patch.y = height - (frame.h - child.y - child.h) - child.h;
    else if (v === "center") patch.y = (height - child.h) / 2;
    else if (v === "stretch") { patch.y = child.y; patch.h = Math.max(1, height - child.y - (frame.h - child.y - child.h)); }
    else if (v === "scale") { patch.y = child.y * scaleY; patch.h = child.h * scaleY; }
    if (Object.keys(patch).length) next = patchNode(next, child.id, patch);
  }
  const updated = next.nodes[frameId];
  return updated.layout ? applyAutoLayout(next, frameId) : next;
}

/* ------------------------------ components ------------------------------ */

export function createComponent(doc: DesignDoc, nodeId: string, name: string): { doc: DesignDoc; componentId: string } {
  const page = activePage(doc);
  const node = page.nodes[nodeId];
  if (!node) return { doc, componentId: "" };
  const ids = [nodeId, ...descendants(page, nodeId)];
  const nodes: Record<string, SceneNode> = {};
  const children: Record<string, string[]> = {};
  for (const id of ids) {
    nodes[id] = structuredCloneSafe(page.nodes[id]);
    children[id] = [...(page.children[id] ?? [])];
  }
  nodes[nodeId] = { ...nodes[nodeId], x: 0, y: 0 };
  const component: ComponentDef = {
    id: uid("cmp"), name, description: `Created from ${node.name}.`,
    root: nodeId, nodes, children, properties: [], published: false, version: 1,
  };
  const withInstance = updatePage(doc, (current) => patchNode(current, nodeId, { kind: "instance", componentId: component.id, name, overrides: {} }));
  return { doc: { ...withInstance, components: [...withInstance.components, component] }, componentId: component.id };
}

export function instantiate(doc: DesignDoc, componentId: string, at: { x: number; y: number }, parentId?: string): { doc: DesignDoc; nodeId: string } {
  const component = doc.components.find((item) => item.id === componentId);
  const page = activePage(doc);
  if (!component) return { doc, nodeId: "" };
  const root = component.nodes[component.root];
  const instance = makeNode("instance", { x: at.x, y: at.y, w: root.w, h: root.h }, {
    name: component.name, componentId, overrides: {}, fill: root.fill, radius: root.radius,
  });
  const next = updatePage(doc, (current) => addNode(current, instance, parentId ?? page.id));
  return { doc: next, nodeId: instance.id };
}

/** Which instances a component change touches — shown before publishing. */
export function instancesOf(doc: DesignDoc, componentId: string): { pageId: string; pageName: string; node: SceneNode }[] {
  const out: { pageId: string; pageName: string; node: SceneNode }[] = [];
  for (const page of doc.pages) {
    for (const node of Object.values(page.nodes)) {
      if (node.kind === "instance" && node.componentId === componentId) out.push({ pageId: page.id, pageName: page.name, node });
    }
  }
  return out;
}

/** Detach an instance: the component's nodes become ordinary nodes. */
export function detachInstance(doc: DesignDoc, nodeId: string): DesignDoc {
  const page = activePage(doc);
  const node = page.nodes[nodeId];
  const component = doc.components.find((item) => item.id === node?.componentId);
  if (!node || !component) return doc;
  const parent = parentOf(page, nodeId) ?? page.id;
  let next = removeNodes(page, [nodeId]);
  const map = new Map<string, string>();
  const copy = (sourceId: string, targetParent: string, offset: { x: number; y: number }) => {
    const source = component.nodes[sourceId];
    if (!source) return;
    const made: SceneNode = {
      ...structuredCloneSafe(source),
      id: uid(source.kind),
      x: source.x + offset.x,
      y: source.y + offset.y,
    };
    map.set(sourceId, made.id);
    next = addNode(next, made, targetParent);
    for (const child of component.children[sourceId] ?? []) copy(child, made.id, { x: 0, y: 0 });
  };
  copy(component.root, parent, { x: node.x, y: node.y });
  const rootId = map.get(component.root);
  if (rootId) next = patchNode(next, rootId, { name: `${component.name} (detached)` });
  return withPage(doc, page.id, () => next);
}

/** Duplication the library screen reports: identical geometry and fill. */
export function findDuplicates(page: ScenePage): { signature: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const node of Object.values(page.nodes)) {
    if (node.kind === "frame" || node.kind === "group") continue;
    const key = `${node.kind}:${Math.round(node.w)}x${Math.round(node.h)}:${node.fill?.color ?? "none"}:${node.radius ?? 0}:${node.text ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), node.id]);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([signature, ids]) => ({ signature, ids }));
}

/* ------------------------------ contrast ------------------------------ */

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

export function wcagGrade(ratio: number, large: boolean): "AAA" | "AA" | "fail" {
  if (ratio >= (large ? 4.5 : 7)) return "AAA";
  if (ratio >= (large ? 3 : 4.5)) return "AA";
  return "fail";
}

/* ------------------------------ fonts ------------------------------ */

/** Fonts the browser can actually measure, checked rather than assumed. */
export function fontAvailable(family: string): boolean {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  try { return document.fonts.check(`16px "${family}"`); } catch { return false; }
}

export const FONT_STACK = ["Inter", "Georgia", "Courier New", "Times New Roman", "Arial", "Helvetica Neue", "Avenir Next", "Söhne"];
