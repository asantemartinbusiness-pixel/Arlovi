import { describe, expect, it, vi } from "vitest";
import type { Rec } from "@/domain/types";
import type { DocumentTotals } from "@/domain/fin-invoice";
import type { JLine } from "@/domain/fin-ledger";
import { reconcile, matchCandidates } from "@/domain/fin-ledger";

vi.mock("@/platform/repo", () => ({
  newRecord: (input: Record<string, unknown>, context: {actor:string; now:string}) => ({
    ...input,
    id: "new-ledger-journal",
    ownerName: context.actor,
    updatedBy: context.actor,
    createdBy: context.actor,
    createdAt: context.now,
    updatedAt: context.now,
    revision: 1,
    history: [],
    tags: input.tags ?? [],
  }),
}));

import { prepareInvoiceIssue, prepareInvoiceReceipt } from "@/applications/fin/settlement";
import { outstandingMinor } from "@/applications/fin/data";

const now = new Date("2026-11-14T09:30:00.000Z");
function rec(id: string, collection: string, status = "active", fields: Rec["fields"] = {}, org = "org-northline"): Rec {
  return {
    id, collection, organizationId: org, status, fields,
    title: id, summary: "", ownerName: "Finance", currency: "GBP",
    tags: collection === "accounts" && fields.code === "1000" ? ["cash"] : [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), revision: 4,
    createdBy: "Finance", updatedBy: "Finance", history: [],
  };
}
const ar = rec("account-ar", "accounts", "active", {code:"1100",type:"asset"});
const cash = rec("account-bank", "accounts", "active", {code:"1000",type:"asset"});
const revenue = rec("account-sales", "accounts", "active", {code:"4000",type:"revenue"});
const accounts = [ar,cash,revenue];
const invoice: Rec = {...rec("invoice-1","invoices","draft",{contactId:"contact-1"}), amountMinor: 12000, at: now.toISOString()};
const issued: Rec = {
  ...invoice, status: "awaiting_payment", fields: {...invoice.fields, journalId:"issue-journal"}, amountMinor: 12000,
};
const lines: JLine[] = [
  {accountId: ar.id, debitMinor: 12000, creditMinor: 0},
  {accountId: revenue.id, debitMinor: 0, creditMinor: 12000},
];
const totals = {
  grossMinor: 12000, netMinor: 12000, taxMinor: 0, hasUnknownRate: false,
} as DocumentTotals;

describe("atomic Finance invoice issuance", () => {
  const input = {invoice, totals, lines, accounts, locked: [] as string[], actor:"Maya", now};
  it("writes linked invoice and posted journal with one expected revision", () => {
    const outcome = prepareInvoiceIssue(input);
    expect(outcome.blocked).toBeUndefined();
    const posting = outcome.posting!;
    expect(posting.expectedRevisions).toEqual({[invoice.id]: invoice.revision});
    expect(posting.invoice.status).toBe("awaiting_payment");
    expect(posting.invoice.fields.journalId).toBe(posting.journal.id);
    expect(posting.invoice.revision).toBe(invoice.revision+1);
    expect(posting.invoice.history).toHaveLength(1);
    expect(posting.journal.status).toBe("posted");
    expect(posting.journal.fields.invoiceId).toBe(invoice.id);
    expect(posting.journal.body).toMatchObject({lines});
    expect(invoice.status).toBe("draft");
  });
  it("refuses a repeated issue, invalid tax, a locked period and foreign ledger accounts", () => {
    expect(prepareInvoiceIssue({...input,invoice:issued}).blocked).toMatch(/draft/);
    expect(prepareInvoiceIssue({...input,totals:{...totals,hasUnknownRate:true}}).blocked).toMatch(/tax/);
    expect(prepareInvoiceIssue({...input,locked:["2026-11"]}).blocked).toMatch(/closed/);
    expect(prepareInvoiceIssue({...input,accounts:accounts.map(a=>({...a,organizationId:"org-harbor"}))}).blocked)
      .toMatch(/company/);
  });
  it("rejects unbalanced postings before touching either record", () => {
    expect(prepareInvoiceIssue({...input,lines:[lines[0], {...lines[1],creditMinor:11000}]}).blocked)
      .toMatch(/differ/);
  });
});

