/* ====================================================================== *
 * Publication loading and the editor's shared tool state.
 * ====================================================================== */

import { createStore, type Store } from "@/applications/visual/kit";
import { uid } from "@/applications/visual/geometry";
import {
  PAGE_SIZES, mm, type Frame, type MasterPage, type Page, type ParagraphStyle,
  type PublicationDoc, type Story,
} from "./flow";

export type LayoutTool = "select" | "text" | "image" | "shape" | "thread";

export interface LayoutUi {
  tool: LayoutTool;
  selectedFrameId?: string;
  zoom: number;
  spread: boolean;
  showGuides: boolean;
  showBaseline: boolean;
  showBleed: boolean;
  /** Frame waiting to be linked to the next one. */
  threadFrom?: string;
  previewMode: boolean;
}

export const layoutUi: Store<LayoutUi> = createStore<LayoutUi>({
  tool: "select",
  zoom: 0.78,
  spread: true,
  showGuides: true,
  showBaseline: false,
  showBleed: true,
  previewMode: false,
});

export function setLayoutTool(tool: LayoutTool): void {
  layoutUi.set((current) => ({ ...current, tool }));
}

export function selectFrame(id?: string): void {
  layoutUi.set((current) => ({ ...current, selectedFrameId: id }));
}

/* ------------------------------ styles ------------------------------ */

export const BASE_STYLES: ParagraphStyle[] = [
  { id: "ps-body", name: "Body", family: "Georgia", size: 10.5, leading: 15, tracking: 0, weight: 400, align: "justify", spaceBefore: 0, spaceAfter: 4, firstLineIndent: 0, hyphenate: true, alignToBaseline: true, color: "#1A1917" },
  { id: "ps-lead", name: "Lead paragraph", family: "Georgia", size: 13, leading: 19.5, tracking: 0, weight: 400, align: "left", spaceBefore: 0, spaceAfter: 8, firstLineIndent: 0, hyphenate: false, alignToBaseline: true, color: "#1A1917" },
  { id: "ps-head", name: "Headline", family: "Inter", size: 30, leading: 33, tracking: -0.6, weight: 700, align: "left", spaceBefore: 0, spaceAfter: 10, firstLineIndent: 0, hyphenate: false, alignToBaseline: false, color: "#1A1917" },
  { id: "ps-sub", name: "Subhead", family: "Inter", size: 14, leading: 18, tracking: 0, weight: 650, align: "left", spaceBefore: 10, spaceAfter: 4, firstLineIndent: 0, hyphenate: false, alignToBaseline: true, color: "#234FE8" },
  { id: "ps-caption", name: "Caption", family: "Inter", size: 8.5, leading: 12, tracking: 0.2, weight: 500, align: "left", spaceBefore: 2, spaceAfter: 0, firstLineIndent: 0, hyphenate: false, alignToBaseline: false, color: "#6B6760" },
];

/* ------------------------------ parsing ------------------------------ */

interface LegacyBody { pages?: { id: string; name: string; frames: { id: string; x: number; y: number; w: number; h: number; text: string }[] }[] }

function isPublicationDoc(body: unknown): body is PublicationDoc {
  return Boolean(body && typeof body === "object" && (body as PublicationDoc).version === 2 && Array.isArray((body as PublicationDoc).pages));
}

/**
 * Open a publication record. A record from the old studio holds pages of
 * free text frames; each page becomes a real page and the text becomes a
 * story poured through a thread, so nothing is lost and the copy flows.
 */
