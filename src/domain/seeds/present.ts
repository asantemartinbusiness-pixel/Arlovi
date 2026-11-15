import { registerSeed } from "@/domain/seedRegistry";
import { LAYOUTS, slideFromLayout, THEMES, type Deck, type Slide, type SlideObject } from "@/applications/present/model";

/* Fixtures for Presentations. A real trade pitch with a chart, a table and
 * speaker notes, plus a brand master deck. Ids start at n: 20. */

function layout(id: string) {
  return LAYOUTS.find((item) => item.id === id) ?? LAYOUTS[1];
}

function withNotes(slide: Slide, notes: string, targetSeconds?: number): Slide {
  return { ...slide, notes, targetSeconds };
}

function fill(slide: Slide, values: Record<string, string>): Slide {
  return {
    ...slide,
    objects: slide.objects.map((object) => (
      object.type === "text" && object.text?.role && values[object.text.role] !== undefined
        ? { ...object, text: { ...object.text, text: values[object.text.role] } }
        : object
    )),
  };
}

function chartObject(id: string, title: string, points: { label: string; value: number }[], capturedAt: string): SlideObject {
  return {
    id, type: "chart", name: "Net by deal", x: 80, y: 132, w: 800, h: 300, rotation: 0, z: 5,
    chart: {
      kind: "bar", title,
      series: [{ name: "Net", points }],
      sourceSheetName: "Pipeline", sourceRef: "A1:E6", capturedAt, linked: true,
    },
  };
}

