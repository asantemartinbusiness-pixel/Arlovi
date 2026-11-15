import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { ORG_NORTHLINE, SEED_NOW } from "../../src/domain/types";
import { cashBalance, journalLines } from "../../src/domain/fin-ledger";

const base = buildSeed();
const extra = collectSeeds(SEED_NOW);
const seen = new Set(base.records.map((r) => r.id));
const all = [...base.records, ...extra.records.filter((r) => !seen.has(r.id))];
const nl = all.filter((r) => r.organizationId === ORG_NORTHLINE);
const accounts = nl.filter((r) => r.collection === "accounts");
const journals = nl.filter((r) => r.collection === "journals");
const lines = nl.filter((r) => r.collection === "bankTransactions");

describe("probe", () => {
  it("prints balances", () => {
    const current = accounts.find((a) => a.fields.code === "1000")!;
    let ledger = 0;
    for (const j of journals) {
      if (j.status !== "posted") continue;
      for (const l of journalLines(j)) if (l.accountId === current.id) ledger += l.debitMinor - l.creditMinor;
    }
    const statement = lines.find((l) => l.fields.kind === "statement")!;
    const closing = Number(statement.fields.closingMinor);
    const unmatched = lines.filter((l) => l.fields.kind !== "statement" && l.fields.matched !== true);
    // lines with a candidate journal on the cash account at the same amount
    const needsPosting = unmatched.filter((line) => {
      const amount = Number(line.amountMinor);
      return !journals.some((j) => j.status === "posted" && !j.fields.bankLineId
        && journalLines(j).some((l) => l.accountId === current.id && l.debitMinor - l.creditMinor === amount));
    });
    const sumNeeds = needsPosting.reduce((s, l) => s + Number(l.amountMinor), 0);
    console.log({ ledger, closing, difference: closing - ledger, sumNeeds, unexplained: (closing - ledger) - sumNeeds,
      unmatched: unmatched.map((l) => [l.id, l.amountMinor]), needsPosting: needsPosting.map((l) => l.id),
      cash: cashBalance(accounts, journals) });
    expect(true).toBe(true);
  });
});
