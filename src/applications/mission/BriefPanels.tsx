import { useState, type FormEvent } from "react";
import { Flag, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, Empty, Field, Meter, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
  type Tone,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  PARTICIPANT_ROLE_LABEL, briefCompleteness, briefOf, briefProblems, canRemoveParticipant, executionSummary,
  milestoneProblems, milestoneStatus, milestonesOf, participantsOf, positionIn, roster, sortMilestones, taskDone, timelineRange,
  type Milestone, type MilestoneState, type MissionBrief, type Participant, type ParticipantRole,
} from "./brief";
import "./mission-brief.css";

/* ====================================================================== *
 * Mission brief, execution status, milestones, milestone timeline and the
 * participant roster (MISSION-003 / MISSION-004). Every edit is a revisioned
 * patch on the mission record with an audit line.
 * ====================================================================== */

const MILESTONE_TONE: Record<MilestoneState, Tone> = { reached: "success", on_track: "info", at_risk: "warning", overdue: "danger", empty: "neutral" };
const MILESTONE_LABEL: Record<MilestoneState, string> = { reached: "Reached", on_track: "On track", at_risk: "At risk", overdue: "Overdue", empty: "No tasks linked" };

function endOfDay(date: string): string {
  return new Date(`${date}T23:59:00`).toISOString();
}
function dateInput(iso: string | undefined): string {
  if (!iso) return "";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

async function patchBody(context: ScreenContext, mission: Rec, change: Record<string, unknown>, event: string, extra: Partial<Rec> = {}): Promise<boolean> {
  try {
    const saved = await context.mutate.patch(mission.id, { ...extra, body: { ...((mission.body ?? {}) as object), ...change } }, { expectRevision: mission.revision, event });
    return Boolean(saved);
  } catch {
    context.toast("Not saved", "The mission could not be written to this browser's storage.", "failed");
    return false;
  }
}

/* -------------------------------- Brief -------------------------------- */

const BRIEF_FIELDS: { key: keyof MissionBrief; label: string; hint?: string; rows: number }[] = [
  { key: "objective", label: "Objective", hint: "What the mission must achieve. Shown in the mission library.", rows: 3 },
  { key: "inScope", label: "In scope", rows: 2 },
  { key: "outOfScope", label: "Out of scope", rows: 2 },
  { key: "constraints", label: "Constraints", hint: "Budget, deadlines, rules it must respect.", rows: 2 },
  { key: "successMeasure", label: "How success is judged", hint: "A person checks this; an agent saying it is done does not count.", rows: 2 },
];

export function MissionBriefCard({ context, mission }: { context: ScreenContext; mission: Rec }) {
  const brief = briefOf(mission);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MissionBrief>(brief);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const completeness = briefCompleteness(brief);
  const locked = ["completed", "cancelled"].includes(mission.status);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = briefProblems(draft);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as unknown as MissionBrief;
    const ok = await patchBody(context, mission, { brief: clean }, `Mission brief for ${mission.title} edited by ${context.actor}`, { summary: clean.objective });
    setBusy(false);
    if (ok) { context.toast("Brief saved", "The brief is on the mission record. The published plan version is unchanged."); setEditing(false); }
  };

  return (
    <Card span={7} eyebrow="BRIEF" prov="human" title="Mission brief"
      subtitle={`${Math.round(completeness * 100)}% written`}
      actions={!editing && !locked ? <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => { setDraft(brief); setErrors({}); setEditing(true); }}>Edit brief</Button> : undefined}>
      {editing ? (
        <form className="mission-brief-form" onSubmit={submit} aria-label="Edit the mission brief" noValidate>
          {BRIEF_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} error={errors[field.key]} required={field.key === "objective" || field.key === "successMeasure"}>
              <TextArea rows={field.rows} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
            </Field>
          ))}
          <Row gap={2}>
            <Button variant="primary" type="submit" busy={busy}>Save brief</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </Row>
        </form>
      ) : (
        <Stack gap={3}>
          <Meter value={completeness * 100} label="Brief completeness" tone={completeness === 1 ? "success" : "warning"} />
          <dl className="mission-brief">
            {BRIEF_FIELDS.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{brief[field.key].trim() || <span className="ds-subtle">Not written</span>}</dd>
              </div>
            ))}
          </dl>
        </Stack>
      )}
    </Card>
  );
}

