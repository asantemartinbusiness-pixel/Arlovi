/* ====================================================================== *
 * Slide deck model.
 *
 * Replaces audit finding A13 — a deck editor that could only edit the first
 * element's text on the first slide. Every slide owns an object graph; every
 * object has geometry, rotation, z-order and its own typed content. Commands
 * are pure so undo/redo is a stack of models and the model can be unit
 * tested in node.
 * ====================================================================== */

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export type ObjectType = "text" | "image" | "shape" | "chart" | "table";
export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "line" | "arrow";

export interface TextContent {
  text: string;
  size: number;
  weight: 300 | 400 | 500 | 600 | 650 | 700;
  align: "start" | "center" | "end";
  valign: "start" | "center" | "end";
  colourToken: ThemeColourToken;
  italic?: boolean;
  /** Roles a layout placeholder fills; a master can restyle them. */
  role?: "title" | "subtitle" | "body" | "caption" | "eyebrow";
}

export interface ImageContent {
  /** Record id of an asset in this workspace. Images are held by reference. */
  assetId?: string;
  alt: string;
  fit: "cover" | "contain";
  /** Set when an import could not resolve the original media. */
  substituted?: string;
}

export interface ShapeContent {
  kind: ShapeKind;
  fillToken: ThemeColourToken;
  strokeToken?: ThemeColourToken;
  strokeWidth: number;
  radius: number;
  opacity: number;
}

export interface ChartContent {
  kind: "bar" | "line" | "donut";
  title: string;
  series: { name: string; points: { label: string; value: number }[] }[];
  /** Workbook the numbers came from, when they were linked. */
  sourceWorkbookId?: string;
  sourceSheetName?: string;
  sourceRef?: string;
  capturedAt?: string;
  linked: boolean;
  /** Draw each value on the chart, not only in the accessible table. */
  showLabels?: boolean;
}

export interface TableContent {
  header: boolean;
  rows: string[][];
}

export interface SlideObject {
  id: string;
  type: ObjectType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  locked?: boolean;
  /** Set when the object was changed away from its layout placeholder. */
  customised?: boolean;
  animation?: ObjectAnimation;
  text?: TextContent;
  image?: ImageContent;
  shape?: ShapeContent;
  chart?: ChartContent;
  table?: TableContent;
}

export interface ObjectAnimation {
  effect: "none" | "fade" | "riseUp" | "slideLeft" | "scaleIn";
  /** Order within the slide's build sequence, 1-based. */
  order: number;
  durationMs: number;
  delayMs: number;
  easing: "linear" | "ease-out" | "ease-in-out";
  trigger: "onAppear" | "onClick";
}

export type ThemeColourToken = "ink" | "muted" | "background" | "surface" | "accent" | "accentInk" | "support" | "line";

export interface Theme {
  id: string;
  name: string;
  colours: Record<ThemeColourToken, string>;
  headingFont: string;
  bodyFont: string;
  headingScale: number;
  /** Fonts requested by an import that are not available locally. */
  fontSubstitutions: { requested: string; used: string }[];
}

export interface LayoutPlaceholder {
  role: NonNullable<TextContent["role"]> | "image" | "chart" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  size?: number;
  weight?: TextContent["weight"];
  align?: TextContent["align"];
  colourToken?: ThemeColourToken;
}

export interface Layout {
  id: string;
  name: string;
  backgroundToken: ThemeColourToken;
  placeholders: LayoutPlaceholder[];
  /** Decoration drawn by the master, not editable on the slide. */
  decoration?: { kind: ShapeKind; x: number; y: number; w: number; h: number; fillToken: ThemeColourToken; opacity: number }[];
}

export interface SlideTransition {
  effect: "none" | "fade" | "push" | "wipe";
  durationMs: number;
  easing: "linear" | "ease-out" | "ease-in-out";
}

export interface Slide {
  id: string;
  title: string;
  layoutId: string;
  objects: SlideObject[];
  notes: string;
  transition: SlideTransition;
  /** Hidden slides stay in the deck but are skipped when presenting. */
  hidden?: boolean;
  /** Rehearsal target in seconds. */
  targetSeconds?: number;
}

export interface DeckComment {
  id: string;
  slideId: string;
  objectId?: string;
  author: string;
  at: string;
  body: string;
  resolved: boolean;
}

export interface Deck {
  theme: Theme;
  themes: Theme[];
  layouts: Layout[];
  slides: Slide[];
  index: number;
  comments: DeckComment[];
  approvals: { id: string; reviewer: string; at: string; decision: "approved" | "changes" ; note: string }[];
  /** Export and share actions recorded against the deck. */
  exports: { id: string; at: string; format: string; note: string; scope?: "workspace" | "link"; revokedAt?: string }[];
  /** Honest record of what an import could not reproduce. */
  importNotes: string[];
  reduceMotion: boolean;
}

/* ----------------------------- Ids ----------------------------- */

