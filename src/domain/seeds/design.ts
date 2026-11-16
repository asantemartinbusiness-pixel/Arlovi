import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Design fixtures. Plausible work for a lighting maker (Northline, UK)
 * and a coffee roaster (Harbor, US). Ids start at 20 so they never
 * collide with the base seed.
 * ====================================================================== */

interface Node {
  id: string; kind: string; name: string; x: number; y: number; w: number; h: number;
  rotation: number; opacity: number; visible: boolean; locked: boolean;
  fill?: { type: string; color: string; to?: string; angle?: number };
  stroke?: { color: string; width: number; align: string };
  radius?: number; text?: string;
  textStyle?: { family: string; size: number; weight: number; lineHeight: number; letterSpacing: number; align: string; color: string; styleId?: string };
  constraints?: { h: string; v: string };
  shadow?: { x: number; y: number; blur: number; spread: number; color: string };
  layout?: unknown;
  sides?: number;
}

function node(id: string, kind: string, name: string, x: number, y: number, w: number, h: number, extra: Partial<Node> = {}): Node {
  return {
    id, kind, name, x, y, w, h, rotation: 0, opacity: 1, visible: true, locked: false,
    constraints: { h: "min", v: "min" }, ...extra,
  };
}

const COLORS = [
  { id: "tok-ink", name: "Ink", value: "#17223A", group: "Core" },
  { id: "tok-cobalt", name: "Cobalt", value: "#234FE8", group: "Core" },
  { id: "tok-aqua", name: "Aqua", value: "#36C5BA", group: "Core" },
  { id: "tok-papaya", name: "Papaya", value: "#FFAE7C", group: "Accent" },
  { id: "tok-paper", name: "Paper", value: "#F7F8FC", group: "Surface" },
  { id: "tok-slate", name: "Slate", value: "#6B7794", group: "Surface" },
];

