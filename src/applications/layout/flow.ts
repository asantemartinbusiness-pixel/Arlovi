/* ====================================================================== *
 * Editorial layout engine.
 *
 * Real text composition: words are measured, broken into lines, poured into
 * the columns of a frame, and what does not fit is carried to the next frame
 * in the thread. Whatever is left over at the end of a thread is overset and
 * is reported — it is never dropped.
 *
 * Everything here is pure and takes its own measuring function, so the same
 * code runs under the browser's canvas metrics and under a unit test.
 * ====================================================================== */

export type Unit = "pt" | "mm";

export interface PageSize { id: string; name: string; width: number; height: number }

/** Page sizes in points, which is the document unit throughout. */
export const PAGE_SIZES: PageSize[] = [
  { id: "a4", name: "A4 portrait", width: 595.28, height: 841.89 },
  { id: "a4l", name: "A4 landscape", width: 841.89, height: 595.28 },
  { id: "a5", name: "A5 portrait", width: 419.53, height: 595.28 },
  { id: "letter", name: "US Letter", width: 612, height: 792 },
  { id: "square", name: "Square 210mm", width: 595.28, height: 595.28 },
  { id: "digest", name: "Digest 170 × 240mm", width: 481.89, height: 680.31 },
];

export const PT_PER_MM = 72 / 25.4;

export function mm(value: number): number {
  return value * PT_PER_MM;
}

export function toMm(points: number): number {
  return points / PT_PER_MM;
}

export interface Box { x: number; y: number; w: number; h: number }

export interface ParagraphStyle {
  id: string;
  name: string;
  family: string;
  size: number;
  /** Leading in points. */
  leading: number;
  tracking: number;
  weight: number;
  align: "left" | "right" | "center" | "justify";
  spaceBefore: number;
  spaceAfter: number;
  firstLineIndent: number;
  hyphenate: boolean;
  /** Snap each line to the document baseline grid. */
  alignToBaseline: boolean;
  color: string;
}

export interface CharacterStyle {
  id: string;
  name: string;
  weight?: number;
  italic?: boolean;
  tracking?: number;
  color?: string;
  size?: number;
}

export type FrameKind = "text" | "image" | "shape" | "folio";

export interface Frame {
  id: string;
  kind: FrameKind;
  box: Box;
  /** Text frames: columns and the gutter between them. */
  columns?: number;
  gutter?: number;
  inset?: number;
  /** Text frames: the next frame in the thread. */
  next?: string;
  /** Text frames: the story this frame belongs to. */
  storyId?: string;
  styleId?: string;
  /** Image frames. */
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  fit?: "fill" | "contain" | "cover" | "none";
  /** Shape frames. */
  fill?: string;
  stroke?: { color: string; width: number };
  radius?: number;
  rotation?: number;
  /** Folio frames carry a template, e.g. "Northline · {page}". */
  template?: string;
  locked?: boolean;
  /** Set on a frame that came from a master and was then overridden. */
  overriddenFrom?: string;
}

export interface Story {
  id: string;
  name: string;
  text: string;
  /** Paragraph style per paragraph index; missing entries use the default. */
  styleByParagraph?: Record<number, string>;
}

export interface MasterPage {
  id: string;
  name: string;
  frames: Frame[];
  /** Applies to left-hand pages, right-hand pages, or both. */
  side: "both" | "left" | "right";
}

export interface Page {
  id: string;
  masterId?: string;
  frames: Frame[];
  /** Frame ids from the master that this page has overridden. */
  overrides: string[];
}

export interface PublicationDoc {
  version: 2;
  size: PageSize;
  facingPages: boolean;
  margins: { top: number; bottom: number; inside: number; outside: number };
  bleed: number;
  slug: number;
  baseline: { start: number; step: number; visible: boolean };
  columns: { count: number; gutter: number; visible: boolean };
  pages: Page[];
  masters: MasterPage[];
  stories: Story[];
  paragraphStyles: ParagraphStyle[];
  characterStyles: CharacterStyle[];
  activePageId: string;
  colourMode: "RGB" | "CMYK (not converted)";
  fonts: string[];
}

/* ====================================================================== *
 * Measurement
 * ====================================================================== */

export interface Metrics {
  /** Width of a run of text in points at the given style. */
  width: (text: string, style: ParagraphStyle) => number;
}

