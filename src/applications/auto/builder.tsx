import { useMemo, useState } from "react";
import { FlaskConical, Play, Save, Workflow as WorkflowIcon } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented,
  Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, PROVIDER_CAPABILITIES, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import {
  portsFor, validateGraph, type PortId, type WfNode, type WorkflowGraph,
} from "./engine";
import { GraphCanvas, GraphList, NODE_KINDS, NodeInspector, NodePalette, addNode, connect, nodeSummary } from "./canvas";
import { RunHeadline, RunTimeline, ValidationPanel, readRun } from "./panels";
import { AUTOMATION_COLLECTIONS, executeDry, executeRun, useGraphRecords } from "./runner";
import { markSaved, setDraftGraph, updateDraft, useBuilderDraft } from "./store";

export function useBuilderWorkflow(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  return { record, draft };
}

export function bindingsOf(graph: WorkflowGraph): { path: string; note: string }[] {
  const out: { path: string; note: string }[] = [
    { path: "record.id", note: "Id of the record the trigger bound" },
    { path: "record.title", note: "Title of that record" },
    { path: "record.status", note: "Its status" },
    { path: "record.amountMinor", note: "Its amount in minor units" },
    { path: "record.dueAt", note: "Its due date" },
    { path: "overdueDays", note: "Whole days past the due date, computed at run time" },
    { path: "trigger.count", note: "How many records matched the trigger" },
    { path: "trigger.matched.amountMinor", note: "Every matched amount, for sum/avg/max" },
    { path: "now", note: "The workspace clock when the run started" },
  ];
  for (const node of graph.nodes) {
    if (node.type === "set" && node.config?.name) out.push({ path: node.config.name, note: `Bound by ${node.label}: ${node.config.expr}` });
    if (node.type === "approval") out.push({ path: "approval.decision", note: `Decision recorded at ${node.label}` });
  }
  return out;
}

/* ====================================================================== *
 * ARL-AUTO-002 — Visual Workflow Builder
 * ====================================================================== */

