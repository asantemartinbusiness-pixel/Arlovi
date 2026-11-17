import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  campaignChannels, campaignLibraryRows, campaignPortfolioStats, campaignStageRows,
} from "@/applications/market/campaignLibraryModel";

function record(
  id: string,
  title: string,
  status: string,
  budget: number,
  channel: string,
  updated: string,
): Rec {
  return {
    id, organizationId: "northline", collection: "campaigns",
    title, status, summary: `${title} campaign brief`, ownerName: "Priya Shah",
    amountMinor: budget, currency: "GBP",
    fields: { budgetMinor: budget, spentMinor: budget / 4, primaryChannel: channel, objective: "Trade enquiries" },
    tags: [], body: {
      channels: [{ network: channel, budgetMinor: budget, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 }],
    },
    createdAt: "2026-01-01T00:00:00Z", updatedAt: updated, startAt: updated,
    revision: 1, createdBy: "Priya", updatedBy: "Priya", history: [],
  };
}

const records = [
  record("one", "Winter trade list", "active", 50000, "email", "2026-11-11T10:00:00Z"),
  record("two", "Clerkenwell launch", "approval", 30000, "instagram", "2026-11-12T10:00:00Z"),
  record("three", "Studio mailer", "draft", 90000, "email", "2026-11-10T10:00:00Z"),
  record("four", "Archived search", "archived", 12000, "search", "2026-10-01T10:00:00Z"),
];

describe("Marketing Campaign Library portfolio", () => {
  it("keeps stage tab scopes consistent with approved native app tabs", () => {
    expect(campaignStageRows(records, "All")).toHaveLength(4);
    expect(campaignStageRows(records, "Draft").map(row => row.id)).toEqual(["three"]);
    expect(campaignStageRows(records, "Approval").map(row => row.id)).toEqual(["two"]);
    expect(campaignStageRows(records, "Active").map(row => row.id)).toEqual(["one"]);
    expect(campaignStageRows(records, "Completed").map(row => row.id)).toEqual(["four"]);
  });

  it("filters by multiple search terms and an actual configured channel", () => {
    expect(campaignLibraryRows(records, { state: "All", query: "winter trade", channel: "all", sort: "recent" }).map(row => row.id)).toEqual(["one"]);
    expect(campaignLibraryRows(records, { state: "All", query: "Priya", channel: "email", sort: "recent" }).map(row => row.id)).toEqual(["one", "three"]);
    expect(campaignLibraryRows(records, { state: "Draft", query: "", channel: "instagram", sort: "recent" })).toEqual([]);
    expect(campaignChannels(records[1])).toEqual(["instagram"]);
  });

  it("sorts without mutating source records", () => {
    expect(campaignLibraryRows(records, { state: "All", query: "", channel: "all", sort: "name" }).map(row => row.id)).toEqual(["four", "two", "three", "one"]);
    expect(campaignLibraryRows(records, { state: "All", query: "", channel: "all", sort: "budget" }).map(row => row.id)).toEqual(["three", "one", "two", "four"]);
    expect(campaignLibraryRows(records, { state: "All", query: "", channel: "all", sort: "recent" }).map(row => row.id)).toEqual(["two", "one", "three", "four"]);
    expect(records.map(row => row.id)).toEqual(["one", "two", "three", "four"]);
  });

  it("reports figures from saved records, not external provider assumptions", () => {
    expect(campaignPortfolioStats(records)).toEqual({
      total: 4, active: 1, awaiting: 1, drafts: 1,
      budgetMinor: 182000, spentMinor: 45500,
    });
  });
});
