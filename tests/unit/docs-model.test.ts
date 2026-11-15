import { describe, expect, it } from "vitest";
import {
  activeMarks, addComment, blockText, blocksFromHtml, collapsed, commentDrifted, deleteRange,
  documentStats, emptyBlock, findAll, insertBlockAfter, insertText, mergeBackwards, moveSection,
  outline, paginate, pushHistory, readDoc, removeBlock, replaceAll, resolveSuggestion, setBlockType,
  setLink, splitBlock, structureWarnings, textBlock, toHtml, toMarkdown, toggleMark, visibleText,
  type DocModel, type DocRange, type History, type HistoryEntry,
} from "@/applications/docs/model";

const ACTOR = { author: "Maya Chen", at: "2026-11-14T09:30:00.000Z" };

function doc(blocks: Parameters<typeof makeDoc>[0]): DocModel {
  return makeDoc(blocks);
}

function makeDoc(blocks: DocModel["blocks"]): DocModel {
  return {
    blocks,
    comments: [], suggestions: [], bookmarks: [], styles: [], references: [],
    page: { size: "A4", margin: 72, columns: 1, header: "", footer: "", showPageNumbers: true },
    suggestMode: false, shares: [],
  };
}

function range(blockId: string, start: number, end = start): DocRange {
  return { anchor: { blockId, offset: start }, head: { blockId, offset: end } };
}

describe("reading a stored body", () => {
  it("parses the HTML the previous editor stored", () => {
    const blocks = blocksFromHtml("<h2>Brief</h2><p>The <strong>Arc Lamp</strong> stays in brass.</p><ul><li>One</li><li>Two</li></ul>");
    expect(blocks.map((block) => block.type)).toEqual(["heading2", "paragraph", "bulletItem", "bulletItem"]);
    expect(blockText(blocks[1])).toBe("The Arc Lamp stays in brass.");
    expect(blocks[1].runs.find((run) => run.text === "Arc Lamp")?.marks).toEqual(["bold"]);
  });

  it("reads a link and nested marks", () => {
    const blocks = blocksFromHtml('<p>See <a href="/terms"><em>the terms</em></a>.</p>');
    const link = blocks[0].runs.find((run) => run.link);
    expect(link?.link).toBe("/terms");
    expect(link?.marks).toEqual(["italic"]);
  });

  it("upgrades a legacy quote comment into a block anchor", () => {
    const model = readDoc(
      { html: "<p>Arc Lamp at £900 ex VAT</p>", comments: [{ id: "c1", text: "Keep the price ex VAT.", quote: "£900" }] },
      ACTOR.author, ACTOR.at,
    );
    expect(model.comments).toHaveLength(1);
    const comment = model.comments[0];
    expect(comment.anchor.blockId).toBe(model.blocks[0].id);
    expect(blockText(model.blocks[0]).slice(comment.anchor.start, comment.anchor.end)).toBe("£900");
    expect(commentDrifted(model, comment)).toBe(false);
  });
});

