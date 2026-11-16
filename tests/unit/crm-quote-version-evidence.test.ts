import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { duplicateQuoteBody, fieldsForQuoteDuplicate, freshQuoteVersionFields } from "@/applications/crm/quoteEvidence";

const line = { id: "l1", description: "Pendants", quantity: 2, unitPriceMinor: 12_000,
  taxCategory: "standard" as const, discountBp: 1500 };
const accepted = {
  id: "quote-1", collection: "quotes", organizationId: "org-northline",
  title: "Q-126", status: "accepted", summary: "A customer quote",
  fields: {
    number: "Q-126", version: 2, approvedBy: "Owner", approvedAt: "2026-11-10",
    approvedVersion: 2, approvedGrossMinor: 24_000, sentAt: "2026-11-11",
    sentBy: "Sales", delivery: "queued_local", acceptedAt: "2026-11-12",
    acceptedVersion: 2, acceptedGrossMinor: 24_000, acceptedByCustomer: "Marcus",
    acceptanceEvidenceSource: "signed_quote", acceptanceEvidenceReference: "Q-126 signed",
    acceptanceRecordedBy: "Maya", acceptanceVerification: "manual_local",
  },
  body: { lines: [line], sends: [{ by: "Sales", to: "customer@example.test" }] },
} as unknown as Rec;

describe("quote version evidence and discount controls", () => {
  it("never carries approval, sending or customer acceptance proof into a new version", () => {
    const fields = freshQuoteVersionFields(accepted.fields, [line]);
    for (const field of [
      "approvedBy", "approvedAt", "approvedVersion", "approvedGrossMinor",
      "sentAt", "sentBy", "delivery", "acceptedAt", "acceptedVersion", "acceptedGrossMinor",
      "acceptedByCustomer", "acceptanceEvidenceSource", "acceptanceEvidenceReference",
      "acceptanceRecordedBy", "acceptanceVerification",
    ]) expect(fields[field], field).toBeUndefined();
    expect(accepted.fields.acceptedAt).toBe("2026-11-12");
  });

  it("keeps the owner-discount approval gate on a duplicated expensive quote", () => {
    const fields = fieldsForQuoteDuplicate(accepted);
    expect(fields.discountApproval).toContain("15.0% exceeds the 10% ceiling");
    expect(fields.acceptedByCustomer).toBeUndefined();
    expect(fields.approvedBy).toBeUndefined();
  });

  it("removes outdated discount flags for a legitimately lower discounted version", () => {
    const fields = freshQuoteVersionFields({
      ...accepted.fields, discountApproval: "Old 15% decision",
    }, [{ ...line, discountBp: 500 }]);
    expect(fields.discountApproval).toBeUndefined();
  });

  it("drops historical sends from duplicate body without changing the source quote", () => {
    const body = duplicateQuoteBody(accepted);
    expect(body.sends).toBeUndefined();
    expect((accepted.body as { sends?: unknown[] }).sends).toHaveLength(1);
    expect(body.lines).toEqual([line]);
  });
});
