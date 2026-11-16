import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Motion fixtures: compositions with real keyframes on real properties,
 * a brand template with interaction states, one with a missing linked
 * asset, and one whose flashing should trigger an accessibility review.
 * ====================================================================== */

const EASE = { kind: "bezier", points: [0.25, 0.1, 0.25, 1] };
const OUT = { kind: "bezier", points: [0.2, 0, 0, 1] };
const BACK = { kind: "bezier", points: [0.34, 1.56, 0.64, 1] };
const PRESETS = [
  { id: "pre-web", name: "Web hero, CSS", format: "html", width: 960, fps: 30, loop: true },
  { id: "pre-svg", name: "Inline SVG icon", format: "svg", width: 480, fps: 30, loop: true },
  { id: "pre-social", name: "Social clip, WebM", format: "webm", width: 1280, fps: 30, loop: false },
  { id: "pre-email", name: "Email header, GIF", format: "gif", width: 480, fps: 15, loop: true },
];

function minutesBefore(now: string, minutes: number): string {
  return new Date(new Date(now).getTime() - minutes * 60_000).toISOString();
}

registerSeed("motion", (ctx) => {
  const records: Rec[] = [];

  records.push(ctx.rec({
    org: "nl", collection: "motions", n: 20, title: "Arc Lamp launch sting",
    status: "in_review", owner: "Sofia Marín", tags: ["launch", "social"],
    summary: "Three seconds for the Arc Lamp launch: the product name rises in, the papaya rule draws across, the lamp glow settles on a spring.",
    fields: { kind: "composition", fps: 30, width: 960, height: 540, duration: 3, sharedWith: "Maya Chen" },
    body: {
      version: 2, width: 960, height: 540, fps: 30, duration: 3, background: "#14130F", loop: false,
      layers: [
        {
          id: "lay-glow", name: "Lamp glow", kind: "ellipse", visible: true, locked: false, assetId: "asset-photo",
          box: { x: 600, y: 90, w: 220, h: 220 }, fill: "#FFAE7C",
          tracks: {
            opacity: [{ id: "g-o1", t: 0, value: 0, easing: OUT }, { id: "g-o2", t: 0.8, value: 0.85, easing: EASE }],
            scale: [{ id: "g-s1", t: 0, value: 0.7, easing: { kind: "spring", spring: { stiffness: 160, damping: 14, mass: 1 } } }, { id: "g-s2", t: 1.4, value: 1, easing: EASE }],
          },
        },
        {
          id: "lay-name", name: "Product name", kind: "text", visible: true, locked: false,
          box: { x: 120, y: 200, w: 460, h: 80 }, fill: "#F6F4F0", text: "Arc Lamp",
          textStyle: { family: "Inter", size: 72, weight: 700, align: "start" },
          tracks: {
            opacity: [{ id: "n-o1", t: 0.2, value: 0, easing: OUT }, { id: "n-o2", t: 0.9, value: 1, easing: EASE }],
            y: [{ id: "n-y1", t: 0.2, value: 28, easing: OUT }, { id: "n-y2", t: 1.1, value: 0, easing: EASE }],
            letterSpacing: [{ id: "n-l1", t: 0.2, value: 8, easing: OUT }, { id: "n-l2", t: 1.4, value: 0, easing: EASE }],
          },
        },
        {
          id: "lay-rule", name: "Papaya rule", kind: "rect", visible: true, locked: false,
          box: { x: 120, y: 300, w: 300, h: 6 }, fill: "#FFAE7C", radius: 3,
          tracks: {
            scale: [{ id: "r-s1", t: 0.6, value: 0, easing: OUT }, { id: "r-s2", t: 1.5, value: 1, easing: EASE }],
            colour: [{ id: "r-c1", t: 1.5, value: "#FFAE7C", easing: EASE }, { id: "r-c2", t: 2.4, value: "#36C5BA", easing: EASE }],
          },
        },
        {
          id: "lay-mark", name: "Wordmark plate", kind: "rect", visible: true, locked: false, assetId: "asset-logo",
          box: { x: 120, y: 420, w: 160, h: 48 }, fill: "#2A2824", radius: 6,
          tracks: { opacity: [{ id: "m-o1", t: 1.8, value: 0, easing: OUT }, { id: "m-o2", t: 2.4, value: 1, easing: EASE }] },
        },
        {
          id: "lay-line", name: "Strapline", kind: "text", visible: true, locked: false,
          box: { x: 120, y: 330, w: 520, h: 40 }, fill: "#C9C3B8", text: "Brushed brass. Made in Clerkenwell.",
          textStyle: { family: "Inter", size: 26, weight: 500, align: "start" },
          tracks: {
            opacity: [{ id: "l-o1", t: 1.2, value: 0, easing: OUT }, { id: "l-o2", t: 1.9, value: 1, easing: EASE }],
            x: [{ id: "l-x1", t: 1.2, value: -24, easing: OUT }, { id: "l-x2", t: 1.9, value: 0, easing: EASE }],
          },
        },
      ],
      states: [{ id: "rest", name: "Rest" }, { id: "lit", name: "Lit", duration: 0.4, easing: OUT }],
      triggers: [
        { id: "trg-scroll", on: "scroll", state: "lit", layerId: "lay-glow", note: "Glow brightens when the sting scrolls into view." },
      ],
      onionSkin: { before: 2, after: 2, opacity: 0.25 },
      reducedMotion: { strategy: "cross-fade", note: "A 400ms fade into the final frame replaces the movement." },
      renders: [
        { id: "rnd-seed-1", at: minutesBefore(ctx.now, 60 * 26), by: "Sofia Marín", format: "html", state: "done", artifact: "arc-lamp-launch-sting.html", bytes: 9_412, note: "HTML page. Reduced motion: cross-fade." },
      ],
      assets: [
        { id: "asset-photo", name: "Arc Lamp on the bench", kind: "image", recordId: "nl-photos-020", collection: "photos" },
        { id: "asset-logo", name: "Northline wordmark (old library)", kind: "vector", recordId: "nl-designs-090", collection: "designs" },
      ],
      tests: [],
      review: { state: "not_required", reasons: [] },
      presets: PRESETS,
      activeLayerId: "lay-name",
    },
  }));

  records.push(ctx.rec({
    org: "nl", collection: "motions", n: 21, title: "Button hover — brand",
    status: "published", owner: "Maya Chen", tags: ["template", "ui"],
    summary: "The brand's button interaction: lift and brighten on hover or focus, press down on click or Enter.",
    fields: { kind: "template", publishedBy: "Maya Chen", publishedAt: minutesBefore(ctx.now, 60 * 24 * 9), templateNote: "Use for every primary call to action." },
    body: {
      version: 2, width: 480, height: 240, fps: 60, duration: 0.6, background: "#F6F4F0", loop: false,
      layers: [
        {
          id: "lay-btn", name: "Button", kind: "rect", visible: true, locked: false,
          box: { x: 120, y: 90, w: 240, h: 60 }, fill: "#234FE8", radius: 10,
          tracks: { opacity: [{ id: "b-o1", t: 0, value: 0, easing: OUT }, { id: "b-o2", t: 0.3, value: 1, easing: EASE }] },
          states: { hover: { y: -3, colour: "#3A63F0" }, pressed: { y: 2, scale: 0.97, colour: "#1A3DB8" } },
        },
        {
          id: "lay-label", name: "Label", kind: "text", visible: true, locked: false,
          box: { x: 168, y: 104, w: 150, h: 32 }, fill: "#FFFFFF", text: "Book a visit",
          textStyle: { family: "Inter", size: 24, weight: 650, align: "start" },
          tracks: { opacity: [{ id: "t-o1", t: 0.1, value: 0, easing: OUT }, { id: "t-o2", t: 0.4, value: 1, easing: EASE }] },
          states: { hover: { y: -3 }, pressed: { y: 2, scale: 0.97 } },
        },
      ],
      states: [
        { id: "rest", name: "Rest", duration: 0.18, easing: OUT },
        { id: "hover", name: "Hover", duration: 0.18, easing: OUT },
        { id: "pressed", name: "Pressed", duration: 0.08, easing: EASE },
      ],
      triggers: [
        { id: "trg-hover", on: "hover", state: "hover", layerId: "lay-btn", keyboard: "Focus", touch: true, returnOnEnd: true, follow: ["lay-label"], note: "" },
        { id: "trg-press", on: "click", state: "pressed", layerId: "lay-btn", keyboard: "Enter", follow: ["lay-label"], note: "Press has no touch path yet." },
      ],
      onionSkin: { before: 2, after: 2, opacity: 0.25 },
      reducedMotion: { strategy: "static-first-frame", note: "States change without the transition." },
      renders: [], assets: [], tests: [],
      review: { state: "not_required", reasons: [] },
      presets: PRESETS,
      activeLayerId: "lay-btn",
    },
  }));

  /* Fast full-stage opacity changes: the motion test should require a review. */
  const flash = Array.from({ length: 9 }, (_, index) => ({ id: `f-o${index}`, t: Math.round(index * 0.15 * 30) / 30, value: index % 2 === 0 ? 0 : 1, easing: { kind: "linear" } }));
  records.push(ctx.rec({
    org: "nl", collection: "motions", n: 22, title: "Winter sale banner",
    status: "draft", owner: "Theo Marsh", tags: ["sale", "web"],
    summary: "A first cut of the sale banner. The full-width blink is deliberate in the brief and has not been tested.",
    fields: { kind: "composition", fps: 30, width: 960, height: 300, duration: 2 },
    body: {
      version: 2, width: 960, height: 300, fps: 30, duration: 2, background: "#1A1917", loop: true,
      layers: [
        { id: "lay-flash", name: "Full-width blink", kind: "rect", visible: true, locked: false, box: { x: 0, y: 0, w: 960, h: 300 }, fill: "#FFFFFF", tracks: { opacity: flash } },
        {
          id: "lay-sale", name: "Sale line", kind: "text", visible: true, locked: false, box: { x: 220, y: 110, w: 520, h: 80 }, fill: "#FFAE7C", text: "Winter sale — 15% off",
          textStyle: { family: "Inter", size: 56, weight: 700, align: "start" },
          tracks: { scale: [{ id: "s-1", t: 0, value: 0.9, easing: BACK }, { id: "s-2", t: 0.5, value: 1, easing: EASE }] },
        },
      ],
      states: [], triggers: [],
      onionSkin: { before: 2, after: 2, opacity: 0.25 },
      reducedMotion: { strategy: "none", note: "" },
      renders: [], assets: [], tests: [],
      review: { state: "not_required", reasons: [] },
      presets: PRESETS,
      activeLayerId: "lay-sale",
    },
  }));

  records.push(ctx.rec({
    org: "hb", collection: "motions", n: 20, title: "Roastery logo reveal",
    status: "draft", owner: "Dana Brooks", tags: ["brand"],
    summary: "Two seconds: the bean mark drops in on a spring and the name fades up beside it.",
    fields: { kind: "composition", fps: 30, width: 960, height: 540, duration: 2 },
    body: {
      version: 2, width: 960, height: 540, fps: 30, duration: 2, background: "#2B1D14", loop: false,
      layers: [
        { id: "lay-bean", name: "Bean mark", kind: "ellipse", visible: true, locked: false, box: { x: 250, y: 200, w: 120, h: 150 }, fill: "#C98B4F", tracks: { y: [{ id: "h-y1", t: 0, value: -60, easing: { kind: "spring", spring: { stiffness: 180, damping: 14, mass: 1 } } }, { id: "h-y2", t: 1, value: 0, easing: EASE }], opacity: [{ id: "h-o1", t: 0, value: 0, easing: OUT }, { id: "h-o2", t: 0.3, value: 1, easing: EASE }] } },
        { id: "lay-hbname", name: "Name", kind: "text", visible: true, locked: false, box: { x: 400, y: 235, w: 360, h: 70 }, fill: "#F3E6D6", text: "Harbor Beans", textStyle: { family: "Inter", size: 56, weight: 700, align: "start" }, tracks: { opacity: [{ id: "h-n1", t: 0.6, value: 0, easing: OUT }, { id: "h-n2", t: 1.3, value: 1, easing: EASE }] } },
      ],
      states: [], triggers: [],
      onionSkin: { before: 2, after: 2, opacity: 0.25 },
      reducedMotion: { strategy: "cross-fade", note: "" },
      renders: [], assets: [], tests: [],
      review: { state: "not_required", reasons: [] },
      presets: PRESETS,
      activeLayerId: "lay-bean",
    },
  }));

  return { records };
});
