import { describe, expect, it } from "vitest";
import {
  duplicateLayer, easeAt, moveKeyframe, neighbourKeyframes, removeKeyframe, sampleTrack, setKeyframe, setKeyframeValue,
} from "@/applications/motion/anim";
import { starterMotion } from "@/applications/motion/model";

const doc = starterMotion("W2E keyframes");
const title = () => doc.layers.find((layer) => layer.id === "lay-title")!;

describe("W2E motion: keyframe editing", () => {
  it("changes a keyframe's value without moving it", () => {
    const next = setKeyframeValue(doc, "lay-title", "opacity", "t2", 0.5);
    const keyframe = next.layers.find((layer) => layer.id === "lay-title")!.tracks.opacity!.find((item) => item.id === "t2")!;
    expect(keyframe).toMatchObject({ t: 0.8, value: 0.5 });
    expect(sampleTrack(next.layers.find((layer) => layer.id === "lay-title")!.tracks.opacity, 2, 1)).toBe(0.5);
  });

  it("finds the keyframes either side, in time order", () => {
    expect(neighbourKeyframes(title(), "opacity", "t1")).toEqual({ previous: undefined, next: expect.objectContaining({ id: "t2" }) });
    expect(neighbourKeyframes(title(), "opacity", "t2").previous?.id).toBe("t1");
    expect(neighbourKeyframes(title(), "opacity", "missing")).toEqual({});
  });

  it("adds, moves (on frame, inside the duration) and deletes keyframes per property", () => {
    let next = setKeyframe(doc, "lay-title", "rotation", 1.5, 12);
    expect(next.layers.find((layer) => layer.id === "lay-title")!.tracks.rotation).toHaveLength(1);
    const id = next.layers.find((layer) => layer.id === "lay-title")!.tracks.rotation![0].id;
    next = moveKeyframe(next, "lay-title", "rotation", id, 9);
    expect(next.layers.find((layer) => layer.id === "lay-title")!.tracks.rotation![0].t).toBe(doc.duration);
    next = moveKeyframe(next, "lay-title", "rotation", id, 1.01);
    expect(next.layers.find((layer) => layer.id === "lay-title")!.tracks.rotation![0].t).toBeCloseTo(30 / 30);
    next = removeKeyframe(next, "lay-title", "rotation", id);
    expect(next.layers.find((layer) => layer.id === "lay-title")!.tracks.rotation).toHaveLength(0);
  });

  it("duplicates a layer above the original with its own keyframe ids", () => {
    const next = duplicateLayer(doc, "lay-title", "lay-copy");
    const index = next.layers.findIndex((layer) => layer.id === "lay-copy");
    expect(next.layers[index - 1].id).toBe("lay-title");
    const copy = next.layers[index];
    expect(copy.name).toBe("Title copy");
    expect(copy.tracks.opacity!.map((keyframe) => keyframe.id)).toEqual(["t1-lay-copy", "t2-lay-copy"]);
    expect(copy.box.x).toBe(title().box.x + 16);
    expect(next.activeLayerId).toBe("lay-copy");
  });

  it("eases between the ends of every curve the preview can show", () => {
    for (const easing of [{ kind: "linear" as const }, { kind: "bezier" as const, points: [0.42, 0, 0.58, 1] as [number, number, number, number] }]) {
      expect(easeAt(easing, 0)).toBeCloseTo(0);
      expect(easeAt(easing, 1)).toBeCloseTo(1);
    }
    expect(easeAt({ kind: "bezier", points: [0.42, 0, 1, 1] }, 0.5)).toBeLessThan(0.5);
  });
});
