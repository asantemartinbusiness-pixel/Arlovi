import { db } from "@/runtime/db";
import type { Audit, Rec, Snapshot } from "@/domain/types";
import { journalDate, lockedPeriods, periodOf } from "@/domain/fin-ledger";
import { validateBankReconciliation } from "@/domain/finance-signoff";
import { assertRosterIntegrity } from "@/domain/scheduling";

/* ------------------------------------------------------------------ *
 * Narrow repository.
 *
 * Audit A23: the previous path subscribed to every record and rewrote the
 * whole table on each mutation. Every read here is indexed by organisation
 * (and usually collection); every write touches only the affected rows and
 * checks the revision it was based on, so two open surfaces cannot silently
 * clobber each other.
 * ------------------------------------------------------------------ */

export class OrganizationScopeError extends Error {
  constructor(public readonly id: string, public readonly expectedOrgId: string, public readonly actualOrgId: string) {
    super(`Record ${id} does not belong to the selected organization.`);
    this.name = "OrganizationScopeError";
  }
}

export class ConflictError extends Error {
  constructor(public readonly id: string, public readonly expected: number, public readonly actual: number) {
    super(`Record ${id} changed since it was read (expected revision ${expected}, found ${actual}).`);
    this.name = "ConflictError";
  }
}

/**
 * All newly posted journals pass the live accounting-period lock from the
 * database, inside the same transaction that writes the journal.
 * Reconciliation link metadata may be added to an already-posted journal;
 * that operation does not post a new ledger entry.
 */
async function assertOpenJournalPeriod(record: Rec, previous?: Rec): Promise<void> {
  if (record.collection !== "journals" || record.status !== "posted") return;
  const dateChanged = previous && journalDate(previous) !== journalDate(record);
  if (previous?.status === "posted" && !dateChanged) return;
  const prefs = await db.records.where("[organizationId+collection]")
    .equals([record.organizationId, "preferences"]).toArray();
  const controls = prefs.find((item) => item.fields.kind === "accountingPeriods");
  const period = periodOf(journalDate(record));
  if (lockedPeriods(controls).includes(period)) {
    throw new Error(`Accounting period ${period} is closed. No posted journal was written; choose an open period.`);
  }
}


/** Only scheduling changes need a new roster conflict check. Approving an
 * already-recorded overtime note must not retroactively rewrite the roster. */
function rosterChanged(next: Rec, previous?: Rec): boolean {
  if (next.collection !== "shifts" || next.fields.kind !== "shift") return false;
  if (!previous) return true;
  return next.startAt !== previous.startAt || next.endAt !== previous.endAt
    || next.status !== previous.status || next.fields.employeeId !== previous.fields.employeeId
    || next.fields.hours !== previous.fields.hours || next.fields.projectId !== previous.fields.projectId;
}

async function validateRosterWrites(scopeId: string, proposed: Rec[], pendingBatch: Rec[] = []): Promise<void> {
  if (!proposed.length) return;
  const [storedRoster, storedEmployees, storedLeave, storedProjects] = await Promise.all([
    db.records.where("[organizationId+collection]").equals([scopeId, "shifts"]).toArray(),
    db.records.where("[organizationId+collection]").equals([scopeId, "employees"]).toArray(),
    db.records.where("[organizationId+collection]").equals([scopeId, "leaveRequests"]).toArray(),
    db.records.where("[organizationId+collection]").equals([scopeId, "projects"]).toArray(),
  ]);
  // A single atomic import may create an employee, project and their first
  // shift together. Resolve linked records against the transaction's proposed
  // post-write state, not just the pre-write database snapshot.
  const overlay = (stored: Rec[], collection: string): Rec[] => {
    const merged = new Map(stored.map((row) => [row.id, row]));
    for (const row of pendingBatch) if (row.collection === collection && row.organizationId === scopeId) {
      merged.set(row.id, row);
    }
    return [...merged.values()];
  };
  assertRosterIntegrity({
    organizationId: scopeId, changes: proposed,
    roster: overlay(storedRoster, "shifts"),
    employees: overlay(storedEmployees, "employees"),
    approvedLeave: overlay(storedLeave, "leaveRequests"),
    projects: overlay(storedProjects, "projects"),
  });
}

