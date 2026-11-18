import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { ORG_NORTHLINE, SEED_NOW } from "../../src/domain/types";
import type { Rec } from "../../src/domain/types";
import {
  accountMovements, budgetVariance, reconcile, trialForRange, unbudgetedActuals, variancePercent,
} from "../../src/domain/fin-ledger";
import { accountProfile, dealChain } from "../../src/applications/crm/accountProfile";
import { bucketIndex, collectionsWorklist, invoiceBalance, promiseOf } from "../../src/applications/fin/collections";

/* W2A: Finance and CRM depth — reconciliation book balance, variance drilldown,
 * collections worklist and the CRM account profile. */

const base = buildSeed();
const extra = collectSeeds(SEED_NOW);
const seen = new Set(base.records.map((record) => record.id));
const ALL: Rec[] = [...base.records, ...extra.records.filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))];
const inOrg = (collection: string) => ALL.filter((record) => record.organizationId === ORG_NORTHLINE && record.collection === collection);

const ACCOUNTS = inOrg("accounts");
const JOURNALS = inOrg("journals");
const INVOICES = inOrg("invoices");
const NOW = new Date("2026-11-14T09:30:00Z");

function withJournal(date: string, amountMinor: number): Rec[] {
  const bank = ACCOUNTS.find((item) => String(item.fields.code) === "1000")!;
  const ar = ACCOUNTS.find((item) => String(item.fields.code) === "1100")!;
  const template = JOURNALS.find((journal) => journal.status === "posted")!;
  return [...JOURNALS, {
    ...template, id: "test-receipt", title: "Receipt after statement", at: `${date}T10:00:00Z`,
    fields: { ...template.fields, date, bankLineId: "" },
    body: { lines: [
      { accountId: bank.id, debitMinor: amountMinor, creditMinor: 0, memo: "Receipt" },
      { accountId: ar.id, debitMinor: 0, creditMinor: amountMinor, memo: "Receipt" },
    ] },
  }];
}

describe("reconciliation: ledger to date against ledger at the statement end", () => {
  it("counts a posting after the statement in the book balance only, and lists it", () => {
    const before = reconcile({ accounts: ACCOUNTS, journals: JOURNALS, lines: inOrg("bankTransactions"), bankAccountCode: "1000" });
    expect(before.statement?.to).toBe("2026-11-13");
    const after = reconcile({ accounts: ACCOUNTS, journals: withJournal("2026-11-14", 1_245_600), lines: inOrg("bankTransactions"), bankAccountCode: "1000" });
    expect(after.bookBalanceMinor).toBe(before.bookBalanceMinor + 1_245_600);
    expect(after.ledgerMinor).toBe(before.ledgerMinor);
    expect(after.differenceMinor).toBe(before.differenceMinor);
    expect(after.postedAfterStatement.map((item) => item.journal.id)).toContain("test-receipt");
    expect(after.postedAfterStatement.find((item) => item.journal.id === "test-receipt")?.amountMinor).toBe(1_245_600);
    // Book balance = as-at balance + everything posted after the statement.
    expect(after.bookBalanceMinor).toBe(after.ledgerMinor + after.postedAfterStatement.reduce((sum, item) => sum + item.amountMinor, 0));
  });

  it("counts a posting on or before the statement end in both", () => {
    const before = reconcile({ accounts: ACCOUNTS, journals: JOURNALS, lines: inOrg("bankTransactions"), bankAccountCode: "1000" });
    const after = reconcile({ accounts: ACCOUNTS, journals: withJournal("2026-11-13", 5_000), lines: inOrg("bankTransactions"), bankAccountCode: "1000" });
    expect(after.ledgerMinor).toBe(before.ledgerMinor + 5_000);
    expect(after.bookBalanceMinor).toBe(before.bookBalanceMinor + 5_000);
  });
});

describe("budget variance drilldown", () => {
  const approved = inOrg("budgets").filter((budget) => budget.fields.kind === "budget" && budget.status === "approved" && budget.fields.period === "2026-11");
  const november = trialForRange(ACCOUNTS, JOURNALS, ORG_NORTHLINE, { period: "2026-11" });

  it("explains every line's actual to the penny with its posted journal lines", () => {
    for (const row of budgetVariance(approved, november.rows, ACCOUNTS)) {
      const lines = accountMovements(ACCOUNTS, JOURNALS, row.accountCode, "2026-11");
      expect(lines.reduce((sum, line) => sum + line.netMinor, 0)).toBe(row.actualMinor);
      expect(lines.every((line) => line.journal.status === "posted")).toBe(true);
    }
  });

  it("states variance as a percentage of budget, and nothing when unbudgeted", () => {
    const rows = budgetVariance(approved, november.rows, ACCOUNTS);
    const rent = rows.find((row) => row.accountCode === "6100")!;
    expect(variancePercent(rent)).toBe(Math.round((rent.varianceMinor / rent.budgetMinor) * 100));
    expect(variancePercent({ ...rent, budgetMinor: 0 })).toBeUndefined();
  });

  it("lists revenue and expense accounts that moved with no budget line", () => {
    const missing = unbudgetedActuals(approved, november.rows);
    const budgeted = new Set(approved.map((budget) => String(budget.fields.accountCode)));
    expect(missing.length).toBeGreaterThan(0);
    for (const row of missing) {
      expect(budgeted.has(row.code)).toBe(false);
      expect(["revenue", "expense"]).toContain(row.type);
    }
  });
});

