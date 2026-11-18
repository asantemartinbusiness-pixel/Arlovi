import { describe, expect, it } from "vitest";
import { starterVideo } from "@/applications/video/model";
import {
  addCaptionAt, clipEnd, isEditable, lockReason, moveCaption, moveClip, retimeCaption, rippleDelete, splitAllAt,
  splitClip, toggleTrackLock, trimClip, trimToTime, type VideoDoc,
} from "@/applications/video/timeline";

const base = (): VideoDoc => starterVideo("W2E edit test");
const clip = (doc: VideoDoc, id: string) => doc.clips.find((item) => item.id === id)!;

describe("W2E video: split and trim at the playhead", () => {
  it("splits every clip the playhead crosses, on every unlocked track", () => {
    const doc = base();
    /* At 3s: the picture clip c1, the title t1 and the music a1 are under the playhead. */
    const result = splitAllAt(doc, 3);
    expect(result.count).toBe(3);
    expect(result.doc.clips).toHaveLength(doc.clips.length + 3);
    expect(clip(result.doc, "c1").duration).toBeCloseTo(3);
    const right = result.doc.clips.find((item) => item.id.startsWith("c1-b"))!;
    expect(right.start).toBeCloseTo(3);
    expect(right.sourceIn).toBeCloseTo(3);
  });

  it("splits only the given clip when asked", () => {
    const result = splitAllAt(base(), 3, ["t1"]);
    expect(result.count).toBe(1);
    expect(result.newClipIds[0]).toMatch(/^t1-b/);
  });

  it("trims the head and the tail to a time", () => {
    const doc = base();
    const head = trimToTime(doc, "c2", "start", 8);
    expect(clip(head, "c2")).toMatchObject({ start: 8, sourceIn: 2, duration: 8 });
    const tail = trimToTime(doc, "c1", "end", 5);
    expect(clipEnd(clip(tail, "c1"))).toBeCloseTo(5);
  });
});

describe("W2E video: locked tracks", () => {
  const locked = toggleTrackLock(base(), "tr-v1");

  it("refuses every edit on a locked track", () => {
    expect(isEditable(locked, clip(locked, "c1"))).toBe(false);
    expect(lockReason(locked, clip(locked, "c1"))).toMatch(/Picture track is locked/);
    expect(trimClip(locked, "c1", "end", -1)).toBe(locked);
    expect(moveClip(locked, "c1", 2)).toBe(locked);
    expect(splitClip(locked, "c1", 3).newClipId).toBeUndefined();
    expect(rippleDelete(locked, "c1")).toBe(locked);
    expect(splitAllAt(locked, 3).count).toBe(2);
  });

  it("will not move a clip onto a locked track", () => {
    const doc = toggleTrackLock(base(), "tr-t1");
    expect(moveClip(doc, "c1", 0, "tr-t1")).toBe(doc);
  });

  it("unlocks again", () => {
    const open = toggleTrackLock(locked, "tr-v1");
    expect(isEditable(open, clip(open, "c1"))).toBe(true);
  });
});

describe("W2E video: caption cues", () => {
  const withCues = (): VideoDoc => ({
    ...base(),
    captions: [
      { id: "a", start: 1, end: 3, text: "First", reviewed: true, language: "en" },
      { id: "b", start: 4, end: 6, text: "Second", reviewed: false, language: "en" },
    ],
  });

  it("moves a cue without overlapping its neighbours", () => {
    const moved = moveCaption(withCues(), "b", 2);
    expect(moved.captions.find((item) => item.id === "b")).toMatchObject({ start: 3, end: 5 });
    const late = moveCaption(withCues(), "b", 15);
    expect(late.captions.find((item) => item.id === "b")).toMatchObject({ start: 14, end: 16 });
  });

  it("retimes an edge, at least a frame long and clear of the next cue", () => {
    const longer = retimeCaption(withCues(), "a", "end", 5);
    expect(longer.captions.find((item) => item.id === "a")!.end).toBe(4);
    const shorter = retimeCaption(withCues(), "a", "start", 10);
    const cue = shorter.captions.find((item) => item.id === "a")!;
    expect(cue.end - cue.start).toBeCloseTo(1 / 25);
  });

  it("adds a cue at the playhead that stops at the next cue, and refuses inside a cue", () => {
    const added = addCaptionAt(withCues(), 3.2, "en", "c")!;
    expect(added.captions.find((item) => item.id === "c")).toMatchObject({ start: 3.2, end: 4, text: "" });
    expect(addCaptionAt(withCues(), 2, "en", "d")).toBeNull();
  });
});
