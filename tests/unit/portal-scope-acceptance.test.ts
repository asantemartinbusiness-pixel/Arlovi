import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { openInvoices, outstandingMinor } from "@/applications/fin/data";
import {
  listedPortals, portalDocuments, portalForRole, portalInvoices, portalMessages,
  portalVisibleInvoices, resolvePortal, sharedRecords, sharedWithPortal, type PortalBody, type usePortalData,
} from "@/applications/portal/data";

function record(
  id: string, collection: string, org = "org-northline", fields: Rec["fields"] = {},
  body?: PortalBody,
): Rec {
  return {
    id, collection, organizationId: org, title: id, status: "live",
    ownerName: "Fixture", summary: "", currency: "GBP", tags: [],
    fields, body, createdAt: "", updatedAt: "", revision: 1,
    createdBy: "Fixture", updatedBy: "Fixture", history: [],
  };
}

const canonical = record("nl-portals-620", "portals", "org-northline",
  { canonicalFor: "nl-portals-001", contactId: "nl-contacts-010" },
  { shared: [{ collection: "documents", ids: ["nl-documents-100"] }],
    users: [], pages: [], activity: [] });
const stub = record("nl-portals-001", "portals", "org-northline", { contactId: "nl-contacts-010" });
const other = record("nl-portals-621", "portals", "org-northline", { contactId: "nl-contacts-011" });
const foreign = record("hb-portals-620", "portals", "org-harbor", { contactId: "hb-contacts-001" });
const document = record("nl-documents-100", "documents", "org-northline", { portalId: canonical.id });
const aliasDoc = record("nl-documents-101", "documents", "org-northline", { portalId: stub.id });
const wrongClientDoc = record("nl-documents-102", "documents", "org-northline", { portalId: other.id });
const wrongCompanyDoc = record("hb-documents-100", "documents", "org-harbor", { portalId: canonical.id });
const invoice = record("nl-invoices-101", "invoices", "org-northline", { portalId: stub.id });
const message = record("nl-messages-101", "messages", "org-northline", { portalId: stub.id });
const internalMessage = record("nl-messages-102", "messages", "org-northline", { portalId: stub.id, internalOnly: true });

const data = {
  portals: [stub, canonical, other, foreign], documents: [document, aliasDoc, wrongClientDoc, wrongCompanyDoc],
  invoices: [invoice], messages: [message, internalMessage],
  orders: [], bookings: [], purchaseOrders: [], returns: [], contacts: [],
} as ReturnType<typeof usePortalData>;

describe("portal record-scope acceptance", () => {
  it("resolves a legacy portal URL to the one canonical portal, without duplicate directory entries", () => {
    expect(resolvePortal(stub.id, data.portals)?.id).toBe(canonical.id);
    expect(listedPortals(data.portals).map(item => item.id)).not.toContain(stub.id);
  });

  it("counts explicitly shared and portal-attached records once, including canonical and alias links", () => {
    expect(sharedRecords(canonical, data).map(item => item.record.id)).toEqual([document.id]);
    expect(portalDocuments(canonical, data.documents).map(item => item.id)).toEqual([document.id, aliasDoc.id]);
    expect(portalInvoices(canonical, data.invoices)).toEqual([invoice]);
    expect(sharedWithPortal(canonical, data).map(item => item.id)).toEqual([
      document.id, aliasDoc.id, invoice.id,
    ]);
  });

  it("shows attached and explicitly granted invoices once, using the Finance net amount due", () => {
    const attached = {
      ...invoice, status: "part_paid", amountMinor: 12000,
      fields: { ...invoice.fields, paidMinor: 5000 },
    };
    const explicitlyGranted = {
      ...record("nl-invoices-202", "invoices"), status: "awaiting_payment",
      amountMinor: 2400, fields: { paidMinor: 0 },
    };
    const foreign = {
      ...record("hb-invoices-202", "invoices", "org-harbor"), status: "awaiting_payment",
      amountMinor: 80000,
    };
    const body = canonical.body as PortalBody;
    const withGrant: Rec = {
      ...canonical,
      body: {
        ...body,
        shared: [
          ...(body.shared ?? []),
          { collection: "invoices", ids: [attached.id, explicitlyGranted.id, foreign.id] },
        ],
      },
    };
    const scoped = {
      ...data, invoices: [attached, explicitlyGranted, foreign],
    } as ReturnType<typeof usePortalData>;
    const visible = portalVisibleInvoices(withGrant, scoped);
    expect(visible.map(item => item.id)).toEqual([attached.id, explicitlyGranted.id]);
    expect(visible.some(item => item.id === foreign.id)).toBe(false);
    expect(openInvoices(visible).reduce((total, item) => total + outstandingMinor(item), 0))
      .toBe(9400);
  });

  it("never counts another client's or another company's documents or private messages", () => {
    expect(portalMessages(canonical, data.messages)).toEqual([message]);
    expect(sharedWithPortal(canonical, data).some(item => item.id === wrongClientDoc.id)).toBe(false);
    expect(sharedWithPortal(canonical, data).some(item => item.id === wrongCompanyDoc.id)).toBe(false);
  });

  it("never shows the first live client portal as a fallback for an unmatched visitor", () => {
    expect(portalForRole("client", data.portals, "Unrecognised visitor", data.contacts)).toBeUndefined();
    expect(portalForRole("owner", data.portals, "Fixture", data.contacts)).toBeUndefined();
  });

  it("only selects an explicitly matching same-company live portal", () => {
    const northline = record("nl-contacts-010", "contacts", "org-northline");
    const harbor = record("hb-contacts-001", "contacts", "org-harbor");
    const clients = [{ ...northline, title: "Ines" }, { ...harbor, title: "Chris" }];
    expect(portalForRole("client", data.portals, "Ines", clients)?.id).toBe(canonical.id);
    expect(portalForRole("client", data.portals, "Chris", clients)?.id).toBe(foreign.id);
    expect(portalForRole("client", data.portals, "No match", clients)).toBeUndefined();
  });

  it("does not open draft or suspended portals for client role", () => {
    const contact = { ...record("nl-contacts-011", "contacts"), title: "Alex" };
    const draft = { ...other, status: "draft" };
    expect(portalForRole("client", [canonical, draft], "Alex", [contact])).toBeUndefined();
  });
});
