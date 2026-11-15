/* ====================================================================== *
 * Composition loading and the motion editor's shared transport state.
 * ====================================================================== */

import { createStore, type DocHandle, type Store } from "@/applications/visual/kit";
import type { AnimatableProperty, ExportPreset, Keyframe, MotionDoc, MotionLayer } from "./anim";

export interface MotionUi {
  time: number;
  playing: boolean;
  loop: boolean;
  selectedLayerId?: string;
  selectedProperty?: AnimatableProperty;
  selectedKeyframeId?: string;
  onion: boolean;
  zoom: number;
  previewState?: string;
  reduceMotionPreview: boolean;
  /** Auto-key: inspector edits write keyframes at the playhead instead of base values. */
  animate: boolean;
  selectedTriggerId?: string;
  selectedStateId?: string;
  /** Layers chosen for a stagger, in order. */
  staggerIds: string[];
  staggerStep: number;
  exportFormat: "css" | "html" | "svg" | "webm" | "gif" | "json" | "lottie";
}

export const motionUi: Store<MotionUi> = createStore<MotionUi>({
  time: 0,
  playing: false,
  loop: true,
  onion: false,
  zoom: 1,
  reduceMotionPreview: false,
  animate: false,
  staggerIds: [],
  staggerStep: 0.08,
  exportFormat: "css",
});

/**
 * The composition open in the current editor screen. Screen actions run
 * outside React with only the screen context, so the open document handle
 * is published here for them — every action edits the same document the
 * person sees, through the same undo stack.
 */
export interface MotionSession {
  recordId?: string;
  title?: string;
  handle?: DocHandle<MotionDoc>;
}

export const motionSession: Store<MotionSession> = createStore<MotionSession>({});

export function openDoc(): { handle: DocHandle<MotionDoc>; doc: MotionDoc; recordId: string; title: string } | null {
  const session = motionSession.get();
  if (!session.handle?.doc || !session.recordId) return null;
  return { handle: session.handle, doc: session.handle.doc, recordId: session.recordId, title: session.title ?? "Composition" };
}

export const DEFAULT_PRESETS: ExportPreset[] = [
  { id: "pre-web", name: "Web hero, CSS", format: "html", width: 960, fps: 30, loop: true },
  { id: "pre-svg", name: "Inline SVG icon", format: "svg", width: 480, fps: 30, loop: true },
  { id: "pre-social", name: "Social clip, WebM", format: "webm", width: 1280, fps: 30, loop: false },
  { id: "pre-email", name: "Email header, GIF", format: "gif", width: 480, fps: 15, loop: true },
];

export function setMotionTime(time: number, fps: number): void {
  motionUi.set((current) => ({ ...current, time: Math.max(0, Math.round(time * fps) / fps) }));
}

/* ------------------------------ parsing ------------------------------ */

interface LegacyBody {
  duration?: number;
  layers?: { id: string; name: string; keyframes: { t: number; v: number }[] }[];
}

function isMotionDoc(body: unknown): body is MotionDoc {
  return Boolean(body && typeof body === "object" && (body as MotionDoc).version === 2 && Array.isArray((body as MotionDoc).layers));
}

const EASE: Keyframe["easing"] = { kind: "bezier", points: [0.25, 0.1, 0.25, 1] };

/**
 * Open a composition. The old studio body is two named numeric tracks on
 * nothing in particular; they are lifted onto a real text layer so the
 * properties they drive are visible and editable.
 */
export function parseMotion(body: unknown): MotionDoc {
  if (isMotionDoc(body)) {
    return {
      ...body,
      triggers: body.triggers ?? [],
      states: body.states ?? [],
      renders: body.renders ?? [],
      onionSkin: body.onionSkin ?? { before: 2, after: 2, opacity: 0.25 },
      reducedMotion: body.reducedMotion ?? { strategy: "none", note: "" },
      assets: body.assets ?? [],
      tests: body.tests ?? [],
      review: body.review ?? { state: "not_required", reasons: [] },
      presets: body.presets ?? DEFAULT_PRESETS,
    };
  }

  const legacy = body as LegacyBody | undefined;
  const duration = legacy?.duration ?? 2;
  const tracks: MotionLayer["tracks"] = {};
  for (const layer of legacy?.layers ?? []) {
    const property: AnimatableProperty = layer.name.toLowerCase().includes("opacity") ? "opacity"
      : layer.name.toLowerCase() === "y" ? "y"
        : layer.name.toLowerCase() === "x" ? "x" : "scale";
    tracks[property] = layer.keyframes.map((keyframe, index) => ({
      id: `kf-${layer.id}-${index}`, t: keyframe.t, value: keyframe.v, easing: EASE,
    }));
  }

  return {
    version: 2,
    width: 960, height: 540, fps: 30, duration,
    background: "#0E1016",
    layers: [{
      id: "lay-word", name: "Wordmark", kind: "text", visible: true, locked: false,
      box: { x: 260, y: 230, w: 440, h: 80 },
      fill: "#FFFFFF",
      text: "Arlovi",
      textStyle: { family: "Inter", size: 64, weight: 700, align: "start" },
      tracks: Object.keys(tracks).length > 0 ? tracks : {
        opacity: [{ id: "kf-o1", t: 0, value: 0, easing: EASE }, { id: "kf-o2", t: 1, value: 1, easing: EASE }],
        y: [{ id: "kf-y1", t: 0, value: 24, easing: EASE }, { id: "kf-y2", t: 1, value: 0, easing: EASE }],
      },
    }],
    triggers: [],
    states: [],
    onionSkin: { before: 2, after: 2, opacity: 0.25 },
    loop: true,
    reducedMotion: { strategy: "none", note: "" },
    renders: [],
    activeLayerId: "lay-word",
    assets: [],
    tests: [],
    review: { state: "not_required", reasons: [] },
    presets: DEFAULT_PRESETS,
  };
}

