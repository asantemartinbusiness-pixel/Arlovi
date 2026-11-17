import { describe, expect, it } from "vitest";
import { dealAfterWin, dealWonBlocker, draftInvoiceFromDeal, nextDraftInvoiceNumber } from "@/applications/crm/handoff";
import type { Rec } from "@/domain/types";
import type { DocumentTotals } from "@/domain/fin-invoice";

const org = "org-northline";
function record(id: string, collection: string, fields: Rec["fields"] = {}, status = "active", company = org): Rec {
  return {
    id, collection, organizationId: company, status, title: id, summary: "", ownerName: "Maya",
    currency: "GBP", fields, tags: [], createdAt: "2026-11-14T09:00:00Z",
    updatedAt: "2026-11-14T09:00:00Z", revision: 3, createdBy: "Maya",
    updatedBy: "Maya", history: [], amountMinor: 30_000,
  };
}
const now = new Date("2026-11-14T09:30:00.000Z");
const deal = record("deal-1", "deals", { stage: "proposal", contactId: "contact-1" }, "proposal");
const contact = record("contact-1", "contacts");
const quote = record("quote-1", "quotes", { dealId: "deal-1", contactId: "contact-1" }, "accepted");
const invoice = record("invoice-1", "invoices", { dealId: "deal-1", contactId: "contact-1" }, "draft");
const input = { deal, quote, contact, invoices: [] as Rec[], createInvoice: true, now };
const totals = {
  grossMinor: 36_000, netMinor: 30_000, taxMinor: 6_000, hasUnknownRate: false,
  lines: [{ id: "l1", description: "Lamps", quantity: 1, unitPriceMinor: 30_000, taxCategory: "standard" }],
} as DocumentTotals;

describe("CRM to Finance handoff guards and records", () => {
  it("does not treat internal closure as customer acceptance", () => {
    expect(dealWonBlocker({ ...input, quote: { ...quote, status: "sent" } }))
      .toMatch(/not been accepted by the customer/);
    expect(dealWonBlocker({ ...input, quote: { ...quote, status: "approved" } }))
      .toMatch(/not been accepted/);
    expect(dealWonBlocker(input)).toBeUndefined();
  });

  it("blocks missing contact, foreign quotes and duplicate invoices", () => {
    expect(dealWonBlocker({ ...input, contact: undefined })).toMatch(/Link a customer/);
    expect(dealWonBlocker({ ...input, quote: { ...quote, organizationId: "org-harbor" } }))
      .toMatch(/company/);
    expect(dealWonBlocker({ ...input, invoices: [invoice] })).toMatch(/already has an invoice/);
  });

  it("does not allow a document-free win when invoice creation is turned off", () => {
    expect(dealWonBlocker({ ...input, quote: undefined, createInvoice: false }))
      .toMatch(/accepted quote or a linked invoice/);
    expect(dealWonBlocker({ ...input, createInvoice: false })).toBeUndefined();
  });

  it("retains the normal stage prerequisites and refuses a lost-to-won conversion", () => {
    const qualified = { ...deal, fields: { ...deal.fields, stage: "qualified" } };
    expect(dealWonBlocker({ ...input, deal: qualified })).toMatch(/confirmed budget/);
    const lost = { ...deal, fields: { ...deal.fields, stage: "lost" } };
    expect(dealWonBlocker({ ...input, deal: lost })).toMatch(/closed-lost/);
  });

  it("generates a linked Finance draft without posting a journal or changing the quote", () => {
    const generated = draftInvoiceFromDeal({
      deal, quote, contact, totals, now, actor: "Maya", currency: "GBP", number: "INV-1099",
    });
    expect(generated.collection).toBe("invoices");
    expect(generated.status).toBe("draft");
    expect(generated.fields.dealId).toBe(deal.id);
    expect(generated.fields.quoteId).toBe(quote.id);
    expect(generated.fields.contactId).toBe(contact.id);
    expect(generated.fields.journalId).toBeUndefined();
    expect(generated.amountMinor).toBe(totals.grossMinor);
    expect(quote.status).toBe("accepted");

    const won = dealAfterWin(deal, "Maya", now, generated.id, quote.id);
    expect(won.fields.invoiceId).toBe(generated.id);
    expect(won.fields.quoteId).toBe(quote.id);
    expect(won.status).toBe("won");
    expect(won.revision).toBe(deal.revision + 1);
    expect(won.history).toHaveLength(deal.history.length + 1);
    expect(deal.status).toBe("proposal");
  });

  it("chooses next displayed invoice number from exact invoice codes", () => {
    expect(nextDraftInvoiceNumber([])).toBe("INV-1001");
    const invoices = [
      record("id-a", "invoices", { number: "INV-1099" }),
      record("id-b", "invoices", { number: "INV-987" }),
      record("id-c", "invoices", { number: "CREDIT-9999" }),
    ];
    expect(nextDraftInvoiceNumber(invoices)).toBe("INV-1100");
  });
});
