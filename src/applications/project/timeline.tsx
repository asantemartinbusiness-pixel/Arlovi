import { useMemo } from "react";
import { Empty, Notice, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { addDays } from "@/platform/clock";
import type { Rec } from "@/domain/types";

export interface Span { task: Rec; start: Date; end: Date }

export function dependenciesOf(task: Rec): string[] {
  return String(task.fields.dependsOn ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function toSpans(tasks: Rec[]): Span[] {
  return tasks
    .filter((task) => task.startAt && task.endAt)
    .map((task) => ({ task, start: new Date(task.startAt!), end: new Date(task.endAt!) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Longest chain through the dependency graph by duration, with cycles ignored. */
export function criticalPath(tasks: Rec[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map<string, { length: number; path: string[] }>();
  const visiting = new Set<string>();

  function walk(id: string): { length: number; path: string[] } {
    const cached = memo.get(id);
    if (cached) return cached;
    if (visiting.has(id)) return { length: 0, path: [] };
    const task = byId.get(id);
    if (!task) return { length: 0, path: [] };
    visiting.add(id);
    const duration = task.startAt && task.endAt ? Math.max(1, (new Date(task.endAt).getTime() - new Date(task.startAt).getTime()) / 86_400_000) : 1;
    let best = { length: 0, path: [] as string[] };
    for (const dependency of dependenciesOf(task)) {
      const candidate = walk(dependency);
      if (candidate.length > best.length) best = candidate;
    }
    visiting.delete(id);
    const result = { length: best.length + duration, path: [...best.path, id] };
    memo.set(id, result);
    return result;
  }

  let longest = { length: 0, path: [] as string[] };
  for (const task of tasks) {
    const candidate = walk(task.id);
    if (candidate.length > longest.length) longest = candidate;
  }
  return longest.path;
}

/** Depth-first cycle check used before a dependency is saved. */
export function createsCycle(tasks: Rec[], fromId: string, newDependencyId: string): boolean {
  if (fromId === newDependencyId) return true;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const stack = [newDependencyId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === fromId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const task = byId.get(current);
    if (task) stack.push(...dependenciesOf(task));
  }
  return false;
}

export function Gantt({
  context, tasks, showBaseline, highlight, onPick,
}: {
  context: ScreenContext;
  tasks: Rec[];
  showBaseline?: boolean;
  highlight?: string[];
  onPick: (task: Rec) => void;
}) {
  const spans = useMemo(() => toSpans(tasks), [tasks]);

  const bounds = useMemo(() => {
    if (spans.length === 0) return null;
    const starts = spans.map((span) => span.start.getTime());
    const ends = spans.map((span) => span.end.getTime());
    const start = new Date(Math.min(...starts, context.now.getTime()));
    const end = new Date(Math.max(...ends, context.now.getTime()));
    return { start: addDays(start, -2), end: addDays(end, 2) };
  }, [spans, context.now]);

  if (!bounds || spans.length === 0) {
    return <Empty title="Nothing on the timeline">A task needs a start and an end date before it can be drawn.</Empty>;
  }

  const total = bounds.end.getTime() - bounds.start.getTime();
  const pct = (date: Date) => ((date.getTime() - bounds.start.getTime()) / total) * 100;
  const rowIndex = new Map(spans.map((span, index) => [span.task.id, index]));

  const ticks: { label: string; left: number }[] = [];
  const cursor = new Date(bounds.start);
  cursor.setDate(1);
  while (cursor < bounds.end) {
    ticks.push({ label: context.date(cursor, { month: "short" }), left: pct(new Date(cursor)) });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const connectors: { key: string; left: number; width: number; top: number; height: number }[] = [];
  const ROW = 40;
  for (const span of spans) {
    for (const dependencyId of dependenciesOf(span.task)) {
      const from = spans.find((item) => item.task.id === dependencyId);
      if (!from) continue;
      const fromRow = rowIndex.get(dependencyId) ?? 0;
      const toRow = rowIndex.get(span.task.id) ?? 0;
      const left = Math.min(pct(from.end), pct(span.start));
      const width = Math.max(0.4, Math.abs(pct(span.start) - pct(from.end)));
      connectors.push({
        key: `${dependencyId}-${span.task.id}`,
        left,
        width,
        top: Math.min(fromRow, toRow) * ROW + 20,
        height: Math.abs(toRow - fromRow) * ROW,
      });
    }
  }

  return (
    <Stack gap={3}>
      <div className="pj-gantt">
        <div className="pj-gantt-scroll">
          <div className="pj-gantt-inner">
            <div className="pj-gantt-row pj-gantt-head">
              <div className="pj-gantt-label">Work</div>
              <div className="pj-gantt-track">
                {ticks.map((tick) => <span key={tick.label + tick.left} className="pj-gantt-tick" style={{ left: `${tick.left}%` }}>{tick.label}</span>)}
                <span className="pj-gantt-today" style={{ left: `${pct(context.now)}%` }} aria-hidden="true" />
              </div>
            </div>
            <div style={{ position: "relative" }}>
              {connectors.map((connector) => (
                <div key={connector.key} aria-hidden="true">
                  <div className="pj-dep pj-dep-h" style={{ left: `calc(220px + ${connector.left}%)`, width: `${connector.width}%`, top: connector.top }} />
                  <div className="pj-dep pj-dep-v" style={{ left: `calc(220px + ${connector.left + connector.width}%)`, top: connector.top, height: connector.height }} />
                </div>
              ))}
              {spans.map((span) => {
                const left = pct(span.start);
                const width = Math.max(1.2, pct(span.end) - left);
                const stage = String(span.task.fields.stage ?? span.task.status);
                const milestone = span.task.fields.kind === "milestone";
                const critical = highlight?.includes(span.task.id);
                const baseStart = String(span.task.fields.baselineStart ?? "");
                const baseEnd = String(span.task.fields.baselineEnd ?? "");
                const slipped = baseEnd && new Date(baseEnd).getTime() !== span.end.getTime();
                return (
                  <div className="pj-gantt-row" key={span.task.id}>
                    <div className="pj-gantt-label" title={span.task.title}>
                      {slipped && <span aria-hidden="true" style={{ color: "var(--warning, #c2740c)" }}>● </span>}
                      {span.task.title}
                    </div>
                    <div className="pj-gantt-track">
                      {showBaseline && baseStart && baseEnd && (
                        <div
                          className="pj-baseline"
                          style={{ left: `${pct(new Date(baseStart))}%`, width: `${Math.max(0.8, pct(new Date(baseEnd)) - pct(new Date(baseStart)))}%` }}
                          aria-hidden="true"
                        />
                      )}
                      {milestone ? (
                        <button
                          type="button"
                          className="pj-milestone"
                          style={{ left: `${left}%` }}
                          aria-label={`Milestone ${span.task.title}, ${context.date(span.task.endAt)}`}
                          onClick={() => onPick(span.task)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="pj-bar"
                          data-stage={stage}
                          data-critical={critical ? "true" : undefined}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          onClick={() => onPick(span.task)}
                        >
                          {context.date(span.task.startAt, { day: "numeric", month: "short" })} – {context.date(span.task.endAt, { day: "numeric", month: "short" })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Row gap={3} wrap>
        <Pill tone="info">Bar: planned work</Pill>
        <Pill tone="accent">Diamond: milestone</Pill>
        {showBaseline && <Pill tone="neutral">Grey line: baseline</Pill>}
        {highlight && highlight.length > 0 && <Pill tone="warning">Outlined: on the critical path</Pill>}
        <span className="ds-subtle">The vertical line is today, from the workspace clock.</span>
      </Row>

      <table className="ds-sr-only">
        <caption>Timeline as a table</caption>
        <thead><tr><th scope="col">Task</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Depends on</th></tr></thead>
        <tbody>
          {spans.map((span) => (
            <tr key={span.task.id}>
              <th scope="row">{span.task.title}</th>
              <td>{context.date(span.task.startAt)}</td>
              <td>{context.date(span.task.endAt)}</td>
              <td>{dependenciesOf(span.task).map((id) => tasks.find((task) => task.id === id)?.title ?? id).join(", ") || "Nothing"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Notice tone="info" title="Dates come from the records, not from a plan sheet">
        Moving a bar means changing the start and end on the task. A dependency that would create a cycle, or a date that would put
        a task before the work it depends on, is refused rather than saved.
      </Notice>
    </Stack>
  );
}
