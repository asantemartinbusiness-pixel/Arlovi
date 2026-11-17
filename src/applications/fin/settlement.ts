import type { Rec } from "@/domain/types";
import { touch } from "@/domain/types";
import type { DocumentTotals } from "@/domain/fin-invoice";
import { accountCode, accountType, checkPosting } from "@/domain/fin-ledger";
import type { JLine } from "@/domain/fin-ledger";
import { newRecord } from "@/platform/repo";

/**
 * The only creation path for posted invoice and receipt journals in the native
 * Finance invoice screens. The returned records are *prepared*; nothing is
 * posted until the caller commits both records in one guarded transaction.
 */
export type PreparedFinancePosting = {
  invoice: Rec;
  journal: Rec;
  expectedRevisions: Record<string, number>;
};

function goodMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function postingAccounts(accounts: Rec[], organizationId: string): Rec[] {
  return accounts.filter((row) => row.organizationId === organizationId && row.status !== "inactive");
}

export function prepareInvoiceIssue(input: {
  invoice: Rec;
  totals: DocumentTotals;
  lines: JLine[];
  accounts: Rec[];
  locked: string[];
  actor: string;
  now: Date;
}): { posting?: PreparedFinancePosting; blocked?: string } {
  const { invoice, totals, lines, accounts, locked, actor, now } = input;
  if (invoice.collection !== "invoices" || invoice.status !== "draft") {
    return { blocked: "Only a draft invoice can be approved and posted." };
  }
  if (invoice.fields.journalId) {
    return { blocked: "This invoice already has an issue journal. Review the existing entry." };
  }
  if (!goodMinor(totals.grossMinor) || totals.hasUnknownRate) {
    return { blocked: "Resolve the invoice tax and positive gross amount before posting." };
  }
  if (!Number.isFinite(now.getTime())) return { blocked: "The posting date is invalid." };
  const scoped = postingAccounts(accounts, invoice.organizationId);
  if (lines.some((line) => !scoped.some((account) => account.id === line.accountId))) {
    return { blocked: "All journal accounts must be active and belong to this company." };
  }
  const date = (invoice.at ?? now.toISOString()).slice(0, 10);
  const check = checkPosting({ lines, period: date.slice(0, 7), locked, accounts: scoped });
  if (check.reason) return { blocked: check.reason };
  const stamp = now.toISOString();
  const ctx = { actor, now: stamp };
  const journal = newRecord({
    collection: "journals",
    organizationId: invoice.organizationId,
    currency: invoice.currency,
    title: `Issue ${invoice.title}`,
    status: "posted",
    summary: `Receivable raised for ${invoice.title}.`,
    amountMinor: totals.grossMinor,
    at: `${date}T09:00:00.000Z`,
    parentId: invoice.id,
    tags: ["ledger", "invoice"],
    fields: {
      date, source: "invoice", invoiceId: invoice.id,
      postedBy: actor, approvedBy: actor,
    },
    body: { date, memo: invoice.title, lines },
  }, ctx);
  const versions = ((invoice.body as { versions?: unknown[] } | undefined)?.versions ?? []) as unknown[];
  const updated = touch(invoice, actor, stamp, {
    status: "awaiting_payment",
    amountMinor: totals.grossMinor,
    body: {
      ...(invoice.body as object ?? {}),
      versions: [...versions, { at: stamp, by: actor, note: "Issued and posted", grossMinor: totals.grossMinor }],
    },
    fields: {
      ...invoice.fields,
      journalId: journal.id,
      netMinor: totals.netMinor,
      taxMinor: totals.taxMinor,
      issuedAt: stamp,
      approvedBy: actor,
      approvedAt: stamp,
    },
  });
  return { posting: { invoice: updated, journal, expectedRevisions: { [invoice.id]: invoice.revision } } };
}

export function prepareInvoiceReceipt(input: {
  invoice: Rec;
  grossMinor: number;
  amountMinor: number;
  accounts: Rec[];
  locked: string[];
  cashAccountId: string;
  date: string;
  method: string;
  actor: string;
  now: Date;
}): { posting?: PreparedFinancePosting; blocked?: string } {
  const { invoice, grossMinor, amountMinor, accounts, locked, cashAccountId, date, method, actor, now } = input;
  if (invoice.collection !== "invoices" || !["awaiting_payment", "part_paid"].includes(invoice.status)) {
    return { blocked: "Only an issued invoice with a remaining balance can receive a payment." };
  }
  if (!goodMinor(grossMinor)) return { blocked: "The invoice has no valid gross amount." };
  const alreadyPaid = Number(invoice.fields.paidMinor ?? 0);
  const outstanding = grossMinor - alreadyPaid;
  if (!Number.isSafeInteger(alreadyPaid) || alreadyPaid < 0 || outstanding <= 0) {
    return { blocked: "This invoice has no valid outstanding balance to settle." };
  }
  if (!goodMinor(amountMinor)) return { blocked: "Enter a positive amount in whole pennies." };
  if (amountMinor > outstanding) {
    return { blocked: "The payment exceeds the invoice's outstanding balance." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(new Date(`${date}T09:00:00.000Z`).getTime())
      || new Date(`${date}T09:00:00.000Z`).toISOString().slice(0, 10) !== date
      || !Number.isFinite(now.getTime())) {
    return { blocked: "Choose a valid receipt date." };
  }
  const scoped = postingAccounts(accounts, invoice.organizationId);
  const cash = scoped.find((row) => row.id === cashAccountId);
  const ar = scoped.find((row) => accountCode(row) === "1100");
  if (!ar || accountType(ar) !== "asset") {
    return { blocked: "Finance needs an active 1100 accounts receivable asset account." };
  }
  if (!cash || cash.id === ar.id || accountType(cash) !== "asset"
      || !(cash.tags.includes("cash") || accountCode(cash).startsWith("10"))) {
    return { blocked: "Select an active cash or bank account belonging to this company." };
  }
  const lines: JLine[] = [
    { accountId: cash.id, debitMinor: amountMinor, creditMinor: 0, memo: `Receipt ${invoice.title}` },
    { accountId: ar.id, debitMinor: 0, creditMinor: amountMinor, memo: `Receipt ${invoice.title}` },
  ];
  const check = checkPosting({ lines, period: date.slice(0, 7), locked, accounts: scoped });
  if (check.reason) return { blocked: check.reason };
  const stamp = now.toISOString();
  const ctx = { actor, now: stamp };
  const journal = newRecord({
    collection: "journals",
    organizationId: invoice.organizationId,
    currency: invoice.currency,
    title: `Receipt ${invoice.title}`,
    status: "posted",
    summary: `Local receipt for ${invoice.title} by ${method.toLowerCase()}. No payment provider confirmed it.`,
    amountMinor,
    at: `${date}T09:00:00.000Z`,
    parentId: invoice.id,
    tags: ["ledger", "receipt"],
    fields: { date, source: "payment", invoiceId: invoice.id, method },
    body: { date, memo: `Receipt for ${invoice.title}`, lines },
  }, ctx);
  const paid = alreadyPaid + amountMinor;
  const updated = touch(invoice, actor, stamp, {
    status: paid === grossMinor ? "paid" : "part_paid",
    fields: {
      ...invoice.fields,
      paidMinor: paid,
      paymentJournalId: journal.id,
      paidAt: `${date}T09:00:00.000Z`,
    },
  });
  return { posting: { invoice: updated, journal, expectedRevisions: { [invoice.id]: invoice.revision } } };
}
