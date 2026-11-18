import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Pill } from "@/design-system";
import { clamp } from "@/applications/visual/geometry";
import { dragPointer, useMeasure, useStore, type DocHandle } from "@/applications/visual/kit";
import {
  addCaptionAt, clipEnd, clipsOnTrack, gapsOnTrack, mixAudio, moveCaption, moveClip, renderSamples, retimeCaption, rollEdit,
  snapFrame, splitClip, timecode, toggleTrackLock, trimClip, waveformPeaks,
  type Clip, type Track, type VideoDoc,
} from "./timeline";
import { renderFrame } from "./render";
import { setPlayhead, videoUi } from "./model";

/* ====================================================================== *
 * Preview: the composited frame at the playhead, drawn on a canvas.
 * ====================================================================== */

export function PreviewMonitor({
  doc, time, height = 300, captions = true, guides = false, bypassEffects = false, onlyTrack,
}: {
  doc: VideoDoc; time: number; height?: number; captions?: boolean; guides?: boolean; bypassEffects?: boolean; onlyTrack?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = Math.round((height * doc.width) / doc.height);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    renderFrame(canvas, doc, time, { captions, guides, bypassEffects, onlyTrack, language: videoUi.get().language });
  }, [doc, time, height, captions, guides, bypassEffects, onlyTrack]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Programme monitor at ${timecode(time, doc.fps)}`}
      data-testid="video-preview"
      style={{ display: "block", maxWidth: "100%", height, background: "#000", borderRadius: 6, margin: "0 auto" }}
    />
  );
}

/* ====================================================================== *
 * Waveform drawn from the generated samples.
 * ====================================================================== */

export function Waveform({ doc, clip, width, height = 40 }: { doc: VideoDoc; clip: Clip; width: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const source = doc.sources.find((item) => item.id === clip.sourceId);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source) return;
    const pixels = Math.max(8, Math.round(width));
    canvas.width = pixels;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, pixels, height);
    const samples = renderSamples(source, clip.duration, 4000, clip.sourceIn);
    const peaks = waveformPeaks(samples, pixels);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    for (const [index, peak] of peaks.entries()) {
      const top = (1 - (peak.max + 1) / 2) * height;
      const bottom = (1 - (peak.min + 1) / 2) * height;
      ctx.fillRect(index, top, 1, Math.max(1, bottom - top));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(pixels, height / 2);
    ctx.stroke();
  }, [doc, clip, width, height, source]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.85 }} />;
}

/** A standalone waveform for a whole mix or a source, with a time axis. */
export function MixWaveform({ doc, from = 0, seconds, height = 90, label }: { doc: VideoDoc; from?: number; seconds: number; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || size.width === 0) return;
    canvas.width = size.width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0B1020";
    ctx.fillRect(0, 0, canvas.width, height);
    const samples = mixAudio(doc, from, seconds, 4000);
    const peaks = waveformPeaks(samples, canvas.width);
    ctx.fillStyle = "#7FB4FF";
    for (const [index, peak] of peaks.entries()) {
      const top = (1 - (peak.max + 1) / 2) * height;
      const bottom = (1 - (peak.min + 1) / 2) * height;
      ctx.fillRect(index, top, 1, Math.max(1, bottom - top));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(canvas.width, height / 2);
    ctx.stroke();
    /* −6 dBFS reference lines. */
    ctx.strokeStyle = "rgba(255,120,120,0.5)";
    ctx.setLineDash([4, 4]);
    for (const level of [0.5, -0.5]) {
      ctx.beginPath();
      ctx.moveTo(0, (1 - (level + 1) / 2) * height);
      ctx.lineTo(canvas.width, (1 - (level + 1) / 2) * height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [doc, from, seconds, height, size.width]);
  return (
    <div ref={frameRef}>
      <canvas ref={ref} role="img" aria-label={label} style={{ display: "block", width: "100%", height, borderRadius: 6 }} />
      <p className="vx-mini">Drawn from the generated samples at 4 kHz. The dashed lines are −6 dBFS.</p>
    </div>
  );
}

/* ====================================================================== *
 * The timeline.
 * ====================================================================== */

export interface TimelineProps {
  handle: DocHandle<VideoDoc>;
  onSelect?: (clipId: string) => void;
  /** A caption cue was picked on the caption lane. */
  onCaptionSelect?: (captionId: string) => void;
  /** A cue was double-clicked or Enter was pressed on it. */
  onCaptionOpen?: (captionId: string) => void;
  height?: number;
}

const CAPTION_ROW = 30;

/** Add an empty cue at the playhead in the language being edited, and select it. */
export function addCueHere(handle: DocHandle<VideoDoc>): string | undefined {
  const doc = handle.doc;
  if (!doc) return "Open a sequence first";
  const ui = videoUi.get();
  const id = `cap-${Math.round(ui.playhead * 1000).toString(36)}-${doc.captions.length + 1}`;
  const next = addCaptionAt(doc, ui.playhead, ui.language, id);
  if (!next) return "A cue already covers the playhead, or there is no room before the next cue.";
  handle.edit(next, "Add a cue");
  videoUi.set((current) => ({ ...current, selectedCaptionId: id }));
  return undefined;
}

export function TimelineView({ handle, onSelect, onCaptionSelect, onCaptionOpen, height = 260 }: TimelineProps) {
  const ui = useStore(videoUi);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const doc = handle.doc;
  const [dragging, setDragging] = useState<string | null>(null);

  const pxPerSecond = useMemo(() => {
    const available = Math.max(320, size.width - 172);
    return (available / Math.max(doc?.duration ?? 1, 1)) * ui.zoom;
  }, [size.width, doc?.duration, ui.zoom]);

  if (!doc) return null;
  const tracks = [...doc.tracks].sort((a, b) => b.order - a.order);
  const width = Math.max(320, doc.duration * pxPerSecond);

  const timeFromEvent = (clientX: number, element: HTMLElement): number => {
    const rect = element.getBoundingClientRect();
    return clamp((clientX - rect.left) / pxPerSecond, 0, doc.duration);
  };

  const scrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setPlayhead(timeFromEvent(event.clientX, element), doc.fps);
    videoUi.set((current) => ({ ...current, playing: false }));
    dragPointer(event, { move: (point) => setPlayhead(timeFromEvent(point.x, element), doc.fps) });
  };

  const startClipDrag = (event: ReactPointerEvent, clip: Clip) => {
    event.stopPropagation();
    onSelect?.(clip.id);
    videoUi.set((current) => ({ ...current, selectedClipId: clip.id }));
    if (ui.tool === "razor") {
      const element = (event.currentTarget as HTMLElement).parentElement;
      if (!element) return;
      const at = timeFromEvent(event.clientX, element);
      const result = splitClip(doc, clip.id, at);
      if (result.newClipId) {
        handle.edit(() => result.doc, "Split the clip");
      }
      return;
    }
    const start = clip.start;
    setDragging(clip.id);
    dragPointer(event, {
      move: (point, _modifiers, origin) => {
        const delta = (point.x - origin.x) / pxPerSecond;
        let next = start + delta;
        if (videoUi.get().snapToClips) {
          const edges = doc.clips.filter((item) => item.id !== clip.id).flatMap((item) => [item.start, clipEnd(item)]).concat([0, ui.playhead]);
          for (const edge of edges) {
            if (Math.abs(next - edge) < 6 / pxPerSecond) next = edge;
            if (Math.abs(next + clip.duration - edge) < 6 / pxPerSecond) next = edge - clip.duration;
          }
        }
        handle.live((current) => moveClip(current, clip.id, next));
      },
      end: (moved) => {
        setDragging(null);
        if (moved) handle.beginGesture();
      },
    });
  };

  const startTrim = (event: ReactPointerEvent, clip: Clip, edge: "start" | "end") => {
    event.stopPropagation();
    videoUi.set((current) => ({ ...current, selectedClipId: clip.id }));
    const neighbours = clipsOnTrack(doc, clip.trackId);
    const index = neighbours.findIndex((item) => item.id === clip.id);
    const right = neighbours[index + 1];
    const left = neighbours[index - 1];
    dragPointer(event, {
      move: (point, modifiers, origin) => {
        const delta = (point.x - origin.x) / pxPerSecond;
        if (ui.tool === "roll" && edge === "end" && right) {
          handle.live(() => rollEdit(doc, clip.id, right.id, delta));
          return;
        }
        if (ui.tool === "roll" && edge === "start" && left) {
          handle.live(() => rollEdit(doc, left.id, clip.id, delta));
          return;
        }
        handle.live(() => trimClip(doc, clip.id, edge, delta, { ripple: ui.tool === "ripple" || modifiers.shift }));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const startCueDrag = (event: ReactPointerEvent, id: string, mode: "move" | "start" | "end") => {
    event.stopPropagation();
    const caption = doc.captions.find((item) => item.id === id);
    if (!caption) return;
    videoUi.set((current) => ({ ...current, selectedCaptionId: id, playing: false, playhead: mode === "end" ? current.playhead : snapFrame(caption.start, doc.fps) }));
    onCaptionSelect?.(id);
    const from = mode === "end" ? caption.end : caption.start;
    dragPointer(event, {
      move: (point, _modifiers, origin) => {
        const time = from + (point.x - origin.x) / pxPerSecond;
        handle.live((current) => (mode === "move" ? moveCaption(current, id, time) : retimeCaption(current, id, mode, time)));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const ticks = Math.max(2, Math.floor(doc.duration));
  const tickStep = doc.duration > 90 ? 10 : doc.duration > 30 ? 5 : 1;

  return (
    <div ref={frameRef} className="vx-tl" style={{ height }}>
      <div className="vx-tl-gutter">
        <div className="vx-tl-ruler" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <span className="ds-num" style={{ paddingInlineStart: 6, fontSize: 10, lineHeight: "24px" }}>{timecode(ui.playhead, doc.fps)}</span>
        </div>
        {tracks.map((track) => (
          <div key={track.id} className="vx-tl-rowhead" style={{ height: track.height }}>
            <span className="ds-grow ds-truncate">{track.name}</span>
            <button
              type="button"
              className="vx-node-btn"
              aria-label={`${track.muted ? "Unmute" : "Mute"} ${track.name}`}
              aria-pressed={track.muted}
              data-on={track.muted ? "true" : undefined}
              onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, muted: !item.muted } : item)) }), "Mute the track")}
            >
              M
            </button>
            <button
              type="button"
              className="vx-node-btn"
              aria-label={`${track.solo ? "Unsolo" : "Solo"} ${track.name}`}
              aria-pressed={track.solo}
              data-on={track.solo ? "true" : undefined}
              onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, solo: !item.solo } : item)) }), "Solo the track")}
            >
              S
            </button>
            <button
              type="button"
              className="vx-node-btn"
              aria-label={`${track.locked ? "Unlock" : "Lock"} ${track.name}`}
              aria-pressed={track.locked}
              data-on={track.locked ? "true" : undefined}
              title={track.locked ? "Locked: clips on this track cannot be moved, trimmed, split or deleted" : "Lock the track"}
              onClick={() => handle.edit((current) => toggleTrackLock(current, track.id), track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`)}
            >
              {track.locked ? <Lock size={12} /> : <LockOpen size={12} />}
            </button>
          </div>
        ))}
        <div className="vx-tl-rowhead" style={{ height: CAPTION_ROW }}>
          <span className="ds-grow ds-truncate">Captions · {ui.language.toUpperCase()}</span>
          <button
            type="button"
            className="vx-node-btn"
            aria-label="Add a caption cue at the playhead"
            title="Add a cue at the playhead"
            onClick={() => addCueHere(handle)}
          >
            +
          </button>
        </div>
      </div>

      <div className="vx-tl-scroll">
        <div style={{ width, position: "relative" }}>
          <div
            className="vx-tl-ruler"
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(doc.duration * doc.fps)}
            aria-valuenow={Math.round(ui.playhead * doc.fps)}
            aria-valuetext={timecode(ui.playhead, doc.fps)}
            onPointerDown={scrub}
            onKeyDown={(event) => {
              const frames = event.shiftKey ? doc.fps : 1;
              if (event.key === "ArrowLeft") { event.preventDefault(); setPlayhead(ui.playhead - frames / doc.fps, doc.fps); }
              if (event.key === "ArrowRight") { event.preventDefault(); setPlayhead(ui.playhead + frames / doc.fps, doc.fps); }
              if (event.key === "Home") { event.preventDefault(); setPlayhead(0, doc.fps); }
              if (event.key === "End") { event.preventDefault(); setPlayhead(doc.duration, doc.fps); }
            }}
            style={{ cursor: "col-resize" }}
          >
            {Array.from({ length: Math.ceil(ticks / tickStep) + 1 }, (_, index) => index * tickStep).map((second) => (
              <span key={second} className="vx-tl-tick ds-num" style={{ insetInlineStart: second * pxPerSecond }}>
                {timecode(second, doc.fps).slice(3, 8)}
              </span>
            ))}
          </div>

          {tracks.map((track) => (
            <div
              key={track.id}
              className="vx-tl-row"
              data-locked={track.locked || undefined}
              style={{
                height: track.height,
                opacity: track.muted ? 0.45 : 1,
                backgroundImage: track.locked ? "repeating-linear-gradient(135deg, transparent, transparent 8px, var(--bg-inset) 8px, var(--bg-inset) 10px)" : undefined,
              }}
            >
              {gapsOnTrack(doc, track.id).map((gap) => (
                <div
                  key={`${track.id}-gap-${gap.start}`}
                  aria-hidden="true"
                  style={{ position: "absolute", insetBlock: 4, insetInlineStart: gap.start * pxPerSecond, width: gap.duration * pxPerSecond, background: "repeating-linear-gradient(45deg, var(--bg-inset), var(--bg-inset) 6px, transparent 6px, transparent 12px)" }}
                />
              ))}
              {clipsOnTrack(doc, track.id).map((clip) => {
                const selected = ui.selectedClipId === clip.id;
                const clipWidth = Math.max(6, clip.duration * pxPerSecond);
                const colour = track.kind === "audio" ? "#1D4A46" : track.kind === "title" ? "#5B4DFF" : "#234FE8";
                return (
                  <div
                    key={clip.id}
                    className="vx-clip"
                    data-selected={selected || undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`${clip.name}, ${timecode(clip.start, doc.fps)} to ${timecode(clipEnd(clip), doc.fps)}`}
                    data-locked={track.locked || clip.locked || undefined}
                    style={{
                      insetInlineStart: clip.start * pxPerSecond,
                      width: clipWidth,
                      background: colour,
                      opacity: dragging === clip.id ? 0.75 : track.locked ? 0.6 : 1,
                      cursor: track.locked || clip.locked ? "not-allowed" : undefined,
                    }}
                    onPointerDown={(event) => startClipDrag(event, clip)}
                    onKeyDown={(event) => {
                      const frame = 1 / doc.fps;
                      const step = event.shiftKey ? doc.fps * frame : frame;
                      if (event.key === "ArrowLeft" && event.altKey) { event.preventDefault(); handle.edit((current) => trimClip(current, clip.id, "end", -step), "Trim the clip"); }
                      else if (event.key === "ArrowRight" && event.altKey) { event.preventDefault(); handle.edit((current) => trimClip(current, clip.id, "end", step), "Trim the clip"); }
                      else if (event.key === "ArrowLeft") { event.preventDefault(); handle.edit((current) => moveClip(current, clip.id, clip.start - step), "Move the clip"); }
                      else if (event.key === "ArrowRight") { event.preventDefault(); handle.edit((current) => moveClip(current, clip.id, clip.start + step), "Move the clip"); }
                      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(clip.id); videoUi.set((current) => ({ ...current, selectedClipId: clip.id })); }
                    }}
                  >
                    {track.kind === "audio" && clipWidth > 20 && <Waveform doc={doc} clip={clip} width={clipWidth} height={track.height - 8} />}
                    <span style={{ position: "relative", zIndex: 1 }}>{clip.name}</span>
                    <span
                      className="vx-clip-grip"
                      data-edge="start"
                      role="separator"
                      aria-label={`Trim the start of ${clip.name}`}
                      onPointerDown={(event) => startTrim(event, clip, "start")}
                    />
                    <span
                      className="vx-clip-grip"
                      data-edge="end"
                      role="separator"
                      aria-label={`Trim the end of ${clip.name}`}
                      onPointerDown={(event) => startTrim(event, clip, "end")}
                    />
                  </div>
                );
              })}
              {doc.transitions.map((transition) => {
                const to = doc.clips.find((clip) => clip.id === transition.toClipId);
                if (!to || to.trackId !== track.id) return null;
                return (
                  <div
                    key={transition.id}
                    aria-hidden="true"
                    style={{
                      position: "absolute", insetBlock: 4,
                      insetInlineStart: to.start * pxPerSecond,
                      width: Math.max(4, transition.duration * pxPerSecond),
                      background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.65), rgba(255,255,255,0.65) 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)",
                      borderRadius: 3, pointerEvents: "none", zIndex: 2,
                    }}
                  />
                );
              })}
            </div>
          ))}

          <div className="vx-tl-row" style={{ height: CAPTION_ROW }} aria-label={`Caption cues, ${ui.language}`} role="group">
            {doc.captions.filter((caption) => caption.language === ui.language).map((caption) => {
              const selected = ui.selectedCaptionId === caption.id;
              return (
                <div
                  key={caption.id}
                  className="vd-cue"
                  data-selected={selected || undefined}
                  data-reviewed={caption.reviewed || undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={`Caption ${timecode(caption.start, doc.fps)} to ${timecode(caption.end, doc.fps)}: ${caption.text || "empty"}`}
                  style={{ insetInlineStart: caption.start * pxPerSecond, width: Math.max(6, (caption.end - caption.start) * pxPerSecond) }}
                  onPointerDown={(event) => startCueDrag(event, caption.id, "move")}
                  onDoubleClick={() => onCaptionOpen?.(caption.id)}
                  onKeyDown={(event) => {
                    const step = (event.shiftKey ? doc.fps : 1) / doc.fps;
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      event.stopPropagation();
                      const delta = event.key === "ArrowLeft" ? -step : step;
                      handle.edit((current) => (event.altKey ? retimeCaption(current, caption.id, "end", caption.end + delta) : moveCaption(current, caption.id, caption.start + delta)), event.altKey ? "Retime the cue" : "Move the cue");
                    }
                    if (event.key === "Enter") { event.preventDefault(); onCaptionOpen?.(caption.id); }
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      event.stopPropagation();
                      handle.edit((current) => ({ ...current, captions: current.captions.filter((item) => item.id !== caption.id) }), "Delete the cue");
                      videoUi.set((current) => ({ ...current, selectedCaptionId: undefined }));
                    }
                  }}
                >
                  <span className="ds-truncate">{caption.text || "(empty)"}</span>
                  <span className="vx-clip-grip" data-edge="start" role="separator" aria-label={`Move the in point of the cue at ${timecode(caption.start, doc.fps)}`} onPointerDown={(event) => startCueDrag(event, caption.id, "start")} />
                  <span className="vx-clip-grip" data-edge="end" role="separator" aria-label={`Move the out point of the cue at ${timecode(caption.start, doc.fps)}`} onPointerDown={(event) => startCueDrag(event, caption.id, "end")} />
                </div>
              );
            })}
          </div>

          {doc.markers.map((marker) => (
            <div
              key={marker.id}
              aria-hidden="true"
              title={marker.text}
              style={{ position: "absolute", top: 0, insetInlineStart: marker.time * pxPerSecond - 4, width: 8, height: 8, background: marker.resolved ? "var(--success)" : "var(--warning)", borderRadius: 2, zIndex: 6 }}
            />
          ))}

          <div className="vx-playhead" style={{ insetInlineStart: ui.playhead * pxPerSecond }} />
          {ui.inPoint !== undefined && <div aria-hidden="true" style={{ position: "absolute", insetBlock: 0, insetInlineStart: ui.inPoint * pxPerSecond, width: 2, background: "var(--success)" }} />}
          {ui.outPoint !== undefined && <div aria-hidden="true" style={{ position: "absolute", insetBlock: 0, insetInlineStart: ui.outPoint * pxPerSecond, width: 2, background: "var(--warning)" }} />}
        </div>
      </div>
    </div>
  );
}

