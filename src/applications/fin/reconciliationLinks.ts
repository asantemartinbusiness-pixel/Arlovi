import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { touch } from "@/domain/types";
import { isStatementLine, matchCandidates } from "@/domain/fin-ledger";

export interface PreparedBankLink {
  records: [Rec, Rec];
  expectedRevisions: Record<string, number>;
}

/**
 * Reconciliation links are local, human-approved bookkeeping statements.
 * Both the imported line and its posted journal must change together.
 * Neither matching nor unmatching creates or reverses a ledger posting.
 */
export function prepareStatementMatch(input: {
  line: Rec;
  journal: Rec;
  bankAccountId: string | undefined;
  actor: string;
  now: Date;
}): { prepared?: PreparedBankLink; blocked?: string } {
  const { line, journal, bankAccountId, actor, now } = input;
  if (!bankAccountId) return { blocked: "Choose a bank account to reconcile." };
  if (line.organizationId !== journal.organizationId || line.collection !== "bankTransactions"
    || journal.collection !== "journals") {
    return { blocked: "The statement and journal must belong to this same company." };
  }
  if (!isStatementLine(line) || line.fields.matched === true) {
    return { blocked: "This is not an unmatched statement line." };
  }
  if (journal.status !== "posted") return { blocked: "Only a posted journal can be reconciled." };
  if (journal.fields.bankLineId && journal.fields.bankLineId !== line.id) {
    return { blocked: "That journal is already linked to another statement line." };
  }
  if (!matchCandidates(line, [journal], bankAccountId).length) {
    return { blocked: "This journal does not move the selected bank account by the exact statement amount." };
  }
  const stamp = now.toISOString();
  return {
    prepared: {
      records: [
        touch(line, actor, stamp, {
          status: "matched",
          fields: {
            ...line.fields,
            matched: true,
            journalId: journal.id,
            matchedBy: actor,
            matchedAt: stamp,
          },
        }),
        touch(journal, actor, stamp, {
          fields: { ...journal.fields, bankLineId: line.id },
        }),
      ],
      expectedRevisions: { [line.id]: line.revision, [journal.id]: journal.revision },
    },
  };
}

export function prepareStatementUnmatch(input: {
  line: Rec;
  journal: Rec | undefined;
  actor: string;
  now: Date;
}): { prepared?: PreparedBankLink; blocked?: string } {
  const { line, journal, actor, now } = input;
  if (!journal || line.collection !== "bankTransactions" || journal.collection !== "journals"
    || line.organizationId !== journal.organizationId) {
    return { blocked: "The linked journal could not be verified in this company." };
  }
  if (line.fields.matched !== true || String(line.fields.journalId ?? "") !== journal.id
    || String(journal.fields.bankLineId ?? "") !== line.id) {
    return { blocked: "This line and journal are no longer linked to one another. Reload and review." };
  }
  const stamp = now.toISOString();
  const lineFields = { ...line.fields };
  delete lineFields.journalId;
  delete lineFields.matchedBy;
  delete lineFields.matchedAt;
  lineFields.matched = false;
  const journalFields = { ...journal.fields };
  delete journalFields.bankLineId;
  return {
    prepared: {
      records: [
        touch(line, actor, stamp, { status: "unmatched", fields: lineFields }),
        touch(journal, actor, stamp, { fields: journalFields }),
      ],
      expectedRevisions: { [line.id]: line.revision, [journal.id]: journal.revision },
    },
  };
}

/** Commit a manual match atomically and keep both audit trails linked. */
export async function commitStatementMatch(
  context: ScreenContext, line: Rec, journal: Rec, bankAccountId: string | undefined,
): Promise<void> {
  const outcome = prepareStatementMatch({ line, journal, bankAccountId, actor: context.actor, now: context.now });
  if (!outcome.prepared) throw new Error(outcome.blocked ?? "The statement match is not valid.");
  await context.mutate.putMany(
    outcome.prepared.records,
    [
      `Statement line ${line.title} matched to ${journal.title}`,
      `${journal.title} linked to statement line ${line.title}`,
    ],
    outcome.prepared.expectedRevisions,
    ["update", "update"],
  );
}

/** Unmatching removes both links together; it never reverses a ledger journal. */
export async function commitStatementUnmatch(
  context: ScreenContext, line: Rec, journal: Rec | undefined,
): Promise<void> {
  const outcome = prepareStatementUnmatch({ line, journal, actor: context.actor, now: context.now });
  if (!outcome.prepared || !journal) throw new Error(outcome.blocked ?? "The statement link has changed.");
  await context.mutate.putMany(
    outcome.prepared.records,
    [
      `Statement line ${line.title} unmatched`,
      `${journal.title} unlinked from statement line ${line.title}`,
    ],
    outcome.prepared.expectedRevisions,
    ["update", "update"],
  );
}