export function WorkflowBuilder({ context }: { context: ScreenContext }) {
  const { record, draft } = useBuilderWorkflow(context);
  const runs = useCollection("workflowRuns");
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  const [busy, setBusy] = useState<"dry" | "live" | null>(null);

  const issues = useMemo(
    () => (draft ? validateGraph(draft.graph, pool) : []),
    [draft, pool],
  );

  if (!record) {
    return (
      <Empty title="That automation is not in this company" icon={<WorkflowIcon size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows`)}>Back to the library</Button>}>
        The address points at {context.params.id ?? "no record"}, which is not a workflow in {context.org.name}.
      </Empty>
    );
  }
  if (!draft) return <Empty title="Opening the graph…" />;

  const graph = draft.graph;
  const errors = issues.filter((issue) => issue.severity === "error");
  const mine = runs
    .filter((run) => run.parentId === record.id || run.fields.workflowId === record.id)
    .sort((left, right) => String(right.at ?? right.createdAt).localeCompare(String(left.at ?? left.createdAt)));

  function change(next: WorkflowGraph, note: string) {
    setDraftGraph(record!.id, next, note);
  }

  if (context.tab === "Parameters") {
    return (
      <Grid>
        <Card span={6} eyebrow="LIMITS" prov="human" title="Loop and step limits" subtitle="A graph with a cycle is allowed, but it cannot run away">
          <Stack gap={4}>
            <Field label="Maximum steps in a run" hint="The run is failed when it passes this number of executed steps.">
              <TextInput aria-label="Maximum steps in a run" type="number" min={1} max={200}
                value={String(graph.limits?.maxSteps ?? 40)}
                onChange={(event) => change({ ...graph, limits: { ...graph.limits, maxSteps: Math.max(1, Number(event.target.value)) } }, "Step limit changed")}
              />
            </Field>
            <Field label="Maximum visits per node" hint="Guards a loop that would otherwise keep re-entering the same node.">
              <TextInput aria-label="Maximum visits per node" type="number" min={1} max={20}
                value={String(graph.limits?.maxVisits ?? 3)}
                onChange={(event) => change({ ...graph, limits: { ...graph.limits, maxVisits: Math.max(1, Number(event.target.value)) } }, "Visit limit changed")}
              />
            </Field>
            <Notice tone="info" title="How the limit is applied">
              The interpreter counts executed steps and visits per node. When either limit is passed it stops the run, marks it failed and records which node hit the limit — it does not quietly truncate the trace.
            </Notice>
          </Stack>
        </Card>

        <Card span={6} eyebrow="BINDINGS" prov="agent" title="Bindings available to a step" subtitle="Computed from the graph, not a fixed list">
          <Stack gap={2}>
            {bindingsOf(graph).map((binding) => (
              <Row key={binding.path} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <code className="ds-num">{binding.path}</code>
                <span className="ds-grow ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{binding.note}</span>
              </Row>
            ))}
          </Stack>
        </Card>

        <Card span={12} eyebrow="FIXTURE" prov="human" title="Dry-run fixture" subtitle="Values merged over the triggered record, for a test only">
          <Stack gap={3}>
            {Object.entries(draft.fixture).length === 0 && <p className="ds-subtle">No fixture values. A dry run uses the real record the trigger matches.</p>}
            {Object.entries(draft.fixture).map(([key, value]) => (
              <Row key={key} gap={2}>
                <code className="ds-num" style={{ minWidth: 160 }}>{key}</code>
                <TextInput
                  value={String(value)}
                  onChange={(event) => updateDraft(record.id, { fixture: { ...draft.fixture, [key]: event.target.value } })}
                />
                <Button variant="ghost" onClick={() => {
                  const next = { ...draft.fixture };
                  delete next[key];
                  updateDraft(record.id, { fixture: next });
                }}>Remove</Button>
              </Row>
            ))}
            <Button variant="secondary" onClick={() => context.openOverlay("Fixture editor")}>Edit the fixture</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Test") {
    const dryRun = draft.dryRun;
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat prov="human" label="Nodes" value={String(graph.nodes.length)} meta={`${graph.edges.length} connections`} />
          <Stat prov="human" label="Blocking errors" value={String(errors.length)} meta={errors.length ? "A live run is blocked" : "The graph passes validation"} />
          <Stat prov="posted" label="Records the trigger can read" value={String(pool.length)} meta={[...new Set(graph.nodes.map((node) => node.config?.collection).filter(Boolean))].join(", ") || "No collection chosen"} />
          <Stat
            label="Last simulation"
            value={draft.dryRunAt ? context.relative(draft.dryRunAt) : "Unavailable"}
            unavailable={!draft.dryRunAt}
            meta={draft.dryRunAt ? `${dryRun?.steps.length ?? 0} steps` : "No dry run in this session"}
          />
        </StatRow>

        <Card
          eyebrow="INTERPRETER"
          prov="agent"
          machine
          title="Run the interpreter"
          subtitle="A dry run evaluates every step and writes nothing. A live run applies the record changes its steps asked for."
          actions={
            <Row gap={2}>
              <Button
                variant="secondary"
                icon={<FlaskConical size={15} />}
                busy={busy === "dry"}
                onClick={async () => {
                  setBusy("dry");
                  try {
                    const result = executeDry({ graph, pool, context, fixture: draft.fixture });
                    updateDraft(record.id, { dryRun: result, dryRunAt: new Date(context.now).toISOString() });
                    context.toast("Dry run finished", `${result.steps.length} steps, ${result.status.replace(/_/g, " ")}. Nothing was written.`, result.status === "failed" ? "failed" : "ok");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Dry run
              </Button>
              <Button
                variant="primary"
                icon={<Play size={15} />}
                busy={busy === "live"}
                disabled={errors.length > 0 || draft.dirty || !context.can("run_automation")}
                title={errors.length > 0 ? "Fix the validation errors first" : draft.dirty ? "Save the graph before a live run" : !context.can("run_automation") ? "This role view does not run automations" : undefined}
                onClick={async () => {
                  setBusy("live");
                  try {
                    const outcome = await executeRun({ context, workflow: record, graph, pool, mode: "live", trigger: "Started by hand from the builder" });
                    context.toast(
                      "Run recorded",
                      `${outcome.run.status.replace(/_/g, " ")} after ${outcome.run.steps.length} steps. ${outcome.writesApplied.length} record change${outcome.writesApplied.length === 1 ? "" : "s"} applied.`,
                      outcome.run.status === "failed" ? "failed" : outcome.run.status === "completed" ? "ok" : "info",
                    );
                    context.navigate(`/o/${context.org.slug}/auto/runs/${outcome.runId}`);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Run live
              </Button>
            </Row>
          }
        >
          {dryRun ? (
            <Stack gap={4}>
              <RunHeadline run={dryRun} context={context} />
              <RunTimeline run={dryRun} context={context} />
            </Stack>
          ) : (
            <Empty title="No simulation yet" icon={<FlaskConical size={20} />}>
              A dry run walks the graph with the records this company actually holds, evaluates every condition and expression, and reports what each step would have written.
            </Empty>
          )}
        </Card>
      </Stack>
    );
  }

  if (context.tab === "History") {
    return (
      <Card eyebrow="RUN HISTORY" prov="agent" title="Runs of this automation" subtitle={`${mine.length} recorded`} flush>
        {mine.length === 0 ? (
          <Empty title="No run yet" icon={<Play size={20} />}>Use the Test tab to run the interpreter. Every run is stored with its step trace.</Empty>
        ) : (
          <DataGrid
            rows={mine}
            rowId={(row) => row.id}
            label="Runs of this automation"
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/runs/${id}`)}
            columns={[
              { key: "title", header: "Run", primary: true, cell: (row) => row.title, sortValue: (row) => row.at ?? "", filterValue: (row) => row.title },
              { key: "mode", header: "Mode", cell: (row) => <Pill tone={row.fields.mode === "dry" ? "info" : "accent"}>{String(row.fields.mode ?? "live")}</Pill> },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "completed" ? "success" : row.status === "failed" ? "danger" : "warning"} dot>{row.status}</Pill> },
              { key: "steps", header: "Steps", align: "end", cell: (row) => String(row.fields.steps ?? "—"), sortValue: (row) => Number(row.fields.steps ?? 0) },
              { key: "duration", header: "Duration", align: "end", cell: (row) => `${row.fields.durationMs ?? 0} ms` },
              { key: "started", header: "Started", align: "end", cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at ?? "" },
            ]}
          />
        )}
      </Card>
    );
  }

  /* Design */
  return (
    <div className="auto-builder">
      <Card eyebrow="PALETTE" title="Palette" subtitle="Six node kinds">
        <NodePalette onAdd={(type) => {
          const next = addNode(graph, type);
          change(next, `${type} node added`);
          updateDraft(record.id, { selectedNodeId: next.nodes[next.nodes.length - 1].id });
        }} />
      </Card>

      <Stack gap={3}>
        <Row gap={2} wrap>
          <Segmented
            label="Graph view"
            value={draft.view}
            onChange={(value) => updateDraft(record.id, { view: value })}
            options={[{ value: "canvas", label: "Canvas" }, { value: "list", label: "List (keyboard)" }]}
          />
          <span className="ds-grow" />
          {draft.dirty && <Pill tone="warning" dot>Unsaved: {draft.lastNote}</Pill>}
          <Button
            variant="primary"
            icon={<Save size={15} />}
            disabled={!draft.dirty}
            onClick={async () => {
              const saved = await context.mutate.patch(record.id, { body: graph }, { expectRevision: record.revision, event: `Graph saved: ${draft.lastNote}` });
              if (saved) {
                markSaved(record.id, saved.revision);
                context.toast("Graph saved", `${graph.nodes.length} nodes and ${graph.edges.length} connections are on the record.`);
              }
            }}
          >
            Save graph
          </Button>
        </Row>

        {draft.view === "canvas" ? (
          <GraphCanvas
            graph={graph}
            onChange={change}
            selectedId={draft.selectedNodeId}
            onSelect={(id) => updateDraft(record.id, { selectedNodeId: id })}
            issues={issues}
            steps={draft.dryRun?.steps}
          />
        ) : (
          <GraphList
            graph={graph}
            onChange={change}
            selectedId={draft.selectedNodeId}
            onSelect={(id) => updateDraft(record.id, { selectedNodeId: id })}
          />
        )}
      </Stack>

      <Card eyebrow="NODE" prov="human" title="Node properties" subtitle={draft.selectedNodeId ? graph.nodes.find((node) => node.id === draft.selectedNodeId)?.label : "Nothing selected"}>
        <NodeInspector
          graph={graph}
          nodeId={draft.selectedNodeId}
          onChange={change}
          collections={AUTOMATION_COLLECTIONS}
        />
      </Card>

      <Card eyebrow="VALIDATION" prov="agent" title="Validation" subtitle={`${errors.length} error${errors.length === 1 ? "" : "s"}, ${issues.length - errors.length} warning${issues.length - errors.length === 1 ? "" : "s"}`}>
        <ValidationPanel issues={issues} onSelect={(nodeId) => updateDraft(record.id, { selectedNodeId: nodeId, view: draft.view })} />
      </Card>
    </div>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function NodePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useBuilderWorkflow(context);
  const [type, setType] = useState(NODE_KINDS[0].id);
  const [label, setLabel] = useState("");
  if (!record || !draft) return <Empty title="Open an automation first" />;
  return (
    <Stack gap={4}>
      <p className="ds-subtle">
        Adding a node here is the keyboard equivalent of dragging a card from the palette. The node is dropped at the next free slot and selected for you.
      </p>
      <Field label="Node kind">
        <Select aria-label="Node kind" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          {NODE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label} — {kind.hint}</option>)}
        </Select>
      </Field>
      <Field label="Label" hint="A short name that says what the step does.">
        <TextInput aria-label="Label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={NODE_KINDS.find((kind) => kind.id === type)?.label} />
      </Field>
      <Button
        variant="primary"
        onClick={() => {
          const next = addNode(draft.graph, type, label.trim() || undefined);
          setDraftGraph(record.id, next, `${type} node added`);
          updateDraft(record.id, { selectedNodeId: next.nodes[next.nodes.length - 1].id });
          context.toast("Node added", "It is on the canvas and selected. Save the graph when the configuration is finished.");
          close();
        }}
      >
        Add node
      </Button>
    </Stack>
  );
}