/**
 * A deterministic fallback used in tests and before the canvas is ready.
 * Average character widths per 1pt of type size, close enough for layout
 * arithmetic to be verified without a DOM.
 */
export const APPROXIMATE_METRICS: Metrics = {
  width: (text, style) => {
    let total = 0;
    for (const character of text) {
      if (character === " ") total += 0.26;
      else if ("ijl.,:;'!|".includes(character)) total += 0.28;
      else if ("mwMW@".includes(character)) total += 0.86;
      else if (character === character.toUpperCase() && character !== character.toLowerCase()) total += 0.66;
      else total += 0.52;
    }
    return total * style.size + Math.max(0, text.length - 1) * style.tracking;
  },
};

/** Canvas-backed metrics: the browser's own text measurement. */
export function canvasMetrics(): Metrics {
  if (typeof document === "undefined") return APPROXIMATE_METRICS;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return APPROXIMATE_METRICS;
  return {
    width: (text, style) => {
      ctx.font = `${style.weight} ${style.size}px ${JSON.stringify(style.family)}, serif`;
      return ctx.measureText(text).width + Math.max(0, text.length - 1) * style.tracking;
    },
  };
}

/* ====================================================================== *
 * Composition
 * ====================================================================== */

export interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
  /** Extra space added per inter-word gap when justifying. */
  wordSpacing: number;
  styleId: string;
  paragraph: number;
  /** True when the word was split with a hyphen. */
  hyphenated: boolean;
}

export interface ComposedFrame {
  frameId: string;
  lines: Line[];
  columnBoxes: Box[];
}

export interface Composition {
  frames: ComposedFrame[];
  /** The id of the last frame in the thread when text did not fit. */
  oversetFrom?: string;
  /** Characters that did not fit anywhere. */
  oversetChars: number;
  /** The overset text itself, so it can be shown rather than lost. */
  oversetText: string;
  totalLines: number;
}

function columnBoxes(frame: Frame): Box[] {
  const inset = frame.inset ?? 0;
  const count = Math.max(1, frame.columns ?? 1);
  const gutter = frame.gutter ?? 12;
  const inner = { x: frame.box.x + inset, y: frame.box.y + inset, w: frame.box.w - inset * 2, h: frame.box.h - inset * 2 };
  const width = (inner.w - gutter * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: inner.x + index * (width + gutter),
    y: inner.y,
    w: Math.max(1, width),
    h: Math.max(1, inner.h),
  }));
}

/** Break one paragraph into lines that fit `width`. */
export function breakParagraph(
  paragraph: string,
  width: number,
  style: ParagraphStyle,
  metrics: Metrics,
): { text: string; width: number; hyphenated: boolean }[] {
  const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
  const lines: { text: string; width: number; hyphenated: boolean }[] = [];
  if (words.length === 0) return [{ text: "", width: 0, hyphenated: false }];
  let current = "";
  let indent = style.firstLineIndent;

  const fits = (candidate: string) => metrics.width(candidate, style) <= width - indent;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (!current) {
      /* A single word wider than the column. Hyphenate it if allowed,
         otherwise let it stick out and say so through its measured width. */
      if (style.hyphenate && word.length > 4) {
        let split = word.length - 1;
        while (split > 2 && !fits(`${word.slice(0, split)}-`)) split -= 1;
        if (split > 2) {
          lines.push({ text: `${word.slice(0, split)}-`, width: metrics.width(`${word.slice(0, split)}-`, style), hyphenated: true });
          words[index] = word.slice(split);
          index -= 1;
          indent = 0;
          continue;
        }
      }
      lines.push({ text: word, width: metrics.width(word, style), hyphenated: false });
      indent = 0;
      continue;
    }
    lines.push({ text: current, width: metrics.width(current, style), hyphenated: false });
    current = word;
    indent = 0;
  }
  if (current) lines.push({ text: current, width: metrics.width(current, style), hyphenated: false });
  return lines;
}

/**
 * Pour a story through a chain of frames. Returns the lines placed in each
 * frame and whatever did not fit, so the editor can show overset rather than
 * silently losing the end of the copy.
 */
