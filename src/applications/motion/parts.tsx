import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Pill } from "@/design-system";
import { clamp } from "@/applications/visual/geometry";
import { dragPointer, useMeasure, useStore, type DocHandle } from "@/applications/visual/kit";
import {
  NUMERIC_PROPERTIES, easeAt, keyframeCount, moveKeyframe, propertyDefault, removeKeyframe, sampleAll, sampleLayer, sampleTrack, setKeyframe,
  type AnimatableProperty, type Easing, type MotionDoc, type MotionLayer, type SampledLayer,
} from "./anim";
import { motionUi, setMotionTime } from "./model";

/* ====================================================================== *
 * The stage: every visible layer sampled at the current time.
 * ====================================================================== */

/** Translate to the box, then rotate and scale about the box centre — the same order the CSS export uses. */
export function layerTransform(sampled: SampledLayer): string {
  const { layer } = sampled;
  const cx = layer.box.w / 2;
  const cy = layer.box.h / 2;
  return `translate(${layer.box.x + sampled.x} ${layer.box.y + sampled.y}) translate(${cx} ${cy}) rotate(${sampled.rotation}) scale(${sampled.scale}) translate(${-cx} ${-cy})`;
}

export function LayerShape({ sampled, muted, selected, missing }: { sampled: SampledLayer; muted?: number; selected?: boolean; missing?: boolean }) {
  const { layer } = sampled;
  const opacity = muted ?? sampled.opacity;
  const filter = sampled.blur > 0 ? `blur(${sampled.blur}px)` : undefined;
  return (
    <g transform={layerTransform(sampled)} opacity={opacity} style={{ filter }} data-layer={layer.id}>
      {layer.kind === "ellipse" && <ellipse cx={layer.box.w / 2} cy={layer.box.h / 2} rx={layer.box.w / 2} ry={layer.box.h / 2} fill={sampled.colour} />}
      {layer.kind === "rect" && <rect width={layer.box.w} height={layer.box.h} rx={layer.radius ?? 0} fill={sampled.colour} />}
      {layer.kind === "path" && layer.path && <path d={layer.path} fill={sampled.colour} />}
      {layer.kind === "text" && (
        <text
          x={layer.textStyle?.align === "center" ? layer.box.w / 2 : 0}
          y={(layer.textStyle?.size ?? 48) * 0.82}
          textAnchor={layer.textStyle?.align === "center" ? "middle" : layer.textStyle?.align === "end" ? "end" : "start"}
          fontFamily={layer.textStyle?.family ?? "Inter"}
          fontSize={layer.textStyle?.size ?? 48}
          fontWeight={layer.textStyle?.weight ?? 700}
          letterSpacing={sampled.letterSpacing}
          fill={sampled.colour}
        >
          {layer.text}
        </text>
      )}
      {missing && (
        <rect width={layer.box.w} height={layer.box.h} fill="none" strokeWidth={2} strokeDasharray="6 4" style={{ stroke: "var(--warning)" }} />
      )}
      {selected && (
        <rect
          x={-3} y={-3} width={layer.box.w + 6} height={layer.box.h + 6}
          fill="none" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none"
          style={{ stroke: "var(--accent)" }}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

/**
 * The time the reduced-motion alternative shows: the first frame for a
 * static alternative, the final frame (faded in) for a cross-fade.
 */
export function reducedFrame(doc: MotionDoc, time: number): { time: number; fade: number } {
  if (doc.reducedMotion.strategy === "static-first-frame") return { time: 0, fade: 1 };
  if (doc.reducedMotion.strategy === "cross-fade") return { time: doc.duration, fade: Math.min(1, time / 0.4) };
  return { time, fade: 1 };
}

export function Stage({
  doc, time, height = 320, onion = false, selectedId, onSelect, reduced = false, missingIds, label, onLayerPointerDown,
}: {
  doc: MotionDoc; time: number; height?: number | string; onion?: boolean;
  selectedId?: string; onSelect?: (id: string) => void; reduced?: boolean; missingIds?: string[]; label?: string;
  onLayerPointerDown?: (id: string, event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const alternative = reduced ? reducedFrame(doc, time) : { time, fade: 1 };
  const effective = alternative.time;
  const sampled = useMemo(() => sampleAll(doc, effective), [doc, effective]);
  const onionFrames = useMemo(() => {
    if (!onion) return [] as { time: number; layers: SampledLayer[] }[];
    const step = 1 / doc.fps;
    const out: { time: number; layers: SampledLayer[] }[] = [];
    for (let index = doc.onionSkin.before; index > 0; index -= 1) {
      const at = effective - index * step * 4;
      if (at >= 0) out.push({ time: at, layers: sampleAll(doc, at) });
    }
    for (let index = 1; index <= doc.onionSkin.after; index += 1) {
      const at = effective + index * step * 4;
      if (at <= doc.duration) out.push({ time: at, layers: sampleAll(doc, at) });
    }
    return out;
  }, [onion, doc, effective]);

  return (
    <svg
      viewBox={`0 0 ${doc.width} ${doc.height}`}
      role={onSelect ? "group" : "img"}
      aria-label={label ?? `Composition at ${effective.toFixed(2)} seconds, ${sampled.length} layers${reduced ? ", reduced-motion alternative" : ""}`}
      data-testid="motion-stage"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height, background: doc.background, borderRadius: 8, opacity: alternative.fade }}
    >
      {onionFrames.map((frame, index) => (
        <g key={index} opacity={doc.onionSkin.opacity} aria-hidden="true">
          {frame.layers.map((item) => <LayerShape key={`${item.layer.id}-${index}`} sampled={item} muted={doc.onionSkin.opacity * item.opacity} />)}
        </g>
      ))}
      {sampled.map((item) => (
        <g
          key={item.layer.id}
          onPointerDown={onSelect ? (event) => { onSelect(item.layer.id); onLayerPointerDown?.(item.layer.id, event); } : undefined}
          style={{ cursor: onLayerPointerDown ? (item.layer.locked ? "not-allowed" : "move") : onSelect ? "pointer" : "default" }}
        >
          <LayerShape sampled={item} selected={selectedId === item.layer.id} missing={Boolean(missingIds?.includes(item.layer.id))} />
        </g>
      ))}
    </svg>
  );
}

/* ====================================================================== *
 * The keyframe timeline.
 * ====================================================================== */

export function KeyframeTimeline({ handle, height = 230, onOpenKeyframe }: { handle: DocHandle<MotionDoc>; height?: number; onOpenKeyframe?: () => void }) {
  const ui = useStore(motionUi);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const doc = handle.doc;
  const pxPerSecond = useMemo(() => Math.max(40, ((size.width || 600) - 180) / Math.max(doc?.duration ?? 1, 0.5)) * ui.zoom, [size.width, doc?.duration, ui.zoom]);
  if (!doc) return null;

  const rows = doc.layers.flatMap((layer) => {
    const properties = (Object.keys(layer.tracks) as AnimatableProperty[]).filter((property) => (layer.tracks[property] ?? []).length > 0);
    return [{ layer, property: undefined as AnimatableProperty | undefined }, ...properties.map((property) => ({ layer, property }))];
  });

  const scrubFrom = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setMotionTime(clamp((clientX - rect.left) / pxPerSecond, 0, doc.duration), doc.fps);
  };

  return (
    <div style={{ height, overflowY: "auto" }}>
    <div ref={frameRef} className="vx-tl">
      <div className="vx-tl-gutter">
        <div className="vx-tl-ruler"><span className="ds-num" style={{ paddingInlineStart: 6, fontSize: 10, lineHeight: "24px" }}>{ui.time.toFixed(2)}s</span></div>
        {rows.map((row, index) => (
          <div key={`${row.layer.id}-${row.property ?? "head"}-${index}`} className="vx-tl-rowhead" style={{ height: 28, paddingInlineStart: row.property ? 18 : 8 }}>
            <button
              type="button"
              className="ds-grow ds-truncate"
              style={{ background: "none", textAlign: "start", fontWeight: row.property ? 400 : 650, color: ui.selectedLayerId === row.layer.id ? "var(--accent-soft-fg)" : "inherit" }}
              onClick={() => motionUi.set((current) => ({ ...current, selectedLayerId: row.layer.id, selectedProperty: row.property ?? current.selectedProperty }))}
            >
              {row.property ?? row.layer.name}
            </button>
            {!row.property && (
              <button
                type="button"
                className="vx-node-btn"
                aria-label={`${row.layer.visible ? "Hide" : "Show"} ${row.layer.name}`}
                aria-pressed={!row.layer.visible}
                onClick={() => handle.edit((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === row.layer.id ? { ...layer, visible: !layer.visible } : layer)) }), "Toggle the layer")}
              >
                {row.layer.visible ? "●" : "○"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="vx-tl-scroll">
        <div style={{ width: Math.max(320, doc.duration * pxPerSecond), position: "relative" }}>
          <div
            className="vx-tl-ruler"
            role="slider"
            tabIndex={0}
            aria-label="Time"
            aria-valuemin={0}
            aria-valuemax={Math.round(doc.duration * doc.fps)}
            aria-valuenow={Math.round(ui.time * doc.fps)}
            aria-valuetext={`${ui.time.toFixed(2)} seconds`}
            style={{ cursor: "col-resize" }}
            onPointerDown={(event) => {
              const element = event.currentTarget;
              motionUi.set((current) => ({ ...current, playing: false }));
              scrubFrom(event.clientX, element);
              dragPointer(event, { move: (point) => scrubFrom(point.x, element) });
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 / doc.fps : 1 / doc.fps;
              if (event.key === "ArrowLeft") { event.preventDefault(); setMotionTime(ui.time - step, doc.fps); }
              if (event.key === "ArrowRight") { event.preventDefault(); setMotionTime(ui.time + step, doc.fps); }
              if (event.key === "Home") { event.preventDefault(); setMotionTime(0, doc.fps); }
              if (event.key === "End") { event.preventDefault(); setMotionTime(doc.duration, doc.fps); }
            }}
          >
            {Array.from({ length: Math.ceil(doc.duration * 2) + 1 }, (_, index) => index / 2).map((second) => (
              <span key={second} className="vx-tl-tick ds-num" style={{ insetInlineStart: second * pxPerSecond }}>{second.toFixed(1)}</span>
            ))}
          </div>

          {rows.map((row, index) => (
            <div
              key={`${row.layer.id}-${row.property ?? "head"}-${index}`}
              className="vx-tl-row"
              style={{ height: 28 }}
              title={row.property ? "Double-click to add a keyframe here" : undefined}
              onDoubleClick={row.property && !row.layer.locked ? (event) => {
                if ((event.target as HTMLElement).closest(".vx-key")) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const property = row.property!;
                const t = Math.round(clamp((event.clientX - rect.left) / pxPerSecond, 0, doc.duration) * doc.fps) / doc.fps;
                const value = sampleTrack(row.layer.tracks[property], t, property === "colour" ? row.layer.fill : propertyDefault(property, row.layer));
                handle.edit((current) => setKeyframe(current, row.layer.id, property, t, value), "Add a keyframe");
                const made = `kf-${row.layer.id}-${property}-${Math.round(t * 1000)}`;
                const existing = (row.layer.tracks[property] ?? []).find((keyframe) => Math.abs(keyframe.t - t) < 0.5 / doc.fps);
                motionUi.set((current) => ({ ...current, time: t, selectedLayerId: row.layer.id, selectedProperty: property, selectedKeyframeId: existing?.id ?? made }));
              } : undefined}
            >
              {row.property && (row.layer.tracks[row.property] ?? []).map((keyframe) => (
                <button
                  key={keyframe.id}
                  type="button"
                  className="vx-key"
                  data-selected={ui.selectedKeyframeId === keyframe.id || undefined}
                  style={{ insetInlineStart: keyframe.t * pxPerSecond, top: 8 }}
                  aria-label={`${row.layer.name} ${row.property} keyframe at ${keyframe.t.toFixed(2)} seconds, value ${keyframe.value}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    motionUi.set((current) => ({ ...current, selectedLayerId: row.layer.id, selectedProperty: row.property, selectedKeyframeId: keyframe.id }));
                    const start = keyframe.t;
                    dragPointer(event, {
                      move: (point, _modifiers, origin) => {
                        const delta = (point.x - origin.x) / pxPerSecond;
                        handle.live((current) => moveKeyframe(current, row.layer.id, row.property!, keyframe.id, start + delta));
                      },
                      end: (moved) => { if (moved) handle.beginGesture(); },
                    });
                  }}
                  onFocus={() => motionUi.set((current) => ({ ...current, selectedLayerId: row.layer.id, selectedProperty: row.property, selectedKeyframeId: keyframe.id }))}
                  onDoubleClick={() => onOpenKeyframe?.()}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 5 / doc.fps : 1 / doc.fps;
                    if (event.key === "ArrowLeft") { event.preventDefault(); handle.edit((current) => moveKeyframe(current, row.layer.id, row.property!, keyframe.id, keyframe.t - step), "Move the keyframe"); }
                    if (event.key === "ArrowRight") { event.preventDefault(); handle.edit((current) => moveKeyframe(current, row.layer.id, row.property!, keyframe.id, keyframe.t + step), "Move the keyframe"); }
                    if (event.key === "Enter") { event.preventDefault(); onOpenKeyframe?.(); }
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      handle.edit((current) => removeKeyframe(current, row.layer.id, row.property!, keyframe.id), "Delete the keyframe");
                      motionUi.set((current) => ({ ...current, selectedKeyframeId: undefined }));
                    }
                  }}
                />
              ))}
              {!row.property && (() => {
                const times = Object.values(row.layer.tracks).flatMap((keyframes) => (keyframes ?? []).map((keyframe) => keyframe.t));
                if (times.length === 0) return null;
                const from = Math.min(...times);
                const to = Math.max(...times);
                return (
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", insetBlock: 10, insetInlineStart: from * pxPerSecond, width: Math.max(3, (to - from) * pxPerSecond), background: "var(--accent-soft)", borderRadius: 3 }}
                  />
                );
              })()}
            </div>
          ))}

          <div className="vx-playhead" style={{ insetInlineStart: ui.time * pxPerSecond }} />
        </div>
      </div>
    </div>
    </div>
  );
}

/* ====================================================================== *
 * The easing graph: the curve, draggable, with the sampled value on it.
 * ====================================================================== */

export function EasingGraph({
  easing, onChange, onCommit, size = 230, progress, label = "Easing curve",
}: {
  easing: Easing;
  onChange: (next: Easing) => void;
  /** Called once a drag ends or a key moves a handle, so the change becomes one undo step. */
  onCommit?: () => void;
  size?: number;
  progress?: number;
  label?: string;
}) {
  const points = easing.points ?? [0.25, 0.1, 0.25, 1];
  const curve = useMemo(() => {
    const parts: string[] = [];
    for (let step = 0; step <= 80; step += 1) {
      const t = step / 80;
      const value = easeAt(easing, t);
      parts.push(`${step === 0 ? "M" : "L"} ${(t * size).toFixed(1)} ${(size - value * size).toFixed(1)}`);
    }
    return parts.join(" ");
  }, [easing, size]);

  const write = (index: 0 | 1, x: number, y: number) => {
    const next: [number, number, number, number] = [...points] as [number, number, number, number];
    next[index * 2] = Math.round(clamp(x, 0, 1) * 1000) / 1000;
    next[index * 2 + 1] = Math.round(clamp(y, -0.6, 1.6) * 1000) / 1000;
    onChange({ kind: "bezier", points: next });
  };

  const dragHandle = (index: 0 | 1) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    (event.currentTarget as SVGCircleElement).focus();
    dragPointer(event as unknown as ReactPointerEvent, {
      move: (point) => {
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const local = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
        write(index, local.x / size, 1 - local.y / size);
      },
      end: (moved) => { if (moved) onCommit?.(); },
    });
  };

  const keyHandle = (index: 0 | 1) => (event: React.KeyboardEvent<SVGCircleElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const x = points[index * 2];
    const y = points[index * 2 + 1];
    if (event.key === "ArrowLeft") write(index, x - step, y);
    else if (event.key === "ArrowRight") write(index, x + step, y);
    else if (event.key === "ArrowUp") write(index, x, y + step);
    else if (event.key === "ArrowDown") write(index, x, y - step);
    else return;
    event.preventDefault();
    onCommit?.();
  };

  const editable = easing.kind === "bezier";
  return (
    <svg
      viewBox={`-20 -60 ${size + 40} ${size + 110}`}
      role="group"
      aria-label={`${label}: ${easing.kind}${editable ? `, cubic-bezier(${points.join(", ")})` : ""}`}
      data-testid="easing-graph"
      style={{ width: "100%", maxWidth: 420, background: "var(--graphite-900)", borderRadius: 8, touchAction: "none", display: "block" }}
    >
      <rect x={0} y={0} width={size} height={size} fill="rgba(255,255,255,0.04)" />
      {[0.25, 0.5, 0.75].map((fraction) => (
        <g key={fraction}>
          <line x1={size * fraction} y1={0} x2={size * fraction} y2={size} stroke="rgba(255,255,255,0.1)" />
          <line x1={0} y1={size * fraction} x2={size} y2={size * fraction} stroke="rgba(255,255,255,0.1)" />
        </g>
      ))}
      <line x1={0} y1={size} x2={size} y2={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
      <path d={curve} fill="none" strokeWidth={2.4} style={{ stroke: "var(--cobalt-300)" }} />
      {editable && (
        <>
          <line x1={0} y1={size} x2={points[0] * size} y2={size - points[1] * size} strokeWidth={1} style={{ stroke: "var(--papaya-400)" }} />
          <line x1={size} y1={0} x2={points[2] * size} y2={size - points[3] * size} strokeWidth={1} style={{ stroke: "var(--papaya-400)" }} />
          {([0, 1] as const).map((index) => (
            <circle
              key={index}
              className="mo-handle"
              cx={points[index * 2] * size}
              cy={size - points[index * 2 + 1] * size}
              r={9}
              tabIndex={0}
              role="slider"
              aria-label={`Control point ${index + 1}. Arrow keys move it, Shift for larger steps.`}
              aria-valuetext={`x ${points[index * 2]}, y ${points[index * 2 + 1]}`}
              aria-valuenow={points[index * 2 + 1]}
              aria-valuemin={-0.6}
              aria-valuemax={1.6}
              data-testid={`easing-handle-${index + 1}`}
              style={{ fill: "var(--papaya-400)", cursor: "grab" }}
              onPointerDown={dragHandle(index)}
              onKeyDown={keyHandle(index)}
            />
          ))}
        </>
      )}
      {progress !== undefined && progress >= 0 && progress <= 1 && (
        <circle cx={progress * size} cy={size - easeAt(easing, progress) * size} r={5} strokeWidth={2} style={{ fill: "var(--aqua-400)", stroke: "var(--graphite-900)" }} />
      )}
      <text x={0} y={size + 22} fontSize={11} fill="rgba(255,255,255,0.7)">time →</text>
      <text x={-6} y={-8} fontSize={11} fill="rgba(255,255,255,0.7)">value ↑</text>
    </svg>
  );
}

/* ====================================================================== *
 * Easing preview: a ball travelling under the curve against a linear one.
 * ====================================================================== */

export function EasingPreview({ easing, seconds, fps, autoPlay }: { easing: Easing; seconds: number; fps: number; autoPlay: boolean }) {
  const [playing, setPlaying] = useState(autoPlay);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const span = Math.max(0.1, seconds);
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now();
    let last = -1;
    const tick = (now: number) => {
      /* The move, then a short hold at the end, then again. */
      const elapsed = ((now - origin) / 1000) % (span + 0.4);
      const frame = Math.floor(elapsed * fps);
      if (frame !== last) { last = frame; setProgress(Math.min(1, elapsed / span)); }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, span, fps]);
  const eased = easeAt(easing, progress);
  const lane = (value: number, tone: string, label: string) => (
    <div className="mo-ease-lane" aria-hidden="true">
      <span className="vx-mini mo-ease-label">{label}</span>
      <span className="mo-ease-ball" style={{ insetInlineStart: `calc(${clamp(value, -0.2, 1.2) * 100}% - 7px)`, background: tone }} />
    </div>
  );
  return (
    <div className="mo-ease" data-testid="easing-preview">
      {lane(eased, "var(--aqua-400)", "eased")}
      {lane(progress, "var(--paper-300)", "linear")}
      <div className="ds-row ds-gap-2" style={{ alignItems: "center" }}>
        <Button size="sm" variant="ghost" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>{playing ? "Pause the preview" : "Play the preview"}</Button>
        <span className="vx-mini ds-num">{span.toFixed(2)}s · value {eased.toFixed(2)} at {(progress * 100).toFixed(0)}% of the time</span>
      </div>
    </div>
  );
}

/* ====================================================================== *
 * Playback at the real frame rate.
 * ====================================================================== */

/**
 * Playback at the composition's own frame rate. Time comes from the wall
 * clock, and the stage only advances when a whole frame has elapsed, so a
 * 12 fps composition really plays at 12 frames a second on any display.
 */
export function useMotionPlayback(doc: MotionDoc | null): { fps: number } {
  const ui = useStore(motionUi);
  const raf = useRef(0);
  const frames = useRef<number[]>([]);
  const [measured, setMeasured] = useState(0);
  const duration = doc?.duration ?? 0;
  const fps = doc?.fps ?? 30;
  const loop = doc?.loop ?? false;

  useEffect(() => {
    if (!ui.playing || duration <= 0) return;
    let origin = performance.now() - motionUi.get().time * 1000;
    let lastFrame = -1;
    frames.current = [];
    const tick = (now: number) => {
      let elapsed = (now - origin) / 1000;
      if (elapsed >= duration) {
        if (loop) {
          origin = now;
          elapsed = 0;
        } else {
          motionUi.set((current) => ({ ...current, time: duration, playing: false }));
          return;
        }
      }
      const frame = Math.floor(elapsed * fps);
      if (frame !== lastFrame) {
        lastFrame = frame;
        frames.current.push(now);
        while (frames.current.length > 1 && now - frames.current[0] > 1000) frames.current.shift();
        motionUi.set((current) => ({ ...current, time: frame / fps }));
        if (frame % fps === 0) setMeasured(frames.current.length);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [ui.playing, duration, fps, loop]);

  return { fps: ui.playing ? measured : 0 };
}

export function TransportRow({ doc, fps, handle }: { doc: MotionDoc; fps: number; handle?: DocHandle<MotionDoc> }) {
  const ui = useStore(motionUi);
  return (
    <div className="ds-row ds-gap-2 ds-wrap" style={{ alignItems: "center" }}>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Go to the start" onClick={() => setMotionTime(0, doc.fps)}>⏮</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Back one frame" onClick={() => setMotionTime(ui.time - 1 / doc.fps, doc.fps)}>◀|</button>
      <button
        type="button"
        className="ds-btn"
        data-variant={ui.playing ? "primary" : "secondary"}
        data-size="sm"
        data-testid="motion-play"
        onClick={() => motionUi.set((current) => ({ ...current, playing: !current.playing, time: !current.playing && current.time >= doc.duration - 1e-6 ? 0 : current.time }))}
      >
        {ui.playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Forward one frame" onClick={() => setMotionTime(ui.time + 1 / doc.fps, doc.fps)}>|▶</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Go to the end" onClick={() => setMotionTime(doc.duration, doc.fps)}>⏭</button>
      {handle && (
        <button
          type="button"
          className="ds-btn"
          data-variant={doc.loop ? "primary" : "ghost"}
          data-size="sm"
          aria-pressed={doc.loop}
          title="Loop playback, and loop in the exported CSS, SVG and GIF"
          onClick={() => handle.edit((current) => ({ ...current, loop: !current.loop }), doc.loop ? "Stop looping" : "Loop the composition")}
        >
          Loop
        </button>
      )}
      <Pill tone="info"><span className="ds-num">{ui.time.toFixed(2)}s</span></Pill>
      <Pill><span className="ds-num">frame {Math.round(ui.time * doc.fps)} / {Math.round(doc.duration * doc.fps)}</span></Pill>
      {ui.playing && fps > 0 && <Pill tone={fps >= doc.fps - 4 ? "success" : "warning"}><span className="ds-num">{fps} fps measured</span></Pill>}
      <Pill tone="neutral"><span className="ds-num">{keyframeCount(doc)} keyframes</span></Pill>
    </div>
  );
}

export { NUMERIC_PROPERTIES, sampleLayer };
export type { MotionLayer };
