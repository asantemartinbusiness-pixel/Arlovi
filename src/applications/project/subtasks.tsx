import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button, Card, Checkbox, Meter, Notice, Pill, Row, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import {
  addChecklistItem, moveChecklistItem, removeChecklistItem, type ChecklistItem, type HealthCheck, type HealthLevel,
} from "./taskWork";

/* ARL-PROJECT-005 · subtasks: add, tick, reorder and remove, saved on the task. */
export function SubtaskEditor({ context, task, checklist }: { context: ScreenContext; task: Rec; checklist: ChecklistItem[] }) {
  const [label, setLabel] = useState("");
  const done = checklist.filter((item) => item.done).length;
  const duplicate = Boolean(label.trim()) && addChecklistItem(checklist, label) === checklist;

  async function save(next: ChecklistItem[], event: string) {
    if (!(await context.mutate.patch(task.id, { body: { ...(task.body as object ?? {}), checklist: next } }, { expectRevision: task.revision, event }))) return;
  }

  return (
    <Card title="Subtasks" subtitle={`${done} of ${checklist.length} done`}>
      <Stack gap={3}>
        {checklist.length > 0 && <Meter value={done} max={checklist.length} label="Subtasks done" />}
        {checklist.length === 0 && <span className="ds-subtle">No subtasks yet. Break the task into steps somebody can tick off.</span>}
        <ul className="pj-subtasks" aria-label="Subtasks">
          {checklist.map((item, index) => (
            <li key={`${item.label}-${index}`} className="pj-subtask" data-done={item.done ? "true" : undefined}>
              <Checkbox
                label={item.label}
                checked={item.done}
                onChange={(event) => void save(
                  checklist.map((entry, position) => (position === index ? { ...entry, done: event.target.checked } : entry)),
                  `Subtask "${item.label}" ${event.target.checked ? "ticked" : "unticked"} on ${task.title} by ${context.actor}`,
                )}
              />
              <span className="pj-subtask-tools">
                <Button size="sm" variant="ghost" aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => void save(moveChecklistItem(checklist, index, -1), `Subtasks reordered on ${task.title}`)}><ArrowUp size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`Move ${item.label} down`} disabled={index === checklist.length - 1} onClick={() => void save(moveChecklistItem(checklist, index, 1), `Subtasks reordered on ${task.title}`)}><ArrowDown size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`Remove ${item.label}`} onClick={() => void save(removeChecklistItem(checklist, index), `Subtask "${item.label}" removed from ${task.title} by ${context.actor}`)}><X size={14} /></Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="pj-subtask-add"
          aria-label="Add a subtask"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = addChecklistItem(checklist, label);
            if (next === checklist) return;
            await save(next, `Subtask "${label.trim()}" added to ${task.title} by ${context.actor}`);
            setLabel("");
          }}
        >
          <TextInput aria-label="New subtask" placeholder="Add a subtask" value={label} onChange={(event) => setLabel(event.target.value)} invalid={duplicate} />
          <Button type="submit" variant="secondary" disabled={!label.trim() || duplicate}>Add</Button>
        </form>
        {duplicate && <span className="ds-subtle">That subtask is already on the list.</span>}
      </Stack>
    </Card>
  );
}

const LEVEL_TONE: Record<HealthLevel, "success" | "warning" | "danger"> = { on_track: "success", at_risk: "warning", off_track: "danger" };
const LEVEL_LABEL: Record<HealthLevel, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };

/* ARL-PROJECT-003 · declared health beside the signals counted from the work. */
export function HealthCheckCard({ context, project, check, progress, taskCount }: { context: ScreenContext; project: Rec; check: HealthCheck; progress: number; taskCount: number }) {
  const declared = String(project.fields.health ?? "") as HealthLevel | "";
  const mismatch = declared && declared !== check.computed;
  return (
    <Card span={12} eyebrow="HEALTH" prov="human" title="Health check" subtitle="What was declared, beside what the work shows">
      <Stack gap={3}>
        <Row gap={3} wrap>
          <span>Declared: {declared ? <Pill tone={LEVEL_TONE[declared] ?? "neutral"} dot>{LEVEL_LABEL[declared] ?? declared}</Pill> : <Pill tone="neutral">not set</Pill>}</span>
          <span>Signals: <Pill tone={LEVEL_TONE[check.computed]} dot>{LEVEL_LABEL[check.computed]}</Pill></span>
          <span className="ds-subtle"><span className="ds-num">{progress}%</span> of {taskCount} tasks done</span>
        </Row>
        {check.signals.length === 0
          ? <span className="ds-subtle">No late, blocked or waiting work, and spend is inside the budget.</span>
          : (
            <ul className="pj-signals" aria-label="Health signals">
              {check.signals.map((signal) => <li key={signal.label}><Pill tone={LEVEL_TONE[signal.level]} dot>{LEVEL_LABEL[signal.level]}</Pill> {signal.label}</li>)}
            </ul>
          )}
        {mismatch && (
          <Notice tone="warning" title="The declared health and the signals disagree" actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("change status")}>Change status</Button>}>
            The status is a judgement a person makes; the signals are counted. Either update the status or post an update that explains the difference.
          </Notice>
        )}
        <span className="ds-subtle">Progress is the share of tasks in the Done lane. A blocker is a task in the Blocked lane. Neither figure is a judgement.</span>
      </Stack>
    </Card>
  );
}
