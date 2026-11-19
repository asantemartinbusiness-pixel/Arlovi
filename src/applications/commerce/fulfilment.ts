import type { Rec } from "@/domain/types";
import type { OrderBody, OrderLine } from "./data";

/* ====================================================================== *
 * COMMERCE order operations — shipments with pick / pack / ship states and
 * partial fulfilment, return eligibility per line, refund records and the
 * running stock history. Pure functions only; nothing here moves money or
 * talks to a carrier.
 * ====================================================================== */

export type ShipmentState = "picking" | "packed" | "shipped" | "delivered";
export const SHIPMENT_STATES: ShipmentState[] = ["picking", "packed", "shipped", "delivered"];
export const SHIPMENT_LABEL: Record<ShipmentState, string> = {
  picking: "Picking",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
};

export interface ShipmentLine { lineId: string; quantity: number }
export interface Shipment {
  id: string;
  number: string;
  state: ShipmentState;
  lines: ShipmentLine[];
  carrier: string;
  /** Carrier tracking typed in by a person, or a local reference. Never fetched. */
  tracking: string;
  createdAt: string;
  createdBy: string;
  packedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface FulfilmentBody extends OrderBody { shipments?: Shipment[] }

export function shipmentsOf(order: Rec | undefined): Shipment[] {
  return ((order?.body as FulfilmentBody | undefined)?.shipments ?? []).filter(Boolean);
}

const SHIPPED: ShipmentState[] = ["shipped", "delivered"];

export interface LineProgress {
  line: OrderLine;
  ordered: number;
  /** Units placed on any shipment, whatever its state. */
  allocated: number;
  shipped: number;
  delivered: number;
  /** Units not yet on a shipment. */
  remaining: number;
}

export function lineProgress(order: Rec | undefined): LineProgress[] {
  const lines = (order?.body as OrderBody | undefined)?.lines ?? [];
  const shipments = shipmentsOf(order);
  return lines.map((line) => {
    const on = (states?: ShipmentState[]) => shipments
      .filter((shipment) => !states || states.includes(shipment.state))
      .flatMap((shipment) => shipment.lines)
      .filter((item) => item.lineId === line.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    const allocated = on();
    return { line, ordered: line.quantity, allocated, shipped: on(SHIPPED), delivered: on(["delivered"]), remaining: Math.max(0, line.quantity - allocated) };
  });
}

/** Units of a line that have physically left (shipped or delivered). */
export function shippedQuantity(order: Rec | undefined, lineId: string): number {
  return lineProgress(order).find((row) => row.line.id === lineId)?.shipped ?? 0;
}

export type OrderFulfilment = "unfulfilled" | "picking" | "packed" | "partially_shipped" | "shipped" | "delivered";

/**
 * The order's physical state, derived from its shipments. An order with no
 * shipments keeps whatever state was recorded on it.
 */
export function derivedFulfilment(order: Rec): { fulfilment: string; status: string } {
  const shipments = shipmentsOf(order);
  if (shipments.length === 0) return { fulfilment: String(order.fields.fulfilment ?? "unfulfilled"), status: order.status };
  const progress = lineProgress(order);
  const ordered = progress.reduce((sum, row) => sum + row.ordered, 0);
  const shipped = progress.reduce((sum, row) => sum + row.shipped, 0);
  const delivered = progress.reduce((sum, row) => sum + row.delivered, 0);
  if (ordered > 0 && delivered >= ordered) return { fulfilment: "delivered", status: "delivered" };
  if (ordered > 0 && shipped >= ordered) return { fulfilment: "shipped", status: "in_transit" };
  // Some units have left but a balance remains: the order is still open for fulfilment.
  const openStatus = order.status === "awaiting_payment" ? "awaiting_payment" : "unfulfilled";
  if (shipped > 0) return { fulfilment: "partially_shipped", status: openStatus };
  if (shipments.some((shipment) => shipment.state === "packed")) return { fulfilment: "packed", status: openStatus };
  return { fulfilment: "picking", status: openStatus };
}

/** Reasons a requested shipment cannot be created. */
export function shipmentProblems(order: Rec, request: Record<string, number>, input: { paid: boolean }): string[] {
  const problems: string[] = [];
  if (!input.paid) problems.push("Nothing ships before payment is recorded on the order.");
  if (["cancelled", "delivered"].includes(order.status)) problems.push(`The order is ${order.status}.`);
  const progress = lineProgress(order);
  let total = 0;
  for (const [lineId, quantity] of Object.entries(request)) {
    if (!quantity) continue;
    const row = progress.find((item) => item.line.id === lineId);
    if (!row) { problems.push("A line on this shipment is not on the order."); continue; }
    if (!Number.isInteger(quantity) || quantity < 0) problems.push(`${row.line.description}: enter a whole number.`);
    else if (quantity > row.remaining) problems.push(`${row.line.description}: only ${row.remaining} left to fulfil.`);
    total += Math.max(0, quantity);
  }
  if (total === 0) problems.push("Put at least one unit on the shipment.");
  return problems;
}

/**
 * A fresh id for an entry kept inside a record body (a shipment, a refund) or
 * a short stock reference. Never derived from the workspace clock, which only
 * ticks once a minute, and never one already in `taken`, so two entries made
 * in the same minute cannot share an id and overwrite each other.
 */
export function freshEntryId(prefix: string, taken: Iterable<string> = [], length = 12, random: () => string = () => crypto.randomUUID()): string {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = `${prefix}${random().replace(/-/g, "").slice(0, length)}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free ${prefix} id.`);
}

export function nextShipmentNumber(order: Rec): string {
  return `${order.title}-S${shipmentsOf(order).length + 1}`;
}

/** The state a shipment moves to next, or undefined once delivered. */
export function nextShipmentState(state: ShipmentState): ShipmentState | undefined {
  const index = SHIPMENT_STATES.indexOf(state);
  return index >= 0 && index < SHIPMENT_STATES.length - 1 ? SHIPMENT_STATES[index + 1] : undefined;
}

/* ---------------- Returns and refunds ---------------- */

export interface RefundRecord {
  id: string;
  amountMinor: number;
  method: RefundMethod;
  reference: string;
  note: string;
  at: string;
  by: string;
}
export type RefundMethod = "credit_note" | "bank_transfer" | "store_credit" | "card_terminal";
export const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: "credit_note", label: "Credit note in the ledger" },
  { value: "bank_transfer", label: "Bank transfer sent by the studio" },
  { value: "card_terminal", label: "Card terminal refund made in person" },
  { value: "store_credit", label: "Store credit" },
];

