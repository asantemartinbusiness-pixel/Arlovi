import type { Rec } from "@/domain/types";
import { bodyOf, isPurchaseOrder, threeWayMatch, type MatchResult, type PoBody, type PoLine } from "./data";

/* ====================================================================== *
 * PROC purchase lifecycle — supplier quotes recorded against a
 * requisition, their comparison and award, and the trail from request to
 * a matched supplier invoice. Pure functions only.
 * ====================================================================== */

export interface SupplierQuote {
  id: string;
  supplierId: string;
  /** Unit price per requisition line id, in minor units. A missing line was not quoted. */
  prices: Record<string, number>;
  leadTimeDays: number;
  /** yyyy-mm-dd: the last day the price holds. */
  validUntil: string;
  note: string;
  recordedBy: string;
  at: string;
}

export interface QuoteBody extends PoBody { quotes?: SupplierQuote[] }

export interface QuoteRow {
  quote: SupplierQuote;
  netMinor: number;
  missing: string[];
  complete: boolean;
  expired: boolean;
  lowest: boolean;
  fastest: boolean;
  /** Difference from the lowest complete, valid quote. */
  overLowestMinor: number;
}

export function quoteNet(lines: PoLine[], quote: SupplierQuote): { netMinor: number; missing: string[] } {
  let netMinor = 0;
  const missing: string[] = [];
  for (const line of lines) {
    const price = quote.prices[line.id];
    if (price === undefined || !Number.isFinite(price) || price < 0) missing.push(line.description || line.id);
    else netMinor += Math.round(price * line.quantity);
  }
  return { netMinor, missing };
}

/** Quotes ranked for a decision: complete and valid quotes first, cheapest first. */
export function compareQuotes(lines: PoLine[], quotes: SupplierQuote[], today: string): QuoteRow[] {
  const rows = quotes.map((quote) => {
    const { netMinor, missing } = quoteNet(lines, quote);
    return { quote, netMinor, missing, complete: missing.length === 0, expired: Boolean(quote.validUntil) && quote.validUntil < today, lowest: false, fastest: false, overLowestMinor: 0 };
  });
  const eligible = rows.filter((row) => row.complete && !row.expired);
  if (eligible.length) {
    const low = Math.min(...eligible.map((row) => row.netMinor));
    const fast = Math.min(...eligible.map((row) => row.quote.leadTimeDays));
    for (const row of rows) {
      row.overLowestMinor = row.complete ? row.netMinor - low : 0;
      if (row.complete && !row.expired) {
        row.lowest = row.netMinor === low;
        row.fastest = row.quote.leadTimeDays === fast;
      }
    }
  }
  return rows.sort((a, b) => Number(b.complete && !b.expired) - Number(a.complete && !a.expired) || a.netMinor - b.netMinor || a.quote.leadTimeDays - b.quote.leadTimeDays);
}