describe("marks", () => {
  it("applies a mark over a range and reports it active", () => {
    const model = doc([textBlock("paragraph", "Arc Lamp in brass")]);
    const id = model.blocks[0].id;
    const bolded = toggleMark(model, range(id, 0, 8), "bold").model;
    expect(bolded.blocks[0].runs.map((run) => [run.text, run.marks])).toEqual([["Arc Lamp", ["bold"]], [" in brass", []]]);
    expect(activeMarks(bolded, range(id, 0, 8))).toEqual(["bold"]);
    expect(activeMarks(bolded, range(id, 0, 17))).toEqual([]);
  });

  it("removes a mark when the whole range already carries it", () => {
    const model = doc([textBlock("paragraph", "Arc Lamp")]);
    const id = model.blocks[0].id;
    const once = toggleMark(model, range(id, 0, 8), "bold").model;
    const twice = toggleMark(once, range(id, 0, 8), "bold").model;
    expect(twice.blocks[0].runs).toEqual([{ text: "Arc Lamp", marks: [] }]);
  });

  it("stacks independent marks and merges identical neighbours", () => {
    const model = doc([textBlock("paragraph", "Arc Lamp")]);
    const id = model.blocks[0].id;
    let next = toggleMark(model, range(id, 0, 8), "bold").model;
    next = toggleMark(next, range(id, 0, 8), "italic").model;
    expect(next.blocks[0].runs).toHaveLength(1);
    expect(next.blocks[0].runs[0].marks.sort()).toEqual(["bold", "italic"]);
  });

  it("applies a mark across several blocks", () => {
    const model = doc([textBlock("paragraph", "First line"), textBlock("paragraph", "Second line")]);
    const [a, b] = model.blocks;
    const next = toggleMark(model, { anchor: { blockId: a.id, offset: 6 }, head: { blockId: b.id, offset: 6 } }, "underline").model;
    expect(next.blocks[0].runs.at(-1)?.marks).toEqual(["underline"]);
    expect(next.blocks[1].runs[0].marks).toEqual(["underline"]);
    expect(next.blocks[1].runs.at(-1)?.marks).toEqual([]);
  });

  it("does nothing for a collapsed selection", () => {
    const model = doc([textBlock("paragraph", "Arc Lamp")]);
    const next = toggleMark(model, range(model.blocks[0].id, 3), "bold").model;
    expect(next).toBe(model);
  });

  it("sets and clears a link over a range", () => {
    const model = doc([textBlock("paragraph", "Read the terms")]);
    const id = model.blocks[0].id;
    const linked = setLink(model, range(id, 9, 14), "https://example.test/terms").model;
    expect(linked.blocks[0].runs.at(-1)?.link).toBe("https://example.test/terms");
    const cleared = setLink(linked, range(id, 9, 14), undefined).model;
    expect(cleared.blocks[0].runs.every((run) => run.link === undefined)).toBe(true);
  });
});

