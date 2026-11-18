/* ====================================================================== *
 * Rich text document model.
 *
 * Replaces audit finding A11 — a contentEditable div driven by
 * `document.execCommand` with a canned comment string. Nothing here touches
 * the DOM: a document is a list of block nodes, each holding inline runs with
 * marks, and every edit is a pure command over that structure. The editor
 * surface intercepts `beforeinput`, calls a command and re-renders, so the
 * model is always the source of truth.
 *
 * DOM-free on purpose so it can be unit tested in node.
 * ====================================================================== */

export type MarkType = "bold" | "italic" | "underline" | "strike" | "code";

export const MARKS: MarkType[] = ["bold", "italic", "underline", "strike", "code"];

export type BlockType =
  | "paragraph" | "heading1" | "heading2" | "heading3"
  | "bulletItem" | "numberItem" | "quote" | "code"
  | "table" | "image" | "pageBreak";

export interface SuggestionRef {
  id: string;
  kind: "insert" | "delete";
}

export interface InlineRun {
  text: string;
  marks: MarkType[];
  /** Href for a link mark. */
  link?: string;
  /** Present while the run is a pending tracked change. */
  suggestion?: SuggestionRef;
}

export interface TableContent {
  header: boolean;
  rows: string[][];
}

export interface ImageContent {
  /** Record id of an asset in this workspace — images are held by reference. */
  assetId?: string;
  caption: string;
  alt: string;
  widthPercent: number;
}

export interface Block {
  id: string;
  type: BlockType;
  runs: InlineRun[];
  /** Named style applied to the block. */
  styleId?: string;
  /** List nesting depth, 0-based. */
  indent?: number;
  table?: TableContent;
  image?: ImageContent;
}

export interface CommentAnchor {
  blockId: string;
  start: number;
  end: number;
}

export interface CommentReply {
  id: string;
  author: string;
  at: string;
  body: string;
}

export interface DocComment {
  id: string;
  /** The block range the comment is attached to, not a loose string. */
  anchor: CommentAnchor;
  /** Text captured when the comment was made, used when the anchor drifts. */
  quote: string;
  author: string;
  at: string;
  body: string;
  resolved: boolean;
  mandatory: boolean;
  replies: CommentReply[];
}

export interface Suggestion {
  id: string;
  kind: "insert" | "delete";
  author: string;
  at: string;
  note: string;
  status: "open" | "accepted" | "rejected";
}

export interface Bookmark {
  id: string;
  blockId: string;
  label: string;
}

export interface StyleDef {
  id: string;
  name: string;
  appliesTo: BlockType[];
  fontSize: number;
  weight: number;
  spaceBefore: number;
  letterSpacing?: number;
  colour?: string;
}

export interface PageSetup {
  size: "A4" | "Letter";
  margin: number;
  columns: 1 | 2;
  header: string;
  footer: string;
  showPageNumbers: boolean;
}

export interface Reference {
  id: string;
  label: string;
  /** Where the claim comes from: a record in this workspace, or nothing. */
  recordId?: string;
  note: string;
}

export interface DocModel {
  blocks: Block[];
  comments: DocComment[];
  suggestions: Suggestion[];
  bookmarks: Bookmark[];
  styles: StyleDef[];
  page: PageSetup;
  references: Reference[];
  /** Tracked-change mode: edits become suggestions instead of direct writes. */
  suggestMode: boolean;
  /** Share links minted for the document, each revocable. */
  shares: { id: string; at: string; scope: "workspace" | "link"; revokedAt?: string; note: string }[];
}

/* ----------------------------- Ids ----------------------------- */

let counter = 0;
export function nextId(prefix = "b"): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ----------------------------- Defaults ----------------------------- */

export const DEFAULT_STYLES: StyleDef[] = [
  { id: "title", name: "Title", appliesTo: ["heading1"], fontSize: 34, weight: 700, spaceBefore: 0, letterSpacing: -0.02 },
  { id: "section", name: "Section heading", appliesTo: ["heading2"], fontSize: 22, weight: 650, spaceBefore: 24 },
  { id: "subsection", name: "Subsection", appliesTo: ["heading3"], fontSize: 17, weight: 650, spaceBefore: 18 },
  { id: "body", name: "Body", appliesTo: ["paragraph", "bulletItem", "numberItem"], fontSize: 16, weight: 400, spaceBefore: 10 },
  { id: "lead", name: "Lead paragraph", appliesTo: ["paragraph"], fontSize: 18, weight: 400, spaceBefore: 12, colour: "muted" },
  { id: "pullquote", name: "Pull quote", appliesTo: ["quote"], fontSize: 18, weight: 500, spaceBefore: 16 },
];

export const DEFAULT_PAGE: PageSetup = {
  size: "A4", margin: 72, columns: 1, header: "", footer: "", showPageNumbers: true,
};

export function emptyBlock(type: BlockType = "paragraph"): Block {
  return { id: nextId(), type, runs: [] };
}

export function textBlock(type: BlockType, text: string, marks: MarkType[] = []): Block {
  return { id: nextId(), type, runs: text ? [{ text, marks }] : [] };
}

export function emptyDoc(): DocModel {
  return {
    blocks: [emptyBlock("heading1"), emptyBlock("paragraph")],
    comments: [], suggestions: [], bookmarks: [],
    styles: DEFAULT_STYLES, page: DEFAULT_PAGE, references: [],
    suggestMode: false, shares: [],
  };
}

/* ----------------------------- Reading a stored body ----------------------------- */

const BLOCK_FOR_TAG: Record<string, BlockType> = {
  h1: "heading1", h2: "heading2", h3: "heading3", h4: "heading3",
  p: "paragraph", blockquote: "quote", pre: "code", li: "bulletItem",
};

/**
 * Parse the small HTML subset the previous editor stored. This is a text scan,
 * not a DOM parse, so the model loads identically in node and the browser.
 */
