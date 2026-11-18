import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { rankKnowledge } from "@/applications/brain/knowledge/model";
import { composeAnswer } from "@/applications/t2_shared/engine";

const NOW = new Date("2026-11-14T09:30:00.000Z");

function rec(partial: Partial<Rec> & { id: string }): Rec {
  return {
    organizationId: "org", collection: "knowledge", title: "Untitled", status: "verified", ownerName: "Maya", summary: "", currency: "GBP", tags: [], fields: {},
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), revision: 1, createdBy: "Maya", updatedBy: "Maya", history: [], ...partial,
  };
}

const records = [
  rec({ id: "k1", title: "Shade warranty: what we cover", tags: ["warranty"], summary: "24 months from delivery.", body: { content: "Every shade carries a 24-month warranty." } }),
  rec({ id: "k2", title: "Replacement shade lead time", status: "needs_review", summary: "Three weeks, pending confirmation.", body: { content: "Quote three weeks." } }),
  rec({ id: "k3", title: "Old warranty wording", status: "archived", summary: "Superseded.", tags: ["warranty"] }),
  rec({ id: "k4", title: "Answering a trade price question", status: "needs_review", fields: { provenance: "model_generated" }, summary: "Draft reply." }),
];

describe("deterministic knowledge retrieval", () => {
  it("ranks by question words, ignores stopwords and never returns archived records", () => {
    const hits = rankKnowledge(records, "What is our warranty on shades?");
    expect(hits.map((hit) => hit.record.id)).toEqual(["k1", "k2"]);
    expect(hits[0].matched).toContain("warranty");
    expect(rankKnowledge(records, "what is the")).toEqual([]);
  });

  it("answers by quoting record summaries, labels unverified ones and cites them", () => {
    const answer = composeAnswer({ records, prompt: "How do we handle a shade warranty claim?", scope: [], now: NOW, money: String, date: () => "" });
    expect(answer.text).toContain("“Shade warranty: what we cover” (verified): 24 months from delivery.");
    expect(answer.text).toContain("in review, not verified");
    expect(answer.citations.map((citation) => citation.id)).toEqual(expect.arrayContaining(["k1", "k2"]));
    expect(answer.limits.join(" ")).toMatch(/Nothing was paraphrased or generated/);
    expect(answer.limits.join(" ")).toMatch(/not an authoritative answer/);
  });

  it("marks model-generated text and says when nothing matches", () => {
    const trade = composeAnswer({ records, prompt: "What is our process for a trade price question?", scope: [], now: NOW, money: String, date: () => "" });
    expect(trade.text).toContain("model-generated text");
    const none = composeAnswer({ records: [], prompt: "How do we paint the van?", scope: [], now: NOW, money: String, date: () => "" });
    expect(none.text).toMatch(/no language model is connected, so I will not guess/);
  });
});
