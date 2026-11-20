import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { ORG_NORTHLINE, SEED_NOW } from "../../src/domain/types";
import type { Rec } from "../../src/domain/types";
import {
  STAGES, activitiesFor, forecast, probabilityOf, scoreLead, stageGuard, stageOf,
} from "../../src/domain/crm-pipeline";
import { documentTotals, readLines, statusFor } from "../../src/domain/fin-invoice";

const base = buildSeed();
const extra = collectSeeds(SEED_NOW);
const seen = new Set(base.records.map((record) => record.id));
const ALL: Rec[] = [...base.records, ...extra.records.filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))];
const NOW = new Date(SEED_NOW);

function inOrg(collection: string): Rec[] {
  return ALL.filter((record) => record.organizationId === ORG_NORTHLINE && record.collection === collection);
}

const DEALS = inOrg("deals");
const QUOTES = inOrg("quotes");
const CONTACTS = inOrg("contacts");
const ACTIVITIES = inOrg("activities");
const LEADS = inOrg("leads");

function deal(partial: Partial<Rec>): Rec {
  return {
    id: "d-test",
    organizationId: ORG_NORTHLINE,
    collection: "deals",
    title: "Test deal",
    status: "discovery",
    ownerName: "Priya Shah",
    summary: "",
    currency: "GBP",
    tags: [],
    fields: { stage: "discovery" },
    createdAt: SEED_NOW,
    updatedAt: SEED_NOW,
    revision: 1,
    createdBy: "Priya Shah",
    updatedBy: "Priya Shah",
    history: [],
    ...partial,
  } as Rec;
}

const stage = (id: string) => STAGES.find((item) => item.id === id)!;

describe("weighted forecast", () => {
  it("weights only open deals and never counts a closed one", () => {
    const report = forecast(DEALS);
    const open = DEALS.filter((item) => stageOf(item).kind === "open");
    expect(report.openCount).toBe(open.filter((item) => Number(item.amountMinor ?? 0) > 0).length);
    expect(report.pipelineMinor).toBe(open.reduce((sum, item) => sum + Number(item.amountMinor ?? 0), 0));
    expect(report.weightedMinor).toBe(open.reduce((sum, item) => sum + Math.round((Number(item.amountMinor ?? 0) * probabilityOf(item)) / 100), 0));
    expect(report.weightedMinor).toBeLessThan(report.pipelineMinor);
    expect(report.wonMinor).toBe(DEALS.filter((item) => stageOf(item).kind === "won").reduce((sum, item) => sum + Number(item.amountMinor ?? 0), 0));
  });

  it("excludes a deal with no amount instead of counting it as nil", () => {
    const report = forecast([...DEALS, deal({ id: "d-noamount", amountMinor: undefined, fields: { stage: "proposal" } })]);
    expect(report.withoutAmountIds).toContain("d-noamount");
    expect(report.pipelineMinor).toBe(forecast(DEALS).pipelineMinor);
  });

  it("prefers the recorded probability over the stage default", () => {
    expect(probabilityOf(deal({ fields: { stage: "proposal", probability: 35 } }))).toBe(35);
    expect(probabilityOf(deal({ fields: { stage: "proposal" } }))).toBe(60);
    expect(probabilityOf(deal({ fields: { stage: "proposal", probability: 400 } }))).toBe(60);
  });

  it("puts every deal in exactly one stage bucket", () => {
    const report = forecast(DEALS);
    expect(report.byStage.reduce((sum, entry) => sum + entry.count, 0)).toBe(DEALS.length);
  });
});

