import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, ListChecks, Receipt, XCircle } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, FactGrid, Field, Grid, Meter, ModalActions, ModalInFlight, Notice, OverlayActions, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import {
  CONDITION_OPS, evaluateAssertions, type ConditionOp, type RunResult, type WfAssertion, type WorkflowGraph,
} from "./engine";
import { setDraftGraph, updateDraft, useBuilderDraft } from "./store";
import { executeDry, executeRun, useGraphRecords } from "./runner";
import { JsonBlock, RunHeadline, RunTimeline, readRun } from "./panels";
import { clockIso, wallMs } from "@/platform/clock";

function coverage(graph: WorkflowGraph, run: RunResult): { used: Set<string>; total: number } {
  const used = new Set<string>();
  for (let index = 0; index < run.steps.length - 1; index += 1) {
    const step = run.steps[index];
    const next = run.steps[index + 1];
    const edge = graph.edges.find((item) => item.from === step.nodeId && (item.port ?? "out") === (step.branch ?? "out") && item.to === next.nodeId);
    if (edge) used.add(edge.id ?? `${edge.from}-${edge.to}-${edge.port ?? "out"}`);
  }
  return { used, total: graph.edges.length };
}

function useTestContext(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  return { record, draft, pool };
}

export function WorkflowTesting({ context }: { context: ScreenContext }) {
  const { record, draft, pool } = useTestContext(context);
  const runs = useCollection("workflowRuns");
  const [busy, setBusy] = useState(false);

  const mine = useMemo(
    () => runs
      .filter((run) => run.parentId === record?.id || run.fields.workflowId === record?.id)
      .sort((left, right) => String(right.at ?? right.createdAt).localeCompare(String(left.at ?? left.createdAt))),
    [runs, record?.id],
  );

  if (!record) {
    return (
      <Empty title="That automation is not in this company" icon={<FlaskConical size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows`)}>Back to the library</Button>}>
        Testing belongs to one automation.
      </Empty>
    );
  }
  if (!draft) return <Empty title="Opening the graph…" />;

  const graph = draft.graph;
  const dryRun = draft.dryRun;
  const assertions = dryRun ? evaluateAssertions(graph, dryRun, context.now) : [];
  const testRuns = mine.filter((run) => run.fields.mode === "dry");

  async function runDry(decisions?: Record<string, "approved" | "rejected">) {
    setBusy(true);
    try {
      const result = executeDry({ context, graph, pool, fixture: draft!.fixture, decisions });
      updateDraft(record!.id, { dryRun: result, dryRunAt: new Date(context.now).toISOString() });
      await executeRun({ context, workflow: record!, graph, pool, mode: "dry", trigger: "Dry run from workflow testing", fixture: draft!.fixture, decisions });
      context.toast("Dry run recorded", `${result.steps.length} steps, ${result.status.replace(/_/g, " ")}. No record was written.`, result.status === "failed" ? "failed" : "ok");
    } finally {
      setBusy(false);
    }
  }

  if (context.tab === "Test runs") {
    return (
      <Card eyebrow="DRY RUNS" prov="agent" title="Dry runs recorded" subtitle={`${testRuns.length} of ${mine.length} runs were dry`} flush>
        {testRuns.length === 0 ? (
          <Empty title="No dry run recorded yet" icon={<FlaskConical size={20} />} action={<Button variant="primary" busy={busy} onClick={() => void runDry()}>Run a dry run</Button>}>
            A dry run evaluates the graph against the records this company holds and stores the trace without writing anything.
          </Empty>
        ) : (
          <DataGrid
            rows={testRuns}
            rowId={(row) => row.id}
            label="Dry runs"
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${id}`)}
            columns={[
              { key: "title", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title, sortValue: (row) => row.at ?? "" },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "completed" ? "success" : row.status === "failed" ? "danger" : "warning"} dot>{row.status}</Pill> },
              { key: "steps", header: "Steps", align: "end", cell: (row) => String(row.fields.steps ?? 0), sortValue: (row) => Number(row.fields.steps ?? 0) },
              { key: "assertions", header: "Assertions", align: "end", cell: (row) => `${row.fields.assertionsPassed ?? 0}/${row.fields.assertionsTotal ?? 0}` },
              { key: "when", header: "When", align: "end", cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at ?? "" },
            ]}
          />
        )}
      </Card>
    );
  }

  if (context.tab === "Assertions") {
    const stored = graph.assertions ?? [];
    return (
      <Grid>
        <Card
          span={7}
          eyebrow="ASSERTIONS"
          prov="human"
          title="Assertions on this workflow"
          subtitle={`${stored.length} recorded`}
          actions={<Button variant="secondary" onClick={() => context.openOverlay("assertion builder")}>Add an assertion</Button>}
        >
          {stored.length === 0 ? (
            <Empty title="No assertion yet" icon={<ListChecks size={20} />}>
              An assertion states what a step must end as, or what a variable must hold. It is evaluated against the last dry run, not asserted in prose.
            </Empty>
          ) : (
            <Stack gap={2}>
              {stored.map((assertion) => {
                const result = assertions.find((item) => item.assertion.id === assertion.id);
                return (
                  <Row key={assertion.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                    {result ? (
                      <Pill tone={result.pass ? "success" : "danger"} dot>{result.pass ? "pass" : "fail"}</Pill>
                    ) : <Pill tone="neutral">not evaluated</Pill>}
                    <div className="ds-grow">
                      <strong>
                        {assertion.subject === "status"
                          ? `${graph.nodes.find((node) => node.id === assertion.nodeId)?.label ?? assertion.nodeId} ends ${CONDITION_OPS.find((op) => op.id === assertion.op)?.label} ${assertion.value}`
                          : `${assertion.name} ${CONDITION_OPS.find((op) => op.id === assertion.op)?.label} ${assertion.value}`}
                      </strong>
                      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{result ? `${result.detail} (observed ${result.observed})` : "Run a dry run to evaluate it."}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraftGraph(record.id, { ...graph, assertions: stored.filter((item) => item.id !== assertion.id) }, "Assertion removed")}
                    >
                      Remove
                    </Button>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="LAST RUN" prov="agent" title="Result of the last dry run" subtitle={draft.dryRunAt ? context.dateTime(draft.dryRunAt) : "No dry run in this session"}>
          {dryRun ? (
            <Stack gap={3}>
              <Properties rows={[
                { label: "Outcome", value: dryRun.status.replace(/_/g, " ") },
                { label: "Assertions passed", value: `${assertions.filter((item) => item.pass).length} of ${assertions.length}` },
                { label: "Steps", value: String(dryRun.steps.length) },
              ]} />
              <Meter value={assertions.filter((item) => item.pass).length} max={Math.max(1, assertions.length)} label="Assertions passing" tone={assertions.every((item) => item.pass) ? "success" : "warning"} />
            </Stack>
          ) : (
            <Button variant="primary" busy={busy} onClick={() => void runDry()}>Run a dry run</Button>
          )}
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Failures") {
    const failures = mine.flatMap((run) => {
      const stored = readRun(run);
      if (!stored) return [];
      return stored.result.steps
        .filter((step) => step.status === "failed" || step.status === "blocked")
        .map((step) => ({ id: `${run.id}-${step.index}`, run, step }));
    });
    return (
      <Card eyebrow="FAILURES" prov="agent" title="Failed and blocked steps" subtitle={`${failures.length} across ${mine.length} run${mine.length === 1 ? "" : "s"}`} flush>
        {failures.length === 0 ? (
          <Empty title="No failed or blocked step" icon={<CheckCircle2 size={20} />}>Every recorded step on every path finished. Blocked provider steps would also appear here.</Empty>
        ) : (
          <DataGrid
            rows={failures}
            rowId={(row) => row.id}
            label="Failed and blocked steps"
            rowTone={(row) => (row.step.status === "failed" ? "danger" : "warning")}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${failures.find((item) => item.id === id)?.run.id ?? ""}`)}
            columns={[
              { key: "step", header: "Step", primary: true, cell: (row) => row.step.label, filterValue: (row) => `${row.step.label} ${row.step.message}` },
              { key: "status", header: "Outcome", cell: (row) => <Pill tone={row.step.status === "failed" ? "danger" : "warning"} dot>{row.step.status}</Pill> },
              { key: "why", header: "Reason the interpreter gave", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{row.step.message}</span> },
              { key: "attempts", header: "Attempts", align: "end", cell: (row) => String(row.step.attempts.length) },
              { key: "run", header: "Run", align: "end", cell: (row) => context.dateTime(row.run.at), sortValue: (row) => row.run.at ?? "" },
            ]}
          />
        )}
      </Card>
    );
  }

  /* Simulation */
  const cover = dryRun ? coverage(graph, dryRun) : null;
  const sideEffects = dryRun?.steps.flatMap((step) => step.writes) ?? [];
  const wouldWrite = dryRun?.steps.filter((step) => step.status === "ok" && ["record.create", "record.patch", "record.tag"].includes(String(graph.nodes.find((node) => node.id === step.nodeId)?.config?.kind))) ?? [];

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat prov="agent" label="Steps evaluated" value={dryRun ? String(dryRun.steps.length) : "—"} unavailable={!dryRun} meta={dryRun ? dryRun.status.replace(/_/g, " ") : "No dry run yet"} />
        <Stat prov="agent" label="Branch coverage" value={cover ? `${cover.used.size}/${cover.total}` : "—"} unavailable={!cover} meta="Connections this run actually traversed" />
        <Stat prov="posted" label="Records written" value={dryRun ? "0" : "—"} unavailable={!dryRun} meta="A dry run never writes" />
        <Stat prov="agent" label="Steps that would write" value={dryRun ? String(wouldWrite.length) : "—"} unavailable={!dryRun} meta="These would change a record in a live run" />
      </StatRow>

      <Card
        eyebrow="SIMULATION"
        prov="agent"
        machine
        title="Dry run"
        subtitle="The interpreter walks the saved graph against this company's records. Nothing is written and no provider is called."
        actions={
          <Row gap={2}>
            <Button variant="secondary" onClick={() => context.openOverlay("Fixture editor")}>Fixture</Button>
            <Button variant="primary" busy={busy} icon={<FlaskConical size={15} />} onClick={() => void runDry()}>Run dry-run</Button>
          </Row>
        }
      >
        {dryRun ? (
          <Stack gap={4}>
            <RunHeadline run={dryRun} context={context} />
            {dryRun.status === "waiting_approval" && dryRun.waitingOn && (
              <Notice
                tone="warning"
                title={`Paused at ${dryRun.waitingOn.label}`}
                actions={
                  <Row gap={2}>
                    <Button
                      size="sm"
                      variant="primary"
                      busy={busy}
                      onClick={() => void runDry({ [dryRun.waitingOn!.nodeId]: "approved" })}
                    >
                      Approve and continue
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={busy}
                      onClick={() => void runDry({ [dryRun.waitingOn!.nodeId]: "rejected" })}
                    >
                      Reject
                    </Button>
                  </Row>
                }
              >
                No step after the gate has a result. Recording a decision here re-runs the graph with that decision so you can see which branch it takes.
              </Notice>
            )}
            <RunTimeline run={dryRun} context={context} />
            {sideEffects.length === 0 && (
              <Notice tone="success" title="No side effect left this browser">
                {wouldWrite.length > 0
                  ? `${wouldWrite.length} step${wouldWrite.length === 1 ? "" : "s"} would write a record in a live run; in this dry run they produced the intended change only.`
                  : "No step in this path writes a record."}
              </Notice>
            )}
            {wouldWrite.length > 0 && (
              <JsonBlock label="Record changes a live run would make" value={wouldWrite.map((step) => ({ step: step.label, output: step.output }))} />
            )}
          </Stack>
        ) : (
          <Empty title="No simulation in this session" icon={<FlaskConical size={20} />} action={<Button variant="primary" busy={busy} onClick={() => void runDry()}>Run dry-run</Button>}>
            Every condition, expression and approval gate is evaluated for real; only the writes are withheld.
          </Empty>
        )}
      </Card>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function AssertionBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useTestContext(context);
  const [subject, setSubject] = useState<"status" | "variable">("status");
  const [nodeId, setNodeId] = useState("");
  const [name, setName] = useState("");
  const [op, setOp] = useState<ConditionOp>("eq");
  const [value, setValue] = useState("ok");
  if (!record || !draft) return <Empty title="Open an automation first" />;

  return (
    <Stack gap={4}>
      <Field label="What is asserted">
        <Select aria-label="What is asserted" value={subject} onChange={(event) => setSubject(event.target.value as typeof subject)}>
          <option value="status">The outcome of a step</option>
          <option value="variable">The value of a variable</option>
        </Select>
      </Field>
      {subject === "status" ? (
        <Field label="Step">
          <Select aria-label="Step" value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
            <option value="">Choose a step</option>
            {draft.graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Variable name" hint="A name bound by a variable node, for example atRisk.">
          <TextInput aria-label="Variable name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
      )}
      <Field label="Test">
        <Select aria-label="Test" value={op} onChange={(event) => setOp(event.target.value as ConditionOp)}>
          {CONDITION_OPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Expected value">
        <TextInput aria-label="Expected value" value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={<Button
        variant="primary"
        disabled={subject === "status" ? nodeId === "" : name.trim() === ""}
        onClick={() => {
          const assertion: WfAssertion = {
            id: `a${(draft.graph.assertions?.length ?? 0) + 1}-${wallMs().toString(36)}`,
            nodeId,
            subject,
            name: name.trim() || undefined,
            op,
            value,
          };
          setDraftGraph(record.id, { ...draft.graph, assertions: [...(draft.graph.assertions ?? []), assertion] }, "Assertion added");
          context.toast("Assertion added", "It is evaluated against the last dry run. Save the graph to keep it on the record.");
          close();
        }}
      >
        Add assertion
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
      <Notice tone="info" title="Assertions are stored on the graph">
        They travel with the workflow, so a duplicate keeps its tests.
      </Notice>
    </Stack>
  );
}

export function SimulatedReceipt({ context }: { context: ScreenContext }) {
  const { draft } = useTestContext(context);
  const [index, setIndex] = useState(0);
  const run = draft?.dryRun;
  if (!run) return <Empty title="No dry run to show a receipt for" icon={<Receipt size={20} />}>Run a dry run on the Simulation tab first.</Empty>;
  const step = run.steps[index] ?? run.steps[0];
  return (
    <Stack gap={4}>
      <Field label="Step">
        <Select aria-label="Step" value={String(index)} onChange={(event) => setIndex(Number(event.target.value))}>
          {run.steps.map((item, position) => <option key={`${item.nodeId}-${position}`} value={position}>{position + 1}. {item.label}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Receipt", value: <code className="ds-num">{step.receipt}</code> },
        { label: "Outcome", value: step.status },
        { label: "Attempts", value: String(step.attempts.length) },
        { label: "Mode", value: "dry — nothing was written" },
        { label: "Computed from", value: "node id, step index, the input it saw, the output it produced and the outcome" },
      ]} />
      <JsonBlock label="Input" value={step.input} />
      <JsonBlock label="Output" value={step.output} />
      <Notice tone="info" title="A receipt is a local checksum">
        It is stable: the same step with the same input gives the same receipt, so a replay can be compared. It is not a provider confirmation, because no provider was called.
      </Notice>
    </Stack>
  );
}

export function RunComparison({ context }: { context: ScreenContext }) {
  const { record } = useTestContext(context);
  const runs = useCollection("workflowRuns");
  const mine = runs
    .filter((run) => run.parentId === record?.id || run.fields.workflowId === record?.id)
    .sort((left, right) => String(right.at ?? "").localeCompare(String(left.at ?? "")));
  const [left, setLeft] = useState(mine[0]?.id ?? "");
  const [right, setRight] = useState(mine[1]?.id ?? "");
  const leftRun = readRun(mine.find((item) => item.id === left));
  const rightRun = readRun(mine.find((item) => item.id === right));

  if (mine.length < 2) {
    return <Empty title="Two runs are needed to compare" icon={<XCircle size={20} />}>Record at least two runs of this automation.</Empty>;
  }

  const rows = (leftRun?.result.steps ?? []).map((step) => {
    const other = rightRun?.result.steps.find((item) => item.nodeId === step.nodeId);
    return {
      id: step.nodeId,
      label: step.label,
      left: step.status,
      right: other?.status ?? "not reached",
      same: other ? other.status === step.status : false,
      leftReceipt: step.receipt,
      rightReceipt: other?.receipt ?? "—",
    };
  });

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Field label="Run A">
          <Select aria-label="Run A" value={left} onChange={(event) => setLeft(event.target.value)}>
            {mine.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
        <Field label="Run B">
          <Select aria-label="Run B" value={right} onChange={(event) => setRight(event.target.value)}>
            {mine.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      </Row>
      {rows.length === 0 ? <Empty title="Run A has no stored step trace" /> : (
        <Stack gap={2}>
          {rows.map((row) => (
            <Row key={row.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{row.label}</span>
              <Pill tone={row.left === "ok" ? "success" : row.left === "failed" ? "danger" : "warning"}>{row.left}</Pill>
              <span className="ds-subtle">vs</span>
              <Pill tone={row.right === "ok" ? "success" : row.right === "failed" ? "danger" : "warning"}>{row.right}</Pill>
              {row.leftReceipt !== row.rightReceipt && <Pill tone="info">different receipt</Pill>}
            </Row>
          ))}
        </Stack>
      )}
      <Notice tone="info" title="What a difference means">
        The interpreter is deterministic, so two runs differ only because the records differed, the fixture differed or a decision differed. The receipt changes when the input or the output changed.
      </Notice>
    </Stack>
  );
}

/* ---------------------- AUTO-005 contract actions ---------------------- */

/** Runs the dry run itself: every step is evaluated against real records and nothing is written. */
export function RunDryRun({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft, pool } = useTestContext(context);
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Open an automation first" />;
  if (!draft) return <Empty title="Opening the graph…" />;
  const providerSteps = draft.graph.nodes.filter((node) => node.config?.kind === "provider.call");
  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Notice tone="info" title="A dry run writes nothing and sends nothing">
        Steps that would send an email, take a payment or call a provider are simulated and recorded as not run.
      </Notice>
      <FactGrid columns={2} items={[
        { label: "Steps in the graph", value: String(draft.graph.nodes.length), mono: true },
        { label: "Provider steps simulated", value: String(providerSteps.length), mono: true },
        { label: "Fixture", value: Object.keys(draft.fixture ?? {}).length ? `${Object.keys(draft.fixture).length} values` : "None, real records" },
        { label: "Assertions", value: String(draft.graph.assertions?.length ?? 0), mono: true },
      ]} />
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const result = executeDry({ context, graph: draft.graph, pool, fixture: draft.fixture });
              updateDraft(record.id, { dryRun: result, dryRunAt: new Date(context.now).toISOString() });
              await executeRun({ context, workflow: record, graph: draft.graph, pool, mode: "dry", trigger: "Dry run from the action bar", fixture: draft.fixture });
              const checks = evaluateAssertions(draft.graph, result, context.now);
              context.toast("Dry run recorded", `${result.steps.length} steps, ${result.status.replace(/_/g, " ")}. ${checks.filter((item) => item.pass).length} of ${checks.length} assertions pass. No record was written.`, result.status === "failed" ? "failed" : "ok");
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Run the dry run
        </Button>}
          secondary={<Button variant="secondary" onClick={() => context.openOverlay("Fixture editor")}>Edit the fixture first</Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

/** Approves the tested version: only when the latest dry run passed every assertion. */
export function ApproveTestResult({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useTestContext(context);
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Open an automation first" />;
  if (!draft) return <Empty title="Opening the graph…" />;
  const run = draft.dryRun;
  const checks = run ? evaluateAssertions(draft.graph, run, context.now) : [];
  const failing = checks.filter((item) => !item.pass);
  const blocked = !run ? "Run a dry run first. Approval is bound to a tested result."
    : run.status === "failed" ? "The latest dry run failed."
      : checks.length === 0 ? "Add at least one assertion so the approval says what was checked."
        : failing.length > 0 ? `${failing.length} assertion${failing.length === 1 ? "" : "s"} fail.`
          : draft.dirty ? "The graph has unsaved changes since it was tested. Save it and run again." : undefined;
  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <FactGrid columns={2} items={[
        { label: "Latest dry run", value: draft.dryRunAt ? context.dateTime(draft.dryRunAt) : "None yet" },
        { label: "Outcome", value: run ? run.status.replace(/_/g, " ") : "No dry run", tone: run?.status === "failed" ? "danger" : undefined },
        { label: "Assertions passing", value: `${checks.length - failing.length} of ${checks.length}`, mono: true, tone: failing.length ? "danger" : undefined },
        { label: "Previously approved", value: record.fields.testApprovedBy ? `${String(record.fields.testApprovedBy)}, ${context.dateTime(String(record.fields.testApprovedAt ?? ""))}` : "Never" },
      ]} />
      <Notice tone={blocked ? "danger" : "info"} title={blocked ? "This result cannot be approved" : "Approval is recorded against this tested version"}>
        {blocked ?? `${context.actor} is recorded as approving revision ${record.revision}. Activation still asks separately.`}
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("run_automation")}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const saved = await context.mutate.patch(record.id, {
                fields: { ...record.fields, testApprovedBy: context.actor, testApprovedAt: clockIso(), testApprovedRevision: record.revision, testAssertions: checks.length },
              }, { expectRevision: record.revision, event: `Test result approved by ${context.actor}: ${checks.length} assertions pass` });
              if (!saved) return;
              context.toast("Test result approved", `${record.title} is approved as tested by ${context.actor}.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Approve the test result
        </Button>}
          secondary={<Button variant="secondary" onClick={() => context.openOverlay("assertion builder")}>Add an assertion</Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}
