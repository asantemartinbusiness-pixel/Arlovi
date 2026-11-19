import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagship";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { ORG_COLLECTIVE, ORG_HARBOR, ORG_NORTHLINE, SEED_NOW } from "@/domain/types";
import { orgBySlug, ORGS } from "@/platform/org";

const flagship = () => {
  const found = collectSeedsByContributor(SEED_NOW).find(item => item.key === "northline-collective-v1");
  if (!found) throw new Error("Flagship contributor was not registered");
  return found;
};
const collection = (name: string) => flagship().records.filter(item => item.collection === name);

describe("Northline Collective flagship — isolated, connected fictional company", () => {
  it("registers its own address, not a relabelled existing sample tenant", () => {
    const profile = orgBySlug("collective");
    expect(profile).toMatchObject({ id: ORG_COLLECTIVE, name: "Northline Collective", currency: "GBP" });
    expect(new Set(ORGS.map(item => item.slug)).size).toBe(ORGS.length);
    expect(ORG_COLLECTIVE).not.toBe(ORG_NORTHLINE);
    expect(ORG_COLLECTIVE).not.toBe(ORG_HARBOR);
  });

  it("seeds deterministic, unique IDs and no cross-tenant records", () => {
    const a = flagship(), b = flagship();
    expect(a.records.length).toBeGreaterThan(4500);
    expect(a.records.map(item => item.id)).toEqual(b.records.map(item => item.id));
    expect(new Set(a.records.map(item => item.id)).size).toBe(a.records.length);
    expect(a.records.every(item => item.organizationId === ORG_COLLECTIVE)).toBe(true);
    expect(a.records.every(item => item.fields.demo === true)).toBe(true);
    expect(a.events.every(item => item.organizationId === ORG_COLLECTIVE)).toBe(true);
  });

  it("populates the full native suite with meaningful operating records", () => {
    const requirements: Record<string, string[]> = {
      Headquarters: ["organizations", "locations", "departments", "objectives", "notifications", "assets", "members"],
      Intelligence: ["conversations", "agents", "skills", "missions", "workflows", "datasets", "facts", "sources"],
      Operations: ["invoices", "accounts", "journals", "deals", "employees", "projects", "meetings", "tickets", "risks"],
      Growth: ["campaigns", "products", "orders", "bookings", "purchaseOrders", "portals"],
      Studio: ["documents", "workbooks", "decks", "designs", "photos", "publications", "videos", "motions"],
      Platform: ["sites", "appProjects", "forms", "connectors", "incidents"],
    };
    const names = new Set(flagship().records.map(record => record.collection));
    const missing = Object.entries(requirements).flatMap(([area, groups]) =>
      groups.filter(group => !names.has(group)).map(group => area + ":" + group));
    expect(missing).toEqual([]);
    expect(collection("employees")).toHaveLength(82);
    expect(collection("contacts")).toHaveLength(600);
    expect(collection("products")).toHaveLength(350);
    expect(collection("orders")).toHaveLength(1200);
    expect(collection("projects")).toHaveLength(75);
    expect(collection("agents")).toHaveLength(18);
  });

  it("connects the sales, project, procurement and care records by existing IDs", () => {
    const records = flagship().records;
    const index = new Map(records.map(record => [record.id, record]));
    for (const record of records.filter(r => ["deals", "orders", "tickets", "bookings", "purchaseOrders"].includes(r.collection))) {
      const ref = record.fields.contactId ?? record.fields.supplierId;
      if (typeof ref === "string" && ref.length) {
        const owner = index.get(ref);
        expect(owner, record.id + " reference " + ref).toBeDefined();
        expect(owner?.organizationId).toBe(ORG_COLLECTIVE);
      }
    }
    expect(records.find(r => r.id === "nc-projects-0001")?.title).toContain("Lighthouse");
    expect(index.get("nc-sites-0001")).toBeDefined();
  });

  it("retains balanced posted sample journals and internally consistent invoice totals", () => {
    for (const journal of collection("journals").filter(row => row.status === "posted")) {
      const body = journal.body as { lines: { debitMinor: number; creditMinor: number }[] };
      const debits = body.lines.reduce((sum, row) => sum + row.debitMinor, 0);
      const credits = body.lines.reduce((sum, row) => sum + row.creditMinor, 0);
      expect(debits, journal.id).toBe(credits);
    }
    for (const invoice of collection("invoices")) {
      expect(invoice.fields.netMinor as number + (invoice.fields.taxMinor as number)).toBe(invoice.amountMinor);
    }
  });

  it("contains editable native creative work and never asserts external publication", () => {
    const records = flagship().records;
    const site = records.find(r => r.id === "nc-sites-0001")!;
    const body = site.body as { pages: { path: string; blocks: object[] }[]; domains: { verified: boolean }[]; forms: { formRecordId: string }[] };
    expect(body.pages).toHaveLength(6);
    expect(body.pages.map(p => p.path)).toContain("/atelier");
    expect(body.pages.flatMap(p => p.blocks).length).toBeGreaterThan(25);
    expect(body.domains.every(d => !d.verified)).toBe(true);
    expect(body.forms[0].formRecordId).toBe("nc-forms-0001");
    expect(collection("decks").every(r => (r.body as { slides: unknown[] }).slides.length >= 4)).toBe(true);
    expect(collection("videos")[0].fields.exportVerified).toBe(false);
    expect(collection("assets").filter(r => r.fields.fileState === "stored_svg")).toHaveLength(28);
    expect(collection("connectors").every(r => r.status === "not_connected")).toBe(true);
    expect(collection("agents").every(r => r.fields.model === "not_connected")).toBe(true);
    expect(records.filter(r => r.collection === "workflowRuns").every(r => r.status === "simulated")).toBe(true);
  });
});
