import { describe, expect, it } from "vitest";
import {
  advanceJourney, emptyJourney, previousJourney, rememberedAppRoute, scopedJourneyUrl,
} from "../../src/platform/appJourney";

describe("cross-application journey", () => {
  const slug = "northline";
  const finance = "/o/northline/fin/invoices/inv-9?tab=activity&filter=open";
  const projects = "/o/northline/project/projects/p-12?tab=tasks";
  it("returns to the exact Finance record and tab after a Projects detour", () => {
    let state = advanceJourney(emptyJourney(), slug, "FIN", finance);
    state = advanceJourney(state, slug, "PROJECT", projects);
    expect(previousJourney(state)).toEqual({ app: "FIN", url: finance });
    expect(rememberedAppRoute(state, slug, "FIN")).toBe(finance);
    state = advanceJourney(state, slug, "FIN", finance);
    expect(state.trail).toHaveLength(1);
    expect(previousJourney(state)).toBeNull();
  });
  it("keeps latest in-app route, search and hash without adding return steps", () => {
    let state = advanceJourney(emptyJourney(), slug, "FIN", "/o/northline/fin/invoices");
    state = advanceJourney(state, slug, "FIN", finance + "#notes");
    state = advanceJourney(state, slug, "PROJECT", projects);
    expect(previousJourney(state)?.url).toBe(finance + "#notes");
    expect(state.trail).toHaveLength(2);
  });
  it("keeps a multiple-app chain and supports previous-app returns", () => {
    let state = advanceJourney(emptyJourney(), slug, "FIN", finance);
    state = advanceJourney(state, slug, "PROJECT", projects);
    state = advanceJourney(state, slug, "CRM", "/o/northline/crm/home");
    expect(previousJourney(state)?.app).toBe("PROJECT");
    state = advanceJourney(state, slug, "PROJECT", projects);
    expect(previousJourney(state)?.app).toBe("FIN");
  });
  it("rejects routes belonging to another tenant, redirects or malformed paths", () => {
    for (const url of ["/o/harbor/fin/invoices", "https://example.com/o/northline/fin", "//evil.test/o/northline/fin", "/o/northline/../harbor/fin", "/o/northline/fin\\bad"]) {
      expect(scopedJourneyUrl(url, slug), url).toBe(false);
      expect(advanceJourney(emptyJourney(), slug, "FIN", url)).toEqual(emptyJourney());
    }
  });
  it("stores no in-progress form values and does not resume another app under a wrong code", () => {
    const state = advanceJourney(emptyJourney(), slug, "FIN", finance);
    expect(rememberedAppRoute(state, slug, "PROJECT")).toBeNull();
    expect(rememberedAppRoute(state, "harbor", "FIN")).toBeNull();
    expect(JSON.stringify(state)).not.toContain("formValues");
  });
});
