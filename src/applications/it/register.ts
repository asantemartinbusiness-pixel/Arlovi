import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * IT registers: the incident lifecycle, change requests, asset and
 * configuration records, and access reviews. Pure functions only, so the
 * rules that gate each step are testable without a browser.
 * ====================================================================== */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/* ------------------------------ Incident lifecycle ------------------------------ */

export const STAGES = ["open", "triage", "mitigate", "resolve", "postmortem"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  open: "Open", triage: "Triage", mitigate: "Mitigate", resolve: "Resolved", postmortem: "Postmortem",
};

/** The record status each stage writes, so the queue tabs keep working. */
export const STAGE_STATUS: Record<Stage, string> = {
  open: "open", triage: "investigating", mitigate: "mitigating", resolve: "resolved", postmortem: "closed",
};

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function stageOf(record: Rec): Stage {
  const explicit = str(record.fields.stage);
  // The explicit stage wins only while the status still agrees with it; an
  // older action that changes the status directly moves the stage too.
  if ((STAGES as readonly string[]).includes(explicit) && STAGE_STATUS[explicit as Stage] === record.status) return explicit as Stage;
  if (record.status === "resolved" || record.status === "closed") return record.fields.postmortem ? "postmortem" : "resolve";
  if (record.status === "mitigating" || record.status === "awaiting_user") return "mitigate";
  if (record.status === "investigating" || record.status === "acknowledged") return "triage";
  return "open";
}

export function nextStage(stage: Stage): Stage | undefined {
  return STAGES[STAGES.indexOf(stage) + 1];
}

export type TimelineKind = "note" | "stage" | "severity" | "assignee" | "mitigation" | "verification";

export interface TimelineEntry {
  id: string;
  at: string;
  by: string;
  kind: TimelineKind;
  text: string;
}

const TIMELINE_KINDS: TimelineKind[] = ["note", "stage", "severity", "assignee", "mitigation", "verification"];

