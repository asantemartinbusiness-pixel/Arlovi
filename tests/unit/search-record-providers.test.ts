import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { buildLocalSearchHits, visibleDocumentSearchText, visibleLocalMailText } from "@/platform/searchRecordProviders";
import { matchingContentSnippet, searchHits } from "@/platform/searchModel";

const context = {
  organizationId: "org-northline", organizationSlug: "northline",
  role: "owner" as const, actor: "Maya Chen",
};

function record(overrides: Partial<Rec>): Rec {
  return {
    id: "nl-documents-320", organizationId: "org-northline",
    collection: "documents", title: "Workshop guidance", status: "published",
    ownerName: "Maya Chen", summary: "Published operational guidance",
    currency: "GBP", tags: ["workshop"], fields: { folder: "Policies", confidential: false },
    body: { blocks: [
      { id: "a", type: "paragraph", runs: [{ text: "Use extraction before painting.", marks: [] }] },
    ] },
    createdAt: "2026-11-10T10:00:00Z", updatedAt: "2026-11-19T13:00:00Z",
    revision: 1, createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [],
    ...overrides,
  };
}

describe("Search 2.2 native providers", () => {
  it("indexes only visible document editor text, never review comments or deleted suggestions", () => {
    const body = { blocks: [
      { type: "paragraph", runs: [
        { text: "Safe approved policy ", marks: [] },
        { text: "SECRET_DELETION", suggestion: { kind: "delete", id: "s1" }, marks: [] },
      ] },
      { type: "table", table: { rows: [["Projects", "Budgets"]] } },
      { type: "image", image: { caption: "Workshop photograph", alt: "A diagram" } },
    ], comments: [{ body: "PRIVATE_REVIEW_NOTE" }], references: [{ note: "HIDDEN_REFERENCE" }] };
    const text = visibleDocumentSearchText(body);
    expect(text).toContain("Safe approved policy");
    expect(text).toContain("Projects Budgets");
    expect(text).toContain("Workshop photograph");
    expect(text).not.toContain("SECRET_DELETION");
    expect(text).not.toContain("PRIVATE_REVIEW_NOTE");
    expect(text).not.toContain("HIDDEN_REFERENCE");
  });

  it("matches non-confidential document body and returns a relevant excerpt", () => {
    const [hit] = buildLocalSearchHits([record({})], context);
    expect(hit).toBeDefined();
    expect(hit.contentText).toContain("extraction");
    expect(searchHits([hit], { query: "painting", scope: "files" })).toHaveLength(1);
    expect(matchingContentSnippet(hit, "painting")).toContain("painting");
  });

  it("never reads confidential document summary or body into global search", () => {
    const [hit] = buildLocalSearchHits([record({
      title: "Confidential agreement",
      summary: "SECRET_SUMMARY",
      fields: { folder: "Contracts", confidential: true },
      body: { blocks: [{ type: "paragraph", runs: [{ text: "SECRET_BODY", marks: [] }] }] },
    })], context);
    expect(hit.title).toEqual("Confidential agreement");
    expect(hit.summary).toBeUndefined();
    expect(hit.contentText).toBeUndefined();
    expect(hit.previewFields).toEqual([{ label: "Folder", value: "Contracts" }]);
    expect(searchHits([hit], { query: "SECRET_BODY", scope: "all" })).toHaveLength(0);
    expect(searchHits([hit], { query: "SECRET_SUMMARY", scope: "all" })).toHaveLength(0);
    expect(searchHits([hit], { query: "Contracts", scope: "all" })).toHaveLength(0);
    expect(searchHits([hit], { query: "Confidential", scope: "files" })).toHaveLength(1);
  });

  it("restricts native results to the active organisation and available app", () => {
    const other = record({ id: "hb-documents-1", organizationId: "org-harbor", title: "Private Harbor item" });
    const ownerHits = buildLocalSearchHits([other, record({})], context);
    expect(ownerHits).toHaveLength(1);
    const clientHits = buildLocalSearchHits([record({})], { ...context, role: "client" });
    expect(clientHits).toEqual([]);
  });

  it("adds Finance reference, amount and due-date fields without exposing arbitrary fields", () => {
    const [hit] = buildLocalSearchHits([record({
      id: "nl-invoices-1", collection: "invoices", title: "INV-2050", body: undefined,
      fields: { number: "INV-2050", contactId: "nl-contacts-22", payrollSecret: "KEEP_PRIVATE" },
      amountMinor: 342500, dueAt: "2026-12-03T00:00:00.000Z",
    })], context);
    expect(hit.previewFields?.some(field => field.label === "Amount" && field.value.includes("3,425"))).toBe(true);
    expect(hit.previewFields?.some(field => field.label === "Due date")).toBe(true);
    expect(searchHits([hit], { query: "INV-2050", scope: "all" })).toHaveLength(1);
    expect(searchHits([hit], { query: "KEEP_PRIVATE", scope: "all" })).toHaveLength(0);
  });

  it("searches only local mail threads and does not index Bcc or flagged phishing body", () => {
    const local = record({
      id: "nl-emailThreads-22", collection: "emailThreads", title: "Oak delivery", status: "inbox",
      fields: { from: "orders@example.test", to: "maya@example.test", bcc: "hidden@example.test", folder: "inbox", risk: "none" },
      body: { messages: [{ from: "orders@example.test", body: "Shipment arrives on Tuesday" }] },
    });
    const [hit] = buildLocalSearchHits([local], { ...context, role: "sales" });
    expect(hit.to).toMatch(/comms\/email\/nl-emailThreads-22$/);
    expect(searchHits([hit], { query: "shipment", scope: "mail" })).toHaveLength(1);
    expect(searchHits([hit], { query: "hidden@example.test", scope: "mail" })).toHaveLength(0);
    const blocked = buildLocalSearchHits([local], { ...context, role: "finance" });
    expect(blocked).toHaveLength(0);
    const suspicious = buildLocalSearchHits([record({ ...local, fields: { ...local.fields, risk: "phishing" } })], context);
    expect(suspicious[0].contentText).toBeUndefined();
  });

  it("parses mail messages defensively and never serialises unrelated body metadata", () => {
    expect(visibleLocalMailText({ messages: [
      { body: "First message", headers: { secret: "DO_NOT_INDEX" } },
      { body: "Second message" },
    ], hidden: "PRIVATE" })).toBe("First message Second message");
  });
});
