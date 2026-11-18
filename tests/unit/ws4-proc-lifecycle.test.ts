import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import type { PoLine } from "@/applications/proc/data";
import {
  awardBlock, awardedLines, compareQuotes, purchaseTrail, quoteNet, quoteProblems, type SupplierQuote,
} from "@/applications/proc/lifecycle";

function rec(id: string, collection: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "northline", collection, status: "draft", fields, title: id, summary: "", ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", revision: 1, createdBy: "Team",
    updatedBy: "Team", tags: [], history: [], ...extra,
  };
}

const lines: PoLine[] = [
  { id: "l1", description: "Brass arm", quantity: 10, unitPriceMinor: 1000, taxCategory: "standard", receivedQuantity: 0 },
  { id: "l2", description: "Shade", quantity: 4, unitPriceMinor: 2500, taxCategory: "standard", receivedQuantity: 0 },
];
const quote = (id: string, prices: Record<string, number>, lead: number, validUntil = "2026-12-31"): SupplierQuote =>
  ({ id, supplierId: `s-${id}`, prices, leadTimeDays: lead, validUntil, note: "", recordedBy: "Maya", at: "2026-11-01T00:00:00Z" });

describe("quote comparison", () => {
  it("totals a quote and lists the lines it does not price", () => {
    expect(quoteNet(lines, quote("a", { l1: 900, l2: 2400 }, 10))).toEqual({ netMinor: 18_600, missing: [] });
    expect(quoteNet(lines, quote("b", { l1: 900 }, 10)).missing).toEqual(["Shade"]);
  });

  it("ranks complete valid quotes first and flags lowest and fastest", () => {
    const rows = compareQuotes(lines, [
      quote("slow-cheap", { l1: 800, l2: 2400 }, 30),
      quote("fast-dear", { l1: 1000, l2: 2600 }, 5),
      quote("partial", { l1: 100 }, 1),
      quote("expired", { l1: 100, l2: 100 }, 1, "2026-01-01"),
    ], "2026-11-17");
    expect(rows.map((row) => row.quote.id)).toEqual(["slow-cheap", "fast-dear", "partial", "expired"]);
    expect(rows[0]).toMatchObject({ lowest: true, fastest: false, overLowestMinor: 0 });
    expect(rows[1]).toMatchObject({ lowest: false, fastest: true, overLowestMinor: 2_800 });
    expect(rows[2]).toMatchObject({ complete: false, lowest: false, fastest: false });
    expect(rows[3]).toMatchObject({ expired: true, lowest: false });
  });

  it("validates a recorded quote", () => {
    const base = { supplierId: "s1", prices: { l1: "9.00" }, lines, leadTimeDays: "14", validUntil: "2026-12-01", today: "2026-11-17", existing: [] };
    expect(quoteProblems(base)).toEqual([]);
    expect(quoteProblems({ ...base, supplierId: "", prices: {}, leadTimeDays: "-1", validUntil: "2026-11-01" })).toHaveLength(4);
    expect(quoteProblems({ ...base, existing: [{ ...quote("x", {}, 1), supplierId: "s1" }] })[0]).toMatch(/already/);
  });
});

describe("awarding", () => {
  const row = compareQuotes(lines, [quote("a", { l1: 900, l2: 2400 }, 10)], "2026-11-17")[0];

  it("rewrites line prices from the quote", () => {
    expect(awardedLines(lines, row.quote).map((line) => line.unitPriceMinor)).toEqual([900, 2400]);
  });

  it("refuses awards that would bypass approval or reuse a converted requisition", () => {
    expect(awardBlock(rec("r", "purchaseOrders", {}, { status: "awaiting_approval" }), row, 99_999)).toBeUndefined();
    expect(awardBlock(rec("r", "purchaseOrders", {}, { status: "approved", amountMinor: 20_000 }), row, 22_320)).toMatch(/approved amount/);
    expect(awardBlock(rec("r", "purchaseOrders", {}, { status: "approved", amountMinor: 30_000 }), row, 22_320)).toBeUndefined();
    expect(awardBlock(rec("r", "purchaseOrders", {}, { status: "converted" }), row, 1)).toMatch(/already a purchase order/);
  });
});

describe("purchase trail", () => {
  it("follows a requisition through a partial receipt to an unmatched invoice", () => {
    const requisition = rec("req", "purchaseOrders", { kind: "requisition", approver: "Maya", awardedQuoteId: "a" }, { status: "converted", body: { lines, quotes: [quote("a", { l1: 900, l2: 2400 }, 10)] } });
    const order = rec("po", "purchaseOrders", { kind: "po", requisitionId: "req", version: 1 }, {
      status: "sent", body: { lines: [{ ...lines[0], receivedQuantity: 6 }, { ...lines[1], receivedQuantity: 4 }] },
    });
    const receipt = rec("grn", "receipts", { purchaseOrderId: "po" }, { status: "received", body: { lines: [{ lineId: "l1", description: "Brass arm", expected: 10, received: 6, condition: "ok", bin: "A" }] } });
    const bill = rec("bill", "bills", { purchaseOrderId: "po" }, { body: { lines: [{ id: "b1", description: "Brass arm", quantity: 10, unitPriceMinor: 1000, taxCategory: "standard" }] } });
    const steps = purchaseTrail(order, [requisition, order], [receipt], [bill]);
    expect(steps.map((step) => [step.key, step.state])).toEqual([
      ["request", "done"], ["quotes", "done"], ["order", "done"], ["receive", "partial"], ["match", "blocked"],
    ]);
    expect(steps[3].detail).toMatch(/10 of 14 units/);
  });

  it("marks quotes and request as not used for an order raised directly", () => {
    const order = rec("po", "purchaseOrders", { kind: "po" }, { status: "draft", body: { lines } });
    const steps = purchaseTrail(order, [order], [], []);
    expect(steps.slice(0, 3).map((step) => step.state)).toEqual(["skipped", "skipped", "pending"]);
  });
});
