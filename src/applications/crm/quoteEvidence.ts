import { readLines, type InvoiceLine } from "@/domain/fin-invoice";
import type { Rec } from "@/domain/types";

/** Approval, delivery and acceptance belong to ONE priced quote version.
 * New versions and duplicates may keep descriptive metadata but not proofs
 * or authority granted to an earlier version.
 */
const VERSION_EVIDENCE = [
  "approvedBy", "approvedAt", "approvedVersion", "approvedGrossMinor",
  "sentAt", "sentBy", "delivery",
  "acceptedAt", "acceptedVersion", "acceptedGrossMinor", "acceptedByCustomer",
  "acceptanceEvidenceSource", "acceptanceEvidenceReference",
  "acceptanceRecordedBy", "acceptanceVerification",
] as const;

export function freshQuoteVersionFields(
  existing: Rec["fields"],
  lines: InvoiceLine[],
): Rec["fields"] {
  const fields = { ...existing };
  for (const key of VERSION_EVIDENCE) delete fields[key];
  const maxDiscount = Math.max(0, ...lines.map((line) => Number(line.discountBp ?? 0)));
  if (maxDiscount > 1000) {
    fields.discountApproval = `Needs owner approval: ${(maxDiscount / 100).toFixed(1)}% exceeds the 10% ceiling.`;
  } else {
    delete fields.discountApproval;
  }
  return fields;
}

export function duplicateQuoteBody(quote: Rec): Record<string, unknown> {
  const body = { ...(quote.body as Record<string, unknown> ?? {}) };
  delete body.sends;
  return body;
}

export function fieldsForQuoteDuplicate(quote: Rec): Rec["fields"] {
  return freshQuoteVersionFields(quote.fields, readLines(quote));
}
