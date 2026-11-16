import { db } from "@/runtime/db";
import type { Audit, Rec, Snapshot } from "@/domain/types";

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
    const next: Rec = {
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
        } else if (original && record.revision === 1) {
          throw new ConflictError(record.id, 0, original.revision);
        }
      }
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

export async function deleteRecord(id: string, context: WriteContext, event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">, expectedOrgId?: string): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const current = await db.records.get(id);
    if (!current) return;
    if (expectedOrgId && current.organizationId !== expectedOrgId) {
      throw new OrganizationScopeError(id, expectedOrgId, current.organizationId);
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