let counter = 0;
export function nextId(prefix = "ob"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ----------------------------- Themes & layouts ----------------------------- */

export const THEMES: Theme[] = [
  {
    id: "northline",
    name: "Northline",
    colours: {
      ink: "#1A1917", muted: "#54514B", background: "#F6F4F0", surface: "#FFFFFF",
      accent: "#234FE8", accentInk: "#FFFFFF", support: "#36C5BA", line: "#CAC5BA",
    },
    headingFont: "IBM Plex Sans Condensed", bodyFont: "Inter", headingScale: 1, fontSubstitutions: [],
  },
  {
    id: "harbor",
    name: "Harbor night",
    colours: {
      ink: "#F7F5F1", muted: "#CAC5BA", background: "#1A1917", surface: "#282724",
      accent: "#36C5BA", accentInk: "#1A1917", support: "#FFAE7C", line: "#3C3A35",
    },
    headingFont: "IBM Plex Sans Condensed", bodyFont: "Inter", headingScale: 1.05, fontSubstitutions: [],
  },
  {
    id: "paper",
    name: "Paper",
    colours: {
      ink: "#282724", muted: "#6F6B64", background: "#FCFBF9", surface: "#EDEAE4",
      accent: "#D9521A", accentInk: "#FCFBF9", support: "#FFAE7C", line: "#E0DCD4",
    },
    headingFont: "IBM Plex Sans Condensed", bodyFont: "Inter", headingScale: 0.95, fontSubstitutions: [],
  },
];

export const LAYOUTS: Layout[] = [
  {
    id: "title",
    name: "Title",
    backgroundToken: "background",
    placeholders: [
      { role: "eyebrow", x: 96, y: 150, w: 600, h: 34, size: 18, weight: 500, colourToken: "accent" },
      { role: "title", x: 96, y: 192, w: 740, h: 130, size: 60, weight: 700, colourToken: "ink" },
      { role: "subtitle", x: 96, y: 332, w: 640, h: 64, size: 22, weight: 400, colourToken: "muted" },
    ],
    decoration: [{ kind: "rect", x: 96, y: 128, w: 72, h: 6, fillToken: "accent", opacity: 1 }],
  },
  {
    id: "titleBody",
    name: "Title and body",
    backgroundToken: "background",
    placeholders: [
      { role: "title", x: 80, y: 72, w: 800, h: 72, size: 40, weight: 650, colourToken: "ink" },
      { role: "body", x: 80, y: 168, w: 800, h: 300, size: 22, weight: 400, colourToken: "muted" },
    ],
  },
  {
    id: "twoColumn",
    name: "Two columns",
    backgroundToken: "background",
    placeholders: [
      { role: "title", x: 80, y: 64, w: 800, h: 64, size: 36, weight: 650, colourToken: "ink" },
      { role: "body", x: 80, y: 156, w: 380, h: 300, size: 20, weight: 400, colourToken: "muted" },
      { role: "caption", x: 500, y: 156, w: 380, h: 300, size: 20, weight: 400, colourToken: "muted" },
    ],
  },
  {
    id: "statement",
    name: "Statement",
    backgroundToken: "accent",
    placeholders: [
      { role: "title", x: 110, y: 180, w: 740, h: 180, size: 52, weight: 700, align: "center", colourToken: "accentInk" },
    ],
  },
  {
    id: "chart",
    name: "Chart",
    backgroundToken: "background",
    placeholders: [
      { role: "title", x: 80, y: 56, w: 800, h: 56, size: 32, weight: 650, colourToken: "ink" },
      { role: "chart", x: 80, y: 132, w: 800, h: 330 },
      { role: "caption", x: 80, y: 476, w: 800, h: 32, size: 15, weight: 400, colourToken: "muted" },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    backgroundToken: "background",
    placeholders: [],
  },
];

export function layoutById(deck: Deck, id: string): Layout {
  return deck.layouts.find((layout) => layout.id === id) ?? deck.layouts[0] ?? LAYOUTS[1];
}

/* ----------------------------- Construction ----------------------------- */

export function textObject(role: NonNullable<TextContent["role"]>, text: string, placeholder: LayoutPlaceholder, z: number): SlideObject {
  return {
    id: nextId("tx"),
    type: "text",
    name: `${role.charAt(0).toUpperCase()}${role.slice(1)} text`,
    x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h,
    rotation: 0, z,
    text: {
      text,
      size: placeholder.size ?? 22,
      weight: placeholder.weight ?? 400,
      align: placeholder.align ?? "start",
      valign: "start",
      colourToken: placeholder.colourToken ?? "ink",
      role,
    },
  };
}

export function slideFromLayout(layout: Layout, title: string, fill: Partial<Record<string, string>> = {}): Slide {
  const objects: SlideObject[] = [];
  let z = 1;
  for (const placeholder of layout.placeholders) {
    if (placeholder.role === "image") {
      objects.push({
        id: nextId("im"), type: "image", name: "Image", x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h,
        rotation: 0, z: z += 1, image: { alt: "Describe this image", fit: "cover" },
      });
      continue;
    }
    if (placeholder.role === "chart") {
      objects.push({
        id: nextId("ch"), type: "chart", name: "Chart", x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h,
        rotation: 0, z: z += 1,
        chart: { kind: "bar", title: "Chart", series: [], linked: false },
      });
      continue;
    }
    if (placeholder.role === "table") {
      objects.push({
        id: nextId("tb"), type: "table", name: "Table", x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h,
        rotation: 0, z: z += 1, table: { header: true, rows: [["Column", "Column"], ["", ""]] },
      });
      continue;
    }
    const value = fill[placeholder.role] ?? (placeholder.role === "title" ? title : "");
    objects.push(textObject(placeholder.role, value, placeholder, z += 1));
  }
  return {
    id: nextId("sl"),
    title,
    layoutId: layout.id,
    objects,
    notes: "",
    transition: { effect: "fade", durationMs: 300, easing: "ease-out" },
  };
}

interface LegacyElement { id?: string; type?: string; x?: number; y?: number; w?: number; h?: number; text?: string; fill?: string }
interface LegacySlide { id?: string; title?: string; elements?: LegacyElement[]; objects?: SlideObject[]; notes?: string; layoutId?: string; transition?: SlideTransition; hidden?: boolean; targetSeconds?: number }

/** Load any stored deck body into the current model. */
type StoredDeck = Omit<Partial<Deck>, "slides" | "theme"> & {
  theme?: Partial<Theme> & { background?: string; ink?: string; accent?: string };
  slides?: LegacySlide[];
};

export function readDeck(body: unknown): Deck {
  const source = (body ?? {}) as StoredDeck;
  const themes = source.themes?.length ? source.themes : THEMES;
  let theme: Theme;
  const storedTheme = source.theme;
  if (storedTheme?.colours && storedTheme.id) {
    theme = { ...THEMES[0], ...storedTheme, colours: { ...THEMES[0].colours, ...storedTheme.colours } } as Theme;
  } else if (storedTheme?.background || storedTheme?.ink || storedTheme?.accent) {
    theme = {
      ...THEMES[0],
      id: "imported",
      name: "Imported theme",
      colours: {
        ...THEMES[0].colours,
        background: storedTheme.background ?? THEMES[0].colours.background,
        surface: storedTheme.background ?? THEMES[0].colours.surface,
        ink: storedTheme.ink ?? THEMES[0].colours.ink,
        accent: storedTheme.accent ?? THEMES[0].colours.accent,
      },
    };
  } else theme = THEMES[0];

  const layouts = source.layouts?.length ? source.layouts : LAYOUTS;
  const slides: Slide[] = (source.slides ?? []).map((raw, index) => {
    if (Array.isArray(raw.objects)) {
      return {
        id: raw.id ?? nextId("sl"),
        title: raw.title ?? `Slide ${index + 1}`,
        layoutId: raw.layoutId ?? layouts[1]?.id ?? "titleBody",
        objects: raw.objects.map((object, order) => ({ ...object, z: object.z ?? order + 1, rotation: object.rotation ?? 0 })),
        notes: raw.notes ?? "",
        transition: raw.transition ?? { effect: "fade", durationMs: 300, easing: "ease-out" },
        hidden: raw.hidden,
        targetSeconds: raw.targetSeconds,
      };
    }
    const objects: SlideObject[] = (raw.elements ?? []).map((element, order) => {
      if (element.type === "shape") {
        return {
          id: element.id ?? nextId("sh"), type: "shape", name: "Shape",
          x: element.x ?? 80, y: element.y ?? 80, w: element.w ?? 180, h: element.h ?? 100,
          rotation: 0, z: order + 1,
          shape: { kind: "roundRect", fillToken: "accent", strokeWidth: 0, radius: 12, opacity: 1 },
        };
      }
      return {
        id: element.id ?? nextId("tx"), type: "text", name: "Text",
        x: element.x ?? 80, y: element.y ?? 80, w: element.w ?? 420, h: element.h ?? 80,
        rotation: 0, z: order + 1,
        text: { text: element.text ?? "", size: order === 0 ? 34 : 22, weight: order === 0 ? 650 : 400, align: "start", valign: "start", colourToken: "ink", role: order === 0 ? "title" : "body" },
      };
    });
    return {
      id: raw.id ?? nextId("sl"),
      title: raw.title ?? `Slide ${index + 1}`,
      layoutId: layouts[1]?.id ?? "titleBody",
      objects,
      notes: raw.notes ?? "",
      transition: { effect: "fade", durationMs: 300, easing: "ease-out" },
    };
  });

  if (slides.length === 0) slides.push(slideFromLayout(layouts[0] ?? LAYOUTS[0], "Untitled slide"));

  return {
    theme,
    themes,
    layouts,
    slides,
    index: Math.min(Math.max(0, source.index ?? 0), slides.length - 1),
    comments: source.comments ?? [],
    approvals: source.approvals ?? [],
    exports: source.exports ?? [],
    importNotes: source.importNotes ?? [],
    reduceMotion: source.reduceMotion ?? false,
  };
}

/* ----------------------------- Slide commands ----------------------------- */

export function currentSlide(deck: Deck): Slide {
  return deck.slides[Math.min(deck.index, deck.slides.length - 1)] ?? deck.slides[0];
}

export function replaceSlide(deck: Deck, slide: Slide): Deck {
  return { ...deck, slides: deck.slides.map((item) => (item.id === slide.id ? slide : item)) };
}

export function addSlide(deck: Deck, layoutId: string, after: number): Deck {
  const layout = layoutById(deck, layoutId);
  const slide = slideFromLayout(layout, "New slide");
  const at = Math.min(deck.slides.length, after + 1);
  return { ...deck, slides: [...deck.slides.slice(0, at), slide, ...deck.slides.slice(at)], index: at };
}

export function duplicateSlide(deck: Deck, slideId: string): Deck {
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return deck;
  const source = deck.slides[index];
  const copy: Slide = {
    ...source,
    id: nextId("sl"),
    title: `${source.title} copy`,
    objects: source.objects.map((object) => ({ ...object, id: nextId(object.type.slice(0, 2)) })),
  };
  return { ...deck, slides: [...deck.slides.slice(0, index + 1), copy, ...deck.slides.slice(index + 1)], index: index + 1 };
}

export function removeSlide(deck: Deck, slideId: string): Deck {
  if (deck.slides.length <= 1) return deck;
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  const slides = deck.slides.filter((slide) => slide.id !== slideId);
  return {
    ...deck,
    slides,
    index: Math.max(0, Math.min(index, slides.length - 1)),
    comments: deck.comments.filter((comment) => comment.slideId !== slideId),
  };
}

export function moveSlide(deck: Deck, slideId: string, toIndex: number): Deck {
  const from = deck.slides.findIndex((slide) => slide.id === slideId);
  if (from < 0) return deck;
  const target = Math.max(0, Math.min(deck.slides.length - 1, toIndex));
  if (target === from) return deck;
  const slides = [...deck.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(target, 0, moved);
  return { ...deck, slides, index: target };
}

/**
 * Re-apply a layout to a slide. Objects the author changed are kept where
 * they are and reported, which is the PRESENT-003 edge case: a theme or
 * master change must not silently overwrite customised objects.
 */
export function applyLayout(deck: Deck, slideId: string, layoutId: string, force: boolean): { deck: Deck; kept: string[] } {
  const slide = deck.slides.find((item) => item.id === slideId);
  if (!slide) return { deck, kept: [] };
  const layout = layoutById(deck, layoutId);
  const kept: string[] = [];
  const objects = slide.objects.map((object) => {
    const role = object.type === "text" ? object.text?.role : object.type === "image" ? "image" : object.type === "chart" ? "chart" : object.type === "table" ? "table" : undefined;
    const placeholder = role ? layout.placeholders.find((item) => item.role === role) : undefined;
    if (!placeholder) return object;
    if (object.customised && !force) { kept.push(object.name); return object; }
    const next: SlideObject = { ...object, x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h, customised: false };
    if (next.type === "text" && next.text) {
      next.text = {
        ...next.text,
        size: placeholder.size ?? next.text.size,
        weight: placeholder.weight ?? next.text.weight,
        align: placeholder.align ?? next.text.align,
        colourToken: placeholder.colourToken ?? next.text.colourToken,
      };
    }
    return next;
  });
  const missing = layout.placeholders.filter((placeholder) => !objects.some((object) => (
    (object.type === "text" && object.text?.role === placeholder.role)
    || (object.type === "image" && placeholder.role === "image")
    || (object.type === "chart" && placeholder.role === "chart")
    || (object.type === "table" && placeholder.role === "table")
  )));
  let z = objects.reduce((max, object) => Math.max(max, object.z), 0);
  for (const placeholder of missing) {
    if (placeholder.role === "image" || placeholder.role === "chart" || placeholder.role === "table") continue;
    objects.push(textObject(placeholder.role, placeholder.role === "title" ? slide.title : "", placeholder, z += 1));
  }
  return { deck: replaceSlide({ ...deck }, { ...slide, layoutId, objects }), kept };
}

/** Objects on a slide that have been changed away from their layout. */
export function customisedObjects(deck: Deck, slide: Slide): SlideObject[] {
  const layout = layoutById(deck, slide.layoutId);
  return slide.objects.filter((object) => {
    if (object.customised) return true;
    const role = object.type === "text" ? object.text?.role : undefined;
    const placeholder = role ? layout.placeholders.find((item) => item.role === role) : undefined;
    if (!placeholder) return false;
    return object.x !== placeholder.x || object.y !== placeholder.y || object.w !== placeholder.w || object.h !== placeholder.h;
  });
}

/* ----------------------------- Object commands ----------------------------- */

export function updateObjects(slide: Slide, ids: string[], patch: (object: SlideObject) => SlideObject): Slide {
  return { ...slide, objects: slide.objects.map((object) => (ids.includes(object.id) ? patch(object) : object)) };
}

export function addObject(slide: Slide, object: SlideObject): Slide {
  const z = slide.objects.reduce((max, item) => Math.max(max, item.z), 0) + 1;
  return { ...slide, objects: [...slide.objects, { ...object, z }] };
}

export function removeObjects(slide: Slide, ids: string[]): Slide {
  return { ...slide, objects: slide.objects.filter((object) => !ids.includes(object.id) || object.locked) };
}

export function reorder(slide: Slide, ids: string[], move: "front" | "back" | "forward" | "backward"): Slide {
  const sorted = [...slide.objects].sort((a, b) => a.z - b.z);
  if (move === "front" || move === "back") {
    const moving = sorted.filter((object) => ids.includes(object.id));
    const rest = sorted.filter((object) => !ids.includes(object.id));
    const ordered = move === "front" ? [...rest, ...moving] : [...moving, ...rest];
    return { ...slide, objects: ordered.map((object, index) => ({ ...object, z: index + 1 })) };
  }
  const step = move === "forward" ? 1 : -1;
  const ordered = [...sorted];
  const indexes = ordered
    .map((object, index) => ({ object, index }))
    .filter((entry) => ids.includes(entry.object.id))
    .map((entry) => entry.index);
  const sequence = step > 0 ? [...indexes].reverse() : indexes;
  for (const index of sequence) {
    const target = index + step;
    if (target < 0 || target >= ordered.length) continue;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }
  return { ...slide, objects: ordered.map((object, index) => ({ ...object, z: index + 1 })) };
}

/* ----------------------------- Geometry, guides, snapping ----------------------------- */

export interface Box { x: number; y: number; w: number; h: number }

export function boundingBox(objects: SlideObject[]): Box | null {
  if (objects.length === 0) return null;
  const x = Math.min(...objects.map((object) => object.x));
  const y = Math.min(...objects.map((object) => object.y));
  const right = Math.max(...objects.map((object) => object.x + object.w));
  const bottom = Math.max(...objects.map((object) => object.y + object.h));
  return { x, y, w: right - x, h: bottom - y };
}

export interface Guide { axis: "x" | "y"; at: number; kind: "edge" | "centre" | "canvas" }

export const SNAP_TOLERANCE = 6;

/**
 * Snap a moving box to the canvas centre, canvas edges and the edges and
 * centres of the other objects. Returns the adjusted position and the guides
 * that produced it, so the canvas can draw them.
 */
export function snapBox(box: Box, others: SlideObject[], tolerance = SNAP_TOLERANCE): { x: number; y: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const xTargets: Guide[] = [
    { axis: "x", at: 0, kind: "canvas" },
    { axis: "x", at: SLIDE_W / 2, kind: "canvas" },
    { axis: "x", at: SLIDE_W, kind: "canvas" },
  ];
  const yTargets: Guide[] = [
    { axis: "y", at: 0, kind: "canvas" },
    { axis: "y", at: SLIDE_H / 2, kind: "canvas" },
    { axis: "y", at: SLIDE_H, kind: "canvas" },
  ];
  for (const other of others) {
    xTargets.push({ axis: "x", at: other.x, kind: "edge" }, { axis: "x", at: other.x + other.w, kind: "edge" }, { axis: "x", at: other.x + other.w / 2, kind: "centre" });
    yTargets.push({ axis: "y", at: other.y, kind: "edge" }, { axis: "y", at: other.y + other.h, kind: "edge" }, { axis: "y", at: other.y + other.h / 2, kind: "centre" });
  }
  let x = box.x;
  let y = box.y;
  let bestX: { delta: number; guide: Guide } | null = null;
  for (const target of xTargets) {
    for (const candidate of [box.x, box.x + box.w / 2, box.x + box.w]) {
      const delta = target.at - candidate;
      if (Math.abs(delta) <= tolerance && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, guide: target };
    }
  }
  let bestY: { delta: number; guide: Guide } | null = null;
  for (const target of yTargets) {
    for (const candidate of [box.y, box.y + box.h / 2, box.y + box.h]) {
      const delta = target.at - candidate;
      if (Math.abs(delta) <= tolerance && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, guide: target };
    }
  }
  if (bestX) { x += bestX.delta; guides.push(bestX.guide); }
  if (bestY) { y += bestY.delta; guides.push(bestY.guide); }
  return { x: Math.round(x), y: Math.round(y), guides };
}

export type AlignMode = "left" | "centreX" | "right" | "top" | "centreY" | "bottom";

export function alignObjects(slide: Slide, ids: string[], mode: AlignMode): Slide {
  const selected = slide.objects.filter((object) => ids.includes(object.id));
  if (selected.length === 0) return slide;
  const box = selected.length === 1
    ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }
    : boundingBox(selected)!;
  return updateObjects(slide, ids, (object) => {
    switch (mode) {
      case "left": return { ...object, x: box.x, customised: true };
      case "centreX": return { ...object, x: Math.round(box.x + (box.w - object.w) / 2), customised: true };
      case "right": return { ...object, x: box.x + box.w - object.w, customised: true };
      case "top": return { ...object, y: box.y, customised: true };
      case "centreY": return { ...object, y: Math.round(box.y + (box.h - object.h) / 2), customised: true };
      default: return { ...object, y: box.y + box.h - object.h, customised: true };
    }
  });
}

export function distributeObjects(slide: Slide, ids: string[], axis: "x" | "y"): Slide {
  const selected = slide.objects.filter((object) => ids.includes(object.id));
  if (selected.length < 3) return slide;
  const sorted = [...selected].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = axis === "x"
    ? (last.x + last.w) - first.x - sorted.reduce((total, object) => total + object.w, 0)
    : (last.y + last.h) - first.y - sorted.reduce((total, object) => total + object.h, 0);
  const gap = span / (sorted.length - 1);
  let cursor = axis === "x" ? first.x : first.y;
  const positions = new Map<string, number>();
  for (const object of sorted) {
    positions.set(object.id, Math.round(cursor));
    cursor += (axis === "x" ? object.w : object.h) + gap;
  }
  return updateObjects(slide, ids, (object) => {
    const value = positions.get(object.id);
    if (value === undefined) return object;
    return axis === "x" ? { ...object, x: value, customised: true } : { ...object, y: value, customised: true };
  });
}

export function clampToCanvas(object: SlideObject): SlideObject {
  return {
    ...object,
    x: Math.round(Math.max(-object.w + 24, Math.min(SLIDE_W - 24, object.x))),
    y: Math.round(Math.max(-object.h + 24, Math.min(SLIDE_H - 24, object.y))),
    w: Math.max(24, Math.round(object.w)),
    h: Math.max(24, Math.round(object.h)),
  };
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function resizeBox(box: Box, handle: ResizeHandle, dx: number, dy: number, keepRatio: boolean): Box {
  let { x, y, w, h } = box;
  if (handle.includes("w")) { x += dx; w -= dx; }
  if (handle.includes("e")) { w += dx; }
  if (handle.includes("n")) { y += dy; h -= dy; }
  if (handle.includes("s")) { h += dy; }
  if (keepRatio && box.w > 0 && box.h > 0) {
    const ratio = box.w / box.h;
    if (Math.abs(w - box.w) > Math.abs(h - box.h)) h = w / ratio;
    else w = h * ratio;
  }
  if (w < 24) { if (handle.includes("w")) x -= 24 - w; w = 24; }
  if (h < 24) { if (handle.includes("n")) y -= 24 - h; h = 24; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/* ----------------------------- Animation ----------------------------- */

export function buildOrder(slide: Slide): SlideObject[] {
  return slide.objects
    .filter((object) => object.animation && object.animation.effect !== "none")
    .sort((a, b) => (a.animation!.order - b.animation!.order) || (a.z - b.z));
}

export function resequenceAnimations(slide: Slide): Slide {
  const ordered = buildOrder(slide);
  const order = new Map(ordered.map((object, index) => [object.id, index + 1]));
  return {
    ...slide,
    objects: slide.objects.map((object) => (
      object.animation && order.has(object.id)
        ? { ...object, animation: { ...object.animation, order: order.get(object.id)! } }
        : object
    )),
  };
}

export interface MotionWarning { id: string; message: string }

/** PRESENT-005 edge case: the deck must still read with motion disabled. */
export function motionWarnings(deck: Deck): MotionWarning[] {
  const warnings: MotionWarning[] = [];
  for (const slide of deck.slides) {
    const animated = buildOrder(slide);
    if (animated.length && animated.length === slide.objects.length) {
      warnings.push({ id: `all-${slide.id}`, message: `Every object on “${slide.title}” animates in. With motion disabled the slide appears complete at once, which is correct, but nothing establishes the order the speaker intends.` });
    }
    const slow = animated.filter((object) => (object.animation!.durationMs + object.animation!.delayMs) > 1200);
    for (const object of slow) {
      warnings.push({ id: `slow-${object.id}`, message: `“${object.name}” on “${slide.title}” takes ${(object.animation!.durationMs + object.animation!.delayMs) / 1000}s to arrive. Over 1.2s reads as a stall.` });
    }
    const clickOnly = animated.filter((object) => object.animation!.trigger === "onClick");
    if (clickOnly.length > 4) {
      warnings.push({ id: `clicks-${slide.id}`, message: `“${slide.title}” needs ${clickOnly.length} clicks to complete. A slide that cannot be read in one state is hard to hand over.` });
    }
    if (slide.transition.durationMs > 600) {
      warnings.push({ id: `transition-${slide.id}`, message: `The transition into “${slide.title}” runs ${slide.transition.durationMs}ms. Keep slide transitions under 600ms.` });
    }
  }
  return warnings;
}

/* ----------------------------- Export ----------------------------- */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function objectHtml(object: SlideObject, theme: Theme): string {
  const base = `position:absolute;left:${object.x}px;top:${object.y}px;width:${object.w}px;height:${object.h}px;transform:rotate(${object.rotation}deg);`;
  if (object.type === "text" && object.text) {
    const style = `${base}font-size:${object.text.size}px;font-weight:${object.text.weight};`
      + `text-align:${object.text.align === "start" ? "left" : object.text.align === "end" ? "right" : "center"};`
      + `display:flex;flex-direction:column;justify-content:${object.text.valign === "start" ? "flex-start" : object.text.valign === "end" ? "flex-end" : "center"};`
      + `color:${theme.colours[object.text.colourToken]};${object.text.italic ? "font-style:italic;" : ""}line-height:1.25;white-space:pre-wrap;`;
    return `<div style="${style}">${escapeHtml(object.text.text)}</div>`;
  }
  if (object.type === "shape" && object.shape) {
    const radius = object.shape.kind === "ellipse" ? "50%" : object.shape.kind === "roundRect" ? `${object.shape.radius}px` : "0";
    return `<div style="${base}background:${theme.colours[object.shape.fillToken]};border-radius:${radius};opacity:${object.shape.opacity};"></div>`;
  }
  if (object.type === "image" && object.image) {
    return `<div role="img" aria-label="${escapeHtml(object.image.alt)}" style="${base}background:${theme.colours.surface};border:1px dashed ${theme.colours.line};display:flex;align-items:center;justify-content:center;color:${theme.colours.muted};font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(object.image.assetId ?? "No asset referenced")}</div>`;
  }
  if (object.type === "table" && object.table) {
    const rows = object.table.rows;
    const head = object.table.header && rows.length ? `<thead><tr>${rows[0].map((cell) => `<th style="border:1px solid ${theme.colours.line};padding:6px 10px;text-align:left;">${escapeHtml(cell)}</th>`).join("")}</tr></thead>` : "";
    const bodyRows = object.table.header ? rows.slice(1) : rows;
    return `<div style="${base}"><table style="border-collapse:collapse;width:100%;font-size:15px;color:${theme.colours.ink};">${head}<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid ${theme.colours.line};padding:6px 10px;">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  if (object.type === "chart" && object.chart) {
    const points = object.chart.series.flatMap((series) => series.points);
    const max = Math.max(1, ...points.map((point) => point.value));
    const bars = points.map((point) => (
      `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;">`
      + `<div style="width:70%;height:${Math.round((point.value / max) * 100)}%;background:${theme.colours.accent};border-radius:4px 4px 0 0;"></div>`
      + `<span style="font-size:11px;color:${theme.colours.muted};">${escapeHtml(point.label)}</span></div>`
    )).join("");
    const table = `<table><caption>${escapeHtml(object.chart.title)}</caption><tbody>${points.map((point) => `<tr><th scope="row">${escapeHtml(point.label)}</th><td>${point.value}</td></tr>`).join("")}</tbody></table>`;
    return `<div style="${base}display:flex;flex-direction:column;gap:8px;">`
      + `<strong style="font-size:15px;color:${theme.colours.ink};">${escapeHtml(object.chart.title)}</strong>`
      + `<div style="flex:1;display:flex;gap:8px;align-items:flex-end;">${bars}</div>`
      + `<details style="font-size:12px;color:${theme.colours.muted};"><summary>Data table</summary>${table}</details></div>`;
  }
  return "";
}

export function toHtml(deck: Deck, title: string, includeNotes: boolean): string {
  const slides = deck.slides.filter((slide) => !slide.hidden);
  const body = slides.map((slide, index) => {
    const layout = layoutById(deck, slide.layoutId);
    const decoration = (layout.decoration ?? []).map((item) => (
      `<div style="position:absolute;left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px;background:${deck.theme.colours[item.fillToken]};opacity:${item.opacity};border-radius:${item.kind === "ellipse" ? "50%" : "2px"};"></div>`
    )).join("");
    const objects = [...slide.objects].sort((a, b) => a.z - b.z).map((object) => objectHtml(object, deck.theme)).join("");
    const notes = includeNotes && slide.notes
      ? `<aside class="notes"><h2>Speaker notes — slide ${index + 1}</h2><p>${escapeHtml(slide.notes)}</p></aside>`
      : "";
    return `<section class="slide" aria-label="Slide ${index + 1}: ${escapeHtml(slide.title)}">`
      + `<div class="stage" style="background:${deck.theme.colours[layout.backgroundToken]};">${decoration}${objects}</div>${notes}</section>`;
  }).join("\n");
  /* The exported file opens outside this application, so the stylesheet
   * carries concrete values rather than workspace tokens. */
  const style = `body{margin:0;background:#1a1917;font-family:Inter,system-ui,sans-serif;padding:32px;}`
    + `.slide{margin:0 auto 40px;max-width:${SLIDE_W}px;}`
    + `.stage{position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;border-radius:10px;box-shadow:0 20px 50px rgb(0 0 0 / 35%);}`
    + `.notes{max-width:${SLIDE_W}px;color:#cac5ba;font-size:14px;padding-top:12px;}`
    + `.notes h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9c978c;font-family:'IBM Plex Mono',ui-monospace,monospace;}`
    + `@media (max-width:1000px){.stage{transform-origin:top left;}}`
    + `table{border-collapse:collapse;color:inherit;font-size:12px;}th,td{border:1px solid currentColor;padding:2px 6px;}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${style}</style></head><body>${body}</body></html>`;
}

export function notesToText(deck: Deck, title: string): string {
  const lines = [title, "=".repeat(title.length), ""];
  deck.slides.forEach((slide, index) => {
    lines.push(`Slide ${index + 1}: ${slide.title}${slide.hidden ? " (hidden)" : ""}`);
    lines.push(slide.notes.trim() ? slide.notes.trim() : "(no speaker notes)");
    if (slide.targetSeconds) lines.push(`Target: ${slide.targetSeconds}s`);
    lines.push("");
  });
  return lines.join("\n");
}

/* ----------------------------- Review ----------------------------- */

export interface BrandFinding { id: string; slideId: string; severity: "warning" | "info"; message: string }

/** Deterministic brand and readability checks over the object graph. */
export function reviewDeck(deck: Deck): BrandFinding[] {
  const findings: BrandFinding[] = [];
  for (const slide of deck.slides) {
    const titleObject = slide.objects.find((object) => object.text?.role === "title");
    if (!titleObject || !titleObject.text?.text.trim()) {
      findings.push({ id: `title-${slide.id}`, slideId: slide.id, severity: "warning", message: `“${slide.title}” has no title text, so it has no heading in an export.` });
    }
    for (const object of slide.objects) {
      if (object.type === "image" && !object.image?.alt.trim()) {
        findings.push({ id: `alt-${object.id}`, slideId: slide.id, severity: "warning", message: `An image on “${slide.title}” has no alternative text.` });
      }
      if (object.type === "image" && !object.image?.assetId) {
        findings.push({ id: `asset-${object.id}`, slideId: slide.id, severity: "info", message: `An image frame on “${slide.title}” references no asset yet.` });
      }
      if (object.type === "text" && object.text && object.text.size < 14) {
        findings.push({ id: `small-${object.id}`, slideId: slide.id, severity: "warning", message: `Text on “${slide.title}” is ${object.text.size}px. Under 14px is unreadable from the back of a room.` });
      }
      if (object.type === "text" && object.text && object.text.text.length > 420) {
        findings.push({ id: `dense-${object.id}`, slideId: slide.id, severity: "info", message: `A text box on “${slide.title}” holds ${object.text.text.length} characters. Consider splitting the slide.` });
      }
      if (object.type === "chart" && object.chart && object.chart.series.every((series) => series.points.length === 0)) {
        findings.push({ id: `chart-${object.id}`, slideId: slide.id, severity: "warning", message: `A chart on “${slide.title}” has no data, so it would export as an empty frame.` });
      }
      if (object.x < 0 || object.y < 0 || object.x + object.w > SLIDE_W || object.y + object.h > SLIDE_H) {
        findings.push({ id: `bleed-${object.id}`, slideId: slide.id, severity: "info", message: `“${object.name}” on “${slide.title}” extends past the slide edge and will be cropped on export.` });
      }
    }
  }
  if (deck.theme.fontSubstitutions.length) {
    findings.push({
      id: "fonts", slideId: deck.slides[0]?.id ?? "", severity: "info",
      message: `${deck.theme.fontSubstitutions.map((item) => `${item.requested} → ${item.used}`).join(", ")} was substituted on import.`,
    });
  }
  return findings;
}

/* ----------------------------- Chart data ----------------------------- */

/** Stale when the linked source has changed since the snapshot was taken. */
export function chartFreshness(chart: ChartContent, sourceUpdatedAt: string | undefined): { state: "unlinked" | "fresh" | "stale" | "unknown"; label: string } {
  if (!chart.linked) return { state: "unlinked", label: "Not linked to a workbook — the numbers are held in the slide." };
  if (!chart.capturedAt) return { state: "unknown", label: "Linked, but no snapshot time was recorded." };
  if (!sourceUpdatedAt) return { state: "unknown", label: "Linked workbook is not in this workspace any more." };
  return sourceUpdatedAt > chart.capturedAt
    ? { state: "stale", label: "The workbook changed after this snapshot was taken." }
    : { state: "fresh", label: "Matches the workbook as of the last snapshot." };
}
