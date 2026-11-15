/* ====================================================================== *
 * Non-linear editing model.
 *
 * A sequence is tracks of clips on a frame-accurate timebase. Everything
 * that changes a clip — trim, ripple, roll, slip, split, move — is a pure
 * function here, so the pointer path, the keyboard path and the tests all
 * go through the same arithmetic.
 *
 * There is no video file in this workspace. A clip's picture is generated
 * from its source definition at the exact time asked for, which is why the
 * preview can be frame accurate: the renderer is deterministic.
 * ====================================================================== */

import { clamp } from "@/applications/visual/geometry";

export type TrackKind = "video" | "title" | "audio";

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  /** Higher numbers paint later. */
  order: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  height: number;
  /** Audio tracks: gain in decibels. */
  gainDb?: number;
  pan?: number;
}

export interface Transform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
}

export interface ClipEffect {
  id: string;
  kind: "exposure" | "contrast" | "saturation" | "temperature" | "blur" | "lut";
  amount: number;
  /** LUT effects name the look they apply. */
  lut?: string;
  bypassed: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  /** Where the clip starts on the timeline, in seconds. */
  start: number;
  /** Where the clip starts inside its source, in seconds. */
  sourceIn: number;
  duration: number;
  sourceId: string;
  name: string;
  opacity: number;
  transform: Transform;
  effects: ClipEffect[];
  /** Title clips. */
  text?: string;
  textStyle?: { size: number; weight: number; color: string; align: "start" | "center" | "end"; family: string };
  /** Audio clips. */
  gainDb?: number;
  /** Seconds of fade at each end. */
  fadeIn: number;
  fadeOut: number;
  locked?: boolean;
}

export interface Transition {
  id: string;
  /** The clip the transition ends on. */
  toClipId: string;
  fromClipId: string;
  kind: "cross-dissolve" | "dip-to-black" | "wipe-left";
  duration: number;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  /** Captions produced without a person checking them say so. */
  reviewed: boolean;
  language: string;
}

export interface MediaSource {
  id: string;
  name: string;
  kind: "video" | "audio" | "graphic";
  /** Full length of the source material in seconds. */
  duration: number;
  /** Deterministic generator parameters — this is what the renderer draws. */
  look: { hue: number; motion: "pan" | "push" | "orbit" | "static"; subject: "lamp" | "room" | "hands" | "bag" | "bars"; grain: number };
  /** Audio sources: the synth that produces the samples. */
  tone?: { root: number; kind: "room" | "music" | "voice"; tempo: number };
  /** A source the project references but cannot find. */
  missing?: boolean;
  /** Where the material came from, and under what licence. */
  license: string;
  credit: string;
  proxy?: "none" | "generated";
  sampleRate?: number;
}

export interface RenderJob {
  id: string;
  at: string;
  by: string;
  preset: string;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  /** What was actually produced, named honestly. */
  artifact?: string;
  bytes?: number;
  frames?: number;
  note: string;
}

export interface VideoDoc {
  version: 2;
  fps: number;
  width: number;
  height: number;
  duration: number;
  tracks: Track[];
  clips: Clip[];
  transitions: Transition[];
  captions: Caption[];
  sources: MediaSource[];
  markers: { id: string; time: number; text: string; author: string; at: string; resolved: boolean }[];
  reviews: { id: string; at: string; by: string; state: "approved" | "changes" | "pending"; note: string; revision: number; digest?: string }[];
  renders: RenderJob[];
  /** Loudness target for the mix, in LUFS. */
  loudnessTarget: number;
  activeClipId?: string;
}

/* ====================================================================== *
 * Timebase
 * ====================================================================== */

export function toFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

export function toSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/** Snap a time to the nearest whole frame — the timeline never holds a fraction. */
export function snapFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps;
}

export function timecode(seconds: number, fps: number): string {
  const total = Math.max(0, Math.round(seconds * fps));
  const frames = total % fps;
  const whole = Math.floor(total / fps);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}:${pad(frames)}`;
}

/** SRT uses milliseconds, not frames. */
export function srtTime(seconds: number): string {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)},${pad(ms, 3)}`;
}

/**
 * A source may have been shot at another rate. Conforming it to the
 * sequence rate is a frame mapping, not a guess, and it is applied the same
 * way everywhere so the timebase stays stable.
 */
export function conformTime(sourceSeconds: number, sourceFps: number, sequenceFps: number): number {
  if (sourceFps === sequenceFps) return sourceSeconds;
  return toSeconds(Math.round(toFrames(sourceSeconds, sourceFps) * (sequenceFps / sourceFps)), sequenceFps);
}

