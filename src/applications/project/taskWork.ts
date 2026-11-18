import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Task editing and project health, as pure functions.
 *
 * Subtasks are the checklist kept in a task's body. Dependencies are the
 * comma-separated ids in `fields.dependsOn`. Health signals are counted
 * from tasks and budget; the stored health is what a person declared,
 * and the two are shown side by side rather than one overwriting the other.
 * ------------------------------------------------------------------ */

export interface ChecklistItem { label: string; done: boolean }

export function addChecklistItem(items: ChecklistItem[], label: string): ChecklistItem[] {
  const clean = label.trim();
  if (!clean) return items;
  if (items.some((item) => item.label.trim().toLowerCase() === clean.toLowerCase())) return items;
  return [...items, { label: clean, done: false }];
}

export function removeChecklistItem(items: ChecklistItem[], index: number): ChecklistItem[] {
  return items.filter((_, position) => position !== index);
}

export function moveChecklistItem(items: ChecklistItem[], index: number, delta: -1 | 1): ChecklistItem[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function dependencyIds(task: Rec): string[] {
  return String(task.fields.dependsOn ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function withoutDependency(task: Rec, id: string): string {
  return dependencyIds(task).filter((existing) => existing !== id).join(",");
}

const DONE = (task: Rec) => String(task.fields.stage ?? task.status) === "done";

/** Dependencies that are not done yet: the reasons a task cannot really start. */
export function unfinishedDependencies(task: Rec, tasks: Rec[]): Rec[] {
  return dependencyIds(task).map((id) => tasks.find((row) => row.id === id)).filter((row): row is Rec => Boolean(row) && !DONE(row as Rec));
}

export type HealthLevel = "on_track" | "at_risk" | "off_track";

export interface HealthSignal { label: string; level: HealthLevel }

export interface HealthCheck {
  computed: HealthLevel;
  signals: HealthSignal[];
  lateCount: number;
  blockedCount: number;
  waitingCount: number;
  budgetRatio: number | null;
}

function dueOf(task: Rec): string | undefined {
  return task.endAt ?? task.dueAt;
}

export function healthCheck(project: Rec, tasks: Rec[], now: Date): HealthCheck {
  const open = tasks.filter((task) => !DONE(task));
  const late = open.filter((task) => {
    const due = dueOf(task);
    return Boolean(due) && new Date(due as string) < now;
  });
  const blocked = open.filter((task) => String(task.fields.stage ?? task.status) === "blocked");
  const waiting = open.filter((task) => unfinishedDependencies(task, tasks).length > 0 && String(task.fields.stage ?? task.status) !== "backlog");
  const budget = Number(project.fields.budgetMinor ?? 0);
  const spent = Number(project.fields.spentMinor ?? 0);
  const budgetRatio = budget > 0 ? spent / budget : null;
  const signals: HealthSignal[] = [];
  const share = tasks.length ? late.length / tasks.length : 0;
  if (late.length) signals.push({ label: `${late.length} open ${late.length === 1 ? "task is" : "tasks are"} past ${late.length === 1 ? "its" : "their"} date`, level: share >= 0.25 ? "off_track" : "at_risk" });
  if (blocked.length) signals.push({ label: `${blocked.length} ${blocked.length === 1 ? "task is" : "tasks are"} in Blocked`, level: blocked.length >= 3 ? "off_track" : "at_risk" });
  if (waiting.length) signals.push({ label: `${waiting.length} started ${waiting.length === 1 ? "task waits" : "tasks wait"} on unfinished work`, level: "at_risk" });
  if (budgetRatio !== null && budgetRatio > 1) signals.push({ label: `Spend is ${Math.round(budgetRatio * 100)}% of budget`, level: "off_track" });
  else if (budgetRatio !== null && budgetRatio > 0.9) signals.push({ label: `Spend is ${Math.round(budgetRatio * 100)}% of budget`, level: "at_risk" });
  const endAt = project.endAt ?? project.dueAt;
  if (endAt && new Date(endAt) < now && open.length > 0) signals.push({ label: "The project end date has passed with work open", level: "off_track" });
  const computed: HealthLevel = signals.some((signal) => signal.level === "off_track") ? "off_track" : signals.length ? "at_risk" : "on_track";
  return { computed, signals, lateCount: late.length, blockedCount: blocked.length, waitingCount: waiting.length, budgetRatio };
}
