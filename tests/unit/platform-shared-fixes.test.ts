import { describe, expect, it } from "vitest";
import { panelDomId, tabDomId } from "@/design-system/tabs";
import { routeForRecord } from "@/platform/attention";
import { revisedRecord } from "@/platform/repo";
import type { Rec } from "@/domain/types";

const base = {
  id: "nl-knowledge-1", organizationId: "org-nl", collection: "knowledge", title: "Returns policy",
  status: "verified", summary: "", fields: { owner: "Maya" }, history: [], revision: 3,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", createdBy: "Maya", updatedBy: "Maya", tags: [],
} as unknown as Rec;

describe("tab DOM ids", () => {
  it("never contain whitespace, so aria-controls resolves to one element", () => {
    expect(tabDomId("For You")).toBe("tab-For-You");
    expect(panelDomId("For You")).toBe("panel-For-You");
    expect(panelDomId("Provider status")).not.toMatch(/\s/);
  });
  it("keep simple ids unchanged", () => {
    expect(tabDomId("Overview")).toBe("tab-Overview");
  });
});

describe("knowledge record route", () => {
  it("opens the record inside the Company Brain workspace", () => {
    expect(routeForRecord(base, "northline")).toBe("/o/northline/brain/home?record=nl-knowledge-1");
  });
  it("opens a CRM company on its account page", () => {
    expect(routeForRecord({ ...base, id: "nl-companies-4", collection: "companies" } as Rec, "northline")).toBe("/o/northline/crm/companies?account=nl-companies-4");
  });
});

describe("revisedRecord", () => {
  it("merges fields, bumps the revision and keeps a history snapshot", () => {
    const next = revisedRecord(base, { fields: { reviewer: "Theo" } }, { actor: "Theo", now: "2026-11-18T00:00:00.000Z" });
    expect(next.fields).toEqual({ owner: "Maya", reviewer: "Theo" });
    expect(next.revision).toBe(4);
    expect(next.updatedBy).toBe("Theo");
    expect(next.history).toHaveLength(1);
  });
  it("cannot change a record's identity, organisation or collection", () => {
    const next = revisedRecord(base, { id: "other", organizationId: "org-hb", collection: "invoices" } as Partial<Rec>, { actor: "Theo", now: "2026-11-18T00:00:00.000Z" });
    expect([next.id, next.organizationId, next.collection]).toEqual(["nl-knowledge-1", "org-nl", "knowledge"]);
  });
});
