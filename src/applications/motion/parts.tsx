import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Pill } from "@/design-system";
import { clamp } from "@/applications/visual/geometry";
import { dragPointer, useMeasure, useStore, type DocHandle } from "@/applications/visual/kit";
import {
  NUMERIC_PROPERTIES, easeAt, keyframeCount, moveKeyframe, sampleAll, sampleLayer,
  type AnimatableProperty, type Easing, type MotionDoc, type MotionLayer, type SampledLayer,
} from "./anim";
import { motionUi, setMotionTime } from "./model";

/* ====================================================================== *
 * The stage: every visible layer sampled at the current time.
 * ====================================================================== */

function LayerShape({ sampled, muted }: { sampled: SampledLayer; muted?: number }) {
  const { layer } = sampled;
  const transform = `translate(${layer.box.x + sampled.x} ${layer.box.y + sampled.y}) rotate(${sampled.rotation} ${layer.box.w / 2} ${layer.box.h / 2}) scale(${sampled.scale})`;
  const opacity = muted ?? sampled.opacity;
  const filter = sampled.blur > 0 ? `blur(${sampled.blur}px)` : undefined;
  return (
    <g transform={transform} opacity={opacity} style={{ filter }} data-layer={layer.id}>
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
    </g>
  );
}

export function Stage({
  doc, time, height = 320, onion = false, selectedId, onSelect, reduced = false,
}: {
  doc: MotionDoc; time: number; height?: number; onion?: boolean;
  selectedId?: string; onSelect?: (id: string) => void; reduced?: boolean;
}) {
  const effective = reduced ? (doc.reducedMotion.strategy === "static-first-frame" ? 0 : doc.duration) : time;
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
      role="img"
      aria-label={`Composition at ${effective.toFixed(2)} seconds, ${sampled.length} layers`}
      data-testid="motion-stage"
      style={{ display: "block", width: "100%", height, background: doc.background, borderRadius: 8 }}
    >
      {onionFrames.map((frame, index) => (
        <g key={index} opacity={doc.onionSkin.opacity} aria-hidden="true">
          {frame.layers.map((item) => <LayerShape key={`${item.layer.id}-${index}`} sampled={item} muted={doc.onionSkin.opacity * item.opacity} />)}
        </g>
      ))}
      {sampled.map((item) => (
        <g key={item.layer.id} onPointerDown={onSelect ? () => onSelect(item.layer.id) : undefined} style={{ cursor: onSelect ? "pointer" : "default" }}>
          <LayerShape sampled={item} />
          {selectedId === item.layer.id && (
            <rect
              x={item.layer.box.x + item.x}
              y={item.layer.box.y + item.y}
              width={item.layer.box.w}
              height={item.layer.box.h}
              fill="none"
              stroke="#234FE8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/* ====================================================================== *
 * The keyframe timeline.
 * ====================================================================== */

export function KeyframeTimeline({ handle, height = 230 }: { handle: DocHandle<MotionDoc>; height?: number }) {
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
    <div ref={frameRef} className="vx-tl" style={{ height }}>
      <div className="vx-tl-gutter" style={{ overflowY: "auto" }}>
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
            <div key={`${row.layer.id}-${row.property ?? "head"}-${index}`} className="vx-tl-row" style={{ height: 28 }}>
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
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 5 / doc.fps : 1 / doc.fps;
                    if (event.key === "ArrowLeft") { event.preventDefault(); handle.edit((current) => moveKeyframe(current, row.layer.id, row.property!, keyframe.id, keyframe.t - step), "Move the keyframe"); }
                    if (event.key === "ArrowRight") { event.preventDefault(); handle.edit((current) => moveKeyframe(current, row.layer.id, row.property!, keyframe.id, keyframe.t + step), "Move the keyframe"); }
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
  );
}

/* ====================================================================== *
 * The easing graph: the curve, draggable, with the sampled value on it.
 * ====================================================================== */

export function EasingGraph({
  easing, onChange, size = 230, progress,
}: { easing: Easing; onChange: (next: Easing) => void; size?: number; progress?: number }) {
  const points = easing.points ?? [0.25, 0.1, 0.25, 1];
  const curve = useMemo(() => {
    const parts: string[] = [];
    for (let step = 0; step <= 60; step += 1) {
      const t = step / 60;
      const value = easeAt(easing, t);
      parts.push(`${step === 0 ? "M" : "L"} ${(t * size).toFixed(1)} ${(size - value * size).toFixed(1)}`);
    }
    return parts.join(" ");
  }, [easing, size]);

  const dragHandle = (index: 0 | 1) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    dragPointer(event as unknown as ReactPointerEvent, {
      move: (point) => {
        const rect = svg.getBoundingClientRect();
        const x = clamp((point.x - rect.left) / rect.width, 0, 1);
        const y = clamp(1 - (point.y - rect.top) / rect.height, -0.6, 1.6);
        const next: [number, number, number, number] = [...points] as [number, number, number, number];
        next[index * 2] = Math.round(x * 1000) / 1000;
        next[index * 2 + 1] = Math.round(y * 1000) / 1000;
        onChange({ kind: "bezier", points: next });
      },
    });
  };

  const editable = easing.kind === "bezier";
  return (
    <svg
      viewBox={`-20 -40 ${size + 40} ${size + 80}`}
      role="application"
      tabIndex={0}
      aria-label={`Easing curve, ${easing.kind}${editable ? `, control points ${points.join(", ")}` : ""}. Arrow keys move the first control point.`}
      style={{ width: "100%", background: "#0B1020", borderRadius: 8, touchAction: "none" }}
      onKeyDown={(event) => {
        if (!editable) return;
        const step = event.shiftKey ? 0.05 : 0.01;
        const next: [number, number, number, number] = [...points] as [number, number, number, number];
        if (event.key === "ArrowLeft") { event.preventDefault(); next[0] = clamp(next[0] - step, 0, 1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); next[0] = clamp(next[0] + step, 0, 1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); next[1] = clamp(next[1] + step, -0.6, 1.6); }
        else if (event.key === "ArrowDown") { event.preventDefault(); next[1] = clamp(next[1] - step, -0.6, 1.6); }
        else return;
        onChange({ kind: "bezier", points: next });
      }}
    >
      <rect x={0} y={0} width={size} height={size} fill="rgba(255,255,255,0.04)" />
      {[0.25, 0.5, 0.75].map((fraction) => (
        <g key={fraction}>
          <line x1={size * fraction} y1={0} x2={size * fraction} y2={size} stroke="rgba(255,255,255,0.1)" />
          <line x1={0} y1={size * fraction} x2={size} y2={size * fraction} stroke="rgba(255,255,255,0.1)" />
        </g>
      ))}
      <line x1={0} y1={size} x2={size} y2={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
      <path d={curve} fill="none" stroke="#7FB4FF" strokeWidth={2.2} />
      {editable && (
        <>
          <line x1={0} y1={size} x2={points[0] * size} y2={size - points[1] * size} stroke="#FFAE7C" strokeWidth={1} />
          <line x1={size} y1={0} x2={points[2] * size} y2={size - points[3] * size} stroke="#FFAE7C" strokeWidth={1} />
          <circle cx={points[0] * size} cy={size - points[1] * size} r={7} fill="#FFAE7C" style={{ cursor: "grab" }} onPointerDown={dragHandle(0)} />
          <circle cx={points[2] * size} cy={size - points[3] * size} r={7} fill="#FFAE7C" style={{ cursor: "grab" }} onPointerDown={dragHandle(1)} />
        </>
      )}
      {progress !== undefined && progress >= 0 && progress <= 1 && (
        <circle cx={progress * size} cy={size - easeAt(easing, progress) * size} r={5} fill="#36C5BA" stroke="#0B1020" strokeWidth={2} />
      )}
      <text x={0} y={size + 20} fontSize={11} fill="rgba(255,255,255,0.6)">time →</text>
      <text x={-14} y={6} fontSize={11} fill="rgba(255,255,255,0.6)" transform={`rotate(-90 -14 6)`}>value →</text>
    </svg>
  );
}

/* ====================================================================== *
 * Playback at the real frame rate.
 * ====================================================================== */

export function useMotionPlayback(doc: MotionDoc | null): { fps: number } {
  const ui = useStore(motionUi);
  const raf = useRef(0);
  const last = useRef(0);
  const frames = useRef<number[]>([]);
  const measured = useRef(0);

  useEffect(() => {
    if (!doc || !ui.playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const delta = (now - last.current) / 1000;
      last.current = now;
      frames.current.push(now);
      while (frames.current.length > 1 && now - frames.current[0] > 1000) frames.current.shift();
      measured.current = frames.current.length;
      motionUi.set((current) => {
        const next = current.time + delta;
        if (next >= doc.duration) return current.loop ? { ...current, time: 0 } : { ...current, time: doc.duration, playing: false };
        return { ...current, time: next };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [doc, ui.playing, ui.loop]);

  return { fps: measured.current };
}

export function TransportRow({ doc, fps }: { doc: MotionDoc; fps: number }) {
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
        onClick={() => motionUi.set((current) => ({ ...current, playing: !current.playing }))}
      >
        {ui.playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Forward one frame" onClick={() => setMotionTime(ui.time + 1 / doc.fps, doc.fps)}>|▶</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Go to the end" onClick={() => setMotionTime(doc.duration, doc.fps)}>⏭</button>
      <Pill tone="info"><span className="ds-num">{ui.time.toFixed(2)}s</span></Pill>
      <Pill><span className="ds-num">frame {Math.round(ui.time * doc.fps)} / {Math.round(doc.duration * doc.fps)}</span></Pill>
      {ui.playing && fps > 0 && <Pill tone={fps >= doc.fps - 4 ? "success" : "warning"}><span className="ds-num">{fps} fps measured</span></Pill>}
      <Pill tone="neutral"><span className="ds-num">{keyframeCount(doc)} keyframes</span></Pill>
    </div>
  );
}

export { NUMERIC_PROPERTIES, sampleLayer };
export type { MotionLayer };
