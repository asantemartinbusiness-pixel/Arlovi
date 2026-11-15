/* ====================================================================== *
 * Composition loading and the motion editor's shared transport state.
 * ====================================================================== */

import { createStore, type Store } from "@/applications/visual/kit";
import type { AnimatableProperty, Keyframe, MotionDoc, MotionLayer } from "./anim";

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
}

export const motionUi: Store<MotionUi> = createStore<MotionUi>({
  time: 0,
  playing: false,
  loop: true,
  onion: false,
  zoom: 1,
  reduceMotionPreview: false,
});

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
  };
}
