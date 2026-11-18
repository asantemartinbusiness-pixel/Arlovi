import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { bookingLanes, seatsInUse } from "@/applications/book/availability";
import { supplierPerformance, suppliedItems, returnableUnits } from "@/applications/proc/performance";
import {
  adjustmentProblems, derivedFulfilment, lineProgress, nextShipmentState, refundableMinor, refundProblems,
  returnableQuantity, shipmentProblems, stockHistory, type Shipment,
} from "@/applications/commerce/fulfilment";
import { reservedFor } from "@/applications/commerce/data";
import { reorderPage } from "@/applications/portal/config";

function rec(id: string, collection: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "northline", collection, status: "draft", fields, title: id, summary: "", ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", revision: 1, createdBy: "Team",
    updatedBy: "Team", tags: [], history: [], ...extra,
  } as Rec;
}

describe("BOOK calendar lanes", () => {
  const at = (hour: number, minute = 0) => `2026-11-20T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
  it("puts overlapping bookings side by side and gives a lone booking the full width", () => {
    const lanes = bookingLanes([
      { id: "a", startAt: at(10), endAt: at(12) },
      { id: "b", startAt: at(11), endAt: at(13) },
      { id: "c", startAt: at(15), endAt: at(16) },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  it("reuses a freed lane inside one cluster", () => {
    const lanes = bookingLanes([
      { id: "long", startAt: at(9), endAt: at(13) },
      { id: "early", startAt: at(9), endAt: at(10) },
      { id: "late", startAt: at(11), endAt: at(12) },
    ]);
    expect(lanes.get("long")!.lane).toBe(0);
    expect(lanes.get("early")!.lane).toBe(1);
    expect(lanes.get("late")).toEqual({ lane: 1, lanes: 2 });
  });

  it("counts seats in use and releases cancelled seats", () => {
    const bookings = [
      rec("x", "bookings", { resourceId: "r", seats: 4 }, { status: "confirmed", startAt: at(10), endAt: at(12) }),
      rec("y", "bookings", { resourceId: "r", seats: 1 }, { status: "confirmed", startAt: at(11), endAt: at(13) }),
      rec("z", "bookings", { resourceId: "r", seats: 2 }, { status: "cancelled", startAt: at(11), endAt: at(13) }),
    ];
    expect(seatsInUse(bookings, "r", at(11, 30))).toBe(5);
    expect(seatsInUse(bookings, "r", at(12, 30))).toBe(1);
  });
});

describe("PROC supplier performance", () => {
  const line = (id: string, quantity: number, price: number, received: number, productId?: string) =>
    ({ id, description: `Item ${id}`, productId, quantity, unitPriceMinor: price, taxCategory: "standard", receivedQuantity: received });
  const po1 = rec("po1", "purchaseOrders", { kind: "po", supplierId: "s" }, { title: "PO-1", status: "received", dueAt: "2026-11-10T12:00:00Z", body: { lines: [line("l1", 10, 500, 10, "p1")] } });
  const po2 = rec("po2", "purchaseOrders", { kind: "po", supplierId: "s" }, { title: "PO-2", status: "sent", dueAt: "2026-11-12T12:00:00Z", body: { lines: [line("l1", 20, 300, 5)] } });
  const draft = rec("po3", "purchaseOrders", { kind: "po", supplierId: "s" }, { title: "PO-3", status: "draft", body: { lines: [line("l1", 99, 100, 0)] } });
  const grn1 = rec("g1", "receipts", { purchaseOrderId: "po1" }, { title: "GRN-1", status: "complete", at: "2026-11-10T09:00:00Z",
    body: { lines: [{ lineId: "l1", description: "Item l1", expected: 10, received: 10, condition: "good", bin: "" }],
      returns: [{ id: "r1", lineId: "l1", description: "Item l1", quantity: 2, reason: "defective", note: "", at: "2026-11-11T09:00:00Z", by: "Theo" }] } });
  const grn2 = rec("g2", "receipts", { purchaseOrderId: "po2" }, { title: "GRN-2", status: "exception", at: "2026-11-15T09:00:00Z",
    body: { lines: [{ lineId: "l1", description: "Item l1", expected: 20, received: 5, condition: "damaged", bin: "" }] } });
  const bill = rec("b1", "bills", { supplierId: "s", purchaseOrderId: "po1" }, { status: "matched", title: "INV-1",
    body: { lines: [{ id: "l1", description: "Item l1", quantity: 10, unitPriceMinor: 550, taxCategory: "standard" }] } });
  const data = { purchaseOrders: [po1, po2, draft], receipts: [grn1, grn2], bills: [bill] };
  const perf = supplierPerformance("s", data, new Date("2026-11-18T12:00:00Z"));

  it("measures on-time delivery from receipts against promised dates", () => {
    expect(perf.deliveries.map((row) => [row.receipt, row.onTime, row.lateDays])).toEqual([["GRN-1", true, 0], ["GRN-2", false, 3]]);
    expect(perf.onTimePct).toBe(50);
    expect(perf.overdueOrders).toEqual([{ id: "po2", title: "PO-2", daysOverdue: 6, outstanding: 15 }]);
  });

  it("counts returned and damaged units against quality and ignores drafts", () => {
    expect(perf.ordersPlaced).toBe(2);
    expect(perf.unitsReceived).toBe(15);
    expect(perf.unitsReturned).toBe(2);
    expect(perf.unitsDamaged).toBe(5);
    expect(perf.qualityPct).toBe(53.3);
  });

  it("prices variance from invoice lines against the order", () => {
    expect(perf.priceVarianceMinor).toBe(500);
    expect(perf.priceVariancePct).toBe(10);
  });

  it("reports no rate rather than inventing one when nothing was received", () => {
    const none = supplierPerformance("other", data, new Date());
    expect(none.onTimePct).toBeNull();
    expect(none.qualityPct).toBeNull();
    expect(none.priceVariancePct).toBeNull();
  });

  it("links catalogue items to receipts and on-hand stock", () => {
    const moves = [rec("m1", "stockMoves", { productId: "p1", quantity: 10 }), rec("m2", "stockMoves", { productId: "p1", quantity: -2 })];
    expect(suppliedItems("s", { ...data, stockMoves: moves })).toEqual([
      expect.objectContaining({ productId: "p1", ordered: 10, received: 10, returned: 2, onHand: 8, lastReceivedAt: "2026-11-10T09:00:00Z", orders: ["PO-1"] }),
    ]);
    expect(returnableUnits(grn1, "l1")).toBe(8);
  });
});

describe("COMMERCE fulfilment, returns and stock", () => {
  const order = (shipments: Shipment[] = [], extra: Partial<Rec> = {}) => rec("o1", "orders", { payment: "paid_local" }, {
    title: "ORD-1", status: "unfulfilled",
    body: { lines: [
      { id: "l1", description: "Lamp", productId: "p1", quantity: 3, unitPriceMinor: 1000, taxCategory: "standard" },
      { id: "l2", description: "Guide", productId: "p2", quantity: 1, unitPriceMinor: 500, taxCategory: "zero_rated" },
    ], shipments },
    ...extra,
  });
  const ship = (id: string, state: Shipment["state"], lines: Shipment["lines"]): Shipment =>
    ({ id, number: id, state, lines, carrier: "", tracking: "", createdAt: "2026-11-18T00:00:00Z", createdBy: "Maya" });

  it("tracks partial fulfilment per line and derives the order state", () => {
    const partial = order([ship("s1", "shipped", [{ lineId: "l1", quantity: 2 }])]);
    expect(lineProgress(partial).map((row) => [row.line.id, row.shipped, row.remaining])).toEqual([["l1", 2, 1], ["l2", 0, 1]]);
    expect(derivedFulfilment(partial)).toEqual({ fulfilment: "partially_shipped", status: "unfulfilled" });
    const all = order([ship("s1", "delivered", [{ lineId: "l1", quantity: 3 }]), ship("s2", "shipped", [{ lineId: "l2", quantity: 1 }])]);
    expect(derivedFulfilment(all)).toEqual({ fulfilment: "shipped", status: "in_transit" });
    expect(derivedFulfilment(order([ship("s1", "packed", [{ lineId: "l1", quantity: 1 }])])).fulfilment).toBe("packed");
    expect(nextShipmentState("packed")).toBe("shipped");
    expect(nextShipmentState("delivered")).toBeUndefined();
  });

  it("refuses over-fulfilment, empty shipments and unpaid orders", () => {
    const partial = order([ship("s1", "picking", [{ lineId: "l1", quantity: 2 }])]);
    expect(shipmentProblems(partial, { l1: 2 }, { paid: true })).toEqual(["Lamp: only 1 left to fulfil."]);
    expect(shipmentProblems(partial, { l1: 0 }, { paid: true })).toContain("Put at least one unit on the shipment.");
    expect(shipmentProblems(partial, { l1: 1 }, { paid: false })[0]).toMatch(/payment/);
    expect(shipmentProblems(partial, { l1: 1, l2: 1 }, { paid: true })).toEqual([]);
  });

  it("stops reserving units once they have shipped", () => {
    const partial = order([ship("s1", "shipped", [{ lineId: "l1", quantity: 2 }])]);
    expect(reservedFor([partial], "p1")).toBe(1);
  });

  it("only lets shipped units be returned, less earlier returns", () => {
    const partial = order([ship("s1", "shipped", [{ lineId: "l1", quantity: 2 }])]);
    const earlier = rec("ret", "returns", { orderId: "o1", lineId: "l1", quantity: 1 }, { status: "requested" });
    expect(returnableQuantity(partial, "l1", [])).toBe(2);
    expect(returnableQuantity(partial, "l1", [earlier])).toBe(1);
    expect(returnableQuantity(partial, "l2", [])).toBe(0);
    // An order handed over before shipments existed counts its whole line as shipped.
    expect(returnableQuantity(order([], { status: "delivered" }), "l1", [])).toBe(3);
  });

  it("records partial refunds up to the return value and requires a reference", () => {
    const item = rec("ret", "returns", {}, { status: "approved", amountMinor: 3000, body: { refunds: [{ id: "a", amountMinor: 1000, method: "bank_transfer", reference: "BACS-1", note: "", at: "", by: "" }] } });
    expect(refundableMinor(item)).toBe(2000);
    expect(refundProblems(item, 2500, "bank_transfer", "BACS-2")).toEqual(["That is more than remains to refund on this return."]);
    expect(refundProblems(item, 2000, "bank_transfer", "")).toEqual(["Give the reference of the refund made outside Arlovi."]);
    expect(refundProblems(item, 2000, "store_credit", "")).toEqual([]);
    expect(refundProblems({ ...item, tags: ["disputed"] }, 100, "credit_note", "CN-1")[0]).toMatch(/disputed/i);
  });

  it("keeps a running stock balance and validates adjustments with reasons", () => {
    const moves = [
      rec("m2", "stockMoves", { productId: "p1", warehouseId: "w", quantity: -2, kind: "sale" }, { at: "2026-11-02T00:00:00Z" }),
      rec("m1", "stockMoves", { productId: "p1", warehouseId: "w", quantity: 10, kind: "opening" }, { at: "2026-11-01T00:00:00Z" }),
      rec("m3", "stockMoves", { productId: "p1", warehouseId: "x", quantity: 4, kind: "transfer_in" }, { at: "2026-11-03T00:00:00Z" }),
    ];
    expect(stockHistory(moves, "p1").map((row) => row.balance)).toEqual([10, 8, 12]);
    expect(stockHistory(moves, "p1", "w").map((row) => row.move.id)).toEqual(["m1", "m2"]);
    expect(adjustmentProblems({ productId: "p1", delta: -3, onHand: 2, reason: "count", note: "" })).toEqual(["That would take the location below zero."]);
    expect(adjustmentProblems({ productId: "p1", delta: -1, onHand: 2, reason: "damage", note: "" })).toEqual(["Say what happened; this reason needs a note."]);
    expect(adjustmentProblems({ productId: "p1", delta: 1, onHand: 2, reason: "found", note: "" })).toEqual([]);
  });
});

describe("PORTAL page reorder", () => {
  const pages = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), modules: [], gate: "any_member" }));
  it("moves a page to a new position, shifting the pages between", () => {
    expect(reorderPage(pages, 0, 2).map((page) => page.id)).toEqual(["b", "c", "a", "d"]);
    expect(reorderPage(pages, 3, 0).map((page) => page.id)).toEqual(["d", "a", "b", "c"]);
    expect(reorderPage(pages, 1, 1)).toBe(pages);
    expect(reorderPage(pages, 5, 0)).toBe(pages);
  });
});