describe("structural commands", () => {
  it("splits a block, keeping marks on both halves", () => {
    const model = toggleMark(doc([textBlock("paragraph", "Arc Lamp in brass")]), range(doc([textBlock("paragraph", "x")]).blocks[0].id, 0, 1), "bold").model;
    const base = doc([textBlock("paragraph", "Arc Lamp in brass")]);
    const id = base.blocks[0].id;
    const bold = toggleMark(base, range(id, 0, 8), "bold").model;
    const result = splitBlock(bold, range(id, 8), ACTOR);
    expect(result.model.blocks).toHaveLength(2);
    expect(blockText(result.model.blocks[0])).toBe("Arc Lamp");
    expect(result.model.blocks[0].runs[0].marks).toEqual(["bold"]);
    expect(blockText(result.model.blocks[1])).toBe(" in brass");
    expect(result.selection.head).toEqual({ blockId: result.model.blocks[1].id, offset: 0 });
    expect(model.blocks).toHaveLength(1);
  });

  it("keeps the list type when a list item is split", () => {
    const base = doc([textBlock("bulletItem", "One item")]);
    const result = splitBlock(base, range(base.blocks[0].id, 8), ACTOR);
    expect(result.model.blocks[1].type).toBe("bulletItem");
  });

  it("turns a heading into a paragraph when split at its end", () => {
    const base = doc([textBlock("heading2", "Offer")]);
    const result = splitBlock(base, range(base.blocks[0].id, 5), ACTOR);
    expect(result.model.blocks[1].type).toBe("paragraph");
  });

  it("merges backwards into the previous block and moves the anchors", () => {
    const base = doc([textBlock("paragraph", "First"), textBlock("paragraph", "Second")]);
    const commented = addComment(base, range(base.blocks[1].id, 0, 6), "Check this", ACTOR)!;
    const merged = mergeBackwards(commented.model, { blockId: base.blocks[1].id, offset: 0 });
    expect(merged.model.blocks).toHaveLength(1);
    expect(blockText(merged.model.blocks[0])).toBe("FirstSecond");
    const comment = merged.model.comments[0];
    expect(comment.anchor.blockId).toBe(merged.model.blocks[0].id);
    expect(blockText(merged.model.blocks[0]).slice(comment.anchor.start, comment.anchor.end)).toBe("Second");
  });

  it("lifts a list item instead of merging it", () => {
    const base = doc([textBlock("paragraph", "Intro"), textBlock("bulletItem", "Point")]);
    const result = mergeBackwards(base, { blockId: base.blocks[1].id, offset: 0 });
    expect(result.model.blocks[1].type).toBe("paragraph");
    expect(result.model.blocks).toHaveLength(2);
  });

  it("deletes a range inside one block", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp in brass")]);
    const result = deleteRange(base, range(base.blocks[0].id, 8, 17), ACTOR);
    expect(blockText(result.model.blocks[0])).toBe("Arc Lamp");
    expect(result.selection.head.offset).toBe(8);
  });

  it("deletes across blocks and joins the remainders", () => {
    const base = doc([textBlock("paragraph", "First line"), textBlock("paragraph", "middle"), textBlock("paragraph", "Second line")]);
    const result = deleteRange(base, { anchor: { blockId: base.blocks[0].id, offset: 5 }, head: { blockId: base.blocks[2].id, offset: 6 } }, ACTOR);
    expect(result.model.blocks).toHaveLength(1);
    expect(blockText(result.model.blocks[0])).toBe("First line");
  });

  it("inserts text at a caret and inherits the marks before it", () => {
    const base = doc([textBlock("paragraph", "Arc")]);
    const id = base.blocks[0].id;
    const bold = toggleMark(base, range(id, 0, 3), "bold").model;
    const typed = insertText(bold, range(id, 3), " Lamp", ACTOR);
    expect(blockText(typed.model.blocks[0])).toBe("Arc Lamp");
    expect(typed.model.blocks[0].runs).toHaveLength(1);
    expect(typed.model.blocks[0].runs[0].marks).toEqual(["bold"]);
    expect(typed.selection.head.offset).toBe(8);
  });

  it("replaces a selection when text is typed over it", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp")]);
    const typed = insertText(base, range(base.blocks[0].id, 0, 3), "Wall", ACTOR);
    expect(blockText(typed.model.blocks[0])).toBe("Wall Lamp");
  });

  it("changes a block's type over a multi-block selection", () => {
    const base = doc([textBlock("paragraph", "A"), textBlock("paragraph", "B")]);
    const next = setBlockType(base, { anchor: { blockId: base.blocks[0].id, offset: 0 }, head: { blockId: base.blocks[1].id, offset: 1 } }, "bulletItem").model;
    expect(next.blocks.map((block) => block.type)).toEqual(["bulletItem", "bulletItem"]);
  });

  it("inserts and removes a non-text block", () => {
    const base = doc([textBlock("paragraph", "Intro")]);
    const withBreak = insertBlockAfter(base, base.blocks[0].id, { ...emptyBlock("pageBreak") }).model;
    expect(withBreak.blocks.map((block) => block.type)).toEqual(["paragraph", "pageBreak"]);
    const removed = removeBlock(withBreak, withBreak.blocks[1].id).model;
    expect(removed.blocks).toHaveLength(1);
  });
});

describe("outline and sections", () => {
  const base = doc([
    textBlock("heading1", "Winter collection brief"),
    textBlock("paragraph", "Opening paragraph."),
    textBlock("heading2", "Offer"),
    textBlock("paragraph", "Arc Lamp at £900 ex VAT."),
    textBlock("heading2", "Lead times"),
    textBlock("paragraph", "Six weeks from order."),
  ]);

  it("lists headings with their levels and section word counts", () => {
    const nodes = outline(base);
    expect(nodes.map((node) => [node.level, node.text])).toEqual([
      [1, "Winter collection brief"], [2, "Offer"], [2, "Lead times"],
    ]);
    expect(nodes[1].words).toBeGreaterThan(1);
  });

  it("moves a section with its body and keeps anchored comments", () => {
    const withComment = addComment(base, range(base.blocks[3].id, 0, 8), "Confirm the price", ACTOR)!.model;
    const moved = moveSection(withComment, base.blocks[4].id, -1).model;
    expect(moved.blocks.map((block) => blockText(block))).toEqual([
      "Winter collection brief", "Opening paragraph.",
      "Lead times", "Six weeks from order.",
      "Offer", "Arc Lamp at £900 ex VAT.",
    ]);
    const comment = moved.comments[0];
    expect(comment.anchor.blockId).toBe(base.blocks[3].id);
    expect(commentDrifted(moved, comment)).toBe(false);
  });

  it("reports a skipped heading level", () => {
    const broken = doc([textBlock("heading1", "Top"), textBlock("heading3", "Jumped")]);
    const warnings = structureWarnings(broken);
    expect(warnings.some((warning) => warning.message.includes("jumps from heading 1 to heading 3"))).toBe(true);
  });

  it("reports a comment whose anchor has drifted", () => {
    const withComment = addComment(base, range(base.blocks[3].id, 0, 8), "Confirm", ACTOR)!.model;
    const edited = insertText(withComment, range(base.blocks[3].id, 0), "Now ", ACTOR).model;
    const comment = edited.comments[0];
    expect(blockText(edited.blocks[3]).slice(comment.anchor.start, comment.anchor.end)).toBe("Arc Lamp");
    const broken: DocModel = { ...edited, comments: [{ ...comment, anchor: { ...comment.anchor, start: 0, end: 3 } }] };
    expect(commentDrifted(broken, broken.comments[0])).toBe(true);
    expect(structureWarnings(broken).some((warning) => warning.id.startsWith("drift-"))).toBe(true);
  });
});

