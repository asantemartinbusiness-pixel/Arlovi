/* ====================================================================== *
 * Keyframe animation engine.
 *
 * Keyframes sit on real properties of real layers. Sampling a property at
 * a time interpolates between the two keyframes around it through that
 * keyframe's own easing — a cubic bezier, a spring, a hold or a linear
 * ramp. Everything here is pure, so the stage, the graph editor, the CSS
 * export and the tests all sample the same curve.
 * ====================================================================== */

import { clamp, cubicBezier, springValue } from "@/applications/visual/geometry";

export type AnimatableProperty = "x" | "y" | "scale" | "rotation" | "opacity" | "colour" | "letterSpacing" | "blur";

export const NUMERIC_PROPERTIES: AnimatableProperty[] = ["x", "y", "scale", "rotation", "opacity", "letterSpacing", "blur"];

export interface Easing {
  kind: "linear" | "bezier" | "spring" | "hold";
  /** Control points for a bezier, in the CSS order x1 y1 x2 y2. */
  points?: [number, number, number, number];
  spring?: { stiffness: number; damping: number; mass: number };
}

export const EASING_PRESETS: { id: string; name: string; easing: Easing }[] = [
  { id: "linear", name: "Linear", easing: { kind: "linear" } },
  { id: "ease", name: "Ease", easing: { kind: "bezier", points: [0.25, 0.1, 0.25, 1] } },
  { id: "ease-in", name: "Ease in", easing: { kind: "bezier", points: [0.42, 0, 1, 1] } },
  { id: "ease-out", name: "Ease out", easing: { kind: "bezier", points: [0, 0, 0.58, 1] } },
  { id: "ease-in-out", name: "Ease in and out", easing: { kind: "bezier", points: [0.42, 0, 0.58, 1] } },
  { id: "emphasis", name: "Emphasised", easing: { kind: "bezier", points: [0.2, 0, 0, 1] } },
  { id: "back", name: "Overshoot", easing: { kind: "bezier", points: [0.34, 1.56, 0.64, 1] } },
  { id: "spring", name: "Spring", easing: { kind: "spring", spring: { stiffness: 170, damping: 22, mass: 1 } } },
  { id: "hold", name: "Hold", easing: { kind: "hold" } },
];

export interface Keyframe {
  id: string;
  /** Time in seconds. */
  t: number;
  /** Numeric value, or a hex colour for the colour property. */
  value: number | string;
  /** How the segment that *starts* at this keyframe is eased. */
  easing: Easing;
}

export interface MotionLayer {
  id: string;
  name: string;
  kind: "text" | "rect" | "ellipse" | "path" | "group";
  visible: boolean;
  locked: boolean;
  /** Base geometry, before the animated properties are applied. */
  box: { x: number; y: number; w: number; h: number };
  fill: string;
  text?: string;
  textStyle?: { family: string; size: number; weight: number; align: "start" | "center" | "end" };
  radius?: number;
  path?: string;
  /** Keyframes per property, each list sorted by time. */
  tracks: Partial<Record<AnimatableProperty, Keyframe[]>>;
  /** Interaction states this layer answers to. */
  states?: Record<string, Partial<Record<AnimatableProperty, number | string>>>;
  parentId?: string;
  /** A linked workspace asset this layer shows. */
  assetId?: string;
}

export type TriggerEvent = "load" | "hover" | "click" | "scroll" | "key";

export interface Trigger {
  id: string;
  /** What starts it. */
  on: TriggerEvent;
  /** Which state it moves to. */
  state: string;
  layerId: string;
  /** Keyboard and touch equivalents, which the accessibility check requires. */
  keyboard?: string;
  touch?: boolean;
  /** Hover and scroll return to rest when they end; click and key toggle. */
  returnOnEnd?: boolean;
  note: string;
}

export interface MotionState {
  id: string;
  name: string;
  /** Transition into this state. */
  duration?: number;
  easing?: Easing;
}

export interface MotionAsset {
  id: string;
  name: string;
  kind: "image" | "vector" | "font" | "audio";
  /** The workspace record this asset links to. */
  recordId?: string;
  collection?: string;
}

export interface MotionTest {
  id: string;
  kind: "accessibility" | "interaction" | "fallback" | "loop";
  at: string;
  by: string;
  pass: boolean;
  findings: string[];
}

export interface MotionRender {
  id: string;
  at: string;
  by: string;
  format: string;
  /** queued | rendering | done | failed | published (queued_local at the hosting boundary). */
  state: string;
  artifact?: string;
  bytes?: number;
  note: string;
  publish?: { state: "queued_local" | "not_connected"; at: string; by: string };
}

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  width: number;
  fps: number;
  loop: boolean;
}

export type ExportFormat = "css" | "html" | "svg" | "webm" | "gif" | "json" | "lottie";

export interface MotionDoc {
  version: 2;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  layers: MotionLayer[];
  triggers: Trigger[];
  /** Named states a layer can be driven to. */
  states: MotionState[];
  onionSkin: { before: number; after: number; opacity: number };
  loop: boolean;
  /** Reduced-motion alternative, which every export must declare. */
  reducedMotion: { strategy: "cross-fade" | "static-first-frame" | "none"; note: string };
  renders: MotionRender[];
  activeLayerId?: string;
  assets: MotionAsset[];
  tests: MotionTest[];
  /** Accessibility review, which a failing motion test makes required. */
  review: { state: "not_required" | "required" | "approved"; reasons: string[]; requestedAt?: string; reviewer?: string; reviewedAt?: string; note?: string };
  presets: ExportPreset[];
  /** Who has reviewed the reduced-motion alternative, and when. */
  fallbackReview?: { by: string; at: string; note: string };
}

/* ====================================================================== *
 * Sampling
 * ====================================================================== */

export function easeAt(easing: Easing, progress: number): number {
  const t = clamp(progress, 0, 1);
  if (easing.kind === "hold") return 0;
  if (easing.kind === "linear") return t;
  if (easing.kind === "spring") {
    const spring = easing.spring ?? { stiffness: 170, damping: 22, mass: 1 };
    /* Sample the spring over a one second notional settle, scaled to t. */
    return springValue(t * 1.1, spring.stiffness, spring.damping, spring.mass);
  }
  const [x1, y1, x2, y2] = easing.points ?? [0.25, 0.1, 0.25, 1];
  return cubicBezier(x1, y1, x2, y2, t);
}

function mixHex(from: string, to: string, amount: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  };
  const a = parse(from);
  const b = parse(to);
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * clamp(amount, 0, 1)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Sample one property's track at a time. */
export function sampleTrack(keyframes: Keyframe[] | undefined, time: number, fallback: number | string): number | string {
  if (!keyframes || keyframes.length === 0) return fallback;
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  if (time <= sorted[0].t) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.t) return last.value;
  let index = 0;
  while (index < sorted.length - 2 && time >= sorted[index + 1].t) index += 1;
  const from = sorted[index];
  const to = sorted[index + 1];
  const span = to.t - from.t;
  const progress = span <= 0 ? 1 : (time - from.t) / span;
  const eased = easeAt(from.easing, progress);
  if (typeof from.value === "string" || typeof to.value === "string") {
    return mixHex(String(from.value), String(to.value), eased);
  }
  return from.value + (to.value - from.value) * eased;
}

