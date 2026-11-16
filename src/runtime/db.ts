import Dexie, { type Table } from "dexie";
import { buildSeed } from "@/domain/seed";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
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

export const SEED_VERSION = 3;

export const db = new ArloviDB();

let opening: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  opening ??= (async () => {
    const meta = await db.meta.get("seed");
    if (meta?.value !== SEED_VERSION) {
      const base = buildSeed();
      await db.transaction("rw", [db.records, db.events, db.meta], async () => {
        await db.records.clear();
        await db.events.clear();
        await db.meta.clear();
        await db.records.bulkAdd(base.records);
        await db.events.bulkAdd(base.events);
        await db.meta.put({ id: "seed", value: SEED_VERSION });
      });
    }
    await topUpContributors();
  })();
  return opening;
}

/**
 * Adds each application's fixtures once, tracked per contributor. A contributor
 * whose application loads later (for example after a failed load is fixed) is
 * still seeded. Only missing ids are added, so nothing a person has edited is
 * ever overwritten, and a later file reusing an id cannot fail the whole batch.
 */
async function topUpContributors(): Promise<void> {
  for (const contributor of collectSeedsByContributor(SEED_NOW)) {
    const key = `seed:${contributor.key}`;
    const done = await db.meta.get(key);
    if (done?.value === SEED_VERSION) continue;
    await db.transaction("rw", [db.records, db.events, db.meta], async () => {
      const ids = contributor.records.map((record) => record.id);
      const existing = new Set((await db.records.bulkGet(ids)).filter(Boolean).map((record) => record!.id));
      const seen = new Set<string>();
      const fresh = contributor.records.filter((record) => {
        if (existing.has(record.id) || seen.has(record.id)) return false;
        seen.add(record.id);
        return true;
      });
      if (fresh.length) await db.records.bulkAdd(fresh);
      const eventIds = contributor.events.map((event) => event.id);
      const existingEvents = new Set((await db.events.bulkGet(eventIds)).filter(Boolean).map((event) => event!.id));
      const freshEvents = contributor.events.filter((event) => !existingEvents.has(event.id));
      if (freshEvents.length) await db.events.bulkAdd(freshEvents);
      await db.meta.put({ id: key, value: SEED_VERSION });
    });
  }
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
