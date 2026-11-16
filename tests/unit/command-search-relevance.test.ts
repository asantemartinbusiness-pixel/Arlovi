import { describe, expect, it } from "vitest";
import { rankSearchHits, searchScore } from "@/app/searchRanking";

const sample = [
  {title: "Finance Overview", detail: "Finance", searchText: "Cash, invoices and reporting", to: "/finance/overview"},
  {title: "Budgets & Forecasts", detail: "Finance", searchText: "Plan cash and revenue", to: "/finance/budgets"},
  {title: "Marketing Calendar", detail: "Marketing", searchText: "Campaign budgets", to: "/marketing/calendar"},
  {title: "Invoice List", detail: "Finance", searchText: "Bills and payables", to: "/finance/invoices"},
];

describe("command destination relevance", () => {
  it("prefers exact title and title prefix over a description-only match", () => {
    const ordered = rankSearchHits("invoice list", sample);
    expect(ordered[0].title).toBe("Invoice List");
    expect(ordered.map(hit => hit.title)).not.toContain("Budgets & Forecasts");
  });

  it("matches tokens across a title, its application and its description", () => {
    const results = rankSearchHits("finance budgets", sample);
    expect(results[0].title).toBe("Budgets & Forecasts");
    expect(results.map(row => row.title)).not.toContain("Marketing Calendar");
  });

  it("normalises punctuation, spacing and case while preserving exact links", () => {
    const found = rankSearchHits("  BUDGETS   forecasts  ", sample);
    expect(found[0].to).toBe("/finance/budgets");
  });

  it("omits unrelated hits, handles empty queries and maintains stable order", () => {
    expect(rankSearchHits("nonexistent subject", sample)).toEqual([]);
    expect(rankSearchHits("", sample)).toEqual(sample);
    expect(rankSearchHits("finance", sample).map(row => row.title)).toEqual([
      "Finance Overview", "Budgets & Forecasts", "Invoice List",
    ]);
  });

  it("does not require an exact adjacent phrase when keywords span fields", () => {
    expect(searchScore("finance cash", sample[0])).not.toBeNull();
    expect(searchScore("finance cash", sample[2])).toBeNull();
  });
});
