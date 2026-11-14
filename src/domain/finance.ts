import type { Audit, Rec } from "./types";
import { byId, inOrg, replaceRec, touch } from "./types";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface JLine {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  memo?: string;
}

export interface TrialRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export function journalLines(rec: Rec): JLine[] {
  const body = rec.body as { lines?: JLine[] } | undefined;
  return Array.isArray(body?.lines) ? body.lines : [];
}

export function imbalance(lines: JLine[]): number | null {
  if (lines.length < 2) return null;
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.debitMinor) || !Number.isInteger(line.creditMinor)) return null;
    if (line.debitMinor < 0 || line.creditMinor < 0) return null;
    if (line.debitMinor > 0 && line.creditMinor > 0) return null;
    if (line.debitMinor === 0 && line.creditMinor === 0) return null;
    debit += line.debitMinor;
    credit += line.creditMinor;
  }
  return debit - credit;
}

export function normalBalance(type: AccountType, debit: number, credit: number): number {
  if (type === "asset" || type === "expense") return debit - credit;
  return credit - debit;
}

export function trialBalance(records: Rec[], orgId: string): { rows: TrialRow[]; debit: number; credit: number } {
  const accounts = inOrg(records, orgId, "accounts");
  const posted = inOrg(records, orgId, "journals").filter((item) => item.status === "posted");
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const journal of posted) {
    for (const line of journalLines(journal)) {
      const current = totals.get(line.accountId) ?? { debit: 0, credit: 0 };
      current.debit += line.debitMinor;
      current.credit += line.creditMinor;
      totals.set(line.accountId, current);
    }
  }
  const rows = accounts
    .map((account) => {
      const total = totals.get(account.id) ?? { debit: 0, credit: 0 };
      const type = String(account.fields.type) as AccountType;
      return {
        accountId: account.id,
        code: String(account.fields.code ?? ""),
        name: account.title,
        type,
        debitMinor: total.debit,
        creditMinor: total.credit,
        balanceMinor: normalBalance(type, total.debit, total.credit),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    rows,
    debit: rows.reduce((sum, row) => sum + row.debitMinor, 0),
    credit: rows.reduce((sum, row) => sum + row.creditMinor, 0),
  };
}

export interface Statements {
  rows: TrialRow[];
  debit: number;
  credit: number;
  assets: number;
  liabilities: number;
  equity: number;
  revenue: number;
  expense: number;
  net: number;
  booksBalance: boolean;
  equationHolds: boolean;
}

export function statements(records: Rec[], orgId: string): Statements {
  const tb = trialBalance(records, orgId);
  const sum = (type: AccountType) =>
    tb.rows.filter((row) => row.type === type).reduce((total, row) => total + row.balanceMinor, 0);
  const revenue = sum("revenue");
  const expense = sum("expense");
  const net = revenue - expense;
  const assets = sum("asset");
  const liabilities = sum("liability");
  const equity = sum("equity") + net;
  return {
    rows: tb.rows,
    debit: tb.debit,
    credit: tb.credit,
    assets,
    liabilities,
    equity,
    revenue,
    expense,
    net,
    booksBalance: tb.debit === tb.credit,
    equationHolds: assets === liabilities + equity,
  };
}

export function accountByCode(records: Rec[], orgId: string, code: string): Rec | undefined {
  return inOrg(records, orgId, "accounts").find((item) => String(item.fields.code) === code);
}

function event(partial: Omit<Audit, "id"> & { id: string }): Audit {
  return partial;
}

export function postJournal(
  records: Rec[],
  journalId: string,
  actor: string,
  now: string,
  eventId: string,
): { records: Rec[]; events: Audit[]; error?: string } {
  const journal = byId(records, journalId);
  if (!journal || journal.collection !== "journals") {
    return { records, events: [], error: "Journal was not found in this organization." };
  }
  if (journal.status === "posted") {
    return { records, events: [], error: "This journal is already posted." };
  }
  if (journal.status === "reversed") {
    return { records, events: [], error: "A reversed journal cannot be posted again." };
  }
  const diff = imbalance(journalLines(journal));
  if (diff === null || diff !== 0) {
    return {
      records,
      events: [],
      error: "Debits and credits do not match. The journal stays unposted.",
    };
  }
  const next = touch(journal, actor, now, { status: "posted" });
  return {
    records: replaceRec(records, next),
    events: [
      event({
        id: eventId,
        organizationId: journal.organizationId,
        at: now,
        actor,
        type: "finance.journal.posted_local",
        message: `Posted journal ${journal.title}.`,
        entityId: journal.id,
        capability: "ready_local",
      }),
    ],
  };
}

export function reverseJournal(
  records: Rec[],
  journalId: string,
  actor: string,
  now: string,
  ids: { journal: string; event: string },
): { records: Rec[]; events: Audit[]; error?: string } {
  const journal = byId(records, journalId);
  if (!journal || journal.status !== "posted") {
    return { records, events: [], error: "Only a posted journal can be reversed." };
  }
  const lines = journalLines(journal).map((line) => ({
    accountId: line.accountId,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
    memo: `Reversal of ${journal.title}`,
  }));
  const reversal: Rec = {
    ...journal,
    id: ids.journal,
    title: `Reversal · ${journal.title}`,
    status: "posted",
    summary: `Reverses ${journal.id}`,
    body: { date: now.slice(0, 10), memo: `Reversal of ${journal.title}`, lines, reversesId: journal.id },
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    revision: 1,
    history: [],
    parentId: journal.id,
  };
  const marked = touch(journal, actor, now, { status: "reversed" });
  return {
    records: [reversal, ...replaceRec(records, marked)],
    events: [
      event({
        id: ids.event,
        organizationId: journal.organizationId,
        at: now,
        actor,
        type: "finance.journal.reversed_local",
        message: `Reversed ${journal.title} with an offsetting journal.`,
        entityId: reversal.id,
        capability: "ready_local",
      }),
    ],
  };
}

export function issueInvoice(
  records: Rec[],
  invoiceId: string,
  actor: string,
  now: string,
  ids: { journal: string; event: string },
): { records: Rec[]; events: Audit[]; error?: string } {
  const invoice = byId(records, invoiceId);
  if (!invoice || invoice.collection !== "invoices") {
    return { records, events: [], error: "Invoice was not found." };
  }
  if (invoice.status !== "draft") {
    return { records, events: [], error: "Only a draft invoice can be issued." };
  }
  const net = Number(invoice.fields.netMinor ?? 0);
  const tax = Number(invoice.fields.taxMinor ?? 0);
  if (!Number.isInteger(net) || !Number.isInteger(tax) || net <= 0 || tax < 0) {
    return { records, events: [], error: "Invoice totals must be positive minor units." };
  }
  const ar = accountByCode(records, invoice.organizationId, "1100");
  const revenue = accountByCode(records, invoice.organizationId, String(invoice.fields.revenueCode ?? "4000"));
  const vat = accountByCode(records, invoice.organizationId, "2100");
  if (!ar || !revenue || (tax > 0 && !vat)) {
    return { records, events: [], error: "Chart of accounts is missing a required control account." };
  }
  const lines: JLine[] = [
    { accountId: ar.id, debitMinor: net + tax, creditMinor: 0, memo: invoice.title },
    { accountId: revenue.id, debitMinor: 0, creditMinor: net, memo: invoice.title },
  ];
  if (tax > 0 && vat) lines.push({ accountId: vat.id, debitMinor: 0, creditMinor: tax, memo: "Output VAT" });
  const journal: Rec = {
    ...invoice,
    id: ids.journal,
    collection: "journals",
    title: `Issue ${invoice.title}`,
    status: "posted",
    summary: "Local ledger posting for an issued invoice.",
    amountMinor: net + tax,
    parentId: invoice.id,
    body: { date: now.slice(0, 10), memo: invoice.title, lines },
    fields: { source: "invoice", invoiceId: invoice.id },
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    revision: 1,
    history: [],
    tags: ["ledger", "local"],
  };
  const nextInvoice = touch(invoice, actor, now, {
    status: "awaiting_payment",
    amountMinor: net + tax,
    fields: { ...invoice.fields, journalId: journal.id, netMinor: net, taxMinor: tax },
  });
  return {
    records: [journal, ...replaceRec(records, nextInvoice)],
    events: [
      event({
        id: ids.event,
        organizationId: invoice.organizationId,
        at: now,
        actor,
        type: "finance.invoice.issued_local",
        message: `Issued ${invoice.title} and posted a balanced journal.`,
        entityId: invoice.id,
        capability: "ready_local",
      }),
    ],
  };
}

export function recordPayment(
  records: Rec[],
  invoiceId: string,
  actor: string,
  now: string,
  ids: { journal: string; event: string },
): { records: Rec[]; events: Audit[]; error?: string } {
  const invoice = byId(records, invoiceId);
  if (!invoice || invoice.status !== "awaiting_payment") {
    return { records, events: [], error: "Payment can be recorded only against an issued, unpaid invoice." };
  }
  const total = Number(invoice.amountMinor ?? 0);
  const bank = accountByCode(records, invoice.organizationId, "1000");
  const ar = accountByCode(records, invoice.organizationId, "1100");
  if (!bank || !ar || total <= 0) {
    return { records, events: [], error: "Bank or receivables account is missing." };
  }
  const journal: Rec = {
    ...invoice,
    id: ids.journal,
    collection: "journals",
    title: `Receipt ${invoice.title}`,
    status: "posted",
    summary: "Local cash receipt. No external payment provider confirmed this.",
    amountMinor: total,
    parentId: invoice.id,
    body: {
      date: now.slice(0, 10),
      memo: `Local receipt for ${invoice.title}`,
      lines: [
        { accountId: bank.id, debitMinor: total, creditMinor: 0 },
        { accountId: ar.id, debitMinor: 0, creditMinor: total },
      ],
    },
    fields: { source: "payment", invoiceId: invoice.id },
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    revision: 1,
    history: [],
    tags: ["ledger", "local"],
  };
  const nextInvoice = touch(invoice, actor, now, {
    status: "paid",
    fields: { ...invoice.fields, paymentJournalId: journal.id, paidAt: now },
  });
  return {
    records: [journal, ...replaceRec(records, nextInvoice)],
    events: [
      event({
        id: ids.event,
        organizationId: invoice.organizationId,
        at: now,
        actor,
        type: "finance.payment.recorded_local",
        message: `Recorded a local ledger receipt for ${invoice.title}. No card or bank provider confirmed the funds.`,
        entityId: invoice.id,
        capability: "ready_local",
      }),
    ],
  };
}

export function voidInvoice(
  records: Rec[],
  invoiceId: string,
  actor: string,
  now: string,
  ids: { journal: string; event: string },
): { records: Rec[]; events: Audit[]; error?: string } {
  const invoice = byId(records, invoiceId);
  if (!invoice) return { records, events: [], error: "Invoice was not found." };
  if (invoice.status === "paid") {
    return { records, events: [], error: "A paid invoice must be reversed with a credit journal, not voided in place." };
  }
  if (invoice.status === "void") return { records, events: [], error: "Invoice is already void." };
  let nextRecords = records;
  const events: Audit[] = [];
  const journalId = String(invoice.fields.journalId ?? "");
  if (journalId) {
    const reversed = reverseJournal(nextRecords, journalId, actor, now, { journal: ids.journal, event: ids.event });
    if (reversed.error) return { records, events: [], error: reversed.error };
    nextRecords = reversed.records;
    events.push(...reversed.events);
  }
  const latest = byId(nextRecords, invoiceId)!;
  const voided = touch(latest, actor, now, { status: "void" });
  events.push(
    event({
      id: `${ids.event}-void`,
      organizationId: invoice.organizationId,
      at: now,
      actor,
      type: "finance.invoice.voided_local",
      message: `Voided ${invoice.title}.`,
      entityId: invoice.id,
      capability: "ready_local",
    }),
  );
  return { records: replaceRec(nextRecords, voided), events };
}

export function matchBankLine(
  records: Rec[],
  bankId: string,
  actor: string,
  now: string,
  eventId: string,
): { records: Rec[]; events: Audit[]; error?: string } {
  const line = byId(records, bankId);
  if (!line || line.collection !== "bankTransactions") {
    return { records, events: [], error: "Statement line was not found." };
  }
  if (line.fields.matched === true) {
    return { records, events: [], error: "This statement line is already matched." };
  }
  const amount = Number(line.amountMinor ?? 0);
  const candidate = inOrg(records, line.organizationId, "journals").find((journal) => {
    if (journal.status !== "posted") return false;
    return journalLines(journal).some((entry) => {
      const bank = accountByCode(records, line.organizationId, "1000");
      if (!bank || entry.accountId !== bank.id) return false;
      const signed = entry.debitMinor - entry.creditMinor;
      return signed === amount && journal.fields.bankLineId == null;
    });
  });
  if (!candidate) {
    return {
      records,
      events: [],
      error: "No posted cash journal matches this statement amount. Import or post the ledger entry first.",
    };
  }
  const nextLine = touch(line, actor, now, {
    status: "matched",
    fields: { ...line.fields, matched: true, journalId: candidate.id },
  });
  const nextJournal = touch(candidate, actor, now, { fields: { ...candidate.fields, bankLineId: line.id } });
  return {
    records: replaceRec(replaceRec(records, nextLine), nextJournal),
    events: [
      event({
        id: eventId,
        organizationId: line.organizationId,
        at: now,
        actor,
        type: "finance.reconciliation.matched_local",
        message: `Matched ${line.title} to ${candidate.title}.`,
        entityId: line.id,
        capability: "ready_local",
      }),
    ],
  };
}

export function aging(records: Rec[], orgId: string, now: string): { bucket: string; amountMinor: number; count: number }[] {
  const today = new Date(now).getTime();
  const buckets = [
    { bucket: "Current", amountMinor: 0, count: 0 },
    { bucket: "1–30 days", amountMinor: 0, count: 0 },
    { bucket: "31–60 days", amountMinor: 0, count: 0 },
    { bucket: "Over 60 days", amountMinor: 0, count: 0 },
  ];
  for (const invoice of inOrg(records, orgId, "invoices")) {
    if (invoice.status !== "awaiting_payment") continue;
    const due = new Date(invoice.dueAt ?? invoice.at ?? now).getTime();
    const days = Math.floor((today - due) / 86_400_000);
    const index = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3;
    buckets[index].amountMinor += Number(invoice.amountMinor ?? 0);
    buckets[index].count += 1;
  }
  return buckets;
}