export function starterMotion(name: string): MotionDoc {
  return {
    version: 2,
    width: 960, height: 540, fps: 30, duration: 3,
    background: "#0E1016",
    layers: [
      {
        id: "lay-bar", name: "Accent bar", kind: "rect", visible: true, locked: false,
        box: { x: 180, y: 300, w: 260, h: 8 }, fill: "#FFAE7C", radius: 4,
        tracks: {
          scale: [
            { id: "b1", t: 0.2, value: 0, easing: { kind: "bezier", points: [0.2, 0, 0, 1] } },
            { id: "b2", t: 1.1, value: 1, easing: EASE },
          ],
          opacity: [{ id: "bo1", t: 0.2, value: 0, easing: EASE }, { id: "bo2", t: 0.6, value: 1, easing: EASE }],
        },
      },
      {
        id: "lay-title", name: "Title", kind: "text", visible: true, locked: false,
        box: { x: 180, y: 200, w: 600, h: 80 }, fill: "#FFFFFF",
        text: name,
        textStyle: { family: "Inter", size: 64, weight: 700, align: "start" },
        tracks: {
          opacity: [{ id: "t1", t: 0, value: 0, easing: EASE }, { id: "t2", t: 0.8, value: 1, easing: EASE }],
          y: [{ id: "ty1", t: 0, value: 28, easing: { kind: "spring", spring: { stiffness: 180, damping: 20, mass: 1 } } }, { id: "ty2", t: 1, value: 0, easing: EASE }],
        },
      },
      {
        id: "lay-dot", name: "Dot", kind: "ellipse", visible: true, locked: false,
        box: { x: 700, y: 120, w: 120, h: 120 }, fill: "#36C5BA",
        tracks: {
          x: [{ id: "d1", t: 0.4, value: -120, easing: { kind: "bezier", points: [0.34, 1.56, 0.64, 1] } }, { id: "d2", t: 1.6, value: 0, easing: EASE }],
          opacity: [{ id: "do1", t: 0.4, value: 0, easing: EASE }, { id: "do2", t: 0.9, value: 0.9, easing: EASE }],
        },
      },
    ],
    triggers: [],
    states: [{ id: "rest", name: "Rest" }, { id: "hover", name: "Hover" }],
    onionSkin: { before: 2, after: 2, opacity: 0.25 },
    loop: true,
    reducedMotion: { strategy: "cross-fade", note: "A 400ms fade replaces the movement." },
    renders: [],
    activeLayerId: "lay-title",
    assets: [],
    tests: [],
    review: { state: "not_required", reasons: [] },
    presets: DEFAULT_PRESETS,
  };
}

/**
 * A storyboard from a written brief, without a model: each sentence becomes
 * a beat, each beat a text layer that fades and rises in on its own slot.
 * Every keyframe it writes is ordinary and editable.
 */
export function storyboardFromBrief(name: string, brief: string, options: { width: number; height: number; fps: number }): MotionDoc {
  const beats = brief.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
  const slot = 1.2;
  const duration = Math.max(2, Math.round((beats.length * slot + 0.8) * 10) / 10);
  const doc = starterMotion(name);
  const size = Math.round(options.height / 12);
  const layers: MotionLayer[] = beats.map((beat, index) => {
    const start = index * slot;
    const end = start + 0.6;
    return {
      id: `lay-beat-${index + 1}`, name: `Beat ${index + 1}`, kind: "text", visible: true, locked: false,
      box: { x: Math.round(options.width * 0.1), y: Math.round(options.height * 0.18 + index * size * 1.5), w: Math.round(options.width * 0.8), h: Math.round(size * 1.2) },
      fill: index === 0 ? "#FFFFFF" : "#F6F4F0",
      text: beat.length > 60 ? `${beat.slice(0, 57)}…` : beat,
      textStyle: { family: "Inter", size: index === 0 ? Math.round(size * 1.2) : size, weight: index === 0 ? 700 : 500, align: "start" },
      tracks: {
        opacity: [{ id: `kf-b${index}-o1`, t: start, value: 0, easing: EASE }, { id: `kf-b${index}-o2`, t: end, value: 1, easing: EASE }],
        y: [{ id: `kf-b${index}-y1`, t: start, value: 18, easing: { kind: "bezier", points: [0.2, 0, 0, 1] } }, { id: `kf-b${index}-y2`, t: end, value: 0, easing: EASE }],
      },
    };
  });
  return {
    ...doc,
    width: options.width, height: options.height, fps: options.fps, duration,
    layers: layers.length > 0 ? layers : doc.layers,
    activeLayerId: layers[0]?.id ?? doc.activeLayerId,
  };
}