export interface SampledLayer {
  layer: MotionLayer;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  colour: string;
  letterSpacing: number;
  blur: number;
}

export function sampleLayer(layer: MotionLayer, time: number): SampledLayer {
  return {
    layer,
    x: Number(sampleTrack(layer.tracks.x, time, 0)),
    y: Number(sampleTrack(layer.tracks.y, time, 0)),
    scale: Number(sampleTrack(layer.tracks.scale, time, 1)),
    rotation: Number(sampleTrack(layer.tracks.rotation, time, 0)),
    opacity: clamp(Number(sampleTrack(layer.tracks.opacity, time, 1)), 0, 1),
    colour: String(sampleTrack(layer.tracks.colour, time, layer.fill)),
    letterSpacing: Number(sampleTrack(layer.tracks.letterSpacing, time, 0)),
    blur: Math.max(0, Number(sampleTrack(layer.tracks.blur, time, 0))),
  };
}

export function sampleAll(doc: MotionDoc, time: number): SampledLayer[] {
  return doc.layers.filter((layer) => layer.visible).map((layer) => sampleLayer(layer, time));
}

/* ====================================================================== *
 * Editing
 * ====================================================================== */

export function propertyDefault(property: AnimatableProperty, layer: MotionLayer): number | string {
  if (property === "scale") return 1;
  if (property === "opacity") return 1;
  if (property === "colour") return layer.fill;
  return 0;
}

export function setKeyframe(
  doc: MotionDoc,
  layerId: string,
  property: AnimatableProperty,
  time: number,
  value: number | string,
  easing: Easing = { kind: "bezier", points: [0.25, 0.1, 0.25, 1] },
): MotionDoc {
  const fps = doc.fps;
  const t = Math.round(time * fps) / fps;
  return {
    ...doc,
    layers: doc.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const existing = layer.tracks[property] ?? [];
      const at = existing.find((keyframe) => Math.abs(keyframe.t - t) < 0.5 / fps);
      const next = at
        ? existing.map((keyframe) => (keyframe.id === at.id ? { ...keyframe, value } : keyframe))
        : [...existing, { id: `kf-${layerId}-${property}-${Math.round(t * 1000)}`, t, value, easing }];
      return { ...layer, tracks: { ...layer.tracks, [property]: next.sort((a, b) => a.t - b.t) } };
    }),
  };
}

export function removeKeyframe(doc: MotionDoc, layerId: string, property: AnimatableProperty, keyframeId: string): MotionDoc {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === layerId
      ? { ...layer, tracks: { ...layer.tracks, [property]: (layer.tracks[property] ?? []).filter((keyframe) => keyframe.id !== keyframeId) } }
      : layer)),
  };
}

export function moveKeyframe(doc: MotionDoc, layerId: string, property: AnimatableProperty, keyframeId: string, time: number): MotionDoc {
  const t = clamp(Math.round(time * doc.fps) / doc.fps, 0, doc.duration);
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === layerId
      ? {
        ...layer,
        tracks: {
          ...layer.tracks,
          [property]: (layer.tracks[property] ?? [])
            .map((keyframe) => (keyframe.id === keyframeId ? { ...keyframe, t } : keyframe))
            .sort((a, b) => a.t - b.t),
        },
      }
      : layer)),
  };
}

export function setEasing(doc: MotionDoc, layerId: string, property: AnimatableProperty, keyframeId: string, easing: Easing): MotionDoc {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === layerId
      ? { ...layer, tracks: { ...layer.tracks, [property]: (layer.tracks[property] ?? []).map((keyframe) => (keyframe.id === keyframeId ? { ...keyframe, easing } : keyframe)) } }
      : layer)),
  };
}

/** Offset each layer's keyframes by a step, which is what a stagger is. */
export function stagger(doc: MotionDoc, layerIds: string[], step: number): MotionDoc {
  return {
    ...doc,
    layers: doc.layers.map((layer) => {
      const index = layerIds.indexOf(layer.id);
      if (index < 0) return layer;
      const offset = index * step;
      const tracks: MotionLayer["tracks"] = {};
      for (const [property, keyframes] of Object.entries(layer.tracks)) {
        tracks[property as AnimatableProperty] = (keyframes ?? []).map((keyframe) => ({
          ...keyframe,
          t: Math.round(clamp(keyframe.t + offset, 0, doc.duration) * doc.fps) / doc.fps,
        }));
      }
      return { ...layer, tracks };
    }),
  };
}

export function layerSpan(layer: MotionLayer): { from: number; to: number } | null {
  const times = Object.values(layer.tracks).flatMap((keyframes) => (keyframes ?? []).map((keyframe) => keyframe.t));
  if (times.length === 0) return null;
  return { from: Math.min(...times), to: Math.max(...times) };
}

export function keyframeCount(doc: MotionDoc): number {
  return doc.layers.reduce((sum, layer) => sum + Object.values(layer.tracks).reduce((count, keyframes) => count + (keyframes?.length ?? 0), 0), 0);
}

/* ====================================================================== *
 * Accessibility
 * ====================================================================== */

export interface MotionWarning { layerId?: string; severity: "danger" | "warning" | "info"; title: string; detail: string }

/**
 * Checks that matter for people who are sensitive to motion: flashing,
 * large-area movement, very fast scale changes, and triggers with no
 * keyboard or touch equivalent.
 */
export function motionWarnings(doc: MotionDoc): MotionWarning[] {
  const out: MotionWarning[] = [];

  for (const layer of doc.layers) {
    const opacity = layer.tracks.opacity ?? [];
    let flashes = 0;
    for (let index = 1; index < opacity.length; index += 1) {
      const span = opacity[index].t - opacity[index - 1].t;
      const change = Math.abs(Number(opacity[index].value) - Number(opacity[index - 1].value));
      if (span > 0 && change > 0.5 && span < 0.34) flashes += 1;
    }
    if (flashes >= 3) {
      out.push({
        layerId: layer.id, severity: "danger",
        title: `${layer.name} flashes ${flashes} times`,
        detail: "More than three large opacity changes a second can trigger seizures. WCAG 2.3.1 asks for no more than three flashes in any one second.",
      });
    }

    const area = (layer.box.w * layer.box.h) / (doc.width * doc.height);
    const xs = (layer.tracks.x ?? []).map((keyframe) => Number(keyframe.value));
    const ys = (layer.tracks.y ?? []).map((keyframe) => Number(keyframe.value));
    const travel = Math.max(xs.length ? Math.max(...xs) - Math.min(...xs) : 0, ys.length ? Math.max(...ys) - Math.min(...ys) : 0);
    if (area > 0.3 && travel > doc.width * 0.3) {
      out.push({
        layerId: layer.id, severity: "warning",
        title: `${layer.name} moves a large area a long way`,
        detail: `It covers ${Math.round(area * 100)}% of the stage and travels ${Math.round(travel)}px. Large parallax movement is a common trigger for vestibular discomfort.`,
      });
    }

    const scales = layer.tracks.scale ?? [];
    for (let index = 1; index < scales.length; index += 1) {
      const span = scales[index].t - scales[index - 1].t;
      const change = Math.abs(Number(scales[index].value) - Number(scales[index - 1].value));
      if (span > 0 && change / span > 4) {
        out.push({
          layerId: layer.id, severity: "warning",
          title: `${layer.name} scales very fast`,
          detail: `Scale changes by ${change.toFixed(2)} in ${span.toFixed(2)}s. A sudden zoom is disorienting at this speed.`,
        });
        break;
      }
    }
  }

  for (const trigger of doc.triggers) {
    if ((trigger.on === "hover" || trigger.on === "scroll") && !trigger.keyboard && !trigger.touch) {
      out.push({
        layerId: trigger.layerId, severity: "danger",
        title: `A ${trigger.on} trigger has no alternative`,
        detail: "Hover and scroll cannot be reached by every input. Give it a keyboard equivalent or a touch equivalent before this is shipped.",
      });
    }
  }

  if (doc.reducedMotion.strategy === "none") {
    out.push({
      severity: "danger",
      title: "No reduced-motion alternative is declared",
      detail: "A person with prefers-reduced-motion set will get the full animation. Choose a cross-fade or a static first frame before exporting.",
    });
  }

  return out;
}

