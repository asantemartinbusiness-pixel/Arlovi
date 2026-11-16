import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/app/navigation.css", import.meta.url), "utf8");

describe("navigation does not replace the approved Arlovi design system", () => {
  it("uses shared design tokens instead of hardcoded brand or semantic colors", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\\b/i);
    expect(css).not.toMatch(/(?:--accent|--fg-default|--bg-canvas|--font-sans|--font-display|--font-mono)\\s*:/);
    expect(css).toContain("var(--bg-surface)");
    expect(css).toContain("var(--fg-muted)");
    expect(css).toContain("var(--border-default)");
    expect(css).toContain("var(--focus-ring)");
  });
  it("keeps application pane width and header design-system values intact", () => {
    expect(css).not.toMatch(/--appnav-w\\s*:/);
    expect(css).not.toMatch(/--header-h\\s*:/);
    expect(css).not.toMatch(/--radius-lg\\s*:/);
  });
});