/* ====================================================================== *
 * Reads
 * ====================================================================== */

export function clipsOnTrack(doc: VideoDoc, trackId: string): Clip[] {
  return doc.clips.filter((clip) => clip.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function clipEnd(clip: Clip): number {
  return clip.start + clip.duration;
}

export function clipAt(doc: VideoDoc, trackId: string, time: number): Clip | undefined {
  return doc.clips.find((clip) => clip.trackId === trackId && time >= clip.start && time < clipEnd(clip));
}

/** Every clip live at a time, bottom track first, which is paint order. */
export function stackAt(doc: VideoDoc, time: number): { clip: Clip; track: Track }[] {
  const tracks = [...doc.tracks].sort((a, b) => a.order - b.order);
  const out: { clip: Clip; track: Track }[] = [];
  const soloed = doc.tracks.some((track) => track.solo);
  for (const track of tracks) {
    if (track.muted) continue;
    if (soloed && !track.solo) continue;
    const clip = clipAt(doc, track.id, time);
    if (clip) out.push({ clip, track });
  }
  return out;
}

export function sequenceDuration(doc: VideoDoc): number {
  return doc.clips.reduce((longest, clip) => Math.max(longest, clipEnd(clip)), 0);
}

export function sourceOf(doc: VideoDoc, clip: Clip): MediaSource | undefined {
  return doc.sources.find((source) => source.id === clip.sourceId);
}

/** The transition that covers a time, if any. */
export function transitionAt(doc: VideoDoc, time: number): { transition: Transition; progress: number; from: Clip; to: Clip } | undefined {
  for (const transition of doc.transitions) {
    const to = doc.clips.find((clip) => clip.id === transition.toClipId);
    const from = doc.clips.find((clip) => clip.id === transition.fromClipId);
    if (!to || !from) continue;
    const begin = to.start;
    const end = to.start + transition.duration;
    if (time >= begin && time < end) {
      return { transition, progress: (time - begin) / Math.max(transition.duration, 1e-6), from, to };
    }
  }
  return undefined;
}

/* ====================================================================== *
 * Edits
 * ====================================================================== */

function replaceClips(doc: VideoDoc, clips: Clip[]): VideoDoc {
  return { ...doc, clips, duration: Math.max(doc.duration, clips.reduce((longest, clip) => Math.max(longest, clipEnd(clip)), 0)) };
}

export function patchClip(doc: VideoDoc, id: string, patch: Partial<Clip>): VideoDoc {
  return replaceClips(doc, doc.clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)));
}

/**
 * Trim one edge of a clip. The source in-point moves with the head so the
 * picture does not slide, and the clip is never shorter than one frame or
 * longer than the material it has left.
 */
export function trimClip(
  doc: VideoDoc,
  clipId: string,
  edge: "start" | "end",
  deltaSeconds: number,
  options: { ripple?: boolean } = {},
): VideoDoc {
  const clip = doc.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) return doc;
  const fps = doc.fps;
  const source = sourceOf(doc, clip);
  const minimum = 1 / fps;
  const delta = snapFrame(deltaSeconds, fps);

  let next: Clip;
  if (edge === "start") {
    const headroom = clip.sourceIn;
    const applied = clamp(delta, -headroom, clip.duration - minimum);
    next = {
      ...clip,
      start: snapFrame(clip.start + applied, fps),
      sourceIn: snapFrame(clip.sourceIn + applied, fps),
      duration: snapFrame(clip.duration - applied, fps),
    };
  } else {
    const tail = source ? source.duration - clip.sourceIn - clip.duration : Number.POSITIVE_INFINITY;
    const applied = clamp(delta, minimum - clip.duration, tail);
    next = { ...clip, duration: snapFrame(clip.duration + applied, fps) };
  }

  let clips = doc.clips.map((item) => (item.id === clipId ? next : item));

  if (options.ripple) {
    const shift = edge === "start" ? -(next.start - clip.start) - (clip.duration - next.duration) : next.duration - clip.duration;
    const later = clipEnd(clip);
    clips = clips.map((item) => (item.trackId === clip.trackId && item.id !== clipId && item.start >= later
      ? { ...item, start: snapFrame(item.start + shift, fps) }
      : item));
  }

  return replaceClips(doc, clips);
}

/**
 * Roll the edit between two adjacent clips: one grows by exactly what the
 * other loses, so nothing after the pair moves.
 */
