import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * HQ command-centre model — pure rules behind objectives, key results,
 * department health and the decision log. No React, so it is unit tested.
 * ====================================================================== */

export interface KeyResult {
  id: string;
  title: string;
  /** Where the measure stood when the key result was set. */
  start: number;
  current: number;
  target: number;
  unit: string;
  owner?: string;
  updatedAt?: string;
}

export interface CheckIn {
  at: string;
  by: string;
  note: string;
  /** Objective progress (0–1) after this check-in. */
  progress: number;
}

export type Confidence = "on_track" | "at_risk" | "off_track";

export const CONFIDENCE_LABEL: Record<Confidence, string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };
export const CONFIDENCE_TONE: Record<Confidence, "success" | "warning" | "danger"> = { on_track: "success", at_risk: "warning", off_track: "danger" };

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Key results stored on the objective's body; malformed entries are dropped, not guessed. */
export function keyResults(objective: Rec): KeyResult[] {
  const body = objective.body as { keyResults?: unknown } | undefined;
  if (!body || !Array.isArray(body.keyResults)) return [];
  return body.keyResults.flatMap((raw): KeyResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.title !== "string") return [];
    return [{
      id: entry.id, title: entry.title, start: num(entry.start), current: num(entry.current), target: num(entry.target),
      unit: typeof entry.unit === "string" ? entry.unit : "", owner: typeof entry.owner === "string" ? entry.owner : undefined,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    }];
  });
}

export function checkIns(objective: Rec): CheckIn[] {
  const body = objective.body as { checkIns?: unknown } | undefined;
  if (!body || !Array.isArray(body.checkIns)) return [];
  return body.checkIns.filter((entry): entry is CheckIn => Boolean(entry) && typeof (entry as CheckIn).at === "string");
}

/**
 * Progress from start to target, 0–1, in either direction: "cut lead time
 * from 19 to 14 days" is half done at 16.5.
 */
export function krProgress(kr: Pick<KeyResult, "start" | "current" | "target">): number {
  const span = kr.target - kr.start;
  if (span === 0) return kr.current === kr.target ? 1 : 0;
  return Math.max(0, Math.min(1, (kr.current - kr.start) / span));
}

export interface ObjectiveProgress {
  ratio: number;
  source: "key results" | "measure" | "none";
  done: number;
  total: number;
}

/** Objective progress: the mean of its key results, else its single measure. */
export function objectiveProgress(objective: Rec): ObjectiveProgress {
  const list = keyResults(objective);
  if (list.length) {
    const values = list.map(krProgress);
    return { ratio: values.reduce((sum, value) => sum + value, 0) / values.length, source: "key results", done: values.filter((value) => value >= 1).length, total: list.length };
  }
  const target = num(objective.fields.target, Number.NaN);
  const current = num(objective.fields.current, Number.NaN);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return { ratio: 0, source: "none", done: 0, total: 0 };
  const baseline = num(objective.fields.baseline, Number.NaN);
  const ratio = Number.isFinite(baseline)
    ? krProgress({ start: baseline, current, target })
    : target === 0 ? (current === 0 ? 1 : 0) : Math.max(0, Math.min(1, current / target));
  return { ratio, source: "measure", done: ratio >= 1 ? 1 : 0, total: 1 };
}

/** Share of the objective's period that has elapsed, when it has one. */
export function expectedProgress(objective: Rec, now: Date): number | undefined {
  const start = objective.startAt ?? (typeof objective.fields.periodStart === "string" ? objective.fields.periodStart : undefined);
  const end = objective.dueAt ?? (typeof objective.fields.periodEnd === "string" ? objective.fields.periodEnd : undefined);
  if (!start || !end) return undefined;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined;
  return Math.max(0, Math.min(1, (now.getTime() - from) / (to - from)));
}

/**
 * Confidence: a person's call when they have made one, otherwise computed
 * from progress against the time elapsed (or against fixed bands without a period).
 */
export function confidence(objective: Rec, now: Date): { value: Confidence; set: "owner" | "computed"; reason: string } {
  const manual = String(objective.fields.confidence ?? "");
  if (manual === "on_track" || manual === "at_risk" || manual === "off_track") {
    return { value: manual, set: "owner", reason: `Set by ${String(objective.fields.confidenceBy ?? objective.ownerName)}` };
  }
  const { ratio } = objectiveProgress(objective);
  const expected = expectedProgress(objective, now);
  const pct = Math.round(ratio * 100);
  if (expected !== undefined) {
    const gap = expected - ratio;
    const reason = `${pct}% done with ${Math.round(expected * 100)}% of the period gone`;
    if (gap <= 0.1) return { value: "on_track", set: "computed", reason };
    if (gap <= 0.25) return { value: "at_risk", set: "computed", reason };
    return { value: "off_track", set: "computed", reason };
  }
  const reason = `${pct}% of the way to target`;
  if (ratio >= 0.7) return { value: "on_track", set: "computed", reason };
  if (ratio >= 0.4) return { value: "at_risk", set: "computed", reason };
  return { value: "off_track", set: "computed", reason };
}

