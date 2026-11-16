import { describe, expect, it } from "vitest";
import {
  addObject, addSlide, alignObjects, applyLayout, boundingBox, buildOrder, chartFreshness,
  customisedObjects, distributeObjects, duplicateSlide, LAYOUTS, moveSlide, motionWarnings,
  nextId, notesToText, readDeck, removeObjects, removeSlide, reorder, resizeBox, reviewDeck,
  slideFromLayout, snapBox, SLIDE_H, SLIDE_W, toHtml, updateObjects, type Deck, type SlideObject,
} from "@/applications/present/model";

function shape(id: string, x: number, y: number, w = 100, h = 60, z = 1): SlideObject {
  return { id, type: "shape", name: `Shape ${id}`, x, y, w, h, rotation: 0, z, shape: { kind: "rect", fillToken: "accent", strokeWidth: 0, radius: 0, opacity: 1 } };
}

const LEGACY = {
  theme: { background: "#F7F8FC", ink: "#17223A", accent: "#234FE8" },
  index: 0,
  slides: [
    { id: "s1", title: "Northline", elements: [{ id: "e1", type: "text", x: 48, y: 64, w: 400, h: 80, text: "Winter collection", fill: "#17223A" }] },
    { id: "s2", title: "Arc Lamp", elements: [
      { id: "e2", type: "text", x: 48, y: 48, w: 420, h: 60, text: "Brushed brass", fill: "#17223A" },
      { id: "e3", type: "shape", x: 48, y: 140, w: 180, h: 100, text: "", fill: "#234FE8" },
    ] },
    { id: "s3", title: "Ask", elements: [{ id: "e4", type: "text", x: 48, y: 80, w: 420, h: 80, text: "Book the table", fill: "#17223A" }] },
  ],
};

describe("reading a stored deck", () => {
  it("migrates the legacy element list into an object graph", () => {
    const deck = readDeck(LEGACY);
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1].objects).toHaveLength(2);
    expect(deck.slides[1].objects[0].type).toBe("text");
    expect(deck.slides[1].objects[0].text?.text).toBe("Brushed brass");
    expect(deck.slides[1].objects[1].type).toBe("shape");
    expect(deck.slides[1].objects.map((object) => object.z)).toEqual([1, 2]);
    expect(deck.theme.colours.accent).toBe("#234FE8");
    expect(deck.layouts.length).toBeGreaterThan(0);
  });

  it("gives an empty deck one slide rather than crashing", () => {
    const deck = readDeck({});
    expect(deck.slides).toHaveLength(1);
    expect(deck.index).toBe(0);
  });

  it("round-trips a modern deck unchanged", () => {
    const first = readDeck(LEGACY);
    const second = readDeck(first);
    expect(second.slides.map((slide) => slide.objects.length)).toEqual(first.slides.map((slide) => slide.objects.length));
  });
});

