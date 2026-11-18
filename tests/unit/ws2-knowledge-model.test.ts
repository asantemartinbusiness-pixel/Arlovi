import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  DEFAULT_FILTERS, backlinks, draftFromRecord, draftProblems, filterKnowledge, isSubstantiveChange, matchScore,
  nextOriginProvenance, originProvenanceOf, provenanceChoices,
  reviewRequestProblems, reviewTiming, sortKnowledge, statusAfterEdit, summarize, verificationBlockers,
} from "@/applications/brain/knowledge/model";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function rec(partial: Partial<Rec> & { id: string }): Rec {
  return {
    organizationId: "org", collection: "knowledge", title: "Untitled", status: "draft", ownerName: "Maya Chen", summary: "",
    currency: "GBP", tags: [], fields: {}, createdAt: day(-10), updatedAt: day(-1), revision: 1, createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [],
    ...partial,
  };
}

const collections = [rec({ id: "c1", collection: "knowledgeCollections", title: "Care", fields: { reviewIntervalDays: 30 } })];

describe("knowledge review timing", () => {
  it("never calls a draft fresh", () => {
    expect(reviewTiming(rec({ id: "a", status: "draft" }), NOW, 30).state).toBe("unreviewed");
  });
  it("marks an in-review record overdue once its due date passes", () => {
    expect(reviewTiming(rec({ id: "a", status: "needs_review", dueAt: day(-2) }), NOW, 30).state).toBe("overdue");
    expect(reviewTiming(rec({ id: "a", status: "needs_review", dueAt: day(3) }), NOW, 30)).toMatchObject({ state: "review_due", days: 3 });
  });
  it("ages a verified record against its interval", () => {
    expect(reviewTiming(rec({ id: "a", status: "verified", fields: { lastReviewedAt: day(-5) } }), NOW, 30).state).toBe("fresh");
    expect(reviewTiming(rec({ id: "a", status: "verified", fields: { lastReviewedAt: day(-20) } }), NOW, 30).state).toBe("review_due");
    expect(reviewTiming(rec({ id: "a", status: "verified", fields: { lastReviewedAt: day(-45) } }), NOW, 30).state).toBe("stale");
  });
  it("does not invent a review date for a verified record without one", () => {
    expect(reviewTiming(rec({ id: "a", status: "verified" }), NOW, 30).state).toBe("unreviewed");
  });
});