describe("comments anchored to a block range", () => {
  it("captures the quoted text, not a canned string", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp at £900 ex VAT")]);
    const result = addComment(base, range(base.blocks[0].id, 12, 16), "Keep the price ex VAT.", ACTOR)!;
    expect(result.comment.quote).toBe("£900");
    expect(result.comment.body).toBe("Keep the price ex VAT.");
    expect(result.comment.author).toBe("Maya Chen");
  });

  it("moves the anchor when text is inserted before it", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp at £900 ex VAT")]);
    const commented = addComment(base, range(base.blocks[0].id, 12, 16), "Price", ACTOR)!.model;
    const typed = insertText(commented, range(base.blocks[0].id, 0), "The ", ACTOR).model;
    const comment = typed.comments[0];
    expect(blockText(typed.blocks[0]).slice(comment.anchor.start, comment.anchor.end)).toBe("£900");
  });

  it("refuses a comment on a collapsed selection", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp")]);
    expect(addComment(base, collapsed({ blockId: base.blocks[0].id, offset: 3 }), "Nope", ACTOR)).toBeNull();
  });
});

describe("tracked changes", () => {
  it("records an insertion as a suggestion and accepting it keeps the text", () => {
    const base: DocModel = { ...doc([textBlock("paragraph", "Arc Lamp")]), suggestMode: true };
    const typed = insertText(base, range(base.blocks[0].id, 8), " in brass", ACTOR);
    expect(typed.model.suggestions).toHaveLength(1);
    expect(typed.model.blocks[0].runs.at(-1)?.suggestion?.kind).toBe("insert");
    const accepted = resolveSuggestion(typed.model, typed.model.suggestions[0].id, "accepted");
    expect(blockText(accepted.blocks[0])).toBe("Arc Lamp in brass");
    expect(accepted.blocks[0].runs.every((run) => !run.suggestion)).toBe(true);
    expect(accepted.suggestions[0].status).toBe("accepted");
  });

  it("rejecting an insertion removes the text", () => {
    const base: DocModel = { ...doc([textBlock("paragraph", "Arc Lamp")]), suggestMode: true };
    const typed = insertText(base, range(base.blocks[0].id, 8), " in brass", ACTOR);
    const rejected = resolveSuggestion(typed.model, typed.model.suggestions[0].id, "rejected");
    expect(blockText(rejected.blocks[0])).toBe("Arc Lamp");
  });

  it("records a deletion without removing the text until it is accepted", () => {
    const base: DocModel = { ...doc([textBlock("paragraph", "Arc Lamp in brass")]), suggestMode: true };
    const result = deleteRange(base, range(base.blocks[0].id, 8, 17), ACTOR);
    expect(blockText(result.model.blocks[0])).toBe("Arc Lamp in brass");
    expect(visibleText(result.model.blocks[0])).toBe("Arc Lamp");
    const accepted = resolveSuggestion(result.model, result.model.suggestions[0].id, "accepted");
    expect(blockText(accepted.blocks[0])).toBe("Arc Lamp");
    const rejected = resolveSuggestion(result.model, result.model.suggestions[0].id, "rejected");
    expect(blockText(rejected.blocks[0])).toBe("Arc Lamp in brass");
  });

  it("leaves a pending deletion out of the export", () => {
    const base: DocModel = { ...doc([textBlock("paragraph", "Keep this drop that")]), suggestMode: true };
    const result = deleteRange(base, range(base.blocks[0].id, 10, 19), ACTOR);
    expect(toMarkdown(result.model, "")).toContain("Keep this");
    expect(toMarkdown(result.model, "")).not.toContain("drop that");
  });
});

