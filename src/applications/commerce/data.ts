import { useCollections } from "@/platform/workspace";
import { computeInvoice, type CustomerTaxStatus, type InvoiceLine, type InvoiceTotals, type TaxCategory } from "@/platform/money";
import type { Rec } from "@/domain/types";

/* ---------------- Record body shapes used by COMMERCE ---------------- */

export interface Variant { id: string; name: string; sku: string; priceDeltaMinor: number }
export interface ProductOption { name: string; values: string[] }
export interface MediaItem { id: string; label: string; kind: string }
export interface ProductBody {
  description?: string;
  variants?: Variant[];
  options?: ProductOption[];
  media?: MediaItem[];
}

export interface OrderLine {
  id: string;
  description: string;
  productId?: string;
  variantId?: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
  discountBp?: number;
}
export interface TimelineEntry { at: string; label: string; detail: string }
export interface OrderBody {
  lines?: OrderLine[];
  shipTo?: { name?: string; city?: string; line1?: string; postcode?: string; email?: string };
  timeline?: TimelineEntry[];
}

export function bodyOf<T>(record: Rec | undefined, fallback: T): T {
  return (record?.body as T | undefined) ?? fallback;
}

export function useCommerceData() {
  return useCollections(["products", "orders", "returns", "promotions", "stockMoves", "warehouses", "contacts", "invoices", "sites"]);
}

/* ---------------- Stock ---------------- */

export interface StockRow {
  product: Rec;
  warehouseId: string;
  onHand: number;
  reserved: number;
  inbound: number;
  available: number;
}

export function onHandFor(moves: Rec[], productId: string, warehouseId?: string): number {
  return moves
    .filter((move) => String(move.fields.productId) === productId && move.status !== "void" && (!warehouseId || String(move.fields.warehouseId) === warehouseId))
    .reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
}

/** Units committed to orders that have not shipped yet. */
export function reservedFor(orders: Rec[], productId: string, warehouseId?: string): number {
  return orders
    .filter((order) => ["awaiting_payment", "unfulfilled", "exception"].includes(order.status) && (!warehouseId || String(order.fields.warehouseId) === warehouseId))
    .flatMap((order) => bodyOf<OrderBody>(order, {}).lines ?? [])
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

export function inboundFor(receipts: Rec[], productId: string): number {
  void productId;
  void receipts;
  return 0;
}

export function stockRows(products: Rec[], moves: Rec[], orders: Rec[], warehouses: Rec[]): StockRow[] {
  const rows: StockRow[] = [];
  for (const product of products) {
    const ids = [...new Set(moves.filter((move) => String(move.fields.productId) === product.id).map((move) => String(move.fields.warehouseId)))];
    const list = ids.length ? ids : [warehouses[0]?.id ?? ""];
    for (const warehouseId of list) {
      const onHand = onHandFor(moves, product.id, warehouseId);
      const reserved = ids.length <= 1 ? reservedFor(orders, product.id) : reservedFor(orders, product.id, warehouseId);
      rows.push({ product, warehouseId, onHand, reserved, inbound: 0, available: onHand - reserved });
    }
  }
  return rows;
}

export function availableFor(product: Rec, moves: Rec[], orders: Rec[]): number {
  return onHandFor(moves, product.id) - reservedFor(orders, product.id);
}

/* ---------------- Pricing ---------------- */

export function taxCategoryOfProduct(product: Rec | undefined): TaxCategory {
  const raw = product?.fields.taxCategory ?? product?.fields.vat;
  const allowed: TaxCategory[] = ["standard", "reduced", "zero_rated", "exempt", "outside_scope", "reverse_charge"];
  return typeof raw === "string" && (allowed as string[]).includes(raw) ? (raw as TaxCategory) : "standard";
}

export function customerStatusOfContact(contact: Rec | undefined): CustomerTaxStatus {
  const value = contact?.fields.taxStatus;
  const allowed: CustomerTaxStatus[] = ["domestic", "domestic_exempt", "eu_business", "export", "unknown"];
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as CustomerTaxStatus) : contact ? "domestic" : "unknown";
}

/** The tax status an order was resolved under: its contact's, or the one recorded at checkout. */
export function orderTaxStatus(order: Rec | undefined, contact: Rec | undefined): CustomerTaxStatus {
  if (contact) return customerStatusOfContact(contact);
  const value = order?.fields.taxStatus;
  const allowed: CustomerTaxStatus[] = ["domestic", "domestic_exempt", "eu_business", "export", "unknown"];
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as CustomerTaxStatus) : "unknown";
}

/**
 * The amount due on an order: net, resolved tax and delivery. One computation
 * for the storefront basket, the held order and the order record, so a charge
 * the totals list is always part of the figure due.
 */
export function withDelivery(totals: InvoiceTotals, shippingMinor: number): InvoiceTotals {
  return { ...totals, grossMinor: totals.grossMinor + shippingMinor };
}

export function linesOf(order: Rec | undefined): InvoiceLine[] {
  return (bodyOf<OrderBody>(order, {}).lines ?? []).map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxCategory: line.taxCategory,
    discountBp: line.discountBp,
  }));
}

/** Order totals resolved through the tax engine, never a flat rate. */
export function orderTotals(order: Rec | undefined, contact: Rec | undefined, jurisdiction: string): InvoiceTotals {
  return computeInvoice({
    lines: linesOf(order),
    jurisdiction,
    customerStatus: orderTaxStatus(order, contact),
    date: order?.at ?? order?.createdAt ?? new Date().toISOString(),
  });
}

export function marginOf(product: Rec, priceMinor?: number): { costMinor: number; marginMinor: number; marginBp: number } {
  const price = priceMinor ?? (product.amountMinor ?? 0);
  const cost = Number(product.fields.unitCostMinor ?? 0);
  const margin = price - cost;
  return { costMinor: cost, marginMinor: margin, marginBp: price === 0 ? 0 : Math.round((margin / price) * 10_000) };
}

/* ---------------- Order state vocabulary ---------------- */

export const FULFILMENT_STAGES = ["unfulfilled", "picking", "packed", "shipped", "delivered", "exception", "cancelled"] as const;

export const PAYMENT_LABEL: Record<string, string> = {
  not_connected: "Awaiting payment — no processor",
  paid_local: "Paid, recorded locally",
  void: "Voided",
  disputed: "Disputed",
  refunded_local: "Refunded in the ledger",
};

export function paymentTone(payment: string): "success" | "warning" | "danger" | "neutral" {
  if (payment === "paid_local") return "success";
  if (payment === "disputed") return "danger";
  if (payment === "void") return "neutral";
  return "warning";
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["delivered", "paid", "completed", "approved", "matched"].includes(status)) return "success";
  if (["exception", "disputed", "cancelled"].includes(status)) return "danger";
  if (["in_transit", "shipped", "in_review"].includes(status)) return "info";
  if (["awaiting_payment", "unfulfilled", "requested", "draft", "picking"].includes(status)) return "warning";
  return "neutral";
}
