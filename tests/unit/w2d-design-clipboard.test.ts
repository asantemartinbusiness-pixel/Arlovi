import { describe, expect, it } from "vitest";
import {
  absoluteRect, addNode, alignTarget, copyNodes, descendants, emptyPage, groupNodes, makeNode, pasteNodes,
} from "@/applications/design/scene";

/* W2D — the design clipboard and single-layer alignment target. */

function scene() {
  let page = emptyPage("p1", "Page");
  const frame = makeNode("frame", { x: 100, y: 100, w: 400, h: 300 }, { name: "Card" });
  const inner = makeNode("rect", { x: 20, y: 30, w: 50, h: 40 }, { name: "Swatch" });
  const loose = makeNode("ellipse", { x: 600, y: 50, w: 80, h: 80 }, { name: "Dot" });
  page = addNode(page, frame);
  page = addNode(page, inner, frame.id);
  page = addNode(page, loose);
  return { page, frame, inner, loose };
}

describe("copy and paste", () => {
  it("copies a frame with its children and pastes fresh ids at the top level", () => {
    const { page, frame, inner } = scene();
    const clip = copyNodes(page, [frame.id, inner.id]);
    expect(clip?.roots).toEqual([frame.id]);
    const { page: next, ids } = pasteNodes(page, clip!, 16);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(frame.id);
    const pasted = next.nodes[ids[0]];
    expect(pasted.x).toBe(116);
    expect(pasted.y).toBe(116);
    const kids = descendants(next, ids[0]);
    expect(kids).toHaveLength(1);
    expect(kids[0]).not.toBe(inner.id);
    expect(next.nodes[kids[0]].name).toBe("Swatch");
    // Children keep their position relative to the pasted parent.
    expect(absoluteRect(next, next.nodes[kids[0]])).toMatchObject({ x: 136, y: 146 });
    // The original is untouched.
    expect(Object.keys(next.nodes)).toHaveLength(Object.keys(page.nodes).length + 2);
  });

  it("pastes a nested layer at its absolute position on another page", () => {
    const { page, inner } = scene();
    const clip = copyNodes(page, [inner.id])!;
    const other = emptyPage("p2", "Other");
    const { page: next, ids } = pasteNodes(other, clip, 0);
    expect(absoluteRect(next, next.nodes[ids[0]])).toMatchObject({ x: 120, y: 130, w: 50, h: 40 });
  });

  it("copies nothing for an empty selection", () => {
    expect(copyNodes(scene().page, [])).toBeNull();
  });
});

describe("alignment target", () => {
  it("uses the selection bounds for two layers and the parent for one", () => {
    const { page, frame, inner, loose } = scene();
    expect(alignTarget(page, [inner.id])).toEqual(absoluteRect(page, frame));
    expect(alignTarget(page, [loose.id])).toBeNull();
    expect(alignTarget(page, [])).toBeNull();
    expect(alignTarget(page, [frame.id, loose.id])).toMatchObject({ x: 100, y: 50 });
  });

  it("aligns a grouped child to its group", () => {
    const { page, loose, frame } = scene();
    const { page: grouped, groupId } = groupNodes(page, [frame.id, loose.id]);
    expect(alignTarget(grouped, [loose.id])).toEqual(absoluteRect(grouped, grouped.nodes[groupId]));
  });
});