export function rollEdit(doc: VideoDoc, leftId: string, rightId: string, deltaSeconds: number): VideoDoc {
  const left = doc.clips.find((clip) => clip.id === leftId);
  const right = doc.clips.find((clip) => clip.id === rightId);
  if (!left || !right) return doc;
  const fps = doc.fps;
  const minimum = 1 / fps;
  const leftSource = sourceOf(doc, left);
  const maxForward = Math.min(
    right.duration - minimum,
    right.sourceIn,
    leftSource ? leftSource.duration - left.sourceIn - left.duration : Number.POSITIVE_INFINITY,
  );
  const maxBack = Math.min(left.duration - minimum, left.sourceIn + left.duration);
  const delta = snapFrame(clamp(deltaSeconds, -maxBack, maxForward), fps);
  if (delta === 0) return doc;
  return replaceClips(doc, doc.clips.map((clip) => {
    if (clip.id === leftId) return { ...clip, duration: snapFrame(clip.duration + delta, fps) };
    if (clip.id === rightId) {
      return {
        ...clip,
        start: snapFrame(clip.start + delta, fps),
        sourceIn: snapFrame(clip.sourceIn + delta, fps),
        duration: snapFrame(clip.duration - delta, fps),
      };
    }
    return clip;
  }));
}

/** Slip a clip: the picture moves inside the clip, its position does not. */
export function slipClip(doc: VideoDoc, clipId: string, deltaSeconds: number): VideoDoc {
  const clip = doc.clips.find((item) => item.id === clipId);
  if (!clip) return doc;
  const source = sourceOf(doc, clip);
  const max = source ? source.duration - clip.duration : Number.POSITIVE_INFINITY;
  return patchClip(doc, clipId, { sourceIn: snapFrame(clamp(clip.sourceIn + deltaSeconds, 0, Math.max(0, max)), doc.fps) });
}

/** Split a clip at a time, keeping both halves on the same source. */
export function splitClip(doc: VideoDoc, clipId: string, time: number): { doc: VideoDoc; newClipId?: string } {
  const clip = doc.clips.find((item) => item.id === clipId);
  if (!clip) return { doc };
  const cut = snapFrame(time, doc.fps);
  if (cut <= clip.start + 1 / doc.fps || cut >= clipEnd(clip) - 1 / doc.fps) return { doc };
  const left: Clip = { ...clip, duration: snapFrame(cut - clip.start, doc.fps) };
  const rightId = `${clip.id}-b${Math.round(cut * 1000)}`;
  const right: Clip = {
    ...clip,
    id: rightId,
    start: cut,
    sourceIn: snapFrame(clip.sourceIn + (cut - clip.start), doc.fps),
    duration: snapFrame(clipEnd(clip) - cut, doc.fps),
    fadeIn: 0,
  };
  const clips = doc.clips.flatMap((item) => (item.id === clipId ? [left, right] : [item]));
  return { doc: replaceClips(doc, clips), newClipId: rightId };
}

/** Move a clip, keeping it on frame and refusing to overlap a neighbour. */
export function moveClip(doc: VideoDoc, clipId: string, toStart: number, toTrackId?: string): VideoDoc {
  const clip = doc.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) return doc;
  const trackId = toTrackId ?? clip.trackId;
  const fps = doc.fps;
  let start = Math.max(0, snapFrame(toStart, fps));
  const neighbours = doc.clips.filter((item) => item.trackId === trackId && item.id !== clipId).sort((a, b) => a.start - b.start);
  for (const other of neighbours) {
    if (start < clipEnd(other) && start + clip.duration > other.start) {
      /* Push to whichever side is nearer. */
      const toLeft = other.start - clip.duration;
      const toRight = clipEnd(other);
      start = Math.abs(start - toLeft) < Math.abs(start - toRight) ? Math.max(0, toLeft) : toRight;
    }
  }
  return replaceClips(doc, doc.clips.map((item) => (item.id === clipId ? { ...item, start: snapFrame(start, fps), trackId } : item)));
}

/** Remove a clip and close the gap it leaves on its track. */
export function rippleDelete(doc: VideoDoc, clipId: string): VideoDoc {
  const clip = doc.clips.find((item) => item.id === clipId);
  if (!clip) return doc;
  const after = clipEnd(clip);
  const clips = doc.clips
    .filter((item) => item.id !== clipId)
    .map((item) => (item.trackId === clip.trackId && item.start >= after
      ? { ...item, start: snapFrame(item.start - clip.duration, doc.fps) }
      : item));
  return {
    ...replaceClips(doc, clips),
    transitions: doc.transitions.filter((transition) => transition.fromClipId !== clipId && transition.toClipId !== clipId),
  };
}