export function parsePublication(body: unknown): PublicationDoc {
  if (isPublicationDoc(body)) {
    return {
      ...body,
      masters: body.masters ?? [],
      stories: body.stories ?? [],
      paragraphStyles: body.paragraphStyles ?? BASE_STYLES,
      characterStyles: body.characterStyles ?? [],
      fonts: body.fonts ?? ["Georgia", "Inter"],
      colourMode: body.colourMode ?? "RGB",
    };
  }

  const legacy = (body as LegacyBody | undefined)?.pages ?? [];
  const size = PAGE_SIZES[0];
  const margins = { top: mm(18), bottom: mm(20), inside: mm(18), outside: mm(16) };
  const stories: Story[] = [];
  const pages: Page[] = [];
  let previous: Frame | undefined;

  for (const index of legacy.map((_, position) => position)) {
    const frameId = `fr-${index + 1}`;
    const frame: Frame = {
      id: frameId, kind: "text",
      box: { x: margins.inside, y: margins.top, w: size.width - margins.inside - margins.outside, h: size.height - margins.top - margins.bottom },
      columns: 1, gutter: mm(5), inset: 0, storyId: "story-1", styleId: "ps-body",
    };
    if (previous) previous.next = frameId;
    previous = frame;
    pages.push({ id: `pg-${index + 1}`, masterId: "mp-text", frames: [frame], overrides: [] });
  }

  const text = legacy.map((page) => `${page.name}\n${page.frames.map((frame) => frame.text).join("\n")}`).join("\n");
  stories.push({ id: "story-1", name: "Main story", text: text || "This publication was opened from a record with no text.", styleByParagraph: { 0: "ps-head" } });

  if (pages.length === 0) return starterPublication("Untitled publication");

  return {
    version: 2,
    size,
    facingPages: true,
    margins,
    bleed: mm(3),
    slug: mm(6),
    baseline: { start: margins.top, step: 15, visible: false },
    columns: { count: 2, gutter: mm(5), visible: true },
    pages,
    masters: [defaultMaster()],
    stories,
    paragraphStyles: BASE_STYLES,
    characterStyles: [],
    activePageId: pages[0].id,
    colourMode: "RGB",
    fonts: ["Georgia", "Inter"],
  };
}

export function defaultMaster(): MasterPage {
  const size = PAGE_SIZES[0];
  return {
    id: "mp-text", name: "Text master", side: "both",
    frames: [
      {
        id: "mf-folio", kind: "folio",
        box: { x: mm(18), y: size.height - mm(14), w: size.width - mm(36), h: 14 },
        template: "Northline · {page} of {pages}", styleId: "ps-caption",
      },
      {
        id: "mf-rule", kind: "shape",
        box: { x: mm(18), y: size.height - mm(18), w: size.width - mm(36), h: 0.6 },
        fill: "#D9D4CB",
      },
    ],
  };
}

export function starterPublication(name: string, sizeId = "a4"): PublicationDoc {
  const size = PAGE_SIZES.find((item) => item.id === sizeId) ?? PAGE_SIZES[0];
  const margins = { top: mm(20), bottom: mm(20), inside: mm(20), outside: mm(16) };
  const columnWidth = (size.width - margins.inside - margins.outside - mm(5)) / 2;
  const frames = (index: number): Frame[] => [
    {
      id: `fr-${index}`, kind: "text",
      box: { x: margins.inside, y: margins.top, w: size.width - margins.inside - margins.outside, h: size.height - margins.top - margins.bottom },
      columns: 2, gutter: mm(5), inset: 0, storyId: "story-1", styleId: "ps-body",
      next: index === 1 ? "fr-2" : undefined,
    },
  ];
  return {
    version: 2,
    size,
    facingPages: true,
    margins,
    bleed: mm(3),
    slug: mm(6),
    baseline: { start: margins.top, step: 15, visible: true },
    columns: { count: 2, gutter: mm(5), visible: true },
    pages: [
      { id: "pg-1", masterId: "mp-text", frames: frames(1), overrides: [] },
      { id: "pg-2", masterId: "mp-text", frames: frames(2), overrides: [] },
    ],
    masters: [defaultMaster()],
    stories: [{
      id: "story-1", name: `${name} — main story`,
      text: `${name}\nThis frame is threaded to the next page, so the copy flows between them. Type here, or paste a story in, and the composition recalculates: words are measured, lines are broken, and whatever does not fit is reported as overset rather than quietly disappearing.\nChange the column count or the frame size and watch the breaks move.`,
      styleByParagraph: { 0: "ps-head" },
    }],
    paragraphStyles: BASE_STYLES,
    characterStyles: [],
    activePageId: "pg-1",
    colourMode: "RGB",
    fonts: ["Georgia", "Inter"],
    ...(columnWidth > 0 ? {} : {}),
  };
}

export function newTextFrame(box: { x: number; y: number; w: number; h: number }, storyId: string): Frame {
  return { id: uid("fr"), kind: "text", box, columns: 1, gutter: mm(5), inset: 0, storyId, styleId: "ps-body" };
}

export function newImageFrame(box: { x: number; y: number; w: number; h: number }): Frame {
  return { id: uid("fr"), kind: "image", box, fit: "cover" };
}

export function newShapeFrame(box: { x: number; y: number; w: number; h: number }): Frame {
  return { id: uid("fr"), kind: "shape", box, fill: "#234FE8", radius: 2 };
}