export function refundsOf(item: Rec | undefined): RefundRecord[] {
  return ((item?.body as { refunds?: RefundRecord[] } | undefined)?.refunds ?? []).filter(Boolean);
}

export function refundedMinor(item: Rec | undefined): number {
  return refundsOf(item).reduce((sum, refund) => sum + refund.amountMinor, 0);
}

export function refundableMinor(item: Rec | undefined): number {
  return Math.max(0, (item?.amountMinor ?? 0) - refundedMinor(item));
}

export function refundProblems(item: Rec, amountMinor: number, method: string, reference: string): string[] {
  const problems: string[] = [];
  if (item.tags.includes("disputed")) problems.push("A disputed return is escalated to a person with authority, not refunded here.");
  // A return still in review has not been approved; the refund form never approves it.
  if (!["approved", "completed"].includes(item.status)) problems.push("Approve the return before recording a refund.");
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) problems.push("Enter the amount refunded.");
  else if (amountMinor > refundableMinor(item)) problems.push("That is more than remains to refund on this return.");
  if (!method) problems.push("Choose how the refund was made.");
  if (method !== "store_credit" && reference.trim().length < 3) problems.push("Give the reference of the refund made outside Arlovi.");
  return problems;
}

/** Units of an order line still returnable: shipped, less what earlier returns already cover. */
export function returnableQuantity(order: Rec, lineId: string, returns: Rec[]): number {
  const line = ((order.body as OrderBody | undefined)?.lines ?? []).find((item) => item.id === lineId);
  if (!line) return 0;
  // Orders fulfilled before shipments existed count their whole line as shipped once handed over.
  const shipped = shipmentsOf(order).length
    ? shippedQuantity(order, lineId)
    : ["in_transit", "shipped", "delivered", "exception"].includes(order.status) ? line.quantity : 0;
  const already = returns
    .filter((item) => String(item.fields.orderId) === order.id && item.status !== "rejected"
      && (String(item.fields.lineId ?? "") === lineId || (!item.fields.lineId && line.productId && String(item.fields.productId) === line.productId)))
    .reduce((sum, item) => sum + Number(item.fields.quantity ?? 1), 0);
  return Math.max(0, shipped - already);
}