export function composeStory(
  story: Story,
  frames: Frame[],
  styles: ParagraphStyle[],
  metrics: Metrics,
  baseline: { start: number; step: number },
): Composition {
  const defaultStyle = styles[0];
  const byId = new Map(styles.map((style) => [style.id, style]));
  const paragraphs = story.text.split(/\n+/);
  const out: ComposedFrame[] = frames.map((frame) => ({ frameId: frame.id, lines: [], columnBoxes: columnBoxes(frame) }));

  let frameIndex = 0;
  let columnIndex = 0;
  let cursor = out[0]?.columnBoxes[0]?.y ?? 0;
  let placed = 0;
  let totalLines = 0;
  let overset = "";
  let oversetFrom: string | undefined;

  const advance = (): boolean => {
    const frame = out[frameIndex];
    if (!frame) return false;
    if (columnIndex + 1 < frame.columnBoxes.length) {
      columnIndex += 1;
      cursor = frame.columnBoxes[columnIndex].y;
      return true;
    }
    if (frameIndex + 1 < out.length) {
      frameIndex += 1;
      columnIndex = 0;
      cursor = out[frameIndex].columnBoxes[0].y;
      return true;
    }
    return false;
  };

  for (const [index, paragraph] of paragraphs.entries()) {
    const style = byId.get(story.styleByParagraph?.[index] ?? "") ?? defaultStyle;
    if (!style) break;
    const frame = out[frameIndex];
    if (!frame) { overset += `${paragraph}\n`; continue; }
    cursor += style.spaceBefore;
    const lines = breakParagraph(paragraph, frame.columnBoxes[columnIndex].w, style, metrics);
    for (const [lineIndex, line] of lines.entries()) {
      const column = out[frameIndex]?.columnBoxes[columnIndex];
      if (!column) break;
      let y = cursor + style.leading;
      if (style.alignToBaseline && baseline.step > 0) {
        const steps = Math.ceil((y - baseline.start) / baseline.step);
        y = baseline.start + steps * baseline.step;
      }
      if (y > column.y + column.h) {
        if (!advance()) {
          oversetFrom = out[out.length - 1]?.frameId;
          overset += `${paragraphs.slice(index).join("\n")}`.slice(placed === 0 ? 0 : 0);
          const remaining = lines.slice(lineIndex).map((item) => item.text).join(" ");
          overset = `${remaining} ${paragraphs.slice(index + 1).join("\n")}`.trim();
          return {
            frames: out,
            oversetFrom,
            oversetChars: overset.length,
            oversetText: overset,
            totalLines,
          };
        }
        cursor = out[frameIndex].columnBoxes[columnIndex].y;
        y = cursor + style.leading;
        if (style.alignToBaseline && baseline.step > 0) {
          const steps = Math.ceil((y - baseline.start) / baseline.step);
          y = baseline.start + steps * baseline.step;
        }
      }
      const live = out[frameIndex].columnBoxes[columnIndex];
      const indent = lineIndex === 0 ? style.firstLineIndent : 0;
      const slack = live.w - indent - line.width;
      const gaps = Math.max(0, line.text.split(" ").length - 1);
      const justify = style.align === "justify" && lineIndex < lines.length - 1 && gaps > 0;
      const x = style.align === "right" ? live.x + live.w - line.width
        : style.align === "center" ? live.x + slack / 2 + indent / 2
          : live.x + indent;
      out[frameIndex].lines.push({
        text: line.text,
        x,
        y,
        width: line.width,
        wordSpacing: justify ? slack / gaps : 0,
        styleId: style.id,
        paragraph: index,
        hyphenated: line.hyphenated,
      });
      totalLines += 1;
      placed += line.text.length;
      cursor = y;
    }
    cursor += style.spaceAfter;
  }

  return { frames: out, oversetFrom, oversetChars: 0, oversetText: "", totalLines };
}

/** The ordered frames of a thread, starting at `startId`. */
export function threadFrames(page: Page[], startId: string): Frame[] {
  const all = new Map<string, Frame>();
  for (const item of page) for (const frame of item.frames) all.set(frame.id, frame);
  const out: Frame[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = startId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const frame = all.get(cursor);
    if (!frame) break;
    out.push(frame);
    cursor = frame.next;
  }
  return out;
}

/** Every thread head: a text frame nothing else points at. */
export function threadHeads(pages: Page[]): Frame[] {
  const targeted = new Set<string>();
  const texts: Frame[] = [];
  for (const page of pages) {
    for (const frame of page.frames) {
      if (frame.kind !== "text") continue;
      texts.push(frame);
      if (frame.next) targeted.add(frame.next);
    }
  }
  return texts.filter((frame) => !targeted.has(frame.id));
}