export function blocksFromHtml(html: string): Block[] {
  const blocks: Block[] = [];
  const pattern = /<(h1|h2|h3|h4|p|blockquote|pre|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(html);
  while (match) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag === "ul" || tag === "ol") {
      const items = inner.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) ?? [];
      for (const item of items) {
        const body = item.replace(/^<li\b[^>]*>/i, "").replace(/<\/li>$/i, "");
        blocks.push({ id: nextId(), type: tag === "ul" ? "bulletItem" : "numberItem", runs: runsFromInlineHtml(body) });
      }
    } else {
      blocks.push({ id: nextId(), type: BLOCK_FOR_TAG[tag] ?? "paragraph", runs: runsFromInlineHtml(inner) });
    }
    match = pattern.exec(html);
  }
  if (blocks.length === 0) {
    const plain = decodeEntities(html.replace(/<[^>]*>/g, "")).trim();
    blocks.push(plain ? textBlock("paragraph", plain) : emptyBlock("paragraph"));
  }
  return blocks;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function runsFromInlineHtml(html: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const marks: MarkType[] = [];
  let link: string | undefined;
  let i = 0;
  let buffer = "";
  const flush = () => {
    if (buffer === "") return;
    runs.push({ text: decodeEntities(buffer), marks: [...marks], ...(link ? { link } : {}) });
    buffer = "";
  };
  while (i < html.length) {
    if (html[i] !== "<") { buffer += html[i]; i += 1; continue; }
    const close = html.indexOf(">", i);
    if (close < 0) { buffer += html.slice(i); break; }
    const tag = html.slice(i + 1, close);
    i = close + 1;
    const bare = tag.replace(/^\//, "").split(/\s/)[0].toLowerCase();
    const closing = tag.startsWith("/");
    const markFor: Record<string, MarkType | undefined> = {
      strong: "bold", b: "bold", em: "italic", i: "italic",
      u: "underline", s: "strike", del: "strike", code: "code",
    };
    const mark = markFor[bare];
    if (mark) {
      flush();
      if (closing) {
        const index = marks.lastIndexOf(mark);
        if (index >= 0) marks.splice(index, 1);
      } else marks.push(mark);
      continue;
    }
    if (bare === "a") {
      flush();
      if (closing) link = undefined;
      else {
        const href = /href=["']([^"']*)["']/i.exec(tag);
        link = href?.[1] ?? "#";
      }
      continue;
    }
    if (bare === "br") { flush(); continue; }
  }
  flush();
  return runs.filter((run) => run.text !== "");
}

interface LegacyComment { id?: string; text?: string; quote?: string; author?: string; at?: string; resolved?: boolean }

/** Load any stored document body into the current model. */
export function readDoc(body: unknown, fallbackAuthor: string, fallbackAt: string): DocModel {
  const source = (body ?? {}) as Partial<DocModel> & { html?: string; comments?: (DocComment | LegacyComment)[] };
  const blocks = Array.isArray(source.blocks) && source.blocks.length
    ? source.blocks.map(normalizeBlock)
    : blocksFromHtml(typeof source.html === "string" ? source.html : "");
  const comments: DocComment[] = (source.comments ?? []).map((raw, index) => {
    const modern = raw as DocComment;
    if (modern.anchor && typeof modern.anchor.blockId === "string") {
      return { ...modern, replies: modern.replies ?? [], mandatory: modern.mandatory ?? false };
    }
    const legacy = raw as LegacyComment;
    const quote = legacy.quote ?? "";
    const found = blocks.find((block) => quote && blockText(block).includes(quote)) ?? blocks[0];
    const start = quote ? Math.max(0, blockText(found).indexOf(quote)) : 0;
    return {
      id: legacy.id ?? `comment-${index + 1}`,
      anchor: { blockId: found.id, start, end: start + (quote.length || Math.min(24, blockText(found).length)) },
      quote: quote || blockText(found).slice(0, 24),
      author: legacy.author ?? fallbackAuthor,
      at: legacy.at ?? fallbackAt,
      body: legacy.text ?? "",
      resolved: legacy.resolved ?? false,
      mandatory: false,
      replies: [],
    };
  });
  return {
    blocks,
    comments,
    suggestions: source.suggestions ?? [],
    bookmarks: source.bookmarks ?? [],
    styles: source.styles?.length ? source.styles : DEFAULT_STYLES,
    page: { ...DEFAULT_PAGE, ...(source.page ?? {}) },
    references: source.references ?? [],
    suggestMode: source.suggestMode ?? false,
    shares: source.shares ?? [],
  };
}

function normalizeBlock(raw: Block): Block {
  return {
    ...raw,
    id: raw.id ?? nextId(),
    runs: (raw.runs ?? []).map((run) => ({ ...run, marks: run.marks ?? [] })),
  };
}

/* ----------------------------- Text helpers ----------------------------- */

export function blockText(block: Block): string {
  if (block.type === "table") return (block.table?.rows ?? []).flat().join(" ");
  if (block.type === "image") return block.image?.caption ?? "";
  return block.runs.map((run) => run.text).join("");
}

/** Text as a reader sees it: a pending deletion is not part of the document. */
export function visibleText(block: Block): string {
  if (block.type !== "table" && block.type !== "image" && block.type !== "pageBreak") {
    return block.runs.filter((run) => run.suggestion?.kind !== "delete").map((run) => run.text).join("");
  }
  return blockText(block);
}

export function isTextBlock(block: Block): boolean {
  return block.type !== "table" && block.type !== "image" && block.type !== "pageBreak";
}

export function runPrefixLength(block: Block, runIndex: number): number {
  let total = 0;
  for (let i = 0; i < runIndex && i < block.runs.length; i += 1) total += block.runs[i].text.length;
  return total;
}

function sameFormat(a: InlineRun, b: InlineRun): boolean {
  if (a.link !== b.link) return false;
  if ((a.suggestion?.id ?? "") !== (b.suggestion?.id ?? "")) return false;
  if ((a.suggestion?.kind ?? "") !== (b.suggestion?.kind ?? "")) return false;
  if (a.marks.length !== b.marks.length) return false;
  return a.marks.every((mark) => b.marks.includes(mark));
}

export function mergeRuns(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const previous = out[out.length - 1];
    if (previous && sameFormat(previous, run)) previous.text += run.text;
    else out.push({ ...run, marks: [...run.marks] });
  }
  return out;
}

/** The runs covering [start, end) of a block's text. */
export function sliceRuns(runs: InlineRun[], start: number, end: number): InlineRun[] {
  const out: InlineRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    if (runEnd <= start || runStart >= end) continue;
    const from = Math.max(0, start - runStart);
    const to = Math.min(run.text.length, end - runStart);
    out.push({ ...run, marks: [...run.marks], text: run.text.slice(from, to) });
  }
  return mergeRuns(out);
}

/* ----------------------------- Positions ----------------------------- */

export interface DocPosition { blockId: string; offset: number }
export interface DocRange { anchor: DocPosition; head: DocPosition }

export function blockIndex(model: DocModel, blockId: string): number {
  return model.blocks.findIndex((block) => block.id === blockId);
}

/** Normalise a range to document order. */
export function orderedRange(model: DocModel, range: DocRange): { from: DocPosition; to: DocPosition } {
  const a = blockIndex(model, range.anchor.blockId);
  const b = blockIndex(model, range.head.blockId);
  if (a < b || (a === b && range.anchor.offset <= range.head.offset)) return { from: range.anchor, to: range.head };
  return { from: range.head, to: range.anchor };
}

export function isCollapsed(range: DocRange): boolean {
  return range.anchor.blockId === range.head.blockId && range.anchor.offset === range.head.offset;
}

