/* ====================================================================== *
 * Raster output: the same sampled layers the stage draws, painted onto a
 * canvas, then encoded as WebM (by the browser's MediaRecorder) or GIF
 * (by the encoder below, written here so GIF never depends on a codec).
 * ====================================================================== */

import { sampleAll, type MotionDoc, type SampledLayer } from "./anim";
import { reducedFrame } from "./parts";

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser gave no 2D canvas, so nothing can be rendered.");
  return ctx;
}

function drawLayer(ctx: CanvasRenderingContext2D, sampled: SampledLayer): void {
  const { layer } = sampled;
  const cx = layer.box.w / 2;
  const cy = layer.box.h / 2;
  ctx.save();
  ctx.globalAlpha = sampled.opacity;
  ctx.translate(layer.box.x + sampled.x + cx, layer.box.y + sampled.y + cy);
  ctx.rotate((sampled.rotation * Math.PI) / 180);
  ctx.scale(sampled.scale, sampled.scale);
  ctx.translate(-cx, -cy);
  if (sampled.blur > 0) ctx.filter = `blur(${sampled.blur}px)`;
  ctx.fillStyle = sampled.colour;
  if (layer.kind === "rect") {
    const r = Math.min(layer.radius ?? 0, layer.box.w / 2, layer.box.h / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, layer.box.w, layer.box.h, r);
    else ctx.rect(0, 0, layer.box.w, layer.box.h);
    ctx.fill();
  } else if (layer.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cx, cy, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (layer.kind === "path" && layer.path) {
    ctx.fill(new Path2D(layer.path));
  } else if (layer.kind === "text") {
    const size = layer.textStyle?.size ?? 48;
    ctx.font = `${layer.textStyle?.weight ?? 700} ${size}px ${layer.textStyle?.family ?? "Inter"}, system-ui, sans-serif`;
    ctx.textBaseline = "alphabetic";
    const align = layer.textStyle?.align ?? "start";
    ctx.textAlign = align === "center" ? "center" : align === "end" ? "right" : "left";
    const x = align === "center" ? cx : align === "end" ? layer.box.w : 0;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${sampled.letterSpacing}px`;
    ctx.fillText(layer.text ?? "", x, size * 0.82);
  }
  ctx.restore();
}

/** Paint the composition at a time. `scale` maps composition pixels to canvas pixels. */
export function renderFrame(canvas: HTMLCanvasElement, doc: MotionDoc, time: number, options: { reduced?: boolean } = {}): void {
  const ctx = ctx2d(canvas);
  const scale = canvas.width / doc.width;
  const alt = options.reduced ? reducedFrame(doc, time) : { time, fade: 1 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = doc.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  ctx.globalAlpha = alt.fade;
  for (const sampled of sampleAll(doc, alt.time)) {
    ctx.save();
    ctx.globalAlpha = alt.fade;
    drawLayer(ctx, { ...sampled, opacity: sampled.opacity * alt.fade });
    ctx.restore();
  }
  ctx.restore();
}

export function frameDataUrl(doc: MotionDoc, time: number, width = 240, reduced = false): string {
  const canvas = makeCanvas(width, (width * doc.height) / doc.width);
  renderFrame(canvas, doc, time, { reduced });
  return canvas.toDataURL("image/png");
}

/* ------------------------------ WebM ------------------------------ */

export function recorderSupport(): { webm: boolean; mimeType: string | null; reason: string } {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    return { webm: false, mimeType: null, reason: "This browser has no MediaRecorder for a canvas stream, so it cannot encode video. GIF still works." };
  }
  for (const candidate of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(candidate)) return { webm: true, mimeType: candidate, reason: `This browser encodes ${candidate}.` };
  }
  return { webm: false, mimeType: null, reason: "MediaRecorder is present but supports no WebM profile here." };
}

export interface Progress { frame: number; frames: number }

/**
 * Real-time recording: each frame is painted when its time comes and the
 * browser's encoder takes the canvas stream, so the file is as long as the
 * composition and plays at its frame rate.
 */
export async function renderWebm(
  doc: MotionDoc,
  options: { width: number; fps: number; reduced?: boolean; onProgress?: (progress: Progress) => void; signal?: { cancelled: boolean } },
): Promise<{ blob: Blob; frames: number; mimeType: string }> {
  const support = recorderSupport();
  if (!support.webm || !support.mimeType) throw new Error(support.reason);
  const canvas = makeCanvas(options.width, (options.width * doc.height) / doc.width);
  renderFrame(canvas, doc, 0, { reduced: options.reduced });
  const stream = canvas.captureStream(options.fps);
  const recorder = new MediaRecorder(stream, { mimeType: support.mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  const total = Math.max(1, Math.round(doc.duration * options.fps));
  recorder.start(250);
  const started = performance.now();
  for (let frame = 0; frame < total; frame += 1) {
    if (options.signal?.cancelled) break;
    const due = started + (frame * 1000) / options.fps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    renderFrame(canvas, doc, frame / options.fps, { reduced: options.reduced });
    options.onProgress?.({ frame: frame + 1, frames: total });
  }
  await new Promise((resolve) => setTimeout(resolve, 1000 / options.fps));
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  await stopped;
  const blob = new Blob(chunks, { type: "video/webm" });
  if (blob.size === 0) throw new Error("The recorder produced no data, so no file was written.");
  return { blob, frames: total, mimeType: support.mimeType };
}

/* ------------------------------ GIF ------------------------------ */

/* A fixed 6×7×6 colour cube (252 entries, padded to 256). Fixed palettes
   band on gradients, which the compatibility table declares. */
const LEVELS_R = 6;
const LEVELS_G = 7;
const LEVELS_B = 6;

function palette(): Uint8Array {
  const out = new Uint8Array(256 * 3);
  let index = 0;
  for (let r = 0; r < LEVELS_R; r += 1) {
    for (let g = 0; g < LEVELS_G; g += 1) {
      for (let b = 0; b < LEVELS_B; b += 1) {
        out[index * 3] = Math.round((r * 255) / (LEVELS_R - 1));
        out[index * 3 + 1] = Math.round((g * 255) / (LEVELS_G - 1));
        out[index * 3 + 2] = Math.round((b * 255) / (LEVELS_B - 1));
        index += 1;
      }
    }
  }
  return out;
}

function quantise(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    const r = Math.round((rgba[i] * (LEVELS_R - 1)) / 255);
    const g = Math.round((rgba[i + 1] * (LEVELS_G - 1)) / 255);
    const b = Math.round((rgba[i + 2] * (LEVELS_B - 1)) / 255);
    out[p] = r * LEVELS_G * LEVELS_B + g * LEVELS_B + b;
  }
  return out;
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private buffer = new Uint8Array(65536);
  private length = 0;
  byte(value: number) {
    if (this.length === this.buffer.length) { this.chunks.push(this.buffer); this.buffer = new Uint8Array(65536); this.length = 0; }
    this.buffer[this.length] = value & 0xff;
    this.length += 1;
  }
  short(value: number) { this.byte(value & 0xff); this.byte((value >> 8) & 0xff); }
  bytes(values: ArrayLike<number>) { for (let i = 0; i < values.length; i += 1) this.byte(values[i]); }
  text(value: string) { for (let i = 0; i < value.length; i += 1) this.byte(value.charCodeAt(i)); }
  blob(type: string): Blob {
    const parts: BlobPart[] = [...this.chunks.map((chunk) => chunk.slice().buffer), this.buffer.slice(0, this.length).buffer];
    return new Blob(parts, { type });
  }
}

/** GIF LZW: variable code size from minCodeSize + 1 up to 12 bits, with clear codes. */
function lzw(indices: Uint8Array, minCodeSize: number, out: ByteWriter): void {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map<number, number>();
  const block: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
      if (block.length === 255) { out.byte(255); out.bytes(block); block.length = 0; }
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const symbol = indices[i];
    const key = (prefix << 8) | symbol;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next);
      next += 1;
      if (next > 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }
    prefix = symbol;
  }
  emit(prefix);
  emit(eoi);
  if (bitCount > 0) block.push(bitBuffer & 0xff);
  if (block.length > 0) { out.byte(block.length); out.bytes(block); }
  out.byte(0);
}

export async function renderGif(
  doc: MotionDoc,
  options: { width: number; fps: number; loop: boolean; reduced?: boolean; onProgress?: (progress: Progress) => void; signal?: { cancelled: boolean } },
): Promise<{ blob: Blob; frames: number }> {
  const width = Math.max(16, Math.round(options.width));
  const height = Math.max(16, Math.round((width * doc.height) / doc.width));
  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  const fps = Math.min(50, Math.max(1, options.fps));
  const total = Math.max(1, Math.round(doc.duration * fps));
  const delay = Math.max(2, Math.round(100 / fps));
  const out = new ByteWriter();
  out.text("GIF89a");
  out.short(width);
  out.short(height);
  out.byte(0xf7); // global colour table, 8 bits, 256 entries
  out.byte(0);
  out.byte(0);
  out.bytes(palette());
  if (options.loop) {
    out.byte(0x21); out.byte(0xff); out.byte(11); out.text("NETSCAPE2.0");
    out.byte(3); out.byte(1); out.short(0); out.byte(0);
  }
  for (let frame = 0; frame < total; frame += 1) {
    if (options.signal?.cancelled) throw new Error("Cancelled. No file was written.");
    renderFrame(canvas, doc, frame / fps, { reduced: options.reduced });
    const indices = quantise(ctx.getImageData(0, 0, width, height).data);
    out.byte(0x21); out.byte(0xf9); out.byte(4); out.byte(0); out.short(delay); out.byte(0); out.byte(0);
    out.byte(0x2c); out.short(0); out.short(0); out.short(width); out.short(height); out.byte(0);
    out.byte(8);
    lzw(indices, 8, out);
    options.onProgress?.({ frame: frame + 1, frames: total });
    if (frame % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  out.byte(0x3b);
  return { blob: out.blob("image/gif"), frames: total };
}