export function quoteProblems(input: { supplierId: string; prices: Record<string, string>; lines: PoLine[]; leadTimeDays: string; validUntil: string; today: string; existing: SupplierQuote[] }): string[] {
  const problems: string[] = [];
  if (!input.supplierId) problems.push("Choose the supplier who quoted.");
  if (input.existing.some((quote) => quote.supplierId === input.supplierId)) problems.push("This supplier already has a quote here; remove it first to replace it.");
  const priced = input.lines.filter((line) => (input.prices[line.id] ?? "").trim() !== "");
  if (priced.length === 0) problems.push("Enter a unit price for at least one line.");
  if (priced.some((line) => !(Number(input.prices[line.id]) >= 0))) problems.push("Prices must be numbers of zero or more.");
  const lead = Number(input.leadTimeDays);
  if (!Number.isInteger(lead) || lead < 0 || lead > 365) problems.push("Lead time must be whole days from 0 to 365.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) problems.push("Give the date the price is valid until.");
  else if (input.validUntil < input.today) problems.push("That quote has already expired.");
  return problems;
}

/** Requisition lines at the awarded supplier's quoted prices. */
export function awardedLines(lines: PoLine[], quote: SupplierQuote): PoLine[] {
  return lines.map((line) => ({ ...line, unitPriceMinor: quote.prices[line.id] ?? line.unitPriceMinor }));
}

/**
 * Why a quote cannot be awarded, or undefined. An approved requisition keeps
 * its approval only if the award does not cost more than was approved; a
 * converted one is already an order.
 */
export function awardBlock(requisition: Rec, row: QuoteRow, awardedGrossMinor: number): string | undefined {
  if (requisition.status === "converted") return "This requisition is already a purchase order. Revise the order instead.";
  if (requisition.status === "rejected") return "A rejected requisition cannot be awarded.";
  if (!row.complete) return `The quote does not price: ${row.missing.join(", ")}.`;
  if (row.expired) return "The quote has expired. Ask the supplier to confirm the price again.";
  if (requisition.status === "approved" && awardedGrossMinor > (requisition.amountMinor ?? 0)) {
    return "This quote costs more than the approved amount, so it needs a fresh approval. Raise a new requisition at the quoted price.";
  }
  return undefined;
}

/* ---------------- Trail from request to payment ---------------- */

export type StepState = "done" | "partial" | "blocked" | "pending" | "skipped";

export interface TrailStep { key: string; label: string; state: StepState; detail: string; recordIds: string[] }

export function purchaseTrail(order: Rec, all: Rec[], receipts: Rec[], bills: Rec[]): TrailStep[] {
  const requisition = all.find((item) => item.id === String(order.fields.requisitionId ?? ""));
  const quotes = bodyOf<QuoteBody>(requisition, {}).quotes ?? [];
  const lines = bodyOf<PoBody>(order, {}).lines ?? [];
  const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
  const received = lines.reduce((sum, line) => sum + Math.min(line.receivedQuantity, line.quantity), 0);
  const orderReceipts = receipts.filter((receipt) => String(receipt.fields.purchaseOrderId) === order.id && receipt.status !== "expected");
  const orderBills = bills.filter((bill) => String(bill.fields.purchaseOrderId) === order.id);
  const matches: MatchResult[] = orderBills.map((bill) => threeWayMatch(bill, isPurchaseOrder(order) ? [order] : [], receipts));
  const issued = ["sent", "received", "closed"].includes(order.status);

  return [
    {
      key: "request", label: "Requested",
      state: requisition ? (requisition.fields.approver ? "done" : "pending") : "skipped",
      detail: requisition ? `${requisition.title}${requisition.fields.approver ? `, approved by ${String(requisition.fields.approver)}` : ", awaiting approval"}` : "Raised directly, without a requisition.",
      recordIds: requisition ? [requisition.id] : [],
    },
    {
      key: "quotes", label: "Quotes compared",
      state: !requisition ? "skipped" : quotes.length === 0 ? "skipped" : requisition.fields.awardedQuoteId ? "done" : "pending",
      detail: !requisition || quotes.length === 0 ? "No supplier quotes recorded." : `${quotes.length} quote${quotes.length === 1 ? "" : "s"}${requisition.fields.awardedQuoteId ? ", one awarded" : ", none awarded"}.`,
      recordIds: [],
    },
    {
      key: "order", label: "Ordered",
      state: issued ? "done" : order.status === "cancelled" ? "blocked" : "pending",
      detail: `${order.title} v${String(order.fields.version ?? 1)} · ${order.status.replace(/_/g, " ")}${order.fields.approver ? ` · approved by ${String(order.fields.approver)}` : ""}`,
      recordIds: [order.id],
    },
    {
      key: "receive", label: "Goods received",
      state: ordered > 0 && received >= ordered ? "done" : received > 0 ? "partial" : "pending",
      detail: ordered ? `${received} of ${ordered} units across ${orderReceipts.length} receipt${orderReceipts.length === 1 ? "" : "s"}.` : "The order has no lines.",
      recordIds: orderReceipts.map((receipt) => receipt.id),
    },
    {
      key: "match", label: "Invoice matched",
      state: matches.length === 0 ? "pending" : matches.every((match) => match.state === "matched") ? "done" : matches.some((match) => match.state === "no_receipt") && matches.every((match) => ["matched", "no_receipt"].includes(match.state)) ? "partial" : "blocked",
      detail: matches.length === 0 ? "No supplier invoice recorded against this order yet." : matches.map((match) => `${match.bill.title}: ${match.state.replace(/_/g, " ")}`).join("; "),
      recordIds: orderBills.map((bill) => bill.id),
    },
  ];
}