registerSeed("present", (context) => {
  const now = context.now;

  const title = withNotes(
    fill(slideFromLayout(layout("title"), "Winter collection"), {
      eyebrow: "Northline Lighting · Trade 2026",
      title: "Winter collection",
      subtitle: "Brushed brass, linen shades, six weeks from order",
    }),
    "Open on the lead time, not the finish. Buyers care that six weeks is real.\nIf asked about the blackened finish: it adds a week because it re-enters the brass queue.",
    45,
  );

  const product = withNotes(
    fill(slideFromLayout(layout("twoColumn"), "The Arc Lamp"), {
      title: "The Arc Lamp",
      body: "Brushed brass stem, hand-polished in Walthamstow.\nNatural linen shade, 2700K.\nDrop adjustable 600–1400mm.\n£900 ex VAT on the trade list.",
      caption: "Twelve weeks of production capacity are already committed for January, so January orders quote February dispatch.",
    }),
    "Name the material and the lead time. Do not quote a discount here; that is the next slide and it needs finance approval above ten per cent.",
    70,
  );

  const pipeline: Slide = withNotes(
    {
      ...fill(slideFromLayout(layout("chart"), "Where the trade book stands"), {
        title: "Where the trade book stands",
        caption: "Net values exclude VAT. Figures captured from the Trade model 2026 workbook, Pipeline sheet, range A1:E6.",
      }),
      objects: [
        ...slideFromLayout(layout("chart"), "Where the trade book stands").objects.filter((object) => object.type !== "chart").map((object) => (
          object.type === "text" && object.text?.role === "title"
            ? { ...object, text: { ...object.text, text: "Where the trade book stands" } }
            : object.type === "text" && object.text?.role === "caption"
              ? { ...object, text: { ...object.text, text: "Net values exclude VAT. Captured from Trade model 2026, Pipeline!A1:E6." } }
              : object
        )),
        chartObject("px-chart-1", "Net by deal", [
          { label: "Clerkenwell showroom", value: 10800 },
          { label: "Harrow practice", value: 1800 },
          { label: "Berg studio", value: 900 },
          { label: "Lyle & Fisk", value: 5040 },
          { label: "Pike Row", value: 3600 },
        ], "2026-11-07T10:00:00.000Z"),
      ],
    },
    "The snapshot is a week old. Say so if anyone asks for today's number — the workbook is the source, not the slide.",
    60,
  );

  const terms: Slide = withNotes(
    {
      ...slideFromLayout(layout("titleBody"), "Terms"),
      objects: [
        ...slideFromLayout(layout("titleBody"), "Terms").objects
          .filter((object) => object.text?.role !== "body")
          .map((object) => (object.text?.role === "title" ? { ...object, text: { ...object.text!, text: "Terms" } } : object)),
        {
          id: "px-table-1", type: "table", name: "Terms table",
          x: 80, y: 168, w: 800, h: 230, rotation: 0, z: 4,
          table: {
            header: true,
            rows: [
              ["Item", "Trade", "Lead time"],
              ["Arc Lamp, brushed brass", "£900 ex VAT", "6 weeks"],
              ["Arc Lamp, blackened", "£940 ex VAT", "7 weeks"],
              ["Arc Pendant", "£690 ex VAT", "5 weeks"],
              ["Site survey", "£450 ex VAT", "By arrangement"],
            ],
          },
        },
      ],
    },
    "Payment terms are thirty days from invoice. Do not agree sixty on the call.",
    50,
  );

  const ask = withNotes(
    fill(slideFromLayout(layout("statement"), "Book the Clerkenwell table"), { title: "Book the Clerkenwell table" }),
    "Close with one ask. Offer two dates and write the chosen one down before leaving the room.",
    25,
  );

  const animated: Slide = {
    ...product,
    objects: product.objects.map((object, index) => (
      object.type === "text"
        ? { ...object, animation: { effect: index === 0 ? "fade" : "riseUp", order: index + 1, durationMs: 320, delayMs: index * 80, easing: "ease-out", trigger: "onAppear" } }
        : object
    )),
  };

  const deck: Deck = {
    theme: THEMES[0],
    themes: THEMES,
    layouts: LAYOUTS,
    slides: [title, animated, pipeline, terms, ask],
    index: 0,
    comments: [{
      id: "px-c-1", slideId: pipeline.id, objectId: "px-chart-1",
      author: "Jonah Adeyemi", at: now,
      body: "This snapshot predates the Lyle & Fisk re-quote. Refresh it from the workbook before the meeting.",
      resolved: false,
    }],
    approvals: [],
    exports: [],
    importNotes: [],
    reduceMotion: false,
  };

  const masterDeck: Deck = {
    theme: THEMES[0],
    themes: THEMES,
    layouts: LAYOUTS,
    slides: LAYOUTS.map((item) => fill(slideFromLayout(item, item.name), {
      eyebrow: "Eyebrow",
      title: item.name,
      subtitle: "Subtitle placeholder",
      body: "Body placeholder. One idea per slide; keep a line under twelve words where you can.",
      caption: "Caption placeholder",
    })),
    index: 0,
    comments: [],
    approvals: [],
    exports: [],
    importNotes: [],
    reduceMotion: false,
  };

  const imported: Deck = {
    theme: { ...THEMES[2], fontSubstitutions: [{ requested: "Gill Sans Nova", used: "Inter" }, { requested: "Caslon Display", used: "Inter" }] },
    themes: THEMES,
    layouts: LAYOUTS,
    slides: [
      fill(slideFromLayout(layout("title"), "Harbor distribution"), { eyebrow: "Imported deck", title: "Harbor distribution", subtitle: "Arc range, United States" }),
      {
        ...slideFromLayout(layout("titleBody"), "Territory"),
        objects: [
          ...slideFromLayout(layout("titleBody"), "Territory").objects.map((object) => (
            object.text?.role === "title" ? { ...object, text: { ...object.text!, text: "Territory" } }
              : object.text?.role === "body" ? { ...object, text: { ...object.text!, text: "Fifty states and the District of Columbia. Canada is handled directly." } }
                : object
          )),
          {
            id: "px-img-1", type: "image", name: "Map image",
            x: 560, y: 180, w: 320, h: 220, rotation: 0, z: 6,
            image: { alt: "", fit: "contain", substituted: "map-us-states.ai could not be read; the frame is empty" },
          },
        ],
      },
    ],
    index: 0,
    comments: [],
    approvals: [],
    exports: [],
    importNotes: [
      "Two fonts were not available locally and were substituted with Inter: Gill Sans Nova, Caslon Display.",
      "One image could not be decoded (map-us-states.ai). The frame was kept at its original position so the layout is not silently changed.",
      "Three gradient fills were flattened to the nearest theme colour.",
    ],
    reduceMotion: false,
  };

  return {
    records: [
      context.rec({
        org: "nl", collection: "decks", n: 20, title: "Winter trade pitch",
        status: "in_review", owner: "Priya Shah",
        summary: "Five slides for the Clerkenwell and Harrow meetings.",
        tags: ["pitch", "sales"],
        fields: { folder: "Sales", slides: 5, theme: "Northline" },
        body: deck,
      }),
      context.rec({
        org: "nl", collection: "decks", n: 21, title: "Northline brand master",
        status: "published", owner: "Maya Chen",
        summary: "One slide per master layout, for reference.",
        tags: ["template", "brand"],
        fields: { folder: "Brand", slides: LAYOUTS.length, theme: "Northline", isTemplate: true },
        body: masterDeck,
      }),
      context.rec({
        org: "nl", collection: "decks", n: 22, title: "Imported: Harbor distribution",
        status: "draft", owner: "Maya Chen",
        summary: "Imported deck with font and media substitutions disclosed.",
        tags: ["import"],
        fields: { folder: "Imports", slides: 2, theme: "Paper" },
        body: imported,
      }),
      context.rec({
        org: "hb", collection: "decks", n: 20, title: "US launch readiness",
        status: "draft", owner: "Elena Ward",
        summary: "Landed cost, territory and the first three accounts.",
        tags: ["launch"],
        fields: { folder: "Sales", slides: 2, theme: "Harbor night" },
        body: {
          theme: THEMES[1],
          themes: THEMES,
          layouts: LAYOUTS,
          slides: [
            fill(slideFromLayout(layout("title"), "US launch readiness"), { eyebrow: "Harbor Supply Co", title: "US launch readiness", subtitle: "Arc range, first quarter" }),
            fill(slideFromLayout(layout("twoColumn"), "Landed cost"), {
              title: "Landed cost",
              body: "Arc Lamp lands at $1,207 including freight and 3.5% duty.\nArc Pendant lands at $928.",
              caption: "Figures from the US landed cost workbook, Landed sheet.",
            }),
          ],
          index: 0,
          comments: [], approvals: [], exports: [], importNotes: [], reduceMotion: false,
        } satisfies Deck,
      }),
    ],
  };
});