describe("undo and redo", () => {
  type State = { model: DocModel; selection: DocRange; history: History };

  function apply(state: State, label: string, result: { model: DocModel; selection: DocRange }, at: number): State {
    const entry: HistoryEntry = { model: state.model, selection: state.selection, label, at };
    return { model: result.model, selection: result.selection, history: pushHistory(state.history, entry, label) };
  }

  function undo(state: State): State {
    const previous = state.history.past[state.history.past.length - 1];
    if (!previous) return state;
    return {
      model: previous.model,
      selection: previous.selection,
      history: {
        past: state.history.past.slice(0, -1),
        future: [...state.history.future, { model: state.model, selection: state.selection, label: previous.label, at: previous.at }],
      },
    };
  }

  function redo(state: State): State {
    const next = state.history.future[state.history.future.length - 1];
    if (!next) return state;
    return {
      model: next.model,
      selection: next.selection,
      history: {
        past: [...state.history.past, { model: state.model, selection: state.selection, label: next.label, at: next.at }],
        future: state.history.future.slice(0, -1),
      },
    };
  }

  it("undoes a mark and redoes it", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp")]);
    const id = base.blocks[0].id;
    let state: State = { model: base, selection: range(id, 0, 8), history: { past: [], future: [] } };
    state = apply(state, "bold", toggleMark(state.model, state.selection, "bold"), 1000);
    expect(state.model.blocks[0].runs[0].marks).toEqual(["bold"]);
    state = undo(state);
    expect(state.model.blocks[0].runs[0].marks).toEqual([]);
    state = redo(state);
    expect(state.model.blocks[0].runs[0].marks).toEqual(["bold"]);
  });

  it("undoes a split back to one block", () => {
    const base = doc([textBlock("paragraph", "Arc Lamp in brass")]);
    const id = base.blocks[0].id;
    let state: State = { model: base, selection: range(id, 8), history: { past: [], future: [] } };
    state = apply(state, "split", splitBlock(state.model, state.selection, ACTOR), 2000);
    expect(state.model.blocks).toHaveLength(2);
    state = undo(state);
    expect(state.model.blocks).toHaveLength(1);
    expect(blockText(state.model.blocks[0])).toBe("Arc Lamp in brass");
  });

  it("undoes several steps in order and restores the caret", () => {
    const base = doc([textBlock("paragraph", "Arc")]);
    const id = base.blocks[0].id;
    let state: State = { model: base, selection: range(id, 3), history: { past: [], future: [] } };
    state = apply(state, "type-1", insertText(state.model, state.selection, " Lamp", ACTOR), 1000);
    state = apply(state, "type-2", insertText(state.model, state.selection, " brass", ACTOR), 3000);
    expect(blockText(state.model.blocks[0])).toBe("Arc Lamp brass");
    expect(state.selection.head.offset).toBe(14);
    state = undo(state);
    expect(blockText(state.model.blocks[0])).toBe("Arc Lamp");
    expect(state.selection.head.offset).toBe(8);
    state = undo(state);
    expect(blockText(state.model.blocks[0])).toBe("Arc");
    expect(state.selection.head.offset).toBe(3);
  });

  it("coalesces fast consecutive typing into one undo step", () => {
    const history = pushHistory(
      pushHistory({ past: [], future: [] }, { model: doc([]), selection: range("a", 0), label: "type", at: 1000 }, "type"),
      { model: doc([]), selection: range("a", 1), label: "type", at: 1200 },
      "type",
    );
    expect(history.past).toHaveLength(1);
  });

  it("clears the redo stack when a new edit lands", () => {
    const base = doc([textBlock("paragraph", "Arc")]);
    const id = base.blocks[0].id;
    let state: State = { model: base, selection: range(id, 3), history: { past: [], future: [] } };
    state = apply(state, "a", insertText(state.model, state.selection, "!", ACTOR), 1000);
    state = undo(state);
    expect(state.history.future).toHaveLength(1);
    state = apply(state, "b", insertText(state.model, state.selection, "?", ACTOR), 5000);
    expect(state.history.future).toHaveLength(0);
  });
});