/* ====================================================================== *
 * Frame-by-frame accessibility test
 * ====================================================================== */

function luminanceOf(hex: string): number {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const channel = (offset: number) => {
    const v = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * Samples every frame and measures how much of the stage changes brightness
 * from one frame to the next. A "flash" is a pair of opposing changes of at
 * least 10% relative luminance over a quarter of the stage or more, which is
 * the WCAG 2.3.1 general flash threshold applied to this stage.
 */
export function flashAnalysis(doc: MotionDoc): { flashesPerSecond: number; worstSecond: number; frames: number } {
  const frames = Math.max(2, Math.round(doc.duration * doc.fps) + 1);
  const background = luminanceOf(doc.background);
  const stageArea = doc.width * doc.height;
  const series: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / doc.fps;
    let weighted = 0;
    for (const sampled of sampleAll(doc, time)) {
      const area = Math.min(1, (sampled.layer.box.w * sampled.layer.box.h * sampled.scale * sampled.scale) / stageArea);
      const lum = typeof sampled.colour === "string" ? luminanceOf(sampled.colour) : background;
      weighted += area * sampled.opacity * (lum - background);
    }
    series.push(background + weighted);
  }
  /* Count direction reversals of large luminance swings. */
  const swings: number[] = [];
  let anchor = series[0];
  let direction = 0;
  for (let index = 1; index < series.length; index += 1) {
    const delta = series[index] - anchor;
    if (Math.abs(delta) >= 0.1) {
      const next = Math.sign(delta);
      if (direction !== 0 && next !== direction) swings.push(index);
      direction = next;
      anchor = series[index];
    }
  }
  let worst = 0;
  let worstSecond = 0;
  for (let second = 0; second < Math.ceil(doc.duration); second += 1) {
    const from = second * doc.fps;
    const count = swings.filter((frame) => frame >= from && frame < from + doc.fps).length;
    if (count > worst) { worst = count; worstSecond = second; }
  }
  return { flashesPerSecond: worst, worstSecond, frames };
}

export function accessibilityFindings(doc: MotionDoc): MotionWarning[] {
  const out = motionWarnings(doc);
  const flash = flashAnalysis(doc);
  if (flash.flashesPerSecond > 3) {
    out.unshift({
      severity: "danger",
      title: `${flash.flashesPerSecond} flashes in one second`,
      detail: `Sampled across ${flash.frames} frames, the stage brightness reverses ${flash.flashesPerSecond} times in second ${flash.worstSecond}. WCAG 2.3.1 allows at most three.`,
    });
  }
  return out;
}

/* ====================================================================== *
 * Timing
 * ====================================================================== */

/** Move every keyframe of a layer by a delay, which is how a layer is delayed. */
export function shiftLayer(doc: MotionDoc, layerId: string, delta: number): MotionDoc {
  return {
    ...doc,
    layers: doc.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const tracks: MotionLayer["tracks"] = {};
      for (const [property, keyframes] of Object.entries(layer.tracks)) {
        tracks[property as AnimatableProperty] = (keyframes ?? []).map((keyframe) => ({
          ...keyframe, t: Math.round(clamp(keyframe.t + delta, 0, doc.duration) * doc.fps) / doc.fps,
        }));
      }
      return { ...layer, tracks };
    }),
  };
}

/** Change the composition length, optionally scaling every keyframe with it. */
export function retime(doc: MotionDoc, duration: number, scale: boolean): MotionDoc {
  const next = clamp(duration, 0.2, 120);
  const factor = next / Math.max(doc.duration, 0.001);
  return {
    ...doc,
    duration: next,
    layers: doc.layers.map((layer) => {
      const tracks: MotionLayer["tracks"] = {};
      for (const [property, keyframes] of Object.entries(layer.tracks)) {
        tracks[property as AnimatableProperty] = (keyframes ?? []).map((keyframe) => ({
          ...keyframe,
          t: Math.round(clamp(scale ? keyframe.t * factor : keyframe.t, 0, next) * doc.fps) / doc.fps,
        }));
      }
      return { ...layer, tracks };
    }),
  };
}

/** Differences between the first and last frame, which show as a jump when looping. */
export function loopSeams(doc: MotionDoc): { layerId: string; layer: string; property: AnimatableProperty; first: number | string; last: number | string }[] {
  const out: { layerId: string; layer: string; property: AnimatableProperty; first: number | string; last: number | string }[] = [];
  for (const layer of doc.layers) {
    for (const [property, keyframes] of Object.entries(layer.tracks) as [AnimatableProperty, Keyframe[] | undefined][]) {
      if (!keyframes || keyframes.length === 0) continue;
      const first = sampleTrack(keyframes, 0, propertyDefault(property, layer));
      const last = sampleTrack(keyframes, doc.duration, propertyDefault(property, layer));
      const same = typeof first === "number" && typeof last === "number" ? Math.abs(first - last) < 1e-3 : String(first).toLowerCase() === String(last).toLowerCase();
      if (!same) out.push({ layerId: layer.id, layer: layer.name, property, first, last });
    }
  }
  return out;
}

/** Close every seam by writing a last-frame keyframe equal to the first frame. */
export function closeLoop(doc: MotionDoc): MotionDoc {
  let next = doc;
  for (const seam of loopSeams(doc)) {
    next = setKeyframe(next, seam.layerId, seam.property, doc.duration, seam.first);
  }
  return next;
}

/* ====================================================================== *
 * Interaction: one reducer drives the live preview, the test and the export.
 * ====================================================================== */

