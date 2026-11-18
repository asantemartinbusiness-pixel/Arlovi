import type { Rec } from "@/domain/types";
import type { SlaState, SlaStatus } from "./sla";

/* ------------------------------------------------------------------ *
 * Case triage.
 *
 * Pure rules for the queue a case belongs to, the order a queue is worked
 * in, the status moves a case may make, and the reasons a case can be
 * resolved with. The SLA state is passed in so these stay clock-free.
 * ------------------------------------------------------------------ */

export const OPEN_STATUSES = ["new", "open", "waiting", "pending"] as const;
export const CLOSED_STATUSES = ["resolved", "closed"] as const;

export function isOpen(ticket: Rec): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(ticket.status);
}

export function isBreachingOrAtRisk(state: SlaState): boolean {
  return state.status === "breached" || state.status === "at_risk";
}

const SLA_ORDER: Record<SlaStatus, number> = { breached: 0, at_risk: 1, due: 2, paused: 3, unknown: 4, met: 5 };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Comparator: worst clock first, then least time left, then priority, then oldest. */
export function triageCompare(a: { ticket: Rec; state: SlaState }, b: { ticket: Rec; state: SlaState }): number {
  return (SLA_ORDER[a.state.status] - SLA_ORDER[b.state.status])
    || (a.state.remainingMinutes - b.state.remainingMinutes)
    || ((PRIORITY_ORDER[String(a.ticket.fields.priority ?? "normal")] ?? 9) - (PRIORITY_ORDER[String(b.ticket.fields.priority ?? "normal")] ?? 9))
    || (a.ticket.at ?? "").localeCompare(b.ticket.at ?? "");
}

export interface QueueCounts { mine: number; unassigned: number; breaching: number; open: number }

export function queueCounts(tickets: Rec[], actor: string, stateOf: (ticket: Rec) => SlaState): QueueCounts {
  const open = tickets.filter(isOpen);
  return {
    open: open.length,
    mine: open.filter((ticket) => String(ticket.fields.assignee ?? "") === actor).length,
    unassigned: open.filter((ticket) => !ticket.fields.assignee).length,
    breaching: open.filter((ticket) => isBreachingOrAtRisk(stateOf(ticket))).length,
  };
}

/** Where a case may go from where it is. Resolving goes through the resolution form. */
export const TRANSITIONS: Record<string, string[]> = {
  new: ["open", "waiting"],
  open: ["waiting"],
  waiting: ["open"],
  pending: ["open"],
  resolved: ["closed"],
  closed: [],
};

export const STATUS_LABEL: Record<string, string> = {
  new: "New", open: "Open", waiting: "Waiting on customer", pending: "Pending", resolved: "Resolved", closed: "Closed",
};

export function allowedMoves(status: string): string[] {
  return TRANSITIONS[status] ?? [];
}

export function canMove(from: string, to: string): boolean {
  return allowedMoves(from).includes(to);
}

export const RESOLUTION_REASONS = [
  "Answered",
  "Replacement arranged",
  "Refund requested from finance",
  "Fixed by the customer",
  "Duplicate case",
  "No reply from the customer",
  "Not something we can help with",
] as const;

/** A reply recorded with no provider connected was never delivered. */
export function deliveryOf(message: Rec): "internal" | "received" | "not_sent" | "sent" | "draft" {
  if (message.fields.internal === true) return "internal";
  if (message.fields.side !== "agent") return "received";
  if (message.status === "draft") return "draft";
  if (message.fields.delivery === "not_sent" || message.status === "recorded") return "not_sent";
  return "sent";
}
