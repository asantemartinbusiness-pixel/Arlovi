import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { ORG_HARBOR, ORG_NORTHLINE, SEED_NOW } from "../../src/domain/types";
import type { Rec } from "../../src/domain/types";
import { statements } from "../../src/domain/finance";
import {
  ageBuckets, balanceSheet, budgetVariance, cashBalance, cashFlow, checkPosting, consolidate, imbalance,
  journalLines, profitAndLoss, reconcile, reversalLines, trial, trialForRange,
} from "../../src/domain/fin-ledger";
import type { JLine } from "../../src/domain/fin-ledger";

/* ------------------------------------------------------------------ *
 * Double entry: the posting gate, reversal, and the statements derived
 * from posted journals alone.
 * ------------------------------------------------------------------ */

const base = buildSeed();
const extra = collectSeeds(SEED_NOW);
const seen = new Set(base.records.map((record) => record.id));
const ALL: Rec[] = [...base.records, ...extra.records.filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))];

function inOrg(orgId: string, collection: string): Rec[] {
  return ALL.filter((record) => record.organizationId === orgId && record.collection === collection);
}

const NL_ACCOUNTS = inOrg(ORG_NORTHLINE, "accounts");
const NL_JOURNALS = inOrg(ORG_NORTHLINE, "journals");
const NL_INVOICES = inOrg(ORG_NORTHLINE, "invoices");
const NL_BANK = inOrg(ORG_NORTHLINE, "bankTransactions");
const NL_BUDGETS = inOrg(ORG_NORTHLINE, "budgets");
const NOW = new Date(SEED_NOW);

function account(code: string): string {
  return NL_ACCOUNTS.find((item) => String(item.fields.code) === code)!.id;
}

describe("journal balance enforcement", () => {
  const openPeriod = { period: "2026-11", locked: ["2026-09"], accounts: NL_ACCOUNTS };

  it("accepts a balanced two-sided journal in an open period", () => {
    const lines: JLine[] = [
      { accountId: account("6100"), debitMinor: 250_000, creditMinor: 0 },
      { accountId: account("2000"), debitMinor: 0, creditMinor: 250_000 },
    ];
    const check = checkPosting({ lines, ...openPeriod });
    expect(check.reason).toBeUndefined();
    expect([check.debitMinor, check.creditMinor, check.differenceMinor]).toEqual([250_000, 250_000, 0]);
    expect(check.balanced).toBe(true);
  });

  it("refuses an unbalanced journal and says by how much", () => {
    const check = checkPosting({
      lines: [
        { accountId: account("6100"), debitMinor: 250_000, creditMinor: 0 },
        { accountId: account("2000"), debitMinor: 0, creditMinor: 240_000 },
      ],
      ...openPeriod,
    });
    expect(check.balanced).toBe(false);
    expect(check.differenceMinor).toBe(10_000);
    expect(check.reason).toMatch(/differ by 100\.00/);
  });

  it("refuses a line that carries both sides, no side, or a fraction of a penny", () => {
    const both = checkPosting({ lines: [{ accountId: account("1000"), debitMinor: 100, creditMinor: 100 }, { accountId: account("2000"), debitMinor: 0, creditMinor: 100 }], ...openPeriod });
    const neither = checkPosting({ lines: [{ accountId: account("1000"), debitMinor: 0, creditMinor: 0 }, { accountId: account("2000"), debitMinor: 0, creditMinor: 100 }], ...openPeriod });
    const fraction = checkPosting({ lines: [{ accountId: account("1000"), debitMinor: 100.5, creditMinor: 0 }, { accountId: account("2000"), debitMinor: 0, creditMinor: 100.5 }], ...openPeriod });
    for (const check of [both, neither, fraction]) {
      expect(check.differenceMinor).toBeNull();
      expect(check.reason).toMatch(/one side only/);
    }
  });

  it("refuses a single-line journal, an unknown account and a deactivated account", () => {
    expect(checkPosting({ lines: [{ accountId: account("1000"), debitMinor: 100, creditMinor: 0 }], ...openPeriod }).reason).toMatch(/two lines/);
    expect(checkPosting({
      lines: [{ accountId: "nl-accounts-999", debitMinor: 100, creditMinor: 0 }, { accountId: account("2000"), debitMinor: 0, creditMinor: 100 }],
      ...openPeriod,
    }).reason).toMatch(/not in this chart of accounts/);
    expect(checkPosting({
      lines: [{ accountId: account("6800"), debitMinor: 100, creditMinor: 0 }, { accountId: account("2000"), debitMinor: 0, creditMinor: 100 }],
      ...openPeriod,
    }).reason).toMatch(/deactivated/);
  });

  it("refuses a balanced journal dated in a closed period", () => {
    const check = checkPosting({
      lines: [
        { accountId: account("6100"), debitMinor: 1_000, creditMinor: 0 },
        { accountId: account("2000"), debitMinor: 0, creditMinor: 1_000 },
      ],
      period: "2026-09",
      locked: ["2026-09"],
      accounts: NL_ACCOUNTS,
    });
    expect(check.balanced).toBe(true);
    expect(check.reason).toMatch(/closed/);
  });

  it("builds a reversal that exactly offsets the original", () => {
    const original = NL_JOURNALS.find((journal) => journal.status === "posted" && journalLines(journal).length >= 3)!;
    const reversed = reversalLines(original);
    const originalLines = journalLines(original);
    expect(reversed).toHaveLength(originalLines.length);
    for (let index = 0; index < reversed.length; index += 1) {
      expect(reversed[index].debitMinor).toBe(originalLines[index].creditMinor);
      expect(reversed[index].creditMinor).toBe(originalLines[index].debitMinor);
    }
    expect(imbalance(reversed)).toBe(0);
    const combined = [...originalLines, ...reversed];
    expect(combined.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0)).toBe(0);
  });

  it("holds every posted fixture journal to the same rule", () => {
    const unbalanced = ALL
      .filter((record) => record.collection === "journals" && record.status === "posted")
      .filter((journal) => imbalance(journalLines(journal)) !== 0)
      .map((journal) => journal.id);
    expect(unbalanced).toEqual([]);
  });

  it("keeps a deliberately unpostable draft out of the statements", () => {
    const draft = NL_JOURNALS.find((journal) => journal.status === "draft" && imbalance(journalLines(journal)) !== 0);
    expect(draft).toBeDefined();
    const withDraft = trial(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE);
    const withoutDraft = trial(NL_ACCOUNTS, NL_JOURNALS.filter((journal) => journal.id !== draft!.id), ORG_NORTHLINE);
    expect(withDraft.debit).toBe(withoutDraft.debit);
    expect(withDraft.credit).toBe(withoutDraft.credit);
  });
});

