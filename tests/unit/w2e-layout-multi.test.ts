import { describe, expect, it } from "vitest";
import { starterPublication } from "@/applications/layout/model";
import type { Frame, PublicationDoc } from "@/applications/layout/flow";
import { handlePoint } from "@/applications/layout/arrange";
import {
  alignFrames, boundsOf, distributeFrames, lockFrames, moveFrames, normaliseAngle, removeFrames,
  resizeRotated, rotateAround, rotationFromPointer, visualBox,
} from "@/applications/layout/multi";

const shape = (id: string, x: number, y: number, w = 40, h = 20, extra: Partial<Frame> = {}): Frame => ({ id, kind: "shape", box: { x, y, w, h }, ...extra });

function withFrames(frames: Frame[]): PublicationDoc {
  const doc = starterPublication("Multi test");
  return { ...doc, pages: doc.pages.map((page, index) => (index === 0 ? { ...page, frames } : page)) };
}

const box = (doc: PublicationDoc, id: string) => doc.pages.flatMap((page) => page.frames).find((frame) => frame.id === id)!.box;

describe("W2E layout: several frames at once", () => {
  const doc = withFrames([shape("a", 10, 10), shape("b", 100, 50, 60, 30), shape("c", 300, 200)]);
  const ids = ["a", "b", "c"];

  it("aligns to the selection's own edges and centres", () => {
    const left = alignFrames(doc, ids, "left");
    expect(ids.map((id) => box(left, id).x)).toEqual([10, 10, 10]);
    const right = alignFrames(doc, ids, "right");
    expect(ids.map((id) => box(right, id).x + box(right, id).w)).toEqual([340, 340, 340]);
    const middle = alignFrames(doc, ids, "vcenter");
    const centres = ids.map((id) => box(middle, id).y + box(middle, id).h / 2);
    expect(new Set(centres.map((value) => value.toFixed(3))).size).toBe(1);
    expect(centres[0]).toBeCloseTo((10 + 220) / 2);
  });

  it("aligns to a target area when one is given", () => {
    const top = alignFrames(doc, ids, "top", { x: 0, y: 36, w: 500, h: 700 });
    expect(ids.map((id) => box(top, id).y)).toEqual([36, 36, 36]);
  });

  it("leaves locked frames where they are", () => {
    const locked = lockFrames(doc, ["b"], true);
    const left = alignFrames(locked, ids, "left");
    expect(box(left, "b").x).toBe(100);
    expect(box(left, "c").x).toBe(10);
    expect(box(moveFrames(locked, ids, 5, 5), "b")).toEqual(box(doc, "b"));
  });

  it("distributes three or more frames with equal gaps, keeping the outermost", () => {
    const spaced = distributeFrames(doc, ids, "x");
    const sorted = ids.map((id) => box(spaced, id)).sort((p, q) => p.x - q.x);
    expect(sorted[0].x).toBe(10);
    expect(sorted[2].x).toBe(300);
    const gap1 = sorted[1].x - (sorted[0].x + sorted[0].w);
    const gap2 = sorted[2].x - (sorted[1].x + sorted[1].w);
    expect(gap1).toBeCloseTo(gap2);
    expect(distributeFrames(doc, ["a", "b"], "x")).toBe(doc);
  });

  it("moves and removes together", () => {
    const moved = moveFrames(doc, ["a", "c"], 3, -2);
    expect(box(moved, "a")).toMatchObject({ x: 13, y: 8 });
    expect(box(moved, "b")).toMatchObject({ x: 100, y: 50 });
    const removed = removeFrames(doc, ["a", "b"]);
    expect(removed.pages[0].frames.map((frame) => frame.id)).toEqual(["c"]);
  });

  it("never removes a locked frame", () => {
    const locked = lockFrames(doc, ["b"], true);
    const removed = removeFrames(locked, ["a", "b"]);
    expect(removed.pages[0].frames.map((frame) => frame.id)).toEqual(["b", "c"]);
    expect(removeFrames(locked, ["b"])).toBe(locked);
  });

  it("bounds a selection", () => {
    expect(boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 5, h: 20 }])).toEqual({ x: 0, y: 0, w: 25, h: 25 });
  });
});

describe("W2E layout: rotation", () => {
  it("normalises angles into (-180, 180]", () => {
    expect(normaliseAngle(190)).toBe(-170);
    expect(normaliseAngle(-190)).toBe(170);
    expect(normaliseAngle(360)).toBe(0);
    expect(normaliseAngle(180)).toBe(180);
  });

  it("reads the angle of the rotate handle around the centre, from straight up", () => {
    const frame = { x: 0, y: 0, w: 100, h: 100 };
    expect(rotationFromPointer(frame, { x: 50, y: -40 })).toBe(0);
    expect(rotationFromPointer(frame, { x: 140, y: 50 })).toBe(90);
    expect(rotationFromPointer(frame, { x: 50, y: 140 })).toBe(180);
    expect(rotationFromPointer(frame, { x: -40, y: 50 })).toBe(-90);
    expect(rotationFromPointer(frame, { x: 120, y: -10 }, 15)).toBe(45);
  });

  it("bounds a turned frame by its turned corners", () => {
    const shown = visualBox({ box: { x: 0, y: 0, w: 100, h: 20 }, rotation: 90 });
    expect(shown.x).toBeCloseTo(40);
    expect(shown.y).toBeCloseTo(-40);
    expect(shown.w).toBeCloseTo(20);
    expect(shown.h).toBeCloseTo(100);
  });

  it("resizes a turned frame in its own axes with the opposite corner pinned", () => {
    const start = { x: 0, y: 0, w: 100, h: 50 };
    const deg = 30;
    const centre = (b: typeof start) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const pinned = rotateAround(handlePoint(start, "nw"), centre(start), deg);
    /* Drag the south-east handle 20pt along the frame's own x axis. */
    const along = rotateAround({ x: 20, y: 0 }, { x: 0, y: 0 }, deg);
    const next = resizeRotated(start, deg, "se", along.x, along.y);
    expect(next.w).toBeCloseTo(120);
    expect(next.h).toBeCloseTo(50);
    const after = rotateAround(handlePoint(next, "nw"), centre(next), deg);
    expect(after.x).toBeCloseTo(pinned.x);
    expect(after.y).toBeCloseTo(pinned.y);
  });
});
