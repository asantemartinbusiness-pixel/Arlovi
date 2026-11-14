import type { Rec, Role } from "@/domain/types";
import { daysBetween } from "./clock";

/* ------------------------------------------------------------------ *
 * Attention engine.
 *
 * Audit A06: notifications were every record in the `notifications`
 * collection, for every organisation, with one Open button. Attention items
 * are now derived per organisation and per role, carry a priority, and keep
 * read, acknowledged and resolved as separate states. Reading an item never
 * approves it.
 * ------------------------------------------------------------------ */

export type Priority = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";

export type AttentionKind = "approval" | "overdue" | "mention" | "assignment" | "update" | "system" | "interruption";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  priority: Priority;
  title: string;
  body: string;
  route?: string;
  entityId?: string;
  at: string;
  /** Roles this item is routed to; empty means everyone in the workspace. */
  audience: Role[];
  read: boolean;
  acknowledged: boolean;
  resolved: boolean;
  /** Source record if the item is backed by one. */
  sourceId?: string;
  group: string;
}

export const PRIORITY_TONE: Record<Priority, "danger" | "warning" | "info" | "neutral"> = {
  P0: "danger", P1: "danger", P2: "warning", P3: "info", P4: "neutral", P5: "neutral",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "Critical", P1: "Urgent", P2: "High", P3: "Normal", P4: "Low", P5: "For information",
};

const APPROVAL_STATUSES = new Set(["awaiting_approval", "pending_approval", "submitted", "needs_review", "awaiting_review"]);

function boolField(record: Rec, key: string): boolean {
  return record.fields[key] === true || record.fields[key] === "true";
}

export interface AttentionInput {
  notifications: Rec[];
  invoices: Rec[];
  bills: Rec[];
  tasks: Rec[];
  missions: Rec[];
  approvals: Rec[];
  orgSlug: string;
  now: Date;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { orgSlug, now } = input;
  const items: AttentionItem[] = [];

  for (const record of input.notifications) {
    const priority = (typeof record.fields.priority === "string" && /^P[0-5]$/.test(record.fields.priority)
      ? record.fields.priority : "P3") as Priority;
    const audience = typeof record.fields.audience === "string"
      ? record.fields.audience.split(",").map((value) => value.trim()).filter(Boolean) as Role[]
      : [];
    items.push({
      id: record.id,
      kind: (record.fields.kind as AttentionKind) ?? "update",
      priority,
      title: record.title,
      body: record.summary,
      route: typeof record.fields.route === "string" ? record.fields.route.replace(":org", orgSlug) : undefined,
      entityId: typeof record.fields.entityId === "string" ? record.fields.entityId : undefined,
      at: record.at ?? record.updatedAt,
      audience,
      read: boolField(record, "read"),
      acknowledged: boolField(record, "acknowledged"),
      resolved: record.status === "resolved" || boolField(record, "resolved"),
      sourceId: record.id,
      group: "Updates",
    });
  }

  for (const record of input.approvals) {
    if (!APPROVAL_STATUSES.has(record.status)) continue;
    items.push({
      id: `approval-${record.id}`,
      kind: "approval",
      priority: (record.amountMinor ?? 0) > 500_000 ? "P1" : "P2",
      title: `Approve: ${record.title}`,
      body: record.summary || "Waiting for a decision before it can move on.",
      route: routeForRecord(record, orgSlug),
      entityId: record.id,
      at: record.updatedAt,
      audience: approverRoles(record.collection),
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: record.id,
      group: "Approvals",
    });
  }

  for (const invoice of input.invoices) {
    if (!invoice.dueAt || ["paid", "void", "draft", "cancelled"].includes(invoice.status)) continue;
    const overdueDays = daysBetween(new Date(invoice.dueAt), now);
    if (overdueDays <= 0) continue;
    items.push({
      id: `overdue-${invoice.id}`,
      kind: "overdue",
      priority: overdueDays > 30 ? "P1" : overdueDays > 14 ? "P2" : "P3",
      title: `${invoice.title} is ${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`,
      body: invoice.summary || "Receivable past its due date.",
      route: `/o/${orgSlug}/fin/invoices/${invoice.id}`,
      entityId: invoice.id,
      at: invoice.dueAt,
      audience: ["owner", "finance"],
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: invoice.id,
      group: "Overdue",
    });
  }