describe("slide commands", () => {
  it("adds, duplicates and removes slides", () => {
    let deck = readDeck(LEGACY);
    deck = addSlide(deck, "titleBody", 0);
    expect(deck.slides).toHaveLength(4);
    expect(deck.index).toBe(1);
    deck = duplicateSlide(deck, deck.slides[1].id);
    expect(deck.slides).toHaveLength(5);
    expect(deck.slides[2].title).toContain("copy");
    expect(deck.slides[2].objects.every((object) => !deck.slides[1].objects.some((other) => other.id === object.id))).toBe(true);
    const id = deck.slides[2].id;
    deck = removeSlide(deck, id);
    expect(deck.slides.some((slide) => slide.id === id)).toBe(false);
  });

  it("refuses to remove the last slide", () => {
    const deck = readDeck({});
    expect(removeSlide(deck, deck.slides[0].id).slides).toHaveLength(1);
  });

  it("reorders slides", () => {
    const deck = readDeck(LEGACY);
    const moved = moveSlide(deck, "s3", 0);
    expect(moved.slides.map((slide) => slide.id)).toEqual(["s3", "s1", "s2"]);
    expect(moved.index).toBe(0);
    const back = moveSlide(moved, "s3", 2);
    expect(back.slides.map((slide) => slide.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("clamps a reorder to the deck's bounds", () => {
    const deck = readDeck(LEGACY);
    expect(moveSlide(deck, "s1", 99).slides.map((slide) => slide.id)).toEqual(["s2", "s3", "s1"]);
  });
});

describe("objects", () => {
  const slide = slideFromLayout(LAYOUTS[1], "Offer");

  it("adds an object on top of the stack", () => {
    const next = addObject(slide, shape("new", 10, 10));
    expect(next.objects.at(-1)?.z).toBe(Math.max(...slide.objects.map((object) => object.z)) + 1);
  });

  it("updates only the named objects", () => {
    const ids = [slide.objects[0].id];
    const next = updateObjects(slide, ids, (object) => ({ ...object, x: 500 }));
    expect(next.objects[0].x).toBe(500);
    expect(next.objects[1].x).toBe(slide.objects[1].x);
  });

  it("keeps a locked object when a delete runs", () => {
    const locked = updateObjects(slide, [slide.objects[0].id], (object) => ({ ...object, locked: true }));
    const next = removeObjects(locked, locked.objects.map((object) => object.id));
    expect(next.objects).toHaveLength(1);
    expect(next.objects[0].locked).toBe(true);
  });

  it("reorders z with front, back, forward and backward", () => {
    const base = { ...slide, objects: [shape("a", 0, 0, 100, 60, 1), shape("b", 0, 0, 100, 60, 2), shape("c", 0, 0, 100, 60, 3)] };
    expect(reorder(base, ["a"], "front").objects.map((object) => object.id)).toEqual(["b", "c", "a"]);
    expect(reorder(base, ["c"], "back").objects.map((object) => object.id)).toEqual(["c", "a", "b"]);
    expect(reorder(base, ["a"], "forward").objects.map((object) => object.id)).toEqual(["b", "a", "c"]);
    expect(reorder(base, ["c"], "backward").objects.map((object) => object.id)).toEqual(["a", "c", "b"]);
    expect(reorder(base, ["a"], "backward").objects.map((object) => object.id)).toEqual(["a", "b", "c"]);
    expect(reorder(base, ["a"], "front").objects.map((object) => object.z)).toEqual([1, 2, 3]);
  });
});

describe("geometry, snapping and alignment", () => {
  it("computes a bounding box over a selection", () => {
    expect(boundingBox([shape("a", 10, 20, 100, 50), shape("b", 200, 10, 40, 40)])).toEqual({ x: 10, y: 10, w: 230, h: 60 });
    expect(boundingBox([])).toBeNull();
  });

  it("snaps a box to the canvas centre", () => {
    const result = snapBox({ x: SLIDE_W / 2 - 50 + 3, y: 100, w: 100, h: 50 }, []);
    expect(result.x).toBe(SLIDE_W / 2 - 50);
    expect(result.guides.some((guide) => guide.kind === "canvas" && guide.axis === "x")).toBe(true);
  });

  it("snaps to another object's left edge and reports the guide", () => {
    const other = shape("other", 300, 200);
    const result = snapBox({ x: 304, y: 50, w: 80, h: 40 }, [other]);
    expect(result.x).toBe(300);
    expect(result.guides.find((guide) => guide.axis === "x")?.kind).toBe("edge");
  });

  it("leaves a box alone when nothing is within tolerance", () => {
    const result = snapBox({ x: 123, y: 77, w: 40, h: 40 }, [shape("other", 400, 400)]);
    expect(result.x).toBe(123);
    expect(result.y).toBe(77);
    expect(result.guides).toEqual([]);
  });

  it("aligns a single object against the canvas", () => {
    const slide = { ...slideFromLayout(LAYOUTS[5], "Blank"), objects: [shape("a", 10, 10, 100, 60)] };
    const centred = alignObjects(slide, ["a"], "centreX");
    expect(centred.objects[0].x).toBe((SLIDE_W - 100) / 2);
    const bottom = alignObjects(slide, ["a"], "bottom");
    expect(bottom.objects[0].y).toBe(SLIDE_H - 60);
  });

  it("aligns a group against its own bounding box", () => {
    const slide = { ...slideFromLayout(LAYOUTS[5], "Blank"), objects: [shape("a", 10, 10), shape("b", 200, 80)] };
    const aligned = alignObjects(slide, ["a", "b"], "left");
    expect(aligned.objects.map((object) => object.x)).toEqual([10, 10]);
  });

  it("distributes three objects evenly", () => {
    const slide = {
      ...slideFromLayout(LAYOUTS[5], "Blank"),
      objects: [shape("a", 0, 0, 100, 60), shape("b", 120, 0, 100, 60), shape("c", 400, 0, 100, 60)],
    };
    const spread = distributeObjects(slide, ["a", "b", "c"], "x");
    const xs = spread.objects.map((object) => object.x);
    expect(xs[0]).toBe(0);
    expect(xs[2]).toBe(400);
    expect(xs[1] - xs[0]).toBe(xs[2] - xs[1]);
  });

  it("needs three objects to distribute", () => {
    const slide = { ...slideFromLayout(LAYOUTS[5], "Blank"), objects: [shape("a", 0, 0), shape("b", 200, 0)] };
    expect(distributeObjects(slide, ["a", "b"], "x")).toBe(slide);
  });

  it("resizes from each handle and respects a minimum size", () => {
    const box = { x: 100, y: 100, w: 200, h: 100 };
    expect(resizeBox(box, "se", 40, 20, false)).toEqual({ x: 100, y: 100, w: 240, h: 120 });
    expect(resizeBox(box, "nw", 40, 20, false)).toEqual({ x: 140, y: 120, w: 160, h: 80 });
    expect(resizeBox(box, "e", -400, 0, false).w).toBe(24);
    const ratio = resizeBox(box, "se", 100, 0, true);
    expect(ratio.w / ratio.h).toBeCloseTo(2, 5);
  });
});

describe("masters, layouts and themes", () => {
  it("re-applies a layout to the placeholders it owns", () => {
    const deck = readDeck(LEGACY);
    const target = deck.slides[0];
    const { deck: next, kept } = applyLayout(deck, target.id, "title", false);
    expect(kept).toEqual([]);
    const slide = next.slides[0];
    const title = slide.objects.find((object) => object.text?.role === "title")!;
    const placeholder = LAYOUTS[0].placeholders.find((item) => item.role === "title")!;
    expect([title.x, title.y, title.w]).toEqual([placeholder.x, placeholder.y, placeholder.w]);
  });

  it("does not overwrite a customised object unless forced", () => {
    let deck = readDeck(LEGACY);
    const slide = deck.slides[0];
    const objectId = slide.objects[0].id;
    deck = { ...deck, slides: deck.slides.map((item) => (item.id === slide.id ? updateObjects(item, [objectId], (object) => ({ ...object, x: 400, customised: true })) : item)) };
    const { deck: kept, kept: keptNames } = applyLayout(deck, slide.id, "title", false);
    expect(keptNames).toHaveLength(1);
    expect(kept.slides[0].objects.find((object) => object.id === objectId)?.x).toBe(400);
    const { deck: forced } = applyLayout(deck, slide.id, "title", true);
    expect(forced.slides[0].objects.find((object) => object.id === objectId)?.x).toBe(LAYOUTS[0].placeholders[1].x);
  });

  it("adds a missing text placeholder when a layout is applied", () => {
    const deck = readDeck(LEGACY);
    const { deck: next } = applyLayout(deck, deck.slides[2].id, "title", false);
    const roles = next.slides[2].objects.map((object) => object.text?.role);
    expect(roles).toContain("eyebrow");
    expect(roles).toContain("subtitle");
  });

  it("reports objects that have drifted from their layout", () => {
    const deck = readDeck(LEGACY);
    const { deck: aligned } = applyLayout(deck, deck.slides[0].id, "title", true);
    expect(customisedObjects(aligned, aligned.slides[0])).toHaveLength(0);
    const moved = { ...aligned, slides: aligned.slides.map((slide, index) => (index === 0 ? updateObjects(slide, [slide.objects[0].id], (object) => ({ ...object, x: object.x + 40 })) : slide)) };
    expect(customisedObjects(moved, moved.slides[0])).toHaveLength(1);
  });
});

describe("animation and motion review", () => {
  it("sorts the build order and flags a slow effect", () => {
    const base = slideFromLayout(LAYOUTS[1], "Build");
    const slide = updateObjects(base, base.objects.map((object) => object.id), (object, ) => ({
      ...object,
      animation: { effect: "fade", order: object.text?.role === "body" ? 1 : 2, durationMs: 1400, delayMs: 0, easing: "ease-out", trigger: "onAppear" },
    }));
    expect(buildOrder(slide).map((object) => object.text?.role)).toEqual(["body", "title"]);
    const deck: Deck = { ...readDeck({}), slides: [slide] };
    const warnings = motionWarnings(deck);
    expect(warnings.some((warning) => warning.id.startsWith("slow-"))).toBe(true);
    expect(warnings.some((warning) => warning.id.startsWith("all-"))).toBe(true);
  });

  it("has nothing to warn about with no animation", () => {
    const deck: Deck = { ...readDeck({}), slides: [slideFromLayout(LAYOUTS[1], "Static")] };
    expect(motionWarnings(deck)).toEqual([]);
  });
});

describe("review, freshness and export", () => {
  it("flags a missing title, missing alt text and text that is too small", () => {
    const slide = slideFromLayout(LAYOUTS[1], "");
    const withImage = addObject(slide, { id: nextId("im"), type: "image", name: "Image", x: 10, y: 10, w: 200, h: 120, rotation: 0, z: 9, image: { alt: "", fit: "cover" } });
    const tiny = updateObjects(withImage, [slide.objects[1].id], (object) => ({ ...object, text: { ...object.text!, size: 11 } }));
    const deck: Deck = { ...readDeck({}), slides: [tiny] };
    const findings = reviewDeck(deck);
    expect(findings.some((finding) => finding.id.startsWith("title-"))).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("alt-"))).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("small-"))).toBe(true);
  });

  it("reports chart freshness honestly", () => {
    expect(chartFreshness({ kind: "bar", title: "t", series: [], linked: false }, undefined).state).toBe("unlinked");
    expect(chartFreshness({ kind: "bar", title: "t", series: [], linked: true }, "2026-11-14T00:00:00.000Z").state).toBe("unknown");
    expect(chartFreshness({ kind: "bar", title: "t", series: [], linked: true, capturedAt: "2026-11-10T00:00:00.000Z" }, "2026-11-14T00:00:00.000Z").state).toBe("stale");
    expect(chartFreshness({ kind: "bar", title: "t", series: [], linked: true, capturedAt: "2026-11-14T00:00:00.000Z" }, "2026-11-10T00:00:00.000Z").state).toBe("fresh");
  });

  it("exports HTML with every slide and escapes text", () => {
    const deck = readDeck(LEGACY);
    const html = toHtml(deck, "Winter trade story", false);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect((html.match(/class="slide"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("Brushed brass");
    const risky: Deck = { ...deck, slides: [updateObjects(deck.slides[0], [deck.slides[0].objects[0].id], (object) => ({ ...object, text: { ...object.text!, text: "<img onerror=1>" } }))] };
    expect(toHtml(risky, "t", false)).not.toContain("<img onerror");
  });

  it("omits a hidden slide from the export but keeps it in the notes", () => {
    const deck = readDeck(LEGACY);
    const hidden: Deck = { ...deck, slides: deck.slides.map((slide, index) => (index === 1 ? { ...slide, hidden: true } : slide)) };
    expect((toHtml(hidden, "t", false).match(/class="slide"/g) ?? [])).toHaveLength(2);
    expect(notesToText(hidden, "Deck")).toContain("(hidden)");
  });

  it("includes speaker notes only when asked", () => {
    const deck = readDeck(LEGACY);
    const withNotes: Deck = { ...deck, slides: deck.slides.map((slide, index) => (index === 0 ? { ...slide, notes: "Open with the lead time." } : slide)) };
    expect(toHtml(withNotes, "t", false)).not.toContain("Open with the lead time.");
    expect(toHtml(withNotes, "t", true)).toContain("Open with the lead time.");
  });
});
