import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { marketAreaCounts } from "@/applications/market/marketAreaModel";
import { searchAudienceSegments } from "@/applications/market/AudienceSegmentsLibrary";

function makeRecord(id: string, collection: string, status: string, fields: Rec["fields"] = {}, body?: unknown): Rec {
  return {
    id, organizationId: "northline", collection, status, fields, body,
    title: id, summary: `${id} record`, ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "Team", updatedBy: "Team", tags: [], history: [],
  };
}

const data = {
  socialPosts: [
    makeRecord("post1", "socialPosts", "scheduled", { network: "instagram" }),
    makeRecord("post2", "socialPosts", "draft", { network: "linkedin" }),
    makeRecord("post3", "socialPosts", "failed", { network: "x" }),
  ],
  campaigns: [
    makeRecord("email1", "campaigns", "draft", {}, { channels: [{ network: "email" }] }),
    makeRecord("search1", "campaigns", "active", {}, { channels: [{ network: "search" }] }),
  ],
  audiences: [
    makeRecord("Trade accounts", "audiences", "active", {}, { rules: [{ field: "segment", op: "is", value: "trade" }], exclusions: ["suppressed"] }),
    makeRecord("Newsletter buyers", "audiences", "active", {}, { rules: [{ field: "tag", op: "has", value: "newsletter" }] }),
  ],
  templates: [makeRecord("welcome email", "templates", "approved", { kind: "email" })],
  contacts: [
    makeRecord("contact1", "contacts", "active", { consentEmail: true }),
    makeRecord("contact2", "contacts", "active", { consentEmail: true, suppressed: true }),
    makeRecord("contact3", "contacts", "active", { consentEmail: false }),
  ],
};

describe("Marketing work-area context", () => {
  it("counts social and scheduled content from local status records", () => {
    expect(marketAreaCounts("calendar", data)).toEqual([
      { label: "Dated content", count: 0 },
      { label: "Queued locally", count: 1 },
      { label: "Failed", count: 1 },
    ]);
    expect(marketAreaCounts("social", data)).toEqual([
      { label: "Drafts", count: 1 },
      { label: "Queued locally", count: 1 },
      { label: "Failed", count: 1 },
    ]);
  });

  it("does not treat suppressed contacts as eligible for email context", () => {
    expect(marketAreaCounts("email", data)).toEqual([
      { label: "Campaign plans", count: 1 },
      { label: "Email templates", count: 1 },
      { label: "Consent recorded", count: 1 },
    ]);
    expect(marketAreaCounts("audiences", data)).toEqual([
      { label: "Audience segments", count: 2 },
      { label: "Contacts", count: 3 },
      { label: "Suppressed", count: 1 },
    ]);
  });

  it("searches segment rule details without changing source record order", () => {
    expect(searchAudienceSegments(data.audiences, "TRADE").map(row => row.title)).toEqual(["Trade accounts"]);
    expect(searchAudienceSegments(data.audiences, "tag newsletter").map(row => row.title)).toEqual(["Newsletter buyers"]);
    expect(searchAudienceSegments(data.audiences, "missing rule")).toEqual([]);
    expect(data.audiences.map(row => row.title)).toEqual(["Trade accounts", "Newsletter buyers"]);
  });
});
