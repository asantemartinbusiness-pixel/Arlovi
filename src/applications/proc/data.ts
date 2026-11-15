import { useCollections } from "@/platform/workspace";
import { computeInvoice, type CustomerTaxStatus, type InvoiceTotals, type TaxCategory } from "@/platform/money";
import type { Rec } from "@/domain/types";

/* ---------------- Record body shapes used by PROC ---------------- */

export interface PoLine {
  id: string;
  description: string;
  productId?: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
  receivedQuantity: number;
}
export interface PoBody {
  lines?: PoLine[];
  revisions?: { version: number; at: string; change: string }[];
}

export interface ReceiptLine { lineId: string; description: string; expected: number; received: number; condition: string; bin: string }
export interface ReceiptBody { lines?: ReceiptLine[]; scans?: string[] }

export interface BillLine { id: string; description: string; quantity: number; unitPriceMinor: number; taxCategory: TaxCategory }
export interface BillBody { lines?: BillLine[] }

export interface SupplierBody {
  deliveries?: { at: string; promised: string; lateDays: number; accepted: boolean }[];
  notes?: string;
}

export interface ContractBody {
  clauses?: { id: string; title: string; detail: string; risk: string }[];
}

export function bodyOf<T>(record: Rec | undefined, fallback: T): T {
  return (record?.body as T | undefined) ?? fallback;
}

export function useProcData() {
  return useCollections(["purchaseOrders", "suppliers", "receipts", "bills", "contracts", "warehouses", "products", "stockMoves", "orders"]);
}

export const isRequisition = (record: Rec) => String(record.fields.kind ?? "po") === "requisition";
export const isPurchaseOrder = (record: Rec) => String(record.fields.kind ?? "po") === "po";

export function supplierStatusOf(supplier: Rec | undefined): CustomerTaxStatus {
  const value = supplier?.fields.taxStatus;
  const allowed: CustomerTaxStatus[] = ["domestic", "domestic_exempt", "eu_business", "export", "unknown"];
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as CustomerTaxStatus) : supplier ? "domestic" : "unknown";
}

/** Purchase order totals, resolved through the tax engine. */
export function poTotals(order: Rec | undefined, supplier: Rec | undefined, jurisdiction: string): InvoiceTotals {
  return computeInvoice({
    lines: (bodyOf<PoBody>(order, {}).lines ?? []).map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxCategory: line.taxCategory,
    })),
    jurisdiction,
    customerStatus: supplierStatusOf(supplier),
    date: order?.at ?? order?.createdAt ?? new Date().toISOString(),
  });
}

export function billTotals(bill: Rec | undefined, supplier: Rec | undefined, jurisdiction: string): InvoiceTotals {
  return computeInvoice({
    lines: (bodyOf<BillBody>(bill, {}).lines ?? []).map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxCategory: line.taxCategory,
    })),
    jurisdiction,
    customerStatus: supplierStatusOf(supplier),
    date: bill?.at ?? bill?.createdAt ?? new Date().toISOString(),
  });
}

/* ---------------- Three-way match ---------------- */

export interface MatchLine {
  description: string;
  ordered: number;
  received: number;
  billed: number;
  orderedPriceMinor: number;
  billedPriceMinor: number;
  quantityAgrees: boolean;
  priceAgrees: boolean;
}

export interface MatchResult {
  bill: Rec;
  order?: Rec;
  receipts: Rec[];
  lines: MatchLine[];
  state: "matched" | "quantity_mismatch" | "price_mismatch" | "no_purchase_order" | "no_receipt";
  blockedReason?: string;
}

export function threeWayMatch(bill: Rec, orders: Rec[], receipts: Rec[]): MatchResult {
  const order = orders.find((item) => item.id === String(bill.fields.purchaseOrderId ?? ""));
  const related = receipts.filter((receipt) => order && String(receipt.fields.purchaseOrderId) === order.id && receipt.status !== "expected");
  const billLines = bodyOf<BillBody>(bill, {}).lines ?? [];
  const orderLines = bodyOf<PoBody>(order, {}).lines ?? [];

  if (!order) {
    return { bill, order: undefined, receipts: [], lines: [], state: "no_purchase_order", blockedReason: "No purchase order is referenced, so there is nothing to match the invoice against." };
  }
  if (related.length === 0) {
    return { bill, order, receipts: [], lines: [], state: "no_receipt", blockedReason: "Nothing has been received against this order yet, so the invoice cannot be matched." };
  }

  const receivedFor = (description: string) =>
    related.flatMap((receipt) => bodyOf<ReceiptBody>(receipt, {}).lines ?? [])
      .filter((line) => line.description === description)
      .reduce((sum, line) => sum + line.received, 0);

  const lines: MatchLine[] = billLines.map((billLine) => {
    const orderLine = orderLines.find((line) => line.description === billLine.description);
    const received = receivedFor(billLine.description);
    return {
      description: billLine.description,
      ordered: orderLine?.quantity ?? 0,
      received,
      billed: billLine.quantity,
      orderedPriceMinor: orderLine?.unitPriceMinor ?? 0,
      billedPriceMinor: billLine.unitPriceMinor,
      quantityAgrees: billLine.quantity === received,
      priceAgrees: (orderLine?.unitPriceMinor ?? 0) === billLine.unitPriceMinor,
    };
  });

  const quantityMismatch = lines.some((line) => !line.quantityAgrees);
  const priceMismatch = lines.some((line) => !line.priceAgrees);
  const state: MatchResult["state"] = priceMismatch ? "price_mismatch" : quantityMismatch ? "quantity_mismatch" : "matched";
  const blockedReason = state === "price_mismatch"
    ? "A billed unit price differs from the purchase order, so payment is blocked until the supplier credits or the order is revised."
    : state === "quantity_mismatch"
      ? "A billed quantity differs from what was received, so payment is blocked until the goods arrive or a credit is issued."
      : undefined;
  return { bill, order, receipts: related, lines, state, blockedReason };
}

export const MATCH_LABEL: Record<MatchResult["state"], string> = {
  matched: "Matched to order and receipt",
  quantity_mismatch: "Quantity does not agree",
  price_mismatch: "Price does not agree",
  no_purchase_order: "No purchase order",
  no_receipt: "Nothing received yet",
};

export function matchTone(state: MatchResult["state"]): "success" | "warning" | "danger" {
  return state === "matched" ? "success" : state === "no_receipt" ? "warning" : "danger";
}

/* ---------------- Receipting ---------------- */

export function outstandingFor(order: Rec | undefined): { line: PoLine; outstanding: number }[] {
  return (bodyOf<PoBody>(order, {}).lines ?? [])
    .map((line) => ({ line, outstanding: line.quantity - line.receivedQuantity }))
    .filter((row) => row.outstanding > 0);
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["approved", "complete", "closed", "matched", "paid", "received"].includes(status)) return "success";
  if (["rejected", "cancelled", "exception", "unmatched", "blocked"].includes(status)) return "danger";
  if (["sent", "in_review"].includes(status)) return "info";
  if (["draft", "awaiting_approval", "expected", "receiving"].includes(status)) return "warning";
  return "neutral";
}

/** Approval limits applied before a commitment is allowed. */
export const APPROVAL_LIMITS: { role: string; limitMinor: number }[] = [
  { role: "Requester", limitMinor: 0 },
  { role: "Budget owner", limitMinor: 250_000 },
  { role: "Owner", limitMinor: 10_000_000 },
];

export function approverFor(totalMinor: number): string {
  const found = APPROVAL_LIMITS.find((limit) => totalMinor <= limit.limitMinor);
  return found?.role ?? "Owner";
}
