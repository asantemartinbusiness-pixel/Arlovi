import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * MISSION — task dates entered by a person.
 *
 * A task's start and due dates are typed by whoever plans the mission. They
 * are never inferred from estimates: there is no velocity history in this
 * workspace to infer them from. Given the dates people entered, this module
 * places tasks on the timeline and reports a task that starts before a task
 * it depends on is due.
 * ====================================================================== */

export interface TaskWindow {
  start?: string;
  end?: string;
}

export function windowOf(task: Pick<Rec, "startAt" | "dueAt">): TaskWindow {
  return { start: task.startAt || undefined, end: task.dueAt || undefined };
}

export function isScheduled(task: Pick<Rec, "startAt" | "dueAt">): boolean {
  return Boolean(task.startAt || task.dueAt);
}

/** `YYYY-MM-DD` from the date inputs; empty means "not set". */
export function dateProblems(start: string, due: string): Record<string, string> {
  const problems: Record<string, string> = {};
  const valid = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  if (!valid(start)) problems.start = "Use a real date.";
  if (!valid(due)) problems.due = "Use a real date.";
  if (!start && !due) problems.due = "Enter a start date, a due date or both.";
  if (start && due && valid(start) && valid(due) && due < start) problems.due = "The due date is before the start date.";
  return problems;
}

/** Stored as the start of the start day and the end of the due day, in UTC. */
export function toStored(start: string, due: string): { startAt?: string; dueAt?: string } {
  return {
    startAt: start ? `${start}T00:00:00.000Z` : undefined,
    dueAt: due ? `${due}T23:59:59.000Z` : undefined,
  };
}

export function toInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export interface DependencyConflict {
  taskId: string;
  dependsOnId: string;
  message: string;
}

/** A task that starts before something it depends on is due. Only dated pairs can be checked. */
export function dependencyConflicts(tasks: Rec[], dependenciesOf: (task: Rec) => string[]): DependencyConflict[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const out: DependencyConflict[] = [];
  for (const task of tasks) {
    const begins = task.startAt ?? task.dueAt;
    if (!begins) continue;
    for (const id of dependenciesOf(task)) {
      const before = byId.get(id);
      if (!before?.dueAt) continue;
      if (Date.parse(begins) < Date.parse(before.dueAt) && begins.slice(0, 10) < before.dueAt.slice(0, 10)) {
        out.push({ taskId: task.id, dependsOnId: id, message: `${task.title} starts before ${before.title} is due.` });
      }
    }
  }
  return out;
}

/** The span the schedule needs: every dated task, today and the mission due date, padded. */
export function scheduleRange(tasks: Rec[], missionDue: string | undefined, now: Date): { start: number; end: number } {
  const points = [
    now.getTime(),
    ...tasks.flatMap((task) => [task.startAt, task.dueAt]).filter((value): value is string => Boolean(value)).map(Date.parse),
    ...(missionDue ? [Date.parse(missionDue)] : []),
  ].filter(Number.isFinite);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = Math.max(86_400_000, (max - min) * 0.05);
  return { start: min - pad, end: max + pad };
}

/** Left offset and width as fractions of the range. A task with one date is drawn as a one-day bar. */
export function barGeometry(task: Pick<Rec, "startAt" | "dueAt">, range: { start: number; end: number }): { left: number; width: number; point: boolean } {
  const span = Math.max(1, range.end - range.start);
  const startMs = Date.parse(task.startAt ?? task.dueAt ?? "");
  const endMs = Date.parse(task.dueAt ?? task.startAt ?? "");
  const point = !task.startAt || !task.dueAt;
  const left = Math.min(1, Math.max(0, (startMs - range.start) / span));
  const right = Math.min(1, Math.max(0, (Math.max(endMs, startMs + 86_400_000 * (point ? 1 : 0)) - range.start) / span));
  return { left, width: Math.max(0.01, right - left), point };
}