/* Last-read copy of every record this tab has seen. Forms seed their state
   once, on first render; reading the record asynchronously meant that render
   saw nothing and the form saved its defaults over the real values. Hooks use
   this copy as the first-render value; the live query then keeps it current. */
const known = new Map<string, Rec>();

function prime<T extends Rec | undefined>(record: T): T {
  if (record) known.set(record.id, record);
  return record;
}

function primeAll(rows: Rec[]): Rec[] {
  for (const row of rows) known.set(row.id, row);
  return rows;
}

/** The last-read copy of a record, if this tab has read it. */
export function knownRecord(id: string | undefined): Rec | undefined {
  return id ? known.get(id) : undefined;
}

export function listByCollection(orgId: string, collection: string): Promise<Rec[]> {
  return db.records.where("[organizationId+collection]").equals([orgId, collection]).toArray().then(primeAll);
}

export function listByOrg(orgId: string): Promise<Rec[]> {
  return db.records.where("organizationId").equals(orgId).toArray().then(primeAll);
}

export function getRecord(id: string): Promise<Rec | undefined> {
  return db.records.get(id).then((record) => {
    if (!record) known.delete(id);
    return prime(record);
  });
}

/** A record by id only if it belongs to the given organisation. */
export async function getRecordInOrg(orgId: string, id: string): Promise<Rec | undefined> {
  const record = await db.records.get(id);
  return record && record.organizationId === orgId ? record : undefined;
}

export async function listChildren(orgId: string, parentId: string): Promise<Rec[]> {
  const rows = await db.records.where("parentId").equals(parentId).toArray();
  return primeAll(rows.filter((row) => row.organizationId === orgId));
}

/** The newest events first, by when they happened (not by storage key order). */
export async function listEvents(orgId: string, limit = 200): Promise<Audit[]> {
  const rows = await db.events.where("organizationId").equals(orgId).sortBy("at");
  return rows.reverse().slice(0, limit);
}

function snapshot(record: Rec, at: string): Snapshot {
  return {
    title: record.title,
    status: record.status,
    summary: record.summary,
    fields: { ...record.fields },
    body: record.body,
    amountMinor: record.amountMinor,
    at,
  };
}

export interface WriteContext {
  actor: string;
  now: string;
  screenId?: string;
}

export interface PatchOptions {
  /** Revision the caller read; a mismatch raises ConflictError. */
  expectRevision?: number;
  /** Optional transaction-time tenant enforcement; required for UI mutations. */
  expectedOrganizationId?: string;
  /** Suppress history snapshot for high-frequency editor saves. */
  skipHistory?: boolean;
  /** Replace the whole fields map instead of merging. Only for deliberate removals. */
  replaceFields?: boolean;
  event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">;
}

/**
 * The record a patch produces, without writing it. `patchRecord` uses this,
 * and so can a caller that must commit several revisions atomically through
 * `putMany` (an approval that changes a member and closes a request together).
 * Identity, organisation and collection can never be changed by a patch.
 */
export function revisedRecord(current: Rec, patch: Partial<Rec>, context: Pick<WriteContext, "now" | "actor">, options: Pick<PatchOptions, "replaceFields" | "skipHistory"> = {}): Rec {
  return {
    ...current,
    ...patch,
    // A patch names the fields it changes; it never silently wipes the others.
    fields: patch.fields ? (options.replaceFields ? { ...patch.fields } : { ...current.fields, ...patch.fields }) : current.fields,
    id: current.id,
    organizationId: current.organizationId,
    collection: current.collection,
    history: options.skipHistory ? current.history : [snapshot(current, context.now), ...current.history].slice(0, 25),
    revision: current.revision + 1,
    updatedAt: context.now,
    updatedBy: context.actor,
  };
}