export function collapsed(position: DocPosition): DocRange {
  return { anchor: position, head: position };
}

/** The text a range covers, with a blank line between blocks. */
export function rangeText(model: DocModel, range: DocRange): string {
  const { from, to } = orderedRange(model, range);
  const start = blockIndex(model, from.blockId);
  const end = blockIndex(model, to.blockId);
  if (start < 0 || end < 0) return "";
  if (start === end) return blockText(model.blocks[start]).slice(from.offset, to.offset);
  const parts: string[] = [blockText(model.blocks[start]).slice(from.offset)];
  for (let i = start + 1; i < end; i += 1) parts.push(blockText(model.blocks[i]));
  parts.push(blockText(model.blocks[end]).slice(0, to.offset));
  return parts.join("\n");
}

/* ----------------------------- Commands ----------------------------- */

export interface CommandResult {
  model: DocModel;
  selection: DocRange;
}

export interface EditActor { author: string; at: string }

function withBlocks(model: DocModel, blocks: Block[]): DocModel {
  return { ...model, blocks };
}

function replaceBlock(model: DocModel, blockId: string, next: Block): DocModel {
  return withBlocks(model, model.blocks.map((block) => (block.id === blockId ? next : block)));
}

/** Marks that apply to the whole of a collapsed or expanded range. */
export function activeMarks(model: DocModel, range: DocRange): MarkType[] {
  const { from, to } = orderedRange(model, range);
  const index = blockIndex(model, from.blockId);
  if (index < 0) return [];
  const block = model.blocks[index];
  if (!isTextBlock(block)) return [];
  if (isCollapsed(range)) {
    const probe = sliceRuns(block.runs, Math.max(0, from.offset - 1), from.offset);
    return probe[0]?.marks ?? [];
  }
  const endIndex = blockIndex(model, to.blockId);
  const covered: InlineRun[] = [];
  for (let i = index; i <= endIndex; i += 1) {
    const current = model.blocks[i];
    if (!isTextBlock(current)) continue;
    const start = i === index ? from.offset : 0;
    const end = i === endIndex ? to.offset : blockText(current).length;
    covered.push(...sliceRuns(current.runs, start, end));
  }
  if (covered.length === 0) return [];
  return MARKS.filter((mark) => covered.every((run) => run.marks.includes(mark)));
}

export function activeLink(model: DocModel, range: DocRange): string | undefined {
  const { from } = orderedRange(model, range);
  const index = blockIndex(model, from.blockId);
  if (index < 0) return undefined;
  const block = model.blocks[index];
  if (!isTextBlock(block)) return undefined;
  const probe = sliceRuns(block.runs, Math.max(0, from.offset - 1), Math.max(1, from.offset));
  return probe[0]?.link;
}

/** Apply or remove one mark over a range. */
export function toggleMark(model: DocModel, range: DocRange, mark: MarkType): CommandResult {
  if (isCollapsed(range)) return { model, selection: range };
  const { from, to } = orderedRange(model, range);
  const startIndex = blockIndex(model, from.blockId);
  const endIndex = blockIndex(model, to.blockId);
  if (startIndex < 0 || endIndex < 0) return { model, selection: range };
  const remove = activeMarks(model, range).includes(mark);
  const blocks = model.blocks.map((block, index) => {
    if (index < startIndex || index > endIndex || !isTextBlock(block)) return block;
    const length = blockText(block).length;
    const start = index === startIndex ? from.offset : 0;
    const end = index === endIndex ? to.offset : length;
    if (start >= end) return block;
    const runs = mergeRuns([
      ...sliceRuns(block.runs, 0, start),
      ...sliceRuns(block.runs, start, end).map((run) => ({
        ...run,
        marks: remove ? run.marks.filter((item) => item !== mark) : [...new Set([...run.marks, mark])],
      })),
      ...sliceRuns(block.runs, end, length),
    ]);
    return { ...block, runs };
  });
  return { model: withBlocks(model, blocks), selection: range };
}

export function setLink(model: DocModel, range: DocRange, href: string | undefined): CommandResult {
  if (isCollapsed(range)) return { model, selection: range };
  const { from, to } = orderedRange(model, range);
  const startIndex = blockIndex(model, from.blockId);
  const endIndex = blockIndex(model, to.blockId);
  const blocks = model.blocks.map((block, index) => {
    if (index < startIndex || index > endIndex || !isTextBlock(block)) return block;
    const length = blockText(block).length;
    const start = index === startIndex ? from.offset : 0;
    const end = index === endIndex ? to.offset : length;
    if (start >= end) return block;
    const runs = mergeRuns([
      ...sliceRuns(block.runs, 0, start),
      ...sliceRuns(block.runs, start, end).map((run) => {
        const next: InlineRun = { ...run };
        if (href) next.link = href;
        else delete next.link;
        return next;
      }),
      ...sliceRuns(block.runs, end, length),
    ]);
    return { ...block, runs };
  });
  return { model: withBlocks(model, blocks), selection: range };
}

