import { useMemo, useState, type FormEvent } from "react";
import { Archive, Pencil, Plus, RotateCcw, Users } from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, Empty, Field, Notice, Pill, Row, Select, TextArea, TextInput,
} from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import {
  AGENT_TEAMS, APPROVAL_POLICIES, draftFromTeam, emptyTeamDraft, policyById, readTeam, teamNotices, teamProblems,
  teamRecordInput, teamsForAgent, type AgentTeam, type AgentTeamDraft, type ApprovalPolicy,
} from "./agentTeams";
import "./team-contract.css";

/* ====================================================================== *
 * TEAM — agent teams on the directory (ARL-TEAM-002), the organisation
 * chart (ARL-TEAM-005) and each AI employee's profile (ARL-TEAM-003).
 * ====================================================================== */

export function useAgentTeams(): AgentTeam[] {
  const records = useCollection(AGENT_TEAMS);
  return useMemo(() => records.map(readTeam).sort((left, right) => left.name.localeCompare(right.name)), [records]);
}

function agentName(agents: Rec[], id: string): string {
  return agents.find((agent) => agent.id === id)?.title ?? "Removed contract";
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  return status === "active" ? "success" : status === "paused" ? "warning" : "neutral";
}

export function AgentTeamsSection({ context, agents }: { context: ScreenContext; agents: Rec[] }) {
  const teams = useAgentTeams();
  const [showArchived, setShowArchived] = useState(false);
  const shown = teams.filter((team) => showArchived || team.status !== "archived");
  const archivedCount = teams.filter((team) => team.status === "archived").length;

  async function setStatus(team: AgentTeam, status: "active" | "archived") {
    await context.mutate.patch(team.id, { status }, { expectRevision: team.record.revision, event: status === "archived" ? `Agent team “${team.name}” archived` : `Agent team “${team.name}” restored` });
    context.toast(status === "archived" ? "Team archived" : "Team restored", status === "archived" ? `${team.name} is kept on record; its members keep their own contracts.` : `${team.name} is active again.`);
  }

  return (
    <Card
      eyebrow="AGENT TEAMS"
      title="Agent teams"
      subtitle={`${teams.length - archivedCount} active${archivedCount ? ` · ${archivedCount} archived` : ""} · a lead, a purpose and one approval policy`}
      prov="human"
      className="team-agentteams"
      aria-label="Agent teams"
      actions={<>
        {archivedCount > 0 && <Button size="sm" variant="ghost" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived}>{showArchived ? "Hide archived" : "Show archived"}</Button>}
        <Button size="sm" variant="primary" icon={<Plus size={14} />} disabled={!context.can("edit_people")} title={context.can("edit_people") ? undefined : "This role view cannot change the workforce"} onClick={() => context.openOverlay("agent team")}>New agent team</Button>
      </>}
    >
      {shown.length === 0 ? (
        <Empty title="No agent team yet" icon={<Users size={20} />}>
          Group AI employees under a lead for one purpose, with a named person who approves their output.
        </Empty>
      ) : (
        <ul className="team-agentteams-list">
          {shown.map((team) => {
            const policy = policyById(team.policy || undefined);
            return (
              <li key={team.id} className="team-agentteam" data-status={team.status} aria-label={team.name}>
                <Row gap={2} wrap>
                  <strong className="ds-grow">{team.name}</strong>
                  <Pill tone={team.status === "archived" ? "neutral" : "success"} dot>{team.status}</Pill>
                </Row>
                <p className="ds-subtle">{team.purpose}</p>
                <div className="team-agentteam-lead">
                  <span className="ds-subtle">Lead</span>
                  <Row gap={2}><Avatar name={agentName(agents, team.leadId)} kind="ai" size="sm" /><span>{agentName(agents, team.leadId)}</span></Row>
                </div>
                <div className="team-agentteam-members" aria-label={`Members of ${team.name}`}>
                  {team.memberIds.map((id) => {
                    const agent = agents.find((item) => item.id === id);
                    return <Pill key={id} tone={statusTone(agent?.status ?? "")}>{agent?.title ?? "Removed contract"}{agent && agent.status !== "active" ? ` · ${agent.status}` : ""}</Pill>;
                  })}
                </div>
                <p className="team-agentteam-policy"><strong>{policy?.label ?? "No approval policy"}</strong>{team.approver ? ` · approver ${team.approver}` : ""}</p>
                <Row gap={1} wrap>
                  {team.status !== "archived" && (
                    <Button size="sm" variant="ghost" icon={<Pencil size={13} />} disabled={!context.can("edit_people")} onClick={() => context.openOverlay("agent team", { id: team.id })}>Edit</Button>
                  )}
                  {team.status === "archived"
                    ? <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} disabled={!context.can("edit_people")} onClick={() => void setStatus(team, "active")}>Restore</Button>
                    : <Button size="sm" variant="ghost" icon={<Archive size={13} />} disabled={!context.can("edit_people")} onClick={() => void setStatus(team, "archived")}>Archive</Button>}
                </Row>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ds-subtle team-agentteams-note">A team records how work is supervised. It grants no tool or source, and no model runs here, so a team never produces output by itself.</p>
    </Card>
  );
}

export function AgentTeamForm({ context, close, agents, people }: { context: ScreenContext; close: () => void; agents: Rec[]; people: string[] }) {
  const teams = useAgentTeams();
  const editingId = (context.overlayPayload as { id?: string } | undefined)?.id;
  const editing = teams.find((team) => team.id === editingId);
  /* The form's state starts from the stored team, so it mounts once that team has loaded. */
  if (editingId && !editing) return <Empty title="Opening the team…" />;
  return <AgentTeamFormBody key={editing?.id ?? "new"} context={context} close={close} agents={agents} people={people} teams={teams} editing={editing} />;
}

function AgentTeamFormBody({ context, close, agents, people, teams, editing }: {
  context: ScreenContext; close: () => void; agents: Rec[]; people: string[]; teams: AgentTeam[]; editing?: AgentTeam;
}) {
  const [draft, setDraft] = useState<AgentTeamDraft>(() => (editing ? draftFromTeam(editing) : emptyTeamDraft()));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligible = agents.filter((agent) => agent.status !== "archived" || draft.memberIds.includes(agent.id));
  const problems = teamProblems(draft, { agents, teams, people, selfId: editing?.id });
  const notices = teamNotices(draft, agents);
  const shown = submitted ? problems : {};
  const policy = policyById(draft.policy || undefined);
  const patch = (next: Partial<AgentTeamDraft>) => setDraft((current) => ({ ...current, ...next }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const input = teamRecordInput(draft);
      if (editing) {
        const saved = await context.mutate.patch(editing.id, { ...input, fields: { ...editing.record.fields, ...input.fields } }, { expectRevision: editing.record.revision, event: `Agent team “${input.title}” updated` });
        if (saved) context.toast("Team saved", `${input.title} has ${input.body.memberIds.length} member${input.body.memberIds.length === 1 ? "" : "s"}.`);
      } else {
        await context.mutate.create({ collection: AGENT_TEAMS, status: "active", ownerName: context.actor, ...input }, `Agent team “${input.title}” created with ${input.body.memberIds.length} members`);
        context.toast("Team created", `${input.title} is led by ${agentName(agents, draft.leadId)}. Members keep their own contracts.`);
      }
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ds-stack ds-gap-4" onSubmit={submit} aria-label={editing ? "Edit agent team" : "New agent team"} noValidate>
      <Field label="Team name" required error={shown.name}>
        <TextInput value={draft.name} onChange={(event) => patch({ name: event.target.value })} autoFocus invalid={Boolean(shown.name)} />
      </Field>
      <Field label="Purpose" required error={shown.purpose} hint="What the team is for, in one or two sentences.">
        <TextArea rows={2} value={draft.purpose} onChange={(event) => patch({ purpose: event.target.value })} invalid={Boolean(shown.purpose)} />
      </Field>
      <fieldset className="team-agentteam-pick">
        <legend className="ds-field-label">Members</legend>
        <div className="team-agentteam-picklist">
          {eligible.map((agent) => (
            <Checkbox
              key={agent.id}
              label={<>{agent.title} <span className="ds-subtle">· {String(agent.fields.role ?? "")} · {agent.status}</span></>}
              checked={draft.memberIds.includes(agent.id)}
              onChange={(event) => {
                const memberIds = event.target.checked ? [...draft.memberIds, agent.id] : draft.memberIds.filter((id) => id !== agent.id);
                patch({ memberIds, leadId: memberIds.includes(draft.leadId) ? draft.leadId : "" });
              }}
            />
          ))}
        </div>
        {shown.members && <span className="ds-field-error" role="alert">{shown.members}</span>}
      </fieldset>
      <Field label="Lead" required error={shown.leadId} hint="One of the members. The lead reviews only where the policy says so.">
        <Select value={draft.leadId} onChange={(event) => patch({ leadId: event.target.value })}>
          <option value="">Choose the lead</option>
          {draft.memberIds.map((id) => <option key={id} value={id}>{agentName(agents, id)}</option>)}
        </Select>
      </Field>
      <Field label="Approval policy" required error={shown.policy} hint={policy?.description}>
        <Select value={draft.policy} onChange={(event) => patch({ policy: event.target.value as ApprovalPolicy | "" })}>
          <option value="">Choose a policy</option>
          {APPROVAL_POLICIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      {policy?.needsApprover && (
        <Field label="Approver" required error={shown.approver} hint="A person in this workspace. An AI employee cannot approve its own team's work.">
          <Select value={draft.approver} onChange={(event) => patch({ approver: event.target.value })}>
            <option value="">Choose a person</option>
            {people.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
      )}
      {notices.length > 0 && <Notice tone="warning" title="Worth knowing">{notices.join(" ")}</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" type="submit" busy={busy}>{editing ? "Save team" : "Create team"}</Button>
      </Row>
    </form>
  );
}

/** Teams drawn as lead → members on the organisation chart. */
export function AgentTeamsOrgCard({ context, agents }: { context: ScreenContext; agents: Rec[] }) {
  const teams = useAgentTeams().filter((team) => team.status !== "archived");
  return (
    <Card eyebrow="AGENT TEAMS" title="Agent teams across departments" subtitle={`${teams.length} team${teams.length === 1 ? "" : "s"} · a team can draw on more than one department`} prov="human" aria-label="Agent teams on the organisation chart"
      actions={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents`)}>Manage teams</Button>}
    >
      {teams.length === 0 ? <p className="ds-subtle">No agent team yet. Create one from the AI employee directory.</p> : (
        <ul className="team-agentteams-org">
          {teams.map((team) => (
            <li key={team.id}>
              <Row gap={2} wrap>
                <strong>{team.name}</strong>
                <span className="ds-subtle">led by {agentName(agents, team.leadId)}</span>
                <span className="ds-grow" />
                <span className="ds-subtle">{team.approver ? `Approved by ${team.approver}` : "No approver"}</span>
              </Row>
              <div className="team-agentteam-members">
                {team.memberIds.filter((id) => id !== team.leadId).map((id) => <Pill key={id}>{agentName(agents, id)}</Pill>)}
                {team.memberIds.length === 1 && <span className="ds-subtle">The lead is the only member.</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The teams an AI employee belongs to, for its profile. */
export function AgentTeamsOf({ agentId }: { agentId: string }) {
  const teams = teamsForAgent(useAgentTeams(), agentId);
  if (teams.length === 0) return <span className="ds-subtle">None</span>;
  return <>{teams.map((team) => `${team.name}${team.leadId === agentId ? " (lead)" : ""}`).join(", ")}</>;
}
