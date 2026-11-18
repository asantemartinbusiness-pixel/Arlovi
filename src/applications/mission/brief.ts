import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Mission brief, milestones, participants and execution status — pure
 * functions over mission records. Nothing here runs work: status is read
 * from steps, receipts and tasks that are already recorded.
 * ====================================================================== */

export interface MissionBrief {
  objective: string;
  inScope: string;
  outOfScope: string;
  constraints: string;
  successMeasure: string;
}

export const EMPTY_BRIEF: MissionBrief = { objective: "", inScope: "", outOfScope: "", constraints: "", successMeasure: "" };

export interface Milestone {
  id: string;
  title: string;
  /** ISO date-time; end of the due day. */
  dueAt: string;
  taskIds: string[];
}

export type ParticipantRole = "owner" | "contributor" | "reviewer" | "approver" | "observer";

export interface Participant {
  id: string;
  /** Member or agent record id. */
  recordId: string;
  name: string;
  kind: "human" | "ai";
  role: ParticipantRole;
  addedBy: string;
  addedAt: string;
}

export const PARTICIPANT_ROLE_LABEL: Record<ParticipantRole, string> = {
  owner: "Owner", contributor: "Contributor", reviewer: "Reviewer", approver: "Approver", observer: "Observer",
};

interface MissionBody {
  criteria?: unknown[];
  brief?: Partial<MissionBrief>;
  milestones?: Milestone[];
  participants?: Participant[];
}

export function briefOf(mission: Rec | undefined): MissionBrief {
  const body = (mission?.body ?? {}) as MissionBody;
  return {
    ...EMPTY_BRIEF,
    objective: mission?.summary ?? "",
    ...Object.fromEntries(Object.entries(body.brief ?? {}).filter(([, value]) => typeof value === "string")),
  };
}

export function milestonesOf(mission: Rec | undefined): Milestone[] {
  const body = (mission?.body ?? {}) as MissionBody;
  return (body.milestones ?? []).filter((item) => item && typeof item.title === "string");
}

export function participantsOf(mission: Rec | undefined): Participant[] {
  const body = (mission?.body ?? {}) as MissionBody;
  return (body.participants ?? []).filter((item) => item && typeof item.name === "string");
}

export function briefProblems(brief: MissionBrief): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!brief.objective.trim()) problems.objective = "State what the mission must achieve.";
  else if (brief.objective.trim().length > 600) problems.objective = "Keep the objective under 600 characters.";
  if (!brief.successMeasure.trim()) problems.successMeasure = "Say how a person will know it succeeded.";
  return problems;
}

/** Fraction of a brief that is written, for the completeness meter. */
export function briefCompleteness(brief: MissionBrief): number {
  const parts = [brief.objective, brief.inScope, brief.outOfScope, brief.constraints, brief.successMeasure];
  return parts.filter((part) => part.trim()).length / parts.length;
}

export type MilestoneState = "reached" | "on_track" | "at_risk" | "overdue" | "empty";

export interface MilestoneStatus {
  state: MilestoneState;
  verified: number;
  total: number;
  /** Whole days until due; negative when past. */
  days: number;
}

const DONE = new Set(["verified", "done"]);

export function taskDone(task: Rec): boolean {
  return DONE.has(String(task.fields.stage ?? task.status));
}

/**
 * A milestone is reached only when every linked task is verified. Before
 * that it is overdue after its date, at risk inside the last three days with
 * work outstanding, and on track otherwise. No linked task means "empty":
 * there is nothing to measure it by.
 */
export function milestoneStatus(milestone: Milestone, tasks: Rec[], now: Date): MilestoneStatus {
  const linked = tasks.filter((task) => milestone.taskIds.includes(task.id));
  const verified = linked.filter(taskDone).length;
  const due = Date.parse(milestone.dueAt);
  const days = Number.isFinite(due) ? Math.floor((due - now.getTime()) / 86_400_000) : 0;
  if (linked.length === 0) return { state: "empty", verified, total: 0, days };
  if (verified === linked.length) return { state: "reached", verified, total: linked.length, days };
  if (Number.isFinite(due) && due < now.getTime()) return { state: "overdue", verified, total: linked.length, days };
  if (days <= 3) return { state: "at_risk", verified, total: linked.length, days };
  return { state: "on_track", verified, total: linked.length, days };
}

export function milestoneProblems(input: { title: string; dueDate: string; taskIds: string[] }, existing: Milestone[], editingId?: string): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!input.title.trim()) problems.title = "Name the milestone.";
  else if (existing.some((item) => item.id !== editingId && item.title.trim().toLowerCase() === input.title.trim().toLowerCase())) problems.title = "Another milestone has this name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) problems.dueDate = "Set a date.";
  if (input.taskIds.length === 0) problems.taskIds = "Link at least one task, or there is nothing to measure it by.";
  return problems;
}

export function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/* ------------------------------ Participants ----------------------------- */

export interface Roster {
  name: string;
  recordId?: string;
  kind: "human" | "ai";
  role: ParticipantRole | "assignee";
  explicit: boolean;
  held: number;
  verified: number;
  participantId?: string;
}

