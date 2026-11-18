import { describe, expect, it } from "vitest";
import {
  absoluteRect, addNode, alignTarget, copyNodes, descendants, duplicateNodes, emptyPage, groupNodes, makeNode, pasteNodes, patchNode,
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

function linked() {
  let page = emptyPage("p1", "Page");
  const screenA = makeNode("frame", { x: 0, y: 0, w: 300, h: 300 }, { name: "Screen A" });
  const screenB = makeNode("frame", { x: 400, y: 0, w: 300, h: 300 }, { name: "Screen B" });
  const button = makeNode("rect", { x: 10, y: 10, w: 80, h: 30 }, { name: "Next" });
  const back = makeNode("rect", { x: 10, y: 10, w: 80, h: 30 }, { name: "Back" });
  page = addNode(page, screenA);
  page = addNode(page, screenB);
  page = addNode(page, button, screenA.id);
  page = addNode(page, back, screenB.id);
  const link = (to: string) => ({ link: { to, trigger: "click" as const, transition: "dissolve" as const, duration: 300 } });
  page = patchNode(page, button.id, link(screenB.id));
  page = patchNode(page, back.id, link(screenA.id));
  return { page, screenA, screenB, button, back };
}

describe("prototype links on duplicate and paste", () => {
  it("duplicating linked screens together links the copies to each other", () => {
    const { page, screenA, screenB, button, back } = linked();
    const { page: next, ids } = duplicateNodes(page, [screenA.id, screenB.id]);
    const [copyA, copyB] = ids;
    const copyButton = descendants(next, copyA)[0];
    const copyBack = descendants(next, copyB)[0];
    expect(next.nodes[copyButton].link?.to).toBe(copyB);
    expect(next.nodes[copyBack].link?.to).toBe(copyA);
    // The originals still link to each other.
    expect(next.nodes[button.id].link?.to).toBe(screenB.id);
    expect(next.nodes[back.id].link?.to).toBe(screenA.id);
  });

  it("duplicating a parent with its selected child copies the child once", () => {
    const { page, screenA, button } = linked();
    const { page: next, ids } = duplicateNodes(page, [screenA.id, button.id]);
    expect(ids).toHaveLength(1);
    expect(descendants(next, ids[0])).toHaveLength(1);
    expect(Object.keys(next.nodes)).toHaveLength(Object.keys(page.nodes).length + 2);
  });

  it("a duplicated layer keeps a link to a target outside the selection on the same page", () => {
    const { page, screenA, screenB } = linked();
    const { page: next, ids } = duplicateNodes(page, [screenA.id]);
    expect(next.nodes[descendants(next, ids[0])[0]].link?.to).toBe(screenB.id);
  });

  it("pasting remaps links inside the clip and drops links whose target is not on the destination page", () => {
    const { page, screenA, screenB } = linked();
    const both = copyNodes(page, [screenA.id, screenB.id])!;
    const other = emptyPage("p2", "Other");
    const { page: pasted, ids } = pasteNodes(other, both, 0);
    expect(pasted.nodes[descendants(pasted, ids[0])[0]].link?.to).toBe(ids[1]);
    expect(pasted.nodes[descendants(pasted, ids[1])[0]].link?.to).toBe(ids[0]);
    const one = copyNodes(page, [screenA.id])!;
    const { page: alone, ids: aloneIds } = pasteNodes(other, one, 0);
    expect(alone.nodes[descendants(alone, aloneIds[0])[0]].link).toBeUndefined();
    // Pasted back on the same page, the link still reaches the original target.
    const { page: same, ids: sameIds } = pasteNodes(page, one, 16);
    expect(same.nodes[descendants(same, sameIds[0])[0]].link?.to).toBe(screenB.id);
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
