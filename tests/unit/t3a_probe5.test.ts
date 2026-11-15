import { describe, expect, it } from "vitest";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { SEED_NOW } from "../../src/domain/types";
const mods = import.meta.glob("../../src/domain/seeds/*.ts", { eager: true });
describe("probe5", () => {
  it("max suffix per collection", () => {
    void mods;
    const extra = collectSeeds(SEED_NOW);
    const max = new Map<string, number>();
    for (const r of extra.records) {
      const m = /-(\d+)$/.exec(r.id);
      const n = m ? Number(m[1]) : 0;
      max.set(r.collection, Math.max(max.get(r.collection) ?? 0, n));
    }
    const interesting = ["accounts","journals","invoices","suppliers","bills","expenses","bankTransactions","budgets","taxCodes","legalEntities","preferences","companies","contacts","deals","quotes","activities","leads","workflows","workflowRuns","templates"];
    console.log(interesting.map((c) => `${c}: ${max.get(c) ?? 0}`).join("\n"));
    console.log("GLOBAL MAX", Math.max(...[...max.values()]));
    expect(true).toBe(true);
  });
});
