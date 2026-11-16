import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  balanceSheet, profitAndLoss, trialForRange,
  type BalanceSheet, type CashFlow, type TrialRow,
} from "@/domain/fin-ledger";
import { statementCsv } from "@/applications/fin/statementExport";

const row=(code:string,name:string,type:TrialRow["type"],amountMinor:number):TrialRow => ({
  accountId:code,code,name,type,
  debitMinor:type==="asset"||type==="expense"?amountMinor:0,
  creditMinor:type==="revenue"||type==="liability"?amountMinor:0,
  balanceMinor:amountMinor,
});
const trialRows=[
  row("1000","Bank","asset",30000),
  row("1100","Receivables","asset",10000),
  row("4000","Revenue","revenue",35000),
  row("6000","Expenses","expense",5000),
];
const pl=profitAndLoss(trialRows);
const bs=balanceSheet(trialRows);
const flow:CashFlow={
  openingMinor:10000,closingMinor:30000,movementMinor:20000,
  operatingMinor:20000,investingMinor:0,financingMinor:0,
  cashAccountIds:["1000"],rows:[{activity:"operating",label:"4000 Revenue",amountMinor:20000}],
};
const invoice={
  id:"inv-1",collection:"invoices",organizationId:"org-northline",
  title:"INV-1",status:"part_paid",dueAt:"2026-11-20",
  amountMinor:12000,fields:{paidMinor:5000},
} as Rec;
const input={period:"2026-11",pl,bs,flow,trialRows,invoices:[invoice]};

describe("native statement-specific CSV exports",()=>{
  it("exports actual P&L totals and accounts, not trial balance rows",()=>{
    const csv=statementCsv({...input,statement:"pl"});
    expect(csv.split("\n")[0]).toContain("amount_minor");
    expect(csv).toContain('"Total revenue","35000"');
    expect(csv).toContain('"Net result","30000"');
    expect(csv).not.toContain("debit_minor");
  });
  it("exports balance sheet account balances and equation",()=>{
    const csv=statementCsv({...input,statement:"bs"});
    expect(csv).toContain('"Total assets","40000"');
    expect(csv).toContain('"Total equity","0"');
    expect(csv).toContain('"Net result","30000"');
    expect(csv).toContain('"Assets less liabilities and equity","10000"');
  });
  it("exports period cash movements and opening/closing figures",()=>{
    const csv=statementCsv({...input,statement:"cf"});
    expect(csv).toContain('"Opening cash","10000"');
    expect(csv).toContain('"operating","4000 Revenue","20000"');
    expect(csv).toContain('"Closing cash","30000"');
  });
  it("exports the actual live invoice outstanding allocation, never a trial balance",()=>{
    const csv=statementCsv({...input,statement:"aged"});
    expect(csv).toContain('"INV-1","part_paid","2026-11-20","12000","5000","7000"');
    expect(csv).not.toContain("credit_minor");
  });
  it("retains trial balance debit/credit account columns only when trial balance is selected",()=>{
    const csv=statementCsv({...input,statement:"tb"});
    expect(csv.split("\n")[0]).toContain("debit_minor");
    expect(csv).toContain('"1000","Bank","asset"');
  });
});

function rec(id:string,collection:string,fields:Rec["fields"],status="active",date="2026-01-10"):Rec {
  return {
    id,collection,organizationId:"org-northline",title:id,status,fields,at:date,
    ownerName:"Fixture",summary:"",currency:"GBP",tags:[],
    createdAt:date,updatedAt:date,revision:1,createdBy:"Fixture",updatedBy:"Fixture",history:[],
  };
}
const bank=rec("bank","accounts",{code:"1000",type:"asset"});
const sales=rec("sales","accounts",{code:"4000",type:"revenue"});

describe("historical financial statements",()=>{
  const january={...rec("jan","journals",{source:"invoice"},"posted"),body:{date:"2026-01-15",lines:[
    {accountId:bank.id,debitMinor:10000,creditMinor:0},
    {accountId:sales.id,debitMinor:0,creditMinor:10000},
  ]}};
  const february={...rec("feb","journals",{source:"invoice"},"posted"),body:{date:"2026-02-10",lines:[
    {accountId:bank.id,debitMinor:15000,creditMinor:0},
    {accountId:sales.id,debitMinor:0,creditMinor:15000},
  ]}};
  const accounts=[bank,sales],journals=[january,february];
  it("P&L is selected month's movement; month-end balance sheet is cumulative only to that end date",()=>{
    const janPL=profitAndLoss(trialForRange(accounts,journals,"org-northline",{period:"2026-01"}).rows);
    const janBS=balanceSheet(trialForRange(accounts,journals,"org-northline",{to:"2026-01-31"}).rows);
    const febPL=profitAndLoss(trialForRange(accounts,journals,"org-northline",{period:"2026-02"}).rows);
    const febBS=balanceSheet(trialForRange(accounts,journals,"org-northline",{to:"2026-02-28"}).rows);
    expect(janPL.revenueMinor).toBe(10000);
    expect(febPL.revenueMinor).toBe(15000);
    expect(janBS.assetsMinor).toBe(10000);
    expect(febBS.assetsMinor).toBe(25000);
    expect(janBS.differenceMinor).toBe(0);
    expect(febBS.differenceMinor).toBe(0);
  });
});
