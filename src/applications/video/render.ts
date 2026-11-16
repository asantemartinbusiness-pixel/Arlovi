/* ====================================================================== *
 * Frame rendering.
 *
 * There is no video file in this workspace, so a clip's picture is drawn
 * from its source definition at the exact source time asked for. The
 * drawing is deterministic — the same clip at the same frame produces the
 * same pixels — which is what makes the preview, the scrub and the export
 * agree with each other.
 * ====================================================================== */

import { clamp } from "@/applications/visual/geometry";
import {
  captionAt, clipEnd, sourceOf, stackAt, transitionAt,
  type Clip, type MediaSource, type VideoDoc,
} from "./timeline";

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser did not provide a 2-D canvas context.");
  return ctx;
}

/** Draw one source at one source-time into a rectangle. */
export function drawSource(
  ctx: CanvasRenderingContext2D,
  source: MediaSource,
  sourceTime: number,
  width: number,
  height: number,
): void {
  if (source.missing) {
    ctx.fillStyle = "#2A1414";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#C0392B";
    ctx.lineWidth = Math.max(2, width / 240);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, height);
    ctx.moveTo(width, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
    ctx.fillStyle = "#F4C6C0";
    ctx.font = `600 ${Math.round(height / 16)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("media offline", width / 2, height / 2 - height / 40);
    ctx.font = `400 ${Math.round(height / 26)}px Inter, sans-serif`;
    ctx.fillText(source.name, width / 2, height / 2 + height / 16);
    ctx.textAlign = "start";
    return;
  }

  const { hue, motion, subject } = source.look;
  const phase = sourceTime / Math.max(source.duration, 0.001);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `hsl(${hue} 38% ${18 + Math.sin(sourceTime * 0.6) * 4}%)`);
  sky.addColorStop(0.6, `hsl(${(hue + 16) % 360} 32% 32%)`);
  sky.addColorStop(1, `hsl(${(hue + 30) % 360} 24% 12%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  /* Camera move. */
  const pan = motion === "pan" ? (phase - 0.5) * width * 0.34 : 0;
  const push = motion === "push" ? 1 + phase * 0.22 : 1;
  const orbit = motion === "orbit" ? Math.sin(sourceTime * 0.9) * width * 0.06 : 0;

  ctx.save();
  ctx.translate(width / 2 + pan + orbit, height / 2);
  ctx.scale(push, push);
  ctx.translate(-width / 2, -height / 2);

  const glow = ctx.createRadialGradient(width * 0.66, height * 0.3, 6, width * 0.66, height * 0.3, Math.max(width, height) * 0.55);
  glow.addColorStop(0, "rgba(255,236,200,0.95)");
  glow.addColorStop(0.3, "rgba(255,190,125,0.38)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  if (subject === "lamp") {
    ctx.fillStyle = "rgba(18,22,34,0.92)";
    ctx.beginPath();
    ctx.ellipse(width * 0.32, height * 0.82, width * 0.17, height * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2A2520";
    ctx.fillRect(width * 0.31, height * 0.34, width * 0.014, height * 0.48);
    ctx.fillStyle = `hsl(${(hue + 40) % 360} 46% ${62 + Math.sin(sourceTime * 2) * 3}%)`;
    ctx.beginPath();
    ctx.moveTo(width * 0.23, height * 0.34);
    ctx.lineTo(width * 0.41, height * 0.34);
    ctx.lineTo(width * 0.37, height * 0.17);
    ctx.lineTo(width * 0.27, height * 0.17);
    ctx.closePath();
    ctx.fill();
  } else if (subject === "room") {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let index = 0; index < 5; index += 1) {
      const x = ((index * 0.22 + phase * 0.3) % 1.2 - 0.1) * width;
      ctx.fillRect(x, height * 0.18, width * 0.1, height * 0.56);
    }
    ctx.fillStyle = "rgba(18,22,34,0.75)";
    ctx.fillRect(0, height * 0.78, width, height * 0.22);
  } else if (subject === "hands") {
    ctx.fillStyle = "rgba(226,190,150,0.92)";
    ctx.beginPath();
    ctx.ellipse(width * (0.4 + Math.sin(sourceTime * 1.4) * 0.03), height * 0.62, width * 0.1, height * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(width * (0.58 - Math.sin(sourceTime * 1.4) * 0.03), height * 0.66, width * 0.09, height * 0.065, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (subject === "bag") {
    ctx.fillStyle = "#4A3524";
    ctx.beginPath();
    ctx.roundRect(width * 0.38, height * 0.42, width * 0.24, height * 0.42, width * 0.02);
    ctx.fill();
    ctx.fillStyle = "#E8D9BE";
    ctx.fillRect(width * 0.41, height * 0.5, width * 0.18, height * 0.1);
  } else {
    const bars = ["#FFFFFF", "#F2E33C", "#3CE0F2", "#3CF26B", "#F23CD0", "#F2433C", "#3C4BF2", "#101010"];
    for (const [index, colour] of bars.entries()) {
      ctx.fillStyle = colour;
      ctx.fillRect((index / bars.length) * width, 0, width / bars.length + 1, height * 0.8);
    }
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, height * 0.8, width, height * 0.2);
  }

  ctx.restore();

  if (source.look.grain > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(source.look.grain, 0, 0.3);
    let seed = Math.floor(sourceTime * 1000) + 7;
    for (let index = 0; index < Math.round(width * height / 900); index += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const x = (seed >> 8) % width;
      const y = (seed >> 3) % height;
      ctx.fillStyle = (seed & 1) ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
}

/** Build the CSS filter string an effect stack produces. */
export function effectFilter(clip: Clip): string {
  const parts: string[] = [];
  for (const effect of clip.effects) {
    if (effect.bypassed) continue;
    if (effect.kind === "exposure") parts.push(`brightness(${(1 + effect.amount / 100).toFixed(3)})`);
    if (effect.kind === "contrast") parts.push(`contrast(${(1 + effect.amount / 100).toFixed(3)})`);
    if (effect.kind === "saturation") parts.push(`saturate(${(1 + effect.amount / 100).toFixed(3)})`);
    if (effect.kind === "temperature") parts.push(`sepia(${clamp(Math.abs(effect.amount) / 160, 0, 1).toFixed(3)}) hue-rotate(${(effect.amount < 0 ? 170 : -8)}deg)`);
    if (effect.kind === "blur") parts.push(`blur(${Math.max(0, effect.amount / 12).toFixed(2)}px)`);
    if (effect.kind === "lut") parts.push(effect.lut === "cool" ? "hue-rotate(-12deg) saturate(1.1)" : effect.lut === "warm" ? "sepia(0.22) saturate(1.12)" : "grayscale(1) contrast(1.08)");
  }
  return parts.join(" ") || "none";
}

function drawClip(ctx: CanvasRenderingContext2D, doc: VideoDoc, clip: Clip, time: number, width: number, height: number): void {
  const source = sourceOf(doc, clip);
  ctx.save();
  ctx.globalAlpha = clamp(clip.opacity * fadeFactor(clip, time), 0, 1);
  ctx.filter = effectFilter(clip);
  const { scale, x, y, rotation } = clip.transform;
  ctx.translate(width / 2 + (x / 100) * width, height / 2 + (y / 100) * height);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);

  if (clip.text !== undefined) {
    const style = clip.textStyle ?? { size: 54, weight: 700, color: "#FFFFFF", align: "center" as const, family: "Inter" };
    ctx.filter = "none";
    ctx.font = `${style.weight} ${(style.size / 1080) * height}px ${style.family}, sans-serif`;
    ctx.textAlign = style.align === "center" ? "center" : style.align === "end" ? "right" : "left";
    ctx.textBaseline = "middle";
    const tx = style.align === "center" ? width / 2 : style.align === "end" ? width * 0.92 : width * 0.08;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = height / 60;
    ctx.fillStyle = style.color;
    const lines = clip.text.split("\n");
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, tx, height / 2 + (index - (lines.length - 1) / 2) * (style.size / 1080) * height * 1.2);
    }
    ctx.shadowBlur = 0;
  } else if (source) {
    const sourceTime = clip.sourceIn + (time - clip.start);
    drawSource(ctx, source, sourceTime, width, height);
  }
  ctx.restore();
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

function fadeFactor(clip: Clip, time: number): number {
  let value = 1;
  if (clip.fadeIn > 0 && time < clip.start + clip.fadeIn) value *= (time - clip.start) / clip.fadeIn;
  if (clip.fadeOut > 0 && time > clipEnd(clip) - clip.fadeOut) value *= (clipEnd(clip) - time) / clip.fadeOut;
  return clamp(value, 0, 1);
}

export interface RenderOptions {
  /** Draw the caption that is live at this time. */
  captions?: boolean;
  language?: string;
  /** Draw safe-area guides. */
  guides?: boolean;
  /** Only the clips on this track, for a before/after comparison. */
  onlyTrack?: string;
  bypassEffects?: boolean;
}

/**
 * Composite the frame at `time` onto a canvas. This is the function the
 * preview, the scrub, the thumbnails and the export all call.
 */
export function renderFrame(canvas: HTMLCanvasElement, doc: VideoDoc, time: number, options: RenderOptions = {}): void {
  const ctx = ctx2d(canvas);
  const width = canvas.width;
  const height = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const stack = stackAt(doc, time).filter(({ track }) => track.kind !== "audio" && (!options.onlyTrack || track.id === options.onlyTrack));
  const transition = transitionAt(doc, time);

  for (const { clip } of stack) {
    const prepared = options.bypassEffects ? { ...clip, effects: [] } : clip;
    if (transition && clip.id === transition.to.id) {
      /* Draw the outgoing clip first, then mix the incoming one over it. */
      const outgoing = { ...transition.from };
      const sourceTime = outgoing.sourceIn + (clipEnd(outgoing) - outgoing.start) - transition.transition.duration + (time - transition.to.start);
      ctx.save();
      ctx.globalAlpha = 1;
      const source = sourceOf(doc, outgoing);
      if (source) drawSource(ctx, source, Math.max(0, sourceTime), width, height);
      ctx.restore();
      if (transition.transition.kind === "dip-to-black") {
        const toBlack = transition.progress < 0.5 ? transition.progress * 2 : (1 - transition.progress) * 2;
        ctx.save();
        ctx.globalAlpha = transition.progress < 0.5 ? 1 : 1;
        if (transition.progress >= 0.5) drawClip(ctx, doc, prepared, time, width, height);
        ctx.fillStyle = `rgba(0,0,0,${clamp(1 - toBlack, 0, 1)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      } else if (transition.transition.kind === "wipe-left") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width * transition.progress, height);
        ctx.clip();
        drawClip(ctx, doc, prepared, time, width, height);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = transition.progress;
        drawClip(ctx, doc, prepared, time, width, height);
        ctx.restore();
      }
      continue;
    }
    drawClip(ctx, doc, prepared, time, width, height);
  }

  if (stack.length === 0) {
    ctx.fillStyle = "#0C0C0E";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#5A5A62";
    ctx.font = `500 ${Math.round(height / 22)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("no clip at the playhead", width / 2, height / 2);
    ctx.textAlign = "start";
  }

  if (options.captions) {
    const caption = captionAt(doc, time, options.language ?? "en");
    if (caption) {
      const style = doc.captionStyle ?? { position: "bottom", scale: 1, box: true };
      const size = Math.round((height / 22) * style.scale);
      ctx.font = `600 ${size}px Inter, sans-serif`;
      ctx.textAlign = "center";
      const text = caption.text;
      const metrics = ctx.measureText(text);
      const padding = size * 0.5;
      const top = style.position === "top" ? size * 1.3 : height - size * 3;
      if (style.box) {
        ctx.fillStyle = "rgba(0,0,0,0.66)";
        ctx.fillRect(width / 2 - metrics.width / 2 - padding, top, metrics.width + padding * 2, size * 1.7);
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.lineWidth = Math.max(2, size / 8);
        ctx.strokeText(text, width / 2, top + size * 1.1);
      }
      ctx.fillStyle = caption.reviewed ? "#FFFFFF" : "#FFE2A8";
      ctx.fillText(text, width / 2, top + size * 1.1);
      ctx.textAlign = "start";
    }
  }

  if (options.guides) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
    ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
    ctx.setLineDash([]);
  }
}

/** A still at a time, as a data URL — used for thumbnails and contact sheets. */
export function frameDataUrl(doc: VideoDoc, time: number, width = 240): string {
  const canvas = makeCanvas(width, Math.round((width * doc.height) / doc.width));
  renderFrame(canvas, doc, time);
  return canvas.toDataURL("image/png");
}

/** RGB parade and histogram for the scopes, from the rendered frame. */
export function frameScopes(doc: VideoDoc, time: number, samples = 160): { r: number[]; g: number[]; b: number[]; luma: number[] } {
  const canvas = makeCanvas(samples, Math.round((samples * doc.height) / doc.width));
  renderFrame(canvas, doc, time);
  const ctx = ctx2d(canvas);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const r = new Array(64).fill(0);
  const g = new Array(64).fill(0);
  const b = new Array(64).fill(0);
  const luma = new Array(64).fill(0);
  for (let index = 0; index < data.length; index += 4) {
    r[Math.min(63, data[index] >> 2)] += 1;
    g[Math.min(63, data[index + 1] >> 2)] += 1;
    b[Math.min(63, data[index + 2] >> 2)] += 1;
    luma[Math.min(63, Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) >> 2)] += 1;
  }
  return { r, g, b, luma };
}

/* ====================================================================== *
 * Export
 * ====================================================================== */

export function recorderSupport(): { webm: boolean; mimeType: string | null; reason: string } {
  if (typeof MediaRecorder === "undefined") {
    return { webm: false, mimeType: null, reason: "This browser has no MediaRecorder, so it cannot encode a video file at all." };
  }
  for (const candidate of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return { webm: true, mimeType: candidate, reason: `This browser can encode ${candidate}.` };
    }
  }
  return { webm: false, mimeType: null, reason: "MediaRecorder is present but supports no WebM profile here." };
}

export interface ExportProgress {
  frame: number;
  frames: number;
  seconds: number;
}

/**
 * Record the sequence by drawing every frame onto a canvas and letting
 * MediaRecorder encode the canvas stream. This produces a real WebM file.
 * It is wall-clock recording, not an offline render: the frames are drawn
 * as fast as the browser will take them and the result is as long as the
 * sequence.
 */
export async function exportWebm(
  doc: VideoDoc,
  options: { width: number; height: number; fps: number; bitrate: number; captions: boolean; onProgress?: (progress: ExportProgress) => void; signal?: { cancelled: boolean } },
): Promise<{ blob: Blob; frames: number; mimeType: string }> {
  const support = recorderSupport();
  if (!support.webm || !support.mimeType) throw new Error(support.reason);
  const canvas = makeCanvas(options.width, options.height);
  const stream = canvas.captureStream(options.fps);
  const recorder = new MediaRecorder(stream, { mimeType: support.mimeType, videoBitsPerSecond: options.bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };

  const total = Math.max(1, Math.round(doc.duration * options.fps));
  const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();

  for (let frame = 0; frame < total; frame += 1) {
    if (options.signal?.cancelled) break;
    renderFrame(canvas, doc, frame / options.fps, { captions: options.captions });
    options.onProgress?.({ frame, frames: total, seconds: frame / options.fps });
    /* Give the encoder a turn; one frame per animation frame. */
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  recorder.stop();
  await finished;
  const blob = new Blob(chunks, { type: support.mimeType });
  if (blob.size === 0) throw new Error("The recorder produced no data. Nothing was written.");
  return { blob, frames: total, mimeType: support.mimeType };
}

/** A contact sheet of stills — always available, whatever the codec support. */
export function contactSheet(doc: VideoDoc, columns: number, rows: number, cell = 240): { canvas: HTMLCanvasElement; times: number[] } {
  const count = columns * rows;
  const cellHeight = Math.round((cell * doc.height) / doc.width);
  const canvas = makeCanvas(columns * cell, rows * cellHeight);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = "#0C0C0E";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const frame = makeCanvas(cell, cellHeight);
  const times: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = (index / Math.max(1, count - 1)) * Math.max(0, doc.duration - 1 / doc.fps);
    times.push(time);
    renderFrame(frame, doc, time);
    ctx.drawImage(frame, (index % columns) * cell, Math.floor(index / columns) * cellHeight);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect((index % columns) * cell, Math.floor(index / columns) * cellHeight + cellHeight - 16, 74, 16);
    ctx.fillStyle = "#fff";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(timecodeShort(time, doc.fps), (index % columns) * cell + 4, Math.floor(index / columns) * cellHeight + cellHeight - 4);
  }
  return { canvas, times };
}

function timecodeShort(seconds: number, fps: number): string {
  const total = Math.max(0, Math.round(seconds * fps));
  const frames = total % fps;
  const whole = Math.floor(total / fps);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

/** Play a mixed buffer of the generated samples through the Web Audio API. */
export async function playSamples(samples: Float32Array, sampleRate: number): Promise<{ stop: () => void }> {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("This browser has no Web Audio support, so the mix cannot be played.");
  const context = new Context();
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.connect(context.destination);
  node.start();
  return {
    stop: () => {
      try { node.stop(); } catch { /* already stopped */ }
      void context.close();
    },
  };
}