const TEXT_STYLES = [
  { id: "ts-display", name: "Display / 40", family: "Inter", size: 40, weight: 700, lineHeight: 1.12, letterSpacing: -0.6 },
  { id: "ts-title", name: "Title / 24", family: "Inter", size: 24, weight: 650, lineHeight: 1.2, letterSpacing: -0.2 },
  { id: "ts-body", name: "Body / 16", family: "Inter", size: 16, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
  { id: "ts-caption", name: "Caption / 12", family: "Inter", size: 12, weight: 500, lineHeight: 1.35, letterSpacing: 0.2 },
];

const EFFECTS = [
  { id: "fx-card", name: "Card lift", shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(23,34,58,0.14)" } },
  { id: "fx-modal", name: "Overlay", shadow: { x: 0, y: 18, blur: 44, spread: 0, color: "rgba(23,34,58,0.22)" } },
];

const BREAKPOINTS = [
  { id: "bp-mobile", name: "Mobile", width: 390 },
  { id: "bp-tablet", name: "Tablet", width: 834 },
  { id: "bp-desktop", name: "Desktop", width: 1440 },
];

function doc(pages: { id: string; name: string; background: string; roots: Node[]; frameChildren?: Record<string, Node[]>; gridKind?: "square" | "columns" }[], extra: Record<string, unknown> = {}) {
  return {
    version: 2,
    pages: pages.map((page) => {
      const nodes: Record<string, Node> = {};
      const children: Record<string, string[]> = { [page.id]: page.roots.map((item) => item.id) };
      for (const root of page.roots) {
        nodes[root.id] = root;
        const kids = page.frameChildren?.[root.id] ?? [];
        children[root.id] = kids.map((kid) => kid.id);
        for (const kid of kids) nodes[kid.id] = kid;
      }
      return {
        id: page.id, name: page.name, background: page.background,
        grid: { kind: page.gridKind ?? "square", size: 8, count: 12, gutter: 24, visible: true },
        children, nodes,
      };
    }),
    activePageId: pages[0].id,
    components: [],
    textStyles: TEXT_STYLES,
    colors: COLORS,
    effects: EFFECTS,
    breakpoints: BREAKPOINTS,
    comments: [],
    reviews: [],
    versions: [],
    assets: [],
    exports: [],
    prototype: { device: "Desktop 1440" },
    unsupported: [],
    ...extra,
  };
}

registerSeed("design", (ctx) => {
  const records: Rec[] = [];

  /* ---- Northline: the trade card design system file ---- */
  const cardFrame = node("fr-card", "frame", "Trade card / 960 × 540", 0, 0, 960, 540, {
    fill: { type: "solid", color: "#FFFFFF" }, radius: 16,
    layout: { direction: "vertical", gap: 20, padding: { top: 56, right: 56, bottom: 56, left: 56 }, align: "start", wrap: false, widthMode: "fixed", heightMode: "fixed" },
  });
  const cardKids = [
    node("tx-eyebrow", "text", "Eyebrow", 56, 56, 320, 18, {
      text: "Northline Lighting · Winter 2027",
      textStyle: { family: "Inter", size: 12, weight: 500, lineHeight: 1.35, letterSpacing: 0.2, align: "start", color: "#6B7794", styleId: "ts-caption" },
      constraints: { h: "stretch", v: "min" },
    }),
    node("tx-headline", "text", "Headline", 56, 94, 520, 96, {
      text: "The Arc Lamp,\nmade to order",
      textStyle: { family: "Inter", size: 40, weight: 700, lineHeight: 1.12, letterSpacing: -0.6, align: "start", color: "#17223A", styleId: "ts-display" },
      constraints: { h: "stretch", v: "min" },
    }),
    node("tx-body", "text", "Body", 56, 210, 420, 72, {
      text: "Brushed brass and linen, assembled in Clerkenwell.\nThree week lead time on trade orders of four or more.",
      textStyle: { family: "Inter", size: 16, weight: 400, lineHeight: 1.5, letterSpacing: 0, align: "start", color: "#6B7794", styleId: "ts-body" },
      constraints: { h: "stretch", v: "min" },
    }),
    node("bt-primary", "rect", "Primary button", 56, 312, 212, 52, {
      radius: 10, fill: { type: "solid", color: "#234FE8" },
      shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(23,34,58,0.14)" },
    }),
    node("tx-button", "text", "Button label", 84, 328, 160, 20, {
      text: "Book the showroom",
      textStyle: { family: "Inter", size: 15, weight: 600, lineHeight: 1.2, letterSpacing: 0, align: "start", color: "#FFFFFF" },
    }),
    node("sh-lamp", "ellipse", "Lamp glow", 620, 120, 240, 240, {
      fill: { type: "linear", color: "#FFAE7C", to: "#FFD9BE", angle: 135 }, opacity: 0.9,
    }),
    node("sh-stem", "rect", "Lamp stem", 730, 300, 14, 170, { fill: { type: "solid", color: "#17223A" }, radius: 7 }),
    node("sh-base", "ellipse", "Lamp base", 686, 452, 102, 26, { fill: { type: "solid", color: "#17223A" } }),
  ];

  const sheetFrame = node("fr-spec", "frame", "Spec sheet / 960 × 540", 1060, 0, 960, 540, { fill: { type: "solid", color: "#F7F8FC" }, radius: 16 });
  const sheetKids = [
    node("tx-spec-title", "text", "Spec title", 1116, 56, 400, 34, {
      text: "Arc Lamp — specification",
      textStyle: { family: "Inter", size: 24, weight: 650, lineHeight: 1.2, letterSpacing: -0.2, align: "start", color: "#17223A", styleId: "ts-title" },
    }),
    node("tx-spec-body", "text", "Spec body", 1116, 112, 520, 160, {
      text: "Height 1,640 mm · shade 420 mm\nBrushed brass, powder-coated steel base\nLinen shade, three colourways\nE27 fitting, dimmable, 2700 K recommended\nCE marked, two year warranty",
      textStyle: { family: "Inter", size: 16, weight: 400, lineHeight: 1.6, letterSpacing: 0, align: "start", color: "#17223A", styleId: "ts-body" },
    }),
    node("sh-rule", "line", "Rule", 1116, 292, 820, 0, { stroke: { color: "#D7DCE8", width: 2, align: "center" } }),
    node("sh-swatch-1", "rect", "Swatch brass", 1116, 320, 120, 80, { radius: 8, fill: { type: "solid", color: "#C9A227" } }),
    node("sh-swatch-2", "rect", "Swatch linen", 1252, 320, 120, 80, { radius: 8, fill: { type: "solid", color: "#EDE4D3" } }),
    node("sh-swatch-3", "rect", "Swatch ink", 1388, 320, 120, 80, { radius: 8, fill: { type: "solid", color: "#17223A" } }),
    node("sh-hex", "polygon", "Badge", 1800, 60, 110, 110, { sides: 6, fill: { type: "solid", color: "#36C5BA" } }),
  ];

  records.push(ctx.rec({
    org: "nl", collection: "designs", n: 20, title: "Trade card system",
    status: "in_review",
    summary: "Two artboards on one page: the trade card and its specification sheet, both on the shared tokens.",
    owner: "Maya Chen",
    tags: ["brand", "trade"],
    fields: { kind: "file", format: "Desktop 1440 × 900", width: 960, height: 540, sharedWith: "Ravi Patel, Sofia Marín", assetLink: "nl-assets-001" },
    body: doc([
      { id: "page-card", name: "Card and spec", background: "#E8ECF4", roots: [cardFrame, sheetFrame], frameChildren: { "fr-card": cardKids, "fr-spec": sheetKids }, gridKind: "columns" },
      {
        id: "page-icons", name: "Icons", background: "#FFFFFF",
        roots: [
          node("ic-1", "polygon", "Lamp icon", 40, 40, 64, 64, { sides: 3, fill: { type: "solid", color: "#234FE8" } }),
          node("ic-2", "ellipse", "Bulb icon", 128, 40, 64, 64, { fill: { type: "solid", color: "#FFAE7C" } }),
          node("ic-3", "rect", "Shade icon", 216, 40, 64, 64, { radius: 14, fill: { type: "solid", color: "#36C5BA" } }),
          node("ic-4", "polygon", "Base icon", 304, 40, 64, 64, { sides: 8, fill: { type: "solid", color: "#17223A" } }),
        ],
      },
    ], {
      comments: [
        { id: "c-1", pageId: "page-card", x: 300, y: 330, author: "Sofia Marín", at: "2026-11-11T14:12:00.000Z", text: "The button label runs close to the edge at 390px. Can it wrap?", resolved: false },
        { id: "c-2", pageId: "page-card", x: 740, y: 200, author: "Ravi Patel", at: "2026-11-12T09:40:00.000Z", text: "Glow gradient reads well in print proof.", resolved: true },
      ],
      reviews: [
        { id: "r-1", version: 1, by: "Maya Chen", at: "2026-11-10T16:00:00.000Z", state: "changes", note: "Headline tracking too tight at the small breakpoint." },
      ],
      versions: [
        { id: "v-1", at: "2026-11-10T16:00:00.000Z", by: "Maya Chen", label: "First layout to review", nodeCount: 10 },
      ],
      assets: [
        { id: "as-1", name: "Clerkenwell showroom", kind: "image", license: "Company-owned", credit: "Maya Chen", width: 2400, height: 1600 },
        { id: "as-2", name: "Brass texture", kind: "image", license: "Licensed — unlimited", credit: "Northline supplier pack", width: 1024, height: 1024 },
      ],
      exports: [
        { id: "ex-1", nodeId: "fr-card", format: "png", scale: 2, suffix: "@2x" },
        { id: "ex-2", nodeId: "fr-card", format: "svg", scale: 1, suffix: "" },
      ],
      prototype: { startNodeId: "fr-card", device: "Desktop 1440" },
      unsupported: ["SVG filter primitives (blur, lighting, turbulence)", "substituted font: Söhne"],
    }),
  }));

  /* ---- Northline: a template others fork ---- */
  const tmplFrame = node("fr-social", "frame", "Social square / 1080", 0, 0, 1080, 1080, {
    fill: { type: "linear", color: "#17223A", to: "#234FE8", angle: 160 }, radius: 0,
  });
  records.push(ctx.rec({
    org: "nl", collection: "designs", n: 21, title: "Product announcement square",
    status: "template",
    summary: "A 1080 square template for a product announcement. Fork it and replace the headline.",
    owner: "Sofia Marín",
    tags: ["template", "social"],
    fields: { kind: "template", format: "Social 1080 × 1080", width: 1080, height: 1080 },
    body: doc([{
      id: "page-social", name: "Square", background: "#0B1020",
      roots: [tmplFrame],
      frameChildren: {
        "fr-social": [
          node("tx-sq-head", "text", "Headline", 96, 300, 880, 240, {
            text: "New this week:\nthe Arc Lamp",
            textStyle: { family: "Inter", size: 88, weight: 700, lineHeight: 1.05, letterSpacing: -2, align: "start", color: "#FFFFFF", styleId: "ts-display" },
            constraints: { h: "stretch", v: "center" },
          }),
          node("tx-sq-sub", "text", "Subhead", 96, 580, 760, 60, {
            text: "Brushed brass. Linen shade. Clerkenwell.",
            textStyle: { family: "Inter", size: 28, weight: 400, lineHeight: 1.4, letterSpacing: 0, align: "start", color: "#A9B6D6", styleId: "ts-body" },
            constraints: { h: "stretch", v: "min" },
          }),
          node("sh-sq-dot", "ellipse", "Accent", 780, 120, 180, 180, { fill: { type: "solid", color: "#FFAE7C" }, opacity: 0.85 }),
        ],
      },
    }]),
  }));

  /* ---- Harbor: the roaster's menu board ---- */
  const boardFrame = node("fr-board", "frame", "Menu board / 1200 × 1800", 0, 0, 1200, 1800, { fill: { type: "solid", color: "#1A120B" } });
  records.push(ctx.rec({
    org: "hb", collection: "designs", n: 20, title: "Roastery menu board",
    status: "active",
    summary: "The in-store menu board, set for the 1200 × 1800 screen above the bar.",
    owner: "Elena Ward",
    tags: ["retail", "signage"],
    fields: { kind: "file", format: "Signage 1200 × 1800", width: 1200, height: 1800, sharedWith: "Dana Brooks" },
    body: doc([{
      id: "page-board", name: "Board", background: "#120C07",
      roots: [boardFrame],
      frameChildren: {
        "fr-board": [
          node("tx-b-title", "text", "Board title", 80, 80, 900, 110, {
            text: "Harbor Roastery",
            textStyle: { family: "Georgia", size: 84, weight: 700, lineHeight: 1.08, letterSpacing: -1.5, align: "start", color: "#F4E3C8" },
          }),
          node("tx-b-menu", "text", "Menu", 80, 260, 1000, 700, {
            text: "Espresso           3.00\nCortado            3.75\nFlat white         4.25\nCold brew          4.50\nPour over          5.00\nSingle origin      5.50",
            textStyle: { family: "Courier New", size: 44, weight: 400, lineHeight: 1.6, letterSpacing: 1, align: "start", color: "#F4E3C8" },
          }),
          node("sh-b-rule", "line", "Rule", 80, 230, 1040, 0, { stroke: { color: "#8A6A44", width: 3, align: "center" } }),
          node("sh-b-bean", "ellipse", "Bean", 900, 1400, 220, 300, { fill: { type: "solid", color: "#3A2412" }, rotation: 24 }),
        ],
      },
    }], {
      comments: [{ id: "c-h1", pageId: "page-board", x: 300, y: 900, author: "Dana Brooks", at: "2026-11-13T11:00:00.000Z", text: "Prices need the new cold brew figure before Friday.", resolved: false }],
    }),
  }));

  records.push(ctx.rec({
    org: "hb", collection: "designs", n: 21, title: "Subscription card",
    status: "draft",
    summary: "A 600 × 340 card for the subscription insert, one frame with auto layout.",
    owner: "Dana Brooks",
    tags: ["print"],
    fields: { kind: "file", format: "Card 600 × 340", width: 600, height: 340 },
    body: doc([{
      id: "page-sub", name: "Card", background: "#F7F2EA",
      roots: [node("fr-sub", "frame", "Insert card", 0, 0, 600, 340, {
        fill: { type: "solid", color: "#FFFFFF" }, radius: 12,
        layout: { direction: "vertical", gap: 14, padding: { top: 32, right: 32, bottom: 32, left: 32 }, align: "start", wrap: false, widthMode: "fixed", heightMode: "hug" },
      })],
      frameChildren: {
        "fr-sub": [
          node("tx-sub-h", "text", "Heading", 32, 32, 480, 34, {
            text: "Two bags a month",
            textStyle: { family: "Georgia", size: 26, weight: 700, lineHeight: 1.2, letterSpacing: -0.2, align: "start", color: "#2A1B0E" },
            constraints: { h: "stretch", v: "min" },
          }),
          node("tx-sub-b", "text", "Body", 32, 80, 480, 70, {
            text: "Rotating single origins, roasted Tuesday,\nshipped Wednesday. Pause any time.",
            textStyle: { family: "Inter", size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0, align: "start", color: "#6B5744" },
            constraints: { h: "stretch", v: "min" },
          }),
          node("bt-sub", "rect", "CTA", 32, 170, 180, 44, { radius: 22, fill: { type: "solid", color: "#B4521E" } }),
        ],
      },
    }]),
  }));

  return { records };
});
