import { useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import {
  Avatar, Button, Checkbox, Empty, FactGrid, KeyValueList, Meter, Notice, OverlayActions, OverlaySection, OverlaySummary, Pill,
  Stack, TextArea, type RecordHeaderProps,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { LANES, stageOf } from "./board";
import { dependencyIds, unfinishedDependencies, type ChecklistItem } from "./taskWork";

/* ====================================================================== *
 * Task inspector — one reading of a task, used by the board drawer and the
 * Task detail page so they cannot disagree about what is true of the task.
 * ====================================================================== */

export function checklistOf(task: Rec): ChecklistItem[] {
  const body = task.body as { checklist?: ChecklistItem[] } | undefined;
  return body?.checklist ?? [];
}

const STAGE_TONE: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  done: "success", blocked: "danger", review: "warning", doing: "info",
};

export const stageLabel = (task: Rec): string => LANES.find((lane) => lane.id === stageOf(task))?.label ?? "Backlog";

export function StagePill({ task }: { task: Rec }) {
  return <Pill tone={STAGE_TONE[stageOf(task)] ?? "neutral"} dot>{stageLabel(task)}</Pill>;
}

/** Everything the task is related to, read once. */
export function useTaskFacts(task: Rec | undefined) {
  const data = useCollections(["projects", "tasks", "shifts", "approvals", "members", "employees"]);
  const events = useEvents(task?.id, 40);
  const { now } = useWorkspace();
  if (!task) return undefined;
  const project = data.projects.find((row) => row.id === task.parentId);
  const siblings = data.tasks.filter((row) => row.parentId === task.parentId);
  const before = dependencyIds(task).map((id) => data.tasks.find((row) => row.id === id)).filter((row): row is Rec => Boolean(row));
  const after = data.tasks.filter((row) => dependencyIds(row).includes(task.id));
  const waitingOn = unfinishedDependencies(task, data.tasks);
  const time = data.shifts.filter((entry) => entry.fields.kind === "time" && entry.fields.taskId === task.id);
  const loggedHours = time.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0) || Number(task.fields.loggedHours ?? 0);
  const approvals = data.approvals.filter((row) => String(row.fields.targetId ?? "") === task.id);
  const assignee = String(task.fields.assignee ?? task.ownerName);
  const person = [...data.members, ...data.employees].find((row) => row.title === assignee);
  const due = task.dueAt ?? task.endAt;
  const overdue = Boolean(due) && stageOf(task) !== "done" && new Date(due as string) < now;
  return { project, siblings, before, after, waitingOn, time, loggedHours, approvals, assignee, ai: person?.fields.kind === "ai", due, overdue, events };
}

export type TaskFacts = NonNullable<ReturnType<typeof useTaskFacts>>;

const dash = <span className="ds-subtle">Not set</span>;

function PersonCell({ name, ai }: { name: string; ai?: boolean }) {
  return <span className="pj-person"><Avatar name={name} kind={ai ? "ai" : "human"} size="sm" />{name}</span>;
}

function dateRange(context: ScreenContext, task: Rec): ReactNode {
  if (!task.startAt && !task.endAt) return dash;
  return <span className="ds-num">{context.date(task.startAt)} – {context.date(task.endAt)}</span>;
}

/** Facts shown in both the drawer (grid) and the detail page (right-hand column). */
export function taskFactItems(context: ScreenContext, task: Rec, facts: TaskFacts) {
  const priority = String(task.fields.priority ?? "normal");
  const estimate = Number(task.fields.estimateHours ?? 0);
  return [
    { label: "Assignee", value: <PersonCell name={facts.assignee} ai={facts.ai} /> },
    { label: "Priority", value: <Pill tone={priority === "high" ? "danger" : "neutral"}>{priority}</Pill> },
    {
      label: "Due",
      value: facts.due ? <span className="ds-num">{context.date(facts.due)}</span> : dash,
      tone: facts.overdue ? ("danger" as const) : undefined,
      hint: facts.overdue ? "Past its date" : undefined,
    },
    { label: "Scheduled", value: dateRange(context, task) },
    { label: "Sprint", value: task.fields.sprint ? String(task.fields.sprint) : dash },
    {
      label: "Effort",
      value: estimate > 0 ? <span className="ds-num">{facts.loggedHours}h of {estimate}h</span> : <span className="ds-num">{facts.loggedHours}h logged</span>,
      hint: estimate > 0 ? undefined : "No estimate",
    },
  ];
}