describe("verification rules", () => {
  const inReview = (fields: Rec["fields"], body: unknown) => rec({ id: "a", title: "Warranty", status: "needs_review", fields, body });
  it("blocks model-generated text that cites no source", () => {
    const blockers = verificationBlockers(inReview({ provenance: "model_generated" }, { content: "Text" }), "Maya Chen", true);
    expect(blockers.join(" ")).toMatch(/cannot be verified until it cites/);
  });
  it("allows model-generated text once a source is cited", () => {
    expect(verificationBlockers(inReview({ provenance: "model_generated" }, { content: "Text", sources: [{ id: "s", label: "Price list" }] }), "Maya Chen", true)).toEqual([]);
  });
  it("keeps the model-generated origin when the label is switched to human", () => {
    const relabelled = inReview({ provenance: "human", originProvenance: "model_generated" }, { content: "Text" });
    expect(originProvenanceOf(relabelled)).toBe("model_generated");
    expect(verificationBlockers(relabelled, "Maya Chen", true).join(" ")).toMatch(/Model-generated text cannot be verified/);
    expect(nextOriginProvenance(relabelled, "human")).toBe("model_generated");
    expect(nextOriginProvenance(rec({ id: "b", fields: { provenance: "imported" } }), "human")).toBe("imported");
    expect(nextOriginProvenance(rec({ id: "c", fields: { provenance: "human" } }), "model_generated")).toBe("model_generated");
    expect(nextOriginProvenance(undefined, "human")).toBe("human");
    expect(provenanceChoices("model_generated")).not.toContain("human");
    expect(provenanceChoices("human")).toContain("human");
  });
  it("requires a review request, content and the capability", () => {
    expect(verificationBlockers(rec({ id: "a", title: "x", status: "draft", body: { content: "x" } }), "Maya", true)).toHaveLength(1);
    expect(verificationBlockers(inReview({}, { content: "" }), "Maya", true)).toHaveLength(1);
    expect(verificationBlockers(inReview({}, { content: "x" }), "Maya", false)).toHaveLength(1);
  });
  it("returns a verified record to review when its substance changes", () => {
    const record = rec({ id: "a", title: "Warranty", status: "verified", tags: ["care"], fields: { collectionId: "c1" }, body: { content: "24 months" } });
    const before = draftFromRecord(record);
    expect(isSubstantiveChange(before, { ...before, tags: ["care", "x"], collectionId: "c2" })).toBe(false);
    expect(isSubstantiveChange(before, { ...before, content: "12 months" })).toBe(true);
    expect(statusAfterEdit("verified", true)).toBe("needs_review");
    expect(statusAfterEdit("draft", true)).toBe("draft");
  });
  it("validates review requests and drafts", () => {
    expect(reviewRequestProblems({ reviewer: "", dueAt: day(-3), note: "" }, NOW)).toEqual({ reviewer: expect.any(String), dueAt: expect.any(String) });
    expect(reviewRequestProblems({ reviewer: "Maya", dueAt: day(2), note: "" }, NOW)).toEqual({});
    expect(Object.keys(draftProblems({ title: "", summary: "", content: "", collectionId: "", provenance: "human", tags: [], sources: [{ id: "s", label: "" }], related: [], reviewIntervalDays: 0 }))).toEqual(
      ["title", "collectionId", "reviewIntervalDays", "source-0"],
    );
  });
});

describe("search and filters", () => {
  const records = [
    rec({ id: "w", title: "Shade warranty", status: "verified", tags: ["care"], updatedAt: day(-3), fields: { collectionId: "c1", lastReviewedAt: day(-50) }, body: { content: "24 months on shades" } }),
    rec({ id: "l", title: "Lead time", status: "needs_review", dueAt: day(-1), updatedAt: day(-1), fields: { collectionId: "c1", provenance: "model_generated", reviewer: "Theo" }, body: { content: "three weeks for shades", related: ["w"] } }),
    rec({ id: "o", title: "Old price rule", status: "archived", updatedAt: day(-9), fields: { collectionId: "c2" }, body: { content: "shades" } }),
  ];
  const context = { now: NOW, collections };

  it("requires every term and ranks title matches first", () => {
    expect(matchScore(records[0], "shade warranty")).toBeGreaterThan(matchScore(records[1], "shades"));
    expect(matchScore(records[1], "shade warranty")).toBe(0);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, query: "shades" }, context).map((r) => r.id)).toEqual(["w", "l"]);
  });
  it("hides archived records unless asked, and filters by facets", () => {
    expect(filterKnowledge(records, DEFAULT_FILTERS, context).map((r) => r.id)).toEqual(["l", "w"]);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, status: "" }, context)).toHaveLength(3);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, provenance: "model_generated" }, context).map((r) => r.id)).toEqual(["l"]);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, timing: "stale" }, context).map((r) => r.id)).toEqual(["w"]);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, timing: "attention" }, context)).toHaveLength(2);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, reviewer: "Theo" }, context).map((r) => r.id)).toEqual(["l"]);
  });
  it("sorts by review date and title", () => {
    expect(sortKnowledge(records.slice(0, 2), "due", context).map((r) => r.id)).toEqual(["w", "l"]);
    expect(sortKnowledge(records, "title", context).map((r) => r.id)).toEqual(["l", "o", "w"]);
  });
  it("summarises from records and finds backlinks", () => {
    expect(summarize(records, context)).toMatchObject({ total: 2, verified: 1, inReview: 1, overdue: 1, stale: 1, modelUnverified: 1, unsourced: 2 });
    expect(backlinks(records, "w").map((r) => r.id)).toEqual(["l"]);
  });
});
