import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagshipCollective";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { ORG_NORTHLINE, SEED_NOW } from "@/domain/types";

const flagship = collectSeedsByContributor(SEED_NOW).find(group => group.key === "flagship-collective");

describe("Northline Collective flagship fixtures", () => {
  it("registers a deterministic additive dataset", () => {
    expect(flagship).toBeDefined();
    expect(flagship!.records.length).toBeGreaterThan(60);
    expect(new Set(flagship!.records.map(record => record.id)).size).toBe(flagship!.records.length);
    expect(flagship!.records.every(record => record.id.startsWith("nl-") && /-9\d\d$/.test(record.id))).toBe(true);
    expect(flagship!.records.every(record => record.organizationId === ORG_NORTHLINE)).toBe(true);
    expect(flagship!.records.every(record => record.fields.fictional === true)).toBe(true);
  });

  it("links a customer opportunity, project, quote, draft invoice and client portal", () => {
    const ids = new Set(flagship!.records.map(record => record.id));
    const project = flagship!.records.find(record => record.id === "nl-projects-900")!;
    const quote = flagship!.records.find(record => record.id === "nl-quotes-900")!;
    const invoice = flagship!.records.find(record => record.id === "nl-invoices-900")!;
    const portal = flagship!.records.find(record => record.id === "nl-portals-900")!;
    expect(ids.has(String(project.fields.companyId))).toBe(true);
    expect(ids.has(String(project.fields.dealId))).toBe(true);
    expect(quote.fields.projectId).toBe(project.id);
    expect(invoice.fields.projectId).toBe(project.id);
    expect(invoice.status).toBe("draft");
    expect(invoice.fields.posted).toBe(false);
    expect(portal.fields.projectId).toBe(project.id);
  });

  it("has seven original editable native web pages and no live publication claim", () => {
    const website = flagship!.records.find(record => record.id === "nl-sites-900")!;
    const body = website.body as { pages: {path:string}[]; seo:{robots:string}; domains:unknown[] };
    expect(body.pages.map(page => page.path)).toEqual(["/","/work","/atelier","/objects","/experiences","/about","/contact"]);
    expect(body.seo.robots).toBe("noindex");
    expect(body.domains).toEqual([]);
    expect(website.fields.delivery).toBe("not_connected");
  });

  it("offers studio drafts while explicitly blocking external execution", () => {
    for (const collection of ["decks","motions","videos","forms","sites","assets"]) {
      expect(flagship!.records.some(record => record.collection === collection && record.status === "draft")).toBe(true);
    }
    expect(flagship!.records.find(record => record.id === "nl-missions-900")?.fields.executionPaused).toBe(true);
    expect(flagship!.records.find(record => record.id === "nl-purchaseOrders-900")?.fields.externalState).toBe("not_connected");
    expect(flagship!.events[0].capability).toBe("ready_local");
  });
});
