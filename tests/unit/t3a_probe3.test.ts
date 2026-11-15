import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/fin";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { SEED_NOW } from "../../src/domain/types";

describe("probe3", () => {
  it("no duplicate ids", () => {
    const base = buildSeed();
    const extra = collectSeeds(SEED_NOW);
    const seen = new Set(base.records.map((r) => r.id));
    const kept = extra.records.filter((r) => !seen.has(r.id));
    const counts = new Map<string, number>();
    for (const r of [...base.records, ...kept]) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    console.log("total", base.records.length + kept.length, "dupes", dupes.length, dupes.slice(0, 10));
    const baseDupes = [...base.records.reduce((m, r) => m.set(r.id, (m.get(r.id) ?? 0) + 1), new Map<string, number>()).entries()].filter(([, n]) => n > 1);
    console.log("baseDupes", baseDupes.length, baseDupes.slice(0, 5));
    expect(dupes.length).toBe(0);
  });
});
