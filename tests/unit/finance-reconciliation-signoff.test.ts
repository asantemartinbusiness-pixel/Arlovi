import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { journalDate, reconcile } from "@/domain/fin-ledger";
import {
  validateBankReconciliation, reconciliationEvidence, reconciliationSignoffIsCurrent,
} from "@/domain/finance-signoff";

const org = "org-northline";
const when = "2026-11-14T10:00:00.000Z";
function rec(id:string, collection:string, fields:Rec["fields"], status="active", at=when):Rec {
  return {
    id, collection, organizationId:org, title:id, status, summary:"",
    ownerName:"Finance", currency:"GBP", tags:[], fields,
    at, amountMinor:5000, createdAt:at, updatedAt:at, revision:2,
    createdBy:"Finance",updatedBy:"Finance",history:[],
  };
}
const bank=rec("bank", "accounts", {code:"1000",type:"asset"});
const ar=rec("ar", "accounts", {code:"1100",type:"asset"});
const journal={
  ...rec("receipt-1","journals",{source:"payment",bankLineId:"line-1"},"posted"),
  body:{date:"2026-11-14",memo:"Customer receipt",lines:[
    {accountId:bank.id,debitMinor:5000,creditMinor:0},
    {accountId:ar.id,debitMinor:0,creditMinor:5000},
  ]},
};
const statement=rec("statement-1","bankTransactions",{
  kind:"statement",bankAccountCode:"1000",from:"2026-11-01",to:"2026-11-14",
  openingMinor:0,closingMinor:5000,importBatch:"batch-1",
},"imported");
const line=rec("line-1","bankTransactions",{
  bankAccountCode:"1000",source:"statement-import",importBatch:"batch-1",
  journalId:journal.id,matched:true,reference:"Customer receipt",
},"matched");
const records=[bank,ar,journal,statement,line];
const check=(rows=records) => validateBankReconciliation({
  organizationId:org,bankAccountCode:"1000",expectedStatementId:statement.id,
  records:rows,
});

describe("reconciliation signoff source evidence",()=>{
  it("requires an identified batch, exact two-way match and balanced closing amount",()=>{
    const {recon,evidence}=check();
    expect(recon.complete).toBe(true);
    expect(evidence.statementId).toBe(statement.id);
    expect(evidence.ledgerMinor).toBe(5000);
    expect(evidence.lineRevisions).toEqual({[line.id]:line.revision});
    expect(evidence.journalRevisions).toEqual({[journal.id]:journal.revision});
  });
  it("rejects a one-sided match or a foreign journal instead of claiming external confirmation",()=>{
    expect(()=>check(records.map(row=>row.id===journal.id
      ? {...journal,fields:{source:"payment"}}:row))).toThrow(/reciprocal/);
    expect(()=>check(records.map(row=>row.id===journal.id
      ? {...journal,organizationId:"org-harbor"}:row))).toThrow(/reciprocal/);
  });
  it("rejects duplicate confirmations of the same statement",()=>{
    const confirmation=rec("confirmation-1","bankTransactions",{kind:"reconciliation",statementId:statement.id},"confirmed");
    expect(()=>check([...records,confirmation])).toThrow(/already been signed off/);
  });
  it("rejects open lines and a different current statement",()=>{
    expect(()=>check(records.map(row=>row.id===line.id
      ? {...line,status:"unmatched",fields:{...line.fields,matched:false}}:row))).toThrow(/open|unexplained/);
    const newer=rec("statement-2","bankTransactions",{
      kind:"statement",bankAccountCode:"1000",importBatch:"batch-2",
      openingMinor:5000,closingMinor:5000,from:"2026-11-15",to:"2026-11-16",
    },"imported","2026-11-16T09:30:00.000Z");
    expect(()=>check([...records,newer])).toThrow(/different bank statement/);
  });
  it("does not include postings dated after statement end in historical closing balance",()=>{
    const later={...journal,id:"later-1",revision:1,
      fields:{source:"payment"},body:{date:"2026-12-01",memo:"Later receipt",lines:[
        {accountId:bank.id,debitMinor:2000,creditMinor:0},
        {accountId:ar.id,debitMinor:0,creditMinor:2000},
      ]}};
    expect(journalDate(later)).toBe("2026-12-01");
    expect(check([...records,later]).evidence.ledgerMinor).toBe(5000);
  });
  it("shows a saved signoff as superseded after relevant journal or statement revision changes",()=>{
    const evidence=reconciliationEvidence(reconcile({
      accounts:[bank,ar],journals:[journal],lines:[statement,line],bankAccountCode:"1000",
    }),[journal])!;
    const confirmation={...rec("confirmation-1","bankTransactions",{kind:"reconciliation",statementId:statement.id},"confirmed"),
      body:{evidence}};
    expect(reconciliationSignoffIsCurrent(confirmation,evidence)).toBe(true);
    expect(reconciliationSignoffIsCurrent(confirmation,{
      ...evidence,journalRevisions:{[journal.id]:journal.revision+1},
    })).toBe(false);
    expect(reconciliationSignoffIsCurrent(confirmation,{
      ...evidence,statementRevision:statement.revision+1,
    })).toBe(false);
  });
});
