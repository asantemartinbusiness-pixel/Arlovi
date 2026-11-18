import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  acceptedRequestTypes, accentWarning, addPage, brandingProblems, canOpenPage, contrastWithWhite, exposureRows, initialsOf,
  markTextColour, movePage, pagesForRole, removePage, setExposure, sharingState, updatePage, validatePageName,
} from "@/applications/portal/config";
import { portalDocuments, type PortalPage } from "@/applications/portal/data";

function rec(id: string, collection: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "northline", collection, status: "live", fields, title: id, summary: "", ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", revision: 1, createdBy: "Team",
    updatedBy: "Team", tags: [], history: [], ...extra,
  };
}

const pages: PortalPage[] = [
  { id: "pg-1", name: "Overview", modules: ["welcome"], gate: "any_member" },
  { id: "pg-2", name: "Billing", modules: ["invoices"], gate: "billing_contact" },
  { id: "pg-3", name: "Settings", modules: [], gate: "admin_only" },
];

describe("portal role gates", () => {
  it("opens pages by role and keeps unknown gates closed", () => {
    expect(canOpenPage("any_member", "portal_member")).toBe(true);
    expect(canOpenPage("billing_contact", "portal_member")).toBe(false);
    expect(canOpenPage("billing_contact", "billing_contact")).toBe(true);
    expect(canOpenPage("admin_only", "billing_contact")).toBe(false);
    expect(canOpenPage("admin_only", "portal_admin")).toBe(true);
    expect(canOpenPage("everyone", "portal_admin")).toBe(false);
  });

  it("splits navigation into visible and hidden pages for a role preview", () => {
    expect(pagesForRole(pages, "portal_member").visible.map((page) => page.name)).toEqual(["Overview"]);
    expect(pagesForRole(pages, "billing_contact").hidden.map((page) => page.name)).toEqual(["Settings"]);
    expect(pagesForRole(pages, "portal_admin").hidden).toEqual([]);
  });
});

describe("portal navigation editing", () => {
  it("validates page names", () => {
    expect(validatePageName(pages, " ")).toMatch(/name/);
    expect(validatePageName(pages, "billing")).toMatch(/already/);
    expect(validatePageName(pages, "Billing", "pg-2")).toBeUndefined();
    expect(validatePageName(pages, "x".repeat(33))).toMatch(/32/);
  });

  it("adds with a fresh id, moves, renames and removes without mutating input", () => {
    const added = addPage(removePage(pages, "pg-1"), "Handover");
    expect(added.map((page) => page.id)).toEqual(["pg-2", "pg-3", "pg-4"]);
    expect(movePage(pages, 2, -1).map((page) => page.name)).toEqual(["Overview", "Settings", "Billing"]);
    expect(movePage(pages, 0, -1)).toBe(pages);
    expect(updatePage(pages, "pg-1", { name: "  Home " })[0].name).toBe("Home");
    expect(pages[0].name).toBe("Overview");
  });
});

describe("portal branding", () => {
  it("computes white-text contrast and picks a readable mark colour", () => {
    expect(contrastWithWhite("#ffffff")).toBe(1);
    expect(contrastWithWhite("#000000")).toBe(21);
    expect(markTextColour("#234fe8")).toBe("#fff");
    expect(markTextColour("#ffd84a")).toBe("#111");
    expect(accentWarning("#ffd84a")).toMatch(/contrast/);
    expect(accentWarning("#234fe8")).toBeUndefined();
  });

  it("reports field problems for invalid branding", () => {
    expect(brandingProblems({ displayName: "", accent: "blue", welcome: "", domain: "https://x" })).toEqual({
      displayName: expect.any(String), accent: expect.any(String), domain: expect.any(String),
    });
    expect(brandingProblems({ displayName: "Harrow", accent: "#234fe8", welcome: "Hi", domain: "harrow.northline.example" })).toEqual({});
    expect(initialsOf("Harrow House Interiors")).toBe("HH");
    expect(initialsOf("Vellum")).toBe("VE");
  });
});

