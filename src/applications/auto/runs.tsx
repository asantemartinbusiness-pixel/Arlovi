import { useMemo, useState } from "react";
import { AlertTriangle, History, Link2, RotateCcw } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, ModalActions, ModalInFlight, Notice,
  OverlayActions, OverlaySection, OverlaySummary, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea,
} from "@/design-system";
import type { Column, RecordHeaderProps } from "@/design-system";
import { knownRecord } from "@/platform/repo";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { assessRetry, RUN_STATUS_LABELS, type RunStatus, type StoredRun } from "./engine";
import { JsonBlock, ReplayPlan, RunBindings, RunHeadline, RunTimeline, StepTrace, readRun } from "./panels";
import { executeRun, useGraphRecords, LiveRunRefused, useLiveRunBlocker } from "./runner";

type RunRow = { run: Rec; stored: StoredRun | undefined };
export type RunTab = "All" | "Running" | "Failed" | "Completed" | "Waiting";

/** Older seeded runs say "succeeded"; it means the same as the interpreter's "completed". */
const isCompleted = (status: string) => status === "completed" || status === "succeeded";
const statusLabel = (status: string) => (isCompleted(status) ? "Completed" : RUN_STATUS_LABELS[status as RunStatus] ?? status.replace(/_/g, " "));

function outcomeSummary(run: Rec, stored?: StoredRun): string {
  if (!stored) return run.summary || "No step trace was stored for this run.";
  const ok = stored.result.steps.filter((step) => step.status === "ok").length;
  const blocked = stored.result.steps.filter((step) => step.status === "blocked").length;
  const failed = stored.result.steps.filter((step) => step.status === "failed").length;
  const parts = [`${ok} ok`];
  if (blocked) parts.push(`${blocked} blocked at a provider`);
  if (failed) parts.push(`${failed} failed`);
  return parts.join(", ");
}