export async function patchRecord(id: string, patch: Partial<Rec>, context: WriteContext, options: PatchOptions = {}): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const current = await db.records.get(id);
    if (!current) throw new Error(`Record ${id} is not in this workspace.`);
    if (options.expectedOrganizationId && current.organizationId !== options.expectedOrganizationId) {
      throw new OrganizationScopeError(id, options.expectedOrganizationId, current.organizationId);
    }
    if (options.expectRevision !== undefined && current.revision !== options.expectRevision) {
      throw new ConflictError(id, options.expectRevision, current.revision);
    }
    const next = revisedRecord(current, patch, context, options);
    await assertOpenJournalPeriod(next, current);
    if (rosterChanged(next, current)) await validateRosterWrites(current.organizationId, [next]);
    await db.records.put(next);
    prime(next);
    if (options.event) {
      await db.events.add({
        ...options.event,
        id: crypto.randomUUID(),
        organizationId: current.organizationId,
        at: context.now,
        actor: context.actor,
        entityId: options.event.entityId ?? id,
        screenId: options.event.screenId ?? context.screenId,
      });
    }
    return next;
  });
}

export async function putRecord(record: Rec, context: WriteContext, event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const previous = await db.records.get(record.id);
    if (previous && previous.organizationId !== record.organizationId) {
      throw new OrganizationScopeError(record.id, record.organizationId, previous.organizationId);
    }
    await assertOpenJournalPeriod(record, previous);
    await db.records.put(record);
    if (event) {
      await db.events.add({
        ...event,
        id: crypto.randomUUID(),
        organizationId: record.organizationId,
        at: context.now,
        actor: context.actor,
        entityId: event.entityId ?? record.id,
        screenId: event.screenId ?? context.screenId,
      });
    }
    return record;
  });
}

