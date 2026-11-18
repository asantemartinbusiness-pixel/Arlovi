import { describe, expect, it } from "vitest";
import { CATEGORY_OVERVIEWS, categoryDestinations } from "@/app/categoryDirectory";
import { NAV_GROUPS } from "@/app/nav";
import { appEntry, findScreen } from "@/app/catalog";
import { canOpen } from "@/platform/policy";

describe("all six native application categories", () => {
  it("provides a distinct, meaningful directory introduction for every registered group", () => {
    expect(Object.keys(CATEGORY_OVERVIEWS).sort()).toEqual(NAV_GROUPS.map(group => group.label).sort());
    for (const group of NAV_GROUPS) {
      expect(CATEGORY_OVERVIEWS[group.label].title.length).toBeGreaterThan(12);
      expect(CATEGORY_OVERVIEWS[group.label].description.length).toBeGreaterThan(40);
    }
  });

  it("only exposes actual record-independent work areas belonging to the selected app and organisation", () => {
    for (const group of NAV_GROUPS) {
      for (const app of group.apps) {
        const shortcuts = categoryDestinations(app.code, "northline");
        expect(shortcuts.length, app.code).toBeGreaterThan(0);
        expect(shortcuts.length, app.code).toBeLessThanOrEqual(4);
        expect(new Set(shortcuts.map(link => link.to)).size, app.code).toBe(shortcuts.length);
        for (const shortcut of shortcuts) {
          expect(shortcut.label.length).toBeGreaterThan(0);
          expect(shortcut.to).toMatch(/^\/o\/northline\//);
          expect(shortcut.to).not.toMatch(/:org|:id|:slug/);
          expect(findScreen(shortcut.to)?.screen.applicationCode, shortcut.to).toBe(app.code);
          expect(findScreen(shortcut.to)?.params.id).toBeUndefined();
        }
        expect(appEntry(app.code, "northline")).toMatch(/^\/o\/northline\//);
      }
    }
  });

  it("does not manufacture routes for unknown application codes", () => {
    expect(categoryDestinations("UNKNOWN", "northline")).toEqual([]);
  });

  it("keeps role filtering at the application boundary for category navigation", () => {
    const visibleToClient = NAV_GROUPS.flatMap(group =>
      group.apps.filter(app => canOpen("client", app.code)).map(app => app.code));
    expect(visibleToClient).not.toContain("FIN");
    expect(visibleToClient).not.toContain("ADMIN");
    expect(visibleToClient).toContain("BOOK");
  });
});
