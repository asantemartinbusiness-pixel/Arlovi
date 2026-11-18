import { describe, expect, it } from "vitest";
import {
  autoformat, blockText, editTable, emptyBlock, insertText, readDoc, textBlock, toMarkdown,
  type DocModel,
} from "@/applications/docs/model";

/* W2D — Markdown-style autoformat and table structure edits in Docs. */

const ACTOR = { author: "Maya Chen", at: "2026-11-18T09:30:00.000Z" };

function doc(blocks: DocModel["blocks"], suggestMode = false): DocModel {
  return { ...readDoc({ blocks }, ACTOR.author, ACTOR.at), suggestMode };
}

function typed(model: DocModel, blockId: string, text: string) {
  let current = model;
  let offset = blockText(current.blocks.find((block) => block.id === blockId)!).length;
  for (const char of text) {
    current = insertText(current, { anchor: { blockId, offset }, head: { blockId, offset } }, char, ACTOR).model;
    offset += 1;
  }
  return { model: current, position: { blockId, offset } };
}

describe("autoformat", () => {
  it.each([
    ["# ", "heading1"], ["## ", "heading2"], ["### ", "heading3"],
    ["- ", "bulletItem"], ["* ", "bulletItem"], ["1. ", "numberItem"], ["> ", "quote"],
  ])("turns %j at the start of a paragraph into %s", (prefix, type) => {
    const block = { ...textBlock("paragraph", ""), id: "p" };
    const { model, position } = typed(doc([block]), "p", prefix);
    const result = autoformat(model, position);
    expect(result?.model.blocks[0].type).toBe(type);
    expect(blockText(result!.model.blocks[0])).toBe("");
    expect(result?.selection.head).toEqual({ blockId: "p", offset: 0 });
  });

  it("keeps text that was already after the caret", () => {
    const block = { ...textBlock("paragraph", "Terms"), id: "p" };
    let model = doc([block]);
    model = insertText(model, { anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } }, "#", ACTOR).model;
    model = insertText(model, { anchor: { blockId: "p", offset: 1 }, head: { blockId: "p", offset: 1 } }, " ", ACTOR).model;
    const result = autoformat(model, { blockId: "p", offset: 2 });
    expect(result?.model.blocks[0].type).toBe("heading1");
    expect(blockText(result!.model.blocks[0])).toBe("Terms");
  });

  it("leaves ordinary text, other block types and suggesting mode alone", () => {
    const para = { ...textBlock("paragraph", ""), id: "p" };
    const { model, position } = typed(doc([para]), "p", "Price # ");
    expect(autoformat(model, position)).toBeNull();
    const heading = { ...textBlock("heading2", ""), id: "h" };
    const second = typed(doc([heading]), "h", "- ");
    expect(autoformat(second.model, second.position)).toBeNull();
    const suggesting = typed(doc([{ ...textBlock("paragraph", ""), id: "s" }], true), "s", "# ");
    expect(autoformat(suggesting.model, suggesting.position)).toBeNull();
  });
});

describe("table structure", () => {
  const table = () => doc([{ ...emptyBlock("table"), id: "t", table: { header: true, rows: [["Item", "Qty"], ["Lamp", "2"]] } }]);

  it("adds rows and columns where asked", () => {
    let model = editTable(table(), "t", { kind: "addRow", after: 1 });
    expect(model.blocks[0].table?.rows).toEqual([["Item", "Qty"], ["Lamp", "2"], ["", ""]]);
    model = editTable(model, "t", { kind: "addColumn", after: 0 });
    expect(model.blocks[0].table?.rows).toEqual([["Item", "", "Qty"], ["Lamp", "", "2"], ["", "", ""]]);
  });

  it("removes rows and columns but keeps the header and one column", () => {
    let model = editTable(table(), "t", { kind: "removeColumn", at: 1 });
    expect(model.blocks[0].table?.rows).toEqual([["Item"], ["Lamp"]]);
    expect(editTable(model, "t", { kind: "removeColumn", at: 0 })).toBe(model);
    model = editTable(table(), "t", { kind: "removeRow", at: 1 });
    expect(model.blocks[0].table?.rows).toEqual([["Item", "Qty"], ["Lamp", "2"]]);
  });

  it("removing the header row removes the first body row and keeps the header", () => {
    const three = doc([{ ...emptyBlock("table"), id: "t", table: { header: true, rows: [["Item", "Qty"], ["Lamp", "2"], ["Desk", "1"]] } }]);
    const model = editTable(three, "t", { kind: "removeRow", at: 0 });
    expect(model.blocks[0].table?.rows).toEqual([["Item", "Qty"], ["Desk", "1"]]);
    expect(editTable(model, "t", { kind: "removeRow", at: 0 })).toBe(model);
    const plain = doc([{ ...emptyBlock("table"), id: "t", table: { header: false, rows: [["a"], ["b"]] } }]);
    expect(editTable(plain, "t", { kind: "removeRow", at: 0 }).blocks[0].table?.rows).toEqual([["b"]]);
  });

  it("exports the edited table to Markdown", () => {
    const model = editTable(table(), "t", { kind: "addRow", after: 1 });
    expect(toMarkdown(model, "T")).toContain("| Lamp | 2 |");
  });
});
