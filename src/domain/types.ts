export const ORG_NORTHLINE = "org-northline";
export const ORG_HARBOR = "org-harbor";
export const ORG_COLLECTIVE = "org-northline-collective";
export const SEED_NOW = "2026-11-14T09:30:00.000Z";

export type Role = "owner" | "finance" | "sales" | "people" | "member" | "client";

export type CapabilityState =
  | "not_connected"
  | "configuration_required"
  | "ready_local"
  | "queued_local"
  | "awaiting_external_confirmation"
  | "verified_external"
  | "blocked"
  | "failed";

export interface Snapshot {
  title: string;
  status: string;
  summary: string;
  fields: Record<string, string | number | boolean>;
  body?: unknown;
  amountMinor?: number;
  at: string;
}

export interface Rec {
  id: string;
  organizationId: string;
  collection: string;
  title: string;
  status: string;
  ownerName: string;
  summary: string;
  amountMinor?: number;
  currency: string;
  at?: string;
  dueAt?: string;
  startAt?: string;
  endAt?: string;
  parentId?: string;
  tags: string[];
  fields: Record<string, string | number | boolean>;
  body?: unknown;
  createdAt: string;
  updatedAt: string;
  revision: number;
  createdBy: string;
  updatedBy: string;
  history: Snapshot[];
}

export interface Audit {
  id: string;
  organizationId: string;
  at: string;
  actor: string;
  type: string;
  message: string;
  entityId?: string;
  screenId?: string;
  capability?: CapabilityState;
}

export interface Workspace {
  records: Rec[];
  events: Audit[];
}

export function currencyFor(orgId: string): string {
  return orgId === ORG_HARBOR ? "USD" : "GBP";
}

export function localeFor(orgId: string): string {
  return orgId === ORG_HARBOR ? "en-US" : "en-GB";
}

export function slugFor(orgId: string): string {
  return orgId === ORG_COLLECTIVE ? "collective" : orgId === ORG_HARBOR ? "harbor" : "northline";
}

export function orgFromSlug(slug: string): string | null {
  if (slug === "northline") return ORG_NORTHLINE;
  if (slug === "harbor") return ORG_HARBOR;
  if (slug === "collective") return ORG_COLLECTIVE;
  return null;
}

export function formatMoney(minor: number, currency: string, locale?: string): string {
  const loc = locale ?? (currency === "USD" ? "en-US" : "en-GB");
  return new Intl.NumberFormat(loc, { style: "currency", currency }).format(minor / 100);
}

export function remember(rec: Rec, at: string): Rec {
  const snap: Snapshot = {
    title: rec.title,
    status: rec.status,
    summary: rec.summary,
    fields: { ...rec.fields },
    body: rec.body,
    amountMinor: rec.amountMinor,
    at,
  };
  return { ...rec, history: [snap, ...rec.history].slice(0, 25) };
}

export function replaceRec(records: Rec[], rec: Rec): Rec[] {
  return records.map((item) => (item.id === rec.id ? rec : item));
}

export function byId(records: Rec[], id: string | undefined): Rec | undefined {
  if (!id) return undefined;
  return records.find((item) => item.id === id);
}

export function inOrg(records: Rec[], orgId: string, collection?: string): Rec[] {
  return records.filter(
    (item) => item.organizationId === orgId && (collection ? item.collection === collection : true),
  );
}

export function isPaused(records: Rec[], orgId: string): boolean {
  return records.find((item) => item.id === orgId)?.fields.executionPaused === true;
}

export function touch(rec: Rec, actor: string, now: string, patch: Partial<Rec>): Rec {
  const base = remember(rec, now);
  return {
    ...base,
    ...patch,
    fields: patch.fields ? patch.fields : base.fields,
    tags: patch.tags ? patch.tags : base.tags,
    history: base.history,
    revision: rec.revision + 1,
    updatedAt: now,
    updatedBy: actor,
  };
}

export function makeIdFactory(start = 1) {
  let n = start;
  return (prefix = "id") => {
    n += 1;
    return `${prefix}-${n.toString(36)}`;
  };
}
