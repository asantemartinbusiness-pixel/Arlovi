import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useWorkspace } from "@/platform/workspace";
import { listByCollection } from "@/platform/repo";
import { db, SEED_VERSION } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  accountCode, balanceSheet, cashBalance, ledger, lockedPeriods, periodOf, postedPeriods, profitAndLoss, trial,
} from "@/domain/fin-ledger";
import type { BalanceSheet, ProfitAndLoss, Statements, TrialRow } from "@/domain/fin-ledger";

const COLLECTIONS = [
  "accounts", "journals", "invoices", "bills", "expenses", "bankTransactions",
  "budgets", "taxCodes", "legalEntities", "contacts", "suppliers", "preferences", "approvals",
];

export interface FinData {
  /**
   * True once the posted books have been read from storage, including the
   * workspace's finance fixtures. Until then every figure would be computed
   * from a partial ledger, so headline figures show a loading state rather
   * than a number that is about to change.
   */
  ready: boolean;
  accounts: Rec[];
  journals: Rec[];
  invoices: Rec[];
  bills: Rec[];
  expenses: Rec[];
  bankLines: Rec[];
  budgets: Rec[];
  taxCodes: Rec[];
  entities: Rec[];
  contacts: Rec[];
  suppliers: Rec[];
  approvals: Rec[];
  /** The record holding closed accounting periods. */
  periodRecord?: Rec;
  locked: string[];
  periods: string[];
  currentPeriod: string;
  statements: Statements;
  trialRows: TrialRow[];
  trialDebit: number;
  trialCredit: number;
  pl: ProfitAndLoss;
  bs: BalanceSheet;
  cash: { amountMinor: number; accountCount: number; lastPosted?: string };
  postedCount: number;
  draftJournals: Rec[];
}

const EMPTY: Record<string, Rec[]> = Object.fromEntries(COLLECTIONS.map((name) => [name, [] as Rec[]]));

/**
 * One indexed read per collection, shared by every Finance screen. Finance
 * fixtures are added after start-up, so the same read also reports whether they
 * are in place. Both come from one storage snapshot, so a screen never sees
 * "ready" next to a ledger that is still missing journals.
 */
function useFinCollections(orgId: string): { ready: boolean; rows: Record<string, Rec[]> } {
  const snapshot = useLiveQuery(async () => {
    const seeded = (await db.meta.get("seed:fin"))?.value === SEED_VERSION;
    const entries = await Promise.all(COLLECTIONS.map(async (name) => [name, await listByCollection(orgId, name)] as const));
    return { ready: seeded, rows: Object.fromEntries(entries) as Record<string, Rec[]> };
  }, [orgId]);
  return snapshot ?? { ready: false, rows: EMPTY };
}

export function useFinData(): FinData {
  const { org, now } = useWorkspace();
  const { ready, rows: data } = useFinCollections(org.id);
  const nowIso = now.toISOString();

  return useMemo(() => {
    const accounts = [...data.accounts].sort((a, b) => accountCode(a).localeCompare(accountCode(b)));
    const journals = data.journals;
    const periodRecord = data.preferences.find((record) => record.fields.kind === "accountingPeriods");
    const report = ledger(accounts, journals, org.id);
    const tb = trial(accounts, journals, org.id);
    return {
      ready,
      accounts,
      journals,
      invoices: data.invoices,
      bills: data.bills,
      expenses: data.expenses,
      bankLines: data.bankTransactions,
      budgets: data.budgets,
      taxCodes: data.taxCodes,
      entities: data.legalEntities,
      contacts: data.contacts,
      suppliers: data.suppliers,
      approvals: data.approvals,
      periodRecord,
      locked: lockedPeriods(periodRecord),
      periods: postedPeriods(journals),
      currentPeriod: periodOf(nowIso),
      statements: report,
      trialRows: tb.rows,
      trialDebit: tb.debit,
      trialCredit: tb.credit,
      pl: profitAndLoss(tb.rows),
      bs: balanceSheet(tb.rows),
      cash: cashBalance(accounts, journals),
      postedCount: journals.filter((journal) => journal.status === "posted").length,
      draftJournals: journals.filter((journal) => journal.status === "draft"),
    };
  }, [data, ready, org.id, nowIso]);
}

export function contactOf(data: FinData, record: Rec | undefined): Rec | undefined {
  const id = String(record?.fields.contactId ?? record?.parentId ?? "");
  return id ? data.contacts.find((contact) => contact.id === id) : undefined;
}

export function supplierOf(data: FinData, record: Rec | undefined): Rec | undefined {
  const id = String(record?.fields.supplierId ?? "");
  return id ? data.suppliers.find((supplier) => supplier.id === id) : undefined;
}

export function openInvoices(invoices: Rec[]): Rec[] {
  return invoices.filter((invoice) => ["awaiting_payment", "part_paid"].includes(invoice.status));
}

export function outstandingMinor(invoice: Rec): number {
  // A paid or void invoice owes nothing, whether or not its receipts were itemised.
  if (invoice.status === "paid" || invoice.status === "void") return 0;
  return Math.max(0, Number(invoice.amountMinor ?? 0) - Number(invoice.fields.paidMinor ?? 0));
}

export interface ReceivablePosition {
  open: Rec[];
  receivableMinor: number;
  overdue: Rec[];
  overdueMinor: number;
}

/**
 * The receivable and overdue position: open invoices (awaiting payment or part
 * paid) at what is still outstanding on each, and those past their due date.
 * Finance and the executive home both read this, so they state one figure.
 */
export function receivablePosition(invoices: Rec[], now: Date): ReceivablePosition {
  const open = openInvoices(invoices);
  const overdue = open.filter((invoice) => invoice.dueAt && new Date(invoice.dueAt) < now);
  return {
    open,
    receivableMinor: open.reduce((sum, invoice) => sum + outstandingMinor(invoice), 0),
    overdue,
    overdueMinor: overdue.reduce((sum, invoice) => sum + outstandingMinor(invoice), 0),
  };
}
