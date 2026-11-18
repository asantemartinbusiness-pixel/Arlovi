/* ====================================================================== *
 * Video project loading and the editor's shared transport state.
 * ====================================================================== */

import { createStore, type Store } from "@/applications/visual/kit";
import { snapFrame, type Clip, type MediaSource, type Track, type VideoDoc } from "./timeline";

export type VideoTool = "select" | "trim" | "ripple" | "roll" | "slip" | "razor";

export interface VideoUi {
  tool: VideoTool;
  playhead: number;
  playing: boolean;
  /** Playback rate; J and L step through −2, −1, 0, 1, 2. */
  rate: number;
  selectedClipId?: string;
  /** The caption cue picked on the timeline's caption lane. */
  selectedCaptionId?: string;
  /** The source picked in the media bin. */
  selectedSourceId?: string;
  /** The audio track picked in the mixer. */
  selectedTrackId?: string;
  zoom: number;
  snapToClips: boolean;
  showCaptions: boolean;
  showGuides: boolean;
  bypassEffects: boolean;
  inPoint?: number;
  outPoint?: number;
  language: string;
}

export const videoUi: Store<VideoUi> = createStore<VideoUi>({
  tool: "select",
  playhead: 0,
  playing: false,
  rate: 1,
  zoom: 1,
  snapToClips: true,
  showCaptions: true,
  showGuides: false,
  bypassEffects: false,
  language: "en",
});

export function setPlayhead(time: number, fps: number): void {
  videoUi.set((current) => ({ ...current, playhead: Math.max(0, snapFrame(time, fps)) }));
}

export function stepFrames(frames: number, fps: number, duration: number): void {
  videoUi.set((current) => ({
    ...current,
    playing: false,
    playhead: Math.max(0, Math.min(duration, snapFrame(current.playhead + frames / fps, fps))),
  }));
}

export function setVideoTool(tool: VideoTool): void {
  videoUi.set((current) => ({ ...current, tool }));
}

/* ------------------------------ parsing ------------------------------ */

interface LegacyBody {
  duration?: number;
  tracks?: { id: string; name: string; clips: { id: string; title: string; start: number; duration: number; color: string }[] }[];
  captions?: { start: number; end: number; text: string }[];
}

function isVideoDoc(body: unknown): body is VideoDoc {
  return Boolean(body && typeof body === "object" && (body as VideoDoc).version === 2 && Array.isArray((body as VideoDoc).tracks));
}

const LOOKS: MediaSource["look"][] = [
  { hue: 28, motion: "pan", subject: "lamp", grain: 0.06 },
  { hue: 210, motion: "push", subject: "room", grain: 0.05 },
  { hue: 150, motion: "orbit", subject: "hands", grain: 0.07 },
  { hue: 18, motion: "static", subject: "bag", grain: 0.04 },
];

/**
 * Open a video record. The old studio body is one track of coloured blocks;
 * each block becomes a clip with a generated source behind it, so the
 * preview has a picture to render rather than a flat rectangle.
 */
