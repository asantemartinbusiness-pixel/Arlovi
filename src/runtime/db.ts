import Dexie, { type Table } from "dexie";
import { buildSeed } from "@/domain/seed";
import { collectSeeds } from "@/domain/seedRegistry";
import { SEED_NOW } from "@/domain/types";
import type { Audit, Rec } from "@/domain/types";

class ArloviDB extends Dexie {
  records!: Table<Rec, string>;
  events!: Table<Audit, string>;
  meta!: Table<{ id: string; value: number }, string>;

  constructor() {
    super("arlovi-workspace");
    this.version(1).stores({
      records: "id, organizationId, collection, status, parentId, [organizationId+collection]",
      events: "id, organizationId, at",
      meta: "id",
    });
  }
}

export const SEED_VERSION = 2;

export const db = new ArloviDB();

let opening: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  opening ??= (async () => {
    const meta = await db.meta.get("seed");
    if (meta?.value === SEED_VERSION) return;
    const base = buildSeed();
    const extra = collectSeeds(SEED_NOW);
    const seen = new Set(base.records.map((record) => record.id));
    const seed = {
      // First contributor wins: a later seed file reusing an id is dropped
      // rather than failing the whole bulkAdd with a ConstraintError.
      records: [...base.records, ...extra.records.filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))],
      events: [...base.events, ...extra.events],
    };
    await db.transaction("rw", [db.records, db.events, db.meta], async () => {
      await db.records.clear();
      await db.events.clear();
      await db.records.bulkAdd(seed.records);
      await db.events.bulkAdd(seed.events);
      await db.meta.put({ id: "seed", value: SEED_VERSION });
    });
  })();
  return opening;
}

export async function persistAll(records: Rec[], events: Audit[]): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const keep = new Set(records.map((record) => record.id));
    const existing = (await db.records.toCollection().primaryKeys()) as string[];
    const remove = existing.filter((id) => !keep.has(id));
    if (remove.length) await db.records.bulkDelete(remove);
    await db.records.bulkPut(records);
    if (events.length) await db.events.bulkAdd(events);
  });
}

export async function resetWorkspace(): Promise<void> {
  opening = null;
  await db.transaction("rw", [db.records, db.events, db.meta], async () => {
    await db.records.clear();
    await db.events.clear();
    await db.meta.clear();
  });
  await ensureSeed();
}

export function downloadFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
