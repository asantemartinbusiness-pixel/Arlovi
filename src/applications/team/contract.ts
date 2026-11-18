import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * AI employee contract editing — pure rules, no React, no database.
 *
 * A contract says what an AI employee may do (permitted actions), which
 * tool scopes it holds and at what approval level it works. Editing the
 * contract is real configuration that persists. Executing work under it is
 * a separate question answered honestly by executionAvailability(): with no
 * model provider and no trusted server, nothing can run.
 * ====================================================================== */

export type ScopeAccess = "read" | "draft" | "act";
export type ApprovalLevel = "suggest" | "draft" | "act_with_approval";

export interface ToolScope {
  id: string;
  label: string;
  granted: boolean;
  /** Provider capability the scope needs (e.g. email.send). */
  capability?: string;
  access?: ScopeAccess;
  requiresApproval?: boolean;
}

export const APPROVAL_LEVELS: { value: ApprovalLevel; label: string; detail: string }[] = [
  { value: "suggest", label: "Suggest only", detail: "Proposes; a person does the work." },
  { value: "draft", label: "Draft for review", detail: "Writes drafts in this workspace; a person approves before anything is used." },
  { value: "act_with_approval", label: "Act with approval", detail: "May act inside granted scopes, each action approved by a person first." },
];

export const ACCESS_LABEL: Record<ScopeAccess, string> = { read: "Read", draft: "Draft", act: "Act" };

/** Infer access from a legacy scope id when none is recorded. */
export function accessOf(scope: ToolScope): ScopeAccess {
  if (scope.access) return scope.access;
  if (/\.(read|view)$/.test(scope.id)) return "read";
  if (/\.(draft|propose)$/.test(scope.id)) return "draft";
  return scope.capability ? "act" : "draft";
}

/** An act scope always needs a person's approval per action, whatever the contract says. */
export function approvalRequired(scope: ToolScope): boolean {
  return accessOf(scope) === "act" || scope.requiresApproval === true;
}

export function normaliseScopeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9.]+/g, ".").replace(/\.{2,}/g, ".").replace(/^\.|\.$/g, "");
}

export interface ContractDraft {
  approval: ApprovalLevel;
  authority: string[];
  tools: ToolScope[];
}

export function contractFromAgent(agent: Rec): ContractDraft {
  const body = (agent.body ?? {}) as { authority?: string[]; tools?: ToolScope[] };
  const approval = String(agent.fields.autonomy ?? "draft");
  return {
    approval: approval === "suggest" || approval === "act_with_approval" ? approval : "draft",
    authority: [...(body.authority ?? [])],
    tools: (body.tools ?? []).map((tool) => ({ ...tool })),
  };
}

/**
 * Problems that stop the contract from saving. `connected` reports whether a
 * provider capability is connected; a scope bound to an unconnected provider
 * may be recorded but not granted.
 */
export function contractProblems(draft: ContractDraft, connected: (capability: string) => boolean): string[] {
  const problems: string[] = [];
  const lines = draft.authority.map((line) => line.trim());
  if (lines.some((line) => !line)) problems.push("A permitted action is empty. Write it or remove it.");
  if (lines.some((line) => line.length > 140)) problems.push("Keep each permitted action under 140 characters.");
  if (new Set(lines.map((line) => line.toLowerCase())).size !== lines.length) problems.push("Two permitted actions say the same thing.");
  if (lines.length > 16) problems.push("A contract holds at most 16 permitted actions.");
  const ids = draft.tools.map((tool) => normaliseScopeId(tool.id));
  if (ids.some((id) => !id)) problems.push("Every tool scope needs an identifier such as crm.read.");
  if (new Set(ids).size !== ids.length) problems.push("Two tool scopes share an identifier.");
  if (draft.tools.some((tool) => !tool.label.trim())) problems.push("Every tool scope needs a label.");
  for (const tool of draft.tools) {
    if (tool.granted && tool.capability && !connected(tool.capability)) {
      problems.push(`“${tool.label || tool.id}” needs ${tool.capability}, which is not connected, so it cannot be granted.`);
    }
  }
  if (draft.approval !== "act_with_approval" && draft.tools.some((tool) => tool.granted && accessOf(tool) === "act")) {
    problems.push("An act scope is granted, but the approval level does not allow acting. Raise the level to “Act with approval” or withdraw the scope.");
  }
  return problems;
}