/** Delete a range. In suggest mode the text is marked, not removed. */
export function deleteRange(model: DocModel, range: DocRange, actor: EditActor): CommandResult {
  if (isCollapsed(range)) return { model, selection: range };
  const { from, to } = orderedRange(model, range);
  const startIndex = blockIndex(model, from.blockId);
  const endIndex = blockIndex(model, to.blockId);
  if (startIndex < 0 || endIndex < 0) return { model, selection: range };

  if (model.suggestMode) {
    const suggestionId = nextId("sg");
    let touched = false;
    const blocks = model.blocks.map((block, index) => {
      if (index < startIndex || index > endIndex || !isTextBlock(block)) return block;
      const length = blockText(block).length;
      const start = index === startIndex ? from.offset : 0;
      const end = index === endIndex ? to.offset : length;
      if (start >= end) return block;
      touched = true;
      const runs = mergeRuns([
        ...sliceRuns(block.runs, 0, start),
        ...sliceRuns(block.runs, start, end).map((run) => ({ ...run, suggestion: { id: suggestionId, kind: "delete" as const } })),
        ...sliceRuns(block.runs, end, length),
      ]);
      return { ...block, runs };
    });
    if (!touched) return { model, selection: range };
    const suggestion: Suggestion = {
      id: suggestionId, kind: "delete", author: actor.author, at: actor.at,
      note: `Proposed deletion of “${truncate(rangeText(model, range), 60)}”`, status: "open",
    };
    return {
      model: { ...withBlocks(model, blocks), suggestions: [suggestion, ...model.suggestions] },
      selection: collapsed(to),
    };
  }

  const startBlock = model.blocks[startIndex];
  const endBlock = model.blocks[endIndex];
  if (startIndex === endIndex) {
    if (!isTextBlock(startBlock)) {
      const blocks = model.blocks.filter((_, index) => index !== startIndex);
      const target = blocks[Math.max(0, startIndex - 1)] ?? emptyBlock();
      return {
        model: withBlocks(model, blocks.length ? blocks : [emptyBlock()]),
        selection: collapsed({ blockId: target.id, offset: blockText(target).length }),
      };
    }
    const length = blockText(startBlock).length;
    const runs = mergeRuns([...sliceRuns(startBlock.runs, 0, from.offset), ...sliceRuns(startBlock.runs, to.offset, length)]);
    return {
      model: remapComments(replaceBlock(model, startBlock.id, { ...startBlock, runs }), startBlock.id, from.offset, to.offset - from.offset, 0),
      selection: collapsed(from),
    };
  }
  const head = isTextBlock(startBlock) ? sliceRuns(startBlock.runs, 0, from.offset) : [];
  const tail = isTextBlock(endBlock) ? sliceRuns(endBlock.runs, to.offset, blockText(endBlock).length) : [];
  const merged: Block = { ...startBlock, type: isTextBlock(startBlock) ? startBlock.type : "paragraph", runs: mergeRuns([...head, ...tail]), table: undefined, image: undefined };
  const blocks = [...model.blocks.slice(0, startIndex), merged, ...model.blocks.slice(endIndex + 1)];
  const removedIds = model.blocks.slice(startIndex + 1, endIndex + 1).map((block) => block.id);
  const next = {
    ...withBlocks(model, blocks),
    comments: model.comments.filter((comment) => !removedIds.includes(comment.anchor.blockId)),
    bookmarks: model.bookmarks.filter((bookmark) => !removedIds.includes(bookmark.blockId)),
  };
  return { model: next, selection: collapsed({ blockId: merged.id, offset: from.offset }) };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Insert text at a collapsed position, or over a range. */
export function insertText(model: DocModel, range: DocRange, text: string, actor: EditActor, marks?: MarkType[]): CommandResult {
  let working = model;
  let position = orderedRange(model, range).from;
  if (!isCollapsed(range)) {
    const cleared = deleteRange(model, range, actor);
    working = cleared.model;
    position = cleared.selection.head;
  }
  const index = blockIndex(working, position.blockId);
  if (index < 0) return { model: working, selection: collapsed(position) };
  const block = working.blocks[index];
  if (!isTextBlock(block)) {
    const paragraph: Block = { ...emptyBlock("paragraph"), runs: [{ text, marks: marks ?? [] }] };
    const blocks = [...working.blocks.slice(0, index + 1), paragraph, ...working.blocks.slice(index + 1)];
    return { model: withBlocks(working, blocks), selection: collapsed({ blockId: paragraph.id, offset: text.length }) };
  }
  const length = blockText(block).length;
  const offset = Math.min(position.offset, length);
  const inherited = marks ?? sliceRuns(block.runs, Math.max(0, offset - 1), offset)[0]?.marks ?? [];
  const suggestionId = working.suggestMode ? nextId("sg") : undefined;
  const inserted: InlineRun = {
    text,
    marks: [...inherited],
    ...(suggestionId ? { suggestion: { id: suggestionId, kind: "insert" as const } } : {}),
  };
  const runs = mergeRuns([...sliceRuns(block.runs, 0, offset), inserted, ...sliceRuns(block.runs, offset, length)]);
  let next = replaceBlock(working, block.id, { ...block, runs });
  next = remapComments(next, block.id, offset, 0, text.length);
  if (suggestionId) {
    next = {
      ...next,
      suggestions: [{ id: suggestionId, kind: "insert", author: actor.author, at: actor.at, note: `Proposed insertion of “${truncate(text, 60)}”`, status: "open" }, ...next.suggestions],
    };
  }
  return { model: next, selection: collapsed({ blockId: block.id, offset: offset + text.length }) };
}

/** Split a block at a position, producing two blocks. */
export function splitBlock(model: DocModel, range: DocRange, actor: EditActor): CommandResult {
  let working = model;
  let position = orderedRange(model, range).from;
  if (!isCollapsed(range)) {
    const cleared = deleteRange(model, range, actor);
    working = cleared.model;
    position = cleared.selection.head;
  }
  const index = blockIndex(working, position.blockId);
  if (index < 0) return { model: working, selection: collapsed(position) };
  const block = working.blocks[index];
  if (!isTextBlock(block)) {
    const paragraph = emptyBlock("paragraph");
    const blocks = [...working.blocks.slice(0, index + 1), paragraph, ...working.blocks.slice(index + 1)];
    return { model: withBlocks(working, blocks), selection: collapsed({ blockId: paragraph.id, offset: 0 }) };
  }
  const length = blockText(block).length;
  const offset = Math.min(position.offset, length);
  const head: Block = { ...block, runs: sliceRuns(block.runs, 0, offset) };
  const continues = block.type === "bulletItem" || block.type === "numberItem" || block.type === "code";
  const tail: Block = {
    id: nextId(),
    type: continues ? block.type : block.type === "paragraph" ? "paragraph" : "paragraph",
    styleId: continues ? block.styleId : undefined,
    indent: continues ? block.indent : undefined,
    runs: sliceRuns(block.runs, offset, length),
  };
  const blocks = [...working.blocks.slice(0, index), head, tail, ...working.blocks.slice(index + 1)];
  const comments = working.comments.map((comment) => {
    if (comment.anchor.blockId !== block.id) return comment;
    if (comment.anchor.start >= offset) {
      return { ...comment, anchor: { blockId: tail.id, start: comment.anchor.start - offset, end: comment.anchor.end - offset } };
    }
    return { ...comment, anchor: { ...comment.anchor, end: Math.min(comment.anchor.end, offset) } };
  });
  return { model: { ...withBlocks(working, blocks), comments }, selection: collapsed({ blockId: tail.id, offset: 0 }) };
}

/** Backspace at the start of a block: lift a list item, else merge upwards. */
export function mergeBackwards(model: DocModel, position: DocPosition): CommandResult {
  const index = blockIndex(model, position.blockId);
  if (index <= 0) return { model, selection: collapsed(position) };
  const block = model.blocks[index];
  if (block.type === "bulletItem" || block.type === "numberItem" || block.type === "quote" || block.type === "code") {
    if ((block.indent ?? 0) > 0) return outdent(model, position);
    return { model: replaceBlock(model, block.id, { ...block, type: "paragraph" }), selection: collapsed(position) };
  }
  const previous = model.blocks[index - 1];
  if (!isTextBlock(previous)) {
    const blocks = model.blocks.filter((_, i) => i !== index - 1);
    return { model: withBlocks(model, blocks), selection: collapsed(position) };
  }
  if (!isTextBlock(block)) {
    const blocks = model.blocks.filter((_, i) => i !== index);
    return { model: withBlocks(model, blocks), selection: collapsed({ blockId: previous.id, offset: blockText(previous).length }) };
  }
  const boundary = blockText(previous).length;
  const merged: Block = { ...previous, runs: mergeRuns([...previous.runs, ...block.runs]) };
  const blocks = [...model.blocks.slice(0, index - 1), merged, ...model.blocks.slice(index + 1)];
  const comments = model.comments.map((comment) => (
    comment.anchor.blockId === block.id
      ? { ...comment, anchor: { blockId: merged.id, start: comment.anchor.start + boundary, end: comment.anchor.end + boundary } }
      : comment
  ));
  const bookmarks = model.bookmarks.map((bookmark) => (bookmark.blockId === block.id ? { ...bookmark, blockId: merged.id } : bookmark));
  return { model: { ...withBlocks(model, blocks), comments, bookmarks }, selection: collapsed({ blockId: merged.id, offset: boundary }) };
}

export function setBlockType(model: DocModel, range: DocRange, type: BlockType, styleId?: string): CommandResult {
  const { from, to } = orderedRange(model, range);
  const startIndex = blockIndex(model, from.blockId);
  const endIndex = blockIndex(model, to.blockId);
  if (startIndex < 0) return { model, selection: range };
  const blocks = model.blocks.map((block, index) => {
    if (index < startIndex || index > endIndex) return block;
    if (!isTextBlock(block)) return block;
    return { ...block, type, styleId: styleId ?? block.styleId };
  });
  return { model: withBlocks(model, blocks), selection: range };
}

export function setStyle(model: DocModel, range: DocRange, styleId: string | undefined): CommandResult {
  const { from, to } = orderedRange(model, range);
  const startIndex = blockIndex(model, from.blockId);
  const endIndex = blockIndex(model, to.blockId);
  const blocks = model.blocks.map((block, index) => (
    index < startIndex || index > endIndex ? block : { ...block, styleId }
  ));
  return { model: withBlocks(model, blocks), selection: range };
}

export function indent(model: DocModel, position: DocPosition): CommandResult {
  const block = model.blocks[blockIndex(model, position.blockId)];
  if (!block) return { model, selection: collapsed(position) };
  const next = Math.min(4, (block.indent ?? 0) + 1);
  return { model: replaceBlock(model, block.id, { ...block, indent: next }), selection: collapsed(position) };
}

export function outdent(model: DocModel, position: DocPosition): CommandResult {
  const block = model.blocks[blockIndex(model, position.blockId)];
  if (!block) return { model, selection: collapsed(position) };
  const next = Math.max(0, (block.indent ?? 0) - 1);
  return { model: replaceBlock(model, block.id, { ...block, indent: next }), selection: collapsed(position) };
}

export function insertBlockAfter(model: DocModel, blockId: string | undefined, block: Block): CommandResult {
  const index = blockId ? blockIndex(model, blockId) : model.blocks.length - 1;
  const at = index < 0 ? model.blocks.length : index + 1;
  const blocks = [...model.blocks.slice(0, at), block, ...model.blocks.slice(at)];
  const focus = isTextBlock(block) ? block : blocks[at + 1] ?? block;
  return { model: withBlocks(model, blocks), selection: collapsed({ blockId: focus.id, offset: 0 }) };
}

export function removeBlock(model: DocModel, blockId: string): CommandResult {
  const index = blockIndex(model, blockId);
  if (index < 0) return { model, selection: collapsed({ blockId, offset: 0 }) };
  const blocks = model.blocks.filter((block) => block.id !== blockId);
  const safe = blocks.length ? blocks : [emptyBlock()];
  const target = safe[Math.max(0, index - 1)];
  return {
    model: {
      ...withBlocks(model, safe),
      comments: model.comments.filter((comment) => comment.anchor.blockId !== blockId),
      bookmarks: model.bookmarks.filter((bookmark) => bookmark.blockId !== blockId),
    },
    selection: collapsed({ blockId: target.id, offset: 0 }),
  };
}

/**
 * Move a block (and, for a heading, the section it owns) to a new index.
 * Comments and bookmarks travel with their blocks because they are anchored
 * by block id, which satisfies the DOCS-003 edge case.
 */
export function moveSection(model: DocModel, blockId: string, direction: -1 | 1): CommandResult {
  const index = blockIndex(model, blockId);
  if (index < 0) return { model, selection: collapsed({ blockId, offset: 0 }) };
  const block = model.blocks[index];
  const level = headingLevel(block);
  const span = level ? sectionSpan(model, index) : 1;
  const group = model.blocks.slice(index, index + span);
  const rest = [...model.blocks.slice(0, index), ...model.blocks.slice(index + span)];
  let target: number;
  if (direction === -1) {
    if (index === 0) return { model, selection: collapsed({ blockId, offset: 0 }) };
    const previousStart = level ? previousSectionStart(model, index, level) : index - 1;
    target = previousStart;
  } else {
    const after = index + span;
    if (after >= model.blocks.length) return { model, selection: collapsed({ blockId, offset: 0 }) };
    const nextLevel = headingLevel(model.blocks[after]);
    const nextSpan = nextLevel ? sectionSpan(model, after) : 1;
    target = index + nextSpan;
  }
  const blocks = [...rest.slice(0, target), ...group, ...rest.slice(target)];
  return { model: withBlocks(model, blocks), selection: collapsed({ blockId, offset: 0 }) };
}

export function headingLevel(block: Block): 0 | 1 | 2 | 3 {
  if (block.type === "heading1") return 1;
  if (block.type === "heading2") return 2;
  if (block.type === "heading3") return 3;
  return 0;
}

export function sectionSpan(model: DocModel, index: number): number {
  const level = headingLevel(model.blocks[index]);
  if (!level) return 1;
  let span = 1;
  for (let i = index + 1; i < model.blocks.length; i += 1) {
    const next = headingLevel(model.blocks[i]);
    if (next && next <= level) break;
    span += 1;
  }
  return span;
}

function previousSectionStart(model: DocModel, index: number, level: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = headingLevel(model.blocks[i]);
    if (candidate && candidate <= level) return i;
  }
  return 0;
}