export async function putMany(records: Rec[], context: WriteContext, events: Omit<Audit, "id" | "at" | "actor" | "organizationId">[] = [], expectedOrgId?: string, expectedRevisions: Record<string, number> = {}): Promise<void> {
  if (records.length === 0 && events.length === 0) return;
  const scopeId = expectedOrgId ?? records[0]?.organizationId;
  if (!scopeId) throw new Error("Bulk audit events require an organization scope.");
  await db.transaction("rw", [db.records, db.events], async () => {
    for (const record of records) {
      if (record.organizationId !== scopeId) throw new OrganizationScopeError(record.id, scopeId, record.organizationId);
    }
    if (records.length) {
      const existing = await db.records.bulkGet(records.map((record) => record.id));
      for (const original of existing) {
        if (original && original.organizationId !== scopeId) {
          throw new OrganizationScopeError(original.id, scopeId, original.organizationId);
        }
      }
      // Compare-and-swap *inside* the same transaction that writes the records.
      // A stale deal cannot write a new invoice and then fail its own update.
      // New records must not overwrite an existing ID.
      for (const [index, record] of records.entries()) {
        const original = existing[index];
        const expected = expectedRevisions[record.id];
        if (expected !== undefined) {
          if (!original || original.revision !== expected) {
            throw new ConflictError(record.id, expected, original?.revision ?? -1);
          }
        } else if (Object.keys(expectedRevisions).length > 0 && original) {
          // When a caller asks for an atomic CAS batch, every other record in
          // that batch must be genuinely new rather than an unguarded update.
          throw new ConflictError(record.id, 0, original.revision);
        }
      }
      // Creating a parent and children in one batch must be create-only.
      // A colliding id cannot replace an existing record even when this batch
      // does not need compare-and-swap revisions for another source.
      const createIds = new Set(events
        .filter((event) => event.type === "create")
        .map((event) => event.entityId)
        .filter((id): id is string => typeof id === "string"));
      for (const [index, record] of records.entries()) {
        if (createIds.has(record.id) && existing[index]) {
          throw new ConflictError(record.id, 0, existing[index].revision);
        }
      }
      // Project names must remain unique per organisation even when two
      // open tabs submit the same title. Check inside the write transaction.
      const newProjects = records.filter((record) =>
        record.collection === "projects" && createIds.has(record.id));
      if (newProjects.length) {
        const knownProjects = await db.records.where("[organizationId+collection]")
          .equals([scopeId, "projects"]).toArray();
        const claimed = new Set(knownProjects.map((row) => row.title.trim().toLocaleLowerCase()));
        for (const project of newProjects) {
          const title = project.title.trim().toLocaleLowerCase();
          if (!title || claimed.has(title)) {
            throw new Error(`A project named "${project.title}" already exists in this company. Choose a different name.`);
          }
          claimed.add(title);
        }
      }
      // Also verify source documents read by a cross-app handoff, even if
      // the source record itself is not changed (e.g. an accepted quote).
      const written = new Set(records.map((record) => record.id));
      const readOnlyIds = Object.keys(expectedRevisions).filter((id) => !written.has(id));
      if (readOnlyIds.length) {
        const sources = await db.records.bulkGet(readOnlyIds);
        for (const [index, id] of readOnlyIds.entries()) {
          const source = sources[index];
          const expected = expectedRevisions[id];
          if (!source || source.organizationId !== scopeId || source.revision !== expected) {
            throw new ConflictError(id, expected, source?.revision ?? -1);
          }
        }
      }
      // A new draft invoice must not reuse an existing displayed invoice
      // number, including when another deal was closed in a different tab.
      if (Object.keys(expectedRevisions).length > 0) {
        const newInvoices = records.filter((record, index) =>
          record.collection === "invoices" && !existing[index]);
        if (newInvoices.length) {
          const allInvoices = await db.records.where("[organizationId+collection]")
            .equals([scopeId, "invoices"]).toArray();
          for (const invoice of newInvoices) {
            const number = String(invoice.fields.number ?? invoice.title);
            if (allInvoices.some((row) => String(row.fields.number ?? row.title) === number)) {
              throw new Error(`Invoice number ${number} was already used. Reopen this deal and retry the handoff.`);
            }
          }
        }
      }
      for (const [index, record] of records.entries()) {
        await assertOpenJournalPeriod(record, existing[index]);
      }
      const proposedShifts = records.filter((record, index) => rosterChanged(record, existing[index]));
      await validateRosterWrites(scopeId, proposedShifts, records);
      await db.records.bulkPut(records);
    }
    if (events.length) {
      await db.events.bulkAdd(events.map((event) => ({
        ...event,
        id: crypto.randomUUID(),
        organizationId: scopeId,
        at: context.now,
        actor: context.actor,
        screenId: event.screenId ?? context.screenId,
      })));
    }
  });
}

/**
 * The entire confirmation is revalidated inside one IndexedDB transaction.
 * The browser-local signoff cannot be saved from an outdated React render:
 * ledger, statement, matched lines, reciprocal links and duplicate confirmations
 * are inspected together with the final confirmation write.
 */
