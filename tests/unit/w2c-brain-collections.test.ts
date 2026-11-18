import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  DEFAULT_FILTERS, KNOWLEDGE, NO_COLLECTION, collectionProblems, filterKnowledge, isUnfiled, recordsInCollection,
} from "@/applications/brain/knowledge/model";

function rec(id: string, patch: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "org", collection: KNOWLEDGE, title: id, status: "verified", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "x", updatedBy: "x", history: [], ...patch,
  };
}

const collections = [rec("c1", { collection: "knowledgeCollections", title: "Care answers" }), rec("c2", { collection: "knowledgeCollections", title: "Pricing" })];
const records = [
  rec("k1", { fields: { collectionId: "c1" } }),
  rec("k2", { fields: { collectionId: "c2" } }),
  rec("k3", { fields: { collectionId: "" } }),
  rec("k4", { fields: { collectionId: "deleted" } }),
];

describe("knowledge collections", () => {
  it("validates a rename against every other collection, ignoring itself", () => {
    expect(collectionProblems({ name: "Pricing", interval: "45" }, collections, "c2")).toEqual({});
    expect(collectionProblems({ name: " pricing ", interval: "45" }, collections, "c1").name).toBe("A collection with this name exists.");
    expect(collectionProblems({ name: "", interval: "0" }, collections)).toEqual({ name: "Name the collection.", interval: "Between 1 and 730 days." });
  });

  it("treats an unset or deleted collection as No collection", () => {
    expect(records.filter((record) => isUnfiled(record, collections)).map((record) => record.id)).toEqual(["k3", "k4"]);
    const context = { now: new Date("2026-11-14T00:00:00Z"), collections };
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, collectionId: NO_COLLECTION }, context).map((record) => record.id).sort()).toEqual(["k3", "k4"]);
    expect(filterKnowledge(records, { ...DEFAULT_FILTERS, collectionId: "c1" }, context).map((record) => record.id)).toEqual(["k1"]);
  });

  it("lists exactly the records a delete would move", () => {
    expect(recordsInCollection(records, "c2").map((record) => record.id)).toEqual(["k2"]);
    expect(recordsInCollection([...records, rec("x", { collection: "facts", fields: { collectionId: "c2" } })], "c2")).toHaveLength(1);
  });
});
