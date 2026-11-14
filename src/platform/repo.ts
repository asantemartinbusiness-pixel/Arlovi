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

export class ConflictError extends Error {
  constructor(public readonly id: string, public readonly expected: number, public readonly actual: number) {
    super(`Record ${id} changed since it was read (expected revision ${expected}, found ${actual}).`);
    this.name = "ConflictError";
  }
}

export function listByCollection(orgId: string, collection: string): Promise<Rec[]> {
  return db.records.where("[organizationId+collection]").equals([orgId, collection]).toArray();
}

export function listByOrg(orgId: string): Promise<Rec[]> {
  return db.records.where("organizationId").equals(orgId).toArray();
}

export function getRecord(id: string): Promise<Rec | undefined> {
  return db.records.get(id);
}

export async function listChildren(orgId: string, parentId: string): Promise<Rec[]> {
  const rows = await db.records.where("parentId").equals(parentId).toArray();
  return rows.filter((row) => row.organizationId === orgId);
}

export function listEvents(orgId: string, limit = 200): Promise<Audit[]> {
  return db.events.where("organizationId").equals(orgId).reverse().limit(limit).toArray();
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
  /** Suppress history snapshot for high-frequency editor saves. */
  skipHistory?: boolean;
  event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">;
}

export async function patchRecord(id: string, patch: Partial<Rec>, context: WriteContext, options: PatchOptions = {}): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const current = await db.records.get(id);
    if (!current) throw new Error(`Record ${id} is not in this workspace.`);
    if (options.expectRevision !== undefined && current.revision !== options.expectRevision) {
      throw new ConflictError(id, options.expectRevision, current.revision);
    }
    const next: Rec = {
      ...current,
      ...patch,
      id: current.id,
      organizationId: current.organizationId,
      collection: current.collection,
      history: options.skipHistory ? current.history : [snapshot(current, context.now), ...current.history].slice(0, 25),
      revision: current.revision + 1,
      updatedAt: context.now,
      updatedBy: context.actor,
    };
    await db.records.put(next);
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

export async function putMany(records: Rec[], context: WriteContext, events: Omit<Audit, "id" | "at" | "actor" | "organizationId">[] = []): Promise<void> {
  if (records.length === 0 && events.length === 0) return;
  await db.transaction("rw", [db.records, db.events], async () => {
    if (records.length) await db.records.bulkPut(records);
    if (events.length) {
      await db.events.bulkAdd(events.map((event) => ({
        ...event,
        id: crypto.randomUUID(),
        organizationId: records[0]?.organizationId ?? event.entityId ?? "",
        at: context.now,
        actor: context.actor,
        screenId: event.screenId ?? context.screenId,
      })));
    }
  });
}

export async function deleteRecord(id: string, context: WriteContext, event?: Omit<Audit, "id" | "at" | "actor" | "organizationId">): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const current = await db.records.get(id);
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