export type InteractionInput =
  | { kind: "pointerenter" | "pointerleave" | "focus" | "blur" | "click" | "tap"; layerId: string }
  | { kind: "key"; layerId: string; key: string }
  | { kind: "scroll"; progress: number }
  | { kind: "load" };

export type InteractionState = Record<string, string>;

export const REST = "rest";

function toggle(current: InteractionState, layerId: string, state: string): InteractionState {
  return { ...current, [layerId]: current[layerId] === state ? REST : state };
}

export function interact(doc: MotionDoc, current: InteractionState, input: InteractionInput): InteractionState {
  let next = current;
  for (const trigger of doc.triggers) {
    if (input.kind === "load") {
      if (trigger.on === "load") next = { ...next, [trigger.layerId]: trigger.state };
      continue;
    }
    if (input.kind === "scroll") {
      if (trigger.on === "scroll") next = { ...next, [trigger.layerId]: input.progress >= 0.5 ? trigger.state : (trigger.returnOnEnd === false ? next[trigger.layerId] ?? REST : REST) };
      continue;
    }
    if (trigger.layerId !== input.layerId) continue;
    switch (input.kind) {
      case "pointerenter":
        if (trigger.on === "hover") next = { ...next, [trigger.layerId]: trigger.state };
        break;
      case "pointerleave":
        if (trigger.on === "hover" && trigger.returnOnEnd !== false) next = { ...next, [trigger.layerId]: REST };
        break;
      case "focus":
        if (trigger.on === "hover" && trigger.keyboard === "Focus") next = { ...next, [trigger.layerId]: trigger.state };
        break;
      case "blur":
        if (trigger.on === "hover" && trigger.keyboard === "Focus" && trigger.returnOnEnd !== false) next = { ...next, [trigger.layerId]: REST };
        break;
      case "click":
        if (trigger.on === "click") next = toggle(next, trigger.layerId, trigger.state);
        break;
      case "tap":
        if (trigger.touch && (trigger.on === "hover" || trigger.on === "click")) next = toggle(next, trigger.layerId, trigger.state);
        break;
      case "key":
        if ((trigger.on === "click" || trigger.on === "key") && trigger.keyboard && trigger.keyboard.toLowerCase() === input.key.toLowerCase()) {
          next = toggle(next, trigger.layerId, trigger.state);
        }
        break;
      default:
        break;
    }
  }
  return next;
}

/** The values a layer settles at in a state: the end of the timeline, overridden by the state. */
export function stateValues(layer: MotionLayer, state: string, doc: MotionDoc): SampledLayer {
  const base = sampleLayer(layer, doc.duration);
  if (state === REST) return base;
  const override = layer.states?.[state] ?? {};
  return {
    ...base,
    x: Number(override.x ?? base.x),
    y: Number(override.y ?? base.y),
    scale: Number(override.scale ?? base.scale),
    rotation: Number(override.rotation ?? base.rotation),
    opacity: clamp(Number(override.opacity ?? base.opacity), 0, 1),
    colour: String(override.colour ?? base.colour),
    letterSpacing: Number(override.letterSpacing ?? base.letterSpacing),
    blur: Math.max(0, Number(override.blur ?? base.blur)),
  };
}

export interface TriggerCheck {
  triggerId: string;
  label: string;
  pointer: boolean;
  keyboard: boolean;
  touch: boolean;
  keyboardHow: string;
  touchHow: string;
}

/**
 * Drive each trigger through the reducer three ways — pointer, keyboard and
 * touch — and record whether the layer actually reaches the bound state.
 */
export function testTriggers(doc: MotionDoc): TriggerCheck[] {
  return doc.triggers.map((trigger) => {
    const layer = doc.layers.find((item) => item.id === trigger.layerId);
    const reached = (inputs: InteractionInput[]) => {
      let state: InteractionState = {};
      for (const input of inputs) state = interact(doc, state, input);
      return state[trigger.layerId] === trigger.state;
    };
    const id = trigger.layerId;
    let pointer = false;
    let keyboard = false;
    let touch = false;
    let keyboardHow = "none bound";
    let touchHow = "none bound";
    switch (trigger.on) {
      case "load":
        pointer = keyboard = touch = reached([{ kind: "load" }]);
        keyboardHow = touchHow = "plays on load, no input needed";
        break;
      case "hover":
        pointer = reached([{ kind: "pointerenter", layerId: id }]);
        keyboard = reached([{ kind: "focus", layerId: id }]);
        touch = reached([{ kind: "tap", layerId: id }]);
        if (keyboard) keyboardHow = "Tab to focus";
        if (touch) touchHow = "tap toggles";
        break;
      case "click":
        pointer = reached([{ kind: "click", layerId: id }]);
        keyboard = trigger.keyboard ? reached([{ kind: "key", layerId: id, key: trigger.keyboard }]) : false;
        touch = reached([{ kind: "tap", layerId: id }]);
        if (keyboard) keyboardHow = `${trigger.keyboard} toggles`;
        if (touch) touchHow = "tap toggles";
        break;
      case "key":
        keyboard = trigger.keyboard ? reached([{ kind: "key", layerId: id, key: trigger.keyboard }]) : false;
        pointer = keyboard;
        touch = Boolean(trigger.touch);
        if (keyboard) keyboardHow = `${trigger.keyboard}`;
        touchHow = touch ? "on-screen control" : "none bound";
        break;
      case "scroll":
        pointer = reached([{ kind: "scroll", progress: 1 }]);
        keyboard = pointer && Boolean(trigger.keyboard);
        touch = pointer && Boolean(trigger.touch);
        if (keyboard) keyboardHow = `${trigger.keyboard} scrolls the region`;
        if (touch) touchHow = "swipe scrolls the region";
        break;
      default:
        break;
    }
    return {
      triggerId: trigger.id,
      label: `${trigger.on} on ${layer?.name ?? "a missing layer"} → ${doc.states.find((state) => state.id === trigger.state)?.name ?? trigger.state}`,
      pointer, keyboard, touch, keyboardHow, touchHow,
    };
  });
}

/* ====================================================================== *
 * Export
 * ====================================================================== */