export function parseVideo(body: unknown): VideoDoc {
  if (isVideoDoc(body)) {
    return {
      ...body,
      markers: body.markers ?? [],
      reviews: body.reviews ?? [],
      renders: body.renders ?? [],
      transitions: body.transitions ?? [],
      sources: body.sources ?? [],
      loudnessTarget: body.loudnessTarget ?? -16,
    };
  }

  const legacy = body as LegacyBody | undefined;
  const fps = 25;
  const tracks: Track[] = [
    { id: "tr-v1", name: "Picture", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 56 },
    { id: "tr-t1", name: "Titles", kind: "title", order: 2, muted: false, solo: false, locked: false, height: 40 },
    { id: "tr-a1", name: "Audio", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 52, gainDb: 0, pan: 0 },
  ];
  const sources: MediaSource[] = [];
  const clips: Clip[] = [];

  const legacyClips = legacy?.tracks?.[0]?.clips ?? [];
  for (const [index, clip] of legacyClips.entries()) {
    const sourceId = `src-${index + 1}`;
    sources.push({
      id: sourceId, name: clip.title, kind: "video",
      duration: Math.max(clip.duration * 2, 12),
      look: LOOKS[index % LOOKS.length],
      license: "Company-owned", credit: "not recorded", proxy: "generated",
    });
    clips.push({
      id: clip.id, trackId: "tr-v1",
      start: snapFrame(clip.start, fps), sourceIn: 0, duration: snapFrame(clip.duration, fps),
      sourceId, name: clip.title, opacity: 1,
      transform: { scale: 1, x: 0, y: 0, rotation: 0 },
      effects: [], fadeIn: 0, fadeOut: 0,
    });
  }

  sources.push({
    id: "src-room", name: "Room tone", kind: "audio", duration: Math.max(legacy?.duration ?? 20, 20),
    look: { hue: 0, motion: "static", subject: "bars", grain: 0 },
    tone: { root: 96, kind: "room", tempo: 90 },
    license: "Company-owned", credit: "recorded on location",
  });
  clips.push({
    id: "clip-room", trackId: "tr-a1", start: 0, sourceIn: 0,
    duration: snapFrame(legacy?.duration ?? 20, fps), sourceId: "src-room",
    name: "Room tone", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 },
    effects: [], gainDb: -6, fadeIn: 0.4, fadeOut: 0.8,
  });

  return {
    version: 2,
    fps,
    width: 1280,
    height: 720,
    duration: snapFrame(legacy?.duration ?? 20, fps),
    tracks,
    clips,
    transitions: [],
    captions: (legacy?.captions ?? []).map((caption, index) => ({
      id: `cap-${index + 1}`, start: caption.start, end: caption.end,
      text: caption.text, reviewed: false, language: "en",
    })),
    sources,
    markers: [],
    reviews: [],
    renders: [],
    loudnessTarget: -16,
  };
}

export function starterVideo(name: string): VideoDoc {
  const fps = 25;
  const sources: MediaSource[] = [
    { id: "src-a", name: "Opening wide", kind: "video", duration: 14, look: LOOKS[1], license: "Company-owned", credit: "not recorded", proxy: "generated" },
    { id: "src-b", name: "Product detail", kind: "video", duration: 14, look: LOOKS[0], license: "Company-owned", credit: "not recorded", proxy: "generated" },
    { id: "src-music", name: "Bed — slow", kind: "audio", duration: 40, look: LOOKS[3], tone: { root: 110, kind: "music", tempo: 84 }, license: "Licensed — unlimited", credit: "library track" },
  ];
  return {
    version: 2,
    fps, width: 1280, height: 720, duration: 16,
    tracks: [
      { id: "tr-a1", name: "Music", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 52, gainDb: -12, pan: 0 },
      { id: "tr-v1", name: "Picture", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 56 },
      { id: "tr-t1", name: "Titles", kind: "title", order: 2, muted: false, solo: false, locked: false, height: 40 },
    ],
    clips: [
      { id: "c1", trackId: "tr-v1", start: 0, sourceIn: 0, duration: 7, sourceId: "src-a", name: "Opening wide", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0.5, fadeOut: 0 },
      { id: "c2", trackId: "tr-v1", start: 7, sourceIn: 1, duration: 9, sourceId: "src-b", name: "Product detail", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0.6 },
      { id: "t1", trackId: "tr-t1", start: 1, sourceIn: 0, duration: 4, sourceId: "", name: "Title", text: name, textStyle: { size: 64, weight: 700, color: "#FFFFFF", align: "center", family: "Inter" }, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0.4, fadeOut: 0.4 },
      { id: "a1", trackId: "tr-a1", start: 0, sourceIn: 0, duration: 16, sourceId: "src-music", name: "Bed — slow", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -10, fadeIn: 1, fadeOut: 2 },
    ],
    transitions: [{ id: "x1", fromClipId: "c1", toClipId: "c2", kind: "cross-dissolve", duration: 0.8 }],
    captions: [],
    sources,
    markers: [],
    reviews: [],
    renders: [],
    loudnessTarget: -16,
  };
}