/* ----------------------------- Comment anchors ----------------------------- */

function remapComments(model: DocModel, blockId: string, at: number, removed: number, added: number): DocModel {
  if (removed === 0 && added === 0) return model;
  const comments = model.comments.map((comment) => {
    if (comment.anchor.blockId !== blockId) return comment;
    // An insertion exactly at the start boundary pushes the anchor along; one
    // at the end boundary does not extend it, so typing after a commented
    // phrase does not quietly widen what the comment is about.
    const shiftStart = (offset: number) => {
      if (offset < at) return offset;
      if (offset >= at + removed) return offset - removed + added;
      return at + added;
    };
    const shiftEnd = (offset: number) => {
      if (offset <= at) return offset;
      if (offset >= at + removed) return offset - removed + added;
      return at + added;
    };
    return { ...comment, anchor: { ...comment.anchor, start: shiftStart(comment.anchor.start), end: shiftEnd(comment.anchor.end) } };
  });
  return { ...model, comments };
}

export function addComment(model: DocModel, range: DocRange, body: string, actor: EditActor, mandatory = false): { model: DocModel; comment: DocComment } | null {
  if (isCollapsed(range)) return null;
  const { from, to } = orderedRange(model, range);
  if (from.blockId !== to.blockId) {
    // A comment anchors to one block range; use the first block's remainder.
    const block = model.blocks[blockIndex(model, from.blockId)];
    if (!block) return null;
    const end = blockText(block).length;
    const comment: DocComment = {
      id: nextId("cm"), anchor: { blockId: block.id, start: from.offset, end },
      quote: blockText(block).slice(from.offset, end), author: actor.author, at: actor.at,
      body, resolved: false, mandatory, replies: [],
    };
    return { model: { ...model, comments: [comment, ...model.comments] }, comment };
  }
  const block = model.blocks[blockIndex(model, from.blockId)];
  if (!block) return null;
  const comment: DocComment = {
    id: nextId("cm"),
    anchor: { blockId: block.id, start: from.offset, end: to.offset },
    quote: blockText(block).slice(from.offset, to.offset),
    author: actor.author, at: actor.at, body, resolved: false, mandatory, replies: [],
  };
  return { model: { ...model, comments: [comment, ...model.comments] }, comment };
}

