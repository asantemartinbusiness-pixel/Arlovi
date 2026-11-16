import type { Audit, Rec } from "./types";
import { ORG_HARBOR, ORG_NORTHLINE } from "./types";

/**
 * Seed contributors. Each application may deepen its own fixtures without
 * touching another team's file. Contributors run after the base seed and may
 * add records and events; they must not remove or rewrite base records.
 */
export interface SeedContext {
  northline: string;
  harbor: string;
  now: string;
  /** Deterministic id: `${prefix}-${collection}-${n}`. */
  id: (orgPrefix: "nl" | "hb", collection: string, n: number) => string;
  rec: (input: SeedRecordInput) => Rec;
}

export interface SeedRecordInput {
  org: "nl" | "hb";
  collection: string;
  n: number;
  title: string;
  status?: string;
  summary?: string;
  owner?: string;
  amountMinor?: number;
  at?: string;
  dueAt?: string;
  startAt?: string;
  endAt?: string;
  parentId?: string;
  tags?: string[];
  fields?: Record<string, string | number | boolean>;
  body?: unknown;
  createdAt?: string;
}

type Contributor = (context: SeedContext) => { records: Rec[]; events?: Audit[] };

const CONTRIBUTORS: { key: string; run: Contributor }[] = [];

export function registerSeed(key: string, run: Contributor): void {
  if (CONTRIBUTORS.some((item) => item.key === key)) return;
  CONTRIBUTORS.push({ key, run });
}

function makeContext(now: string): SeedContext {
  return {
    northline: ORG_NORTHLINE,
    harbor: ORG_HARBOR,
    now,
    id: (prefix, collection, n) => `${prefix}-${collection}-${String(n).padStart(3, "0")}`,
    rec: (input) => ({
      id: `${input.org}-${input.collection}-${String(input.n).padStart(3, "0")}`,
      organizationId: input.org === "nl" ? ORG_NORTHLINE : ORG_HARBOR,
      collection: input.collection,
      title: input.title,
      status: input.status ?? "active",
      ownerName: input.owner ?? (input.org === "nl" ? "Maya Chen" : "Elena Ward"),
      summary: input.summary ?? "",
      amountMinor: input.amountMinor,
      currency: input.org === "nl" ? "GBP" : "USD",
      at: input.at ?? now,
      dueAt: input.dueAt,
      startAt: input.startAt,
      endAt: input.endAt,
      parentId: input.parentId,
      tags: input.tags ?? [],
      fields: input.fields ?? {},
      body: input.body,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      revision: 1,
      createdBy: input.owner ?? (input.org === "nl" ? "Maya Chen" : "Elena Ward"),
      updatedBy: input.owner ?? (input.org === "nl" ? "Maya Chen" : "Elena Ward"),
      history: [],
    }),
  };
}

function seedContext(now: string): SeedContext {
  return makeContext(now);
}

/** Each contributor's output on its own, so late-loading ones can be topped up. */
export function collectSeedsByContributor(now: string): { key: string; records: Rec[]; events: Audit[] }[] {
  const context = seedContext(now);
  return CONTRIBUTORS.map((contributor) => {
    const result = contributor.run(context);
    return { key: contributor.key, records: result.records, events: result.events ?? [] };
  });
}

export function collectSeeds(now: string): { records: Rec[]; events: Audit[] } {
  const context = makeContext(now);
  const records: Rec[] = [];
  const events: Audit[] = [];
  for (const contributor of CONTRIBUTORS) {
    const result = contributor.run(context);
    records.push(...result.records);
    if (result.events) events.push(...result.events);
  }
  return { records, events };
}

export function seedContributorCount(): number {
  return CONTRIBUTORS.length;
}