describe("collections worklist", () => {
  const contacts = inOrg("contacts");

  it("groups open balances by customer and ties to the receivable", () => {
    const rows = collectionsWorklist(INVOICES, contacts, NOW);
    const receivable = INVOICES.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0);
    expect(rows.reduce((sum, row) => sum + row.outstandingMinor, 0)).toBe(receivable);
    for (const row of rows) expect(row.bucketsMinor.reduce((a, b) => a + b, 0)).toBe(row.outstandingMinor);
    // Worst first.
    for (let i = 1; i < rows.length; i += 1) expect(rows[i - 1].overdueMinor).toBeGreaterThanOrEqual(rows[i].overdueMinor);
  });

  it("chases a part-paid invoice for its balance only", () => {
    const part = INVOICES.find((invoice) => invoice.status === "part_paid" || (["awaiting_payment"].includes(invoice.status) && Number(invoice.fields.paidMinor ?? 0) > 0));
    if (!part) return;
    expect(invoiceBalance(part)).toBe(Number(part.amountMinor) - Number(part.fields.paidMinor));
  });

  it("flags a promise as broken once its date passes with money still owed", () => {
    const late = INVOICES.find((invoice) => invoiceBalance(invoice) > 0)!;
    const kept = { ...late, fields: { ...late.fields, promiseDate: "2026-11-20", promiseMinor: 1000, promiseBy: "Maya Chen" } };
    const broken = { ...late, fields: { ...late.fields, promiseDate: "2026-11-10" } };
    expect(promiseOf(kept, NOW)?.broken).toBe(false);
    expect(promiseOf(broken, NOW)?.broken).toBe(true);
    const rows = collectionsWorklist([broken], contacts, NOW);
    expect(rows[0].nextAction).toMatch(/Promise broken/);
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(31)).toBe(2);
    expect(bucketIndex(120)).toBe(4);
  });
});

describe("CRM account profile", () => {
  const input = {
    contacts: inOrg("contacts"), deals: inOrg("deals"), leads: inOrg("leads"), quotes: inOrg("quotes"),
    invoices: INVOICES, activities: inOrg("activities"), now: NOW,
  };
  const pike = inOrg("companies").find((company) => company.id === "nl-companies-723")!;

  it("collects the account's people, deals, quotes and invoices", () => {
    const profile = accountProfile({ company: pike, ...input });
    expect(profile.contacts.map((contact) => contact.title)).toContain("Marcus Pike");
    expect(profile.deals.map((deal) => deal.id)).toContain("nl-deals-721");
    expect(profile.quotes.some((quote) => quote.title.includes("Q-126"))).toBe(true);
    expect(profile.openMinor).toBe(profile.openDeals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0));
    expect(profile.outstandingMinor).toBe(profile.invoices.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0));
    expect(profile.risks.some((risk) => risk.startsWith("Single-threaded"))).toBe(true);
    // Timeline is newest first.
    for (let i = 1; i < profile.timeline.length; i += 1) expect(profile.timeline[i - 1].at >= profile.timeline[i].at).toBe(true);
  });

  it("walks a deal from quote to paid invoice", () => {
    const deal = input.deals.find((item) => item.id === "nl-deals-721")!;
    const quote = { ...input.quotes.find((item) => item.title.includes("Q-126"))!, status: "accepted" };
    const draft = { ...INVOICES[0], id: "inv-x", status: "draft", fields: { dealId: deal.id } };
    expect(dealChain(deal, [quote], [], []).step).toBe("accepted");
    expect(dealChain(deal, [quote], [draft], []).next).toMatch(/draft invoice/);
    const issued = { ...draft, status: "awaiting_payment" };
    expect(dealChain(deal, [quote], [issued], []).step).toBe("invoiced");
    expect(dealChain(deal, [quote], [{ ...draft, status: "paid" }], []).step).toBe("paid");
    expect(dealChain(deal, [quote], [{ ...draft, status: "void" }], []).step).toBe("accepted");
  });
});
