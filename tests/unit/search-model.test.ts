import { describe, expect, it } from "vitest";
import {
  matchesScope, normalizeSearch, scoreSearchHit, searchHits, type SearchHit,
} from "@/platform/searchModel";

const hit = (overrides: Partial<SearchHit>): SearchHit => ({
  key: "a", kind: "record", group: "Records", title: "Budget report",
  detail: "Finance", to: "/o/northline/fin/invoices/123", appCode: "FIN",
  ...overrides,
});

describe("Arlovi search ranking and scopes", () => {
  it("normalises accents and case and matches all search tokens", () => {
    expect(normalizeSearch("  Échéance  ")).toBe("echeance");
    expect(scoreSearchHit(hit({ title: "Annual Budget Report" }), "annual report")).toBeGreaterThan(0);
    expect(scoreSearchHit(hit({ title: "Annual Budget Report" }), "unknown report")).toBe(0);
  });

  it("ranks exact record references above recently visited screens", () => {
    const results = searchHits([
      hit({ key: "screen", kind: "screen", title: "Invoice list", recordId: undefined, to: "/o/northline/fin/invoices" }),
      hit({ key: "exact", recordId: "INV-2041", title: "Northline invoice", to: "/o/northline/fin/invoices/2041" }),
    ], { query: "INV-2041", scope: "all" });
    expect(results.map(item => item.key)).toEqual(["exact"]);
  });

  it("filters app, files, people, actions and my work separately", () => {
    expect(matchesScope(hit({ collection: "documents" }), "files")).toBe(true);
    expect(matchesScope(hit({ collection: "employees" }), "people")).toBe(true);
    expect(matchesScope(hit({ mine: true }), "my-work")).toBe(true);
    expect(matchesScope(hit({ mine: false }), "my-work")).toBe(false);
    expect(matchesScope(hit({ appCode: "HR" }), "this-app", "FIN")).toBe(false);
    expect(matchesScope(hit({ kind: "action" }), "actions")).toBe(true);
  });

  it("deduplicates identical destinations and honours result limits", () => {
    const results = searchHits([
      hit({ key: "first", title: "Finance", to: "/o/northline/fin/home" }),
      hit({ key: "duplicate", title: "Finance", to: "/o/northline/fin/home" }),
      hit({ key: "third", title: "Finance report", to: "/o/northline/fin/reports" }),
    ], { query: "finance", scope: "all" }, 2);
    expect(results.map(item => item.key)).toEqual(["first", "third"]);
  });
});