export async function confirmBankReconciliation(
  organizationId: string,
  bankAccountCode: string,
  expectedStatementId: string,
  note: string,
  context: WriteContext,
): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const records = await db.records.where("organizationId").equals(organizationId).toArray();
    const { recon, evidence } = validateBankReconciliation({
      organizationId, bankAccountCode, expectedStatementId, records,
    });
    const record = newRecord({
      organizationId,
      collection: "bankTransactions",
      currency: records.find((item) => item.collection === "accounts")?.currency ?? "GBP",
      title: `Reconciliation ${context.now.slice(0, 10)} · ${bankAccountCode}`,
      status: "confirmed",
      summary: note.trim() || "Local statement signoff with complete reciprocal ledger evidence.",
      amountMinor: recon.statementClosingMinor ?? 0,
      at: context.now,
      fields: {
        kind: "reconciliation",
        statementId: evidence.statementId,
        bankAccountCode,
        closingMinor: evidence.closingMinor,
        ledgerMinor: evidence.ledgerMinor,
        differenceMinor: 0,
        confirmedBy: context.actor,
        confirmedAt: context.now,
        journalCount: Object.keys(evidence.journalRevisions).length,
        matchedCount: Object.keys(evidence.lineRevisions).length,
        verification: "manual_local",
      },
      body: { evidence },
    }, context);
    await db.records.add(record);
    await db.events.add({
      id: crypto.randomUUID(),
      organizationId,
      at: context.now,
      actor: context.actor,
      type: "create",
      message: `Statement ${expectedStatementId} manually reconciled against account ${bankAccountCode} by ${context.actor}`,
      entityId: record.id,
      screenId: context.screenId,
    });
    prime(record);
    return record;
  });
}

/**
 * Privacy erasure commits the selected records, the request status and audit
 * events as a single IndexedDB transaction. The caller must supply the entire
 * reviewed organisation snapshot, not just records it wishes to delete.
 * This catches new, changed or removed records (including retention policies)
 * before any deletion, avoiding partial effects and stale legal-hold decisions.
 * This remains browser-local and is not a substitute for provider-side erasure.
 */