describe("portal exposure", () => {
  const portal = rec("p1", "portals", { contactId: "c1", canonicalFor: "p-stub" }, {
    body: { shared: [{ collection: "invoices", ids: ["inv-granted"] }, { collection: "documents", ids: ["doc-attached"] }] },
  });
  const pools = {
    invoices: [
      rec("inv-granted", "invoices", { contactId: "c1" }),
      rec("inv-available", "invoices", { contactId: "c1" }),
      rec("inv-foreign", "invoices", { contactId: "c2" }),
      rec("inv-other-org", "invoices", { contactId: "c1" }, { organizationId: "harbour" }),
    ],
    documents: [rec("doc-attached", "documents", { portalId: "p-stub" }), rec("doc-unrelated", "documents", {})],
  };

  it("reports a granted record that is also attached as attached, since withdrawing the grant would not hide it", () => {
    expect(exposureRows(portal, pools, ["p-stub"]).find((row) => row.record.id === "doc-attached")?.source).toBe("attached");
  });

  it("classifies every candidate record and never offers another account's record", () => {
    const rows = exposureRows(portal, pools, ["p-stub"]);
    const byId = Object.fromEntries(rows.map((row) => [row.record.id, [row.source, row.exposed]]));
    expect(byId).toEqual({
      "inv-granted": ["granted", true],
      "inv-available": ["available", false],
      "inv-foreign": ["other_account", false],
      "doc-attached": ["attached", true],
    });
  });

  it("adds and removes a single grant, dropping empty scopes", () => {
    const on = setExposure([{ collection: "invoices", ids: ["a"] }], "documents", "d", true);
    expect(on).toEqual([{ collection: "invoices", ids: ["a"] }, { collection: "documents", ids: ["d"] }]);
    expect(setExposure(on, "invoices", "a", false)).toEqual([{ collection: "documents", ids: ["d"] }]);
    expect(setExposure(on, "documents", "d", true)).toEqual(on);
  });
});

describe("portal requests and sharing state", () => {
  it("defaults to every request type and honours an explicit empty choice", () => {
    expect(acceptedRequestTypes(rec("p", "portals"))).toHaveLength(4);
    expect(acceptedRequestTypes(rec("p", "portals", { requestTypes: "document,bogus" }))).toEqual(["document"]);
    expect(acceptedRequestTypes(rec("p", "portals", { requestTypes: "" }))).toEqual([]);
  });

  it("never claims a live link without hosting", () => {
    const live = sharingState(rec("p", "portals", { customDomain: "harrow.example" }), "northline");
    expect(live).toMatchObject({ state: "marked_live", linkLive: false, plannedAddress: "https://harrow.example" });
    expect(sharingState(rec("p", "portals", {}, { status: "draft" }), "northline").plannedAddress).toBe("https://northline.example/portal/p");
    expect(sharingState(rec("p", "portals", {}, { status: "suspended" }), "northline").tone).toBe("danger");
  });
});

describe("portal attachment never matches unattached records", () => {
  const orgDocs = [
    rec("doc-mine", "documents", { portalId: "p-1" }),
    rec("doc-loose", "documents", {}),
    rec("doc-blank", "documents", { portalId: "" }),
  ];

  it("portalDocuments ignores documents with no portalId when no alias is set", () => {
    expect(portalDocuments(rec("p-1", "portals"), orgDocs).map((doc) => doc.id)).toEqual(["doc-mine"]);
    expect(portalDocuments(rec("p-1", "portals", { canonicalFor: "" }), orgDocs).map((doc) => doc.id)).toEqual(["doc-mine"]);
  });

  it("exposureRows does not report unattached documents as attached for an empty alias", () => {
    const rows = exposureRows(rec("p-1", "portals"), { documents: orgDocs }, [""]);
    expect(rows.filter((row) => row.source === "attached").map((row) => row.record.id)).toEqual(["doc-mine"]);
  });
});
