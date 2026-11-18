import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * HR leaver checklist — the steps a recorded departure hands to People,
 * Finance, the manager and Administration.
 *
 * Arlovi records decisions; it does not disable external accounts. The
 * "Admin access" steps are completed only from Administration, where the
 * workspace member is suspended and their sessions and keys revoked in this
 * workspace. Everything else is a checklist a named person ticks.
 * ====================================================================== */

export const LEAVER_KIND = "offboarding";
export const ADMIN_GROUP = "Admin access";

export interface LeaverStep {
  key: string;
  title: string;
  group: "People" | "Finance" | "Manager" | typeof ADMIN_GROUP;
  assignee: string;
  status: "ready" | "waiting";
  detail: string;
}

export interface LeaverFacts {
  name: string;
  manager: string;
  actor: string;
  /** Untaken leave days, or null when the allowance is not recorded. */
  leaveLeft: number | null;
  /** Whether a workspace member record carries this person's name. */
  hasMember: boolean;
  activeSessions: number;
}

export function leaverSteps(facts: LeaverFacts): LeaverStep[] {
  const manager = facts.manager && facts.manager !== "Unassigned" ? facts.manager : facts.actor;
  return [
    {
      key: "equipment", title: "Equipment, keys and documents returned", group: "People", assignee: facts.actor, status: "ready",
      detail: "Laptop, building keys and any confidential documents are returned or accounted for.",
    },
    {
      key: "final-pay", title: "Final pay inputs agreed", group: "Finance", assignee: facts.actor, status: "ready",
      detail: facts.leaveLeft === null
        ? "Leave allowance is not recorded; confirm untaken leave before the final run."
        : `${facts.leaveLeft} ${facts.leaveLeft === 1 ? "day" : "days"} of untaken leave to settle in the final pay run.`,
    },
    {
      key: "handover", title: "Work handed over", group: "Manager", assignee: manager, status: "ready",
      detail: "Open tasks, customer threads and recurring meetings have a new owner.",
    },
    {
      key: "workspace-access", title: "Workspace access suspended in Administration", group: ADMIN_GROUP, assignee: "Administration", status: "waiting",
      detail: facts.hasMember
        ? `Suspend ${facts.name}'s member record and revoke ${facts.activeSessions} active ${facts.activeSessions === 1 ? "session" : "sessions"} and any keys they created.`
        : `No workspace member carries this name. Administration confirms there is nothing to suspend.`,
    },
  ];
}

export function leaverTasks(tasks: Rec[], employeeId: string): Rec[] {
  return tasks.filter((task) => task.fields.kind === LEAVER_KIND && task.fields.employeeId === employeeId);
}

/** Admin access steps still waiting, across every leaver. */
export function pendingAdminHandoffs(tasks: Rec[]): Rec[] {
  return tasks
    .filter((task) => task.fields.kind === LEAVER_KIND && task.fields.group === ADMIN_GROUP && task.status !== "done")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function leaverProgress(tasks: Rec[]): { done: number; total: number; waitingOnAdmin: boolean } {
  return {
    done: tasks.filter((task) => task.status === "done").length,
    total: tasks.length,
    waitingOnAdmin: tasks.some((task) => task.fields.group === ADMIN_GROUP && task.status !== "done"),
  };
}
