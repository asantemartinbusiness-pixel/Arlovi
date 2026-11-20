import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactGrid, OVERLAY_WIDTH, OverlayActions, OverlaySection, OverlaySummary } from "@/design-system/overlay-kit";
import type { MenuEntry } from "@/design-system/overlays";

describe("overlay kit", () => {
  it("exposes the shared width presets", () => {
    expect(OVERLAY_WIDTH).toEqual({ compact: 440, form: 520, record: 640, wide: 760, modal: 560 });
  });
  it("renders a toned section with actions", () => {
    const html = renderToStaticMarkup(h(OverlaySection, { title: "Risk", hint: "Check", tone: "warning", actions: h("button", null, "Edit") }, "body"));
    expect(html).toContain('class="ds-ov-section"');
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("ds-ov-section-actions");
  });
  it("renders facts with mono and columns", () => {
    const html = renderToStaticMarkup(h(FactGrid, { columns: 3, dense: true, items: [{ label: "Amount", value: "1,200", mono: true, tone: "danger" }] }));
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('data-dense="true"');
    expect(html).toContain('data-mono="true"');
  });
  it("renders a summary with dot-separated meta", () => {
    const html = renderToStaticMarkup(h(OverlaySummary, { title: "Deal", eyebrow: "CRM", meta: ["a", false, "b"] }));
    expect(html.match(/<span>/g)?.length).toBe(2);
  });
  it("orders actions primary, secondary, spacer, end", () => {
    const html = renderToStaticMarkup(h(OverlayActions, { primary: h("i", null, "P"), secondary: h("i", null, "S"), end: h("i", null, "E") }));
    expect(html.indexOf("P")).toBeLessThan(html.indexOf("S"));
    expect(html.indexOf("ds-grow")).toBeLessThan(html.indexOf("E"));
  });
  it("confirm variant puts end first and primary last", () => {
    const html = renderToStaticMarkup(h(OverlayActions, { variant: "confirm", primary: h("i", null, "P"), end: h("i", null, "E") }));
    expect(html.indexOf("E")).toBeLessThan(html.indexOf("P"));
    expect(html).toContain('data-variant="confirm"');
  });
  it("accepts optional icon and description on MenuEntry", () => {
    const entry: MenuEntry = { label: "x", icon: null, description: "d" };
    expect(entry.description).toBe("d");
  });
});