/** Gaps on a track, which an editor needs to see. */
export function gapsOnTrack(doc: VideoDoc, trackId: string): { start: number; duration: number }[] {
  const clips = clipsOnTrack(doc, trackId);
  const gaps: { start: number; duration: number }[] = [];
  let cursor = 0;
  for (const clip of clips) {
    if (clip.start > cursor + 1e-6) gaps.push({ start: cursor, duration: clip.start - cursor });
    cursor = Math.max(cursor, clipEnd(clip));
  }
  return gaps;
}

/* ====================================================================== *
 * Audio
 * ====================================================================== */

/**
 * Deterministic sample generation. There is no audio file here; a source's
 * `tone` describes a synth, and these are the samples the waveform is drawn
 * from and the mix is played from — the same numbers, not a decoration.
 */
export function renderSamples(source: MediaSource, seconds: number, sampleRate = 8000, offset = 0): Float32Array {
  const count = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(count);
  const tone = source.tone ?? { root: 110, kind: "room" as const, tempo: 96 };
  let seed = 0;
  for (let index = 0; index < source.id.length; index += 1) seed = (seed * 31 + source.id.charCodeAt(index)) >>> 0;
  let noise = seed || 1;

  for (let index = 0; index < count; index += 1) {
    const t = offset + index / sampleRate;
    noise = (noise * 1103515245 + 12345) & 0x7fffffff;
    const white = ((noise >> 15) / 32768) - 0.5;
    let value = 0;
    if (tone.kind === "music") {
      const beat = Math.floor(t * (tone.tempo / 60));
      const step = [0, 3, 5, 7, 10, 7, 5, 3][beat % 8];
      const frequency = tone.root * 2 ** (step / 12);
      value = Math.sin(2 * Math.PI * frequency * t) * 0.34
        + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.14
        + Math.sin(2 * Math.PI * frequency * 3 * t) * 0.05;
      const envelope = Math.exp(-((t * (tone.tempo / 60)) % 1) * 3.2);
      value *= 0.35 + envelope * 0.65;
    } else if (tone.kind === "voice") {
      const syllable = Math.sin(2 * Math.PI * 3.1 * t) * 0.5 + 0.5;
      const formant = Math.sin(2 * Math.PI * tone.root * t) * 0.5 + Math.sin(2 * Math.PI * tone.root * 1.7 * t) * 0.28;
      const gate = syllable > 0.42 ? 1 : 0.06;
      value = (formant + white * 0.22) * gate * 0.7;
    } else {
      value = white * 0.3 + Math.sin(2 * Math.PI * 52 * t) * 0.05 + Math.sin(2 * Math.PI * 118 * t) * 0.03;
    }
    out[index] = clamp(value, -1, 1);
  }
  return out;
}

/** Peak envelope for drawing: min and max per bucket, from the real samples. */
export function waveformPeaks(samples: Float32Array, buckets: number): { min: number; max: number }[] {
  const out: { min: number; max: number }[] = [];
  const size = Math.max(1, Math.floor(samples.length / Math.max(1, buckets)));
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    let min = 1;
    let max = -1;
    const begin = bucket * size;
    const end = Math.min(samples.length, begin + size);
    if (begin >= samples.length) { out.push({ min: 0, max: 0 }); continue; }
    for (let index = begin; index < end; index += 1) {
      const value = samples[index];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    out.push({ min, max });
  }
  return out;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-6));
}

export interface LoudnessReport {
  /** Root mean square in dBFS over the whole programme. */
  rms: number;
  peak: number;
  /** True peak is not measured; this is the sample peak and says so. */
  samplePeakDb: number;
  clippedSamples: number;
  /** An approximation of programme loudness, not a certified LUFS meter. */
  approximateLufs: number;
}

export function measureLoudness(samples: Float32Array): LoudnessReport {
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    sum += value * value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= 0.999) clipped += 1;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return {
    rms: gainToDb(rms),
    peak,
    samplePeakDb: gainToDb(peak),
    clippedSamples: clipped,
    approximateLufs: Math.round((gainToDb(rms) - 3) * 10) / 10,
  };
}

