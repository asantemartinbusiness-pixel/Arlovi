import type { Rec } from "./types";
import {
  journalDate, journalLines, matchCandidates, reconcile, type Reconciliation,
} from "./fin-ledger";

/** The signed-off evidence is a ledger/statement snapshot, not bank verification. */
export interface ReconciliationEvidence {
  statementId: string;
  statementRevision: number;
  bankAccountId: string;
  bankAccountCode: string;
  journalRevisions: Record<string, number>;
  lineRevisions: Record<string, number>;
  closingMinor: number;
  ledgerMinor: number;
}

export function reconciliationEvidence(
  recon: Reconciliation,
  journals: Rec[],
): ReconciliationEvidence | undefined {
  if (!recon.statement || !recon.bankAccountId || recon.statementClosingMinor === undefined) return undefined;
  const cutoff = recon.statement.to;
  const affected = journals.filter((journal) =>
    journal.status === "posted"
    && journal.organizationId === recon.statement?.record.organizationId
    && (!cutoff || journalDate(journal) <= cutoff)
    && journalLines(journal).some((line) => line.accountId === recon.bankAccountId));
  return {
    statementId: recon.statement.record.id,
    statementRevision: recon.statement.record.revision,
    bankAccountId: recon.bankAccountId,
    bankAccountCode: recon.bankAccountCode,
    journalRevisions: Object.fromEntries(affected.map((item): [string, number] => [item.id, item.revision]).sort(([a], [b]) => a.localeCompare(b))),
    lineRevisions: Object.fromEntries(recon.matched.map((item): [string, number] => [item.id, item.revision]).sort(([a], [b]) => a.localeCompare(b))),
    closingMinor: recon.statementClosingMinor,
    ledgerMinor: recon.ledgerMinor,
  };
}

export function reconciliationSignoffBlocker(input: {
  recon: Reconciliation;
  accounts: Rec[];
  journals: Rec[];
  bankLines: Rec[];
}): string | undefined {
  const { recon, journals, bankLines } = input;
  if (!recon.complete) return recon.blockedReason ?? "The bank statement is not fully reconciled.";
  if (!recon.statement || !recon.bankAccountId) return "Select a current bank statement and its account.";
  const statement = recon.statement.record;
  if (!Number.isSafeInteger(recon.statementClosingMinor) || !Number.isSafeInteger(recon.ledgerMinor)) {
    return "The bank statement and ledger balances must be valid whole-penny amounts.";
  }
  if (bankLines.some((item) =>
    item.organizationId === statement.organizationId
    && item.fields.kind === "reconciliation"
    && String(item.fields.statementId ?? "") === statement.id)) {
    return "This statement has already been signed off. Import an amended statement to confirm new balances.";
  }
  // A pre-existing one-sided match is not enough evidence. Confirm every line
  // is reciprocally linked to a posted, exact-value journal in this company.
  for (const line of recon.matched) {
    const id = String(line.fields.journalId ?? "");
    const journal = journals.find((row) => row.id === id);
    if (!journal || journal.status !== "posted" || journal.organizationId !== statement.organizationId
      || journal.fields.bankLineId !== line.id) {
      return `Statement line ${line.title} does not have a reciprocal posted journal link. Repair that match before signing off.`;
    }
    if (!matchCandidates(line, [journal], recon.bankAccountId).length) {
      return `The posted journal for ${line.title} does not move this bank account by the exact statement amount.`;
    }
    if (recon.statement.to && journalDate(journal) > recon.statement.to) {
      return `The posted journal for ${line.title} is dated after the statement end date.`;
    }
  }
  return undefined;
}

/** Used by History to identify a superseded local signoff without rewriting it. */
export function reconciliationSignoffIsCurrent(
  confirmation: Rec, evidence: ReconciliationEvidence | undefined,
): boolean {
  if (!evidence || String(confirmation.fields.statementId ?? "") !== evidence.statementId) return false;
  const saved = (confirmation.body as { evidence?: ReconciliationEvidence } | undefined)?.evidence;
  if (!saved) return false;
  const sameMap = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([id, revision]) => b[id] === revision);
  return saved.statementRevision === evidence.statementRevision
    && saved.bankAccountId === evidence.bankAccountId
    && saved.closingMinor === evidence.closingMinor
    && saved.ledgerMinor === evidence.ledgerMinor
    && sameMap(saved.journalRevisions, evidence.journalRevisions)
    && sameMap(saved.lineRevisions, evidence.lineRevisions);
}

/** Recompute from fresh scoped database rows, not a stale screen snapshot. */
export function validateBankReconciliation(input: {
  organizationId: string;
  bankAccountCode: string;
  expectedStatementId: string;
  records: Rec[];
}): { recon: Reconciliation; evidence: ReconciliationEvidence } {
  const { organizationId, bankAccountCode, expectedStatementId } = input;
  const own = input.records.filter((rec) => rec.organizationId === organizationId);
  const accounts = own.filter((item) => item.collection === "accounts");
  const journals = own.filter((item) => item.collection === "journals");
  const bankLines = own.filter((item) => item.collection === "bankTransactions");
  const recon = reconcile({ accounts, journals, lines: bankLines, bankAccountCode });
  if (!recon.statement || recon.statement.record.id !== expectedStatementId) {
    throw new Error("A different bank statement is now current. Reopen the reconciliation and review it.");
  }
  const reason = reconciliationSignoffBlocker({ recon, accounts, journals, bankLines });
  if (reason) throw new Error(reason);
  const evidence = reconciliationEvidence(recon, journals);
  if (!evidence) throw new Error("Reconciliation evidence could not be prepared.");
  return { recon, evidence };
}
