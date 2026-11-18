import { useState, type FormEvent } from "react";
import { CalendarRange } from "lucide-react";
import { Button, Card, Empty, Field, Notice, Pill, Row, TextInput } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { dependenciesOf } from "./interpreter";
import {
  barGeometry, dateProblems, dependencyConflicts, isScheduled, scheduleRange, toInput, toStored,
} from "./schedule";
import "./mission-schedule.css";

/* ====================================================================== *
 * ARL-MISSION-004 Plan → Timeline: task bars from dates a person entered.
 * ====================================================================== */

/** A fraction of the track, as an offset in the whole row (the name column takes 30% plus the gap). */
const onTrack = (fraction: number) => `calc(30% + var(--space-3) + (70% - var(--space-3)) * ${fraction.toFixed(4)})`;

export function TaskSchedule({ context, mission, tasks }: { context: ScreenContext; mission: Rec; tasks: Rec[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const locked = ["completed", "cancelled"].includes(mission.status);
  const dated = tasks.filter(isScheduled);
  const range = scheduleRange(dated, mission.dueAt, context.now);
  const conflicts = dependencyConflicts(tasks, dependenciesOf);
  const position = (iso: string) => Math.min(1, Math.max(0, (Date.parse(iso) - range.start) / Math.max(1, range.end - range.start)));
  const ticks = Array.from({ length: 5 }, (_, index) => range.start + ((range.end - range.start) * index) / 4);

  return (
    <Card eyebrow="SCHEDULE" prov="human" title="Task schedule" subtitle={`${dated.length} of ${tasks.length} tasks have dates · dates are entered by a person, never predicted`} aria-label="Task schedule">
      {conflicts.length > 0 && (
        <Notice tone="warning" title={`${conflicts.length} date${conflicts.length === 1 ? "" : "s"} clash with a dependency`}>
          {conflicts.map((conflict) => conflict.message).join(" ")}
        </Notice>
      )}
      {dated.length === 0 ? (
        <Empty icon={<CalendarRange size={20} />} title="No task has a date yet">
          Set a start or due date on a task below to place it on the timeline. Hours estimates are not turned into dates.
        </Empty>
      ) : (
        <div className="mission-sched" role="img" aria-label={`Task bars from ${context.date(new Date(range.start))} to ${context.date(new Date(range.end))}. Each task and its dates are listed below.`}>
          <div className="mission-sched-ticks">
            {ticks.map((tick) => (
              <span key={tick} style={{ insetInlineStart: `${position(new Date(tick).toISOString()) * 100}%` }}>{context.date(new Date(tick), { day: "numeric", month: "short" })}</span>
            ))}
          </div>
          <span className="mission-sched-today" style={{ insetInlineStart: onTrack(position(context.now.toISOString())) }} title="Today" />
          {mission.dueAt && <span className="mission-sched-due" style={{ insetInlineStart: onTrack(position(mission.dueAt)) }} title="Mission due" />}
          {dated.map((task) => {
            const geometry = barGeometry(task, range);
            const clash = conflicts.some((conflict) => conflict.taskId === task.id);
            return (
              <div key={task.id} className="mission-sched-row">
                <span className="mission-sched-name ds-truncate">{task.title}</span>
                <span className="mission-sched-track">
                  <span
                    className="mission-sched-bar"
                    data-stage={String(task.fields.stage ?? task.status)}
                    data-point={geometry.point ? "true" : undefined}
                    data-clash={clash ? "true" : undefined}
                    style={{ insetInlineStart: `${geometry.left * 100}%`, width: `${geometry.width * 100}%` }}
                    title={`${task.title}: ${task.startAt ? context.date(task.startAt) : "no start"} to ${task.dueAt ? context.date(task.dueAt) : "no due date"}`}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
      <ul className="mission-sched-list" aria-label="Task dates">
        {tasks.map((task) => (
          <li key={task.id}>
            <Row gap={2} wrap>
              <strong className="ds-grow">{task.title}</strong>
              <Pill tone={String(task.fields.stage) === "verified" ? "success" : "neutral"}>{String(task.fields.stage ?? task.status)}</Pill>
              <span className="ds-subtle ds-num">
                {isScheduled(task) ? `${task.startAt ? context.date(task.startAt) : "—"} → ${task.dueAt ? context.date(task.dueAt) : "—"}` : "Not scheduled"}
              </span>
              {!locked && editing !== task.id && (
                <Button size="sm" variant="ghost" aria-label={`Set dates for ${task.title}`} onClick={() => setEditing(task.id)}>{isScheduled(task) ? "Change dates" : "Set dates"}</Button>
              )}
            </Row>
            {editing === task.id && <DatesForm context={context} task={task} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DatesForm({ context, task, onDone }: { context: ScreenContext; task: Rec; onDone: () => void }) {
  const [start, setStart] = useState(toInput(task.startAt));
  const [due, setDue] = useState(toInput(task.dueAt));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const problems = dateProblems(start, due);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const stored = toStored(start, due);
      const saved = await context.mutate.patch(task.id, { startAt: stored.startAt, dueAt: stored.dueAt }, { expectRevision: task.revision, event: `Dates set on ${task.title} by ${context.actor}` });
      if (saved) { context.toast("Dates saved", `${task.title} is on the timeline.`); onDone(); }
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const saved = await context.mutate.patch(task.id, { startAt: undefined, dueAt: undefined }, { expectRevision: task.revision, event: `Dates cleared on ${task.title}` });
      if (saved) { context.toast("Dates cleared", `${task.title} is no longer on the timeline.`); onDone(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-sched-form" onSubmit={save} aria-label={`Dates for ${task.title}`} noValidate>
      <Field label="Start" error={errors.start}><TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
      <Field label="Due" error={errors.due}><TextInput type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
      <Row gap={2} wrap className="mission-sched-actions">
        <Button size="sm" variant="primary" type="submit" busy={busy}>Save dates</Button>
        {isScheduled(task) && <Button size="sm" variant="ghost" onClick={() => void clear()}>Clear dates</Button>}
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </Row>
    </form>
  );
}