/** Mix every audible audio clip at a time window into one buffer. */
export function mixAudio(doc: VideoDoc, from: number, seconds: number, sampleRate = 8000): Float32Array {
  const count = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(count);
  const soloed = doc.tracks.some((track) => track.solo);
  for (const track of doc.tracks) {
    if (track.kind !== "audio" || track.muted) continue;
    if (soloed && !track.solo) continue;
    const trackGain = dbToGain(track.gainDb ?? 0);
    for (const clip of clipsOnTrack(doc, track.id)) {
      const source = doc.sources.find((item) => item.id === clip.sourceId);
      if (!source || source.missing) continue;
      const begin = Math.max(from, clip.start);
      const end = Math.min(from + seconds, clipEnd(clip));
      if (end <= begin) continue;
      const samples = renderSamples(source, end - begin, sampleRate, clip.sourceIn + (begin - clip.start));
      const clipGain = dbToGain(clip.gainDb ?? 0);
      const writeAt = Math.floor((begin - from) * sampleRate);
      for (let index = 0; index < samples.length && writeAt + index < count; index += 1) {
        const t = begin + index / sampleRate;
        let envelope = 1;
        if (clip.fadeIn > 0 && t < clip.start + clip.fadeIn) envelope *= (t - clip.start) / clip.fadeIn;
        if (clip.fadeOut > 0 && t > clipEnd(clip) - clip.fadeOut) envelope *= (clipEnd(clip) - t) / clip.fadeOut;
        out[writeAt + index] = clamp(out[writeAt + index] + samples[index] * clipGain * trackGain * clamp(envelope, 0, 1), -1, 1);
      }
    }
  }
  return out;
}

/* ====================================================================== *
 * Captions
 * ====================================================================== */

export function captionAt(doc: VideoDoc, time: number, language = "en"): Caption | undefined {
  return doc.captions.find((caption) => caption.language === language && time >= caption.start && time < caption.end);
}

export function splitCaption(doc: VideoDoc, captionId: string, at: number): VideoDoc {
  const caption = doc.captions.find((item) => item.id === captionId);
  if (!caption || at <= caption.start || at >= caption.end) return doc;
  const ratio = (at - caption.start) / (caption.end - caption.start);
  const cut = Math.max(1, Math.round(caption.text.length * ratio));
  const space = caption.text.lastIndexOf(" ", cut);
  const index = space > 0 ? space : cut;
  return {
    ...doc,
    captions: doc.captions.flatMap((item) => (item.id === captionId
      ? [
        { ...item, end: at, text: item.text.slice(0, index).trim() },
        { ...item, id: `${item.id}-b`, start: at, text: item.text.slice(index).trim(), reviewed: false },
      ]
      : [item])).sort((a, b) => a.start - b.start),
  };
}

export function captionsToSrt(captions: Caption[], language = "en"): string {
  return captions
    .filter((caption) => caption.language === language)
    .sort((a, b) => a.start - b.start)
    .map((caption, index) => `${index + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.speaker ? `${caption.speaker}: ` : ""}${caption.text}\n`)
    .join("\n");
}

export function captionsToVtt(captions: Caption[], language = "en"): string {
  const body = captions
    .filter((caption) => caption.language === language)
    .sort((a, b) => a.start - b.start)
    .map((caption) => `${srtTime(caption.start).replace(",", ".")} --> ${srtTime(caption.end).replace(",", ".")}\n${caption.speaker ? `<v ${caption.speaker}>` : ""}${caption.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

/** Caption problems a human reviewer would be asked to look at. */
export function captionIssues(doc: VideoDoc): { captionId: string; note: string }[] {
  const out: { captionId: string; note: string }[] = [];
  const sorted = [...doc.captions].sort((a, b) => a.start - b.start);
  for (const [index, caption] of sorted.entries()) {
    const seconds = caption.end - caption.start;
    const cps = caption.text.length / Math.max(seconds, 0.1);
    if (cps > 20) out.push({ captionId: caption.id, note: `${Math.round(cps)} characters a second is faster than most people read; 17 is a common ceiling.` });
    if (seconds < 1) out.push({ captionId: caption.id, note: `On screen for ${seconds.toFixed(2)}s, below the one second minimum.` });
    if (caption.text.length > 84) out.push({ captionId: caption.id, note: `${caption.text.length} characters is more than two lines of 42.` });
    const next = sorted[index + 1];
    if (next && next.start < caption.end) out.push({ captionId: caption.id, note: "Overlaps the next cue." });
    if (!caption.reviewed) out.push({ captionId: caption.id, note: "Not checked by a person yet." });
  }
  return out;
}
