import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { profitAndLoss, trialForRange } from "@/domain/fin-ledger";
import { runQuery, type QueryContext } from "@/applications/analytics/metrics";
import {
  listedPortals, resolvePortal, sharedWithPortal, type PortalBody, type usePortalData,
} from "@/applications/portal/data";

function rec(id: string, collection: string, org = "org-northline", fields: Rec["fields"] = {}): Rec {
  return {
    id, collection, organizationId: org, title: id, status: "active", fields,
    ownerName: "Fixture", summary: "", currency: "GBP", tags: [],
    createdAt: "2026-11-14T09:00:00Z", updatedAt: "2026-11-14T09:00:00Z",
    revision: 1, createdBy: "Fixture", updatedBy: "Fixture", history: [],
  };
}

describe("release gate: Analytics and Finance share revenue evidence", () => {
  const bank = rec("bank", "accounts", "org-northline", { code: "1000", type: "asset" });
  const revenue = rec("sales", "accounts", "org-northline", { code: "4000", type: "revenue" });
  const tax = rec("tax", "accounts", "org-northline", { code: "2100", type: "liability" });
  const posted = {
    ...rec("issue-1", "journals"), status: "posted",
    at: "2026-11-14T09:00:00Z",
    body: { date: "2026-11-14", memo: "Net revenue and output VAT", lines: [
      { accountId: bank.id, debitMinor: 24000, creditMinor: 0 },
      { accountId: revenue.id, debitMinor: 0, creditMinor: 20000 },
      { accountId: tax.id, debitMinor: 0, creditMinor: 4000 },
    ] },
  };
  const draft = {
    ...posted, id: "unposted-1", status: "draft",
    body: { date: "2026-11-14", memo: "Not recognised", lines: [
      { accountId: bank.id, debitMinor: 200000, creditMinor: 0 },
      { accountId: revenue.id, debitMinor: 0, creditMinor: 200000 },
    ] },
  };
  const invoice = {
    ...rec("invoice-1", "invoices"), status: "paid", amountMinor: 24000,
    fields: { paidMinor: 24000, taxMinor: 4000, netMinor: 20000 },
  };
  const context: QueryContext = {
    records: [bank, revenue, tax, posted, draft, invoice],
    byId: new Map([bank, revenue, tax, posted, draft, invoice].map(item => [item.id, item])),
    now: new Date("2026-11-16T10:00:00Z"), locale: "en-GB",
  };
  it("recognised revenue is Finance's net posted revenue, never gross VAT-inclusive paid invoices", () => {
    const result = runQuery({
      measureIds: ["revenue.paid", "invoices.paid"], filters: [],
    }, context);
    const fromFinance = profitAndLoss(trialForRange(
      [bank, revenue, tax], [posted, draft], "org-northline",
    ).rows).revenueMinor;
    expect(fromFinance).toBe(20000);
    expect(result.totals).toEqual([fromFinance, 24000]);
    expect(result.sources).toEqual(["journals", "invoices"]);
    expect(result.recordCount).toBe(2);
  });
  it("both Finance and Analytics change together when posted revenue is reversed", () => {
    const reversal = {
      ...posted, id: "reversal-1",
      body: { date: "2026-11-15", memo: "Full reversal", lines: [
        { accountId: revenue.id, debitMinor: 20000, creditMinor: 0 },
        { accountId: tax.id, debitMinor: 4000, creditMinor: 0 },
        { accountId: bank.id, debitMinor: 0, creditMinor: 24000 },
      ] },
    };
    const records = [...context.records, reversal];
    const actual = runQuery({
      measureIds: ["revenue.paid"], filters: [],
    }, { ...context, records, byId: new Map(records.map(item => [item.id, item])) });
    const ledger = profitAndLoss(trialForRange(
      [bank, revenue, tax], [posted, draft, reversal], "org-northline",
    ).rows);
    expect(actual.totals[0]).toBe(ledger.revenueMinor);
    expect(actual.totals[0]).toBe(0);
  });
});

describe("release gate: portal directory and client dashboard agree on scoped grants", () => {
  const canonical = {
    ...rec("portal-master", "portals", "org-northline", {canonicalFor:"portal-link"}),
    status: "live",
    body: {
      shared: [{collection:"orders",ids:["order-1"]}],
      users: [],
    } satisfies PortalBody,
  };
  const routeStub = rec("portal-link", "portals");
  const other = {
    ...rec("portal-other", "portals", "org-northline"), status:"live",
  };
  const order = rec("order-1", "orders");
  const ownDoc = rec("doc-1", "documents", "org-northline", {portalId: routeStub.id});
  const foreignDoc = rec("doc-foreign", "documents", "org-harbor", {portalId: canonical.id});
  const otherDoc = rec("doc-other", "documents", "org-northline", {portalId: other.id});
  const data = {
    portals: [routeStub, canonical, other],
    orders: [order], documents: [ownDoc, foreignDoc, otherDoc],
    invoices: [], messages: [], bookings: [], purchaseOrders: [], returns: [], contacts: [],
  } as ReturnType<typeof usePortalData>;

  it("the listed portal and the client route resolve to the same canonical record and count", () => {
    const directory = listedPortals(data.portals);
    expect(directory.map(item=>item.id)).toEqual([canonical.id, other.id]);
    const viaRoute = resolvePortal(routeStub.id, data.portals)!;
    const viaDirectory = directory[0];
    expect(viaRoute.id).toBe(viaDirectory.id);
    expect(sharedWithPortal(viaRoute, data).map(row=>row.id).sort())
      .toEqual([order.id, ownDoc.id].sort());
    expect(sharedWithPortal(viaRoute, data).length)
      .toBe(sharedWithPortal(viaDirectory, data).length);
  });
  it("never counts an unrelated client or another company's documents", () => {
    const ids=sharedWithPortal(resolvePortal(routeStub.id,data.portals),data).map(item=>item.id);
    expect(ids).not.toContain(otherDoc.id);
    expect(ids).not.toContain(foreignDoc.id);
  });
});
