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
}

export interface Trigger {
  id: string;
  /** What starts it. */
  on: "load" | "hover" | "click" | "scroll" | "key";
  /** Which state it moves to. */
  state: string;
  layerId: string;
  /** Keyboard and touch equivalents, which the accessibility check requires. */
  keyboard?: string;
  touch?: boolean;
  note: string;
}

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
  states: { id: string; name: string }[];
  onionSkin: { before: number; after: number; opacity: number };
  loop: boolean;
  /** Reduced-motion alternative, which every export must declare. */
  reducedMotion: { strategy: "cross-fade" | "static-first-frame" | "none"; note: string };
  renders: { id: string; at: string; by: string; format: string; state: string; artifact?: string; bytes?: number; note: string }[];
  activeLayerId?: string;
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
 * Export
 * ====================================================================== */

function cssEasing(easing: Easing): string {
  if (easing.kind === "linear") return "linear";
  if (easing.kind === "hold") return "steps(1, end)";
  if (easing.kind === "spring") return "cubic-bezier(0.34, 1.3, 0.64, 1)";
  const [x1, y1, x2, y2] = easing.points ?? [0.25, 0.1, 0.25, 1];
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

function percent(time: number, duration: number): string {
  return `${((time / Math.max(duration, 0.001)) * 100).toFixed(3)}%`;
}

/**
 * Real CSS keyframes. Where a segment uses a non-default easing the CSS
 * carries `animation-timing-function` inside that keyframe, which is how
 * CSS applies per-segment easing.
 */
export function toCss(doc: MotionDoc, selectorPrefix = ".motion"): string {
  const blocks: string[] = [];
  const rules: string[] = [];
  const notes: string[] = [];

  for (const layer of doc.layers) {
    const times = [...new Set(Object.values(layer.tracks).flatMap((keyframes) => (keyframes ?? []).map((keyframe) => keyframe.t)))].sort((a, b) => a - b);
    if (times.length === 0) continue;
    const name = `kf-${layer.id}`;
    const steps = times.map((time) => {
      const sampled = sampleLayer(layer, time);
      const easingSource = Object.values(layer.tracks).flat().find((keyframe) => keyframe && Math.abs(keyframe.t - time) < 1e-6);
      const timing = easingSource ? `\n    animation-timing-function: ${cssEasing(easingSource.easing)};` : "";
      if (easingSource?.easing.kind === "spring") notes.push(`${layer.name}: the spring on this segment is approximated by a cubic bezier in CSS, which cannot express a spring.`);
      const filter = sampled.blur > 0 ? `\n    filter: blur(${sampled.blur.toFixed(2)}px);` : "";
      return `  ${percent(time, doc.duration)} {
    transform: translate(${sampled.x.toFixed(2)}px, ${sampled.y.toFixed(2)}px) scale(${sampled.scale.toFixed(4)}) rotate(${sampled.rotation.toFixed(2)}deg);
    opacity: ${sampled.opacity.toFixed(3)};
    color: ${sampled.colour};
    letter-spacing: ${sampled.letterSpacing.toFixed(2)}px;${filter}${timing}
  }`;
    });
    blocks.push(`@keyframes ${name} {\n${steps.join("\n")}\n}`);
    rules.push(`${selectorPrefix} [data-layer="${layer.id}"] {
  animation: ${name} ${doc.duration}s ${doc.loop ? "infinite" : "1"} both;
  will-change: transform, opacity;
}`);
  }

  const reduced = doc.reducedMotion.strategy === "static-first-frame"
    ? `@media (prefers-reduced-motion: reduce) {
  ${selectorPrefix} [data-layer] { animation: none !important; }
}`
    : doc.reducedMotion.strategy === "cross-fade"
      ? `@media (prefers-reduced-motion: reduce) {
  ${selectorPrefix} [data-layer] { animation: motion-fade 0.4s ease both !important; }
}
@keyframes motion-fade { from { opacity: 0 } to { opacity: 1 } }`
      : `/* No reduced-motion alternative is declared. A person with prefers-reduced-motion
   set will see the full animation, which this file does not hide. */`;

  const noteBlock = notes.length ? `\n/* ${[...new Set(notes)].join("\n   ")} */\n` : "";
  return `/* ${doc.layers.length} layers, ${keyframeCount(doc)} keyframes, ${doc.duration}s at ${doc.fps} fps.
   Generated from the composition. Values are sampled from the same curves
   the stage plays, at every keyframe time. */
${noteBlock}
${blocks.join("\n\n")}

${rules.join("\n\n")}

${reduced}
`;
}

/** SMIL animation inside the SVG, which plays without any CSS or script. */
export function toSvgAnimation(doc: MotionDoc): string {
  const body = doc.layers.filter((layer) => layer.visible).map((layer) => {
    const times = [...new Set(Object.values(layer.tracks).flatMap((keyframes) => (keyframes ?? []).map((keyframe) => keyframe.t)))].sort((a, b) => a - b);
    const shape = layer.kind === "ellipse"
      ? `<ellipse cx="${layer.box.w / 2}" cy="${layer.box.h / 2}" rx="${layer.box.w / 2}" ry="${layer.box.h / 2}" fill="${layer.fill}"/>`
      : layer.kind === "text"
        ? `<text x="0" y="${(layer.textStyle?.size ?? 48) * 0.8}" font-family="${layer.textStyle?.family ?? "Inter"}" font-size="${layer.textStyle?.size ?? 48}" font-weight="${layer.textStyle?.weight ?? 700}" fill="${layer.fill}">${escapeXml(layer.text ?? "")}</text>`
        : `<rect width="${layer.box.w}" height="${layer.box.h}" rx="${layer.radius ?? 0}" fill="${layer.fill}"/>`;
    if (times.length === 0) {
      return `<g transform="translate(${layer.box.x} ${layer.box.y})">${shape}</g>`;
    }
    const keyTimes = times.map((time) => (time / Math.max(doc.duration, 0.001)).toFixed(4)).join(";");
    const transforms = times.map((time) => {
      const sampled = sampleLayer(layer, time);
      return `${(layer.box.x + sampled.x).toFixed(2)} ${(layer.box.y + sampled.y).toFixed(2)}`;
    }).join(";");
    const opacities = times.map((time) => sampleLayer(layer, time).opacity.toFixed(3)).join(";");
    const scales = times.map((time) => sampleLayer(layer, time).scale.toFixed(4)).join(";");
    return `<g>
  <animateTransform attributeName="transform" type="translate" values="${transforms}" keyTimes="${keyTimes}" dur="${doc.duration}s" repeatCount="${doc.loop ? "indefinite" : "1"}" fill="freeze" additive="replace"/>
  <g>
    <animate attributeName="opacity" values="${opacities}" keyTimes="${keyTimes}" dur="${doc.duration}s" repeatCount="${doc.loop ? "indefinite" : "1"}" fill="freeze"/>
    <animateTransform attributeName="transform" type="scale" values="${scales}" keyTimes="${keyTimes}" dur="${doc.duration}s" repeatCount="${doc.loop ? "indefinite" : "1"}" fill="freeze" additive="sum"/>
    ${shape}
  </g>
</g>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">
<rect width="${doc.width}" height="${doc.height}" fill="${doc.background}"/>
${body}
</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
