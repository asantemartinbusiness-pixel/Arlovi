import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { statements } from "../../src/domain/finance";
import { ORG_HARBOR, ORG_NORTHLINE, SEED_NOW } from "../../src/domain/types";
import { imbalance, journalLines } from "../../src/domain/fin-ledger";

const base = buildSeed();
const extra = collectSeeds(SEED_NOW);
const seen = new Set(base.records.map((r) => r.id));
const all = [...base.records, ...extra.records.filter((r) => !seen.has(r.id))];

describe("t3a fixtures", () => {
  it("every posted journal balances", () => {
    const bad = all.filter((r) => r.collection === "journals" && r.status === "posted" && imbalance(journalLines(r)) !== 0);
    expect(bad.map((r) => r.id)).toEqual([]);
  });
  it("both ledgers balance with the contributed fixtures", () => {
    for (const org of [ORG_NORTHLINE, ORG_HARBOR]) {
      const report = statements(all, org);
      expect([org, report.booksBalance, report.equationHolds]).toEqual([org, true, true]);
    }
  });
  it("journal lines point at real accounts", () => {
    const ids = new Set(all.filter((r) => r.collection === "accounts").map((r) => r.id));
    const bad: string[] = [];
    for (const j of all.filter((r) => r.collection === "journals")) {
      for (const line of journalLines(j)) if (!ids.has(line.accountId)) bad.push(`${j.id}:${line.accountId}`);
    }
    expect(bad).toEqual([]);
  });
});