/* ----------------------------- Key result edits ----------------------------- */

export function withCheckIn(list: KeyResult[], values: Record<string, number>, at: string): KeyResult[] {
  return list.map((kr) => (values[kr.id] !== undefined && values[kr.id] !== kr.current ? { ...kr, current: values[kr.id], updatedAt: at } : kr));
}

export function newKeyResultId(list: KeyResult[]): string {
  let n = list.length + 1;
  while (list.some((kr) => kr.id === `kr-${n}`)) n += 1;
  return `kr-${n}`;
}

export function validateKeyResult(input: { title: string; start: string; target: string }): string | undefined {
  if (!input.title.trim()) return "Name the key result.";
  if (input.target.trim() === "" || !Number.isFinite(Number(input.target))) return "A key result needs a numeric target.";
  if (input.start.trim() !== "" && !Number.isFinite(Number(input.start))) return "The starting value must be a number.";
  return undefined;
}

/* ----------------------------- Department health ----------------------------- */

export interface DepartmentHealth {
  id: string;
  title: string;
  people: number;
  agents: number;
  open: number;
  overdue: number;
  highRisks: number;
  behind: number;
  status: "attention" | "watch" | "steady";
  reasons: string[];
}

export function departmentHealth(
  department: Rec,
  input: { members: Rec[]; tasks: Rec[]; risks: Rec[]; objectives: Rec[]; now: Date },
): DepartmentHealth {
  const members = input.members.filter((member) => member.fields.departmentId === department.id);
  const names = new Set(members.map((member) => member.title));
  const lead = String(department.fields.lead ?? "");
  if (lead) names.add(lead);
  const work = input.tasks.filter((task) => names.has(String(task.fields.assignee ?? task.ownerName)) || task.fields.departmentId === department.id);
  const open = work.filter((task) => !["done", "cancelled", "archived"].includes(task.status));
  const overdue = open.filter((task) => task.dueAt && Date.parse(task.dueAt) < input.now.getTime());
  const risks = input.risks.filter((risk) => risk.status !== "closed" && (names.has(String(risk.fields.owner ?? "")) || risk.fields.departmentId === department.id));
  const highRisks = risks.filter((risk) => ["high", "critical"].includes(String(risk.fields.severity ?? "")));
  const objectives = input.objectives.filter((objective) => objective.status === "active" && objective.fields.departmentId === department.id);
  const behind = objectives.filter((objective) => confidence(objective, input.now).value === "off_track");

  const reasons: string[] = [];
  if (overdue.length) reasons.push(`${overdue.length} overdue ${overdue.length === 1 ? "task" : "tasks"}`);
  if (highRisks.length) reasons.push(`${highRisks.length} high ${highRisks.length === 1 ? "risk" : "risks"}`);
  if (behind.length) reasons.push(`${behind.length} ${behind.length === 1 ? "objective" : "objectives"} off track`);
  const humans = members.filter((member) => member.fields.kind !== "ai").length;
  if (!lead) reasons.push("no lead assigned");
  if (humans > 0 && open.length > humans * 6) reasons.push(`${open.length} open tasks for ${humans} ${humans === 1 ? "person" : "people"}`);

  const status: DepartmentHealth["status"] = overdue.length > 0 || behind.length > 0 || highRisks.length > 0
    ? "attention"
    : reasons.length > 0 ? "watch" : "steady";
  return {
    id: department.id, title: department.title, people: humans, agents: members.length - humans,
    open: open.length, overdue: overdue.length, highRisks: highRisks.length, behind: behind.length, status, reasons,
  };
}

export const HEALTH_RANK: Record<DepartmentHealth["status"], number> = { attention: 0, watch: 1, steady: 2 };

/* ----------------------------- Decision log ----------------------------- */

/** Decisions are timeline events of kind "decision", newest first. */
export function decisionLog(events: Rec[]): Rec[] {
  return events
    .filter((event) => String(event.fields.kind ?? "") === "decision")
    .sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt));
}

/** Decisions whose review date has passed, so the log asks for a look back. */
export function decisionsDueForReview(events: Rec[], now: Date): Rec[] {
  return decisionLog(events).filter((event) => {
    const review = typeof event.fields.reviewBy === "string" ? Date.parse(event.fields.reviewBy) : Number.NaN;
    return Number.isFinite(review) && review <= now.getTime() && !event.fields.reviewedAt;
  });
}