describe("profit and loss, balance sheet and cash flow from posted journals", () => {
  const tb = trial(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE);

  it("ties the trial balance", () => {
    expect(tb.debit).toBe(tb.credit);
    expect(tb.debit).toBeGreaterThan(0);
  });

  it("derives a profit and loss that reconciles to its own lines", () => {
    const pl = profitAndLoss(tb.rows);
    expect(pl.revenueMinor).toBe(pl.revenue.reduce((sum, line) => sum + line.amountMinor, 0));
    expect(pl.expenseMinor).toBe(pl.expense.reduce((sum, line) => sum + line.amountMinor, 0));
    expect(pl.netMinor).toBe(pl.revenueMinor - pl.expenseMinor);
    expect(pl.grossMarginMinor).toBe(pl.revenueMinor - pl.costOfSalesMinor);
    expect(pl.costOfSalesMinor).toBe(pl.expense.filter((line) => line.code.startsWith("5")).reduce((sum, line) => sum + line.amountMinor, 0));
    expect(pl.revenueMinor).toBeGreaterThan(0);
  });

  it("derives a balance sheet that satisfies the accounting equation", () => {
    const bs = balanceSheet(tb.rows);
    expect(bs.differenceMinor).toBe(0);
    expect(bs.assetsMinor).toBe(bs.liabilitiesMinor + bs.equityMinor + bs.retainedMinor);
    expect(bs.retainedMinor).toBe(profitAndLoss(tb.rows).netMinor);
    const report = statements(ALL, ORG_NORTHLINE);
    expect([report.booksBalance, report.equationHolds]).toEqual([true, true]);
  });

  it("holds the equation in the second organisation too", () => {
    const report = statements(ALL, ORG_HARBOR);
    expect([report.booksBalance, report.equationHolds]).toEqual([true, true]);
    const harbor = balanceSheet(trial(inOrg(ORG_HARBOR, "accounts"), inOrg(ORG_HARBOR, "journals"), ORG_HARBOR).rows);
    expect(harbor.differenceMinor).toBe(0);
  });

  it("excludes draft journals from every statement", () => {
    const drafts = NL_JOURNALS.filter((journal) => journal.status === "draft");
    expect(drafts.length).toBeGreaterThan(0);
    const posted = NL_JOURNALS.filter((journal) => journal.status === "posted");
    const all = trial(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE);
    const only = trial(NL_ACCOUNTS, posted, ORG_NORTHLINE);
    expect(all.rows.map((row) => row.balanceMinor)).toEqual(only.rows.map((row) => row.balanceMinor));
  });

  it("scopes a period profit and loss to journals dated inside it", () => {
    const november = trialForRange(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE, { period: "2026-11" });
    const october = trialForRange(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE, { period: "2026-10" });
    const cumulative = profitAndLoss(tb.rows);
    expect(november.journalCount).toBeGreaterThan(0);
    expect(october.journalCount).toBeGreaterThan(0);
    const monthly = profitAndLoss(november.rows).revenueMinor + profitAndLoss(october.rows).revenueMinor;
    expect(monthly).toBeLessThanOrEqual(cumulative.revenueMinor);
  });

  it("builds a cash flow whose movement equals the cash balance change", () => {
    const flow = cashFlow(NL_ACCOUNTS, NL_JOURNALS);
    const balance = cashBalance(NL_ACCOUNTS, NL_JOURNALS);
    expect(flow.closingMinor).toBe(balance.amountMinor);
    expect(flow.movementMinor).toBe(flow.closingMinor - flow.openingMinor);
    expect(flow.operatingMinor + flow.investingMinor + flow.financingMinor).toBe(flow.movementMinor);
    expect(flow.cashAccountIds.length).toBeGreaterThan(1);
  });

  it("classifies equity and loan movement as financing and fixed assets as investing", () => {
    const flow = cashFlow(NL_ACCOUNTS, NL_JOURNALS);
    expect(flow.financingMinor).not.toBe(0);
    expect(flow.investingMinor).toBeLessThan(0);
  });
});

