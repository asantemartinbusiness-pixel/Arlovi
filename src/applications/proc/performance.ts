import type { Rec } from "@/domain/types";
import { bodyOf, isPurchaseOrder, type BillBody, type PoBody, type ReceiptBody } from "./data";

/* ====================================================================== *
 * PROC supplier performance — measured from the purchase orders, goods
 * receipts and supplier invoices actually recorded, never from the figures a
 * supplier states about itself. Pure functions only.
 * ====================================================================== */

const DAY = 86_400_000;

/** A quality return recorded against one line of a goods receipt. */
export interface ReceiptReturn {
  id: string;
  lineId: string;
  description: string;
  productId?: string;
  quantity: number;
  reason: string;
  note: string;
  at: string;
  by: string;
}

export interface ReceiptBodyWithReturns extends ReceiptBody { returns?: ReceiptReturn[] }

export const RETURN_REASONS: { value: string; label: string }[] = [
  { value: "damaged", label: "Damaged in transit" },
  { value: "defective", label: "Defective or out of specification" },
  { value: "wrong_item", label: "Wrong item supplied" },
  { value: "over_delivery", label: "More than was ordered" },
];

export function returnReasonLabel(value: string): string {
  return RETURN_REASONS.find((item) => item.value === value)?.label ?? value;
}

export interface DeliveryRow {
  receiptId: string;
  receipt: string;
  orderId: string;
  order: string;
  receivedAt: string;
  promisedAt?: string;
  /** Whole days after the promised date; zero when on time or early. */
  lateDays: number;
  /** Null when the order has no promised date, so the receipt is not scored. */
  onTime: boolean | null;
}

export interface VarianceRow {
  billId: string;
  bill: string;
  order: string;
  description: string;
  quantity: number;
  orderedPriceMinor: number;
  billedPriceMinor: number;
  /** (billed − ordered) × billed quantity. Positive means the supplier charged more. */
  varianceMinor: number;
}

export interface SupplierPerformance {
  ordersPlaced: number;
  /** Net value of issued, received and closed orders (drafts and cancellations excluded). */
  committedNetMinor: number;
  deliveries: DeliveryRow[];
  /** Null when nothing has been received, so no rate is invented. */
  onTimePct: number | null;
  /** Issued orders past their promised date with goods still outstanding. */
  overdueOrders: { id: string; title: string; daysOverdue: number; outstanding: number }[];
  unitsReceived: number;
  unitsReturned: number;
  unitsDamaged: number;
  /** Share of received units neither returned nor flagged damaged. Null with no receipts. */
  qualityPct: number | null;
  returns: (ReceiptReturn & { receiptId: string; receipt: string })[];
  variances: VarianceRow[];
  priceVarianceMinor: number;
  /** Variance as a share of the ordered value of the billed lines. Null with no billed lines. */
  priceVariancePct: number | null;
  billedLines: number;
}

const COMMITTED = new Set(["approved", "sent", "received", "closed"]);
/** Receipt states in which goods have physically arrived (drafts and expected deliveries have not). */
const ARRIVED = new Set(["receiving", "exception", "complete"]);

function dayDiff(later: string, earlier: string): number {
  const a = new Date(later); const b = new Date(earlier);
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(a) - utc(b)) / DAY);
}

/** Units on a receipt line that arrived with this receipt (lines record the running total). */
function unitsOnReceipt(receipt: Rec, earlier: Rec[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of bodyOf<ReceiptBody>(receipt, {}).lines ?? []) {
    const before = earlier
      .flatMap((other) => bodyOf<ReceiptBody>(other, {}).lines ?? [])
      .filter((other) => other.lineId === line.lineId)
      .reduce((max, other) => Math.max(max, other.received), 0);
    result.set(line.lineId, Math.max(0, line.received - before));
  }
  return result;
}

