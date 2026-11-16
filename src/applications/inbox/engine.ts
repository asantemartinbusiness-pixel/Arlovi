import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Rec, Role } from "@/domain/types";
import {
  buildAttention, filterForRole, PRIORITY_LABEL, PRIORITY_TONE, type AttentionItem, type Priority,
} from "@/platform/attention";
import { useCollections, useWorkspace, type Mutations } from "@/platform/workspace";

/* ====================================================================== *
 * INBOX engine — one attention model for every screen in this module.
 *
 * The platform builds the items (src/platform/attention.ts). This file joins
 * them to the notification record behind them, merges the triage state the
 * person has set, and writes that state back to a record so a toast is never
 * the only evidence that something was read, snoozed or resolved.
 * ====================================================================== */

/* ------------------------------ approvals ------------------------------ */

export type ApprovalTab = "Mine" | "Delegated" | "Pending" | "History";

export const DECIDED = new Set(["approved", "denied", "changes_requested"]);

/**
 * The approval requests a tab lists. Every surface that counts decisions
 * waiting on a person (the Inbox, the executive home) reads this, so they
 * cannot disagree.
 */
export function approvalRows(approvals: Rec[], tab: ApprovalTab, actor: string): Rec[] {
  if (tab === "History") return approvals.filter((row) => DECIDED.has(row.status));
  const open = approvals.filter((row) => !DECIDED.has(row.status));
  if (tab === "Mine") return open.filter((row) => String(row.fields.assignee ?? "") === actor);
  if (tab === "Delegated") return open.filter((row) => Boolean(row.fields.delegatedTo));
  return open;
}

/**
 * Whether an approval's target has changed since the request was raised. The
 * request records the target's revision at that moment (`targetRevision`);
 * a plan version is a different number and is never compared with a record
 * revision. A request that recorded no revision cannot be checked, which is
 * reported rather than guessed.
 */
export function targetDrift(request: Rec, target: Rec | undefined): { checked: boolean; drifted: boolean; boundRevision?: string } {
  const raw = request.fields.targetRevision;
  const boundRevision = raw === undefined || raw === "" ? undefined : String(raw);
  if (!target || boundRevision === undefined) return { checked: false, drifted: false, boundRevision };
  return { checked: true, drifted: String(target.revision) !== boundRevision, boundRevision };
}

export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];
export { PRIORITY_LABEL, PRIORITY_TONE };

/** Triage state for items that are derived rather than stored. */
export const TRIAGE_COLLECTION = "attentionState";

export interface InboxItem extends AttentionItem {
  /** `notification` items are backed by a record; `derived` items are computed. */
  sourceKind: "notification" | "derived";
  /** Which part of the workspace raised it. */
  sourceLabel: string;
  category: string;
  snoozedUntil?: string;
  snoozed: boolean;
  assignee?: string;
  record?: Rec;
  state?: Rec;
}

export interface TriagePatch {
  read?: boolean;
  acknowledged?: boolean;
  resolved?: boolean;
  snoozedUntil?: string | null;
  assignee?: string;
}

const KIND_SOURCE: Record<string, string> = {
  approval: "Approvals", overdue: "Finance", mention: "Comms", assignment: "Work",
  update: "Updates", system: "Platform", interruption: "Missions",
};

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Items currently on screen, so a toolbar action works on exactly the list the
 * person is looking at. A local convenience inside this module only: panels
 * publish, actions read.
 */
export const attentionBus: { items: InboxItem[] } = { items: [] };

export function usePublishedItems(items: InboxItem[]): void {
  useEffect(() => {
    attentionBus.items = items;
    return () => { if (attentionBus.items === items) attentionBus.items = []; };
  }, [items]);
}

export function busItem(id: string | undefined): InboxItem | undefined {
  return id ? attentionBus.items.find((item) => item.id === id) : undefined;
}

export const INBOX_COLLECTIONS = [
  "notifications", "invoices", "bills", "tasks", "missions", "approvals",
  "incidents", "messages", "preferences", TRIAGE_COLLECTION,
];

export interface InboxData {
  items: InboxItem[];
  /** Every item for the organisation, before the role view narrows it. */
  all: InboxItem[];
  hiddenByRole: number;
  data: Record<string, Rec[]>;
  rules: Rec[];
  channels: Rec[];
  categories: Rec[];
  digests: Rec[];
  quietHours: Rec[];
}

export function useInboxData(): InboxData {
  const data = useCollections(INBOX_COLLECTIONS);
  const { org, now, role } = useWorkspace();

  return useMemo(() => {
    const raw = buildAttention({
      notifications: data.notifications,
      invoices: data.invoices,
      bills: data.bills,
      tasks: data.tasks,
      missions: data.missions,
      approvals: data.approvals,
      orgSlug: org.slug,
      now,
    });

    const notificationsById = new Map(data.notifications.map((record) => [record.id, record]));
    const statesByItem = new Map(data[TRIAGE_COLLECTION].map((record) => [String(record.fields.itemId ?? ""), record]));

    const all: InboxItem[] = raw.map((item) => {
      const record = item.sourceId ? notificationsById.get(item.sourceId) : undefined;
      const state = statesByItem.get(item.id);
      const snoozedUntil = text(record?.fields.snoozeUntil) ?? text(state?.fields.snoozedUntil);
      const merged: InboxItem = {
        ...item,
        sourceKind: record ? "notification" : "derived",
        sourceLabel: text(record?.fields.source) ?? KIND_SOURCE[item.kind] ?? "Workspace",
        category: text(record?.fields.category) ?? (item.kind === "system" ? "security" : item.priority <= "P1" ? "milestone" : "routine"),
        group: text(record?.fields.group) ?? item.group,
        read: item.read || bool(state?.fields.read),
        acknowledged: item.acknowledged || bool(state?.fields.acknowledged),
        resolved: item.resolved || bool(state?.fields.resolved),
        snoozedUntil,
        snoozed: Boolean(snoozedUntil && new Date(snoozedUntil) > now),
        assignee: text(record?.fields.assignee) ?? text(state?.fields.assignee),
        record,
        state,
      };
      return merged;
    });

    const items = filterForRole(all, role) as InboxItem[];
    return {
      items,
      all,
      hiddenByRole: all.length - items.length,
      data,
      rules: data.preferences.filter((record) => record.fields.kind === "escalationRule"),
      channels: data.preferences.filter((record) => record.fields.kind === "notifyChannel"),
      categories: data.preferences.filter((record) => record.fields.kind === "notifyCategory"),
      digests: data.preferences.filter((record) => record.fields.kind === "digest"),
      quietHours: data.preferences.filter((record) => record.fields.kind === "quietHours"),
    };
  }, [data, org.slug, now, role]);
}

