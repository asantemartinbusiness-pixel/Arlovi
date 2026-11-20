import { useMemo, useState } from "react";
import { AlertOctagon, CalendarClock, Gauge, PlugZap, ShieldQuestion } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, Meter, ModalActions, ModalInFlight, Notice, OverlayActions, OverlaySummary, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, PROVIDER_CAPABILITIES, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import { addDays, startOfMonth } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { readGraph } from "./engine";
import { describeSchedule, nextOccurrences, readSchedule, type ScheduleSpec } from "./schedule";
import { readRun } from "./panels";
import { executeRun, useGraphRecords, LiveRunRefused, useLiveRunBlocker } from "./runner";

/* ====================================================================== *
 * ARL-AUTO-008 — Schedules & queues
 * ====================================================================== */

interface Firing {
  workflow: Rec;
  at: Date;
  localLabel: string;
  dstShift: boolean;
  duplicate: boolean;
}

function firingsFor(workflows: Rec[], from: Date, days: number, timezone: string): Firing[] {
  const out: Firing[] = [];
  const seen = new Set<string>();
  for (const workflow of workflows) {
    const spec = readSchedule(workflow.fields, timezone);
    if (spec.paused) continue;
    const perWorkflow = nextOccurrences(spec, from, spec.frequency === "hourly" ? 48 : days + 4);
    for (const occurrence of perWorkflow) {
      if (occurrence.at.getTime() > from.getTime() + days * 86_400_000) break;
      const key = `${workflow.id}-${occurrence.at.toISOString()}`;
      out.push({
        workflow,
        at: occurrence.at,
        localLabel: occurrence.localLabel,
        dstShift: occurrence.dstShift,
        duplicate: seen.has(key),
      });
      seen.add(key);
    }
  }
  return out.sort((left, right) => left.at.getTime() - right.at.getTime());
}

