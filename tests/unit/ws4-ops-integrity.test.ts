import { describe, expect, it } from "vitest";
import "../../src/domain/seeds/crm";
import { buildSeed } from "../../src/domain/seed";
import { collectSeeds } from "../../src/domain/seedRegistry";
import { SEED_NOW, type Rec } from "../../src/domain/types";
import { freshEntryId, refundProblems } from "@/applications/commerce/fulfilment";
import { freshReturnId } from "@/applications/proc/performance";
import { collectionsWorklist, promiseOf } from "@/applications/fin/collections";
import { readGraph } from "@/applications/auto/engine";
import { validateWorkflow } from "@/applications/auto/validate";

/* Operations integrity: entry ids that cannot collide within a clock minute,
 * refunds only on approved returns, kept partial promises to pay, and the
 * seeded CRM automations validating against the records they watch. */

function rec(id: string, collection: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "northline", collection, status: "draft", fields, title: id, summary: "", ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", revision: 1, createdBy: "Team",
    updatedBy: "Team", tags: [], history: [], ...extra,
  } as Rec;
}

describe("entry ids", () => {
  it("never repeats across many entries made under one frozen clock", () => {
    const ids = new Set<string>();
    for (let index = 0; index < 500; index += 1) ids.add(freshEntryId("sh-", ids));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^sh-[0-9a-f]{12}$/);
    const returns = new Set<string>();
    for (let index = 0; index < 200; index += 1) returns.add(freshReturnId(returns));
    expect(returns.size).toBe(200);
  });

  it("skips an id the record already holds", () => {
    const sequence = ["aaaaaaaaaaaa", "aaaaaaaaaaaa", "bbbbbbbbbbbb"];
    let call = 0;
    const random = () => sequence[call++];
    expect(freshEntryId("rf-", ["rf-aaaaaaaaaaaa"], 12, random)).toBe("rf-bbbbbbbbbbbb");
    call = 0;
    expect(freshReturnId(["rt-aaaaaaaaaaaa"], random)).toBe("rt-bbbbbbbbbbbb");
    // A generator that only ever repeats a taken id fails loudly instead of reusing it.
    expect(() => freshEntryId("ADJ-", ["ADJ-ABCDEF"], 6, () => "ABCDEF12-0000")).toThrow(/free ADJ- id/);
  });
});

describe("refunds need an approved return", () => {
  it("refuses a refund on a return still in review and accepts approved or completed", () => {
    const base = rec("ret", "returns", {}, { amountMinor: 3000, body: { refunds: [] } });
    expect(refundProblems({ ...base, status: "in_review" }, 1000, "bank_transfer", "BACS-1")).toContain("Approve the return before recording a refund.");
    expect(refundProblems({ ...base, status: "requested" }, 1000, "bank_transfer", "BACS-1")).toContain("Approve the return before recording a refund.");
    expect(refundProblems({ ...base, status: "approved" }, 1000, "bank_transfer", "BACS-1")).toEqual([]);
    expect(refundProblems({ ...base, status: "completed" }, 1000, "bank_transfer", "BACS-1")).toEqual([]);
  });
});

describe("promises to pay", () => {
  const NOW = new Date("2026-11-14T09:30:00Z");
  const invoice = (paidMinor: number, promise: Rec["fields"]) => rec("inv", "invoices", { paidMinor, contactId: "c1", ...promise }, {
    status: "part_paid", amountMinor: 10_000, dueAt: "2026-10-01T00:00:00Z",
  });

  it("counts a partial promise as kept once the promised amount arrives", () => {
    const promise = { promiseDate: "2026-11-10", promiseMinor: 4_000, promiseBalanceMinor: 10_000 };
    const kept = promiseOf(invoice(4_000, promise), NOW)!;
    expect(kept.kept).toBe(true);
    expect(kept.broken).toBe(false);
    const short = promiseOf(invoice(3_000, promise), NOW)!;
    expect(short.kept).toBe(false);
    expect(short.broken).toBe(true);
    // A kept promise does not hold the chase on a stale date.
    const [row] = collectionsWorklist([invoice(4_000, promise)], [], NOW);
    expect(row.nextAction).not.toMatch(/Promise broken|Promised for/);
  });

  it("does not call a partial promise broken before its date", () => {
    const pending = promiseOf(invoice(0, { promiseDate: "2026-11-20", promiseMinor: 4_000, promiseBalanceMinor: 10_000 }), NOW)!;
    expect(pending.broken).toBe(false);
    expect(collectionsWorklist([invoice(0, { promiseDate: "2026-11-20", promiseMinor: 4_000, promiseBalanceMinor: 10_000 })], [], NOW)[0].nextAction).toMatch(/Promised for 2026-11-20/);
  });

  it("keeps the old rule for a promise recorded without the balance", () => {
    const legacy = promiseOf(invoice(4_000, { promiseDate: "2026-11-10", promiseMinor: 4_000 }), NOW)!;
    expect(legacy.broken).toBe(true);
    expect(legacy.kept).toBe(false);
  });
});

describe("seeded CRM automations", () => {
  const base = buildSeed();
  const extra = collectSeeds(SEED_NOW);
  const seen = new Set(base.records.map((record) => record.id));
  const all: Rec[] = [...base.records, ...extra.records.filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))];
  for (const id of ["nl-workflows-720", "nl-workflows-721"]) {
    it(`${id} validates against the records it watches`, () => {
      const workflow = all.find((record) => record.id === id)!;
      expect(workflow).toBeDefined();
      const org = all.filter((record) => record.organizationId === workflow.organizationId);
      const errors = validateWorkflow(readGraph(workflow), org).filter((issue) => issue.severity === "error");
      expect(errors).toEqual([]);
      expect(JSON.stringify(workflow.body)).not.toContain("amountMinor");
    });
  }
});