describe("find, replace, statistics and export", () => {
  const base = doc([
    textBlock("heading1", "Winter collection brief"),
    textBlock("paragraph", "The Arc Lamp stays in brushed brass. The Arc Lamp ships in six weeks."),
    textBlock("bulletItem", "Arc Lamp at £900 ex VAT"),
  ]);

  it("finds every occurrence with offsets", () => {
    const hits = findAll(base, "Arc Lamp");
    expect(hits).toHaveLength(3);
    expect(hits[0].start).toBe(4);
    expect(hits[1].start).toBeGreaterThan(hits[0].start);
    expect(findAll(base, "arc lamp", { caseSensitive: true })).toHaveLength(0);
    expect(findAll(base, "arc lamp")).toHaveLength(3);
    expect(findAll(base, "Arc", { wholeWord: true })).toHaveLength(3);
    expect(findAll(base, "Ar", { wholeWord: true })).toHaveLength(0);
  });

  it("replaces every occurrence and keeps the marks", () => {
    const bolded = toggleMark(base, range(base.blocks[1].id, 4, 12), "bold").model;
    const { model, count } = replaceAll(bolded, "Arc Lamp", "Arc Pendant");
    expect(count).toBe(3);
    expect(blockText(model.blocks[1])).toBe("The Arc Pendant stays in brushed brass. The Arc Pendant ships in six weeks.");
    expect(model.blocks[1].runs.find((run) => run.text === "Arc Pendant")?.marks).toEqual(["bold"]);
  });

  it("counts words, characters and headings", () => {
    const stats = documentStats(base);
    expect(stats.headings).toBe(1);
    expect(stats.words).toBe(3 + 14 + 6);
    expect(stats.charactersNoSpaces).toBeGreaterThan(0);
    expect(stats.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("paginates on an explicit page break", () => {
    const withBreak = insertBlockAfter(base, base.blocks[0].id, emptyBlock("pageBreak")).model;
    const pages = paginate(withBreak);
    expect(pages.pages).toHaveLength(2);
    expect(pages.pages[0].blockIds).toHaveLength(2);
  });

  it("exports HTML with real structure", () => {
    const html = toHtml(base, "Winter collection brief");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<h1>Winter collection brief</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Arc Lamp at £900 ex VAT</li>");
  });

  it("escapes HTML in exported text", () => {
    const risky = doc([textBlock("paragraph", '<script>alert("x")</script>')]);
    const html = toHtml(risky, "t");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("exports Markdown with headings, lists and marks", () => {
    const bolded = toggleMark(base, range(base.blocks[1].id, 4, 12), "bold").model;
    const markdown = toMarkdown(bolded, "Winter collection brief");
    expect(markdown).toContain("# Winter collection brief");
    expect(markdown).toContain("**Arc Lamp**");
    expect(markdown).toContain("- Arc Lamp at £900 ex VAT");
  });

  it("exports a table and an image reference", () => {
    const withTable = insertBlockAfter(base, base.blocks[2].id, {
      ...emptyBlock("table"), table: { header: true, rows: [["Item", "Price"], ["Arc Lamp", "£900"]] },
    }).model;
    const withImage = insertBlockAfter(withTable, withTable.blocks[3].id, {
      ...emptyBlock("image"), image: { assetId: "nl-assets-001", alt: "Arc Lamp on a walnut table", caption: "Arc Lamp", widthPercent: 100 },
    }).model;
    const markdown = toMarkdown(withImage, "t");
    expect(markdown).toContain("| Item | Price |");
    expect(markdown).toContain("![Arc Lamp on a walnut table](asset:nl-assets-001)");
    expect(toHtml(withImage, "t")).toContain('aria-label="Arc Lamp on a walnut table"');
  });
});