/** Transport that drives the playhead at the real frame rate. */
export function useTransport(doc: VideoDoc | null) {
  const ui = useStore(videoUi);
  const raf = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!doc || !ui.playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const delta = ((now - last.current) / 1000) * videoUi.get().rate;
      last.current = now;
      videoUi.set((current) => {
        const next = current.playhead + delta;
        if (next >= doc.duration) return { ...current, playhead: 0 };
        if (next < 0) return { ...current, playhead: 0, playing: false };
        return { ...current, playhead: snapFrame(next, doc.fps) };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [doc, ui.playing]);
}

/** J/K/L and the rest of the transport keyboard. */
export function transportKeys(event: KeyboardEvent | React.KeyboardEvent, doc: VideoDoc): boolean {
  const key = event.key.toLowerCase();
  const frames = (event as React.KeyboardEvent).shiftKey ? doc.fps : 1;
  if (key === "j") { videoUi.set((c) => ({ ...c, playing: true, rate: c.rate > 0 ? -1 : Math.max(-4, c.rate * 2) })); return true; }
  if (key === "k") { videoUi.set((c) => ({ ...c, playing: false, rate: 1 })); return true; }
  if (key === "l") { videoUi.set((c) => ({ ...c, playing: true, rate: c.rate < 0 ? 1 : Math.min(4, c.rate * 2) })); return true; }
  if (key === " ") { videoUi.set((c) => ({ ...c, playing: !c.playing, rate: 1 })); return true; }
  if (key === "arrowleft") { videoUi.set((c) => ({ ...c, playing: false, playhead: Math.max(0, snapFrame(c.playhead - frames / doc.fps, doc.fps)) })); return true; }
  if (key === "arrowright") { videoUi.set((c) => ({ ...c, playing: false, playhead: Math.min(doc.duration, snapFrame(c.playhead + frames / doc.fps, doc.fps)) })); return true; }
  if (key === "home") { videoUi.set((c) => ({ ...c, playhead: 0 })); return true; }
  if (key === "end") { videoUi.set((c) => ({ ...c, playhead: doc.duration })); return true; }
  if (key === "i") { videoUi.set((c) => ({ ...c, inPoint: c.playhead })); return true; }
  if (key === "o") { videoUi.set((c) => ({ ...c, outPoint: c.playhead })); return true; }
  return false;
}

export function TransportBar({ doc, handle }: { doc: VideoDoc; handle: DocHandle<VideoDoc> }) {
  const ui = useStore(videoUi);
  return (
    <div className="ds-row ds-gap-2 ds-wrap" style={{ alignItems: "center" }}>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Go to the start" onClick={() => setPlayhead(0, doc.fps)}>⏮</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Back one frame" onClick={() => setPlayhead(ui.playhead - 1 / doc.fps, doc.fps)}>◀|</button>
      <button
        type="button"
        className="ds-btn"
        data-variant={ui.playing ? "primary" : "secondary"}
        data-size="sm"
        aria-label={ui.playing ? "Pause" : "Play"}
        onClick={() => videoUi.set((current) => ({ ...current, playing: !current.playing, rate: 1 }))}
      >
        {ui.playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Forward one frame" onClick={() => setPlayhead(ui.playhead + 1 / doc.fps, doc.fps)}>|▶</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-label="Go to the end" onClick={() => setPlayhead(doc.duration, doc.fps)}>⏭</button>
      <Pill tone="info"><span className="ds-num">{timecode(ui.playhead, doc.fps)}</span></Pill>
      <Pill><span className="ds-num">{doc.fps} fps</span></Pill>
      {ui.rate !== 1 && <Pill tone="warning"><span className="ds-num">{ui.rate}×</span></Pill>}
      <span className="ds-grow" />
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" disabled={!handle.canUndo} onClick={handle.undo}>Undo</button>
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" disabled={!handle.canRedo} onClick={handle.redo}>Redo</button>
    </div>
  );
}

/**
 * The programme monitor sized to the room it has: the picture takes the
 * height left after the transport, so play, the frame steps and undo stay
 * on screen whatever the window height.
 */
export function FittedMonitor({ doc, handle, time, captions, guides, bypassEffects }: {
  doc: VideoDoc; handle: DocHandle<VideoDoc>; time: number; captions: boolean; guides: boolean; bypassEffects: boolean;
}) {
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const transport = 44;
  const byHeight = size.height - transport - 20;
  const byWidth = ((size.width - 20) * doc.height) / doc.width;
  const height = Math.max(90, Math.floor(Math.min(420, byHeight, byWidth)));
  return (
    <div ref={frameRef} className="vd-monitor">
      {size.height > 0 && (
        <>
          <PreviewMonitor doc={doc} time={time} height={height} captions={captions} guides={guides} bypassEffects={bypassEffects} />
          <TransportBar doc={doc} handle={handle} />
        </>
      )}
    </div>
  );
}

export type { Track };