describe("atomic invoice settlement and CRM-visible status", () => {
  const input = {
    invoice:issued, grossMinor:12000, amountMinor:5000, accounts,
    locked:[] as string[], cashAccountId:cash.id, date:"2026-11-14", method:"Bank transfer",actor:"Maya",now,
  };
  it("posts a balanced partial receipt and updates invoice allocation in the same batch", () => {
    const posting = prepareInvoiceReceipt(input).posting!;
    expect(posting.expectedRevisions).toEqual({[issued.id]:issued.revision});
    expect(posting.invoice.status).toBe("part_paid");
    expect(posting.invoice.fields.paidMinor).toBe(5000);
    expect(posting.invoice.fields.paymentJournalId).toBe(posting.journal.id);
    expect(posting.journal.fields.source).toBe("payment");
    expect(posting.journal.fields.invoiceId).toBe(issued.id);
    expect((posting.journal.body as {lines:JLine[]}).lines)
      .toEqual([
        {accountId:cash.id,debitMinor:5000,creditMinor:0,memo:"Receipt invoice-1"},
        {accountId:ar.id,debitMinor:0,creditMinor:5000,memo:"Receipt invoice-1"},
      ]);
    expect(outstandingMinor(posting.invoice)).toBe(7000);
    expect(issued.status).toBe("awaiting_payment");
  });
  it("settles the balance exactly, including after one prior partial receipt", () => {
    const part = prepareInvoiceReceipt(input).posting!.invoice;
    const settled = prepareInvoiceReceipt({...input,invoice:part,amountMinor:7000}).posting!;
    expect(settled.invoice.status).toBe("paid");
    expect(settled.invoice.fields.paidMinor).toBe(12000);
    expect(outstandingMinor(settled.invoice)).toBe(0);
    expect(settled.expectedRevisions[part.id]).toBe(part.revision);
  });
  it("blocks duplicate, overpaid, draft and cross-company receipt attempts", () => {
    const part = prepareInvoiceReceipt(input).posting!.invoice;
    expect(prepareInvoiceReceipt({...input,invoice:part,amountMinor:10000}).blocked).toMatch(/exceeds/);
    expect(prepareInvoiceReceipt({...input,invoice:{...issued,status:"paid"}}).blocked).toMatch(/issued/);
    expect(prepareInvoiceReceipt({...input,invoice}).blocked).toMatch(/issued/);
    expect(prepareInvoiceReceipt({...input,accounts:accounts.map(a=>({...a,organizationId:"org-harbor"}))}).blocked)
      .toMatch(/company|receivable/);
  });
  it("does not post against locked periods, inactive cash accounts or fractional pennies", () => {
    expect(prepareInvoiceReceipt({...input,locked:["2026-11"]}).blocked).toMatch(/closed/);
    expect(prepareInvoiceReceipt({...input,accounts:accounts.map(a=>a.id===cash.id?{...a,status:"inactive"}:a)}).blocked)
      .toMatch(/cash/);
    expect(prepareInvoiceReceipt({...input,amountMinor:0.5}).blocked).toMatch(/whole pennies/);
  });
  it("paid legacy invoice status has zero receivable regardless of absent allocation", () => {
    expect(outstandingMinor({...issued,status:"paid",fields:{}})).toBe(0);
    expect(outstandingMinor({...issued,status:"void",fields:{}})).toBe(0);
  });
});

describe("bank reconciliation consumes posted Finance receipts without auto-matching", () => {
  it("offers an exact receipt journal as a candidate, but requires an explicit statement match", () => {
    const outcome = prepareInvoiceReceipt({
      invoice:issued, grossMinor:12000, amountMinor:5000, accounts,
      locked:[], cashAccountId:cash.id, date:"2026-11-14",
      method:"Bank transfer", actor:"Maya", now,
    });
    const receipt = outcome.posting!.journal;
    const statement = {
      ...rec("statement-1","bankTransactions","imported",{
        kind:"statement", bankAccountCode:"1000", closingMinor:5000,
        filename:"manual-statement.csv",
      }), at:now.toISOString(),
    };
    const bankLine = {
      ...rec("bank-line-1","bankTransactions","unmatched",{
        kind:"line", bankAccountCode:"1000", reference:"Receipt invoice-1",
      }), at:now.toISOString(), amountMinor:5000,
    };
    const candidates = matchCandidates(bankLine,[receipt],cash.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].journal.id).toBe(receipt.id);
    const unresolved = reconcile({accounts,journals:[receipt],lines:[statement,bankLine],bankAccountCode:"1000"});
    expect(unresolved.suggested[0].candidates[0].journal.id).toBe(receipt.id);
    expect(unresolved.complete).toBe(false);
    expect(unresolved.blockedReason).toMatch(/still open/);
    const matched = reconcile({
      accounts,journals:[receipt],
      lines:[statement,{...bankLine,fields:{...bankLine.fields,matched:true,matchedJournalId:receipt.id}}],
      bankAccountCode:"1000",
    });
    expect(matched.complete).toBe(true);
    expect(matched.matched).toHaveLength(1);
  });
});
