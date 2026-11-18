import type { Rec } from "./types";
import { imbalance, journalLines, normalBalance, statements, trialBalance } from "./finance";
import type { AccountType, JLine, Statements, TrialRow } from "./finance";

/* ------------------------------------------------------------------ *
 * Ledger derivations for the Finance application.
 *
 * Everything here is computed from *posted* journals and the chart of
 * accounts. Drafts, forecasts and imported statement lines never enter a
 * statement figure. The double-entry primitives in `./finance.ts`
 * (imbalance, normalBalance, trialBalance, statements) are reused rather
 * than reimplemented.
 * ------------------------------------------------------------------ */

export const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

/** Debit-normal account types: a positive balance is a debit balance. */
export function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense";
}

export function accountType(account: Rec): AccountType {
  const value = String(account.fields.type ?? "asset");
  return (ACCOUNT_TYPES as string[]).includes(value) ? (value as AccountType) : "asset";
}

export function accountCode(account: Rec): string {
  return String(account.fields.code ?? "");
}

/** The ledger date of a journal: its body date, else its `at` stamp. */
export function journalDate(journal: Rec): string {
  const body = journal.body as { date?: string } | undefined;
  return (body?.date ?? journal.at ?? journal.updatedAt).slice(0, 10);
}

export function journalMemo(journal: Rec): string {
  const body = journal.body as { memo?: string } | undefined;
  return body?.memo ?? journal.summary;
}

export function reversesId(journal: Rec): string | undefined {
  const body = journal.body as { reversesId?: string } | undefined;
  return body?.reversesId;
}

/** `2026-11` for a date or ISO stamp. */
export function periodOf(value: string): string {
  return value.slice(0, 7);
}