/* ====================================================================== *
 * Image fitting
 * ====================================================================== */

export interface Placement { x: number; y: number; w: number; h: number; scale: number }

export function fitImage(frame: Box, natural: { width: number; height: number }, mode: Frame["fit"]): Placement {
  if (!natural.width || !natural.height) return { x: frame.x, y: frame.y, w: frame.w, h: frame.h, scale: 1 };
  const frameRatio = frame.w / frame.h;
  const imageRatio = natural.width / natural.height;
  if (mode === "fill" || mode === undefined) {
    return { x: frame.x, y: frame.y, w: frame.w, h: frame.h, scale: frame.w / natural.width };
  }
  if (mode === "none") {
    return { x: frame.x, y: frame.y, w: natural.width, h: natural.height, scale: 1 };
  }
  const cover = mode === "cover";
  const useWidth = cover ? imageRatio < frameRatio : imageRatio > frameRatio;
  const w = useWidth ? frame.w : frame.h * imageRatio;
  const h = useWidth ? frame.w / imageRatio : frame.h;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h, scale: w / natural.width };
}

/** Effective resolution of a placed image, in pixels per inch. */
export function effectivePpi(frame: Box, natural: { width: number; height: number }, mode: Frame["fit"]): number {
  const placement = fitImage(frame, natural, mode);
  if (placement.w <= 0) return 0;
  return Math.round((natural.width / (placement.w / 72)) * 10) / 10;
}

/* ====================================================================== *
 * Masters
 * ====================================================================== */

export function masterFor(doc: PublicationDoc, page: Page, index: number): MasterPage | undefined {
  const master = doc.masters.find((item) => item.id === page.masterId);
  if (!master) return undefined;
  const isLeft = doc.facingPages && index % 2 === 1;
  if (master.side === "both") return master;
  if (master.side === "left" && isLeft) return master;
  if (master.side === "right" && !isLeft) return master;
  return undefined;
}

/** Master frames the page has not overridden, with folio text substituted. */
export function masterFrames(doc: PublicationDoc, page: Page, index: number): Frame[] {
  const master = masterFor(doc, page, index);
  if (!master) return [];
  return master.frames
    .filter((frame) => !page.overrides.includes(frame.id))
    .map((frame) => (frame.kind === "folio"
      ? { ...frame, template: (frame.template ?? "{page}").replace("{page}", String(index + 1)).replace("{pages}", String(doc.pages.length)) }
      : frame));
}

/** Pages a master change would touch, named so the impact is visible. */
export function masterUsage(doc: PublicationDoc, masterId: string): { index: number; page: Page; overridden: number }[] {
  return doc.pages
    .map((page, index) => ({ index, page, overridden: page.overrides.length }))
    .filter((entry) => entry.page.masterId === masterId);
}

/** Detach a master frame onto a page so it can be edited there. */
export function overrideMasterFrame(doc: PublicationDoc, pageId: string, frameId: string, index: number): PublicationDoc {
  const page = doc.pages.find((item) => item.id === pageId);
  if (!page || page.overrides.includes(frameId)) return doc;
  const master = masterFor(doc, page, index);
  const frame = master?.frames.find((item) => item.id === frameId);
  if (!frame) return doc;
  return {
    ...doc,
    pages: doc.pages.map((item) => (item.id === pageId
      ? {
        ...item,
        overrides: [...item.overrides, frameId],
        frames: [...item.frames, { ...frame, id: `${frameId}-on-${pageId}`, overriddenFrom: frameId }],
      }
      : item)),
  };
}

/* ====================================================================== *
 * Preflight
 * ====================================================================== */

export type PreflightSeverity = "error" | "warning" | "note";

export interface PreflightIssue {
  id: string;
  severity: PreflightSeverity;
  title: string;
  detail: string;
  pageIndex?: number;
  frameId?: string;
  /** A fix the screen can apply. */
  fix?: "grow-frame" | "add-page" | "reduce-size" | "embed-font" | "add-bleed";
}

export interface PreflightOptions {
  minPpi: number;
  minTextSize: number;
  availableFont: (family: string) => boolean;
}

