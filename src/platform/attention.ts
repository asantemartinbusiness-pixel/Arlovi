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
  /** Live task owner or named decision recipient, if the source records one. */
  assignee?: string;
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
  shifts?: Rec[];
  missions: Rec[];
  approvals: Rec[];
  workflowApprovals?: Rec[];
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
      assignee: typeof record.fields.assignee === "string" ? record.fields.assignee : undefined,
      read: false,
      acknowledged: false,
      resolved: false,
      sourceId: record.id,
      group: "Approvals",
    });
  }

  // Submitted timesheets are genuine People decisions. They disappear from
  // Inbox as soon as a recorded approval succeeds, with no separate fake alert.
  for (const entry of input.shifts ?? []) {
    if (entry.collection !== "shifts" || entry.fields.kind !== "time"
      || entry.fields.approved === true || entry.status === "approved"
      || !["submitted", "pending", "ready"].includes(entry.status)) continue;
    const hours = Number(entry.fields.hours ?? 0);
    items.push({
      id: `time-approval-${entry.id}`,
      kind: "approval", priority: "P2",
      title: `Approve time: ${String(entry.fields.employeeName ?? entry.ownerName)}`,
      body: `${Number.isFinite(hours) ? hours : "Unverified"} hours submitted for human review. Payroll is not submitted by this approval.`,
      route: `/o/${orgSlug}/hr/scheduling?tab=Timesheets`,
      entityId: entry.id, at: entry.updatedAt,
      audience: ["owner", "people"],
      assignee: typeof entry.fields.approver === "string" && entry.fields.approver.trim()
        ? entry.fields.approver : undefined,
      read: false, acknowledged: false, resolved: false,
      sourceId: entry.id, group: "Time approvals",
    });
  }

  // Task-completion reviews belong to the same decision inbox as financial
  // approvals. Reading or acknowledging them must never close the request.
  // Their actual decision action stays inside the scoped task-approval board.
  for (const request of input.workflowApprovals ?? []) {
    if (request.collection !== "workflowApprovals" || request.status !== "awaiting_approval") continue;
    const projectId = typeof request.fields.projectId === "string" ? request.fields.projectId : null;
    const departmentId = typeof request.fields.departmentId === "string" ? request.fields.departmentId : null;
    const route = projectId
      ? `/o/${orgSlug}/workspace/work/project/${encodeURIComponent(projectId)}?tab=approvals`
      : departmentId
        ? `/o/${orgSlug}/workspace/spaces/department/${encodeURIComponent(departmentId)}?tab=approvals`
        : `/o/${orgSlug}/workspace/work`;
    items.push({
      id: `task-approval-${request.id}`, kind: "approval", priority: "P2",
      title: request.title, body: request.summary || "Task completion is waiting for human review.",
      route, entityId: request.id, at: request.updatedAt,
      audience: ["owner"],
      assignee: typeof request.fields.assignee === "string" ? request.fields.assignee : undefined,
      read: false, acknowledged: false, resolved: false,
      sourceId: request.id, group: "Task completion approvals",
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
      // "Mine" in Inbox must follow the actual Project assignee, not a stale
      // notification triage override or everyone else's overdue tasks.
      assignee: String(task.fields.assignee || task.ownerName),
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

/** List and detail screens for each collection; checked against the catalogue in tests. */
export const RECORD_ROUTES: Record<string, { list: string; detail?: string }> = {
  invoices: { list: "fin/invoices", detail: "fin/invoices" }, bills: { list: "fin/bills" }, expenses: { list: "fin/expenses" }, journals: { list: "fin/ledger" },
  deals: { list: "crm/deals", detail: "crm/deals" }, contacts: { list: "crm/contacts", detail: "crm/contacts" }, companies: { list: "crm/companies" }, quotes: { list: "crm/quotes" },
  employees: { list: "hr/employees", detail: "hr/employees" }, leaveRequests: { list: "hr/leave" }, candidates: { list: "hr/recruitment", detail: "hr/candidates" },
  projects: { list: "project/projects", detail: "project/projects" }, tasks: { list: "project/projects", detail: "project/tasks" },
  missions: { list: "mission/missions", detail: "mission/missions" }, agents: { list: "team/agents", detail: "team/agents" },
  campaigns: { list: "market/campaigns", detail: "market/campaigns" }, products: { list: "commerce/products", detail: "commerce/products" },
  orders: { list: "commerce/orders", detail: "commerce/orders" }, bookings: { list: "book/calendar", detail: "book/bookings" }, tickets: { list: "care/tickets", detail: "care/tickets" },
  documents: { list: "docs/files", detail: "docs/documents" }, workbooks: { list: "sheets/workbooks", detail: "sheets/workbooks" }, decks: { list: "present/decks", detail: "present/decks" },
  designs: { list: "design/files", detail: "design/files" }, contracts: { list: "legal/contracts", detail: "legal/contracts" }, suppliers: { list: "proc/suppliers", detail: "proc/suppliers" },
};

export function routeForRecord(record: Rec, orgSlug: string): string | undefined {
  const route = RECORD_ROUTES[record.collection];
  if (!route) return undefined;
  return route.detail ? `/o/${orgSlug}/${route.detail}/${record.id}` : `/o/${orgSlug}/${route.list}`;
}

/** A person's Inbox "Mine" lens must not contain somebody else's tasks. */
export function mineAttentionItems<T extends AttentionItem>(items: T[], actor: string): T[] {
  return items.filter((item) => item.assignee === actor
    || (item.kind === "approval" && !item.assignee));
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

/** Action counts are state-driven. An item remains actionable when read. */
export function isDecisionItem(item: AttentionItem): boolean {
  return !item.resolved && (item.kind === "approval" || item.kind === "assignment" || item.kind === "interruption");
}
export function isNotificationItem(item: AttentionItem): boolean {
  return !item.resolved && (item.kind === "update" || item.kind === "mention" || item.kind === "system" || item.kind === "overdue");
}
export function headerAttentionCounts(items: AttentionItem[]): { decisions: number; unreadUpdates: number } {
  return {
    decisions: items.filter(isDecisionItem).length,
    unreadUpdates: items.filter(item => isNotificationItem(item) && !item.read).length,
  };
}