describe("stage validation", () => {
  it("refuses to advance out of Discovery without a named contact", () => {
    const without = deal({ fields: { stage: "discovery" } });
    expect(stageGuard(without, stage("qualified"))).toMatch(/named contact/);
    const with_ = deal({ fields: { stage: "discovery", contactId: "nl-contacts-720" } });
    expect(stageGuard(with_, stage("qualified"))).toBeUndefined();
  });

  it("refuses to advance out of Qualified without a confirmed budget", () => {
    const deal_ = deal({ fields: { stage: "qualified", contactId: "c1" } });
    expect(stageGuard(deal_, stage("proposal"))).toMatch(/confirmed budget/);
    expect(stageGuard(deal({ fields: { stage: "qualified", budgetConfirmed: true } }), stage("proposal"))).toBeUndefined();
  });

  it("refuses to advance out of Proposal without a linked quote", () => {
    expect(stageGuard(deal({ fields: { stage: "proposal" } }), stage("negotiation"))).toMatch(/linked quote/);
    expect(stageGuard(deal({ fields: { stage: "proposal", quoteId: "q1" } }), stage("negotiation"))).toBeUndefined();
  });

  it("refuses to close won without a quote or an invoice behind the amount", () => {
    const naked = deal({ fields: { stage: "negotiation", closeDate: "2026-12-01" } });
    expect(stageGuard(naked, stage("won"))).toMatch(/quote or invoice/);
    expect(stageGuard(deal({ fields: { stage: "negotiation", closeDate: "2026-12-01", quoteId: "q1" } }), stage("won"))).toBeUndefined();
    expect(stageGuard(deal({ fields: { stage: "negotiation", closeDate: "2026-12-01", invoiceId: "i1" } }), stage("won"))).toBeUndefined();
  });

  it("lets a deal move backwards without meeting a forward requirement", () => {
    const stuck = deal({ fields: { stage: "proposal" } });
    expect(stageGuard(stuck, stage("qualified"))).toBeUndefined();
    expect(stageGuard(stuck, stage("negotiation"))).toBeDefined();
  });

  it("will not move a card into the stage it is already in, or reopen a won deal", () => {
    expect(stageGuard(deal({ fields: { stage: "proposal" } }), stage("proposal"))).toMatch(/already/);
    expect(stageGuard(deal({ fields: { stage: "won" } }), stage("negotiation"))).toMatch(/closed-won/);
  });

  it("holds the fixtures to the same rule", () => {
    const seededProposal = DEALS.filter((item) => stageOf(item).id === "proposal");
    expect(seededProposal.length).toBeGreaterThan(0);
    for (const item of seededProposal) {
      const guard = stageGuard(item, stage("negotiation"));
      if (item.fields.quoteId) expect(guard).toBeUndefined();
      else expect(guard).toMatch(/linked quote/);
    }
  });
});

describe("a converted deal has real documents behind it", () => {
  it("links every won deal this workstream seeded to a quote or an invoice", () => {
    // The base seed has one closed-won deal that names an invoice only in its
    // prose. The deal screen says so plainly rather than implying a link.
    const won = DEALS.filter((item) => stageOf(item).kind === "won" && /-7\d\d$/.test(item.id));
    expect(won.length).toBeGreaterThan(0);
    for (const item of won) {
      const linked = Boolean(item.fields.quoteId) || Boolean(item.fields.invoiceId);
      expect([item.id, linked]).toEqual([item.id, true]);
      const document = ALL.find((record) => record.id === String(item.fields.invoiceId ?? item.fields.quoteId));
      expect(document).toBeDefined();
      expect(["invoices", "quotes"]).toContain(document!.collection);
    }
  });

  it("links the base seed's won deal to the paid invoice its summary names", () => {
    const legacy = DEALS.find((item) => item.id === "nl-deals-001");
    expect(legacy && stageOf(legacy).kind).toBe("won");
    expect(legacy?.fields.invoiceId).toBe("nl-invoices-001");
  });

  it("points each quote at a deal that exists", () => {
    for (const quote of QUOTES.filter((item) => item.fields.dealId)) {
      expect(DEALS.some((item) => item.id === String(quote.fields.dealId))).toBe(true);
    }
  });

  it("prices a quote through the same tax engine as an invoice", () => {
    const quote = QUOTES.find((item) => String(item.fields.number ?? "") === "Q-121")!;
    const customer = CONTACTS.find((item) => item.id === String(quote.fields.contactId));
    const totals = documentTotals({
      lines: readLines(quote),
      jurisdiction: "GB",
      customerStatus: statusFor(quote, customer),
      date: (quote.at ?? SEED_NOW).slice(0, 10),
    });
    // An Oslo export: zero-rated with evidence, so a positive net and no tax.
    expect(totals.netMinor).toBeGreaterThan(0);
    expect(totals.taxMinor).toBe(0);
    expect(totals.byCode.every((group) => group.code.code === "GB-EXP")).toBe(true);
    expect(Number(quote.amountMinor)).toBe(totals.grossMinor);
  });

  it("flags the quote whose line has no approved rate", () => {
    const unresolved = QUOTES.filter((item) => item.fields.taxUnresolved === true);
    expect(unresolved.length).toBeGreaterThan(0);
    for (const quote of unresolved) {
      const customer = CONTACTS.find((item) => item.id === String(quote.fields.contactId));
      const totals = documentTotals({
        lines: readLines(quote),
        jurisdiction: "GB",
        customerStatus: statusFor(quote, customer),
        date: (quote.at ?? SEED_NOW).slice(0, 10),
      });
      expect(totals.hasUnknownRate).toBe(true);
    }
  });

  it("keeps a quote total equal to what the engine recomputes", () => {
    const priced = QUOTES.filter((quote) => readLines(quote).length > 0);
    expect(priced.length).toBeGreaterThan(3);
    for (const quote of priced) {
      const customer = CONTACTS.find((item) => item.id === String(quote.fields.contactId));
      const totals = documentTotals({
        lines: readLines(quote),
        jurisdiction: "GB",
        customerStatus: statusFor(quote, customer),
        date: (quote.at ?? SEED_NOW).slice(0, 10),
      });
      expect([quote.id, Number(quote.amountMinor)]).toEqual([quote.id, totals.grossMinor]);
    }
  });
});

