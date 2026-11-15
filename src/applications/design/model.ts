/* ====================================================================== *
 * Document loading, the editor's shared tool state, and SVG import.
 * ====================================================================== */

import { createStore, type Store } from "@/applications/visual/kit";
import { uid, type Viewport } from "@/applications/visual/geometry";
import {
  DEFAULT_LAYOUT, addNode, emptyPage, makeNode,
  type ColorToken, type DesignDoc, type EffectStyle, type SceneNode, type ScenePage, type TextStyle,
} from "./scene";
import { ellipseToPath } from "./path";

/* ------------------------------ tool state ------------------------------ */

export type DesignTool = "select" | "frame" | "rect" | "ellipse" | "line" | "polygon" | "pen" | "text" | "hand" | "crop" | "link";

export interface DesignUi {
  tool: DesignTool;
  selected: string[];
  view: Viewport;
  snap: boolean;
  guides: boolean;
  gridVisible: boolean;
  isolate?: string;
  /** Path node being edited on the path screen. */
  pathNodeId?: string;
  selectedAnchors: string[];
  prototypeRunning: boolean;
  prototypeAt?: string;
  breakpoint: number;
  fitRequest: number;
}

export const designUi: Store<DesignUi> = createStore<DesignUi>({
  tool: "select",
  selected: [],
  view: { x: 120, y: 80, zoom: 1 },
  snap: true,
  guides: true,
  gridVisible: true,
  selectedAnchors: [],
  prototypeRunning: false,
  breakpoint: 1440,
  fitRequest: 0,
});

export function setTool(tool: DesignTool): void {
  designUi.set((current) => ({ ...current, tool }));
}

export function setSelection(ids: string[]): void {
  designUi.set((current) => ({ ...current, selected: ids }));
}

export function toggleSelection(id: string, additive: boolean): void {
  designUi.set((current) => {
    if (!additive) return { ...current, selected: [id] };
    return { ...current, selected: current.selected.includes(id) ? current.selected.filter((item) => item !== id) : [...current.selected, id] };
  });
}

export function zoomBy(factor: number): void {
  designUi.set((current) => ({ ...current, view: { ...current.view, zoom: Math.max(0.05, Math.min(32, current.view.zoom * factor)) } }));
}

export function requestFit(): void {
  designUi.set((current) => ({ ...current, fitRequest: current.fitRequest + 1 }));
}

/* ------------------------------ document ------------------------------ */

const BRAND_COLORS: ColorToken[] = [
  { id: "tok-ink", name: "Ink", value: "#17223A", group: "Core" },
  { id: "tok-cobalt", name: "Cobalt", value: "#234FE8", group: "Core" },
  { id: "tok-aqua", name: "Aqua", value: "#36C5BA", group: "Core" },
  { id: "tok-papaya", name: "Papaya", value: "#FFAE7C", group: "Accent" },
  { id: "tok-paper", name: "Paper", value: "#F7F8FC", group: "Surface" },
  { id: "tok-slate", name: "Slate", value: "#6B7794", group: "Surface" },
];

