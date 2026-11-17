import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { isStatementLine } from "@/domain/fin-ledger";
import { prepareStatementMatch, prepareStatementUnmatch } from "@/applications/fin/reconciliationLinks";

const now = new Date("2026-11-14T09:30:00.000Z");
function rec(id: string, collection: string, status: string, fields: Rec["fields"], org="org-northline"): Rec {
  return {
    id, collection, organizationId:org, status, fields,
    title:id, summary:"", amountMinor:5000, ownerName:"Finance",
    currency:"GBP", tags:[], at:now.toISOString(), revision:4,
    createdAt:now.toISOString(), updatedAt:now.toISOString(),
    createdBy:"Maya", updatedBy:"Maya", history:[],
  };
}
const line = rec("line-1","bankTransactions","unmatched",{
  source:"statement-import",bankAccountCode:"1000",matched:false,reference:"Receipt invoice-1",
});
const journal = {
  ...rec("journal-1","journals","posted",{source:"payment",invoiceId:"invoice-1"}),
  body:{date:"2026-11-14",memo:"Receipt invoice-1",lines:[
    {accountId:"bank-account",debitMinor:5000,creditMinor:0},
    {accountId:"receivables-account",debitMinor:0,creditMinor:5000},
  ]},
};

describe("manual reconciliation has a two-sided, revision-checked link", () => {
  const args={line,journal,bankAccountId:"bank-account",actor:"Maya",now};
  it("matches only exact posted bank movement without creating a journal", () => {
    const result=prepareStatementMatch(args);
    expect(result.blocked).toBeUndefined();
    const prepared=result.prepared!;
    expect(prepared.records).toHaveLength(2);
    expect(prepared.records[0].status).toBe("matched");
    expect(prepared.records[0].fields.journalId).toBe(journal.id);
    expect(prepared.records[1].fields.bankLineId).toBe(line.id);
    expect(prepared.records[1].status).toBe("posted");
    expect(prepared.expectedRevisions).toEqual({[line.id]:4,[journal.id]:4});
    expect(prepared.records[0].revision).toBe(5);
    expect(prepared.records[1].revision).toBe(5);
    expect(line.status).toBe("unmatched");
  });
  it("blocks foreign company journals, incomplete or already-matched statements", () => {
    expect(prepareStatementMatch({...args,journal:{...journal,organizationId:"org-harbor"}}).blocked)
      .toMatch(/company/);
    expect(prepareStatementMatch({...args,line:{...line,fields:{...line.fields,matched:true}}}).blocked)
      .toMatch(/unmatched/);
    expect(prepareStatementMatch({...args,journal:{...journal,status:"draft"}}).blocked)
      .toMatch(/posted/);
    expect(prepareStatementMatch({...args,journal:{...journal,fields:{...journal.fields,bankLineId:"other"}}}).blocked)
      .toMatch(/already linked/);
  });
  it("does not match approximate amounts or the wrong bank account", () => {
    expect(prepareStatementMatch({...args,line:{...line,amountMinor:4900}}).blocked)
      .toMatch(/exact/);
    expect(prepareStatementMatch({...args,bankAccountId:"other-account"}).blocked)
      .toMatch(/exact/);
  });
  it("unmatches both sides while preserving the posted journal and its original lines", () => {
    const [matchedLine,matchedJournal] = prepareStatementMatch(args).prepared!.records;
    const reverted=prepareStatementUnmatch({
      line:matchedLine,journal:matchedJournal,actor:"Maya",now,
    }).prepared!;
    expect(reverted.records[0].status).toBe("unmatched");
    expect(reverted.records[0].fields.matched).toBe(false);
    expect(reverted.records[0].fields.journalId).toBeUndefined();
    expect(reverted.records[1].fields.bankLineId).toBeUndefined();
    expect(reverted.records[1].body).toEqual(journal.body);
    expect(reverted.records[1].status).toBe("posted");
    expect(reverted.expectedRevisions).toEqual({[line.id]:5,[journal.id]:5});
  });
  it("refuses stale or one-sided links instead of silently clearing the wrong journal", () => {
    const [matchedLine,matchedJournal]=prepareStatementMatch(args).prepared!.records;
    expect(prepareStatementUnmatch({line:matchedLine,journal:undefined,actor:"Maya",now}).blocked)
      .toMatch(/verified/);
    expect(prepareStatementUnmatch({
      line:matchedLine,journal:{...matchedJournal,fields:{bankLineId:"another-statement"}},actor:"Maya",now,
    }).blocked).toMatch(/no longer linked/);
    // A legacy one-sided line may be unlinked so its reciprocal link can be
    // safely repaired, but a journal owned by another line is never cleared.
    expect(prepareStatementUnmatch({
      line:matchedLine,journal:{...matchedJournal,fields:{}},actor:"Maya",now,
    }).prepared?.records[0].status).toBe("unmatched");
  });
  it("does not mistake a confirmed reconciliation summary for an unmatched statement line", () => {
    expect(isStatementLine(rec("confirmation-1","bankTransactions","confirmed",{kind:"reconciliation"})))
      .toBe(false);
    expect(isStatementLine(rec("statement-1","bankTransactions","imported",{kind:"statement"})))
      .toBe(false);
    expect(isStatementLine(line)).toBe(true);
  });
});
