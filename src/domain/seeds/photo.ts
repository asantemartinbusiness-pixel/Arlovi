import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Photo fixtures. The pixel data is generated in the browser when a
 * document is opened, so the seed carries the structure — layers, blend
 * modes, adjustment settings, rights — rather than megabytes of PNG.
 * ====================================================================== */

const NEUTRAL = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };

const PRESETS = [
  { id: "pr-neutral", name: "Neutral", adjust: NEUTRAL },
  { id: "pr-product", name: "Product — clean and bright", adjust: { ...NEUTRAL, exposure: 0.35, contrast: 12, saturation: 6, highlights: -10, curve: [{ x: 0, y: 6 }, { x: 128, y: 136 }, { x: 255, y: 250 }] } },
  { id: "pr-warm", name: "Showroom warmth", adjust: { ...NEUTRAL, exposure: 0.1, temperature: 22, saturation: 10, shadows: 8 } },
  { id: "pr-mono", name: "Monochrome press", adjust: { ...NEUTRAL, saturation: -100, contrast: 20, curve: [{ x: 0, y: 0 }, { x: 110, y: 96 }, { x: 255, y: 255 }] } },
];

interface SeedLayer {
  id: string; name: string; kind: string; visible: boolean; locked: boolean;
  opacity: number; blend: string; x: number; y: number; w: number; h: number; rotation: number;
  color?: string; adjust?: typeof NEUTRAL; parentId?: string;
}

function doc(width: number, height: number, layers: SeedLayer[], extra: Record<string, unknown> = {}) {
  return {
    version: 2, width, height, layers,
    activeLayerId: layers[layers.length - 1]?.id ?? layers[0]?.id,
    presets: PRESETS,
    profile: "sRGB IEC61966-2.1",
    rights: { license: "Company-owned", credit: "not recorded" },
    origin: "The background layer holds a raster generated in this canvas — a lit gradient with film grain. It is real pixel data, not a stand-in preview; replace it by importing a photograph.",
    history: [],
    ...extra,
  };
}

function base(width: number, height: number, name = "Background"): SeedLayer {
  return { id: "layer-base", name, kind: "pixel", visible: true, locked: false, opacity: 1, blend: "normal", x: 0, y: 0, w: width, h: height, rotation: 0 };
}

registerSeed("photo", (ctx) => {
  const records: Rec[] = [];

  records.push(ctx.rec({
    org: "nl", collection: "photos", n: 20, title: "Arc Lamp on the bench",
    status: "active",
    summary: "Product shot with a warm grade and a vignette, built from an adjustment layer and a multiply fill.",
    owner: "Sofia Marín",
    tags: ["product", "trade"],
    fields: { kind: "image", width: 1200, height: 800, album: "Arc Lamp", license: "Company-owned", credit: "Sofia Marín" },
    body: doc(1200, 800, [
      base(1200, 800, "Bench plate"),
      { id: "layer-vignette", name: "Vignette", kind: "fill", visible: true, locked: false, opacity: 0.42, blend: "multiply", color: "#1A1208", x: 0, y: 0, w: 1200, h: 800, rotation: 0 },
      { id: "layer-warm", name: "Showroom warmth", kind: "adjustment", visible: true, locked: false, opacity: 1, blend: "normal", x: 0, y: 0, w: 0, h: 0, rotation: 0, adjust: { ...NEUTRAL, exposure: 0.22, contrast: 14, temperature: 20, saturation: 8, shadows: 10 } },
    ], {
      rights: { license: "Company-owned", credit: "Sofia Marín" },
      history: [{ id: "h-1", at: "2026-11-12T10:20:00.000Z", by: "Sofia Marín", label: "Warm grade applied" }],
    }),
  }));

  records.push(ctx.rec({
    org: "nl", collection: "photos", n: 21, title: "Showroom wide — needs rights",
    status: "imported",
    summary: "Imported from a supplier pack. The licence is unknown, so it must not be published.",
    owner: "Maya Chen",
    tags: ["showroom"],
    fields: { kind: "image", width: 1400, height: 900, album: "Showroom", license: "Unknown", importedAt: "2026-11-13T08:15:00.000Z" },
    body: doc(1400, 900, [base(1400, 900, "Imported frame")], {
      rights: { license: "Unknown", credit: "supplier pack, source not recorded" },
      origin: "Imported into the library. The pixels shown are generated in this canvas because the original file was not kept with the record.",
    }),
  }));

  records.push(ctx.rec({
    org: "nl", collection: "photos", n: 22, title: "Brass detail — unreadable TIFF",
    status: "unreadable",
    summary: "TIFF is not decoded by browsers. The record is kept with the reason rather than being dropped from the library.",
    owner: "Maya Chen",
    tags: ["detail"],
    fields: { kind: "image", bytes: 18_400_000, album: "Arc Lamp", license: "Unknown" },
  }));

  records.push(ctx.rec({
    org: "hb", collection: "photos", n: 20, title: "Roastery counter",
    status: "active",
    summary: "Counter shot with a monochrome press variant kept as a second adjustment layer, switched off.",
    owner: "Dana Brooks",
    tags: ["retail"],
    fields: { kind: "image", width: 1080, height: 720, album: "Roastery", license: "Company-owned", credit: "Dana Brooks", sharedWith: "Elena Ward" },
    body: doc(1080, 720, [
      base(1080, 720, "Counter"),
      { id: "layer-press", name: "Monochrome press", kind: "adjustment", visible: false, locked: false, opacity: 1, blend: "normal", x: 0, y: 0, w: 0, h: 0, rotation: 0, adjust: { ...NEUTRAL, saturation: -100, contrast: 20, curve: [{ x: 0, y: 0 }, { x: 110, y: 96 }, { x: 255, y: 255 }] } },
      { id: "layer-lift", name: "Shadow lift", kind: "adjustment", visible: true, locked: false, opacity: 0.8, blend: "normal", x: 0, y: 0, w: 0, h: 0, rotation: 0, adjust: { ...NEUTRAL, shadows: 22, highlights: -14 } },
    ], { rights: { license: "Company-owned", credit: "Dana Brooks" } }),
  }));

  return { records };
});