export function preflight(doc: PublicationDoc, compositions: Map<string, Composition>, options: PreflightOptions): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (const [storyId, composition] of compositions) {
    if (composition.oversetChars > 0) {
      const story = doc.stories.find((item) => item.id === storyId);
      issues.push({
        id: `overset-${storyId}`,
        severity: "error",
        title: `${story?.name ?? storyId} has ${composition.oversetChars} characters of overset text`,
        detail: `The thread ends at ${composition.oversetFrom ?? "its last frame"} with copy still to place. The text is kept and shown on the Flow tab; it is not dropped.`,
        frameId: composition.oversetFrom,
        fix: "add-page",
      });
    }
  }

  for (const [index, page] of doc.pages.entries()) {
    for (const frame of page.frames) {
      if (frame.kind === "image") {
        if (!frame.src) {
          issues.push({
            id: `missing-${frame.id}`, severity: "error", pageIndex: index, frameId: frame.id,
            title: "An image frame has no image",
            detail: "The frame is on the page with its size and fitting, but nothing is linked. It is never filled with an unrelated picture.",
          });
          continue;
        }
        const ppi = effectivePpi(frame.box, { width: frame.naturalWidth ?? 0, height: frame.naturalHeight ?? 0 }, frame.fit);
        if (ppi > 0 && ppi < options.minPpi) {
          issues.push({
            id: `ppi-${frame.id}`, severity: "warning", pageIndex: index, frameId: frame.id,
            title: `Image at ${ppi} ppi`,
            detail: `Placed at ${Math.round(frame.box.w)} × ${Math.round(frame.box.h)}pt from ${frame.naturalWidth} × ${frame.naturalHeight} pixels. Press work usually wants ${options.minPpi} ppi.`,
            fix: "reduce-size",
          });
        }
      }
      if (frame.kind === "text" && frame.styleId) {
        const style = doc.paragraphStyles.find((item) => item.id === frame.styleId);
        if (style && style.size < options.minTextSize) {
          issues.push({
            id: `small-${frame.id}`, severity: "warning", pageIndex: index, frameId: frame.id,
            title: `Type at ${style.size}pt`,
            detail: `${style.name} is below ${options.minTextSize}pt, which is hard to read in print and fails most accessibility guidance on screen.`,
          });
        }
      }
      const bleedBox = { x: -doc.bleed, y: -doc.bleed, w: doc.size.width + doc.bleed * 2, h: doc.size.height + doc.bleed * 2 };
      const touchesEdge = frame.box.x <= 0.5 || frame.box.y <= 0.5
        || frame.box.x + frame.box.w >= doc.size.width - 0.5
        || frame.box.y + frame.box.h >= doc.size.height - 0.5;
      const reachesBleed = frame.box.x <= bleedBox.x + 0.5 || frame.box.y <= bleedBox.y + 0.5
        || frame.box.x + frame.box.w >= doc.size.width + doc.bleed - 0.5
        || frame.box.y + frame.box.h >= doc.size.height + doc.bleed - 0.5;
      if (touchesEdge && !reachesBleed && frame.kind !== "text") {
        issues.push({
          id: `bleed-${frame.id}`, severity: "warning", pageIndex: index, frameId: frame.id,
          title: "An element meets the trim without bleed",
          detail: `It reaches the page edge but stops short of the ${Math.round(toMm(doc.bleed) * 10) / 10}mm bleed. A trim variance would show paper.`,
          fix: "add-bleed",
        });
      }
    }
  }

  for (const family of doc.fonts) {
    if (!options.availableFont(family)) {
      issues.push({
        id: `font-${family}`, severity: "warning",
        title: `${family} is not available in this browser`,
        detail: "The preview substitutes a fallback, so line breaks here will not match a machine that has the font. The export names the family rather than outlining it.",
        fix: "embed-font",
      });
    }
  }

  if (doc.colourMode !== "RGB") {
    issues.push({
      id: "colour", severity: "note",
      title: "Colour is RGB",
      detail: "This browser composites in sRGB. The document records the intent, but no separation to CMYK happens here and the export is RGB.",
    });
  }

  if (doc.bleed === 0) {
    issues.push({ id: "nobleed", severity: "note", title: "No bleed is set", detail: "A printer normally asks for 3mm. Set it on the Preflight tab if this goes to press.", fix: "add-bleed" });
  }

  return issues;
}

export function preflightBlocks(issues: PreflightIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