export function periodLabel(period: string, locale: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Months, newest first, that have at least one posted journal. */
export function postedPeriods(journals: Rec[]): string[] {
  const seen = new Set<string>();
  for (const journal of journals) {
    if (journal.status !== "posted") continue;
    seen.add(periodOf(journalDate(journal)));
  }
  return [...seen].sort().reverse();
}

export function lockedPeriods(record: Rec | undefined): string[] {
  const body = record?.body as { locked?: unknown } | undefined;
  return Array.isArray(body?.locked) ? body!.locked.map(String) : [];
}

export interface PostCheck {
  lineCount: number;
  debitMinor: number;
  creditMinor: number;
  differenceMinor: number | null;
  balanced: boolean;
  /** The reason posting is refused, or undefined when it may proceed. */
  reason?: string;
}

/**
 * The gate in front of `post`. A journal posts only when every line is a
 * single-sided integer amount, debits equal credits and the period is open.
 */
export function checkPosting(input: {
  lines: JLine[];
  period: string;
  locked: string[];
  accounts: Rec[];
}): PostCheck {
  const debitMinor = input.lines.reduce((sum, line) => sum + (Number(line.debitMinor) || 0), 0);
  const creditMinor = input.lines.reduce((sum, line) => sum + (Number(line.creditMinor) || 0), 0);
  const difference = imbalance(input.lines);
  const base: PostCheck = {
    lineCount: input.lines.length,
    debitMinor,
    creditMinor,
    differenceMinor: difference,
    balanced: difference === 0,
  };
  if (input.lines.length < 2) {
    return { ...base, reason: "A journal needs at least two lines." };
  }
  if (input.lines.some((line) => !line.accountId)) {
    return { ...base, reason: "Every line needs an account." };
  }
  const known = new Set(input.accounts.map((account) => account.id));
  if (input.lines.some((line) => !known.has(line.accountId))) {
    return { ...base, reason: "A line points at an account that is not in this chart of accounts." };
  }
  if (input.accounts.some((account) => account.status === "inactive" && input.lines.some((line) => line.accountId === account.id))) {
    return { ...base, reason: "A line posts to a deactivated account." };
  }
  if (difference === null) {
    return { ...base, reason: "Each line must carry a whole-penny amount on one side only." };
  }
  if (difference !== 0) {
    return { ...base, reason: `Debits and credits differ by ${(Math.abs(difference) / 100).toFixed(2)}.` };
  }
  if (input.locked.includes(input.period)) {
    return { ...base, reason: `${input.period} is closed. Post to an open period or reopen it first.` };
  }
  return base;
}

/** Reverses the sides of a posted journal's lines. */
export function reversalLines(journal: Rec): JLine[] {
  return journalLines(journal).map((line) => ({
    accountId: line.accountId,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
    memo: `Reversal of ${journal.title}`,
  }));
}

/** True when a posted journal has already been reversed by another journal. */
export function isReversedBy(journal: Rec, journals: Rec[]): Rec | undefined {
  return journals.find((candidate) => candidate.status === "posted" && reversesId(candidate) === journal.id);
}

/* -------------------------- Statements -------------------------- */

export function ledger(accounts: Rec[], journals: Rec[], orgId: string): Statements {
  return statements([...accounts, ...journals], orgId);
}

export function trial(accounts: Rec[], journals: Rec[], orgId: string): { rows: TrialRow[]; debit: number; credit: number } {
  return trialBalance([...accounts, ...journals], orgId);
}

/**
 * Trial balance restricted to a window of ledger dates. Used for a period
 * profit and loss and for budget variance, where a cumulative balance would
 * be the wrong comparison.
 */
export function trialForRange(
  accounts: Rec[],
  journals: Rec[],
  orgId: string,
  range?: { from?: string; to?: string; period?: string },
): { rows: TrialRow[]; debit: number; credit: number; journalCount: number } {
  const scoped = journals.filter((journal) => {
    if (journal.status !== "posted") return false;
    const date = journalDate(journal);
    if (range?.period) return periodOf(date) === range.period;
    if (range?.from && date < range.from) return false;
    if (range?.to && date > range.to) return false;
    return true;
  });
  const result = trialBalance([...accounts, ...scoped], orgId);
  return { ...result, journalCount: scoped.length };
}

export interface StatementLine {
  code: string;
  name: string;
  accountId: string;
  amountMinor: number;
}

export interface ProfitAndLoss {
  revenue: StatementLine[];
  expense: StatementLine[];
  revenueMinor: number;
  expenseMinor: number;
  grossMarginMinor: number;
  costOfSalesMinor: number;
  netMinor: number;
}

/** Cost of sales is the 5xxx expense block; everything else is overhead. */
export function profitAndLoss(rows: TrialRow[]): ProfitAndLoss {
  const pick = (type: AccountType) => rows
    .filter((row) => row.type === type && row.balanceMinor !== 0)
    .map((row) => ({ code: row.code, name: row.name, accountId: row.accountId, amountMinor: row.balanceMinor }));
  const revenue = pick("revenue");
  const expense = pick("expense");
  const revenueMinor = revenue.reduce((sum, line) => sum + line.amountMinor, 0);
  const expenseMinor = expense.reduce((sum, line) => sum + line.amountMinor, 0);
  const costOfSalesMinor = expense.filter((line) => line.code.startsWith("5")).reduce((sum, line) => sum + line.amountMinor, 0);
  return {
    revenue,
    expense,
    revenueMinor,
    expenseMinor,
    costOfSalesMinor,
    grossMarginMinor: revenueMinor - costOfSalesMinor,
    netMinor: revenueMinor - expenseMinor,
  };
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  assetsMinor: number;
  liabilitiesMinor: number;
  equityMinor: number;
  retainedMinor: number;
  /** assets − (liabilities + equity + retained earnings). Zero when the books tie. */
  differenceMinor: number;
}

export function balanceSheet(rows: TrialRow[]): BalanceSheet {
  const pick = (type: AccountType) => rows
    .filter((row) => row.type === type && row.balanceMinor !== 0)
    .map((row) => ({ code: row.code, name: row.name, accountId: row.accountId, amountMinor: row.balanceMinor }));
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const pl = profitAndLoss(rows);
  const assetsMinor = assets.reduce((sum, line) => sum + line.amountMinor, 0);
  const liabilitiesMinor = liabilities.reduce((sum, line) => sum + line.amountMinor, 0);
  const equityMinor = equity.reduce((sum, line) => sum + line.amountMinor, 0);
  return {
    assets,
    liabilities,
    equity,
    assetsMinor,
    liabilitiesMinor,
    equityMinor,
    retainedMinor: pl.netMinor,
    differenceMinor: assetsMinor - (liabilitiesMinor + equityMinor + pl.netMinor),
  };
}

export type CashActivity = "operating" | "investing" | "financing";

export interface CashFlow {
  openingMinor: number;
  closingMinor: number;
  movementMinor: number;
  operatingMinor: number;
  investingMinor: number;
  financingMinor: number;
  rows: { activity: CashActivity; label: string; amountMinor: number }[];
  /** Cash accounts the statement was built from. */
  cashAccountIds: string[];
}

/**
 * Indirect-free cash flow: every posted journal that touches a cash account is
 * classified by the type of the accounts on the other side of the entry.
 */
export function cashFlow(accounts: Rec[], journals: Rec[], options?: { from?: string; to?: string }): CashFlow {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const cashIds = accounts
    .filter((account) => accountType(account) === "asset" && (account.tags.includes("cash") || accountCode(account).startsWith("10")))
    .map((account) => account.id);
  const cash = new Set(cashIds);
  const buckets = new Map<string, { activity: CashActivity; label: string; amountMinor: number }>();
  let opening = 0;
  let movement = 0;

  const posted = journals
    .filter((journal) => journal.status === "posted")
    .sort((a, b) => journalDate(a).localeCompare(journalDate(b)));

  for (const journal of posted) {
    const lines = journalLines(journal);
    const cashDelta = lines
      .filter((line) => cash.has(line.accountId))
      .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
    if (cashDelta === 0) continue;
    const date = journalDate(journal);
    if (options?.from && date < options.from) { opening += cashDelta; continue; }
    if (options?.to && date > options.to) continue;
    movement += cashDelta;
    const counterparts = lines.filter((line) => !cash.has(line.accountId));
    const weight = counterparts.reduce((sum, line) => sum + Math.abs(line.debitMinor - line.creditMinor), 0) || 1;
    for (const line of counterparts) {
      const account = byId.get(line.accountId);
      const type = account ? accountType(account) : "expense";
      const code = account ? accountCode(account) : "";
      const activity: CashActivity = type === "equity" || (type === "liability" && code.startsWith("27"))
        ? "financing"
        : type === "asset" && code.startsWith("15")
          ? "investing"
          : "operating";
      const label = account ? `${code} ${account.title}` : "Unmapped account";
      const share = Math.round((cashDelta * Math.abs(line.debitMinor - line.creditMinor)) / weight);
      const key = `${activity}:${label}`;
      const found = buckets.get(key);
      if (found) found.amountMinor += share;
      else buckets.set(key, { activity, label, amountMinor: share });
    }
  }

  const rows = [...buckets.values()].filter((row) => row.amountMinor !== 0).sort((a, b) => a.activity.localeCompare(b.activity) || b.amountMinor - a.amountMinor);
  const sumOf = (activity: CashActivity) => rows.filter((row) => row.activity === activity).reduce((sum, row) => sum + row.amountMinor, 0);
  return {
    openingMinor: opening,
    closingMinor: opening + movement,
    movementMinor: movement,
    operatingMinor: sumOf("operating"),
    investingMinor: sumOf("investing"),
    financingMinor: sumOf("financing"),
    rows,
    cashAccountIds: cashIds,
  };
}

/** Balance on the cash accounts from posted journals alone. */
export function cashBalance(accounts: Rec[], journals: Rec[]): { amountMinor: number; accountCount: number; lastPosted?: string } {
  const cash = accounts.filter((account) => accountType(account) === "asset" && (account.tags.includes("cash") || accountCode(account).startsWith("10")));
  const ids = new Set(cash.map((account) => account.id));
  let total = 0;
  let last: string | undefined;
  for (const journal of journals) {
    if (journal.status !== "posted") continue;
    const lines = journalLines(journal).filter((line) => ids.has(line.accountId));
    if (lines.length === 0) continue;
    total += lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
    const date = journalDate(journal);
    if (!last || date > last) last = date;
  }
  return { amountMinor: total, accountCount: cash.length, lastPosted: last };
}

/** Net movement per month on one account type, from posted journals. */
export function monthlyMovement(
  accounts: Rec[],
  journals: Rec[],
  type: AccountType,
  months: string[],
): { period: string; amountMinor: number }[] {
  const ids = new Set(accounts.filter((account) => accountType(account) === type).map((account) => account.id));
  const debitNormal = isDebitNormal(type);
  return months.map((period) => {
    let total = 0;
    for (const journal of journals) {
      if (journal.status !== "posted") continue;
      if (periodOf(journalDate(journal)) !== period) continue;
      for (const line of journalLines(journal)) {
        if (!ids.has(line.accountId)) continue;
        total += debitNormal ? line.debitMinor - line.creditMinor : line.creditMinor - line.debitMinor;
      }
    }
    return { period, amountMinor: total };
  });
}

/** The last `count` months up to and including `now`, oldest first. */
export function recentPeriods(now: Date, count: number): string[] {
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ---------------------------- Ageing ---------------------------- */

export interface AgeBucket {
  bucket: string;
  amountMinor: number;
  count: number;
  ids: string[];
}

export const AGE_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

export function ageBuckets(records: Rec[], now: Date): AgeBucket[] {
  const buckets: AgeBucket[] = AGE_BUCKETS.map((bucket) => ({ bucket, amountMinor: 0, count: 0, ids: [] }));
  for (const record of records) {
    const due = record.dueAt ?? record.at;
    const days = due ? Math.floor((now.getTime() - new Date(due).getTime()) / 86_400_000) : 0;
    const index = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    // Age what is still owed: a part-paid document is aged at its balance, not its gross.
    buckets[index].amountMinor += Math.max(0, Number(record.amountMinor ?? 0) - Number(record.fields.paidMinor ?? 0));
    buckets[index].count += 1;
    buckets[index].ids.push(record.id);
  }
  return buckets;
}

export function daysOverdue(record: Rec, now: Date): number | undefined {
  if (!record.dueAt) return undefined;
  const days = Math.floor((now.getTime() - new Date(record.dueAt).getTime()) / 86_400_000);
  return days > 0 ? days : undefined;
}

/* ----------------------- Reconciliation ------------------------- */

export interface StatementSummary {
  record: Rec;
  bankAccountCode: string;
  openingMinor: number;
  closingMinor: number;
  from?: string;
  to?: string;
  filename: string;
}

export function statementSummaries(lines: Rec[]): StatementSummary[] {
  return lines
    .filter((line) => line.collection === "bankTransactions" && line.fields.kind === "statement")
    .map((record) => ({
      record,
      bankAccountCode: String(record.fields.bankAccountCode ?? "1000"),
      openingMinor: Number(record.fields.openingMinor ?? 0),
      closingMinor: Number(record.fields.closingMinor ?? record.amountMinor ?? 0),
      from: record.fields.from ? String(record.fields.from) : undefined,
      to: record.fields.to ? String(record.fields.to) : undefined,
      filename: String(record.fields.filename ?? record.title),
    }))
    // A newly imported statement supersedes an older statement for the same
    // bank account. Never use insertion order to select the closing balance.
    .sort((a, b) => String(b.to ?? b.record.at ?? b.record.createdAt)
      .localeCompare(String(a.to ?? a.record.at ?? a.record.createdAt))
      || String(b.record.createdAt).localeCompare(String(a.record.createdAt))
      || b.record.id.localeCompare(a.record.id));
}

export function isStatementLine(record: Rec): boolean {
  return record.collection === "bankTransactions"
    && record.fields.kind !== "statement"
    && record.fields.kind !== "reconciliation";
}

export interface MatchCandidate {
  journal: Rec;
  /** 0–100. Amount must be exact; date proximity and memo overlap raise it. */
  confidence: number;
  reason: string;
}

/** Posted journals that move this bank account by exactly the line amount. */
export function matchCandidates(line: Rec, journals: Rec[], bankAccountId: string): MatchCandidate[] {
  const amount = Number(line.amountMinor ?? 0);
  const lineDate = (line.at ?? line.createdAt).slice(0, 10);
  const words = `${line.title} ${String(line.fields.reference ?? "")}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return journals
    .filter((journal) => journal.status === "posted")
    .filter((journal) => !journal.fields.bankLineId || journal.fields.bankLineId === line.id)
    .map((journal) => {
      const moves = journalLines(journal)
        .filter((entry) => entry.accountId === bankAccountId)
        .reduce((sum, entry) => sum + entry.debitMinor - entry.creditMinor, 0);
      if (moves !== amount || amount === 0) return null;
      const days = Math.abs(Math.round((new Date(journalDate(journal)).getTime() - new Date(lineDate).getTime()) / 86_400_000));
      const text = `${journal.title} ${journalMemo(journal)}`.toLowerCase();
      const overlap = words.filter((word) => text.includes(word)).length;
      const confidence = Math.min(100, 60 + (days === 0 ? 25 : days <= 3 ? 15 : days <= 10 ? 5 : 0) + overlap * 5);
      const reason = `Amount matches exactly; ledger date is ${days === 0 ? "the same day" : `${days} day${days === 1 ? "" : "s"} apart`}${overlap ? `; ${overlap} word${overlap === 1 ? "" : "s"} in common` : ""}.`;
      return { journal, confidence, reason } as MatchCandidate;
    })
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort((a, b) => b.confidence - a.confidence);
}

export interface Reconciliation {
  bankAccountId?: string;
  bankAccountCode: string;
  /** Posted balance on the bank account as at the statement's end date. */
  ledgerMinor: number;
  /** Posted balance on the bank account today, including postings after the statement. */
  bookBalanceMinor: number;
  /** Posted journals moving the bank account after the statement's end date. */
  postedAfterStatement: { journal: Rec; amountMinor: number }[];
  statement?: StatementSummary;
  statementClosingMinor?: number;
  /** Statement closing less the ledger balance on the same account. */
  differenceMinor?: number;
  matched: Rec[];
  /** Unmatched lines with at least one candidate journal. */
  suggested: { line: Rec; candidates: MatchCandidate[] }[];
  /** Unmatched lines with no ledger entry behind them. */
  needsPosting: Rec[];
  needsPostingMinor: number;
  /** Difference the unmatched lines do not account for. Must be zero to confirm. */
  unexplainedMinor?: number;
  complete: boolean;
  blockedReason?: string;
}

export function reconcile(input: {
  accounts: Rec[];
  journals: Rec[];
  lines: Rec[];
  bankAccountCode: string;
}): Reconciliation {
  const account = input.accounts.find((item) => accountCode(item) === input.bankAccountCode);
  const statement = statementSummaries(input.lines).find((item) => item.bankAccountCode === input.bankAccountCode);
  const activeBatch = statement?.record.fields.importBatch;
  const own = input.lines.filter((line) =>
    isStatementLine(line)
    && String(line.fields.bankAccountCode ?? "1000") === input.bankAccountCode
    // New imports carry a statement batch. Do not mix historical statement
    // lines from older months into the current statement's sign-off.
    && (!activeBatch || String(line.fields.importBatch ?? "") === String(activeBatch)));
  let ledgerMinor = 0;
  let bookBalanceMinor = 0;
  const postedAfterStatement: { journal: Rec; amountMinor: number }[] = [];
  if (account) {
    for (const journal of input.journals) {
      if (journal.status !== "posted") continue;
      let moves = 0;
      for (const entry of journalLines(journal)) {
        if (entry.accountId === account.id) moves += entry.debitMinor - entry.creditMinor;
      }
      bookBalanceMinor += moves;
      // Bank closing balances are as-of the statement date, not today's
      // balance. Newer legitimate postings must not rewrite old statements:
      // they are listed as posted after the statement instead.
      if (statement?.to && journalDate(journal) > statement.to) {
        if (moves !== 0) postedAfterStatement.push({ journal, amountMinor: moves });
        continue;
      }
      ledgerMinor += moves;
    }
  }
  postedAfterStatement.sort((a, b) => journalDate(a.journal).localeCompare(journalDate(b.journal)));
  const matched = own.filter((line) => line.fields.matched === true);
  const open = own.filter((line) => line.fields.matched !== true);
  const suggested: { line: Rec; candidates: MatchCandidate[] }[] = [];
  const needsPosting: Rec[] = [];
  for (const line of open) {
    const candidates = account ? matchCandidates(line, input.journals, account.id) : [];
    if (candidates.length > 0) suggested.push({ line, candidates });
    else needsPosting.push(line);
  }
  const needsPostingMinor = needsPosting.reduce((sum, line) => sum + Number(line.amountMinor ?? 0), 0);
  const differenceMinor = statement ? statement.closingMinor - ledgerMinor : undefined;
  const unexplainedMinor = differenceMinor === undefined ? undefined : differenceMinor - needsPostingMinor;
  const blockedReason = !account
    ? `No account with code ${input.bankAccountCode} is in the chart of accounts.`
    : !statement
      ? "No statement has been imported for this account."
      : unexplainedMinor !== 0
        ? "The difference is not fully explained by the open statement lines."
        : open.length > 0
          ? `${open.length} statement ${open.length === 1 ? "line is" : "lines are"} still open.`
          : undefined;
  return {
    bankAccountId: account?.id,
    bankAccountCode: input.bankAccountCode,
    ledgerMinor,
    bookBalanceMinor,
    postedAfterStatement,
    statement,
    statementClosingMinor: statement?.closingMinor,
    differenceMinor,
    matched,
    suggested,
    needsPosting,
    needsPostingMinor,
    unexplainedMinor,
    complete: blockedReason === undefined,
    blockedReason,
  };
}

/* --------------------------- Budgets ---------------------------- */

export interface VarianceRow {
  id: string;
  label: string;
  accountCode: string;
  period: string;
  budgetMinor: number;
  actualMinor: number;
  varianceMinor: number;
  /** Positive means a favourable variance for this account type. */
  favourable: boolean;
  /** False when no posted journal touched the account — actual is 0, not unknown. */
  hasActual: boolean;
}

export function budgetVariance(budgets: Rec[], rows: TrialRow[], accounts: Rec[]): VarianceRow[] {
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return budgets.map((budget) => {
    const code = String(budget.fields.accountCode ?? "");
    const row = byCode.get(code);
    const account = accounts.find((item) => accountCode(item) === code);
    const type = account ? accountType(account) : "expense";
    const budgetMinor = Number(budget.amountMinor ?? budget.fields.amountMinor ?? 0);
    const actualMinor = row?.balanceMinor ?? 0;
    const variance = actualMinor - budgetMinor;
    return {
      id: budget.id,
      label: budget.title,
      accountCode: code,
      period: String(budget.fields.period ?? ""),
      budgetMinor,
      actualMinor,
      varianceMinor: variance,
      favourable: type === "revenue" ? variance >= 0 : variance <= 0,
      hasActual: Boolean(row && (row.debitMinor !== 0 || row.creditMinor !== 0)),
    };
  });
}

export interface AccountMovement {
  journal: Rec;
  date: string;
  memo: string;
  debitMinor: number;
  creditMinor: number;
  /** Movement in the account's normal direction: a cost for an expense, income for revenue. */
  netMinor: number;
}

/**
 * The posted journal lines on one account inside a month: the transactions
 * that make up a budget line's actual. Sum of netMinor equals the trial
 * balance figure for the same account and period.
 */
export function accountMovements(accounts: Rec[], journals: Rec[], code: string, period: string): AccountMovement[] {
  const account = accounts.find((item) => accountCode(item) === code);
  if (!account) return [];
  const type = accountType(account);
  const debitNormal = type === "asset" || type === "expense";
  const out: AccountMovement[] = [];
  for (const journal of journals) {
    if (journal.status !== "posted") continue;
    const date = journalDate(journal);
    if (periodOf(date) !== period) continue;
    let debit = 0;
    let credit = 0;
    const memos: string[] = [];
    for (const line of journalLines(journal)) {
      if (line.accountId !== account.id) continue;
      debit += line.debitMinor;
      credit += line.creditMinor;
      if (line.memo) memos.push(line.memo);
    }
    if (debit === 0 && credit === 0) continue;
    out.push({
      journal, date, memo: memos.join("; ") || journalMemo(journal),
      debitMinor: debit, creditMinor: credit, netMinor: debitNormal ? debit - credit : credit - debit,
    });
  }
  return out.sort((a, b) => b.netMinor - a.netMinor || a.date.localeCompare(b.date));
}

/** Revenue and expense accounts that moved in the period but have no approved budget line. */
export function unbudgetedActuals(budgets: Rec[], rows: TrialRow[]): TrialRow[] {
  const budgeted = new Set(budgets.map((budget) => String(budget.fields.accountCode ?? "")));
  return rows
    .filter((row) => (row.type === "revenue" || row.type === "expense") && !budgeted.has(row.code))
    .filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0)
    .sort((a, b) => Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor));
}

/** Variance as a whole percentage of budget, or undefined when nothing was budgeted. */
export function variancePercent(row: VarianceRow): number | undefined {
  if (row.budgetMinor === 0) return undefined;
  return Math.round((row.varianceMinor / Math.abs(row.budgetMinor)) * 100);
}

/* ------------------------- Multi-entity ------------------------- */

export function entityOf(journal: Rec): string | undefined {
  const value = journal.fields.entityId;
  return typeof value === "string" && value ? value : undefined;
}

export function isIntercompany(journal: Rec): boolean {
  return journal.fields.intercompany === true || journal.tags.includes("intercompany");
}

export interface ConsolidationColumn {
  entityId: string;
  label: string;
  debitMinor: number;
  creditMinor: number;
}

export interface Consolidation {
  columns: ConsolidationColumn[];
  eliminationMinor: number;
  eliminatedJournalIds: string[];
  groupDebitMinor: number;
  groupCreditMinor: number;
  unassignedJournalIds: string[];
}

/**
 * Per-entity totals with intercompany journals removed once, so a balance
 * recorded in two entities is not counted twice in the group column.
 */
export function consolidate(entities: Rec[], journals: Rec[]): Consolidation {
  const posted = journals.filter((journal) => journal.status === "posted");
  const columns: ConsolidationColumn[] = entities.map((entity) => ({ entityId: entity.id, label: entity.title, debitMinor: 0, creditMinor: 0 }));
  const byEntity = new Map(columns.map((column) => [column.entityId, column]));
  const unassigned: string[] = [];
  const eliminated: string[] = [];
  let eliminationMinor = 0;
  let groupDebit = 0;
  let groupCredit = 0;

  for (const journal of posted) {
    const lines = journalLines(journal);
    const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    const entityId = entityOf(journal);
    const column = entityId ? byEntity.get(entityId) : undefined;
    if (column) {
      column.debitMinor += debit;
      column.creditMinor += credit;
    } else {
      unassigned.push(journal.id);
      if (columns.length > 0) {
        columns[0].debitMinor += debit;
        columns[0].creditMinor += credit;
      }
    }
    if (isIntercompany(journal)) {
      eliminated.push(journal.id);
      eliminationMinor += debit;
      continue;
    }
    groupDebit += debit;
    groupCredit += credit;
  }

  return {
    columns,
    eliminationMinor,
    eliminatedJournalIds: eliminated,
    groupDebitMinor: groupDebit,
    groupCreditMinor: groupCredit,
    unassignedJournalIds: unassigned,
  };
}

export { imbalance, journalLines, normalBalance };
export type { JLine, TrialRow, Statements, AccountType };