function cssEasing(easing: Easing): string {
  if (easing.kind === "linear") return "linear";
  if (easing.kind === "hold") return "steps(1, end)";
  if (easing.kind === "spring") return "linear";
  const [x1, y1, x2, y2] = easing.points ?? [0.25, 0.1, 0.25, 1];
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

function percent(time: number, duration: number): string {
  return `${((time / Math.max(duration, 0.001)) * 100).toFixed(3)}%`;
}

function sameEasing(a: Easing, b: Easing): boolean {
  return a.kind === b.kind && JSON.stringify(a.points ?? null) === JSON.stringify(b.points ?? null) && JSON.stringify(a.spring ?? null) === JSON.stringify(b.spring ?? null);
}

/**
 * For the segment [from, to] of one layer, the single easing every changing
 * property shares, `null` when none changes, or "bake" when they disagree or
 * a curve CSS cannot express (a spring) is involved.
 */
function segmentEasing(layer: MotionLayer, from: number, to: number): Easing | null | "bake" {
  let shared: Easing | null = null;
  for (const [property, keyframes] of Object.entries(layer.tracks) as [AnimatableProperty, Keyframe[] | undefined][]) {
    if (!keyframes || keyframes.length === 0) continue;
    const sorted = [...keyframes].sort((a, b) => a.t - b.t);
    const at = sorted.findIndex((keyframe) => Math.abs(keyframe.t - from) < 1e-6);
    const end = sorted.findIndex((keyframe) => Math.abs(keyframe.t - to) < 1e-6);
    const a = sampleTrack(sorted, from, propertyDefault(property, layer));
    const b = sampleTrack(sorted, to, propertyDefault(property, layer));
    const constant = String(a) === String(b) && (at < 0 || sorted[at].easing.kind !== "spring");
    if (at >= 0 && end === at + 1) {
      if (constant && sorted[at].easing.kind !== "hold") continue;
      const easing = sorted[at].easing;
      if (easing.kind === "spring") return "bake";
      if (shared && !sameEasing(shared, easing)) return "bake";
      shared = easing;
      continue;
    }
    if (constant) continue;
    return "bake";
  }
  return shared;
}

export interface CssOptions { selector: string; svg: boolean; loop: boolean }

/** One layer's @keyframes block, exact where CSS can say it and baked per frame where it cannot. */
function layerKeyframes(doc: MotionDoc, layer: MotionLayer, options: CssOptions): { css: string; baked: number } {
  const times = [...new Set([0, doc.duration, ...Object.values(layer.tracks).flatMap((keyframes) => (keyframes ?? []).map((keyframe) => keyframe.t))])]
    .filter((time) => time >= 0 && time <= doc.duration)
    .sort((a, b) => a - b);
  const steps: { time: number; timing?: string }[] = [];
  let baked = 0;
  for (let index = 0; index < times.length; index += 1) {
    const from = times[index];
    const to = times[index + 1];
    if (to === undefined) { steps.push({ time: from }); break; }
    const easing = segmentEasing(layer, from, to);
    if (easing === "bake") {
      baked += 1;
      const frames = Math.max(2, Math.round((to - from) * doc.fps));
      for (let frame = 0; frame < frames; frame += 1) steps.push({ time: from + ((to - from) * frame) / frames, timing: "linear" });
    } else {
      steps.push({ time: from, timing: easing ? cssEasing(easing) : "linear" });
    }
  }
  const colourProp = options.svg ? "fill" : "color";
  const body = steps.map((step) => {
    const sampled = sampleLayer(layer, step.time);
    const parts = [
      `transform: translate(${sampled.x.toFixed(2)}px, ${sampled.y.toFixed(2)}px) rotate(${sampled.rotation.toFixed(2)}deg) scale(${sampled.scale.toFixed(4)})`,
      `opacity: ${sampled.opacity.toFixed(3)}`,
    ];
    if ((layer.tracks.colour ?? []).length > 0) parts.push(`${layer.kind === "text" || options.svg ? colourProp : "background-color"}: ${sampled.colour}`);
    if ((layer.tracks.letterSpacing ?? []).length > 0) parts.push(`letter-spacing: ${sampled.letterSpacing.toFixed(2)}px`);
    if ((layer.tracks.blur ?? []).length > 0) parts.push(`filter: blur(${sampled.blur.toFixed(2)}px)`);
    if (step.timing) parts.push(`animation-timing-function: ${step.timing}`);
    return `  ${percent(step.time, doc.duration)} { ${parts.join("; ")}; }`;
  });
  return { css: `@keyframes kf-${layer.id} {\n${body.join("\n")}\n}`, baked };
}

function reducedCss(doc: MotionDoc, selector: string): string {
  if (doc.reducedMotion.strategy === "static-first-frame") {
    return `@media (prefers-reduced-motion: reduce) {\n  ${selector} [data-layer] { animation: none !important; }\n}`;
  }
  if (doc.reducedMotion.strategy === "cross-fade") {
    return `@media (prefers-reduced-motion: reduce) {\n  /* The movement is replaced by a fade into the final frame. */\n  ${selector} [data-layer] { animation: none !important; transform: var(--final-transform) !important; opacity: var(--final-opacity); }\n  ${selector} { animation: motion-fade 0.4s ease both; }\n}\n@keyframes motion-fade { from { opacity: 0 } to { opacity: 1 } }`;
  }
  return "/* No reduced-motion alternative is declared. A person with prefers-reduced-motion\n   set will see the full animation, which this file does not hide. */";
}

function finalVars(doc: MotionDoc, layer: MotionLayer): string {
  const end = sampleLayer(layer, doc.duration);
  return `--final-transform: translate(${end.x.toFixed(2)}px, ${end.y.toFixed(2)}px) rotate(${end.rotation.toFixed(2)}deg) scale(${end.scale.toFixed(4)}); --final-opacity: ${end.opacity.toFixed(3)};`;
}

/** The CSS for a composition: layout, keyframes, and the reduced-motion alternative. */
export function toCss(doc: MotionDoc, selector = ".motion"): string {
  const blocks: string[] = [];
  const rules: string[] = [];
  let baked = 0;
  for (const layer of doc.layers.filter((item) => item.visible)) {
    const { css, baked: count } = layerKeyframes(doc, layer, { selector, svg: false, loop: doc.loop });
    baked += count;
    blocks.push(css);
    const text = layer.kind === "text"
      ? `font: ${layer.textStyle?.weight ?? 700} ${layer.textStyle?.size ?? 48}px/${1.1} ${layer.textStyle?.family ?? "Inter"}, system-ui, sans-serif; color: ${layer.fill}; white-space: nowrap; text-align: ${layer.textStyle?.align ?? "start"};`
      : `background-color: ${layer.fill};${layer.kind === "ellipse" ? " border-radius: 50%;" : layer.radius ? ` border-radius: ${layer.radius}px;` : ""}`;
    rules.push(`${selector} [data-layer="${layer.id}"] {
  position: absolute; left: ${layer.box.x}px; top: ${layer.box.y}px; width: ${layer.box.w}px; height: ${layer.box.h}px;
  ${text}
  transform-origin: center; ${finalVars(doc, layer)}
  animation: kf-${layer.id} ${doc.duration}s ${doc.loop ? "infinite" : "1"} both;
}`);
  }
  const markup = doc.layers.filter((item) => item.visible).map((layer) => `   <div data-layer="${layer.id}">${layer.kind === "text" ? escapeXml(layer.text ?? "") : ""}</div>`).join("\n");
  return `/* ${doc.layers.length} layers, ${keyframeCount(doc)} keyframes, ${doc.duration}s at ${doc.fps} fps.
   Generated from the composition: values are sampled from the curves the stage plays.
   ${baked > 0 ? `${baked} segment(s) use a spring or mixed easing that CSS cannot express; they are baked to one step per frame.` : "Every segment is expressed exactly with a CSS timing function."}

   Markup:
   <div class="${selector.replace(/^\./, "")}">
${markup}
   </div> */

${selector} { position: relative; width: ${doc.width}px; height: ${doc.height}px; overflow: hidden; background: ${doc.background}; }

${blocks.join("\n\n")}

${rules.join("\n\n")}

${reducedCss(doc, selector)}
`;
}

/** A self-contained HTML page that plays the CSS, which is the easiest way to check it. */
export function toHtml(doc: MotionDoc, title: string): string {
  const markup = doc.layers.filter((item) => item.visible).map((layer) => `    <div data-layer="${layer.id}">${layer.kind === "text" ? escapeXml(layer.text ?? "") : ""}</div>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1A1917; }
${toCss(doc, ".motion")}
</style>
</head>
<body>
  <div class="motion" role="img" aria-label="${escapeXml(title)}">
${markup}
  </div>
</body>
</html>
`;
}

/**
 * An animated SVG. The animation is CSS inside the SVG, not SMIL, so the
 * same reduced-motion media query applies wherever the file is shown.
 */
export function toSvgAnimation(doc: MotionDoc, title = "Composition"): string {
  const layers = doc.layers.filter((layer) => layer.visible);
  const keyframes: string[] = [];
  const rules: string[] = [];
  const shapes: string[] = [];
  for (const layer of layers) {
    keyframes.push(layerKeyframes(doc, layer, { selector: "svg", svg: true, loop: doc.loop }).css);
    rules.push(`[data-layer="${layer.id}"] { transform-box: fill-box; transform-origin: center; ${finalVars(doc, layer)} animation: kf-${layer.id} ${doc.duration}s ${doc.loop ? "infinite" : "1"} both; }`);
    const shape = layer.kind === "ellipse"
      ? `<ellipse cx="${layer.box.w / 2}" cy="${layer.box.h / 2}" rx="${layer.box.w / 2}" ry="${layer.box.h / 2}" fill="${layer.fill}"/>`
      : layer.kind === "text"
        ? `<text x="0" y="${((layer.textStyle?.size ?? 48) * 0.82).toFixed(1)}" font-family="${layer.textStyle?.family ?? "Inter"}, sans-serif" font-size="${layer.textStyle?.size ?? 48}" font-weight="${layer.textStyle?.weight ?? 700}" fill="${layer.fill}">${escapeXml(layer.text ?? "")}</text>`
        : layer.kind === "path" && layer.path
          ? `<path d="${layer.path}" fill="${layer.fill}"/>`
          : `<rect width="${layer.box.w}" height="${layer.box.h}" rx="${layer.radius ?? 0}" fill="${layer.fill}"/>`;
    /* The box sits behind the shape so fill-box centres on the layer's box, as the stage does. */
    shapes.push(`<g transform="translate(${layer.box.x} ${layer.box.y})"><g data-layer="${layer.id}"><rect width="${layer.box.w}" height="${layer.box.h}" fill="none"/>${shape}</g></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}" role="img" aria-label="${escapeXml(title)}">
<title>${escapeXml(title)}</title>
<style>
${keyframes.join("\n")}
${rules.join("\n")}
${reducedCss(doc, "svg")}
</style>
<rect width="${doc.width}" height="${doc.height}" fill="${doc.background}"/>
${shapes.join("\n")}
</svg>
`;
}

/** Interactive states as CSS transitions, wired by a short script that mirrors the reducer. */
export function toInteractionHtml(doc: MotionDoc, title: string): string {
  const layers = doc.layers.filter((layer) => layer.visible);
  const stateRules: string[] = [];
  for (const layer of layers) {
    for (const state of [{ id: REST, name: "Rest" } as MotionState, ...doc.states.filter((item) => item.id !== REST)]) {
      const values = stateValues(layer, state.id, doc);
      const transition = doc.states.find((item) => item.id === state.id);
      const easing = transition?.easing ? cssEasing(transition.easing) : "cubic-bezier(0.2, 0, 0, 1)";
      const duration = transition?.duration ?? 0.25;
      const selector = state.id === REST ? `[data-layer="${layer.id}"]` : `[data-layer="${layer.id}"][data-state="${state.id}"]`;
      const colourProp = layer.kind === "text" ? "color" : "background-color";
      stateRules.push(`${selector} { transform: translate(${values.x.toFixed(2)}px, ${values.y.toFixed(2)}px) rotate(${values.rotation.toFixed(2)}deg) scale(${values.scale.toFixed(4)}); opacity: ${values.opacity.toFixed(3)}; ${colourProp}: ${values.colour}; transition: transform ${duration}s ${easing}, opacity ${duration}s ${easing}, ${colourProp} ${duration}s ${easing}; }`);
    }
  }
  const base = layers.map((layer) => `[data-layer="${layer.id}"] { position: absolute; left: ${layer.box.x}px; top: ${layer.box.y}px; width: ${layer.box.w}px; height: ${layer.box.h}px; transform-origin: center; ${layer.kind === "text" ? `font: ${layer.textStyle?.weight ?? 700} ${layer.textStyle?.size ?? 48}px/1.1 ${layer.textStyle?.family ?? "Inter"}, sans-serif; white-space: nowrap; background: none; border: 0; padding: 0; text-align: start;` : layer.kind === "ellipse" ? "border-radius: 50%; border: 0;" : `border-radius: ${layer.radius ?? 0}px; border: 0;`} }`).join("\n");
  const interactive = new Set(doc.triggers.filter((trigger) => trigger.on !== "load" && trigger.on !== "scroll").map((trigger) => trigger.layerId));
  const markup = layers.map((layer) => (interactive.has(layer.id)
    ? `    <button type="button" data-layer="${layer.id}" data-state="rest" aria-label="${escapeXml(layer.text || layer.name)}">${layer.kind === "text" ? escapeXml(layer.text ?? "") : ""}</button>`
    : `    <div data-layer="${layer.id}" data-state="rest" aria-hidden="true">${layer.kind === "text" ? escapeXml(layer.text ?? "") : ""}</div>`)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)} — interactions</title>
<style>
body { margin: 0; font-family: system-ui, sans-serif; background: #1A1917; color: #F6F4F0; }
.scroller { height: 100vh; overflow-y: auto; }
.spacer { height: 60vh; display: grid; place-items: center; }
.motion { position: relative; width: ${doc.width}px; height: ${doc.height}px; max-width: 100%; margin: 0 auto; overflow: hidden; background: ${doc.background}; }
.motion button:focus-visible { outline: 3px solid #36C5BA; outline-offset: 3px; }
${base}
${stateRules.join("\n")}
@media (prefers-reduced-motion: reduce) {
  .motion [data-layer] { transition-duration: 0.01s !important; }
}
</style>
</head>
<body>
<div class="scroller" tabindex="0" aria-label="Scrollable page; arrow keys scroll">
  <div class="spacer">Scroll, or use the arrow keys</div>
  <div class="motion">
${markup}
  </div>
  <div class="spacer"></div>
</div>
<script>
const triggers = ${JSON.stringify(doc.triggers.map(({ id, on, state, layerId, keyboard, touch, returnOnEnd }) => ({ id, on, state, layerId, keyboard, touch, returnOnEnd })))};
const set = (id, state) => { const el = document.querySelector('[data-layer="' + id + '"]'); if (el) el.dataset.state = state; };
const get = (id) => document.querySelector('[data-layer="' + id + '"]')?.dataset.state;
const toggle = (id, state) => set(id, get(id) === state ? "rest" : state);
for (const t of triggers) {
  const el = document.querySelector('[data-layer="' + t.layerId + '"]');
  if (!el) continue;
  if (t.on === "load") requestAnimationFrame(() => set(t.layerId, t.state));
  if (t.on === "hover") {
    el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") set(t.layerId, t.state); });
    el.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && t.returnOnEnd !== false) set(t.layerId, "rest"); });
    if (t.keyboard === "Focus") { el.addEventListener("focus", () => set(t.layerId, t.state)); el.addEventListener("blur", () => { if (t.returnOnEnd !== false) set(t.layerId, "rest"); }); }
    if (t.touch) el.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") toggle(t.layerId, t.state); });
  }
  if (t.on === "click") {
    el.addEventListener("click", (e) => { if (e.detail > 0 || !t.keyboard) toggle(t.layerId, t.state); });
    if (t.keyboard) el.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === t.keyboard.toLowerCase() || (t.keyboard === "Space" && e.key === " ")) { e.preventDefault(); toggle(t.layerId, t.state); } });
  }
  if (t.on === "key" && t.keyboard) document.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === t.keyboard.toLowerCase()) toggle(t.layerId, t.state); });
  if (t.on === "scroll") new IntersectionObserver((entries) => { for (const entry of entries) set(t.layerId, entry.intersectionRatio >= 0.5 ? t.state : "rest"); }, { threshold: [0, 0.5, 1] }).observe(document.querySelector(".motion"));
}
</script>
</body>
</html>
`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ====================================================================== *
 * Compatibility: what each format can carry, declared before export.
 * ====================================================================== */

export type Support = "exact" | "approximated" | "unsupported";

export interface FeatureUse { id: string; label: string; layers: string[] }

export function featuresUsed(doc: MotionDoc): FeatureUse[] {
  const uses: FeatureUse[] = [];
  const add = (id: string, label: string, layer: string) => {
    const found = uses.find((item) => item.id === id);
    if (found) { if (!found.layers.includes(layer)) found.layers.push(layer); } else uses.push({ id, label, layers: [layer] });
  };
  for (const layer of doc.layers) {
    for (const [property, keyframes] of Object.entries(layer.tracks) as [AnimatableProperty, Keyframe[] | undefined][]) {
      if (!keyframes?.length) continue;
      if (["x", "y", "scale", "rotation"].includes(property)) add("transform", "Position, scale and rotation", layer.name);
      if (property === "opacity") add("opacity", "Opacity", layer.name);
      if (property === "colour") add("colour", "Colour", layer.name);
      if (property === "letterSpacing") add("letterSpacing", "Letter spacing", layer.name);
      if (property === "blur") add("blur", "Blur", layer.name);
      if (keyframes.some((keyframe) => keyframe.easing.kind === "spring")) add("spring", "Spring easing", layer.name);
      if (keyframes.some((keyframe) => keyframe.easing.kind === "bezier")) add("bezier", "Bezier easing", layer.name);
    }
    if (layer.kind === "text") add("text", "Live text", layer.name);
  }
  if (doc.triggers.length > 0) add("interaction", "Interactive triggers", `${doc.triggers.length} trigger(s)`);
  return uses;
}

const SUPPORT: Record<Exclude<ExportFormat, "json">, Record<string, { level: Support; note: string }>> = {
  css: {
    transform: { level: "exact", note: "" }, opacity: { level: "exact", note: "" }, colour: { level: "exact", note: "" },
    letterSpacing: { level: "exact", note: "" }, blur: { level: "exact", note: "filter: blur()" },
    spring: { level: "approximated", note: "Baked to one linear step per frame." }, bezier: { level: "exact", note: "" },
    text: { level: "exact", note: "Uses the viewer's installed font." },
    interaction: { level: "unsupported", note: "Triggers are exported from Interactive Motion as HTML." },
  },
  html: {
    transform: { level: "exact", note: "" }, opacity: { level: "exact", note: "" }, colour: { level: "exact", note: "" },
    letterSpacing: { level: "exact", note: "" }, blur: { level: "exact", note: "" },
    spring: { level: "approximated", note: "Baked to one linear step per frame." }, bezier: { level: "exact", note: "" },
    text: { level: "exact", note: "Uses the viewer's installed font." },
    interaction: { level: "unsupported", note: "Use the interaction export for triggers." },
  },
  svg: {
    transform: { level: "exact", note: "transform-box: fill-box" }, opacity: { level: "exact", note: "" }, colour: { level: "exact", note: "Animates fill." },
    letterSpacing: { level: "approximated", note: "Letter spacing on SVG text is ignored by some viewers." },
    blur: { level: "approximated", note: "CSS filter on SVG content is not drawn by every renderer." },
    spring: { level: "approximated", note: "Baked to one linear step per frame." }, bezier: { level: "exact", note: "" },
    text: { level: "approximated", note: "Text is not outlined; it uses the viewer's font." },
    interaction: { level: "unsupported", note: "An animated SVG image cannot take input." },
  },
  webm: {
    transform: { level: "exact", note: "Rendered to pixels." }, opacity: { level: "exact", note: "" }, colour: { level: "exact", note: "" },
    letterSpacing: { level: "exact", note: "" }, blur: { level: "exact", note: "" },
    spring: { level: "exact", note: "Sampled per frame." }, bezier: { level: "exact", note: "" },
    text: { level: "exact", note: "Rasterised with the font this browser has." },
    interaction: { level: "unsupported", note: "Video is linear." },
  },
  gif: {
    transform: { level: "exact", note: "Rendered to pixels." }, opacity: { level: "approximated", note: "GIF has one-bit transparency; opacity is composited onto the background." },
    colour: { level: "approximated", note: "Reduced to a fixed 252-colour palette." },
    letterSpacing: { level: "exact", note: "" }, blur: { level: "approximated", note: "Palette banding on soft edges." },
    spring: { level: "exact", note: "Sampled per frame." }, bezier: { level: "exact", note: "" },
    text: { level: "exact", note: "Rasterised." },
    interaction: { level: "unsupported", note: "GIF is linear." },
  },
  lottie: {
    transform: { level: "unsupported", note: "No Lottie writer in this build." }, opacity: { level: "unsupported", note: "" }, colour: { level: "unsupported", note: "" },
    letterSpacing: { level: "unsupported", note: "" }, blur: { level: "unsupported", note: "" }, spring: { level: "unsupported", note: "" },
    bezier: { level: "unsupported", note: "" }, text: { level: "unsupported", note: "" }, interaction: { level: "unsupported", note: "" },
  },
};

export function compatibility(doc: MotionDoc, format: ExportFormat): { feature: FeatureUse; level: Support; note: string }[] {
  if (format === "json") return featuresUsed(doc).map((feature) => ({ feature, level: "exact" as Support, note: "The composition itself." }));
  return featuresUsed(doc).map((feature) => ({ feature, ...(SUPPORT[format][feature.id] ?? { level: "unsupported" as Support, note: "" }) }));
}

/** What a Lottie file would need, said plainly rather than produced badly. */
export function lottieGaps(doc: MotionDoc): string[] {
  const gaps: string[] = [];
  if (doc.layers.some((layer) => layer.kind === "text")) gaps.push("Text layers in Lottie need glyph outlines or a font descriptor; neither is produced here.");
  if (doc.layers.some((layer) => Object.values(layer.tracks).some((keyframes) => (keyframes ?? []).some((keyframe) => keyframe.easing.kind === "spring")))) {
    gaps.push("Spring easing has no Lottie equivalent and would have to be baked to per-frame values.");
  }
  if (doc.layers.some((layer) => (layer.tracks.blur ?? []).length > 0)) gaps.push("Blur is a layer effect in Lottie, which this exporter does not write.");
  gaps.push("A valid Lottie file is a specific JSON schema with shape, transform and asset structures. Writing a partial one that a player rejects would be worse than not writing it.");
  return gaps;
}

/* ====================================================================== *
 * Editing helpers used by the editor's inspector and stage gestures.
 * ====================================================================== */

/**
 * Change a property. In animate mode (auto-key) the value is keyed at the
 * playhead. Otherwise the whole property moves: an animated track is offset
 * by the change, so its shape is kept; an unanimated position moves the box,
 * an unanimated colour changes the fill, and anything else becomes a single
 * static keyframe.
 */
export function editProperty(doc: MotionDoc, layerId: string, property: AnimatableProperty, value: number | string, time: number, animate: boolean): MotionDoc {
  const layer = doc.layers.find((item) => item.id === layerId);
  if (!layer || layer.locked) return doc;
  const track = layer.tracks[property] ?? [];
  if (animate) return setKeyframe(doc, layerId, property, time, value);
  if (track.length > 0) {
    const now = sampleTrack(track, time, propertyDefault(property, layer));
    if (typeof value === "string" || typeof now === "string") {
      return { ...doc, layers: doc.layers.map((item) => (item.id === layerId ? { ...item, tracks: { ...item.tracks, [property]: track.map((keyframe) => ({ ...keyframe, value })) } } : item)) };
    }
    const delta = value - now;
    return { ...doc, layers: doc.layers.map((item) => (item.id === layerId ? { ...item, tracks: { ...item.tracks, [property]: track.map((keyframe) => ({ ...keyframe, value: Number(keyframe.value) + delta })) } } : item)) };
  }
  if (property === "x" || property === "y") {
    return { ...doc, layers: doc.layers.map((item) => (item.id === layerId ? { ...item, box: { ...item.box, [property]: item.box[property] + Number(value) } } : item)) };
  }
  if (property === "colour") return { ...doc, layers: doc.layers.map((item) => (item.id === layerId ? { ...item, fill: String(value) } : item)) };
  return setKeyframe(doc, layerId, property, 0, value);
}

export interface MotionPreset {
  id: string;
  name: string;
  description: string;
  /** Keyframes relative to the start, as fractions of the preset duration. */
  tracks: Partial<Record<AnimatableProperty, { at: number; value: number | "base"; easing?: Easing }[]>>;
}

const OUT: Easing = { kind: "bezier", points: [0.2, 0, 0, 1] };
const IN_OUT: Easing = { kind: "bezier", points: [0.42, 0, 0.58, 1] };

export const MOTION_PRESETS: MotionPreset[] = [
  { id: "fade-in", name: "Fade in", description: "Opacity from 0 to full. The calmest entrance; safe for reduced motion.", tracks: { opacity: [{ at: 0, value: 0, easing: OUT }, { at: 1, value: 1 }] } },
  { id: "rise-in", name: "Rise in", description: "Fades in while rising 24px. Good for headlines.", tracks: { opacity: [{ at: 0, value: 0, easing: OUT }, { at: 0.7, value: 1 }], y: [{ at: 0, value: 24, easing: OUT }, { at: 1, value: 0 }] } },
  { id: "slide-left", name: "Slide from the left", description: "Travels 120px from the left with an emphasised ease.", tracks: { x: [{ at: 0, value: -120, easing: OUT }, { at: 1, value: 0 }], opacity: [{ at: 0, value: 0, easing: OUT }, { at: 0.5, value: 1 }] } },
  { id: "pop", name: "Pop", description: "Scales from 60% with a small overshoot.", tracks: { scale: [{ at: 0, value: 0.6, easing: { kind: "bezier", points: [0.34, 1.56, 0.64, 1] } }, { at: 1, value: 1 }], opacity: [{ at: 0, value: 0, easing: OUT }, { at: 0.4, value: 1 }] } },
  { id: "settle", name: "Spring settle", description: "Drops 40px into place on a spring.", tracks: { y: [{ at: 0, value: -40, easing: { kind: "spring", spring: { stiffness: 180, damping: 14, mass: 1 } } }, { at: 1, value: 0 }] } },
  { id: "spin-in", name: "Spin in", description: "A quarter turn into place.", tracks: { rotation: [{ at: 0, value: -90, easing: OUT }, { at: 1, value: 0 }], opacity: [{ at: 0, value: 0, easing: OUT }, { at: 0.5, value: 1 }] } },
  { id: "pulse", name: "Pulse", description: "Grows 6% and back. Loops cleanly.", tracks: { scale: [{ at: 0, value: 1, easing: IN_OUT }, { at: 0.5, value: 1.06, easing: IN_OUT }, { at: 1, value: 1 }] } },
  { id: "blur-in", name: "Focus in", description: "Comes out of a 12px blur.", tracks: { blur: [{ at: 0, value: 12, easing: OUT }, { at: 1, value: 0 }], opacity: [{ at: 0, value: 0, easing: OUT }, { at: 0.6, value: 1 }] } },
];

/** Write a preset's keyframes onto a layer, starting at a time. They are ordinary keyframes. */
export function applyPreset(doc: MotionDoc, layerId: string, preset: MotionPreset, start: number, duration: number): MotionDoc {
  let next = doc;
  const layer = doc.layers.find((item) => item.id === layerId);
  if (!layer) return doc;
  for (const [property, points] of Object.entries(preset.tracks) as [AnimatableProperty, { at: number; value: number | "base"; easing?: Easing }[]][]) {
    for (const point of points) {
      const value = point.value === "base" ? propertyDefault(property, layer) : point.value;
      next = setKeyframe(next, layerId, property, clamp(start + point.at * duration, 0, doc.duration), value, point.easing ?? { kind: "bezier", points: [0.25, 0.1, 0.25, 1] });
      if (point.easing) {
        const written = next.layers.find((item) => item.id === layerId)?.tracks[property]?.find((keyframe) => Math.abs(keyframe.t - Math.round(clamp(start + point.at * duration, 0, doc.duration) * doc.fps) / doc.fps) < 1e-6);
        if (written) next = setEasing(next, layerId, property, written.id, point.easing);
      }
    }
  }
  return next;
}