export function readTimeline(record: Rec | undefined): TimelineEntry[] {
  const body = asRecord(record?.body);
  const raw = Array.isArray(body.timeline) ? body.timeline : [];
  return raw.map((item, index) => {
    const row = asRecord(item);
    const kind = str(row.kind);
    return {
      id: str(row.id) || `t${index + 1}`,
      at: str(row.at),
      by: str(row.by),
      kind: (TIMELINE_KINDS as string[]).includes(kind) ? (kind as TimelineKind) : "note",
      text: str(row.text),
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
}

export function withEntry(record: Rec, entry: TimelineEntry): { body: Record<string, unknown> } {
  const body = asRecord(record.body);
  return { body: { ...body, timeline: [...readTimeline(record), entry] } };
}

export interface StageFacts {
  /** A workspace diagnostics run was recorded since the incident was opened (workspace-wide, not incident-specific). */
  verified: boolean;
  /** Text supplied with the transition (a mitigation step, or the postmortem). */
  note: string;
}

/**
 * What still stands between an incident and the next stage. An empty list
 * means the move is allowed. Stages are never skipped.
 */
export function stageBlockers(record: Rec, target: Stage, facts: StageFacts): string[] {
  const current = stageOf(record);
  const blockers: string[] = [];
  if (STAGES.indexOf(target) !== STAGES.indexOf(current) + 1) {
    blockers.push(`An incident moves one stage at a time; it is at ${STAGE_LABELS[current]}.`);
    return blockers;
  }
  const severity = str(record.fields.severity);
  const owner = str(record.fields.owner) || "";
  const timeline = readTimeline(record);
  if (target === "triage") {
    if (!(SEVERITIES as readonly string[]).includes(severity)) blockers.push("Set a severity.");
    if (!owner.trim()) blockers.push("Assign an owner.");
  }
  if (target === "mitigate") {
    if (!facts.note.trim() && !timeline.some((entry) => entry.kind === "mitigation")) blockers.push("Describe the mitigation being applied.");
  }
  if (target === "resolve") {
    if (!timeline.some((entry) => entry.kind === "mitigation") && !facts.note.trim()) blockers.push("Record what fixed it.");
    if (!facts.verified) blockers.push("Run the workspace diagnostics after the incident was opened. They check the whole workspace, not this incident alone.");
  }
  if (target === "postmortem") {
    const text = facts.note.trim() || str(record.fields.postmortem).trim();
    if (text.length < 40) blockers.push("Write a postmortem of at least 40 characters: what happened, why, and what changes.");
  }
  return blockers;
}

/** Minutes from opening to resolution, when both ends are recorded. */
export function timeToResolve(record: Rec): number | undefined {
  if (!record.at || !record.endAt) return undefined;
  const minutes = Math.round((new Date(record.endAt).getTime() - new Date(record.at).getTime()) / 60_000);
  return minutes >= 0 ? minutes : undefined;
}

/* ------------------------------ Change requests ------------------------------ */

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFactors {
  scope: "single" | "team" | "workspace";
  reversible: boolean;
  tested: boolean;
  target: "local" | "remote";
}

/** A transparent score: each factor adds a named number of points. */
export function riskOf(factors: RiskFactors): { level: RiskLevel; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (factors.scope === "team") { score += 1; reasons.push("Affects a team (+1)"); }
  if (factors.scope === "workspace") { score += 2; reasons.push("Affects the whole workspace (+2)"); }
  if (!factors.reversible) { score += 2; reasons.push("Cannot be reversed (+2)"); }
  if (!factors.tested) { score += 1; reasons.push("Not tested beforehand (+1)"); }
  if (factors.target === "remote") { score += 1; reasons.push("Changes infrastructure this workspace cannot observe (+1)"); }
  const level: RiskLevel = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return { level, score, reasons };
}

export const CHANGE_STATES = ["draft", "submitted", "approved", "rejected", "implemented", "rolled_back"] as const;
export type ChangeState = (typeof CHANGE_STATES)[number];

export function changeFactors(record: Rec): RiskFactors {
  const scope = str(record.fields.scope);
  return {
    scope: scope === "team" || scope === "workspace" ? scope : "single",
    reversible: record.fields.reversible !== false,
    tested: record.fields.tested === true,
    target: str(record.fields.target) === "remote" ? "remote" : "local",
  };
}

/** Why the given person may not approve this change; undefined when they may. */
/**
 * Why an approval cannot be recorded. Separation of duties covers both the
 * named approver and the person recording it: a requester cannot approve
 * their own change by naming somebody else.
 */
export function approvalBlocker(record: Rec, approver: string, actor?: string): string | undefined {
  if (record.status !== "submitted") return "Only a submitted change can be decided.";
  const requester = str(record.fields.requestedBy) || record.createdBy;
  if (requester === approver) return "The person who requested a change cannot approve it.";
  if (actor !== undefined && requester === actor) return "You requested this change, so you cannot record its approval. Ask someone else to record it.";
  const risk = riskOf(changeFactors(record));
  if (risk.level !== "low" && !str(record.fields.rollbackPlan).trim()) return "A medium or high risk change needs a rollback plan before approval.";
  return undefined;
}

export function submitBlockers(record: Rec): string[] {
  const blockers: string[] = [];
  if (!record.title.trim()) blockers.push("Name the change.");
  if (!str(record.fields.plan).trim()) blockers.push("Describe the implementation plan.");
  if (!str(record.fields.window).trim()) blockers.push("Choose a change window.");
  const risk = riskOf(changeFactors(record));
  if (risk.level !== "low" && !str(record.fields.rollbackPlan).trim()) blockers.push("Add a rollback plan; the risk is not low.");
  return blockers;
}

/* ------------------------------ Assets and configuration ------------------------------ */

export const ASSET_KINDS = ["device", "software", "service", "configuration", "domain"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export interface ConfigItem { key: string; value: string }

export function readConfig(record: Rec | undefined): ConfigItem[] {
  const raw = asRecord(record?.body).config;
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const row = asRecord(item);
    return { key: str(row.key), value: str(row.value) };
  }).filter((item) => item.key.trim());
}

/** Parses "key = value" lines; later keys replace earlier ones. */
export function parseConfig(text: string): ConfigItem[] {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (key) map.set(key, line.slice(at + 1).trim());
  }
  return [...map].map(([key, value]) => ({ key, value }));
}

export function configDiff(before: ConfigItem[], after: ConfigItem[]): string[] {
  const old = new Map(before.map((item) => [item.key, item.value]));
  const next = new Map(after.map((item) => [item.key, item.value]));
  const lines: string[] = [];
  for (const [key, value] of next) {
    if (!old.has(key)) lines.push(`+ ${key} = ${value}`);
    else if (old.get(key) !== value) lines.push(`~ ${key}: ${old.get(key)} → ${value}`);
  }
  for (const key of old.keys()) if (!next.has(key)) lines.push(`- ${key}`);
  return lines;
}

/** How old the last hand verification of a remote asset is, in days. */
export function verificationAge(record: Rec, now: Date): number | undefined {
  const at = str(record.fields.verifiedAt);
  if (!at) return undefined;
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000);
}

