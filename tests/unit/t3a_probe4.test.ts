import { describe, expect, it } from "vitest";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { SEED_NOW } from "../../src/domain/types";
const mods = import.meta.glob("../../src/domain/seeds/*.ts", { eager: true });

describe("probe4", () => {
  it("cross-team dupes", () => {
    void mods;
    const base = buildSeed();
    const extra = collectSeeds(SEED_NOW);
    const seen = new Set(base.records.map((r) => r.id));
    const kept = extra.records.filter((r) => !seen.has(r.id));
    const counts = new Map<string, number>();
    for (const r of kept) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    console.log("total extras", kept.length, "dupe ids", dupes.length);
    console.log(dupes.join("\n"));
    expect(true).toBe(true);
  });
});
