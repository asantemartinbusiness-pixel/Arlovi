import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Publication fixtures. Everything is in points, which is what the
 * composer works in; the interface shows millimetres.
 * ====================================================================== */

const PT = 72 / 25.4;
const mm = (value: number) => Math.round(value * PT * 100) / 100;

const A4 = { id: "a4", name: "A4 portrait", width: 595.28, height: 841.89 };

const STYLES = [
  { id: "ps-body", name: "Body", family: "Georgia", size: 10.5, leading: 15, tracking: 0, weight: 400, align: "justify", spaceBefore: 0, spaceAfter: 4, firstLineIndent: 0, hyphenate: true, alignToBaseline: true, color: "#1A1917" },
  { id: "ps-lead", name: "Lead paragraph", family: "Georgia", size: 13, leading: 19.5, tracking: 0, weight: 400, align: "left", spaceBefore: 0, spaceAfter: 8, firstLineIndent: 0, hyphenate: false, alignToBaseline: true, color: "#1A1917" },
  { id: "ps-head", name: "Headline", family: "Inter", size: 30, leading: 33, tracking: -0.6, weight: 700, align: "left", spaceBefore: 0, spaceAfter: 10, firstLineIndent: 0, hyphenate: false, alignToBaseline: false, color: "#1A1917" },
  { id: "ps-sub", name: "Subhead", family: "Inter", size: 14, leading: 18, tracking: 0, weight: 650, align: "left", spaceBefore: 10, spaceAfter: 4, firstLineIndent: 0, hyphenate: false, alignToBaseline: true, color: "#234FE8" },
  { id: "ps-caption", name: "Caption", family: "Inter", size: 8.5, leading: 12, tracking: 0.2, weight: 500, align: "left", spaceBefore: 2, spaceAfter: 0, firstLineIndent: 0, hyphenate: false, alignToBaseline: false, color: "#6B6760" },
];

const MASTER = {
  id: "mp-text", name: "Editorial master", side: "both",
  frames: [
    { id: "mf-folio", kind: "folio", box: { x: mm(18), y: A4.height - mm(13), w: A4.width - mm(36), h: 14 }, template: "Northline Lighting · {page} of {pages}", styleId: "ps-caption" },
    { id: "mf-rule", kind: "shape", box: { x: mm(18), y: A4.height - mm(17), w: A4.width - mm(36), h: 0.6 }, fill: "#D9D4CB" },
  ],
};

const LOOKBOOK_TEXT = [
  "Winter, and the light goes early",
  "The Arc Lamp began as a drawing on the back of a delivery note. Clerkenwell in November is dark by four, and the workshop needed something that threw light upward without throwing it in anybody's eyes. What came out of that is a brushed brass stem, a weighted base, and a linen shade deep enough to hide the bulb entirely.",
  "How it is made",
  "Every stem is cut, brushed and lacquered in the workshop. The base is powder-coated steel, machined to sit flat on a floor that is rarely flat. The shade is sewn from a linen that takes a warm bulb without yellowing, and it is the part that takes the longest: three weeks is an honest lead time, not a courtesy.",
  "What it costs the trade",
  "Trade orders of four or more take ten percent, and anything over eight is quoted individually because the shade colour is matched by hand. Specification sheets, dimensioned drawings and a photograph suitable for print are available for each piece, and the showroom in Clerkenwell takes appointments on Tuesdays and Thursdays.",
  "A note on the brass",
  "Brass moves. It darkens where hands touch it and stays bright where they do not, and within a year a lamp in a hallway looks different from the same lamp in a study. That is the point. Nothing here is lacquered so heavily that it stops ageing, and nothing is sold as maintenance free when it is not.",
  "The rest of the winter range",
  "Alongside the Arc there is the Shelf, a low reading light that clamps rather than stands, and the Hook, which does what its name says and costs a quarter of the Arc. Both use the same bulb and the same shade linen, so a room can take all three without looking like a catalogue page.",
];