/**
 * Write triage state. Notification-backed items change their own record;
 * derived items get (or update) a small state record, so reading, snoozing and
 * resolving survive a reload either way.
 */
export async function writeTriage(
  mutate: Mutations,
  item: InboxItem,
  patch: TriagePatch,
  note: string,
): Promise<void> {
  const next = {
    read: patch.read ?? item.read,
    acknowledged: patch.acknowledged ?? item.acknowledged,
    resolved: patch.resolved ?? item.resolved,
    snoozedUntil: patch.snoozedUntil === null ? "" : patch.snoozedUntil ?? item.snoozedUntil ?? "",
    assignee: patch.assignee ?? item.assignee ?? "",
  };

  if (item.record) {
    await mutate.patch(item.record.id, {
      status: next.resolved ? "resolved" : item.record.status === "resolved" ? "open" : item.record.status,
      fields: {
        ...item.record.fields,
        read: next.read,
        acknowledged: next.acknowledged,
        resolved: next.resolved,
        snoozeUntil: next.snoozedUntil,
        assignee: next.assignee,
      },
    }, { event: note, expectRevision: item.record.revision });
    return;
  }

  if (item.state) {
    await mutate.patch(item.state.id, {
      status: next.resolved ? "resolved" : "triaged",
      fields: { ...item.state.fields, ...next },
    }, { event: note, expectRevision: item.state.revision });
    return;
  }

  await mutate.create({
    collection: TRIAGE_COLLECTION,
    title: item.title,
    status: next.resolved ? "resolved" : "triaged",
    summary: item.body,
    at: item.at,
    fields: {
      itemId: item.id,
      entityId: item.entityId ?? "",
      kind: item.kind,
      priority: item.priority,
      route: item.route ?? "",
      ...next,
    },
  }, note);
}

/** Which routing rule put this item in front of this role view. */
export function routeReason(item: InboxItem, rules: Rec[], role: Role): string {
  if (item.category === "security") {
    const floor = rules.find((rule) => rule.fields.securityFloor === true);
    return floor ? `${floor.title}: security items are never muted and reach every enabled channel.` : "Security items are never muted.";
  }
  const matched = rules.find((rule) => {
    const condition = String(rule.fields.condition ?? "");
    if (condition.startsWith("kind:")) return condition.slice(5) === item.kind;
    if (condition.startsWith("capability:")) return item.kind === "approval";
    return false;
  });
  if (matched) return `${matched.title}: ${String(matched.fields.condition)} escalates to ${String(matched.fields.backup)} after ${Number(matched.fields.timerMinutes) / 60} hours.`;
  if (item.audience.length === 0) return "Routed to everyone in the workspace; no audience was set on the source.";
  return `Routed to the ${item.audience.join(", ")} view${item.audience.includes(role) ? ` — which includes yours.` : "."}`;
}

export function activeQueue(items: InboxItem[]): InboxItem[] {
  return items.filter((item) => !item.resolved && !item.snoozed);
}

export function groupBy<T>(rows: T[], key: (row: T) => string): { label: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const label = key(row);
    const bucket = map.get(label);
    if (bucket) bucket.push(row);
    else map.set(label, [row]);
  }
  return [...map.entries()].map(([label, group]) => ({ label, rows: group })).sort((a, b) => b.rows.length - a.rows.length);
}

export function csv(value: unknown): string[] {
  return typeof value === "string" && value.trim().length > 0 ? value.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

/* ------------------------------------------------------------------ *
 * Local primitive: state seeded from a record that loads asynchronously.
 *
 * Every read in this workspace is a live query, so an overlay mounts one
 * render before its record exists. Plain useState would capture the empty
 * value and show a blank form. This adjusts the field while the person has
 * not touched it, which is React's documented "derive state during render"
 * pattern, and stops as soon as the seed stops changing.
 * ------------------------------------------------------------------ */
export function useSeeded<T extends string | number | boolean>(seed: T): [T, (next: T) => void] {
  const [value, setValue] = useState(seed);
  const [seen, setSeen] = useState(seed);
  if (seed !== seen) {
    setSeen(seed);
    setValue(seed);
  }
  return [value, setValue];
}

/** The same, for a comma-separated list held on a record. */
export function useSeededList(seedCsv: string): [string[], Dispatch<SetStateAction<string[]>>] {
  const [value, setValue] = useState<string[]>(() => csv(seedCsv));
  const [seen, setSeen] = useState(seedCsv);
  if (seedCsv !== seen) {
    setSeen(seedCsv);
    setValue(csv(seedCsv));
  }
  return [value, setValue];
}