export function supplierPerformance(
  supplierId: string,
  data: { purchaseOrders: Rec[]; receipts: Rec[]; bills: Rec[] },
  now: Date,
): SupplierPerformance {
  const orders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && String(order.fields.supplierId) === supplierId);
  const committed = orders.filter((order) => COMMITTED.has(order.status));
  const orderIds = new Set(orders.map((order) => order.id));
  const received = data.receipts
    .filter((receipt) => orderIds.has(String(receipt.fields.purchaseOrderId)) && ARRIVED.has(receipt.status) && receipt.at)
    .sort((a, b) => a.at!.localeCompare(b.at!));

  const deliveries: DeliveryRow[] = received.map((receipt) => {
    const order = orders.find((item) => item.id === String(receipt.fields.purchaseOrderId))!;
    const late = order.dueAt ? Math.max(0, dayDiff(receipt.at!, order.dueAt)) : 0;
    return { receiptId: receipt.id, receipt: receipt.title, orderId: order.id, order: order.title, receivedAt: receipt.at!, promisedAt: order.dueAt, lateDays: late, onTime: order.dueAt ? late === 0 : null };
  });

  const scored = deliveries.filter((row) => row.onTime !== null);
  const overdueOrders = committed
    .filter((order) => order.status !== "closed" && order.dueAt && order.dueAt < now.toISOString())
    .map((order) => ({
      id: order.id,
      title: order.title,
      daysOverdue: dayDiff(now.toISOString(), order.dueAt!),
      outstanding: (bodyOf<PoBody>(order, {}).lines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0),
    }))
    .filter((order) => order.outstanding > 0 && order.daysOverdue > 0);

  let unitsReceived = 0;
  let unitsDamaged = 0;
  let rejected = 0;
  const returns: SupplierPerformance["returns"] = [];
  for (const receipt of received) {
    const earlier = received.filter((other) => other.id !== receipt.id
      && String(other.fields.purchaseOrderId) === String(receipt.fields.purchaseOrderId) && other.at! < receipt.at!);
    const units = unitsOnReceipt(receipt, earlier);
    const body = bodyOf<ReceiptBodyWithReturns>(receipt, {});
    for (const line of body.lines ?? []) {
      const count = units.get(line.lineId) ?? 0;
      const damaged = line.condition && line.condition !== "good" ? count : 0;
      const returnedHere = (body.returns ?? []).filter((item) => item.lineId === line.lineId).reduce((sum, item) => sum + item.quantity, 0);
      unitsReceived += count;
      unitsDamaged += damaged;
      // A returned unit that was also flagged damaged on arrival is counted once per receipt line.
      rejected += Math.min(count, Math.max(damaged, returnedHere));
    }
    for (const item of body.returns ?? []) returns.push({ ...item, receiptId: receipt.id, receipt: receipt.title });
  }
  const unitsReturned = returns.reduce((sum, item) => sum + item.quantity, 0);

  const variances: VarianceRow[] = [];
  let billedLines = 0;
  let orderedValueMinor = 0;
  for (const bill of data.bills.filter((item) => String(item.fields.supplierId) === supplierId && item.status !== "cancelled")) {
    const order = orders.find((item) => item.id === String(bill.fields.purchaseOrderId));
    if (!order) continue;
    const orderLines = bodyOf<PoBody>(order, {}).lines ?? [];
    for (const line of bodyOf<BillBody>(bill, {}).lines ?? []) {
      const ordered = orderLines.find((item) => item.description === line.description);
      if (!ordered) continue;
      billedLines += 1;
      orderedValueMinor += ordered.unitPriceMinor * line.quantity;
      const varianceMinor = (line.unitPriceMinor - ordered.unitPriceMinor) * line.quantity;
      if (varianceMinor !== 0) {
        variances.push({ billId: bill.id, bill: bill.title, order: order.title, description: line.description, quantity: line.quantity, orderedPriceMinor: ordered.unitPriceMinor, billedPriceMinor: line.unitPriceMinor, varianceMinor });
      }
    }
  }
  const priceVarianceMinor = variances.reduce((sum, row) => sum + row.varianceMinor, 0);

  return {
    ordersPlaced: committed.length,
    committedNetMinor: committed.reduce((sum, order) => sum + (bodyOf<PoBody>(order, {}).lines ?? []).reduce((total, line) => total + line.quantity * line.unitPriceMinor, 0), 0),
    deliveries,
    onTimePct: scored.length ? Math.round((scored.filter((row) => row.onTime).length / scored.length) * 100) : null,
    overdueOrders,
    unitsReceived,
    unitsReturned,
    unitsDamaged,
    qualityPct: unitsReceived ? Math.round(((unitsReceived - rejected) / unitsReceived) * 1000) / 10 : null,
    returns,
    variances,
    priceVarianceMinor,
    priceVariancePct: billedLines && orderedValueMinor ? Math.round((priceVarianceMinor / orderedValueMinor) * 1000) / 10 : null,
    billedLines,
  };
}

/* ---------------- Inventory relationships from goods receipt ---------------- */

export interface SuppliedItem {
  productId: string;
  description: string;
  ordered: number;
  received: number;
  returned: number;
  /** Units on hand across every site, from posted stock movements. */
  onHand: number;
  lastReceivedAt?: string;
  orders: string[];
}

/** Catalogue items bought from a supplier, with what arrived and what is on hand now. */
export function suppliedItems(
  supplierId: string,
  data: { purchaseOrders: Rec[]; receipts: Rec[]; stockMoves: Rec[] },
): SuppliedItem[] {
  const orders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && String(order.fields.supplierId) === supplierId && order.status !== "cancelled" && order.status !== "draft");
  const items = new Map<string, SuppliedItem>();
  for (const order of orders) {
    for (const line of bodyOf<PoBody>(order, {}).lines ?? []) {
      if (!line.productId) continue;
      const item = items.get(line.productId) ?? { productId: line.productId, description: line.description, ordered: 0, received: 0, returned: 0, onHand: 0, orders: [] };
      item.ordered += line.quantity;
      item.received += line.receivedQuantity;
      if (!item.orders.includes(order.title)) item.orders.push(order.title);
      const receipts = data.receipts.filter((receipt) => String(receipt.fields.purchaseOrderId) === order.id && ARRIVED.has(receipt.status));
      for (const receipt of receipts) {
        const body = bodyOf<ReceiptBodyWithReturns>(receipt, {});
        if ((body.lines ?? []).some((row) => row.lineId === line.id) && receipt.at && (!item.lastReceivedAt || receipt.at > item.lastReceivedAt)) item.lastReceivedAt = receipt.at;
        item.returned += (body.returns ?? []).filter((row) => row.lineId === line.id).reduce((sum, row) => sum + row.quantity, 0);
      }
      items.set(line.productId, item);
    }
  }
  for (const item of items.values()) {
    item.onHand = data.stockMoves.filter((move) => String(move.fields.productId) === item.productId).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
  }
  return [...items.values()].sort((a, b) => a.description.localeCompare(b.description));
}

/** Units of a receipt line still available to return: arrived on this receipt, less earlier returns. */
export function returnableUnits(receipt: Rec, lineId: string, earlierReceipts: Rec[] = []): number {
  const units = unitsOnReceipt(receipt, earlierReceipts).get(lineId) ?? 0;
  const returned = (bodyOf<ReceiptBodyWithReturns>(receipt, {}).returns ?? []).filter((row) => row.lineId === lineId).reduce((sum, row) => sum + row.quantity, 0);
  return Math.max(0, units - returned);
}