  for (const bill of input.bills) {
    if (!bill.dueAt || ["paid", "void", "cancelled"].includes(bill.status)) continue;
    const dueIn = daysBetween(now, new Date(bill.dueAt));
    if (dueIn > 7) continue;
    items.push({
      id: `bill-${bill.id}`,
      kind: dueIn < 0 ? "overdue" : "update",
      priority: dueIn < 0 ? "P1" : "P3",
      title: dueIn < 0 ? `${bill.title} is overdue to pay` : `${bill.title} is due in ${dueIn} ${dueIn === 1 ? "day" : "days"}`,
      body: bill.summary || "Payable approaching its due date.",
      route: `/o/${orgSlug}/fin/bills`,
      entityId: bill.id,
      at: bill.dueAt,
      audience: ["owner", "finance"],
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: bill.id,
      group: "Payables",
    });
  }

  for (const task of input.tasks) {
    if (!task.dueAt || task.status === "done" || task.status === "cancelled") continue;
    if (daysBetween(new Date(task.dueAt), now) <= 0) continue;
    items.push({
      id: `task-${task.id}`,
      kind: "assignment",
      priority: "P3",
      title: `${task.title} is past its date`,
      body: `Owned by ${task.ownerName}.`,
      route: `/o/${orgSlug}/project/tasks/${task.id}`,
      entityId: task.id,
      at: task.dueAt,
      audience: [],
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: task.id,
      group: "Work",
    });
  }

  for (const mission of input.missions) {
    if (mission.status !== "needs_decision" && mission.status !== "blocked" && mission.status !== "paused") continue;
    items.push({
      id: `mission-${mission.id}`,
      kind: "interruption",
      priority: mission.status === "needs_decision" ? "P1" : "P2",
      title: `${mission.title} is waiting on you`,
      body: mission.summary || "The mission stopped at a step that needs a human decision.",
      route: `/o/${orgSlug}/mission/missions/${mission.id}`,
      entityId: mission.id,
      at: mission.updatedAt,
      audience: ["owner"],
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: mission.id,
      group: "Missions",
    });
  }

  return items.sort((a, b) => (a.priority === b.priority ? b.at.localeCompare(a.at) : a.priority.localeCompare(b.priority)));
}

function approverRoles(collection: string): Role[] {
  if (collection === "invoices" || collection === "bills" || collection === "expenses" || collection === "journals") return ["owner", "finance"];
  if (collection === "deals" || collection === "quotes" || collection === "campaigns") return ["owner", "sales"];
  if (collection === "leaveRequests" || collection === "candidates") return ["owner", "people"];
  if (collection === "missions" || collection === "missionTasks") return ["owner"];
  return ["owner"];
}

export function routeForRecord(record: Rec, orgSlug: string): string | undefined {
  const map: Record<string, string> = {
    invoices: "fin/invoices", bills: "fin/bills", expenses: "fin/expenses", journals: "fin/ledger",
    deals: "crm/deals", contacts: "crm/contacts", companies: "crm/companies", quotes: "crm/quotes",
    employees: "hr/people", leaveRequests: "hr/leave", candidates: "hr/recruiting",
    projects: "project/projects", tasks: "project/tasks", missions: "mission/missions",
    agents: "team/agents", campaigns: "market/campaigns", products: "commerce/products",
    orders: "commerce/orders", bookings: "book/calendar", tickets: "care/tickets",
    documents: "docs/files", workbooks: "sheets/files", decks: "present/files",
    designs: "design/files", contracts: "legal/contracts", suppliers: "proc/suppliers",
  };
  const base = map[record.collection];
  if (!base) return undefined;
  const detailCollections = new Set(["invoices", "deals", "projects", "tasks", "missions", "agents", "contacts", "companies", "documents", "workbooks", "decks", "designs"]);
  return detailCollections.has(record.collection)
    ? `/o/${orgSlug}/${base}/${record.id}`
    : `/o/${orgSlug}/${base}`;
}

export function filterForRole(items: AttentionItem[], role: Role): AttentionItem[] {
  return items.filter((item) => item.audience.length === 0 || item.audience.includes(role));
}

export function attentionCounts(items: AttentionItem[]) {
  return {
    total: items.length,
    unread: items.filter((item) => !item.read && !item.resolved).length,
    approvals: items.filter((item) => item.kind === "approval" && !item.resolved).length,
    urgent: items.filter((item) => (item.priority === "P0" || item.priority === "P1") && !item.resolved).length,
  };
}