/** Subtask checklist with progress. Ticks are saved on the task, revision-checked. */
export function ChecklistProgress({ context, task, editable = true }: { context: ScreenContext; task: Rec; editable?: boolean }) {
  const checklist = checklistOf(task);
  const done = checklist.filter((item) => item.done).length;
  async function toggle(index: number, value: boolean) {
    const next = checklist.map((entry, position) => (position === index ? { ...entry, done: value } : entry));
    await context.mutate.patch(task.id, { body: { ...(task.body as object ?? {}), checklist: next } }, {
      expectRevision: task.revision,
      event: `Subtask "${checklist[index].label}" ${value ? "ticked" : "unticked"} on ${task.title} by ${context.actor}`,
    });
  }
  if (checklist.length === 0) return <span className="ds-subtle">No checklist. Add steps from the Subtasks tab.</span>;
  return (
    <Stack gap={2}>
      <div className="pj-progress"><Meter value={done} max={checklist.length} label="Checklist progress" tone={done === checklist.length ? "success" : undefined} /><span className="ds-num ds-subtle">{done}/{checklist.length}</span></div>
      <ul className="pj-subtasks" aria-label="Checklist">
        {checklist.map((item, index) => (
          <li key={`${item.label}-${index}`} className="pj-subtask" data-done={item.done ? "true" : undefined}>
            {editable
              ? <Checkbox label={item.label} checked={item.done} onChange={(event) => void toggle(index, event.target.checked)} />
              : <span>{item.done ? "Done" : "To do"} · {item.label}</span>}
          </li>
        ))}
      </ul>
    </Stack>
  );
}

/** Dependencies in both directions, each a link that keeps the journey. */
export function DependencyList({ context, task, facts, onOpen, onRemove }: { context: ScreenContext; task: Rec; facts: TaskFacts; onOpen?: (id: string) => void; onRemove?: (dependency: Rec) => void }) {
  const { org } = useWorkspace();
  const open = onOpen ?? ((id: string) => context.navigate(`/o/${org.slug}/project/tasks/${id}`));
  const row = (item: Rec, removable = false) => (
    <li key={item.id} className="pj-depwork">
      <StagePill task={item} />
      <button type="button" className="pj-link ds-grow ds-truncate" onClick={() => open(item.id)}>{item.title}</button>
      {item.dueAt && <span className="ds-num ds-subtle">{context.date(item.dueAt)}</span>}
      {removable && onRemove && <Button size="sm" variant="ghost" aria-label={`Remove the link to ${item.title}`} onClick={() => onRemove(item)}>Remove</Button>}
    </li>
  );
  if (facts.before.length === 0 && facts.after.length === 0) return <span className="ds-subtle">Nothing has to happen first, and nothing waits on this.</span>;
  return (
    <Stack gap={2}>
      {facts.waitingOn.length > 0 && stageOf(task) !== "done" && (
        <Notice tone="warning" title={`Waiting on ${facts.waitingOn.length} unfinished ${facts.waitingOn.length === 1 ? "task" : "tasks"}`}>
          Starting before {facts.waitingOn.map((item) => item.title).join(", ")} {facts.waitingOn.length === 1 ? "is" : "are"} done means working on assumptions.
        </Notice>
      )}
      {facts.before.length > 0 && <><span className="ds-eyebrow">Needs first · {facts.before.length}</span><ul className="pj-depworks">{facts.before.map((item) => row(item, true))}</ul></>}
      {facts.after.length > 0 && <><span className="ds-eyebrow">Waits on this · {facts.after.length}</span><ul className="pj-depworks">{facts.after.map((item) => row(item))}</ul></>}
    </Stack>
  );
}