/** True when the anchored text no longer matches the captured quote. */
export function commentDrifted(model: DocModel, comment: DocComment): boolean {
  const block = model.blocks[blockIndex(model, comment.anchor.blockId)];
  if (!block) return true;
  return blockText(block).slice(comment.anchor.start, comment.anchor.end) !== comment.quote;
}

/* ----------------------------- Tracked changes ----------------------------- */

export function resolveSuggestion(model: DocModel, suggestionId: string, decision: "accepted" | "rejected"): DocModel {
  const blocks = model.blocks.map((block) => {
    if (!isTextBlock(block)) return block;
    if (!block.runs.some((run) => run.suggestion?.id === suggestionId)) return block;
    const runs: InlineRun[] = [];
    for (const run of block.runs) {
      if (run.suggestion?.id !== suggestionId) { runs.push(run); continue; }
      const keep = (run.suggestion.kind === "insert" && decision === "accepted") || (run.suggestion.kind === "delete" && decision === "rejected");
      if (!keep) continue;
      const next = { ...run };
      delete next.suggestion;
      runs.push(next);
    }
    return { ...block, runs: mergeRuns(runs) };
  });
  return {
    ...model,
    blocks,
    suggestions: model.suggestions.map((item) => (item.id === suggestionId ? { ...item, status: decision } : item)),
  };
}

export function openSuggestions(model: DocModel): Suggestion[] {
  return model.suggestions.filter((item) => item.status === "open");
}

/* ----------------------------- Statistics ----------------------------- */

export interface DocStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  headings: number;
  readingMinutes: number;
  sentences: number;
  averageSentenceWords: number;
  longParagraphs: number;
  passiveHints: number;
}

const PASSIVE = /\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi;

export function documentStats(model: DocModel): DocStats {
  let words = 0;
  let characters = 0;
  let charactersNoSpaces = 0;
  let paragraphs = 0;
  let headings = 0;
  let sentences = 0;
  let longParagraphs = 0;
  let passiveHints = 0;
  for (const block of model.blocks) {
    const text = visibleText(block);
    if (block.type === "pageBreak") continue;
    if (headingLevel(block)) headings += 1;
    else if (text.trim()) paragraphs += 1;
    const blockWords = text.trim() ? text.trim().split(/\s+/).length : 0;
    words += blockWords;
    characters += text.length;
    charactersNoSpaces += text.replace(/\s/g, "").length;
    sentences += (text.match(/[.!?](\s|$)/g) ?? []).length;
    if (blockWords > 90) longParagraphs += 1;
    passiveHints += (text.match(PASSIVE) ?? []).length;
  }
  return {
    words, characters, charactersNoSpaces, paragraphs, headings, sentences,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    averageSentenceWords: sentences ? Math.round((words / sentences) * 10) / 10 : 0,
    longParagraphs, passiveHints,
  };
}

/* ----------------------------- Pagination ----------------------------- */

export interface PageBreakdown { pages: { index: number; blockIds: string[]; words: number }[] }

const BLOCK_HEIGHT: Record<BlockType, number> = {
  heading1: 56, heading2: 40, heading3: 32, paragraph: 26, bulletItem: 24,
  numberItem: 24, quote: 30, code: 24, table: 40, image: 220, pageBreak: 0,
};

/** Estimate page boundaries so the layout tab can show a real preview. */
export function paginate(model: DocModel): PageBreakdown {
  const pageHeight = (model.page.size === "A4" ? 1123 : 1056) - model.page.margin * 2;
  const columnFactor = model.page.columns === 2 ? 2 : 1;
  const capacity = pageHeight * columnFactor;
  const pages: PageBreakdown["pages"] = [];
  let current: string[] = [];
  let used = 0;
  let words = 0;
  const push = () => {
    pages.push({ index: pages.length + 1, blockIds: current, words });
    current = [];
    used = 0;
    words = 0;
  };
  for (const block of model.blocks) {
    if (block.type === "pageBreak") {
      current.push(block.id);
      push();
      continue;
    }
    const text = visibleText(block);
    const lines = Math.max(1, Math.ceil((text.length || 1) / (model.page.columns === 2 ? 48 : 92)));
    const height = block.type === "image" ? BLOCK_HEIGHT.image : BLOCK_HEIGHT[block.type] * lines;
    if (used + height > capacity && current.length) push();
    current.push(block.id);
    used += height;
    words += text.trim() ? text.trim().split(/\s+/).length : 0;
  }
  if (current.length || pages.length === 0) push();
  return { pages };
}

/* ----------------------------- Find & replace ----------------------------- */

export interface Hit { blockId: string; start: number; end: number; preview: string }