/* ------------------------------ Execution ------------------------------ */

export function ExecutionStatusCard({ context, mission, steps, tasks }: { context: ScreenContext; mission: Rec; steps: Rec[]; tasks: Rec[] }) {
  const summary = executionSummary(mission, steps, tasks);
  return (
    <Card span={5} eyebrow="EXECUTION" prov="posted" title="Execution status" subtitle="Read from step receipts and tasks, not from an agent's report"
      actions={<Pill tone={summary.tone}>{summary.label}</Pill>}>
      <Stack gap={3}>
        <ul className="mission-exec">
          {summary.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <Notice tone="info">Generated work needs a model provider, which is not connected. Nothing on this mission was produced by a model.</Notice>
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/execution`)}>Execution console</Button>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/tasks`)}>Task board</Button>
        </Row>
      </Stack>
    </Card>
  );
}

/* ------------------------------ Milestones ------------------------------ */

function MilestoneForm({ context, mission, tasks, editing, onDone }: { context: ScreenContext; mission: Rec; tasks: Rec[]; editing?: Milestone; onDone: () => void }) {
  const existing = milestonesOf(mission);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [dueDate, setDueDate] = useState(dateInput(editing?.dueAt ?? mission.dueAt));
  const [taskIds, setTaskIds] = useState<string[]>(editing?.taskIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ordered = [...tasks].sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = milestoneProblems({ title, dueDate, taskIds }, existing, editing?.id);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const next: Milestone = { id: editing?.id ?? `ms-${wallMs().toString(36)}`, title: title.trim(), dueAt: endOfDay(dueDate), taskIds };
    const milestones = editing ? existing.map((item) => (item.id === editing.id ? next : item)) : [...existing, next];
    const ok = await patchBody(context, mission, { milestones }, `Milestone “${next.title}” ${editing ? "edited" : "added"} on ${mission.title} by ${context.actor}`);
    setBusy(false);
    if (ok) { context.toast(editing ? "Milestone saved" : "Milestone added", `${next.title}, due ${context.date(next.dueAt)}, measured by ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}.`); onDone(); }
  };

  return (
    <form className="mission-ms-form" onSubmit={submit} aria-label={editing ? `Edit milestone ${editing.title}` : "New milestone"} noValidate>
      <div className="mission-ms-formrow">
        <Field label="Milestone" error={errors.title} required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></Field>
        <Field label="Due" error={errors.dueDate} required><TextInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
      </div>
      <fieldset className="mission-ms-tasks">
        <legend className="ds-field-label">Reached when these tasks are verified</legend>
        {ordered.length === 0 && <span className="ds-subtle">This mission has no tasks yet.</span>}
        {ordered.map((task) => (
          <Checkbox key={task.id} label={`${task.title}${taskDone(task) ? " (verified)" : ""}`} checked={taskIds.includes(task.id)}
            onChange={(event) => setTaskIds((current) => (event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id)))} />
        ))}
        {errors.taskIds && <span className="ds-field-error" role="alert">{errors.taskIds}</span>}
      </fieldset>
      <Row gap={2}>
        <Button size="sm" variant="primary" type="submit" busy={busy}>{editing ? "Save milestone" : "Add milestone"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </Row>
    </form>
  );
}