describe("ageing, budget variance and consolidation", () => {
  it("buckets open invoices by days past due", () => {
    const open = NL_INVOICES.filter((invoice) => ["awaiting_payment", "part_paid"].includes(invoice.status));
    const buckets = ageBuckets(open, NOW);
    expect(buckets.map((bucket) => bucket.bucket)).toEqual(["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(open.length);
    expect(buckets.reduce((sum, bucket) => sum + bucket.amountMinor, 0))
      .toBe(open.reduce((sum, invoice) => sum + Number(invoice.amountMinor ?? 0), 0));
    expect(buckets.some((bucket) => bucket.bucket !== "Current" && bucket.count > 0)).toBe(true);
  });

  it("compares an approved budget against the posted actual for the same period", () => {
    const approved = NL_BUDGETS.filter((budget) => budget.fields.kind === "budget" && budget.status === "approved" && budget.fields.period === "2026-11");
    expect(approved.length).toBeGreaterThan(0);
    const november = trialForRange(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE, { period: "2026-11" });
    const rows = budgetVariance(approved, november.rows, NL_ACCOUNTS);
    for (const row of rows) {
      expect(row.varianceMinor).toBe(row.actualMinor - row.budgetMinor);
    }
    const wages = rows.find((row) => row.accountCode === "6300");
    // November wages are only a draft journal, so the actual is nil and the variance favourable.
    expect(wages?.hasActual).toBe(false);
    expect(wages?.favourable).toBe(true);
    const marketing = rows.find((row) => row.accountCode === "6000");
    expect(marketing?.hasActual).toBe(true);
  });

  it("does not use a draft budget for variance", () => {
    const drafts = NL_BUDGETS.filter((budget) => budget.status === "draft");
    expect(drafts.length).toBeGreaterThan(0);
    const november = trialForRange(NL_ACCOUNTS, NL_JOURNALS, ORG_NORTHLINE, { period: "2026-11" });
    const approvedOnly = budgetVariance(
      NL_BUDGETS.filter((budget) => budget.fields.kind === "budget" && budget.status === "approved" && budget.fields.period === "2026-11"),
      november.rows,
      NL_ACCOUNTS,
    );
    expect(approvedOnly.every((row) => row.period === "2026-11")).toBe(true);
  });

  it("consolidates each journal once and eliminates intercompany once", () => {
    const entities = inOrg(ORG_NORTHLINE, "legalEntities").filter((entity) => !entity.fields.kind);
    const result = consolidate(entities, NL_JOURNALS);
    const postedDebit = NL_JOURNALS
      .filter((journal) => journal.status === "posted")
      .reduce((sum, journal) => sum + journalLines(journal).reduce((inner, line) => inner + line.debitMinor, 0), 0);
    expect(result.groupDebitMinor).toBe(result.groupCreditMinor);
    expect(result.eliminatedJournalIds.length).toBeGreaterThan(0);
    expect(result.groupDebitMinor).toBe(postedDebit - result.eliminationMinor);
    const columnTotal = result.columns.reduce((sum, column) => sum + column.debitMinor, 0);
    expect(columnTotal).toBe(postedDebit);
  });
});

describe("bank reconciliation", () => {
  const recon = reconcile({ accounts: NL_ACCOUNTS, journals: NL_JOURNALS, lines: NL_BANK, bankAccountCode: "1000" });

  it("compares the imported statement against the posted ledger", () => {
    expect(recon.statement).toBeDefined();
    expect(recon.ledgerMinor).toBeGreaterThan(0);
    expect(recon.differenceMinor).toBe((recon.statementClosingMinor ?? 0) - recon.ledgerMinor);
  });

  it("shows unexplained movement when a statement is compared to ledger postings only through its closing date", () => {
    expect(recon.needsPosting.length).toBeGreaterThan(0);
    expect(recon.needsPostingMinor).toBe(recon.needsPosting.reduce((sum, line) => sum + Number(line.amountMinor ?? 0), 0));
    expect(recon.unexplainedMinor).toBe((recon.differenceMinor ?? 0) - recon.needsPostingMinor);
    // A later ledger posting must not silently make a historic statement tie.
    expect(recon.unexplainedMinor).not.toBe(0);
  });

  it("suggests an exact posted journal for a new, unmatched line in the same statement batch", () => {
    const bankAccountId = account("1000");
    const arAccountId = account("1100");
    const date = "2026-11-10";
    const syntheticJournal: Rec = {
      ...NL_JOURNALS[0], id: "qa-matched-journal", title: "QA exact bank receipt",
      status: "posted", at: `${date}T09:00:00.000Z`,
      fields: { source: "payment", date },
      body: { date, memo: "QA exact bank receipt", lines: [
        { accountId: bankAccountId, debitMinor: 7700, creditMinor: 0 },
        { accountId: arAccountId, debitMinor: 0, creditMinor: 7700 },
      ] },
    };
    const syntheticLine: Rec = {
      ...NL_BANK.find((line) => line.fields.source === "statement-import")!,
      id: "qa-unmatched-statement-line", title: "QA exact bank receipt", status: "unmatched",
      at: `${date}T00:00:00.000Z`, amountMinor: 7700,
      fields: {
        source: "statement-import", reference: "QA exact bank receipt",
        bankAccountCode: "1000", importBatch: String(recon.statement?.record.fields.importBatch ?? ""),
        matched: false,
      },
    };
    const withCandidate = reconcile({
      accounts: NL_ACCOUNTS,
      journals: [...NL_JOURNALS, syntheticJournal],
      lines: [...NL_BANK, syntheticLine],
      bankAccountCode: "1000",
    });
    const candidate = withCandidate.suggested.find((item) => item.line.id === syntheticLine.id);
    expect(candidate?.candidates[0].journal.id).toBe(syntheticJournal.id);
    expect(candidate?.candidates[0].confidence).toBeGreaterThanOrEqual(60);
    expect(candidate?.candidates[0].reason).toMatch(/Amount matches exactly/);
  });

  it("refuses to be confirmed while a line is open", () => {
    expect(recon.complete).toBe(false);
    expect(recon.blockedReason).toMatch(/difference|still open/);
  });

  it("never matches an approximate amount", () => {
    for (const entry of recon.suggested) {
      for (const candidate of entry.candidates) {
        const moved = journalLines(candidate.journal)
          .filter((line) => line.accountId === recon.bankAccountId)
          .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
        expect(moved).toBe(Number(entry.line.amountMinor ?? 0));
      }
    }
  });
});