/* ------------------------------ Access reviews ------------------------------ */

export type Decision = "pending" | "keep" | "modify" | "revoke";

export interface ReviewEntry {
  subjectId: string;
  subject: string;
  access: string;
  signals: string[];
  decision: Decision;
  note: string;
  decidedBy: string;
  decidedAt: string;
}

export function readEntries(record: Rec | undefined): ReviewEntry[] {
  const raw = asRecord(record?.body).entries;
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const row = asRecord(item);
    const decision = str(row.decision);
    return {
      subjectId: str(row.subjectId),
      subject: str(row.subject),
      access: str(row.access),
      signals: Array.isArray(row.signals) ? row.signals.filter((value): value is string => typeof value === "string") : [],
      decision: (["keep", "modify", "revoke"].includes(decision) ? decision : "pending") as Decision,
      note: str(row.note),
      decidedBy: str(row.decidedBy),
      decidedAt: str(row.decidedAt),
    };
  });
}

/** Signals worth a reviewer's attention, read from a member record. */
export function accessSignals(member: Rec, now: Date): string[] {
  const signals: string[] = [];
  if (member.fields.mfa === false) signals.push("No second factor");
  const last = str(member.fields.lastAccessAt);
  if (last) {
    const days = Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000);
    if (days > 30) signals.push(`Last access ${days} days ago`);
  }
  if (str(member.fields.kind) === "ai") signals.push("Automated agent");
  if (member.status === "suspended" || member.status === "invited") signals.push(`Status ${member.status}`);
  return signals;
}

export function entriesFromMembers(members: Rec[], now: Date): ReviewEntry[] {
  return members.map((member) => ({
    subjectId: member.id,
    subject: member.title,
    access: str(member.fields.role, "member"),
    signals: accessSignals(member, now),
    decision: "pending",
    note: "",
    decidedBy: "",
    decidedAt: "",
  }));
}

export function decisionBlocker(entry: ReviewEntry, decision: Decision, note: string): string | undefined {
  if (decision === "pending") return "Choose keep, modify or revoke.";
  if ((decision === "revoke" || decision === "modify") && !note.trim()) return "Say why access is being changed.";
  if (decision === "keep" && entry.signals.length > 0 && !note.trim()) return "This person has flags; say why keeping access is right.";
  return undefined;
}

export function reviewProgress(entries: ReviewEntry[]): { decided: number; total: number; revoke: number; modify: number; keep: number; complete: boolean } {
  const decided = entries.filter((entry) => entry.decision !== "pending").length;
  return {
    decided,
    total: entries.length,
    revoke: entries.filter((entry) => entry.decision === "revoke").length,
    modify: entries.filter((entry) => entry.decision === "modify").length,
    keep: entries.filter((entry) => entry.decision === "keep").length,
    complete: entries.length > 0 && decided === entries.length,
  };
}