export function MilestonesCard({ context, mission, tasks }: { context: ScreenContext; mission: Rec; tasks: Rec[] }) {
  const milestones = sortMilestones(milestonesOf(mission));
  const [form, setForm] = useState<"closed" | "new" | string>("closed");
  const [busy, setBusy] = useState("");
  const locked = ["completed", "cancelled"].includes(mission.status);
  const reached = milestones.filter((item) => milestoneStatus(item, tasks, context.now).state === "reached").length;

  const remove = async (milestone: Milestone) => {
    setBusy(milestone.id);
    const ok = await patchBody(context, mission, { milestones: milestonesOf(mission).filter((item) => item.id !== milestone.id) }, `Milestone “${milestone.title}” removed from ${mission.title} by ${context.actor}`);
    setBusy("");
    if (ok) context.toast("Milestone removed", `${milestone.title} is no longer tracked. Its tasks are unchanged.`);
  };

  return (
    <Card span={12} aria-label="Milestones" eyebrow="MILESTONES" prov="posted" title="Milestones" subtitle={milestones.length ? `${reached} of ${milestones.length} reached · computed from verified tasks` : "None set"}
      actions={!locked && form === "closed" ? <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setForm("new")}>Add milestone</Button> : undefined}>
      <Stack gap={3}>
        {form === "new" && <MilestoneForm context={context} mission={mission} tasks={tasks} onDone={() => setForm("closed")} />}
        {milestones.length === 0 && form === "closed" ? (
          <Empty icon={<Flag size={20} />} title="No milestones">Group tasks into dated checkpoints. A milestone is reached only when every task in it is verified.</Empty>
        ) : (
          <ul className="mission-ms-list">
            {milestones.map((milestone) => {
              const status = milestoneStatus(milestone, tasks, context.now);
              if (form === milestone.id) {
                return <li key={milestone.id}><MilestoneForm context={context} mission={mission} tasks={tasks} editing={milestone} onDone={() => setForm("closed")} /></li>;
              }
              return (
                <li key={milestone.id} className="mission-ms">
                  <div className="mission-ms-head">
                    <Flag size={14} aria-hidden="true" />
                    <strong className="ds-grow">{milestone.title}</strong>
                    <Pill tone={MILESTONE_TONE[status.state]}>{MILESTONE_LABEL[status.state]}</Pill>
                  </div>
                  <Row gap={2} wrap>
                    <span className="ds-subtle">Due {context.date(milestone.dueAt)}{status.state !== "reached" ? ` · ${status.days >= 0 ? `${status.days} day${status.days === 1 ? "" : "s"} left` : `${-status.days} day${status.days === -1 ? "" : "s"} late`}` : ""}</span>
                    <span className="ds-subtle ds-num">{status.verified} / {status.total} tasks verified</span>
                  </Row>
                  <Meter value={status.verified} max={status.total || 1} label={`${milestone.title} progress`} tone={status.state === "reached" ? "success" : status.state === "overdue" ? "danger" : undefined} />
                  <Row gap={1} wrap>
                    {milestone.taskIds.map((id) => {
                      const task = tasks.find((item) => item.id === id);
                      return <Pill key={id} tone={task && taskDone(task) ? "success" : "neutral"}>{task?.title ?? "Removed task"}</Pill>;
                    })}
                  </Row>
                  {!locked && (
                    <Row gap={1}>
                      <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setForm(milestone.id)}>Edit</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} busy={busy === milestone.id} onClick={() => void remove(milestone)}>Remove</Button>
                    </Row>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Stack>
    </Card>
  );
}

/* ------------------------------- Timeline ------------------------------- */

export function MilestoneTimeline({ context, mission, tasks }: { context: ScreenContext; mission: Rec; tasks: Rec[] }) {
  const milestones = sortMilestones(milestonesOf(mission));
  if (milestones.length === 0 && !mission.dueAt) {
    return (
      <Card eyebrow="CALENDAR" prov="human" title="Milestones by date">
        <Empty icon={<Flag size={20} />} title="No dated milestone" action={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`)}>Add one on the overview</Button>}>
          Add milestones on the mission overview to see them on a date axis.
        </Empty>
      </Card>
    );
  }
  const range = timelineRange(milestones, mission.dueAt, context.now);
  const today = positionIn(range, context.now.toISOString());
  const ticks = Array.from({ length: 5 }, (_, index) => range.start + ((range.end - range.start) * index) / 4);
  return (
    <Card eyebrow="CALENDAR" prov="human" title="Milestones by date" subtitle={`${milestones.length} milestone${milestones.length === 1 ? "" : "s"}${mission.dueAt ? ` · mission due ${context.date(mission.dueAt)}` : ""}`}>
      <div className="mission-tl" role="img" aria-label={`Timeline from ${context.date(new Date(range.start))} to ${context.date(new Date(range.end))}. The same milestones are listed below it.`}>
        <div className="mission-tl-axis" />
        {ticks.map((tick) => (
          <span key={tick} className="mission-tl-tick" style={{ insetInlineStart: `${positionIn(range, new Date(tick).toISOString()) * 100}%` }}>{context.date(new Date(tick), { day: "numeric", month: "short" })}</span>
        ))}
        <span className="mission-tl-today" style={{ insetInlineStart: `${today * 100}%` }}><span>Today</span></span>
        {mission.dueAt && <span className="mission-tl-due" style={{ insetInlineStart: `${positionIn(range, mission.dueAt) * 100}%` }}><span>Mission due</span></span>}
        {milestones.map((milestone, index) => {
          const status = milestoneStatus(milestone, tasks, context.now);
          return (
            <span key={milestone.id} className="mission-tl-ms" data-state={status.state} data-row={index % 3}
              data-edge={positionIn(range, milestone.dueAt) > 0.6 ? "end" : undefined}
              style={{ insetInlineStart: `${positionIn(range, milestone.dueAt) * 100}%` }} title={`${milestone.title} · ${MILESTONE_LABEL[status.state]}`}>
              <span className="mission-tl-dot" />
              <span className="mission-tl-label">{milestone.title}</span>
            </span>
          );
        })}
      </div>
      <ol className="mission-tl-list">
        {milestones.map((milestone) => {
          const status = milestoneStatus(milestone, tasks, context.now);
          return (
            <li key={milestone.id}>
              <span className="ds-num">{context.date(milestone.dueAt)}</span>
              <strong className="ds-grow">{milestone.title}</strong>
              <Pill tone={MILESTONE_TONE[status.state]}>{MILESTONE_LABEL[status.state]}</Pill>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ----------------------------- Participants ----------------------------- */

export function ParticipantsPanel({ context, mission, tasks, members, agents }: { context: ScreenContext; mission: Rec; tasks: Rec[]; members: Rec[]; agents: Rec[] }) {
  const participants = participantsOf(mission);
  const rows = roster(participants, tasks);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [role, setRole] = useState<ParticipantRole>("contributor");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const locked = ["completed", "cancelled"].includes(mission.status);

  const people = members.filter((member) => String(member.fields.kind ?? "human") === "human" && member.status !== "suspended" && member.fields.external !== true && !["client", "guest"].includes(String(member.fields.role ?? "")));
  const activeAgents = agents.filter((agent) => agent.status === "active");
  const taken = new Set(rows.map((row) => row.name));
  const options = [...people, ...activeAgents].filter((record, index, all) => !taken.has(record.title) && all.findIndex((item) => item.title === record.title) === index);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const record = options.find((item) => item.id === pick);
    if (!record) { setError("Choose a person or an AI employee."); return; }
    setBusy("add");
    const participant: Participant = {
      id: `pt-${wallMs().toString(36)}`, recordId: record.id, name: record.title, kind: record.collection === "agents" ? "ai" : "human",
      role, addedBy: context.actor, addedAt: context.now.toISOString(),
    };
    const ok = await patchBody(context, mission, { participants: [...participants, participant] }, `${record.title} added to ${mission.title} as ${PARTICIPANT_ROLE_LABEL[role].toLowerCase()} by ${context.actor}`);
    setBusy("");
    if (ok) {
      context.toast("Participant added", participant.kind === "ai"
        ? `${record.title} is on the mission. Its contract still limits what it may do, and no model is connected to run work.`
        : `${record.title} is on the mission as ${PARTICIPANT_ROLE_LABEL[role].toLowerCase()}. No invitation is sent outside this workspace.`);
      setAdding(false); setPick(""); setError("");
    }
  };

  const setParticipantRole = async (id: string, next: ParticipantRole) => {
    setBusy(id);
    const ok = await patchBody(context, mission, { participants: participants.map((item) => (item.id === id ? { ...item, role: next } : item)) }, `Participant role changed on ${mission.title} by ${context.actor}`);
    setBusy("");
    if (ok) context.toast("Role changed", `Now ${PARTICIPANT_ROLE_LABEL[next].toLowerCase()}.`);
  };

  const remove = async (id: string, name: string) => {
    setBusy(id);
    const ok = await patchBody(context, mission, { participants: participants.filter((item) => item.id !== id) }, `${name} removed from ${mission.title} by ${context.actor}`);
    setBusy("");
    if (ok) context.toast("Participant removed", `${name} is no longer on this mission.`);
  };

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <span className="ds-subtle ds-grow">{rows.length} participant{rows.length === 1 ? "" : "s"}: {rows.filter((row) => row.kind === "human").length} {rows.filter((row) => row.kind === "human").length === 1 ? "person" : "people"}, {rows.filter((row) => row.kind === "ai").length} AI employee{rows.filter((row) => row.kind === "ai").length === 1 ? "" : "s"}</span>
        {!locked && !adding && <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setAdding(true)}>Add participant</Button>}
      </Row>
      {adding && (
        <form className="mission-pt-form" onSubmit={add} aria-label="Add a participant">
          <Field label="Person or AI employee" error={error} required>
            <Select value={pick} onChange={(event) => { setPick(event.target.value); setError(""); }}>
              <option value="">Choose</option>
              <optgroup label="People">{options.filter((item) => item.collection !== "agents").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
              <optgroup label="AI employees (active contracts)">{options.filter((item) => item.collection === "agents").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
            </Select>
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(event) => setRole(event.target.value as ParticipantRole)}>
              {(Object.keys(PARTICIPANT_ROLE_LABEL) as ParticipantRole[]).map((value) => <option key={value} value={value}>{PARTICIPANT_ROLE_LABEL[value]}</option>)}
            </Select>
          </Field>
          <Row gap={2}>
            <Button size="sm" variant="primary" type="submit" busy={busy === "add"}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(""); }}>Cancel</Button>
          </Row>
          {role === "approver" && pick && options.find((item) => item.id === pick)?.collection === "agents" && (
            <Notice tone="warning">An AI employee can be recorded as an approver, but approval gates on this mission still need a person with approval authority.</Notice>
          )}
        </form>
      )}
      {rows.length === 0 ? <Empty title="Nobody is on this mission" icon={<UserPlus size={20} />}>Add the people and AI employees who own, do or review the work.</Empty> : (
        <div className="mission-pt-grid">
          {rows.map((row) => {
            const removeReason = canRemoveParticipant(row);
            const agent = row.kind === "ai" ? agents.find((item) => item.title === row.name) : undefined;
            return (
              <Card key={`${row.kind}-${row.name}`} eyebrow={row.kind === "ai" ? "AI EMPLOYEE" : "PERSON"} prov={row.kind === "ai" ? "agent" : "human"}
                title={<Row gap={2}><Avatar name={row.name} kind={row.kind} size="sm" />{row.name}</Row>}
                subtitle={row.explicit ? PARTICIPANT_ROLE_LABEL[row.role as ParticipantRole] : "Assigned by a task"}>
                <Stack gap={2}>
                  <Properties rows={[
                    { label: "Tasks held", value: String(row.held) },
                    { label: "Verified", value: String(row.verified) },
                    ...(row.kind === "ai" ? [{ label: "Can execute", value: <span className="mission-pt-exec"><Pill tone="warning">No</Pill><span className="ds-subtle">{agent && agent.status !== "active" ? `Contract ${agent.status}` : "Model not connected"}</span></span> }] : []),
                  ]} />
                  <Row gap={1} wrap>
                    {row.explicit && !locked && row.participantId && (
                      <Select aria-label={`Role for ${row.name}`} value={row.role} disabled={busy === row.participantId} onChange={(event) => void setParticipantRole(row.participantId as string, event.target.value as ParticipantRole)}>
                        {(Object.keys(PARTICIPANT_ROLE_LABEL) as ParticipantRole[]).map((value) => <option key={value} value={value}>{PARTICIPANT_ROLE_LABEL[value]}</option>)}
                      </Select>
                    )}
                    {(row.recordId || agent) && (
                      <Button size="sm" variant="ghost" onClick={() => context.navigate(row.kind === "ai" ? `/o/${context.org.slug}/team/agents/${row.recordId ?? agent?.id}` : `/o/${context.org.slug}/team/organization`)}>Profile</Button>
                    )}
                    {!locked && row.explicit && (
                      <Button size="sm" variant="ghost" disabled={Boolean(removeReason)} title={removeReason} busy={busy === row.participantId}
                        onClick={() => void remove(row.participantId as string, row.name)}>Remove</Button>
                    )}
                  </Row>
                </Stack>
              </Card>
            );
          })}
        </div>
      )}
    </Stack>
  );
}
