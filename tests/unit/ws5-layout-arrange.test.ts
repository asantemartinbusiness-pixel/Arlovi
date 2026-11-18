import { describe, expect, it } from "vitest";
import {
  alignBox, duplicateFrame, fitToColumns, gridColumns, nudgeFrame, pageArea, removeFrame,
  resizeBox, restack, setGrid, snapLines, snapMove, updateFrame,
} from "@/applications/layout/arrange";
import { starterPublication } from "@/applications/layout/model";
import { mm } from "@/applications/layout/flow";

const doc = starterPublication("Arrange test");

describe("WS5 layout arranging", () => {
  it("mirrors the live area on left-hand pages", () => {
    const right = pageArea(doc, 0);
    const left = pageArea(doc, 1);
    expect(right.x).toBeCloseTo(doc.margins.inside);
    expect(left.x).toBeCloseTo(doc.margins.outside);
    expect(right.w).toBeCloseTo(left.w);
  });

  it("divides the live area into columns with gutters", () => {
    const columns = gridColumns(doc, 0);
    const area = pageArea(doc, 0);
    expect(columns).toHaveLength(doc.columns.count);
    expect(columns[0].x).toBeCloseTo(area.x);
    const last = columns[columns.length - 1];
    expect(last.x + last.w).toBeCloseTo(area.x + area.w);
    expect(columns[1].x - (columns[0].x + columns[0].w)).toBeCloseTo(doc.columns.gutter);
  });

  it("snaps a moving box to the nearest guide without changing its size", () => {
    const lines = snapLines(doc, 0);
    const area = pageArea(doc, 0);
    const snapped = snapMove({ x: area.x + 3, y: 300, w: 100, h: 50 }, lines, 6);
    expect(snapped.box.x).toBeCloseTo(area.x);
    expect(snapped.box.w).toBe(100);
    expect(snapped.guideX).toBeCloseTo(area.x);
  });

  it("resizes from a handle, keeps the opposite edge and respects a minimum", () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(resizeBox(start, "e", 50, 0)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(resizeBox(start, "nw", 20, 10)).toEqual({ x: 120, y: 110, w: 180, h: 90 });
    expect(resizeBox(start, "w", 500, 0).w).toBeGreaterThanOrEqual(8);
    const ratio = resizeBox(start, "se", 100, 0, { keepRatio: true });
    expect(ratio.w / ratio.h).toBeCloseTo(2);
  });

  it("aligns to margins and spans columns", () => {
    const area = pageArea(doc, 0);
    const box = { x: 200, y: 200, w: 100, h: 60 };
    expect(alignBox(box, "right", area).x + 100).toBeCloseTo(area.x + area.w);
    expect(alignBox(box, "vcenter", area).y).toBeCloseTo(area.y + (area.h - 60) / 2);
    const columns = gridColumns(doc, 0);
    const spanned = fitToColumns(box, columns, 0, 2);
    expect(spanned.x).toBeCloseTo(columns[0].x);
    expect(spanned.w).toBeCloseTo(area.w);
  });

  it("nudges unlocked frames only", () => {
    const moved = nudgeFrame(doc, "fr-1", 10, -5);
    expect(moved.pages[0].frames[0].box.x).toBeCloseTo(doc.pages[0].frames[0].box.x + 10);
    const locked = updateFrame(doc, "fr-1", { locked: true });
    expect(nudgeFrame(locked, "fr-1", 10, 0)).toBe(locked);
  });

  it("removing a threaded frame keeps the rest of the thread linked", () => {
    const threeFrames = {
      ...doc,
      pages: [
        { ...doc.pages[0], frames: [{ ...doc.pages[0].frames[0], next: "fr-2" }] },
        { ...doc.pages[1], frames: [{ ...doc.pages[1].frames[0], next: "fr-3" }, { ...doc.pages[1].frames[0], id: "fr-3", next: undefined }] },
      ],
    };
    const result = removeFrame(threeFrames, "fr-2");
    expect(result.pages[0].frames[0].next).toBe("fr-3");
    expect(result.pages[1].frames.map((frame) => frame.id)).toEqual(["fr-3"]);
  });

  it("does not remove a locked frame", () => {
    const locked = { ...doc, pages: doc.pages.map((page, index) => (index === 0 ? { ...page, frames: page.frames.map((frame) => ({ ...frame, locked: true })) } : page)) };
    expect(removeFrame(locked, "fr-1")).toBe(locked);
  });

  it("duplicates a text frame with its own copy of the story", () => {
    const { doc: next, id } = duplicateFrame(doc, "fr-1", "fr-copy");
    expect(id).toBe("fr-copy");
    const copy = next.pages[0].frames.find((frame) => frame.id === "fr-copy")!;
    expect(copy.next).toBeUndefined();
    expect(copy.storyId).not.toBe("story-1");
    expect(next.stories.find((story) => story.id === copy.storyId)?.text).toBe(doc.stories[0].text);
  });

  it("restacks a frame within its page", () => {
    const page = { id: "p", frames: ["a", "b", "c"].map((id) => ({ id, kind: "shape" as const, box: { x: 0, y: 0, w: 1, h: 1 } })), overrides: [] };
    expect(restack(page, "a", "front").frames.map((frame) => frame.id)).toEqual(["b", "c", "a"]);
    expect(restack(page, "c", "back").frames.map((frame) => frame.id)).toEqual(["c", "a", "b"]);
    expect(restack(page, "b", "forward").frames.map((frame) => frame.id)).toEqual(["a", "c", "b"]);
    expect(restack(page, "b", "backward").frames.map((frame) => frame.id)).toEqual(["b", "a", "c"]);
  });

  it("clamps the page grid to sensible values", () => {
    const next = setGrid(doc, { margins: { top: mm(30), inside: -5 }, columns: { count: 40, gutter: -1 } });
    expect(next.margins.inside).toBe(0);
    expect(next.columns.count).toBe(12);
    expect(next.columns.gutter).toBe(0);
    expect(next.baseline.start).toBeCloseTo(mm(30));
  });
});
