import { describe, expect, it } from "vitest";
import { appEntry } from "@/app/catalog";
import { advanceJourney, emptyJourney } from "@/platform/appJourney";
import { resumableApps } from "@/app/recentAppWork";

describe("resume native apps", () => {
  const slug = "northline";
  const fin = appEntry("FIN", slug) + "?tab=Summary&filter=outstanding";
  const project = appEntry("PROJECT", slug) + "?tab=Overview";
  it("resumes the actual last Finance route without replacing tabs with the home page", () => {
    let state = advanceJourney(emptyJourney(), slug, "FIN", fin);
    state = advanceJourney(state, slug, "PROJECT", project);
    const items = resumableApps(state, slug, "owner");
    expect(items.map(item => item.code).slice(0, 2)).toEqual(["PROJECT", "FIN"]);
    expect(items.find(item => item.code === "FIN")?.to).toBe(fin);
    expect(items.find(item => item.code === "FIN")?.page).toContain("Summary");
  });
  it("filters remembered destinations by role", () => {
    let state = advanceJourney(emptyJourney(), slug, "FIN", fin);
    state = advanceJourney(state, slug, "PROJECT", project);
    expect(resumableApps(state, slug, "client")).toEqual([]);
    expect(resumableApps(state, slug, "finance").some(item => item.code === "FIN")).toBe(true);
    expect(resumableApps(state, slug, "finance").some(item => item.code === "PROJECT")).toBe(false);
  });
  it("does not expose another organisation's route when rendering resume links", () => {
    const state = advanceJourney(emptyJourney(), slug, "FIN", fin);
    expect(resumableApps(state, "harbor", "owner")).toEqual([]);
  });
});