/* ---------------- Stock history ---------------- */

export interface StockHistoryRow { move: Rec; quantity: number; balance: number }

/** Movements for a product (optionally one location) oldest first, each with the balance after it. */
export function stockHistory(moves: Rec[], productId: string, warehouseId?: string): StockHistoryRow[] {
  let balance = 0;
  return moves
    .filter((move) => String(move.fields.productId) === productId && move.status !== "void" && (!warehouseId || String(move.fields.warehouseId) === warehouseId))
    .sort((a, b) => (a.at ?? a.createdAt).localeCompare(b.at ?? b.createdAt) || a.id.localeCompare(b.id))
    .map((move) => {
      const quantity = Number(move.fields.quantity ?? 0);
      balance += quantity;
      return { move, quantity, balance };
    });
}

export const ADJUSTMENT_REASONS: { value: string; label: string; needsNote: boolean }[] = [
  { value: "count", label: "Stock count correction", needsNote: false },
  { value: "damage", label: "Damaged in the studio", needsNote: true },
  { value: "shrinkage", label: "Lost or unaccounted for", needsNote: true },
  { value: "found", label: "Found during a count", needsNote: false },
  { value: "sample", label: "Taken for samples or display", needsNote: true },
  { value: "correction", label: "Correcting an earlier entry", needsNote: true },
];

export function adjustmentProblems(input: { productId: string; delta: number; onHand: number; reason: string; note: string }): string[] {
  const problems: string[] = [];
  if (!input.productId) problems.push("Choose a product.");
  if (!Number.isInteger(input.delta) || input.delta === 0) problems.push("Enter a whole, non-zero adjustment.");
  else if (input.onHand + input.delta < 0) problems.push("That would take the location below zero.");
  const reason = ADJUSTMENT_REASONS.find((item) => item.value === input.reason);
  if (!reason) problems.push("Choose a reason.");
  else if (reason.needsNote && input.note.trim().length < 3) problems.push("Say what happened; this reason needs a note.");
  return problems;
}

/**
 * Where an order's money stands, kept as three separate facts: what was
 * proposed on the order, what the studio recorded as refunded against its
 * returns (with the processor-side reference they typed), and what is left.
 * Arlovi never moves money, so "recorded" is the strongest state there is.
 */
export interface OrderRefundSummary {
  returns: Rec[];
  proposedMinor: number;
  proposedBy: string;
  recorded: (RefundRecord & { returnTitle: string })[];
  recordedMinor: number;
}

export function orderRefundSummary(order: Rec, returns: Rec[]): OrderRefundSummary {
  const mine = returns.filter((item) => String(item.fields.orderId) === order.id && item.status !== "rejected");
  const recorded = mine.flatMap((item) => refundsOf(item).map((refund) => ({ ...refund, returnTitle: item.title })));
  return {
    returns: mine,
    proposedMinor: Number(order.fields.refundProposedMinor ?? 0),
    proposedBy: String(order.fields.refundProposedBy ?? ""),
    recorded,
    recordedMinor: recorded.reduce((sum, refund) => sum + refund.amountMinor, 0),
  };
}

/** Plain label and tone for a return's refund state; legacy or blank values read as not refunded. */
export function refundStateLabel(state: unknown): { label: string; tone: "success" | "warning" | "neutral" } {
  switch (String(state ?? "")) {
    case "refund_recorded": return { label: "Refund recorded", tone: "success" };
    case "credit_note_local": return { label: "Credit note recorded", tone: "success" };
    case "partly_refunded": return { label: "Partly refunded", tone: "warning" };
    default: return { label: "Not refunded", tone: "neutral" };
  }
}