export function BranchEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useBuilderWorkflow(context);
  const [from, setFrom] = useState("");
  const [port, setPort] = useState<PortId>("out");
  const [to, setTo] = useState("");
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const graph = draft.graph;
  const fromNode = graph.nodes.find((node) => node.id === from);
  const ports = fromNode ? portsFor(fromNode.type) : [{ id: "out" as PortId, label: "next" }];

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Connections without a pointer">
        Choose the step the path leaves, which port it leaves by, and where it goes. A condition has a true and a false port; an approval has approved and rejected.
      </Notice>
      <Field label="From step">
        <Select aria-label="From step" value={from} onChange={(event) => { setFrom(event.target.value); setPort("out"); }}>
          <option value="">Choose a step</option>
          {graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label} ({node.type})</option>)}
        </Select>
      </Field>
      <Field label="Leaving by">
        <Select aria-label="Leaving by" value={port} onChange={(event) => setPort(event.target.value as PortId)} disabled={!fromNode}>
          {ports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="To step">
        <Select aria-label="To step" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose a step</option>
          {graph.nodes.filter((node) => node.id !== from).map((node) => <option key={node.id} value={node.id}>{node.label} ({node.type})</option>)}
        </Select>
      </Field>
      {from && port && graph.edges.some((edge) => edge.from === from && (edge.port ?? "out") === port) && (
        <Notice tone="warning" title="That port already leads somewhere">
          A port carries one path. Connecting it again replaces the existing connection to {graph.nodes.find((node) => node.id === graph.edges.find((edge) => edge.from === from && (edge.port ?? "out") === port)?.to)?.label}.
        </Notice>
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={!from || !to}
          onClick={() => {
            setDraftGraph(record.id, connect(graph, from, port, to), `Connected ${fromNode?.label} (${port})`);
            context.toast("Connected", `${fromNode?.label} now leads to ${graph.nodes.find((node) => node.id === to)?.label} on the ${port} port.`);
            close();
          }}
        >
          Connect
        </Button>
      </Row>
      <Stack gap={2}>
        <strong>Existing connections</strong>
        {graph.edges.length === 0 && <span className="ds-subtle">None yet.</span>}
        {graph.edges.map((edge) => (
          <Row key={edge.id ?? `${edge.from}-${edge.to}`} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <span className="ds-grow" style={{ fontSize: "var(--text-xs)" }}>
              {graph.nodes.find((node) => node.id === edge.from)?.label} → <Pill tone="neutral">{edge.port ?? "out"}</Pill> → {graph.nodes.find((node) => node.id === edge.to)?.label}
            </span>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

export function ConnectorGrants({ context }: { context: ScreenContext }) {
  const { draft } = useBuilderWorkflow(context);
  const used = useMemo(() => {
    const ids = new Set((draft?.graph.nodes ?? []).filter((node) => node.config?.kind === "provider.call").map((node) => node.config?.capability).filter(Boolean) as string[]);
    return [...ids];
  }, [draft]);

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No provider is connected in this browser">
        A step that names a capability stops at the boundary and records that it did not run. Nothing is queued for later delivery unless the capability says so.
      </Notice>
      {used.length === 0 ? (
        <Empty title="This graph calls no provider">Every step writes records or logs inside this workspace.</Empty>
      ) : (
        <Stack gap={2}>
          {used.map((id) => {
            const capability = capabilityById(id);
            if (!capability) return null;
            return (
              <div key={id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}>
                  <strong className="ds-grow">{capability.label}</strong>
                  <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>
                </Row>
                <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{capability.note}</p>
                <p style={{ fontSize: "var(--text-xs)" }}>Kept locally instead: {capability.localEquivalent}</p>
              </div>
            );
          })}
        </Stack>
      )}
      <Stack gap={2}>
        <strong>Every capability this product knows about</strong>
        <Properties rows={PROVIDER_CAPABILITIES.map((capability) => ({
          label: capability.label,
          value: <Pill tone={CAPABILITY_TONE[capability.state]}>{CAPABILITY_LABELS[capability.state]}</Pill>,
        }))} />
      </Stack>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/connectors`)}>Open connections</Button>
    </Stack>
  );
}

export function NodeConfiguration({ context }: { context: ScreenContext }) {
  const { record, draft } = useBuilderWorkflow(context);
  if (!record || !draft) return <Empty title="Open an automation first" />;
  return (
    <Stack gap={4}>
      <Field label="Step to configure">
        <Select aria-label="Step to configure" value={draft.selectedNodeId ?? ""}
          onChange={(event) => updateDraft(record.id, { selectedNodeId: event.target.value || undefined })}
        >
          <option value="">Choose a step</option>
          {draft.graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label} — {nodeSummary(node)}</option>)}
        </Select>
      </Field>
      <NodeInspector
        graph={draft.graph}
        nodeId={draft.selectedNodeId}
        onChange={(next, note) => setDraftGraph(record.id, next, note)}
        collections={AUTOMATION_COLLECTIONS}
      />
    </Stack>
  );
}

export function ValidationReport({ context }: { context: ScreenContext }) {
  const { record, draft } = useBuilderWorkflow(context);
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const issues = validateGraph(draft.graph, pool);
  return (
    <Stack gap={4}>
      <ValidationPanel issues={issues} onSelect={(nodeId) => updateDraft(record.id, { selectedNodeId: nodeId })} />
    </Stack>
  );
}

export function FixtureEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useBuilderWorkflow(context);
  const [key, setKey] = useState("record.status");
  const [value, setValue] = useState("");
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const bindings = bindingsOf(draft.graph);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A fixture only changes a dry run">
        Fixture values are merged over the record the trigger matched, so you can test a branch without editing a real record. A live run ignores the fixture.
      </Notice>
      <Field label="Field">
        <Select aria-label="Field" value={key} onChange={(event) => setKey(event.target.value)}>
          {bindings.filter((binding) => binding.path.startsWith("record.") || binding.path === "overdueDays").map((binding) => (
            <option key={binding.path} value={binding.path.replace(/^record\./, "")}>{binding.path}</option>
          ))}
        </Select>
      </Field>
      <Field label="Value used in the dry run">
        <TextInput aria-label="Value used in the dry run" value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={value.trim() === ""}
          onClick={() => {
            const numeric = Number(value);
            updateDraft(record.id, { fixture: { ...draft.fixture, [key]: Number.isFinite(numeric) && value.trim() !== "" ? numeric : value } });
            context.toast("Fixture value set", `${key} will read ${value} in the next dry run.`);
            close();
          }}
        >
          Add to the fixture
        </Button>
      </Row>
      {Object.keys(draft.fixture).length > 0 && (
        <Properties rows={Object.entries(draft.fixture).map(([name, item]) => ({ label: name, value: String(item) }))} />
      )}
    </Stack>
  );
}

export function nodeById(graph: WorkflowGraph, id: string | undefined): WfNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

export function lastRunOf(runs: { parentId?: string; fields: Record<string, unknown>; at?: string; id: string }[], workflowId: string) {
  return runs
    .filter((run) => run.parentId === workflowId || run.fields.workflowId === workflowId)
    .sort((left, right) => String(right.at ?? "").localeCompare(String(left.at ?? "")))[0];
}

export { readRun };