const BRAND_TEXT: TextStyle[] = [
  { id: "ts-display", name: "Display / 40", family: "Inter", size: 40, weight: 700, lineHeight: 1.12, letterSpacing: -0.6 },
  { id: "ts-title", name: "Title / 24", family: "Inter", size: 24, weight: 650, lineHeight: 1.2, letterSpacing: -0.2 },
  { id: "ts-body", name: "Body / 16", family: "Inter", size: 16, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
  { id: "ts-caption", name: "Caption / 12", family: "Inter", size: 12, weight: 500, lineHeight: 1.35, letterSpacing: 0.2 },
];

const BRAND_EFFECTS: EffectStyle[] = [
  { id: "fx-card", name: "Card lift", shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(23,34,58,0.14)" } },
  { id: "fx-modal", name: "Overlay", shadow: { x: 0, y: 18, blur: 44, spread: 0, color: "rgba(23,34,58,0.22)" } },
];

/** Old studio body: `{ nodes: [{ id, type, x, y, w, h, fill, text }] }`. */
interface LegacyBody { nodes?: { id: string; type: string; x: number; y: number; w: number; h: number; fill: string; text: string }[] }

function isDesignDoc(body: unknown): body is DesignDoc {
  return Boolean(body && typeof body === "object" && (body as DesignDoc).version === 2 && Array.isArray((body as DesignDoc).pages));
}

/**
 * Open a design record. A record saved by the old studio editor carries a
 * flat node list; it is lifted into a page so existing files open rather
 * than being replaced.
 */
export function parseDesign(body: unknown): DesignDoc {
  if (isDesignDoc(body)) {
    return {
      ...body,
      components: body.components ?? [],
      textStyles: body.textStyles ?? BRAND_TEXT,
      colors: body.colors ?? BRAND_COLORS,
      effects: body.effects ?? BRAND_EFFECTS,
      breakpoints: body.breakpoints ?? defaultBreakpoints(),
      comments: body.comments ?? [],
      reviews: body.reviews ?? [],
      versions: body.versions ?? [],
      assets: body.assets ?? [],
      exports: body.exports ?? [],
      prototype: body.prototype ?? { device: "Desktop 1440" },
      unsupported: body.unsupported ?? [],
    };
  }

  const legacy = (body as LegacyBody | undefined)?.nodes ?? [];
  const page = emptyPage("page-1", "Page 1");
  let built = page;
  const frame = makeNode("frame", { x: 0, y: 0, w: 420, h: 260 }, { id: "frame-imported", name: "Imported artboard", radius: 12 });
  built = addNode(built, frame, page.id);
  for (const node of legacy) {
    const kind = node.type === "ellipse" ? "ellipse" : node.type === "text" ? "text" : "rect";
    const made = makeNode(kind, { x: node.x - 40, y: node.y - 40, w: node.w, h: node.h }, {
      id: node.id,
      name: node.text || (kind === "ellipse" ? "Ellipse" : kind === "text" ? "Text" : "Rectangle"),
      fill: kind === "text" ? undefined : { type: "solid", color: node.fill },
      text: kind === "text" ? node.text : undefined,
      textStyle: kind === "text"
        ? { family: "Inter", size: 28, weight: 650, lineHeight: 1.2, letterSpacing: -0.2, align: "start", color: node.fill }
        : undefined,
    });
    built = addNode(built, made, frame.id);
  }
  return {
    version: 2,
    pages: [built],
    activePageId: built.id,
    components: [],
    textStyles: BRAND_TEXT,
    colors: BRAND_COLORS,
    effects: BRAND_EFFECTS,
    breakpoints: defaultBreakpoints(),
    comments: [],
    reviews: [],
    versions: [],
    assets: [],
    exports: [],
    prototype: { device: "Desktop 1440" },
    unsupported: [],
  };
}

export function defaultBreakpoints() {
  return [
    { id: "bp-mobile", name: "Mobile", width: 390 },
    { id: "bp-tablet", name: "Tablet", width: 834 },
    { id: "bp-desktop", name: "Desktop", width: 1440 },
  ];
}

/** A new, genuinely usable starting document rather than a blank page. */
export function starterDoc(name: string): DesignDoc {
  const page = emptyPage("page-1", "Page 1");
  let built = page;
  const frame = makeNode("frame", { x: 0, y: 0, w: 960, h: 540 }, {
    id: "frame-1", name: `${name} — artboard`, radius: 16,
    fill: { type: "solid", color: "#FFFFFF" },
    layout: { ...DEFAULT_LAYOUT, direction: "vertical", gap: 20, padding: { top: 48, right: 48, bottom: 48, left: 48 } },
  });
  built = addNode(built, frame, page.id);
  built = addNode(built, makeNode("text", { x: 48, y: 48, w: 520, h: 52 }, {
    name: "Headline", text: name,
    textStyle: { family: "Inter", size: 40, weight: 700, lineHeight: 1.12, letterSpacing: -0.6, align: "start", color: "#17223A", styleId: "ts-display" },
    constraints: { h: "min", v: "min" },
  }), frame.id);
  built = addNode(built, makeNode("text", { x: 48, y: 120, w: 520, h: 72 }, {
    name: "Supporting copy",
    text: "Edit this text, add frames and shapes,\nthen export SVG or PNG from the canvas.",
    textStyle: { family: "Inter", size: 16, weight: 400, lineHeight: 1.5, letterSpacing: 0, align: "start", color: "#6B7794", styleId: "ts-body" },
    constraints: { h: "stretch", v: "min" },
  }), frame.id);
  built = addNode(built, makeNode("rect", { x: 48, y: 220, w: 200, h: 56 }, {
    name: "Primary button", radius: 10, fill: { type: "solid", color: "#234FE8" },
    shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(23,34,58,0.18)" },
  }), frame.id);
  return {
    version: 2,
    pages: [built],
    activePageId: built.id,
    components: [],
    textStyles: BRAND_TEXT,
    colors: BRAND_COLORS,
    effects: BRAND_EFFECTS,
    breakpoints: defaultBreakpoints(),
    comments: [],
    reviews: [],
    versions: [],
    assets: [],
    exports: [],
    prototype: { device: "Desktop 1440" },
    unsupported: [],
  };
}

/* ------------------------------ SVG import ------------------------------ */

export interface ImportReport {
  page: ScenePage;
  count: number;
  /** Features the importer did not reproduce, named individually. */
  unsupported: string[];
  fontsRequested: string[];
  fontsMissing: string[];
}

const UNSUPPORTED_TAGS: Record<string, string> = {
  filter: "SVG filter primitives (blur, lighting, turbulence)",
  mask: "mask elements",
  clipPath: "clip paths",
  pattern: "pattern fills",
  image: "embedded raster images",
  use: "symbol references (<use>)",
  marker: "line markers",
  foreignObject: "foreignObject content",
  switch: "conditional <switch> content",
  animate: "SMIL animation",
  animateTransform: "SMIL transform animation",
  radialGradient: "radial gradients (imported as the first stop colour)",
};

/**
 * Parse an SVG into scene nodes using the browser's own XML parser. Only the
 * geometry this editor can edit is imported; anything else is listed so the
 * import issues overlay can say exactly what was dropped.
 */
export function importSvg(text: string, pageName = "Imported"): ImportReport {
  const unsupported = new Set<string>();
  const fonts = new Set<string>();
  const parser = new DOMParser();
  const parsed = parser.parseFromString(text, "image/svg+xml");
  const error = parsed.querySelector("parsererror");
  const page = emptyPage(uid("page"), pageName);
  if (error || !parsed.documentElement || parsed.documentElement.nodeName === "parsererror") {
    return { page, count: 0, unsupported: ["The file is not valid SVG and nothing was imported."], fontsRequested: [], fontsMissing: [] };
  }
  const root = parsed.documentElement;
  for (const tag of Object.keys(UNSUPPORTED_TAGS)) {
    if (root.getElementsByTagName(tag).length > 0) unsupported.add(UNSUPPORTED_TAGS[tag]);
  }
  if (root.querySelector("[style*='mix-blend-mode']")) unsupported.add("blend modes on vector elements");

  let built = page;
  let count = 0;
  const num = (element: Element, name: string, fallback = 0) => {
    const value = Number.parseFloat(element.getAttribute(name) ?? "");
    return Number.isFinite(value) ? value : fallback;
  };
  const paint = (element: Element, name: string, fallback: string) => {
    const raw = element.getAttribute(name) ?? "";
    if (!raw || raw === "none") return raw === "none" ? "" : fallback;
    if (raw.startsWith("url(")) { unsupported.add("gradient and pattern references"); return fallback; }
    return raw;
  };

  const walk = (element: Element, offset: { x: number; y: number }) => {
    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "g") {
        const transform = child.getAttribute("transform") ?? "";
        const match = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(transform);
        if (transform && !match) unsupported.add("matrix, skew and scale transforms on groups");
        walk(child, { x: offset.x + (match ? Number.parseFloat(match[1]) : 0), y: offset.y + (match ? Number.parseFloat(match[2]) : 0) });
        continue;
      }
      if (tag === "rect") {
        built = addNode(built, makeNode("rect", { x: offset.x + num(child, "x"), y: offset.y + num(child, "y"), w: num(child, "width", 10), h: num(child, "height", 10) }, {
          name: child.getAttribute("id") || "Rectangle",
          radius: num(child, "rx"),
          fill: { type: "solid", color: paint(child, "fill", "#234FE8") || "#234FE8" },
        }), built.id);
        count += 1;
      } else if (tag === "circle" || tag === "ellipse") {
        const rx = tag === "circle" ? num(child, "r", 10) : num(child, "rx", 10);
        const ry = tag === "circle" ? num(child, "r", 10) : num(child, "ry", 10);
        built = addNode(built, makeNode("ellipse", {
          x: offset.x + num(child, "cx") - rx, y: offset.y + num(child, "cy") - ry, w: rx * 2, h: ry * 2,
        }, { name: child.getAttribute("id") || "Ellipse", fill: { type: "solid", color: paint(child, "fill", "#36C5BA") || "#36C5BA" } }), built.id);
        count += 1;
      } else if (tag === "line") {
        const x1 = num(child, "x1");
        const y1 = num(child, "y1");
        built = addNode(built, makeNode("line", { x: offset.x + x1, y: offset.y + y1, w: num(child, "x2") - x1, h: num(child, "y2") - y1 }, {
          name: "Line", stroke: { color: paint(child, "stroke", "#17223A") || "#17223A", width: num(child, "stroke-width", 1), align: "center" },
        }), built.id);
        count += 1;
      } else if (tag === "polygon" || tag === "polyline") {
        const points = (child.getAttribute("points") ?? "").trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
        if (points.length >= 3) {
          const xs = points.map((p) => p[0]);
          const ys = points.map((p) => p[1]);
          built = addNode(built, makeNode("polygon", {
            x: offset.x + Math.min(...xs), y: offset.y + Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
          }, { name: "Polygon", sides: points.length, fill: { type: "solid", color: paint(child, "fill", "#5B4DFF") || "#5B4DFF" } }), built.id);
          count += 1;
        }
        if (tag === "polyline") unsupported.add("open polylines (imported as a closed polygon)");
      } else if (tag === "path") {
        const made = importPathElement(child, offset, unsupported);
        if (made) { built = addNode(built, made, built.id); count += 1; }
      } else if (tag === "text") {
        const family = child.getAttribute("font-family")?.replace(/["']/g, "").split(",")[0]?.trim();
        if (family) fonts.add(family);
        built = addNode(built, makeNode("text", { x: offset.x + num(child, "x"), y: offset.y + num(child, "y") - num(child, "font-size", 16), w: 240, h: num(child, "font-size", 16) * 1.4 }, {
          name: "Text", text: child.textContent?.trim() ?? "",
          textStyle: {
            family: family ?? "Inter", size: num(child, "font-size", 16), weight: num(child, "font-weight", 400) || 400,
            lineHeight: 1.3, letterSpacing: num(child, "letter-spacing"), align: "start", color: paint(child, "fill", "#17223A") || "#17223A",
          },
        }), built.id);
        count += 1;
      } else if (tag === "defs" || tag === "title" || tag === "desc" || tag === "metadata" || tag === "style" || tag === "lineargradient") {
        if (tag === "style") unsupported.add("CSS inside the SVG");
      } else if (!UNSUPPORTED_TAGS[tag]) {
        unsupported.add(`<${tag}> elements`);
      }
    }
  };
  walk(root, { x: 0, y: 0 });

  const requested = [...fonts];
  const missing = requested.filter((family) => {
    if (typeof document === "undefined" || !("fonts" in document)) return false;
    try { return !document.fonts.check(`16px "${family}"`); } catch { return false; }
  });
  return { page: built, count, unsupported: [...unsupported], fontsRequested: requested, fontsMissing: missing };
}

function importPathElement(element: Element, offset: { x: number; y: number }, unsupported: Set<string>): SceneNode | null {
  const d = element.getAttribute("d") ?? "";
  if (!d) return null;
  if (/[aA]/.test(d)) unsupported.add("elliptical arc segments (A) — converted to straight segments");
  if (/[sStTqQ]/.test(d)) unsupported.add("shorthand curve segments (S, T, Q) — converted to straight segments");
  const numbers = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
  const commands = d.match(/[MmLlCcZzHhVvAaSsQqTt]/g) ?? [];
  if (numbers.length < 2) return null;
  const points: { x: number; y: number }[] = [];
  let index = 0;
  let cx = 0;
  let cy = 0;
  for (const command of commands) {
    const relative = command === command.toLowerCase();
    const step = command.toUpperCase();
    const take = (n: number) => numbers.slice(index, index + n);
    if (step === "M" || step === "L") {
      const [x, y] = take(2);
      index += 2;
      cx = relative ? cx + (x ?? 0) : (x ?? cx);
      cy = relative ? cy + (y ?? 0) : (y ?? cy);
      points.push({ x: cx, y: cy });
    } else if (step === "C") {
      const values = take(6);
      index += 6;
      cx = relative ? cx + (values[4] ?? 0) : (values[4] ?? cx);
      cy = relative ? cy + (values[5] ?? 0) : (values[5] ?? cy);
      points.push({ x: cx, y: cy });
    } else if (step === "H") {
      const [x] = take(1);
      index += 1;
      cx = relative ? cx + (x ?? 0) : (x ?? cx);
      points.push({ x: cx, y: cy });
    } else if (step === "V") {
      const [y] = take(1);
      index += 1;
      cy = relative ? cy + (y ?? 0) : (y ?? cy);
      points.push({ x: cx, y: cy });
    } else if (step === "A") {
      const values = take(7);
      index += 7;
      cx = relative ? cx + (values[5] ?? 0) : (values[5] ?? cx);
      cy = relative ? cy + (values[6] ?? 0) : (values[6] ?? cy);
      points.push({ x: cx, y: cy });
    } else if (step === "Z") {
      // close; no coordinates
    } else {
      index += 2;
    }
  }
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const fillAttr = element.getAttribute("fill");
  const node = makeNode("path", {
    x: offset.x + minX, y: offset.y + minY,
    w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY),
  }, {
    name: element.getAttribute("id") || "Path",
    fill: fillAttr && fillAttr !== "none" && !fillAttr.startsWith("url(") ? { type: "solid", color: fillAttr } : undefined,
    stroke: element.getAttribute("stroke")
      ? { color: element.getAttribute("stroke") ?? "#17223A", width: Number.parseFloat(element.getAttribute("stroke-width") ?? "1") || 1, align: "center" }
      : undefined,
  });
  node.path = {
    closed: /[zZ]/.test(d),
    fillRule: (element.getAttribute("fill-rule") as "nonzero" | "evenodd") ?? "nonzero",
    anchors: points.map((point, i) => ({
      id: uid("a"), x: point.x - minX, y: point.y - minY,
      in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, type: "corner" as const,
      ...(i === -1 ? {} : {}),
    })),
  };
  return node;
}

/** A circle path used when a screen needs a demonstrable path to edit. */
export function demoPathNode(): SceneNode {
  const node = makeNode("path", { x: 120, y: 120, w: 220, h: 180 }, { name: "Pen path", fill: { type: "solid", color: "#36C5BA" } });
  node.path = ellipseToPath(220, 180, [uid("a"), uid("a"), uid("a"), uid("a")]);
  return node;
}
