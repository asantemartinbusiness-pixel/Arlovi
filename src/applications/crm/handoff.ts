import { STAGES, stageGuard, stageOf } from "@/domain/crm-pipeline";
import { touch, type Rec } from "@/domain/types";
import { newRecord } from "@/platform/repo";
import { statusFor, writeLines, type DocumentTotals } from "@/domain/fin-invoice";

/** Guard for the human-confirmed CRM -> Finance handoff.
 * An internal deal close must never forge a customer's quote acceptance.
 */
export function dealWonBlocker({
  deal, quote, contact, invoices, createInvoice, now,
}: {
  deal: Rec;
  quote?: Rec;
  contact?: Rec;
  invoices: Rec[];
  createInvoice: boolean;
  now: Date;
}): string | undefined {
  if (stageOf(deal).kind === "won") return "This deal is already closed won.";
  if (stageOf(deal).kind === "lost") return "A closed-lost deal cannot be closed won.";
  if (!contact || contact.organizationId !== deal.organizationId) {
    return "Link a customer from the same company before closing the deal.";
  }
  if (quote) {
    if (quote.organizationId !== deal.organizationId || String(quote.fields.dealId ?? quote.parentId ?? "") !== deal.id) {
      return "The quote must belong to this deal and company.";
    }
    if (quote.status !== "accepted") {
      return "The quote has not been accepted by the customer. Record real acceptance first; closing the deal does not accept a quote.";
    }
    if (String(quote.fields.contactId ?? "") !== contact.id) {
      return "The accepted quote must be addressed to the linked customer.";
    }
  }
  if (invoices.some((invoice) => invoice.organizationId !== deal.organizationId
    || String(invoice.fields.dealId ?? "") !== deal.id && invoice.id !== String(deal.fields.invoiceId ?? ""))) {
    return "The linked invoice does not match this company and deal.";
  }
  if (createInvoice && invoices.length) {
    return "This deal already has an invoice. Open the existing invoice instead of drafting another.";
  }
  if (!createInvoice && !invoices.length && !quote) {
    return "A won deal needs an accepted quote or a linked invoice. Choose to create a draft invoice.";
  }
  const withEvidence: Rec = {
    ...deal,
    fields: {
      ...deal.fields,
      ...(quote ? { quoteId: quote.id } : {}),
      ...(invoices.length ? { invoiceId: invoices[0].id } : {}),
      ...(createInvoice ? { invoiceId: "draft-created-on-close" } : {}),
    },
  };
  const wonStage = STAGES.find((stage) => stage.kind === "won")!;
  const blocked = stageGuard(withEvidence, wonStage);
  if (blocked) return blocked;
  if (!Number.isFinite(deal.amountMinor ?? 0) || Number(deal.amountMinor ?? 0) < 0) {
    return "The deal amount must be a valid non-negative value.";
  }
  if (!Number.isFinite(now.getTime())) return "The effective date is not valid.";
  return undefined;
}

export function nextDraftInvoiceNumber(invoices: Rec[]): string {
  const numbers = invoices.map((invoice) =>
    Number(/^(?:INV-)(\d+)$/.exec(String(invoice.fields.number ?? invoice.title))?.[1] ?? 0))
    .filter(Number.isFinite);
  return `INV-${Math.max(1000, ...numbers) + 1}`;
}

export function draftInvoiceFromDeal({
  deal, quote, contact, totals, now, actor, currency, number,
}: {
  deal: Rec;
  quote?: Rec;
  contact: Rec;
  totals: DocumentTotals;
  now: Date;
  actor: string;
  currency: string;
  number: string;
}): Rec {
  return newRecord({
    organizationId: deal.organizationId,
    collection: "invoices",
    currency,
    title: number,
    status: "draft",
    summary: `Drafted from the won deal ${deal.title}. Not posted to Finance.`,
    amountMinor: totals.grossMinor,
    at: now.toISOString(),
    dueAt: new Date(now.getTime() + 21 * 86_400_000).toISOString(),
    parentId: contact.id,
    tags: ["draft", "from-deal"],
    fields: {
      number,
      contactId: contact.id,
      dealId: deal.id,
      quoteId: quote?.id ?? "",
      netMinor: totals.netMinor,
      taxMinor: totals.taxMinor,
      customerTaxStatus: statusFor(quote, contact),
      taxUnresolved: totals.hasUnknownRate,
    },
    body: writeLines(totals.lines),
  }, { actor, now: now.toISOString() });
}

export function dealAfterWin(deal: Rec, actor: string, now: Date, invoiceId?: string, quoteId?: string): Rec {
  return touch(deal, actor, now.toISOString(), {
    status: "won",
    fields: {
      ...deal.fields,
      stage: "won",
      probability: 100,
      wonAt: now.toISOString(),
      wonBy: actor,
      ...(quoteId ? { quoteId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
    },
  });
}
