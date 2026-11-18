import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * TEAM — agent teams.
 *
 * An agent team groups AI employees under one lead, for one purpose, with one
 * approval policy that every member's output is held to. It is a record of
 * how the work is meant to be supervised. It grants nothing: each member keeps
 * its own contract, and no model runs in this workspace, so a team never
 * produces output by itself.
 * ====================================================================== */

export const AGENT_TEAMS = "agentTeams";

export type ApprovalPolicy = "lead_then_person" | "person_each" | "person_external";

export const APPROVAL_POLICIES: { id: ApprovalPolicy; label: string; description: string; needsApprover: boolean }[] = [
  {
    id: "person_each",
    label: "A named person approves every output",
    description: "Nothing a member drafts is used until the approver has accepted it.",
    needsApprover: true,
  },
  {
    id: "lead_then_person",
    label: "The lead reviews, then a person approves",
    description: "The lead AI employee checks members' drafts first; the named person still approves each one before it is used.",
    needsApprover: true,
  },
  {
    id: "person_external",
    label: "A person approves anything that leaves the workspace",
    description: "Internal drafts follow each member's own contract; outbound messages, publishing and payments need the named person.",
    needsApprover: true,
  },
];

export function policyById(id: string | undefined) {
  return APPROVAL_POLICIES.find((policy) => policy.id === id);
}

export interface AgentTeamDraft {
  name: string;
  purpose: string;
  leadId: string;
  memberIds: string[];
  policy: ApprovalPolicy | "";
  approver: string;
}

export interface AgentTeam extends AgentTeamDraft {
  id: string;
  status: string;
  record: Rec;
}

export function readTeam(record: Rec): AgentTeam {
  const body = (record.body ?? {}) as { memberIds?: unknown };
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  const leadId = String(record.fields.leadId ?? "");
  return {
    id: record.id,
    record,
    status: record.status,
    name: record.title,
    purpose: record.summary,
    leadId,
    memberIds: leadId && !memberIds.includes(leadId) ? [leadId, ...memberIds] : memberIds,
    policy: (policyById(String(record.fields.approvalPolicy ?? ""))?.id ?? "") as ApprovalPolicy | "",
    approver: String(record.fields.approver ?? ""),
  };
}

export function emptyTeamDraft(): AgentTeamDraft {
  return { name: "", purpose: "", leadId: "", memberIds: [], policy: "person_each", approver: "" };
}

export function draftFromTeam(team: AgentTeam): AgentTeamDraft {
  return { name: team.name, purpose: team.purpose, leadId: team.leadId, memberIds: [...team.memberIds], policy: team.policy, approver: team.approver };
}

/** Blocking problems, keyed by field. */
export function teamProblems(draft: AgentTeamDraft, context: { agents: Rec[]; teams: AgentTeam[]; people: string[]; selfId?: string }): Record<string, string> {
  const problems: Record<string, string> = {};
  const name = draft.name.trim();
  if (!name) problems.name = "Name the team.";
  else if (context.teams.some((team) => team.id !== context.selfId && team.status !== "archived" && team.name.toLowerCase() === name.toLowerCase())) problems.name = "A team with this name exists.";
  if (!draft.purpose.trim()) problems.purpose = "Say what the team is for.";
  const known = new Set(context.agents.map((agent) => agent.id));
  const members = draft.memberIds.filter((id) => known.has(id));
  if (members.length === 0) problems.members = "Choose at least one AI employee.";
  if (draft.memberIds.some((id) => !known.has(id))) problems.members = "A member is not an AI employee in this workspace.";
  const archived = context.agents.filter((agent) => members.includes(agent.id) && agent.status === "archived");
  if (archived.length) problems.members = `${archived.map((agent) => agent.title).join(", ")} ${archived.length === 1 ? "is" : "are"} archived and cannot join a team.`;
  if (!draft.leadId) problems.leadId = "Choose the lead.";
  else if (!members.includes(draft.leadId)) problems.leadId = "The lead must be one of the members.";
  const policy = policyById(draft.policy || undefined);
  if (!policy) problems.policy = "Choose how the team's output is approved.";
  else if (policy.needsApprover && !draft.approver.trim()) problems.approver = "Name the person who approves.";
  else if (policy.needsApprover && context.people.length > 0 && !context.people.includes(draft.approver.trim())) problems.approver = "The approver must be a person in this workspace.";
  return problems;
}

/** Things a reader should know that do not block saving. */
export function teamNotices(draft: AgentTeamDraft, agents: Rec[]): string[] {
  const notes: string[] = [];
  const members = agents.filter((agent) => draft.memberIds.includes(agent.id));
  const paused = members.filter((agent) => agent.status === "paused");
  if (paused.length) notes.push(`${paused.map((agent) => agent.title).join(", ")} ${paused.length === 1 ? "is" : "are"} paused and excluded from delegation until resumed.`);
  const drafts = members.filter((agent) => agent.status === "draft");
  if (drafts.length) notes.push(`${drafts.map((agent) => agent.title).join(", ")} ${drafts.length === 1 ? "is a draft contract" : "are draft contracts"} and cannot take work yet.`);
  const lead = agents.find((agent) => agent.id === draft.leadId);
  if (lead && lead.status !== "active") notes.push(`The lead, ${lead.title}, is ${lead.status}; reviews by the lead cannot happen until the contract is active.`);
  return notes;
}

export function teamsForAgent(teams: AgentTeam[], agentId: string): AgentTeam[] {
  return teams.filter((team) => team.status !== "archived" && team.memberIds.includes(agentId));
}

/** The record fields and body a draft is saved as. */
export function teamRecordInput(draft: AgentTeamDraft): { title: string; summary: string; fields: Record<string, string>; body: { memberIds: string[] } } {
  const memberIds = draft.leadId && !draft.memberIds.includes(draft.leadId) ? [draft.leadId, ...draft.memberIds] : [...draft.memberIds];
  return {
    title: draft.name.trim(),
    summary: draft.purpose.trim(),
    fields: { leadId: draft.leadId, approvalPolicy: draft.policy, approver: draft.approver.trim() },
    body: { memberIds },
  };
}