export function SchedulesAndQueues({ context }: { context: ScreenContext }) {
  const workflows = useCollection("workflows");
  const runs = useCollection("workflowRuns");
  const active = useMemo(() => workflows.filter((workflow) => workflow.status === "active"), [workflows]);
  // Date objects built during render change identity on every render.
  // The primitive timestamp keeps the expensive recurring-firing forecast cached.
  const monthStartMs = startOfMonth(context.now).getTime();
  const monthStart = new Date(monthStartMs);
  const firings = useMemo(
    () => firingsFor(active, addDays(new Date(monthStartMs), -1), 34, context.org.timezone),
    [active, monthStartMs, context.org.timezone],
  );

  if (workflows.length === 0) {
    return <Empty title="No automation to schedule" icon={<CalendarClock size={20} />}>Create an automation first; its recurrence is set on its trigger screen.</Empty>;
  }

  if (context.tab === "Queues") {
    const waiting = runs.filter((run) => ["waiting_approval", "blocked"].includes(run.status));
    const perWorkflow = active.map((workflow) => {
      const spec = readSchedule(workflow.fields, context.org.timezone);
      const pending = waiting.filter((run) => run.parentId === workflow.id || run.fields.workflowId === workflow.id);
      const next = nextOccurrences(spec, context.now, 1)[0];
      return { workflow, spec, pending, next };
    });
    const pressured = perWorkflow.filter((row) => row.pending.length > row.spec.concurrency);

    return (
      <Stack gap={5}>
        <StatRow>
          <Stat prov="agent" label="Runs waiting" value={String(waiting.length)} meta="Paused at a gate or stopped at a provider" />
          <Stat prov="human" label="Active automations" value={String(active.length)} meta={`${workflows.length} in total`} />
          <Stat prov="agent" label="Over their concurrency" value={String(pressured.length)} meta="Waiting runs exceed the allowed parallel runs" />
          <Stat prov="agent" label="Workers" value="1" meta="A single local interpreter, in this tab" />
        </StatRow>

        {pressured.length > 0 && (
          <Notice tone="warning" title="Backpressure">
            {pressured.map((row) => `${row.workflow.title} has ${row.pending.length} waiting against a concurrency of ${row.spec.concurrency}`).join("; ")}.
            A new firing would queue behind them rather than start.
          </Notice>
        )}

        <Card eyebrow="QUEUES" prov="agent" title="Queue per automation" subtitle="Pending work and the next firing" flush>
          <DataGrid
            rows={perWorkflow}
            rowId={(row) => row.workflow.id}
            label="Queues"
            rowTone={(row) => (row.pending.length > row.spec.concurrency ? "warning" : undefined)}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/workflows/${id}`)}
            columns={[
              { key: "title", header: "Automation", primary: true, cell: (row) => row.workflow.title, filterValue: (row) => row.workflow.title },
              { key: "recurrence", header: "Recurrence", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{describeSchedule(row.spec)}</span>, hideBelow: 1000 },
              { key: "pending", header: "Waiting", align: "end", cell: (row) => <Pill tone={row.pending.length ? "warning" : "success"}>{row.pending.length}</Pill>, sortValue: (row) => -row.pending.length },
              { key: "concurrency", header: "Concurrency", align: "end", cell: (row) => String(row.spec.concurrency) },
              { key: "next", header: "Next firing", align: "end", cell: (row) => (row.next ? row.next.localLabel : "—"), sortValue: (row) => row.next?.at.toISOString() ?? "" },
            ]}
          />
        </Card>

        {waiting.length > 0 && (
          <Card eyebrow="PENDING" prov="agent" title="Pending jobs" subtitle="Each one is a real run with a cursor" flush>
            <DataGrid
              rows={waiting}
              rowId={(row) => row.id}
              label="Pending jobs"
              onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${id}`)}
              columns={[
                { key: "run", header: "Run", primary: true, cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.id}</code>, filterValue: (row) => row.id },
                { key: "status", header: "Status", cell: (row) => <Pill tone="warning" dot>{row.status}</Pill> },
                { key: "cursor", header: "Stopped at", cell: (row) => String(row.fields.cursor || "—") },
                { key: "when", header: "Since", align: "end", cell: (row) => context.relative(row.at), sortValue: (row) => row.at ?? "" },
              ]}
            />
          </Card>
        )}
      </Stack>
    );
  }

  if (context.tab === "Limits") {
    return (
      <Grid>
        {workflows.map((workflow) => {
          const spec = readSchedule(workflow.fields, context.org.timezone);
          const graph = readGraph(workflow);
          return (
            <Card key={workflow.id} span={6} title={workflow.title} subtitle={describeSchedule(spec)}>
              <Stack gap={3}>
                <Field label="Parallel runs allowed" hint="A firing beyond this number queues instead of starting.">
                  <TextInput aria-label="Parallel runs allowed" type="number" min={1} max={8} value={String(spec.concurrency)}
                    onChange={(event) => {
                      const next = Math.min(8, Math.max(1, Number(event.target.value) || 1));
                      void context.mutate.patch(workflow.id, { fields: { ...workflow.fields, concurrency: next } }, { expectRevision: workflow.revision, event: "Concurrency changed" });
                    }}
                  />
                </Field>
                <Properties rows={[
                  { label: "Step limit", value: String(graph.limits?.maxSteps ?? 40) },
                  { label: "Visits per node", value: String(graph.limits?.maxVisits ?? 3) },
                  { label: "Time zone", value: spec.timezone },
                  { label: "Paused", value: <Pill tone={spec.paused ? "warning" : "success"}>{spec.paused ? "yes" : "no"}</Pill> },
                ]} />
                <Meter value={graph.nodes.length} max={graph.limits?.maxSteps ?? 40} label={`${workflow.title} nodes against the step limit`} />
                <Row gap={2}>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${workflow.id}?tab=Parameters`)}>Change the step limits</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const saved = await context.mutate.patch(workflow.id, { fields: { ...workflow.fields, schedulePaused: !spec.paused } }, { expectRevision: workflow.revision, event: spec.paused ? "Schedule resumed" : "Schedule paused" });
                      if (!saved) return;
                      context.toast(spec.paused ? "Schedule resumed" : "Schedule paused", spec.paused ? `Firings are computed again for ${workflow.title}.` : `No firing is computed for ${workflow.title} until it is resumed.`);
                    }}
                  >
                    {spec.paused ? "Resume the schedule" : "Pause the schedule"}
                  </Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (context.tab === "History") {
    const rows = runs.slice().sort((left, right) => String(right.at ?? "").localeCompare(String(left.at ?? "")));
    return (
      <Card eyebrow="HISTORY" prov="agent" title="Firing history" subtitle={`${rows.length} recorded run${rows.length === 1 ? "" : "s"}`} flush>
        {rows.length === 0 ? (
          <Empty title="No run has fired" icon={<CalendarClock size={20} />}>No scheduler runs in this browser, so every recorded run was started by hand from a builder or a test screen.</Empty>
        ) : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Firing history"
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${id}`)}
            columns={[
              { key: "run", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "trigger", header: "Started by", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{String(row.fields.trigger ?? "—")}</span>, hideBelow: 1000 },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "completed" ? "success" : row.status === "failed" ? "danger" : "warning"} dot>{row.status}</Pill> },
              { key: "when", header: "Fired", align: "end", cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at ?? "" },
            ]}
          />
        )}
      </Card>
    );
  }

  /* Calendar */
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: { date: Date; outside: boolean }[] = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ date: addDays(monthStart, index - firstWeekday), outside: true });
  for (let day = 0; day < daysInMonth; day += 1) cells.push({ date: addDays(monthStart, day), outside: false });
  while (cells.length % 7 !== 0) cells.push({ date: addDays(monthStart, cells.length - firstWeekday), outside: true });
  const dstFirings = firings.filter((firing) => firing.dstShift);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Active schedules" value={String(active.length)} meta={`${workflows.length - active.length} not active`} />
        <Stat prov="agent" label="Firings this month" value={String(firings.filter((firing) => firing.at.getMonth() === monthStart.getMonth()).length)} meta={`Computed in ${context.org.timezone}`} />
        <Stat prov="agent" label="Clock changes in range" value={String(dstFirings.length)} meta={dstFirings.length ? "The local time holds; the UTC instant moves" : "No offset change in this window"} />
        <Stat prov="agent" label="Duplicates suppressed" value={String(firings.filter((firing) => firing.duplicate).length)} meta="Two schedules resolving to the same instant" />
      </StatRow>

      <Notice tone="warning" title="These firings are computed, not scheduled">
        Nothing in this browser wakes up to run them. The calendar shows when a scheduler would fire each automation, resolved in the company's zone so a clock change is visible.
      </Notice>

      <Card title={context.date(monthStart, { month: "long", year: "numeric" })} subtitle={`${context.org.timezone}`}>
        <div className="auto-cal" role="table" aria-label="Scheduled firings this month">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
            <div key={name} className="auto-cal-head" role="columnheader">{name}</div>
          ))}
          {cells.map((cell) => {
            const dayFirings = firings.filter((firing) =>
              firing.at.getFullYear() === cell.date.getFullYear()
              && firing.at.getMonth() === cell.date.getMonth()
              && firing.at.getDate() === cell.date.getDate());
            const today = cell.date.toDateString() === context.now.toDateString();
            return (
              <div
                key={cell.date.toISOString()}
                className="auto-cal-cell"
                data-today={today ? "true" : undefined}
                data-outside={cell.outside ? "true" : undefined}
                role="cell"
              >
                <span className="ds-num">{cell.date.getDate()}</span>
                {dayFirings.slice(0, 3).map((firing, position) => (
                  <span key={`${position}-${firing.workflow.id}-${firing.at.toISOString()}`} className="auto-cal-fire" data-dst={firing.dstShift ? "true" : undefined} title={`${firing.workflow.title} — ${firing.localLabel}`}>
                    {firing.localLabel.split(", ").pop()} {firing.workflow.title}
                  </span>
                ))}
                {dayFirings.length > 3 && <span className="ds-subtle">+{dayFirings.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card eyebrow="SCHEDULE" prov="agent" title="Next firings in order" subtitle="With the zone offset applied at each instant" flush>
        {firings.length === 0 ? (
          <Empty title="No active schedule" icon={<CalendarClock size={20} />}>Activate an automation and set its recurrence to see firings here.</Empty>
        ) : (
          <DataGrid
            rows={firings.slice(0, 40).map((firing, index) => ({ ...firing, id: `${firing.workflow.id}-${index}` }))}
            rowId={(row) => row.id}
            label="Next firings"
            onOpen={(id) => {
              const found = firings.find((_firing, index) => `${_firing.workflow.id}-${index}` === id);
              if (found) context.navigate(`/o/${context.org.slug}/auto/workflows/${found.workflow.id}/triggers`);
            }}
            columns={[
              { key: "when", header: "Local time", primary: true, cell: (row) => row.localLabel, sortValue: (row) => row.at.toISOString() },
              { key: "utc", header: "UTC", cell: (row) => <span className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.at.toISOString().slice(0, 16).replace("T", " ")}</span>, hideBelow: 900 },
              { key: "workflow", header: "Automation", cell: (row) => row.workflow.title, filterValue: (row) => row.workflow.title },
              { key: "flags", header: "Notes", align: "end", cell: (row) => (row.dstShift ? <Pill tone="warning">offset changed</Pill> : row.duplicate ? <Pill tone="danger">duplicate dropped</Pill> : <Pill tone="success">normal</Pill>) },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

export function ScheduleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const workflows = useCollection("workflows");
  const [id, setId] = useState(context.selectedId ?? workflows[0]?.id ?? "");
  const workflow = workflows.find((item) => item.id === id);
  const [spec, setSpec] = useState<Partial<ScheduleSpec>>({});
  if (!workflow) return <Empty title="No automation to reschedule" />;
  const current = readSchedule(workflow.fields, context.org.timezone);
  const merged: ScheduleSpec = { ...current, ...spec };
  const preview = nextOccurrences(merged, context.now, 5);

  return (
    <Stack gap={4}>
      <Field label="Automation">
        <Select aria-label="Automation" value={id} onChange={(event) => { setId(event.target.value); setSpec({}); }}>
          {workflows.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Frequency">
        <Select aria-label="Frequency" value={merged.frequency} onChange={(event) => setSpec({ ...spec, frequency: event.target.value as ScheduleSpec["frequency"] })}>
          {["hourly", "daily", "weekly", "monthly"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Field label="Hour"><TextInput aria-label="Hour" type="number" min={0} max={23} value={String(merged.hour)} onChange={(event) => setSpec({ ...spec, hour: Number(event.target.value) })} /></Field>
        <Field label="Minute"><TextInput aria-label="Minute" type="number" min={0} max={59} value={String(merged.minute)} onChange={(event) => setSpec({ ...spec, minute: Number(event.target.value) })} /></Field>
      </Row>
      <Field label="Time zone">
        <Select aria-label="Time zone" value={merged.timezone} onChange={(event) => setSpec({ ...spec, timezone: event.target.value })}>
          {["Europe/London", "America/New_York", "Europe/Paris", "Australia/Sydney", "UTC"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </Select>
      </Field>
      <Stack gap={1}>
        <strong>Next firings</strong>
        {preview.map((item, position) => (
          <Row key={`${position}-${item.at.toISOString()}`} gap={2}>
            <span className="ds-grow">{item.localLabel}</span>
            {item.dstShift && <Pill tone="warning">offset changed</Pill>}
          </Row>
        ))}
      </Stack>
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        onClick={async () => {
          const saved = await context.mutate.patch(workflow.id, {
            fields: {
              ...workflow.fields,
              scheduleFrequency: merged.frequency,
              scheduleHour: merged.hour,
              scheduleMinute: merged.minute,
              scheduleTimezone: merged.timezone,
            },
          }, { expectRevision: workflow.revision, event: "Schedule changed" });
          if (!saved) return;
          context.toast("Rescheduled", `${describeSchedule(merged)} Recorded only; nothing fires it.`);
          close();
        }}
      >
        Save the schedule
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function QueuePriority({ context, close }: { context: ScreenContext; close: () => void }) {
  const workflows = useCollection("workflows");
  const [id, setId] = useState(context.selectedId ?? workflows[0]?.id ?? "");
  const workflow = workflows.find((item) => item.id === id);
  const [concurrency, setConcurrency] = useState<number | null>(null);
  if (!workflow) return <Empty title="No automation to change" />;
  const spec = readSchedule(workflow.fields, context.org.timezone);
  const value = concurrency ?? spec.concurrency;
  return (
    <Stack gap={4}>
      <Field label="Automation">
        <Select aria-label="Automation" value={id} onChange={(event) => { setId(event.target.value); setConcurrency(null); }}>
          {workflows.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Parallel runs allowed" hint="How many runs of this automation a scheduler would allow at once.">
        <TextInput aria-label="Parallel runs allowed" type="number" min={1} max={8} value={String(value)} onChange={(event) => setConcurrency(Number(event.target.value))} />
      </Field>
      <Notice tone="info" title="One worker runs here">
        This browser executes one run at a time, in the tab. The concurrency figure is what a scheduler would honour, and the queue screen measures waiting runs against it.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        onClick={async () => {
          if (!await context.mutate.patch(workflow.id, { fields: { ...workflow.fields, concurrency: Math.min(8, Math.max(1, value)) } }, { expectRevision: workflow.revision, event: "Concurrency changed" })) return;
          context.toast("Concurrency changed", `${workflow.title} allows ${Math.min(8, Math.max(1, value))} parallel run${value === 1 ? "" : "s"}.`);
          close();
        }}
      >
        Save
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function ImpactWarning({ context }: { context: ScreenContext }) {
  const workflows = useCollection("workflows");
  const runs = useCollection("workflowRuns");
  const active = useMemo(() => workflows.filter((workflow) => workflow.status === "active"), [workflows]);
  const at = context.now.getTime();
  const firings = useMemo(() => firingsFor(active, new Date(at), 7, context.org.timezone), [active, at, context.org.timezone]);
  const waiting = runs.filter((run) => ["waiting_approval", "blocked"].includes(run.status));
  const providerSteps = active.flatMap((workflow) => readGraph(workflow).nodes.filter((node) => node.config?.kind === "provider.call").map((node) => ({ workflow, node })));

  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Firings in the next seven days", value: String(firings.length), mono: true },
        { label: "Runs already waiting", value: String(waiting.length), mono: true },
        { label: "Steps that would call a provider", value: String(providerSteps.length), mono: true },
        { label: "Workers available", value: "1 local interpreter" },
      ]} />
      {providerSteps.length > 0 && (
        <Notice tone="warning" title="Provider steps would not run">
          {providerSteps.map((item) => `${item.workflow.title}: ${item.node.label}`).join("; ")}. Each would stop at the boundary and record that it did not run.
        </Notice>
      )}
      {firings.length > 12 && (
        <Notice tone="warning" title="That is a lot of firings for one worker">
          {firings.length} firings in a week against a single worker. A scheduler would queue them; the queue screen shows the backpressure.
        </Notice>
      )}
      <Notice tone="info" title="What changing a schedule does here">
        It changes the recorded recurrence and therefore what this calendar computes. It does not register anything with a scheduler, because there is none.
      </Notice>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-AUTO-009 — Automation exceptions
 * ====================================================================== */

export type ExceptionTab = "New" | "Investigating" | "Awaiting user" | "Resolved";

const STATUS_FOR_TAB: Record<ExceptionTab, string[]> = {
  New: ["new"],
  Investigating: ["investigating"],
  "Awaiting user": ["awaiting_user"],
  Resolved: ["resolved", "closed"],
};

export function useAutomationExceptions() {
  const incidents = useCollection("incidents");
  return useMemo(() => incidents.filter((incident) => incident.fields.kind === "automation"), [incidents]);
}

export function AutomationExceptions({ context, tab }: { context: ScreenContext; tab: ExceptionTab }) {
  const exceptions = useAutomationExceptions();
  const runs = useCollection("workflowRuns");
  const workflows = useCollection("workflows");
  const connectors = useCollection("connectors");

  const unraised = useMemo(() => runs.filter((run) => {
    if (!["failed", "blocked"].includes(run.status) && Number(run.fields.blocked ?? 0) === 0 && Number(run.fields.failed ?? 0) === 0) return false;
    return !exceptions.some((exception) => exception.fields.runId === run.id);
  }), [runs, exceptions]);

  const inTab = exceptions.filter((exception) => STATUS_FOR_TAB[tab].includes(exception.status));

  if (tab === "New") {
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat prov="human" label="Open exceptions" value={String(exceptions.filter((item) => !["resolved", "closed"].includes(item.status)).length)} meta={`${exceptions.length} recorded in total`} />
          <Stat prov="agent" label="Runs that stopped" value={String(runs.filter((run) => ["failed", "blocked"].includes(run.status)).length)} meta="Failed or stopped at a provider" />
          <Stat prov="agent" label="Not yet raised" value={String(unraised.length)} meta="A run that stopped with no exception against it" />
          <Stat prov="unknown" label="Connections unavailable" value={String(PROVIDER_CAPABILITIES.filter((capability) => capability.state !== "verified_external").length)} meta={`of ${PROVIDER_CAPABILITIES.length} capabilities`} />
        </StatRow>

        <Card eyebrow="DETECTED" prov="agent" title="Detected, not yet raised" subtitle={`${unraised.length} run${unraised.length === 1 ? "" : "s"} stopped without an exception`}>
          {unraised.length === 0 ? (
            <Empty title="Nothing undetected" icon={<ShieldQuestion size={20} />}>Every run that stopped already has an exception against it.</Empty>
          ) : (
            <Stack gap={2}>
              {unraised.map((run) => {
                const stored = readRun(run);
                const step = stored?.result.steps.find((item) => item.status === "failed" || item.status === "blocked");
                return (
                  <Row key={run.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                    <Pill tone={run.status === "failed" ? "danger" : "warning"} dot>{run.status}</Pill>
                    <div className="ds-grow">
                      <strong>{stored?.workflowTitle ?? run.title}</strong>
                      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{step ? `${step.label}: ${step.message}` : run.summary}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await context.mutate.create({
                          collection: "incidents",
                          title: `Automation exception · ${stored?.workflowTitle ?? run.title}`,
                          status: "new",
                          summary: step?.message ?? run.summary,
                          parentId: run.id,
                          fields: {
                            kind: "automation",
                            runId: run.id,
                            workflowId: String(run.fields.workflowId ?? run.parentId ?? ""),
                            cause: step?.status === "blocked" ? "provider" : "step_failure",
                            nodeId: step?.nodeId ?? "",
                            severity: step?.status === "failed" ? "high" : "medium",
                          },
                        }, `Exception raised from ${run.id}`);
                        context.toast("Exception raised", "It is on this board as new, with the failing step recorded.");
                      }}
                    >
                      Raise
                    </Button>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card eyebrow="TRIAGE" prov="human" title="New exceptions" subtitle={`${inTab.length} waiting for triage`} flush>
          {inTab.length === 0 ? (
            <Empty title="Nothing new" icon={<AlertOctagon size={20} />}>Raised exceptions appear here until someone takes them.</Empty>
          ) : (
            <DataGrid
              rows={inTab}
              rowId={(row) => row.id}
              label="New exceptions"
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              onOpen={() => context.openOverlay("Incident detail")}
              columns={[
                { key: "title", header: "Exception", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
                { key: "cause", header: "Root cause", cell: (row) => <Pill tone={row.fields.cause === "provider" ? "warning" : "danger"}>{String(row.fields.cause ?? "unknown")}</Pill> },
                { key: "severity", header: "Severity", cell: (row) => String(row.fields.severity ?? "medium") },
                { key: "run", header: "Run", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{String(row.fields.runId ?? "—")}</code>, hideBelow: 1100 },
                { key: "when", header: "Raised", align: "end", cell: (row) => context.relative(row.createdAt), sortValue: (row) => row.createdAt },
              ]}
            />
          )}
        </Card>
      </Stack>
    );
  }

  if (tab === "Investigating") {
    return (
      <Stack gap={4}>
        {inTab.length === 0 ? (
          <Empty title="Nothing under investigation" icon={<AlertOctagon size={20} />}>Assign a new exception to move it here with its root cause.</Empty>
        ) : inTab.map((exception) => {
          const run = runs.find((item) => item.id === exception.fields.runId);
          const stored = readRun(run);
          const step = stored?.result.steps.find((item) => item.nodeId === exception.fields.nodeId) ?? stored?.result.steps.find((item) => item.status === "failed" || item.status === "blocked");
          const workflow = workflows.find((item) => item.id === exception.fields.workflowId);
          return (
            <Card
              key={exception.id}
              title={exception.title}
              subtitle={`Assigned to ${exception.ownerName}`}
              actions={<Pill tone={exception.fields.cause === "provider" ? "warning" : "danger"} dot>{String(exception.fields.cause)}</Pill>}
            >
              <Grid>
                <Card span={7} eyebrow="ROOT CAUSE" prov="agent" title="Root cause as recorded" subtitle={step ? `${step.label} — ${step.status}` : "No step trace"}>
                  {step ? (
                    <Stack gap={2}>
                      <p>{step.message}</p>
                      <Properties rows={[
                        { label: "Node", value: `${step.label} (${step.nodeId})` },
                        { label: "Attempts", value: String(step.attempts.length) },
                        { label: "Receipt", value: <code className="ds-num">{step.receipt}</code> },
                        { label: "Capability", value: step.capability ? `${step.capability.label} — ${CAPABILITY_LABELS[step.capability.state]}` : "none" },
                      ]} />
                    </Stack>
                  ) : (
                    <Notice tone="warning" title="No step trace for the linked run">The cause cannot be read from the run, so it must be investigated by hand.</Notice>
                  )}
                </Card>
                <Card span={5} eyebrow="ACTIONS" prov="human" title="What can be done" subtitle="Only what this browser can genuinely do">
                  <Stack gap={2}>
                    {run && <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs/${run.id}`)}>Open the run trace</Button>}
                    {workflow && <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${workflow.id}`)}>Open the automation</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { context.select(exception.id); context.openOverlay("connector reconnect"); }}>Fix the connection</Button>
                    <Button size="sm" variant="ghost" onClick={() => { context.select(exception.id); context.openOverlay("resolution record"); }}>Record a resolution</Button>
                  </Stack>
                </Card>
              </Grid>
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (tab === "Awaiting user") {
    const blockedByProvider = exceptions.filter((exception) => exception.fields.cause === "provider" && !["resolved", "closed"].includes(exception.status));
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="These need a connection, not a code change">
          A step that stopped at a provider boundary cannot be fixed by retrying. The connection has to exist and be verified first.
        </Notice>
        <Grid>
          <Card span={7} eyebrow="AWAITING" prov="human" title="Waiting on a person" subtitle={`${inTab.length} in this state, ${blockedByProvider.length} caused by a provider`}>
            {inTab.length === 0 && blockedByProvider.length === 0 ? (
              <Empty title="Nothing is waiting on a person" icon={<PlugZap size={20} />}>Exceptions move here when the fix needs a decision or a connection.</Empty>
            ) : (
              <Stack gap={2}>
                {[...inTab, ...blockedByProvider.filter((item) => !inTab.includes(item))].map((exception) => (
                  <Row key={exception.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                    <Pill tone="warning" dot>{exception.status}</Pill>
                    <div className="ds-grow">
                      <strong>{exception.title}</strong>
                      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{exception.summary}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { context.select(exception.id); context.openOverlay("connector reconnect"); }}>Reconnect</Button>
                  </Row>
                ))}
              </Stack>
            )}
          </Card>
          <Card span={5} eyebrow="CONNECTIONS" prov="unknown" title="Connections in this company" subtitle={`${connectors.length} recorded`}>
            <Stack gap={2}>
              {PROVIDER_CAPABILITIES.map((capability) => (
                <Row key={capability.id} gap={2}>
                  <span className="ds-grow ds-truncate">{capability.label}</span>
                  <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>
                </Row>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  /* Resolved */
  return (
    <Stack gap={4}>
      {inTab.length === 0 ? (
        <Empty title="Nothing resolved yet" icon={<Gauge size={20} />}>A resolution records what was done and whether a provider confirmed it.</Empty>
      ) : (
        <Stack gap={3}>
          {inTab.map((exception) => {
            const verified = exception.fields.providerVerified === true;
            return (
              <Card
                key={exception.id}
                title={exception.title}
                subtitle={`Closed by ${exception.updatedBy} · ${context.dateTime(exception.updatedAt)}`}
                actions={<Pill tone={verified ? "success" : "warning"} dot>{verified ? "provider verified" : "resolved locally, provider unverified"}</Pill>}
              >
                <Stack gap={2}>
                  <p>{String(exception.fields.resolution ?? exception.summary)}</p>
                  {!verified && (
                    <Notice tone="warning" title="This is not a verified fix">
                      The cause was a provider and no provider has confirmed anything, so the exception is recorded as resolved locally. It is deliberately not shown as a clean resolution.
                    </Notice>
                  )}
                  <Properties rows={[
                    { label: "Run", value: String(exception.fields.runId ?? "—") },
                    { label: "Cause", value: String(exception.fields.cause ?? "unknown") },
                    { label: "Verified externally", value: verified ? "yes" : "no" },
                  ]} />
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

/* ------------------------------ 009 overlays ------------------------------ */

export function IncidentSummary({ context }: { context: ScreenContext }) {
  const exception = useRecord(context.selectedId);
  if (!exception) return null;
  const done = ["resolved", "closed"].includes(exception.status);
  const verified = exception.fields.providerVerified === true;
  return (
    <OverlaySummary
      eyebrow="Automation exception"
      title={exception.title}
      status={<Pill tone={done ? (verified || exception.fields.cause !== "provider" ? "success" : "warning") : "warning"} dot>{exception.status.replace(/_/g, " ")}</Pill>}
      meta={[`Owner ${exception.ownerName}`, `Raised ${context.dateTime(exception.createdAt)}`]}
    />
  );
}

export function IncidentDetail({ context }: { context: ScreenContext }) {
  const exception = useRecord(context.selectedId);
  const run = useRecord(String(exception?.fields.runId ?? ""));
  const stored = readRun(run);
  if (!exception) return <Empty title="Choose an exception" />;
  const step = stored?.result.steps.find((item) => item.nodeId === exception.fields.nodeId);
  const done = ["resolved", "closed"].includes(exception.status);
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Cause", value: String(exception.fields.cause ?? "unknown") },
        { label: "Severity", value: String(exception.fields.severity ?? "medium") },
        { label: "Run", value: String(exception.fields.runId ?? "Not recorded"), mono: true },
        { label: "Node", value: String(exception.fields.nodeId || "Not recorded"), mono: true },
      ]} />
      <p>{exception.summary}</p>
      {step && (
        <Notice tone={step.status === "failed" ? "danger" : "warning"} title={`${step.label}: ${step.status}`}>
          {step.message}
        </Notice>
      )}
      {done && exception.fields.cause === "provider" && exception.fields.providerVerified !== true && (
        <Notice tone="warning" title="Resolved locally, provider unverified">
          No provider has confirmed the fix, so this is not a verified resolution.
        </Notice>
      )}
      <DrawerActions>
        <OverlayActions
          primary={run ? <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs/${run.id}`)}>Open the run</Button> : undefined}
          secondary={!done ? <Button variant="secondary" onClick={() => context.openOverlay("resolution record")}>Record a resolution</Button> : undefined}
        />
      </DrawerActions>
    </Stack>
  );
}

export function ConnectorReconnect({ context, close }: { context: ScreenContext; close: () => void }) {
  const exception = useRecord(context.selectedId);
  const [capabilityId, setCapabilityId] = useState("email.send");
  const capability = capabilityById(capabilityId);
  return (
    <Stack gap={4}>
      <Field label="Capability to reconnect">
        <Select aria-label="Capability to reconnect" value={capabilityId} onChange={(event) => setCapabilityId(event.target.value)}>
          {PROVIDER_CAPABILITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      {capability && (
        <Notice tone="warning" title={`${capability.provider} — ${CAPABILITY_LABELS[capability.state]}`}>
          {capability.note} {capability.localEquivalent}
        </Notice>
      )}
      <Notice tone="danger" title="A connection cannot be made from here">
        There is no server to hold a credential and no provider to authorise it. The button below only records the attempt and moves the exception to awaiting user. It does not connect anything and does not resolve the exception.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="secondary"
        disabled={!exception}
        onClick={async () => {
          if (!exception) return;
          const saved = await context.mutate.patch(exception.id, {
            status: "awaiting_user",
            fields: { ...exception.fields, reconnectAttemptedAt: new Date(context.now).toISOString(), capability: capabilityId, providerVerified: false },
          }, { expectRevision: exception.revision, event: `Reconnection attempt recorded for ${capabilityId}` });
          if (!saved) return;
          context.toast("Recorded, not connected", `${capability?.label} is still ${capability ? CAPABILITY_LABELS[capability.state].toLowerCase() : "unavailable"}. The exception is awaiting a person.`, "blocked");
          close();
        }}
      >
        Record the reconnection attempt
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function ResolutionRecord({ context, close }: { context: ScreenContext; close: () => void }) {
  const exception = useRecord(context.selectedId);
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);
  if (!exception) return <Empty title="Choose an exception first" />;
  const providerCause = exception.fields.cause === "provider";

  return (
    <Stack gap={4}>
      <Field label="What was done" required>
        <TextArea aria-label="What was done" rows={4} value={note} onChange={(event) => setNote(event.target.value)} required />
      </Field>
      {providerCause && (
        <>
          <Checkbox
            label="A provider has confirmed the fix externally"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
          />
          {!verified && (
            <Notice tone="warning" title="It will be recorded as resolved locally">
              The cause was a provider boundary. Without an external confirmation the exception is closed as resolved locally with the provider unverified, so no screen claims a clean fix.
            </Notice>
          )}
          {verified && (
            <Notice tone="danger" title="Nothing here can verify a provider">
              No connection exists in this browser, so this box cannot be substantiated. It is left available because a person may know the provider confirmed out of band; the record keeps who ticked it.
            </Notice>
          )}
        </>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        disabled={note.trim() === ""}
        onClick={async () => {
          const saved = await context.mutate.patch(exception.id, {
            status: "resolved",
            summary: note.trim(),
            fields: {
              ...exception.fields,
              resolution: note.trim(),
              providerVerified: providerCause ? verified : true,
              resolvedBy: context.actor,
              resolvedAt: new Date(context.now).toISOString(),
            },
          }, { expectRevision: exception.revision, event: `Exception resolved${providerCause && !verified ? " locally, provider unverified" : ""}` });
          if (!saved) return;
          context.toast(
            providerCause && !verified ? "Resolved locally" : "Resolved",
            providerCause && !verified ? "Recorded as resolved locally with the provider unverified." : "The exception is closed with the resolution on the record.",
            providerCause && !verified ? "info" : "ok",
          );
          close();
        }}
      >
        Record the resolution
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function AssignException({ context, close }: { context: ScreenContext; close: () => void }) {
  const exception = useRecord(context.selectedId);
  const members = useCollection("members");
  const [owner, setOwner] = useState(context.actor);
  if (!exception) return <Empty title="Choose an exception first" />;
  return (
    <Stack gap={4}>
      <Field label="Assign to">
        <Select aria-label="Assign to" value={owner} onChange={(event) => setOwner(event.target.value)}>
          {[context.actor, ...members.map((member) => member.title)].filter((name, index, all) => all.indexOf(name) === index).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
      </Field>
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        onClick={async () => {
          const saved = await context.mutate.patch(exception.id, {
            status: "investigating",
            ownerName: owner,
          }, { expectRevision: exception.revision, event: `Exception assigned to ${owner}` });
          if (!saved) return;
          context.toast("Assigned", `${owner} owns ${exception.title}. It is now under investigation.`);
          close();
        }}
      >
        Assign and start investigating
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function RetryFromException({ context, close }: { context: ScreenContext; close: () => void }) {
  const exception = useRecord(context.selectedId);
  const run = useRecord(String(exception?.fields.runId ?? ""));
  const workflow = useRecord(String(exception?.fields.workflowId ?? ""));
  const stored = readRun(run);
  const pool = useGraphRecords(stored?.graph ?? { nodes: [], edges: [] });
  const [busy, setBusy] = useState(false);
  if (!exception) return <Empty title="Choose an exception first" />;
  if (!workflow || !stored) {
    return <Notice tone="warning" title="This exception cannot be retried from here">The linked run has no stored graph, so there is nothing to re-execute. Open the automation and run it from the builder.</Notice>;
  }
  const providerCause = exception.fields.cause === "provider";
  return (
    <Stack gap={4}>
      {providerCause && (
        <Notice tone="warning" title="A retry will stop in the same place">
          The cause was a provider boundary, which has not changed. The retry is still recorded, and the new run will show the same block, which is the honest result.
        </Notice>
      )}
      <ModalInFlight when={busy} />
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        busy={busy}
        disabled={!context.can("run_automation")}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const outcome = await executeRun({ context, workflow, graph: stored.graph, pool, mode: "live", trigger: `Retry from exception ${exception.id}` });
            const saved = await context.mutate.patch(exception.id, {
              status: outcome.run.status === "completed" ? "resolved" : "investigating",
              fields: {
                ...exception.fields,
                retryRunId: outcome.runId,
                providerVerified: false,
                resolution: outcome.run.status === "completed" ? `A retry completed as run ${outcome.runId}.` : `A retry finished as ${outcome.run.status}.`,
              },
            }, { expectRevision: exception.revision, event: `Retry recorded as ${outcome.runId}` });
            context.toast(
              "Retried",
              saved
                ? `The new run finished as ${outcome.run.status.replace(/_/g, " ")}.`
                : `The new run finished as ${outcome.run.status.replace(/_/g, " ")}, but the exception changed elsewhere and was not updated.`,
              saved && outcome.run.status === "completed" ? "ok" : "info",
            );
            context.navigate(`/o/${context.org.slug}/auto/runs/${outcome.runId}`);
            close();
          } catch (error) {
 if (!(error instanceof LiveRunRefused)) throw error;
 } finally {
            setBusy(false);
          }
        }}
      >
        Retry the automation now
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}