describe("activities and lead scoring", () => {
  it("finds activities by parent and by field link", () => {
    const withActivity = DEALS.find((item) => activitiesFor(ACTIVITIES, item.id).length > 1)!;
    const found = activitiesFor(ACTIVITIES, withActivity.id);
    expect(found.length).toBeGreaterThan(1);
    // Newest first.
    const stamps = found.map((item) => item.startAt ?? item.at ?? "");
    expect([...stamps].sort().reverse()).toEqual(stamps);
    expect(activitiesFor(ACTIVITIES, undefined)).toEqual([]);
  });

  it("scores a lead from recorded fields and attributes every point", () => {
    const lead = LEADS.find((item) => item.title.includes("Bermondsey"))!;
    const score = scoreLead(lead, {
      contact: CONTACTS.find((item) => item.id === String(lead.fields.contactId)),
      company: ALL.find((item) => item.id === String(lead.fields.companyId)),
      activities: activitiesFor(ACTIVITIES, lead.id),
      now: NOW,
    });
    expect(score.total).toBe(score.factors.reduce((sum, factor) => sum + factor.points, 0));
    expect(score.factors.map((factor) => factor.label)).toEqual(["Deal size", "Source", "Consent", "Account", "Engagement", "Recency"]);
    expect(score.factors.every((factor) => factor.detail.length > 0)).toBe(true);
    expect(score.band).toBe("hot");
  });

  it("gives a bare lead no points it has not earned", () => {
    const bare = LEADS.find((item) => item.title.includes("Anonymous"))!;
    const score = scoreLead(bare, { activities: [], now: NOW });
    expect(score.band).toBe("cold");
    expect(score.factors.find((factor) => factor.label === "Consent")?.points).toBe(0);
    expect(score.factors.find((factor) => factor.label === "Deal size")?.points).toBe(0);
    expect(score.total).toBeLessThan(40);
  });
});

describe("consent and suppression survive in the fixtures", () => {
  it("keeps a suppressed contact flagged and tagged", () => {
    const suppressed = CONTACTS.filter((contact) => contact.fields.suppressed === true);
    expect(suppressed.length).toBeGreaterThan(0);
    for (const contact of suppressed) {
      expect(contact.fields.consent).toBeUndefined();
      expect(contact.tags).toContain("suppressed");
    }
  });

  it("records a tax status on the customers that are invoiced, or none at all deliberately", () => {
    const invoiced = inOrg("invoices")
      .map((invoice) => String(invoice.fields.contactId ?? ""))
      .filter(Boolean);
    const missing = [...new Set(invoiced)].filter((id) => {
      const contact = CONTACTS.find((item) => item.id === id);
      // Only the fixtures this workstream added carry a deliberate tax status.
      return contact && !contact.fields.taxStatus && /-7\d\d$/.test(contact.id);
    });
    // Exactly one of them is left without a status, on purpose, to exercise the UNKNOWN path.
    expect(missing.length).toBe(1);
  });
});
