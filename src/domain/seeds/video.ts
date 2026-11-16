import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Video fixtures. No video file is stored: a source carries the look and
 * the motion the renderer draws from, and an audio source carries the
 * synth the samples are generated from.
 * ====================================================================== */

registerSeed("video", (ctx) => {
  const records: Rec[] = [];

  records.push(ctx.rec({
    org: "nl", collection: "videos", n: 20, title: "Clerkenwell showroom film",
    status: "in_review",
    summary: "Ninety seconds: the walk in, the Arc Lamp, hands at the bench, the ask. Picture, titles and a music bed, with captions typed by hand.",
    owner: "Sofia Marín",
    tags: ["film", "trade"],
    fields: { kind: "sequence", fps: 25, width: 1280, height: 720, duration: 44, sharedWith: "Maya Chen" },
    body: {
      version: 2,
      fps: 25, width: 1280, height: 720, duration: 44,
      tracks: [
        { id: "tr-a1", name: "Music", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 52, gainDb: -14, pan: 0 },
        { id: "tr-a2", name: "Room tone", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 46, gainDb: -22, pan: 0 },
        { id: "tr-v1", name: "Picture", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 58 },
        { id: "tr-t1", name: "Titles", kind: "title", order: 2, muted: false, solo: false, locked: false, height: 40 },
      ],
      clips: [
        { id: "c-door", trackId: "tr-v1", start: 0, sourceIn: 0, duration: 9, sourceId: "src-door", name: "Walking in", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [{ id: "fx-1", kind: "exposure", amount: 6, bypassed: false }], fadeIn: 1, fadeOut: 0 },
        { id: "c-lamp", trackId: "tr-v1", start: 9, sourceIn: 1.2, duration: 14, sourceId: "src-lamp", name: "Arc Lamp", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [{ id: "fx-2", kind: "temperature", amount: 22, bypassed: false }, { id: "fx-3", kind: "contrast", amount: 10, bypassed: false }], fadeIn: 0, fadeOut: 0 },
        { id: "c-hands", trackId: "tr-v1", start: 23, sourceIn: 0.5, duration: 12, sourceId: "src-hands", name: "At the bench", opacity: 1, transform: { scale: 1.04, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0 },
        { id: "c-wide", trackId: "tr-v1", start: 35, sourceIn: 2, duration: 9, sourceId: "src-door", name: "Wide again", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 2 },
        { id: "t-open", trackId: "tr-t1", start: 1.5, sourceIn: 0, duration: 5, sourceId: "", name: "Opening title", text: "Northline Lighting\nClerkenwell", textStyle: { size: 72, weight: 700, color: "#FFFFFF", align: "center", family: "Inter" }, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0.6, fadeOut: 0.6 },
        { id: "t-end", trackId: "tr-t1", start: 37, sourceIn: 0, duration: 6, sourceId: "", name: "End card", text: "Trade appointments\nTuesdays and Thursdays", textStyle: { size: 48, weight: 650, color: "#FFE2A8", align: "center", family: "Inter" }, opacity: 1, transform: { scale: 1, x: 0, y: 14, rotation: 0 }, effects: [], fadeIn: 0.5, fadeOut: 1 },
        { id: "a-music", trackId: "tr-a1", start: 0, sourceIn: 0, duration: 44, sourceId: "src-music", name: "Bed — slow", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -8, fadeIn: 2, fadeOut: 3 },
        { id: "a-room", trackId: "tr-a2", start: 0, sourceIn: 0, duration: 44, sourceId: "src-room", name: "Room tone", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -18, fadeIn: 0.5, fadeOut: 1 },
      ],
      transitions: [
        { id: "x-1", fromClipId: "c-door", toClipId: "c-lamp", kind: "cross-dissolve", duration: 1 },
        { id: "x-2", fromClipId: "c-hands", toClipId: "c-wide", kind: "dip-to-black", duration: 0.8 },
      ],
      captions: [
        { id: "cap-1", start: 2, end: 6.5, text: "The showroom is on a quiet street in Clerkenwell.", speaker: "Maya", reviewed: true, language: "en" },
        { id: "cap-2", start: 9.5, end: 14, text: "Every Arc Lamp is brushed and lacquered here.", speaker: "Maya", reviewed: true, language: "en" },
        { id: "cap-3", start: 14.5, end: 19, text: "The shade takes the longest: three weeks is an honest lead time.", speaker: "Maya", reviewed: false, language: "en" },
        { id: "cap-4", start: 24, end: 29, text: "Trade orders of four or more take ten percent off.", speaker: "Sofia", reviewed: false, language: "en" },
        { id: "cap-5", start: 37.5, end: 42, text: "Appointments are Tuesdays and Thursdays.", speaker: "Sofia", reviewed: false, language: "en" },
      ],
      sources: [
        { id: "src-door", name: "Front door, wide", kind: "video", duration: 24, look: { hue: 208, motion: "push", subject: "room", grain: 0.05 }, license: "Company-owned", credit: "Sofia Marín", proxy: "generated" },
        { id: "src-lamp", name: "Arc Lamp, turning", kind: "video", duration: 30, look: { hue: 32, motion: "orbit", subject: "lamp", grain: 0.06 }, license: "Company-owned", credit: "Sofia Marín", proxy: "generated" },
        { id: "src-hands", name: "Hands at the bench", kind: "video", duration: 22, look: { hue: 18, motion: "pan", subject: "hands", grain: 0.07 }, license: "Model released", credit: "Theo Marsh, released", proxy: "generated" },
        { id: "src-bars", name: "Colour bars", kind: "video", duration: 10, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, license: "Company-owned", credit: "generated", proxy: "generated" },
        { id: "src-music", name: "Bed — slow", kind: "audio", duration: 60, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 98, kind: "music", tempo: 76 }, license: "Licensed — unlimited", credit: "library track, invoice 2026-114" },
        { id: "src-room", name: "Room tone", kind: "audio", duration: 60, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 84, kind: "room", tempo: 90 }, license: "Company-owned", credit: "recorded on location" },
        { id: "src-vo", name: "Narration — take 3", kind: "audio", duration: 40, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 128, kind: "voice", tempo: 90 }, license: "Model released", credit: "Maya Chen, consent on file" },
      ],
      markers: [
        { id: "mk-1", time: 9, text: "The dissolve into the lamp lands a beat late.", author: "Maya Chen", at: "2026-11-12T15:20:00.000Z", resolved: false },
        { id: "mk-2", time: 29.5, text: "Hold the bench shot two seconds longer.", author: "Maya Chen", at: "2026-11-12T15:22:00.000Z", resolved: false },
        { id: "mk-3", time: 1.5, text: "Title card reads well.", author: "Sofia Marín", at: "2026-11-13T09:10:00.000Z", resolved: true },
      ],
      reviews: [
        { id: "rv-1", at: "2026-11-12T16:00:00.000Z", by: "Maya Chen", state: "changes", note: "Two timing notes on the cut; otherwise this is close.", revision: 1 },
      ],
      renders: [
        { id: "job-1", at: "2026-11-11T18:05:00.000Z", by: "Sofia Marín", preset: "720p WebM", state: "done", artifact: "clerkenwell-showroom-film-720p.webm", bytes: 7_412_880, frames: 1100, note: "1100 frames recorded as video/webm;codecs=vp9. The file was verified to be 7412880 bytes before it was offered." },
        { id: "job-2", at: "2026-11-12T09:40:00.000Z", by: "Sofia Marín", preset: "1080p WebM", state: "failed", note: "The tab was backgrounded part way through and the recorder stalled. Nothing was written." },
      ],
      loudnessTarget: -16,
    },
  }));

  records.push(ctx.rec({
    org: "nl", collection: "videos", n: 21, title: "Arc Lamp — fifteen second cut",
    status: "draft",
    summary: "A short social cut with one source offline, so the missing-media behaviour is visible.",
    owner: "Sofia Marín",
    tags: ["social"],
    fields: { kind: "sequence", fps: 30, width: 1080, height: 1080, duration: 15 },
    body: {
      version: 2,
      fps: 30, width: 1080, height: 1080, duration: 15,
      tracks: [
        { id: "tr-a1", name: "Music", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 48, gainDb: -10, pan: 0 },
        { id: "tr-v1", name: "Picture", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 56 },
        { id: "tr-t1", name: "Titles", kind: "title", order: 2, muted: false, solo: false, locked: false, height: 40 },
      ],
      clips: [
        { id: "s-1", trackId: "tr-v1", start: 0, sourceIn: 0, duration: 6, sourceId: "src-lamp-sq", name: "Lamp", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0.3, fadeOut: 0 },
        { id: "s-2", trackId: "tr-v1", start: 6, sourceIn: 0, duration: 9, sourceId: "src-offline", name: "Detail (offline)", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0.5 },
        { id: "s-t", trackId: "tr-t1", start: 10, sourceIn: 0, duration: 5, sourceId: "", name: "Price card", text: "£900 ex VAT", textStyle: { size: 86, weight: 700, color: "#FFFFFF", align: "center", family: "Inter" }, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0.3, fadeOut: 0.3 },
        { id: "s-a", trackId: "tr-a1", start: 0, sourceIn: 4, duration: 15, sourceId: "src-music-sq", name: "Bed", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -6, fadeIn: 0.5, fadeOut: 1.5 },
      ],
      transitions: [],
      captions: [],
      sources: [
        { id: "src-lamp-sq", name: "Lamp, square", kind: "video", duration: 20, look: { hue: 36, motion: "push", subject: "lamp", grain: 0.05 }, license: "Company-owned", credit: "Sofia Marín", proxy: "generated" },
        { id: "src-offline", name: "Brass detail — card removed", kind: "video", duration: 18, look: { hue: 40, motion: "static", subject: "lamp", grain: 0.05 }, missing: true, license: "Unknown", credit: "not recorded", proxy: "none" },
        { id: "src-music-sq", name: "Bed — short", kind: "audio", duration: 40, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 132, kind: "music", tempo: 104 }, license: "Licensed — single use", credit: "library track" },
      ],
      markers: [],
      reviews: [],
      renders: [],
      loudnessTarget: -14,
    },
  }));

  records.push(ctx.rec({
    org: "hb", collection: "videos", n: 20, title: "Roast day",
    status: "active",
    summary: "A thirty second piece on the Tuesday roast, with narration consent recorded against the voice source.",
    owner: "Dana Brooks",
    tags: ["retail"],
    fields: { kind: "sequence", fps: 24, width: 1920, height: 1080, duration: 30 },
    body: {
      version: 2,
      fps: 24, width: 1920, height: 1080, duration: 30,
      tracks: [
        { id: "tr-a1", name: "Narration", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 52, gainDb: -4, pan: 0 },
        { id: "tr-a2", name: "Bed", kind: "audio", order: 0, muted: false, solo: false, locked: false, height: 46, gainDb: -20, pan: 0 },
        { id: "tr-v1", name: "Picture", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 56 },
      ],
      clips: [
        { id: "h-1", trackId: "tr-v1", start: 0, sourceIn: 0, duration: 12, sourceId: "hb-roast", name: "Drum", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [{ id: "f1", kind: "saturation", amount: 10, bypassed: false }], fadeIn: 0.8, fadeOut: 0 },
        { id: "h-2", trackId: "tr-v1", start: 12, sourceIn: 2, duration: 18, sourceId: "hb-bags", name: "Bagging", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 1.5 },
        { id: "h-vo", trackId: "tr-a1", start: 1, sourceIn: 0, duration: 26, sourceId: "hb-vo", name: "Narration", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -3, fadeIn: 0.3, fadeOut: 0.6 },
        { id: "h-bed", trackId: "tr-a2", start: 0, sourceIn: 0, duration: 30, sourceId: "hb-bed", name: "Bed", opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], gainDb: -16, fadeIn: 1, fadeOut: 2 },
      ],
      transitions: [{ id: "hx-1", fromClipId: "h-1", toClipId: "h-2", kind: "wipe-left", duration: 0.6 }],
      captions: [
        { id: "hc-1", start: 1.5, end: 6, text: "Tuesday is roast day, and it starts at five.", speaker: "Dana", reviewed: true, language: "en" },
        { id: "hc-2", start: 13, end: 18.5, text: "Bagging happens the same afternoon so it ships Wednesday.", speaker: "Dana", reviewed: true, language: "en" },
      ],
      sources: [
        { id: "hb-roast", name: "Roaster drum", kind: "video", duration: 24, look: { hue: 24, motion: "orbit", subject: "lamp", grain: 0.06 }, license: "Company-owned", credit: "Dana Brooks", proxy: "generated" },
        { id: "hb-bags", name: "Bagging", kind: "video", duration: 26, look: { hue: 14, motion: "pan", subject: "bag", grain: 0.05 }, license: "Company-owned", credit: "Dana Brooks", proxy: "generated" },
        { id: "hb-vo", name: "Narration — Dana", kind: "audio", duration: 30, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 120, kind: "voice", tempo: 88 }, license: "Model released", credit: "Dana Brooks, consent recorded 2026-11-04" },
        { id: "hb-bed", name: "Bed — warm", kind: "audio", duration: 60, look: { hue: 0, motion: "static", subject: "bars", grain: 0 }, tone: { root: 88, kind: "music", tempo: 70 }, license: "Licensed — unlimited", credit: "library track" },
      ],
      markers: [],
      reviews: [{ id: "hrv-1", at: "2026-11-13T14:00:00.000Z", by: "Elena Ward", state: "approved", note: "Good to go for the newsletter.", revision: 1 }],
      renders: [],
      loudnessTarget: -16,
    },
  }));

  return { records };
});