export function findAll(model: DocModel, needle: string, options: { caseSensitive?: boolean; wholeWord?: boolean } = {}): Hit[] {
  if (!needle) return [];
  const hits: Hit[] = [];
  const flags = options.caseSensitive ? "g" : "gi";
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(options.wholeWord ? `\\b${escaped}\\b` : escaped, flags);
  for (const block of model.blocks) {
    if (!isTextBlock(block)) continue;
    const text = blockText(block);
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      hits.push({
        blockId: block.id,
        start: match.index,
        end: match.index + match[0].length,
        preview: text.slice(Math.max(0, match.index - 24), match.index + match[0].length + 24),
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
  }
  return hits;
}

export function replaceAll(model: DocModel, needle: string, replacement: string, options: { caseSensitive?: boolean; wholeWord?: boolean } = {}): { model: DocModel; count: number } {
  const hits = findAll(model, needle, options);
  if (hits.length === 0) return { model, count: 0 };
  let working = model;
  // Replace from the end so earlier offsets stay valid.
  for (const hit of [...hits].reverse()) {
    const index = blockIndex(working, hit.blockId);
    if (index < 0) continue;
    const block = working.blocks[index];
    const length = blockText(block).length;
    const marks = sliceRuns(block.runs, hit.start, hit.end)[0]?.marks ?? [];
    const link = sliceRuns(block.runs, hit.start, hit.end)[0]?.link;
    const runs = mergeRuns([
      ...sliceRuns(block.runs, 0, hit.start),
      ...(replacement ? [{ text: replacement, marks: [...marks], ...(link ? { link } : {}) }] : []),
      ...sliceRuns(block.runs, hit.end, length),
    ]);
    working = remapComments(replaceBlock(working, block.id, { ...block, runs }), block.id, hit.start, hit.end - hit.start, replacement.length);
  }
  return { model: working, count: hits.length };
}

/* ----------------------------- Outline ----------------------------- */

export interface OutlineNode { blockId: string; level: 1 | 2 | 3; text: string; index: number; words: number; comments: number }

export function outline(model: DocModel): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  model.blocks.forEach((block, index) => {
    const level = headingLevel(block);
    if (!level) return;
    const span = sectionSpan(model, index);
    const ids = model.blocks.slice(index, index + span).map((item) => item.id);
    const words = model.blocks.slice(index, index + span)
      .reduce((total, item) => total + (visibleText(item).trim() ? visibleText(item).trim().split(/\s+/).length : 0), 0);
    nodes.push({
      blockId: block.id, level, text: visibleText(block) || "Untitled heading", index, words,
      comments: model.comments.filter((comment) => ids.includes(comment.anchor.blockId) && !comment.resolved).length,
    });
  });
  return nodes;
}

export interface StructureWarning { id: string; message: string; blockId?: string }

/** Problems the DOCS-003 overlay reports rather than silently tolerating. */
export function structureWarnings(model: DocModel): StructureWarning[] {
  const warnings: StructureWarning[] = [];
  const headings = outline(model);
  if (headings.length === 0) warnings.push({ id: "none", message: "The document has no headings, so it has no navigable structure." });
  const firstLevels = headings.map((node) => node.level);
  if (firstLevels.length && firstLevels[0] !== 1) {
    warnings.push({ id: "start", message: `The document starts at heading ${firstLevels[0]} rather than heading 1.`, blockId: headings[0].blockId });
  }
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      warnings.push({ id: `skip-${headings[i].blockId}`, message: `“${headings[i].text}” jumps from heading ${headings[i - 1].level} to heading ${headings[i].level}.`, blockId: headings[i].blockId });
    }
  }
  const empty = model.blocks.filter((block) => headingLevel(block) && !visibleText(block).trim());
  for (const block of empty) warnings.push({ id: `empty-${block.id}`, message: "A heading has no text, so the outline shows a blank entry.", blockId: block.id });
  for (const comment of model.comments) {
    if (commentDrifted(model, comment)) {
      warnings.push({ id: `drift-${comment.id}`, message: `A comment on “${comment.quote}” no longer matches the text it is anchored to.`, blockId: comment.anchor.blockId });
    }
  }
  return warnings;
}

/* ----------------------------- Export ----------------------------- */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MARK_TAG: Record<MarkType, string> = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" };

function runToHtml(run: InlineRun): string {
  let html = escapeHtml(run.text);
  for (const mark of run.marks) html = `<${MARK_TAG[mark]}>${html}</${MARK_TAG[mark]}>`;
  if (run.link) html = `<a href="${escapeHtml(run.link)}">${html}</a>`;
  return html;
}

function inlineHtml(block: Block): string {
  return block.runs.filter((run) => run.suggestion?.kind !== "delete").map(runToHtml).join("");
}