function textFrame(id: string, next: string | undefined, columns = 2) {
  return {
    id, kind: "text",
    box: { x: mm(20), y: mm(24), w: A4.width - mm(36), h: A4.height - mm(48) },
    columns, gutter: mm(5), inset: 0, storyId: "story-1", styleId: "ps-body",
    next,
  };
}

registerSeed("layout", (ctx) => {
  const records: Rec[] = [];

  records.push(ctx.rec({
    org: "nl", collection: "publications", n: 20, title: "Winter trade lookbook",
    status: "in_review",
    summary: "Four pages of threaded copy with a master folio, a two column grid and a 15pt baseline.",
    owner: "Sofia Marín",
    tags: ["print", "trade"],
    fields: { kind: "publication", size: "A4 portrait", pages: 4, bleedMm: 3 },
    body: {
      version: 2,
      size: A4,
      facingPages: true,
      margins: { top: mm(24), bottom: mm(24), inside: mm(20), outside: mm(16) },
      bleed: mm(3),
      slug: mm(6),
      baseline: { start: mm(24), step: 15, visible: true },
      columns: { count: 2, gutter: mm(5), visible: true },
      pages: [
        { id: "pg-1", masterId: "mp-text", overrides: [], frames: [textFrame("fr-1", "fr-2")] },
        { id: "pg-2", masterId: "mp-text", overrides: [], frames: [textFrame("fr-2", "fr-3")] },
        {
          id: "pg-3", masterId: "mp-text", overrides: [], frames: [
            { id: "fr-img", kind: "image", box: { x: mm(20), y: mm(24), w: A4.width - mm(36), h: mm(90) }, fit: "cover", naturalWidth: 900, naturalHeight: 600 },
            { ...textFrame("fr-3", "fr-4"), box: { x: mm(20), y: mm(120), w: A4.width - mm(36), h: A4.height - mm(144) } },
          ],
        },
        { id: "pg-4", masterId: "mp-text", overrides: [], frames: [textFrame("fr-4", undefined)] },
      ],
      masters: [MASTER],
      stories: [{
        id: "story-1", name: "Lookbook copy",
        text: LOOKBOOK_TEXT.join("\n"),
        styleByParagraph: { 0: "ps-head", 1: "ps-lead", 2: "ps-sub", 4: "ps-sub", 6: "ps-sub", 8: "ps-sub" },
      }],
      paragraphStyles: STYLES,
      characterStyles: [],
      activePageId: "pg-1",
      colourMode: "RGB",
      fonts: ["Georgia", "Inter"],
    },
  }));

  records.push(ctx.rec({
    org: "nl", collection: "publications", n: 21, title: "Specification sheet template",
    status: "template",
    summary: "A one page A4 template with a headline, a specification block and an image frame left empty on purpose.",
    owner: "Maya Chen",
    tags: ["template", "print"],
    fields: { kind: "template", size: "A4 portrait", pages: 1, bleedMm: 3 },
    body: {
      version: 2,
      size: A4,
      facingPages: false,
      margins: { top: mm(20), bottom: mm(20), inside: mm(18), outside: mm(18) },
      bleed: mm(3),
      slug: mm(6),
      baseline: { start: mm(20), step: 14, visible: false },
      columns: { count: 1, gutter: mm(5), visible: true },
      pages: [{
        id: "pg-1", masterId: "mp-text", overrides: [], frames: [
          { id: "fr-head", kind: "text", box: { x: mm(18), y: mm(20), w: A4.width - mm(36), h: mm(40) }, columns: 1, gutter: 0, inset: 0, storyId: "story-1", styleId: "ps-head" },
          { id: "fr-img", kind: "image", box: { x: mm(18), y: mm(64), w: A4.width - mm(36), h: mm(80) }, fit: "contain" },
          { id: "fr-spec", kind: "text", box: { x: mm(18), y: mm(150), w: A4.width - mm(36), h: mm(100) }, columns: 2, gutter: mm(6), inset: 0, storyId: "story-2", styleId: "ps-body" },
        ],
      }],
      masters: [MASTER],
      stories: [
        { id: "story-1", name: "Title", text: "Product name\nOne line of positioning copy sits beneath the name.", styleByParagraph: { 0: "ps-head", 1: "ps-lead" } },
        { id: "story-2", name: "Specification", text: "Dimensions\nHeight, width and depth in millimetres, with the shade measured separately.\nMaterials\nEvery material named, with the finish and whether it will age.\nElectrical\nFitting, maximum wattage, dimming behaviour and the certification held.\nLead time\nAn honest figure in weeks, not a courtesy figure.", styleByParagraph: { 0: "ps-sub", 2: "ps-sub", 4: "ps-sub", 6: "ps-sub" } },
      ],
      paragraphStyles: STYLES,
      characterStyles: [],
      activePageId: "pg-1",
      colourMode: "RGB",
      fonts: ["Georgia", "Inter"],
    },
  }));

  records.push(ctx.rec({
    org: "hb", collection: "publications", n: 20, title: "Subscription booklet",
    status: "draft",
    summary: "Two pages of copy threaded through a single column, deliberately overset so the flow screen has something to report.",
    owner: "Dana Brooks",
    tags: ["print"],
    fields: { kind: "publication", size: "A5 portrait", pages: 2, bleedMm: 3 },
    body: {
      version: 2,
      size: { id: "a5", name: "A5 portrait", width: 419.53, height: 595.28 },
      facingPages: true,
      margins: { top: mm(16), bottom: mm(16), inside: mm(16), outside: mm(12) },
      bleed: mm(3),
      slug: mm(6),
      baseline: { start: mm(16), step: 13, visible: true },
      columns: { count: 1, gutter: mm(4), visible: true },
      pages: [
        { id: "pg-1", masterId: undefined, overrides: [], frames: [{ id: "fr-1", kind: "text", box: { x: mm(16), y: mm(16), w: 419.53 - mm(28), h: 595.28 - mm(32) }, columns: 1, gutter: 0, inset: 0, storyId: "story-1", styleId: "ps-body", next: "fr-2" }] },
        { id: "pg-2", masterId: undefined, overrides: [], frames: [{ id: "fr-2", kind: "text", box: { x: mm(16), y: mm(16), w: 419.53 - mm(28), h: mm(80) }, columns: 1, gutter: 0, inset: 0, storyId: "story-1", styleId: "ps-body" }] },
      ],
      masters: [],
      stories: [{
        id: "story-1", name: "Subscription copy",
        text: [
          "Two bags a month",
          "A subscription is two twelve ounce bags, roasted on Tuesday and posted on Wednesday, arriving in most of the state by Friday. The roast rotates: one bag is whatever the roaster is most pleased with that week, and the other is a constant, so there is always something familiar in the cupboard.",
          "What arrives",
          "Each bag carries the farm, the varietal, the process and the roast date, and a card with brewing notes for the method you told us about when you signed up. If you change method, change the card: it is a form on the account page, not an email to somebody.",
          "Pausing and stopping",
          "Pause any month before the Friday before the roast. Stopping is the same form with a different button, takes effect immediately, and does not involve a conversation about whether you are sure.",
          "The price",
          "Twenty eight dollars a month including postage within the state, thirty four outside it. That figure is the figure: there is no first-month discount that lapses into something larger, because a subscription that needs a discount to start is not a subscription anybody wants to keep.",
          "Gifting",
          "A gift subscription runs for three, six or twelve months and stops on its own. The recipient can change the method card and pause a month, and cannot see what it cost.",
        ].join("\n"),
        styleByParagraph: { 0: "ps-head", 1: "ps-lead", 2: "ps-sub", 4: "ps-sub", 6: "ps-sub", 8: "ps-sub", 10: "ps-sub" },
      }],
      paragraphStyles: STYLES,
      characterStyles: [],
      activePageId: "pg-1",
      colourMode: "RGB",
      fonts: ["Georgia", "Inter"],
    },
  }));

  return { records };
});