/** Explicit participants plus everyone holding a task, each once. */
export function roster(participants: Participant[], tasks: Rec[]): Roster[] {
  const rows: Roster[] = participants.map((participant) => {
    const held = tasks.filter((task) => String(task.fields.assignee ?? "") === participant.name);
    return {
      name: participant.name, recordId: participant.recordId, kind: participant.kind, role: participant.role, explicit: true,
      held: held.length, verified: held.filter(taskDone).length, participantId: participant.id,
    };
  });
  for (const task of tasks) {
    const name = String(task.fields.assignee ?? "");
    if (!name || rows.some((row) => row.name === name)) continue;
    const held = tasks.filter((item) => String(item.fields.assignee ?? "") === name);
    rows.push({ name, kind: task.fields.kind === "ai" ? "ai" : "human", role: "assignee", explicit: false, held: held.length, verified: held.filter(taskDone).length });
  }
  return rows;
}

export function canRemoveParticipant(row: Roster): string | undefined {
  if (!row.explicit) return "Assigned by a task. Reassign the task to remove them.";
  if (row.held > 0) return `Holds ${row.held} task${row.held === 1 ? "" : "s"}. Reassign first.`;
  return undefined;
}

/* ---------------------------- Execution status ---------------------------- */

export interface ExecutionSummary {
  label: string;
  tone: "success" | "info" | "warning" | "danger" | "neutral";
  ranLocally: number;
  stoppedAtBoundary: number;
  awaitingApproval: number;
  pending: number;
  aiTasksOpen: number;
  lines: string[];
}

/** Read-only summary of what actually happened, from step and task records. */
export function executionSummary(mission: Rec, steps: Rec[], tasks: Rec[]): ExecutionSummary {
  const ranLocally = steps.filter((step) => step.status === "done").length;
  const stoppedAtBoundary = steps.filter((step) => ["blocked", "unknown_side_effect", "failed"].includes(step.status)).length;
  const awaitingApproval = tasks.filter((task) => task.fields.approvalRequired === true && !taskDone(task)).length;
  const pending = steps.filter((step) => !["done", "blocked", "unknown_side_effect", "failed", "skipped"].includes(step.status)).length;
  const aiTasksOpen = tasks.filter((task) => task.fields.kind === "ai" && !taskDone(task)).length;
  const paused = mission.fields.executionPaused === true || mission.status === "paused";
  const lines = [
    `${ranLocally} step${ranLocally === 1 ? "" : "s"} ran in this browser against local records.`,
    stoppedAtBoundary > 0
      ? `${stoppedAtBoundary} step${stoppedAtBoundary === 1 ? "" : "s"} stopped at a provider boundary, each with a receipt.`
      : "No step has stopped at a provider boundary.",
    awaitingApproval > 0 ? `${awaitingApproval} task${awaitingApproval === 1 ? " waits" : "s wait"} on a person's approval.` : "No approval is outstanding.",
    aiTasksOpen > 0
      ? `${aiTasksOpen} open task${aiTasksOpen === 1 ? " is" : "s are"} assigned to AI employees; with no model connected they are done by local steps or by a person, never generated.`
      : "No open task is assigned to an AI employee.",
  ];
  let label = "Not started";
  let tone: ExecutionSummary["tone"] = "neutral";
  if (mission.status === "completed") { label = "Completed"; tone = "success"; }
  else if (mission.status === "cancelled" || mission.status === "archived") { label = mission.status === "archived" ? "Archived" : "Cancelled"; tone = "neutral"; }
  else if (["proposed", "draft"].includes(mission.status)) { label = "Plan awaiting approval"; tone = "neutral"; }
  else if (paused) { label = "Paused by a person"; tone = "warning"; }
  else if (stoppedAtBoundary > 0) { label = "Partly blocked"; tone = "warning"; }
  else if (awaitingApproval > 0 && pending === 0) { label = "Waiting on approval"; tone = "info"; }
  else if (ranLocally > 0) { label = "In progress (local steps)"; tone = "info"; }
  return { label, tone, ranLocally, stoppedAtBoundary, awaitingApproval, pending, aiTasksOpen, lines };
}

/* ------------------------------- Timeline -------------------------------- */

export interface TimelineRange { start: number; end: number }

/** A date range that covers every milestone, the mission due date and today, padded. */
export function timelineRange(milestones: Milestone[], missionDue: string | undefined, now: Date): TimelineRange {
  const points = [now.getTime(), ...milestones.map((item) => Date.parse(item.dueAt)), ...(missionDue ? [Date.parse(missionDue)] : [])].filter(Number.isFinite);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = Math.max(2 * 86_400_000, (max - min) * 0.08);
  return { start: min - pad, end: max + pad };
}

export function positionIn(range: TimelineRange, iso: string): number {
  const value = Date.parse(iso);
  if (!Number.isFinite(value) || range.end <= range.start) return 0;
  return Math.min(1, Math.max(0, (value - range.start) / (range.end - range.start)));
}