export async function executeReviewedErasure(
  organizationId: string,
  requestId: string,
  snapshotRevisions: Record<string, number>,
  candidateIds: string[],
  expectedRequestRevision: number,
  context: WriteContext,
): Promise<{ deleted: number; retained: number }> {
  if (!candidateIds.length) throw new Error("There are no eligible records to erase.");
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error("Erasure candidates contain duplicates.");
  if (candidateIds.includes(requestId)) throw new Error("The subject request cannot erase itself.");
  if (snapshotRevisions[requestId] !== expectedRequestRevision) throw new Error("The reviewed request revision is stale.");
  const result = await db.transaction("rw", [db.records, db.events], async () => {
    const latest = await db.records.where("organizationId").equals(organizationId).toArray();
    const current = new Map(latest.map((record) => [record.id, record]));
    const reviewedIds = Object.keys(snapshotRevisions);
    if (latest.length !== reviewedIds.length) throw new Error("Records were added or removed since review. Reopen the erasure preview.");
    for (const id of reviewedIds) {
      const record = current.get(id);
      if (!record || record.revision !== snapshotRevisions[id]) {
        throw new ConflictError(id, snapshotRevisions[id], record?.revision ?? -1);
      }
    }
    const request = current.get(requestId);
    if (!request || request.collection !== "dataRequests" || request.organizationId !== organizationId) {
      throw new Error("The selected subject request is no longer available.");
    }
    if (request.fields.legalHold === true) throw new Error("The subject request is under a legal hold.");
    if (request.fields.erasureExecutionStatus !== "not_executed" || !request.fields.erasureReviewedBy) {
      throw new Error("This request has no approved local erasure impact review.");
    }
    const reviewedCandidates = String(request.fields.erasureCandidateIds ?? "").split(",").filter(Boolean);
    if (reviewedCandidates.length !== candidateIds.length ||
      reviewedCandidates.some((id) => !candidateIds.includes(id))) {
      throw new Error("Erasure selection differs from the recorded impact review.");
    }
    const scope = String(request.fields.collections ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
    const held = latest.filter((record) => record.collection === "policies" &&
      record.fields.kind === "retention" && record.fields.legalHold === true);
    for (const id of candidateIds) {
      const record = current.get(id);
      if (!record || record.organizationId !== organizationId || !scope.includes(record.collection)) {
        throw new Error(`Candidate ${id} is outside this subject request scope.`);
      }
      if (record.collection === "journals" && record.status === "posted") {
        throw new Error("Posted journals must be reversed, not deleted.");
      }
      if (held.some((policy) =>
        String(policy.fields.collections ?? "").split(",").map((entry) => entry.trim()).includes(record.collection))) {
        throw new Error(`A legal hold now prevents deletion from ${record.collection}.`);
      }
    }
    const candidateSet = new Set(candidateIds);
    const retained = latest.filter((record) => record.id !== requestId && scope.includes(record.collection) &&
      !candidateSet.has(record.id)).length;
    // No awaits outside this transaction before committing the entire batch.
    await db.records.bulkDelete(candidateIds);
    const updated = revisedRecord(request, {
      status: retained ? "partially_completed" : "completed",
      fields: {
        ...request.fields,
        deletedCount: candidateIds.length,
        blockedCount: retained,
        completedBy: context.actor,
        completedAt: context.now,
        erasureExecutedLocally: true,
        erasureExecutionStatus: "executed_locally",
      },
    }, context);
    await db.records.put(updated);
    await db.events.bulkAdd([
      ...candidateIds.map((id) => ({
        id: crypto.randomUUID(), organizationId, at: context.now, actor: context.actor,
        type: "delete", entityId: id, screenId: context.screenId,
        message: `Local erasure ${requestId} removed record ${id}`,
      })),
      {
        id: crypto.randomUUID(), organizationId, at: context.now, actor: context.actor,
        type: "update", entityId: requestId, screenId: context.screenId,
        message: `Local erasure: ${candidateIds.length} records removed; ${retained} retained`,
      },
    ]);
    return { deleted: candidateIds.length, retained };
  });
  for (const id of candidateIds) known.delete(id);
  return result;
}

export async function deleteRecord(id: string, context: WriteContext, event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">, expectedOrgId?: string): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const current = await db.records.get(id);
    if (!current) return;
    if (expectedOrgId && current.organizationId !== expectedOrgId) {
      throw new OrganizationScopeError(id, expectedOrgId, current.organizationId);
    }
    // Posted journals remain immutable accounting evidence. Reverse them
    // through the ledger instead of deleting them from the chart of accounts.
    if (current.collection === "journals" && current.status === "posted") {
      throw new Error("A posted journal cannot be deleted. Create a balanced reversal instead.");
    }
    await db.records.delete(id);
    if (event && current) {
      await db.events.add({
        ...event,
        id: crypto.randomUUID(),
        organizationId: current.organizationId,
        at: context.now,
        actor: context.actor,
        entityId: id,
        screenId: event.screenId ?? context.screenId,
      });
    }
  });
}

export async function addEvent(event: Omit<Audit, "id" | "at">, context: WriteContext): Promise<void> {
  await db.events.add({ ...event, id: crypto.randomUUID(), at: context.now, screenId: event.screenId ?? context.screenId });
}

export interface NewRecordInput {
  organizationId: string;
  collection: string;
  title: string;
  status: string;
  summary?: string;
  ownerName?: string;
  currency: string;
  amountMinor?: number;
  parentId?: string;
  tags?: string[];
  fields?: Record<string, string | number | boolean>;
  body?: unknown;
  at?: string;
  dueAt?: string;
  startAt?: string;
  endAt?: string;
}

export function newRecord(input: NewRecordInput, context: WriteContext): Rec {
  return {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    collection: input.collection,
    title: input.title,
    status: input.status,
    ownerName: input.ownerName ?? context.actor,
    summary: input.summary ?? "",
    amountMinor: input.amountMinor,
    currency: input.currency,
    at: input.at,
    dueAt: input.dueAt,
    startAt: input.startAt,
    endAt: input.endAt,
    parentId: input.parentId,
    tags: input.tags ?? [],
    fields: input.fields ?? {},
    body: input.body,
    createdAt: context.now,
    updatedAt: context.now,
    revision: 1,
    createdBy: context.actor,
    updatedBy: context.actor,
    history: [],
  };
}