/** Human-readable list of what changed; empty when nothing did. */
export function contractChanges(before: ContractDraft, after: ContractDraft): string[] {
  const changes: string[] = [];
  if (before.approval !== after.approval) changes.push(`Approval level ${before.approval} → ${after.approval}`);
  const beforeLines = new Set(before.authority.map((line) => line.trim()));
  const afterLines = new Set(after.authority.map((line) => line.trim()));
  for (const line of afterLines) if (!beforeLines.has(line)) changes.push(`Permitted action added: ${line}`);
  for (const line of beforeLines) if (!afterLines.has(line)) changes.push(`Permitted action removed: ${line}`);
  const beforeTools = new Map(before.tools.map((tool) => [normaliseScopeId(tool.id), tool]));
  const afterTools = new Map(after.tools.map((tool) => [normaliseScopeId(tool.id), tool]));
  for (const [id, tool] of afterTools) {
    const prior = beforeTools.get(id);
    if (!prior) changes.push(`Tool scope added: ${id}${tool.granted ? " (granted)" : ""}`);
    else {
      if (prior.granted !== tool.granted) changes.push(`${id} ${tool.granted ? "granted" : "withdrawn"}`);
      if (accessOf(prior) !== accessOf(tool)) changes.push(`${id} access ${accessOf(prior)} → ${accessOf(tool)}`);
      if (approvalRequired(prior) !== approvalRequired(tool)) changes.push(`${id} ${approvalRequired(tool) ? "now needs approval" : "no longer needs approval"}`);
      if (prior.label.trim() !== tool.label.trim()) changes.push(`${id} relabelled`);
    }
  }
  for (const id of beforeTools.keys()) if (!afterTools.has(id)) changes.push(`Tool scope removed: ${id}`);
  return changes;
}

/** Changes that narrow or alter authority mean queued work must be re-authorised before it runs. */
export function requiresReauthorisation(before: ContractDraft, after: ContractDraft): boolean {
  return contractChanges(before, after).some((change) => !change.endsWith("relabelled"));
}

/* ------------------------ Execution availability ------------------------ */

export interface Availability {
  canExecute: false;
  /** What is configured and saved. */
  configured: string[];
  /** Why nothing can run. Always at least one entry in this browser build. */
  blockers: string[];
}

export function executionAvailability(agent: Rec, modelState: string, activation: string[]): Availability {
  const draft = contractFromAgent(agent);
  const configured = [
    `Contract revision ${agent.revision}, saved in this workspace`,
    `${draft.tools.filter((tool) => tool.granted).length} of ${draft.tools.length} tool scopes granted`,
    `${draft.authority.length} permitted action${draft.authority.length === 1 ? "" : "s"}`,
    `Approval level: ${APPROVAL_LEVELS.find((level) => level.value === draft.approval)?.label ?? draft.approval}`,
  ];
  const blockers: string[] = [];
  if (agent.status !== "active") blockers.push(`The contract is ${agent.status}, so it receives no work.`);
  blockers.push(...activation);
  if (modelState !== "verified_external") blockers.push("No model provider is connected, so this AI employee cannot generate or execute anything.");
  blockers.push("There is no trusted execution server for this workspace; run requests are recorded as blocked, never as run.");
  return { canExecute: false, configured, blockers };
}

/* ---------------------------- Assignment history --------------------------- */

export interface AssignmentRow {
  id: string;
  at: string;
  title: string;
  kind: "assignment" | "run request" | "mission task" | "task";
  state: string;
  executed: false;
  detail: string;
  link?: { kind: "mission" | "task"; id: string };
}

const STATE_DETAIL: Record<string, string> = {
  awaiting_provider: "Recorded; waiting for a model provider. Not executed.",
  brief_ready: "A local source brief was prepared. No model was called.",
  cancelled: "Cancelled by a person.",
  blocked: "Run request recorded and blocked by preflight.",
  dismissed: "Blocked run request dismissed.",
};

export function assignmentHistory(agent: Rec, input: { assignments: Rec[]; requests: Rec[]; missionTasks: Rec[]; tasks: Rec[] }): AssignmentRow[] {
  const rows: AssignmentRow[] = [];
  for (const row of input.assignments.filter((item) => item.fields.agentId === agent.id)) {
    rows.push({
      id: row.id, at: row.createdAt, title: row.title, kind: "assignment", state: row.status, executed: false,
      detail: STATE_DETAIL[row.status] ?? row.summary, link: row.parentId ? { kind: "task", id: row.parentId } : undefined,
    });
  }
  const assignmentIds = new Set(rows.map((row) => row.id));
  for (const row of input.requests.filter((item) => assignmentIds.has(String(item.fields.assignmentId ?? "")) || item.fields.agentId === agent.id)) {
    rows.push({ id: row.id, at: row.createdAt, title: row.title, kind: "run request", state: row.status, executed: false, detail: STATE_DETAIL[row.status] ?? row.summary });
  }
  for (const row of input.missionTasks.filter((item) => String(item.fields.assignee ?? "") === agent.title)) {
    rows.push({
      id: row.id, at: row.createdAt, title: row.title, kind: "mission task", state: String(row.fields.stage ?? row.status), executed: false,
      detail: row.fields.reauthorisationRequired === true ? "Needs re-authorisation after a contract change." : "Assigned in a mission plan.",
      link: row.parentId ? { kind: "mission", id: row.parentId } : undefined,
    });
  }
  for (const row of input.tasks.filter((item) => String(item.fields.assignee ?? item.fields.aiAssignedTo ?? "") === agent.title)) {
    rows.push({ id: row.id, at: row.createdAt, title: row.title, kind: "task", state: row.status, executed: false, detail: "Project task naming this AI employee." });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