export function RunHistory({ context, tab }: { context: ScreenContext; tab: RunTab }) {
  const runs = useCollection("workflowRuns");
  const workflows = useCollection("workflows");

  const rows = useMemo(() => runs
    .map((run) => ({ run, stored: readRun(run) }))
    .sort((left, right) => String(right.run.at ?? right.run.createdAt).localeCompare(String(left.run.at ?? left.run.createdAt))), [runs]);

  const filtered = useMemo(() => {
    if (tab === "Running") return rows.filter((row) => row.run.status === "running");
    if (tab === "Failed") return rows.filter((row) => row.run.status === "failed");
    if (tab === "Completed") return rows.filter((row) => isCompleted(row.run.status));
    if (tab === "Waiting") return rows.filter((row) => ["waiting_approval", "blocked"].includes(row.run.status));
    return rows;
  }, [rows, tab]);

  const hasTrigger = rows.some((row) => Boolean(row.stored?.trigger ?? row.run.fields.trigger));
  const hasAttempts = rows.some((row) => row.run.fields.attempts !== undefined || row.stored);

  if (rows.length === 0) {
    return (
      <Empty title="No run has been recorded" icon={<History size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows`)}>Open the library</Button>}>
        Start a run from an automation's Test tab. Every run keeps its step trace, its attempts and a receipt per step.
      </Empty>
    );
  }

  if (tab === "Running" && filtered.length === 0) {
    return (
      <Notice tone="info" title="No run is in flight">
        The interpreter runs to completion in one pass, or stops at an approval gate or a provider boundary. A run is therefore never left in a running state in this browser;
        the Waiting tab holds the runs that stopped at a gate.
      </Notice>
    );
  }

  return (
    <Stack gap={5}>
      {tab === "All" && (
        <StatRow>
          <Stat prov="agent" label="Runs recorded" value={String(rows.length)} meta={`${workflows.length} automations`} />
          <Stat prov="agent" label="Completed" value={String(rows.filter((row) => isCompleted(row.run.status)).length)} meta="Every step on the path finished" />
          <Stat prov="human" label="Waiting on a person" value={String(rows.filter((row) => row.run.status === "waiting_approval").length)} meta="Paused at an approval gate" />
          <Stat prov="unknown" label="Stopped at a provider" value={String(rows.filter((row) => row.run.status === "blocked" || Number(row.run.fields.blocked ?? 0) > 0).length)} meta="Recorded as not run" />
        </StatRow>
      )}

      <Card eyebrow="RUNS" prov="agent" title={`${tab} runs`} subtitle={`${filtered.length} of ${rows.length}`} flush>
        <DataGrid
          rows={filtered}
          rowId={(row) => row.run.id}
          label={`${tab} runs`}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${id}`)}
          rowTone={(row) => (row.run.status === "failed" ? "danger" : row.run.status === "waiting_approval" || row.run.status === "blocked" ? "warning" : undefined)}
          empty={<Empty title={`No ${tab.toLowerCase()} run`}>Runs appear here once one reaches this state.</Empty>}
          columns={[
            {
              key: "id", header: "Run", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.run.title}</strong>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{row.stored?.workflowTitle ?? workflows.find((item) => item.id === row.run.parentId)?.title ?? "Unknown automation"}</p>
                </div>
              ),
              filterValue: (row) => `${row.run.id} ${row.run.title} ${row.stored?.workflowTitle ?? ""}`,
              sortValue: (row) => row.run.title,
            },
            ...(hasTrigger ? [{ key: "trigger", header: "Trigger", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{row.stored?.trigger ?? String(row.run.fields.trigger ?? "—")}</span>, hideBelow: 1100 } satisfies Column<RunRow>] : []),
            { key: "status", header: "Status", cell: (row) => <Pill tone={isCompleted(row.run.status) ? "success" : row.run.status === "failed" ? "danger" : "warning"} dot>{statusLabel(row.run.status)}</Pill>, sortValue: (row) => row.run.status },
            ...(hasAttempts ? [{ key: "attempts", header: "Attempts", align: "end" as const, cell: (row) => String(row.run.fields.attempts ?? row.stored?.result.steps.reduce((total, step) => total + step.attempts.length, 0) ?? "—"), hideBelow: 900 } satisfies Column<RunRow>] : []),
            { key: "timing", header: "Started", align: "end", cell: (row) => <span>{context.dateTime(row.run.at)}<br /><span className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.run.fields.durationMs ?? 0} ms</span></span>, sortValue: (row) => row.run.at ?? "" },
            { key: "worker", header: "Worker", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{String(row.run.fields.worker ?? "local-interpreter")}</span>, hideBelow: 1300 },
            { key: "outcome", header: "Outcomes", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{outcomeSummary(row.run, row.stored)}</span> },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ------------------------------ 006 overlays ------------------------------ */

function runTone(status: string) {
  return isCompleted(status) ? "success" as const : status === "failed" ? "danger" as const : "warning" as const;
}

/** Identity block for the run inspector drawer (OverlayDef.summary). */
export function RunSummary({ context }: { context: ScreenContext }) {
  const run = useRecord(context.selectedId);
  if (!run) return null;
  const stored = readRun(run);
  return (
    <OverlaySummary
      eyebrow={String(run.fields.mode ?? "live") === "dry" ? "Dry run" : "Live run"}
      title={stored?.workflowTitle ?? run.title}
      status={<Pill tone={runTone(run.status)} dot>{RUN_STATUS_LABELS[run.status as RunStatus] ?? run.status}</Pill>}
      meta={[<code key="id" className="ds-num">{run.id}</code>, context.dateTime(run.at)]}
    />
  );
}

export function RunInspector({ context }: { context: ScreenContext }) {
  const run = useRecord(context.selectedId);
  const stored = readRun(run);
  if (!run) return <Empty title="Choose a run">Select a row to read its trace.</Empty>;
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Duration", value: stored ? `${run.fields.durationMs ?? 0} ms` : "Not recorded", mono: true },
        { label: "Worker", value: String(run.fields.worker ?? "local-interpreter") },
        { label: "Record changes applied", value: stored ? String(run.fields.writes ?? 0) : "Not recorded", mono: true },
        { label: "Trigger", value: stored?.trigger ?? String(run.fields.trigger ?? "Not recorded") },
      ]} />
      {stored ? (
        <>
          <RunHeadline run={stored.result} context={context} />
          <OverlaySection title="Trace" hint={`${stored.result.steps.length} steps`}>
            <RunTimeline run={stored.result} context={context} redact={!context.can("manage_connectors")} />
          </OverlaySection>
        </>
      ) : (
        <Notice tone="warning" title="No step trace stored">
          Nothing was recorded about its steps, so it cannot be replayed. Its summary: {run.summary}
        </Notice>
      )}
      <DrawerActions>
        <OverlayActions primary={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs/${run.id}`)}>Open the full trace</Button>} />
      </DrawerActions>
    </Stack>
  );
}

export function RetrySafetyCheck({ context, close }: { context: ScreenContext; close: () => void }) {
  const run = useRecord(context.selectedId);
  const workflow = useRecord(run?.parentId ?? String(run?.fields.workflowId ?? ""));
  const stored = readRun(run);
  const pool = useGraphRecords(stored?.graph ?? { nodes: [], edges: [] });
  const liveBlocker = useLiveRunBlocker(context, workflow);
  const [reconciled, setReconciled] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!run) return <Empty title="Choose a run first" />;
  if (!stored) {
    return (
      <Notice tone="warning" title="This run cannot be retried safely">
        No step trace was stored, so what it changed is unknown. Reconcile the records by hand before starting a new run.
      </Notice>
    );
  }

  const assessment = assessRetry(stored.result);
  const unknown = assessment.filter((item) => item.safety === "unknown");
  const canRetry = Boolean(workflow) && !liveBlocker && (unknown.length === 0 || reconciled) && context.can("run_automation");

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Notice tone={unknown.length ? "warning" : "success"} title={unknown.length ? `${unknown.length} step${unknown.length === 1 ? "" : "s"} need reconciling first` : "Every step in this run is safe to replay"}>
        A retry is offered only where the first outcome is known. A step that already wrote a record would write it again.
      </Notice>
      {liveBlocker && <Notice tone="danger" title="A retry cannot start">{liveBlocker}</Notice>}
      <ReplayPlan assessment={assessment} />
      {unknown.length > 0 && (
        <Checkbox
          label={`I have checked the ${unknown.length} record change${unknown.length === 1 ? "" : "s"} above and a repeat is acceptable`}
          checked={reconciled}
          onChange={(event) => setReconciled(event.target.checked)}
        />
      )}
      <ModalActions>
        <OverlayActions
          primary={(
            <Button
              variant="primary"
              icon={<RotateCcw size={15} />}
              busy={busy}
              disabled={!canRetry}
              title={liveBlocker ?? (!workflow ? "The automation this run belongs to is not in this company" : !context.can("run_automation") ? "This role view does not run automations" : undefined)}
              onClick={async () => {
                if (!workflow || busy) return;
                setBusy(true);
                try {
                  const outcome = await executeRun({
                    context, workflow, graph: stored.graph, pool, mode: "live",
                    trigger: `Retry of ${run.id} after a safety check`,
                  });
                  await context.mutate.log(`Run ${run.id} retried as ${outcome.runId} after a retry safety check.`, { entityId: outcome.runId, type: "automation" });
                  context.toast("Retried", `${outcome.run.status.replace(/_/g, " ")} after ${outcome.run.steps.length} steps. The new run is recorded separately.`);
                  context.navigate(`/o/${context.org.slug}/auto/runs/${outcome.runId}`);
                  close();
                } catch (error) {
 if (!(error instanceof LiveRunRefused)) throw error;
 } finally {
                  setBusy(false);
                }
              }}
            >
              Retry the safe path
            </Button>
          )}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function IncidentLink({ context, close }: { context: ScreenContext; close: () => void }) {
  const run = useRecord(context.selectedId);
  const incidents = useCollection("incidents");
  const stored = readRun(run);
  const [note, setNote] = useState("");
  if (!run) return <Empty title="Choose a run first" />;
  const existing = incidents.filter((incident) => incident.fields.runId === run.id);
  const failing = stored?.result.steps.find((step) => step.status === "failed" || step.status === "blocked");

  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Run", value: run.id, mono: true },
        { label: "Status", value: run.status },
        { label: "First step that stopped", value: failing ? `${failing.label}, ${failing.status}` : "None recorded" },
        { label: "Exceptions already linked", value: String(existing.length), mono: true },
      ]} />
      {existing.length > 0 && (
        <Stack gap={2}>
          {existing.map((incident) => (
            <Row key={incident.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{incident.title}</span>
              <Pill tone="warning">{incident.status}</Pill>
            </Row>
          ))}
        </Stack>
      )}
      <Field label="What should be investigated">
        <TextArea aria-label="What should be investigated" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={failing ? failing.message : "Describe what needs attention"} />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={(
            <Button
              variant="primary"
              icon={<Link2 size={15} />}
              onClick={async () => {
                const created = await context.mutate.create({
                  collection: "incidents",
                  title: `Automation exception · ${stored?.workflowTitle ?? run.title}`,
                  status: "new",
                  summary: note.trim() || failing?.message || run.summary,
                  parentId: run.id,
                  fields: {
                    kind: "automation",
                    runId: run.id,
                    workflowId: String(run.fields.workflowId ?? run.parentId ?? ""),
                    cause: failing?.status === "blocked" ? "provider" : failing ? "step_failure" : "manual",
                    nodeId: failing?.nodeId ?? "",
                    severity: failing?.status === "failed" ? "high" : "medium",
                  },
                }, `Exception raised from run ${run.id}`);
                context.toast("Exception raised", `${created.title} is on the exceptions board as new.`);
                context.navigate(`/o/${context.org.slug}/auto/exceptions`);
                close();
              }}
            >
              Raise an exception
            </Button>
          )}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-AUTO-007 — Run detail
 * ====================================================================== */

export function useRunDetail(context: ScreenContext) {
  const run = useRecord(context.params.id);
  const stored = readRun(run);
  const workflow = useRecord(run?.parentId ?? String(run?.fields.workflowId ?? ""));
  return { run, stored, workflow };
}

/**
 * The run is the page head (ScreenDef.record): the automation it belongs to,
 * its state, mode, trigger and start. Facts a run never stored are left out.
 */
export function runRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const run = scopedRun(knownRecord(context.params.id), context.org.id);
  if (!run) return null;
  const stored = readRun(run);
  const mode = String(run.fields.mode ?? "live");
  const trigger = stored?.trigger ?? (run.fields.trigger ? String(run.fields.trigger) : undefined);
  return {
    eyebrow: "Workflow run",
    title: stored?.workflowTitle ?? run.title,
    status: <Pill tone={runTone(run.status)} dot>{RUN_STATUS_LABELS[run.status as RunStatus] ?? run.status}</Pill>,
    meta: [
      <code key="id" className="ds-num">{run.id}</code>,
      mode === "dry" ? "Dry run, wrote nothing" : "Live run",
      trigger,
      run.at ? `Started ${context.dateTime(run.at)}` : undefined,
    ],
  };
}

function scopedRun(record: Rec | undefined, orgId: string): Rec | undefined {
  return record && record.organizationId === orgId && record.collection === "workflowRuns" ? record : undefined;
}

/** Counts under the head. A run with no stored trace shows nothing it cannot back up. */
export function RunDetailHeader({ context }: { context: ScreenContext }) {
  const { run, stored, workflow } = useRunDetail(context);
  if (!run) return null;
  const traced = Boolean(stored);
  const steps = stored?.result.steps ?? [];
  const attempts = steps.reduce((total, step) => total + step.attempts.length, 0);
  const dry = String(run.fields.mode) === "dry";
  return (
    <div className="auto-run-head">
      {traced && <StatRow>
        <Stat prov="agent" label="Steps" value={traced ? String(steps.length) : "Unavailable"} unavailable={!traced} meta={traced ? `budget ${stored!.result.budget.used} of ${stored!.result.budget.max}` : "No trace was stored"} />
        <Stat prov="agent" label="Duration" value={traced ? `${run.fields.durationMs ?? 0} ms` : "Unavailable"} unavailable={!traced} meta={context.dateTime(run.at)} />
        <Stat prov="agent" label="Attempts" value={traced ? String(attempts) : "Unavailable"} unavailable={!traced} meta="Including retries with backoff" />
        <Stat prov="posted" label="Record changes" value={traced ? String(run.fields.writes ?? 0) : "Unavailable"} unavailable={!traced} meta={dry ? "A dry run writes nothing" : traced ? "Applied through the normal mutation path" : "Not recorded"} />
      </StatRow>}
      {workflow && (
        <Row gap={2}>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${workflow.id}`)}>Open the automation</Button>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs`)}>All runs</Button>
        </Row>
      )}
    </div>
  );
}

export function RunDetail({ context }: { context: ScreenContext }) {
  const { run, stored, workflow } = useRunDetail(context);
  const events = useEvents(context.params.id);
  const pool = useGraphRecords(stored?.graph ?? { nodes: [], edges: [] });
  const [busy, setBusy] = useState(false);
  const liveBlocker = useLiveRunBlocker(context, workflow);
  const resumeBlocked = String(run?.fields.mode) === "dry" ? undefined : liveBlocker;
  const redact = !context.can("manage_connectors");

  if (!run) {
    return (
      <Empty title="That run is not in this company" icon={<AlertTriangle size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs`)}>Back to the run history</Button>}>
        The address points at {context.params.id ?? "no record"}.
      </Empty>
    );
  }

  if (!stored) {
    return (
      <Notice tone="warning" title="No step trace was stored for this run">
        Only a status and a summary were recorded: {run.summary} With no steps on record there is nothing to inspect, and a replay would not know what it repeats.
      </Notice>
    );
  }

  const result = stored.result;

  if (context.tab === "Inputs") {
    return (
      <Stack gap={4}>
        <Card eyebrow="BINDINGS" prov="agent" title="Variables bound during the run" subtitle="What each step could read">
          <RunBindings run={result} />
        </Card>
        <Card eyebrow="INPUTS" prov="agent" title="Input per step" subtitle={`${result.steps.length} steps`}>
          <Stack gap={3}>
            {result.steps.map((step) => (
              <div key={`${step.nodeId}-${step.index}`}>
                <Row gap={2}><strong className="ds-grow">{step.index + 1}. {step.label}</strong><Pill tone="neutral">{step.nodeType}</Pill></Row>
                {redact && step.sensitive
                  ? <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Redacted from the {context.role} view.</p>
                  : <JsonBlock label="Input" value={step.input} />}
              </div>
            ))}
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (context.tab === "Outputs") {
    return (
      <Card eyebrow="OUTPUTS" prov="agent" title="Output per step" subtitle="What each step produced, and what it asked to write">
        <Stack gap={3}>
          {result.steps.map((step) => (
            <div key={`${step.nodeId}-${step.index}`}>
              <Row gap={2}><strong className="ds-grow">{step.index + 1}. {step.label}</strong><Pill tone={step.status === "ok" ? "success" : step.status === "failed" ? "danger" : "warning"} dot>{step.status}</Pill></Row>
              {redact && step.sensitive
                ? <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Redacted from the {context.role} view.</p>
                : <JsonBlock label="Output" value={step.output} />}
              {step.writes.length > 0 && <JsonBlock label="Record changes requested" value={step.writes} />}
            </div>
          ))}
        </Stack>
      </Card>
    );
  }

  if (context.tab === "Logs") {
    return (
      <Grid>
        <Card span={7} eyebrow="AUDIT" prov="posted" title="Activity written by this run" subtitle={`${events.length} entr${events.length === 1 ? "y" : "ies"} in the audit log`}>
          {events.length === 0 ? (
            <Empty title="No audit entry for this run">A live run writes an entry when it changes a record or stops at a provider.</Empty>
          ) : (
            <Stack gap={2}>
              {events.map((event) => (
                <Row key={event.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <span className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)", minWidth: 110 }}>{context.dateTime(event.at)}</span>
                  <span className="ds-grow">{event.message}</span>
                  <Pill tone="neutral">{event.type}</Pill>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={5} eyebrow="INTERPRETER" prov="agent" title="Interpreter messages" subtitle="One line per step, in order">
          <Stack gap={2}>
            {result.steps.map((step) => (
              <div key={`${step.nodeId}-${step.index}`} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <Row gap={2}><Pill tone={step.status === "ok" ? "success" : step.status === "failed" ? "danger" : "warning"}>{step.status}</Pill><strong className="ds-grow ds-truncate">{step.label}</strong></Row>
                <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{step.message}</p>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Decisions") {
    const gates = result.steps.filter((step) => step.nodeType === "approval");
    const waiting = result.status === "waiting_approval" ? result.waitingOn : undefined;
    return (
      <Stack gap={4}>
        {gates.length === 0 && !waiting && (
          <Empty title="This run has no approval gate">A gate stops the run until a person records a decision; the steps after it have no result until then.</Empty>
        )}
        {gates.map((step) => (
          <Card key={`${step.nodeId}-${step.index}`} title={step.label} subtitle={`Recorded ${context.dateTime(step.endedAt)}`}>
            <Properties rows={[
              { label: "Outcome", value: <Pill tone={step.status === "ok" ? "success" : "warning"} dot>{step.status}</Pill> },
              { label: "Decision", value: String((step.output as { decision?: string }).decision ?? "none recorded") },
              { label: "Branch taken", value: step.branch ?? "none" },
              { label: "Approver asked", value: String((step.input as { approvers?: string }).approvers ?? "—") },
              { label: "Recorded by", value: String((step.input as { decidedBy?: string }).decidedBy ?? "—") },
            ]} />
          </Card>
        ))}
        {waiting && (
          <Card title={`Waiting on ${waiting.approvers}`} subtitle={waiting.label}>
            <Stack gap={3}>
              <Notice tone="warning" title="Nothing after this gate has run">
                The interpreter returned at {waiting.label} with a cursor. Recording a decision continues the same run from that node and keeps the earlier steps.
              </Notice>
              <Row gap={2}>
                <Button
                  variant="primary"
                  busy={busy}
                  disabled={!workflow || Boolean(resumeBlocked) || !context.can("run_automation")}
                  title={resumeBlocked ?? (!context.can("run_automation") ? "This role view does not run automations" : undefined)}
                  onClick={async () => {
                    if (!workflow) return;
                    setBusy(true);
                    try {
                      const outcome = await executeRun({
                        context, workflow, graph: stored.graph, pool,
                        mode: String(run.fields.mode) === "dry" ? "dry" : "live",
                        trigger: stored.trigger,
                        decisions: { [waiting.nodeId]: "approved" },
                        resumeRun: run,
                      });
                      context.toast("Approved", `The run continued and finished as ${outcome.run.status.replace(/_/g, " ")} after ${outcome.run.steps.length} steps.`);
                    } catch (error) {
 if (!(error instanceof LiveRunRefused)) throw error;
 } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Approve and continue the run
                </Button>
                <Button
                  variant="secondary"
                  busy={busy}
                  disabled={!workflow || Boolean(resumeBlocked)}
                  title={resumeBlocked}
                  onClick={async () => {
                    if (!workflow) return;
                    setBusy(true);
                    try {
                      const outcome = await executeRun({
                        context, workflow, graph: stored.graph, pool,
                        mode: String(run.fields.mode) === "dry" ? "dry" : "live",
                        trigger: stored.trigger,
                        decisions: { [waiting.nodeId]: "rejected" },
                        resumeRun: run,
                      });
                      context.toast("Rejected", `The run took the rejected branch and finished as ${outcome.run.status.replace(/_/g, " ")}.`);
                    } catch (error) {
 if (!(error instanceof LiveRunRefused)) throw error;
 } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Reject
                </Button>
              </Row>
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  /* Timeline */
  return (
    <Stack gap={4}>
      <RunHeadline run={result} context={context} />
      {redact && result.steps.some((step) => step.sensitive) && (
        <Notice tone="info" title="Some payloads are hidden in this role view">
          {result.steps.filter((step) => step.sensitive).length} step{result.steps.filter((step) => step.sensitive).length === 1 ? " is" : "s are"} marked sensitive. Role views shape what this screen offers; they are not an account security boundary.
        </Notice>
      )}
      <Card eyebrow="TIMELINE" prov="agent" title="Event chain" subtitle={`${result.steps.length} steps, ${result.branchesTaken.length} branch decision${result.branchesTaken.length === 1 ? "" : "s"}`}>
        <RunTimeline
          run={result}
          context={context}
          redact={redact}
          onInspect={(step) => context.openOverlay("Node trace", { index: step.index })}
        />
      </Card>
    </Stack>
  );
}

export function NodeTrace({ context }: { context: ScreenContext }) {
  const { stored } = useRunDetail(context);
  const payload = context.overlayPayload as { index?: number } | undefined;
  const [index, setIndex] = useState(payload?.index ?? 0);
  if (!stored) return <Empty title="No step trace stored for this run" />;
  const step = stored.result.steps[index] ?? stored.result.steps[0];
  if (!step) return <Empty title="This run executed no step" />;
  return (
    <Stack gap={4}>
      <Field label="Step">
        <Select aria-label="Step" value={String(index)} onChange={(event) => setIndex(Number(event.target.value))}>
          {stored.result.steps.map((item, position) => <option key={`${item.nodeId}-${position}`} value={position}>{position + 1}. {item.label} — {item.status}</option>)}
        </Select>
      </Field>
      <StepTrace step={step} context={context} redact={!context.can("manage_connectors")} />
    </Stack>
  );
}

export function RedactionPanel({ context }: { context: ScreenContext }) {
  const { stored } = useRunDetail(context);
  const sensitive = stored?.result.steps.filter((step) => step.sensitive) ?? [];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Role view", value: context.role },
        { label: "May read sensitive payloads", value: <Pill tone={context.can("manage_connectors") ? "success" : "warning"}>{context.can("manage_connectors") ? "yes" : "no"}</Pill> },
        { label: "Steps marked sensitive", value: String(sensitive.length) },
      ]} />
      {sensitive.length === 0 ? (
        <Notice tone="info" title="Nothing in this run is marked sensitive">
          A step is marked sensitive on the node, usually because it would carry a customer's contact details to a provider.
        </Notice>
      ) : (
        <Stack gap={2}>
          {sensitive.map((step) => (
            <Row key={`${step.nodeId}-${step.index}`} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{step.label}</span>
              <Pill tone={context.can("manage_connectors") ? "success" : "warning"}>{context.can("manage_connectors") ? "shown" : "hidden"}</Pill>
            </Row>
          ))}
        </Stack>
      )}
      <Notice tone="warning" title="This is interface shaping, not enforcement">
        The whole workspace is in this browser, so a role view cannot withhold data from someone with access to the device. A future service would enforce this on the server.
      </Notice>
    </Stack>
  );
}

export function ReplaySummary({ context }: { context: ScreenContext }) {
  const { run, stored } = useRunDetail(context);
  if (!run) return null;
  return (
    <OverlaySummary
      eyebrow="Replay"
      title={stored?.workflowTitle ?? run.title}
      status={<Pill tone={runTone(run.status)} dot>{RUN_STATUS_LABELS[run.status as RunStatus] ?? run.status}</Pill>}
      meta={[<code key="id" className="ds-num">{run.id}</code>, stored ? `${stored.result.steps.length} steps recorded` : "No trace stored"]}
    />
  );
}

export function ReplayConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const { run, stored, workflow } = useRunDetail(context);
  const pool = useGraphRecords(stored?.graph ?? { nodes: [], edges: [] });
  const liveBlocker = useLiveRunBlocker(context, workflow);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  if (!run || !stored) {
    return (
      <Notice tone="warning" title="This run cannot be replayed">
        No step trace was stored, so there is no record of what a replay would repeat.
      </Notice>
    );
  }
  const assessment = assessRetry(stored.result);
  const unknown = assessment.filter((item) => item.safety === "unknown");

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Notice tone={unknown.length ? "warning" : "info"} title="A replay starts a new run and keeps this one">
        It evaluates the graph again from the trigger against today&apos;s records. Nothing from this run is reused.
      </Notice>
      {liveBlocker && <Notice tone="danger" title="A replay cannot start">{liveBlocker}</Notice>}
      <ReplayPlan assessment={assessment} />
      {unknown.length > 0 && (
        <Checkbox label="I accept that the record changes above would be made again" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
      )}
      <ModalActions>
        <OverlayActions
          primary={(
            <Button
              variant="primary"
              busy={busy}
              icon={<RotateCcw size={15} />}
              disabled={!workflow || Boolean(liveBlocker) || (unknown.length > 0 && !accepted) || !context.can("run_automation")}
              title={liveBlocker ?? !workflow ? "The automation this run belongs to is not in this company" : !context.can("run_automation") ? "This role view does not run automations" : undefined}
              onClick={async () => {
                if (!workflow || busy) return;
                setBusy(true);
                try {
                  const outcome = await executeRun({ context, workflow, graph: stored.graph, pool, mode: "live", trigger: `Replay of ${run.id}` });
                  context.toast("Replayed", `A new run was recorded as ${outcome.run.status.replace(/_/g, " ")}.`);
                  context.navigate(`/o/${context.org.slug}/auto/runs/${outcome.runId}`);
                  close();
                } catch (error) {
 if (!(error instanceof LiveRunRefused)) throw error;
 } finally {
                  setBusy(false);
                }
              }}
            >
              Replay the safe path
            </Button>
          )}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function exportRun(context: ScreenContext, run: Rec | undefined): void {
  if (!run) {
    context.toast("Nothing to export", "Open a run first.", "blocked");
    return;
  }
  const stored = readRun(run);
  const payload = {
    run: { id: run.id, status: run.status, startedAt: run.at, summary: run.summary, fields: run.fields },
    trace: stored?.result ?? null,
    exportedAt: new Date(context.now).toISOString(),
    note: "Exported from the local workspace. Receipts are local checksums, not provider confirmations.",
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${run.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
  context.toast("Exported", `${run.id}.json downloaded from this browser.`);
}