export function ActivityList({ context, facts, limit = 5 }: { context: ScreenContext; facts: TaskFacts; limit?: number }) {
  const rows = facts.events.slice(0, limit);
  if (rows.length === 0) return <span className="ds-subtle">No recorded activity yet.</span>;
  return (
    <ul className="pj-activity" aria-label="Recent activity">
      {rows.map((event) => (
        <li key={event.id}>
          <span className="ds-num ds-subtle">{context.relative(event.at)}</span>
          <span className="pj-activity-text">{event.type === "comment" ? <><MessageSquare size={12} aria-hidden="true" /> {event.message.replace(/^.*? on .*?: /, "")}</> : event.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Quick comment: written against the task and attributed to the person writing it. */
export function CommentEntry({ context, task }: { context: ScreenContext; task: Rec }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="pj-comment-entry"
      aria-label="Add a comment"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        try {
          await context.mutate.log(`${context.actor} on ${task.title}: ${text.trim()}`, { entityId: task.id, type: "comment" });
          context.toast("Comment recorded", "It is in the task's activity, attributed to you.");
          setText("");
        } finally { setBusy(false); }
      }}
    >
      <TextArea aria-label="Comment" rows={2} placeholder="Write a comment" value={text} onChange={(event) => setText(event.target.value)} />
      <Button type="submit" variant="secondary" size="sm" disabled={!text.trim() || busy}>Post the comment</Button>
    </form>
  );
}

function LinkedRecords({ context, facts }: { context: ScreenContext; facts: TaskFacts }) {
  const { org } = useWorkspace();
  const items = [
    facts.project && {
      label: "Project",
      value: <button type="button" className="pj-link" onClick={() => context.navigate(`/o/${org.slug}/project/projects/${facts.project!.id}`)}>{facts.project.title}</button>,
    },
    { label: "Time entries", value: <span className="ds-num">{facts.time.length}</span> },
    facts.approvals.length > 0 && {
      label: "Approvals",
      value: <button type="button" className="pj-link" onClick={() => context.navigate(`/o/${org.slug}/inbox/approvals`)}>{facts.approvals.length} in Inbox</button>,
    },
  ].filter(Boolean) as { label: ReactNode; value: ReactNode }[];
  return <KeyValueList items={items} />;
}

/* ------------------------------ board drawer ------------------------------ */

export function TaskInspector({ context, close }: { context: ScreenContext; close?: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id ?? context.selectedId);
  const facts = useTaskFacts(task);
  const { org } = useWorkspace();
  if (!task || task.collection !== "tasks" || !facts) return <Empty title="Select a task">Choose a card on the board to inspect it.</Empty>;
  const priority = String(task.fields.priority ?? "normal");
  return (
    <Stack gap={3}>
      <OverlaySummary
        eyebrow={facts.project ? `Task in ${facts.project.title}` : "Task"}
        title={task.title}
        status={<StagePill task={task} />}
        meta={[priority === "high" ? <Pill key="p" tone="danger">High priority</Pill> : null, facts.waitingOn.length > 0 ? <Pill key="w" tone="warning" dot>Waiting on {facts.waitingOn.length}</Pill> : null]}
      />
      {task.summary && <p className="pj-summary">{task.summary}</p>}
      <FactGrid columns={3} items={taskFactItems(context, task, facts)} />
      <OverlaySection title="Dependencies" hint={`${facts.before.length} before · ${facts.after.length} after`}
        actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("dependency selector", { id: task.id })}>Link work</Button>}>
        <DependencyList context={context} task={task} facts={facts} onOpen={(id) => { context.select(id); context.openOverlay("Task drawer", { id }); }} />
      </OverlaySection>
      <OverlaySection title="Checklist"><ChecklistProgress context={context} task={task} /></OverlaySection>
      <OverlaySection title="Linked records"><LinkedRecords context={context} facts={facts} /></OverlaySection>
      <OverlaySection title="Recent activity"><ActivityList context={context} facts={facts} /></OverlaySection>
      <OverlaySection title="Comment"><CommentEntry context={context} task={task} /></OverlaySection>
      <OverlayActions
        primary={<Button variant="primary" onClick={() => { close?.(); context.navigate(`/o/${org.slug}/project/tasks/${task.id}`); }}>Open the task</Button>}
        secondary={<>
          <Button variant="secondary" onClick={() => context.openOverlay("move task", { id: task.id })}>Move to another stage</Button>
          <Button variant="secondary" onClick={() => context.openOverlay("Assignee picker", { id: task.id })}>Reassign</Button>
        </>}
      />
    </Stack>
  );
}

/* ------------------------------ record page ------------------------------ */

/** Header parts are small components so each reads the live record. */
function TaskTitle({ context }: { context: ScreenContext }) {
  const task = useRecord(context.params.id);
  return <>{task?.title ?? "Task"}</>;
}
function TaskStatus({ context }: { context: ScreenContext }) {
  const task = useRecord(context.params.id);
  return task ? <StagePill task={task} /> : null;
}
function TaskMeta({ context }: { context: ScreenContext }) {
  const task = useRecord(context.params.id);
  const facts = useTaskFacts(task);
  const { org } = useWorkspace();
  if (!task || !facts) return null;
  return (
    <span className="pj-meta">
      {facts.project && <button type="button" className="pj-link" onClick={() => context.navigate(`/o/${org.slug}/project/projects/${facts.project!.id}`)}>{facts.project.title}</button>}
      <PersonCell name={facts.assignee} ai={facts.ai} />
      {facts.due ? <span className="ds-num" data-tone={facts.overdue ? "danger" : undefined}>Due {context.date(facts.due)}{facts.overdue ? " · overdue" : ""}</span> : <span className="ds-subtle">No due date</span>}
    </span>
  );
}

export function taskRecord(context: ScreenContext): RecordHeaderProps {
  return {
    title: <TaskTitle context={context} />,
    status: <TaskStatus context={context} />,
    meta: [<TaskMeta key="meta" context={context} />],
  };
}