export function toHtml(model: DocModel, title: string): string {
  const parts: string[] = [];
  let listOpen: "ul" | "ol" | null = null;
  const closeList = () => { if (listOpen) { parts.push(`</${listOpen}>`); listOpen = null; } };
  for (const block of model.blocks) {
    if (block.type === "bulletItem" || block.type === "numberItem") {
      const wanted = block.type === "bulletItem" ? "ul" : "ol";
      if (listOpen !== wanted) { closeList(); parts.push(`<${wanted}>`); listOpen = wanted; }
      parts.push(`<li>${inlineHtml(block)}</li>`);
      continue;
    }
    closeList();
    if (block.type === "heading1") parts.push(`<h1>${inlineHtml(block)}</h1>`);
    else if (block.type === "heading2") parts.push(`<h2>${inlineHtml(block)}</h2>`);
    else if (block.type === "heading3") parts.push(`<h3>${inlineHtml(block)}</h3>`);
    else if (block.type === "quote") parts.push(`<blockquote>${inlineHtml(block)}</blockquote>`);
    else if (block.type === "code") parts.push(`<pre><code>${escapeHtml(blockText(block))}</code></pre>`);
    else if (block.type === "pageBreak") parts.push('<hr class="page-break" />');
    else if (block.type === "image") {
      parts.push(`<figure><div class="image-reference" role="img" aria-label="${escapeHtml(block.image?.alt ?? "Image")}">${escapeHtml(block.image?.assetId ?? "No asset referenced")}</div><figcaption>${escapeHtml(block.image?.caption ?? "")}</figcaption></figure>`);
    } else if (block.type === "table") {
      const rows = block.table?.rows ?? [];
      const head = block.table?.header && rows.length
        ? `<thead><tr>${rows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`
        : "";
      const bodyRows = block.table?.header ? rows.slice(1) : rows;
      parts.push(`<table>${head}<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else parts.push(`<p>${inlineHtml(block)}</p>`);
  }
  closeList();
  /* A standalone export opens outside this application, where the workspace's
   * CSS custom properties do not exist, so the exported stylesheet has to
   * carry concrete values. They are the warm neutrals of the design system. */
  const style = "body{font-family:Inter,system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.5rem;line-height:1.6;color:#282724}"
    + "h1,h2,h3{line-height:1.2;font-family:'IBM Plex Sans Condensed',Inter,system-ui,sans-serif}"
    + "blockquote{border-inline-start:3px solid #cac5ba;margin:0;padding-inline-start:1rem;color:#54514b}"
    + "table{border-collapse:collapse;width:100%}th,td{border:1px solid #e0dcd4;padding:.5rem;text-align:start}th{background:#f6f4f0}"
    + "pre{background:#f6f4f0;padding:1rem;border-radius:8px;overflow:auto;font-family:'IBM Plex Mono',ui-monospace,monospace}"
    + "code{font-family:'IBM Plex Mono',ui-monospace,monospace}a{color:#1c40c4}"
    + ".page-break{page-break-after:always;border:0;border-top:1px dashed #cac5ba}"
    + ".image-reference{background:#edeae4;border:1px dashed #cac5ba;padding:2rem;text-align:center;color:#6f6b64;font-family:'IBM Plex Mono',ui-monospace,monospace}";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${style}</style></head><body>${parts.join("\n")}</body></html>`;
}

function markdownInline(block: Block): string {
  return block.runs
    .filter((run) => run.suggestion?.kind !== "delete")
    .map((run) => {
      let text = run.text;
      if (run.marks.includes("code")) text = `\`${text}\``;
      if (run.marks.includes("bold")) text = `**${text}**`;
      if (run.marks.includes("italic")) text = `*${text}*`;
      if (run.marks.includes("strike")) text = `~~${text}~~`;
      if (run.marks.includes("underline")) text = `<u>${text}</u>`;
      if (run.link) text = `[${text}](${run.link})`;
      return text;
    })
    .join("");
}

export function toMarkdown(model: DocModel, title: string): string {
  const lines: string[] = [];
  let numberCounter = 0;
  for (const block of model.blocks) {
    const pad = "  ".repeat(block.indent ?? 0);
    if (block.type !== "numberItem") numberCounter = 0;
    switch (block.type) {
      case "heading1": lines.push(`# ${markdownInline(block)}`, ""); break;
      case "heading2": lines.push(`## ${markdownInline(block)}`, ""); break;
      case "heading3": lines.push(`### ${markdownInline(block)}`, ""); break;
      case "bulletItem": lines.push(`${pad}- ${markdownInline(block)}`); break;
      case "numberItem": numberCounter += 1; lines.push(`${pad}${numberCounter}. ${markdownInline(block)}`); break;
      case "quote": lines.push(`> ${markdownInline(block)}`, ""); break;
      case "code": lines.push("```", blockText(block), "```", ""); break;
      case "pageBreak": lines.push("---", ""); break;
      case "image": lines.push(`![${block.image?.alt ?? ""}](asset:${block.image?.assetId ?? "unreferenced"})`, block.image?.caption ? `*${block.image.caption}*` : "", ""); break;
      case "table": {
        const rows = block.table?.rows ?? [];
        if (rows.length) {
          lines.push(`| ${rows[0].join(" | ")} |`);
          lines.push(`| ${rows[0].map(() => "---").join(" | ")} |`);
          for (const row of rows.slice(1)) lines.push(`| ${row.join(" | ")} |`);
          lines.push("");
        }
        break;
      }
      default: {
        const text = markdownInline(block);
        if (text) lines.push(text, "");
        break;
      }
    }
  }
  const header = title ? `<!-- ${title} -->\n\n` : "";
  return header + lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function toPlainText(model: DocModel): string {
  return model.blocks.map((block) => visibleText(block)).join("\n\n").trim();
}

/* ----------------------------- History ----------------------------- */

export interface HistoryEntry { model: DocModel; selection: DocRange; label: string; at: number }

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

const COALESCE_MS = 700;

/** Push an entry, coalescing consecutive typing into one undo step. */
export function pushHistory(history: History, entry: HistoryEntry, coalesceWith?: string): History {
  const last = history.past[history.past.length - 1];
  if (last && coalesceWith && last.label === coalesceWith && entry.at - last.at < COALESCE_MS) {
    return { past: history.past, future: [] };
  }
  return { past: [...history.past.slice(-80), entry], future: [] };
}

/* ----------------------------- Autoformat ----------------------------- */

const AUTOFORMAT: { pattern: RegExp; type: BlockType }[] = [
  { pattern: /^###\s$/, type: "heading3" },
  { pattern: /^##\s$/, type: "heading2" },
  { pattern: /^#\s$/, type: "heading1" },
  { pattern: /^[-*•]\s$/, type: "bulletItem" },
  { pattern: /^1[.)]\s$/, type: "numberItem" },
  { pattern: /^>\s$/, type: "quote" },
];

/**
 * Markdown-style shortcuts typed at the start of a paragraph: "# " makes a
 * heading, "- " a bullet, "1. " a numbered item, "> " a quote. Returns null
 * when nothing applies; never runs in suggesting mode, where the change has to
 * be proposed rather than made.
 */
export function autoformat(model: DocModel, position: DocPosition): CommandResult | null {
  if (model.suggestMode) return null;
  const index = blockIndex(model, position.blockId);
  const block = model.blocks[index];
  if (!block || block.type !== "paragraph") return null;
  const before = blockText(block).slice(0, position.offset);
  const rule = AUTOFORMAT.find((item) => item.pattern.test(before));
  if (!rule) return null;
  const runs = sliceRuns(block.runs, before.length, blockText(block).length);
  const next = replaceBlock(model, block.id, { ...block, type: rule.type, runs: runs.length ? runs : [{ text: "", marks: [] }] });
  return { model: remapComments(next, block.id, 0, before.length, 0), selection: collapsed({ blockId: block.id, offset: 0 }) };
}

/* ----------------------------- Table structure ----------------------------- */

export type TableEdit =
  | { kind: "addRow"; after: number }
  | { kind: "addColumn"; after: number }
  | { kind: "removeRow"; at: number }
  | { kind: "removeColumn"; at: number };

/** Add or remove a table row or column. A table keeps at least one row and one column. */
export function editTable(model: DocModel, blockId: string, edit: TableEdit): DocModel {
  const block = model.blocks[blockIndex(model, blockId)];
  if (!block?.table) return model;
  const rows = block.table.rows.map((row) => [...row]);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (edit.kind === "addRow") {
    const at = Math.max(0, Math.min(rows.length, edit.after + 1));
    rows.splice(at, 0, new Array<string>(Math.max(1, width)).fill(""));
  } else if (edit.kind === "addColumn") {
    const at = Math.max(0, Math.min(width, edit.after + 1));
    for (const row of rows) {
      while (row.length < width) row.push("");
      row.splice(at, 0, "");
    }
  } else if (edit.kind === "removeRow") {
    const minimum = block.table.header ? 2 : 1;
    if (rows.length <= minimum || edit.at < 0 || edit.at >= rows.length) return model;
    rows.splice(edit.at, 1);
  } else {
    if (width <= 1 || edit.at < 0 || edit.at >= width) return model;
    for (const row of rows) row.splice(edit.at, 1);
  }
  return replaceBlock(model, blockId, { ...block, table: { ...block.table, rows } });
}
