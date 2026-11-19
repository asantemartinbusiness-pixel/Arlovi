import { registerSeed } from "@/domain/seedRegistry";
import { createFlagshipRecords } from "@/domain/flagship/records";
import { createFlagshipCreative } from "@/domain/flagship/creative";
import { ORG_COLLECTIVE } from "@/domain/types";
import type { Rec } from "@/domain/types";
import { SEED_NOW } from "@/domain/types";

/**
 * Flagship is registered at HQ boot to make all of its native app references
 * available without eagerly importing the 35 application implementations.
 * Existing local edits are preserved by seedLateContributors (insert missing).
 */
registerSeed("northline-collective-v1", () => {
  const base = createFlagshipRecords(SEED_NOW);
  // Use the identical record identity contract as the operational generator.
  const make = (collection: string, n: number, title: string, extra: Partial<Rec> = {}): Rec => ({
    id: `nc-${collection}-${String(n).padStart(4, "0")}`,
    organizationId: ORG_COLLECTIVE, collection, title,
    status: extra.status ?? "draft", ownerName: extra.ownerName ?? "Sofia Marín",
    summary: extra.summary ?? "", amountMinor: extra.amountMinor, currency: "GBP",
    at: extra.at ?? SEED_NOW, startAt: extra.startAt, endAt: extra.endAt,
    dueAt: extra.dueAt, parentId: extra.parentId,
    fields: { ...extra.fields, demo: true },
    tags: extra.tags ?? ["flagship", "fictional"],
    body: extra.body, createdAt: "2026-09-01T09:00:00.000Z", updatedAt: SEED_NOW,
    revision: 1, createdBy: "Northline Demo Studio", updatedBy: "Northline Demo Studio", history: [],
  });
  return { records: [...base.records, ...createFlagshipCreative(make)], events: base.events };
});
