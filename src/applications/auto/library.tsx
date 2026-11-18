import { useMemo, useState } from "react";
import { Copy, PauseCircle, PlayCircle, Workflow as WorkflowIcon } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, ModalActions, ModalInFlight, Notice, Pill, Properties, Row, Select,
  Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { freshness } from "@/platform/clock";
import { readGraph, type WorkflowGraph } from "./engine";
import { validateWorkflow } from "./validate";
import { AUTOMATION_COLLECTIONS } from "./runner";
import { nodeSummary } from "./canvas";
import { readRun } from "./panels";

export type LibraryTab = "All" | "Active" | "Draft" | "Paused" | "Failed";

export interface WorkflowRow {
  record: Rec;
  graph: WorkflowGraph;
  trigger: string;
  errors: number;
  warnings: number;
  lastRun?: Rec;
  runCount: number;
}

/** The records of every collection a workflow's trigger watches, so validation sees the real fields. */
function useTriggerPool(workflows: Rec[]): Rec[] {
  const names = useMemo(() => {
    const set = new Set<string>(["invoices"]);
    for (const workflow of workflows) {
      for (const node of readGraph(workflow).nodes) {
        const name = node.config?.collection;
        if (name && AUTOMATION_COLLECTIONS.includes(name)) set.add(name);
      }
    }
    return [...set].sort();
  }, [workflows]);
  const data = useCollections(names);
  return useMemo(() => names.flatMap((name) => data[name] ?? []), [names, data]);
}

export function useWorkflowRows(): WorkflowRow[] {
  const workflows = useCollection("workflows");
  const runs = useCollection("workflowRuns");
  const pool = useTriggerPool(workflows);
  return useMemo(() => workflows.map((record) => {
    const graph = readGraph(record);
    const issues = validateWorkflow(graph, pool);
    const mine = runs
      .filter((run) => run.parentId === record.id || run.fields.workflowId === record.id)
      .sort((left, right) => String(right.at ?? right.createdAt).localeCompare(String(left.at ?? left.createdAt)));
    const trigger = graph.nodes.find((node) => node.type === "trigger");
    return {
      record,
      graph,
      trigger: trigger ? nodeSummary(trigger) : "No trigger",
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      lastRun: mine[0],
      runCount: mine.length,
    };
  }), [workflows, runs, pool]);
}

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "paused") return "warning" as const;
  if (status === "archived") return "neutral" as const;
  if (status === "failed") return "danger" as const;
  return "info" as const;
}

export function AutomationLibrary({ context, tab }: { context: ScreenContext; tab: LibraryTab }) {
  const rows = useWorkflowRows();
  const { now } = useWorkspace();
  const filtered = useMemo(() => {
    if (tab === "Active") return rows.filter((row) => row.record.status === "active");
    if (tab === "Draft") return rows.filter((row) => ["draft", "new"].includes(row.record.status));
    if (tab === "Paused") return rows.filter((row) => row.record.status === "paused");
    if (tab === "Failed") return rows.filter((row) => row.lastRun?.status === "failed" || row.errors > 0);
    return rows.filter((row) => row.record.status !== "archived");
  }, [rows, tab]);

  const lastRunAt = rows.map((row) => row.lastRun?.at).filter(Boolean).sort().at(-1);
  const age = freshness(lastRunAt ?? undefined, now, 1);

  if (rows.length === 0) {
    return (
      <Empty
        title="No automations yet"
        icon={<WorkflowIcon size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Create workflow")}>New automation</Button>}
      >
        An automation watches records in this company and runs steps you can read afterwards. Nothing is sent outside this browser.
      </Empty>
    );
  }

  return (
    <Stack gap={5}>
      {tab === "All" && (
        <StatRow>
          <Stat prov="human" label="Active" value={String(rows.filter((row) => row.record.status === "active").length)} meta={`${rows.length} automations in total`} />
          <Stat prov="agent" label="Runs recorded" value={String(rows.reduce((total, row) => total + row.runCount, 0))} meta="Every run keeps its own step trace" />
          <Stat
            label="Last run"
            value={age.known ? context.relative(lastRunAt) : "Unavailable"}
            unavailable={!age.known}
            meta={age.known ? `${age.days} day${age.days === 1 ? "" : "s"} ago` : "No run has been recorded in this browser"}
          />
          <Stat prov="human" label="Blocking errors" value={String(rows.reduce((total, row) => total + row.errors, 0))} meta="A workflow with an error cannot be activated" />
        </StatRow>
      )}

      {tab === "Failed" && filtered.length > 0 && (
        <Notice tone="warning" title="These automations need attention before they run again">
          A failed last run or a validation error is shown here. Open the run trace to see the step that stopped, then fix the node.
        </Notice>
      )}

      <Card
        eyebrow="AUTOMATIONS"
        prov="human"
        title={`${tab} automations`}
        subtitle={`${filtered.length} of ${rows.length}`}
        flush
      >
        <DataGrid
          rows={filtered}
          rowId={(row) => row.record.id}
          label={`${tab} automations`}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.navigate(`/o/${context.org.slug}/auto/workflows/${id}`)}
          rowTone={(row) => (row.errors > 0 ? "danger" : row.lastRun?.status === "failed" ? "warning" : undefined)}
          empty={<Empty title={`No ${tab.toLowerCase()} automations`}>Automations appear here once they are in this state.</Empty>}
          columns={[
            {
              key: "title", header: "Workflow", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.record.title}</strong>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{row.record.summary}</p>
                </div>
              ),
              sortValue: (row) => row.record.title,
              filterValue: (row) => `${row.record.title} ${row.record.summary}`,
            },
            { key: "owner", header: "Owner", cell: (row) => row.record.ownerName, sortValue: (row) => row.record.ownerName, hideBelow: 900 },
            { key: "trigger", header: "Trigger", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{row.trigger}</span>, hideBelow: 1100 },
            { key: "status", header: "Status", cell: (row) => <Pill tone={statusTone(row.record.status)} dot>{row.record.status}</Pill>, sortValue: (row) => row.record.status },
            {
              key: "last", header: "Last run", align: "end",
              cell: (row) => (row.lastRun
                ? <span>{context.relative(row.lastRun.at)} · <Pill tone={row.lastRun.status === "failed" ? "danger" : row.lastRun.status === "completed" ? "success" : "warning"}>{row.lastRun.status}</Pill></span>
                : <span className="ds-subtle">Never run</span>),
              sortValue: (row) => row.lastRun?.at ?? "",
            },
            {
              key: "issues", header: "Issues", align: "end",
              cell: (row) => (row.errors > 0
                ? <Pill tone="danger">{row.errors} error{row.errors === 1 ? "" : "s"}</Pill>
                : row.warnings > 0 ? <Pill tone="warning">{row.warnings} warning{row.warnings === 1 ? "" : "s"}</Pill>
                  : <Pill tone="success">Clean</Pill>),
              sortValue: (row) => -(row.errors * 10 + row.warnings),
            },
          ]}
          bulkActions={[
            {
              label: "Pause",
              disabled: (selected) => selected.every((row) => row.record.status !== "active"),
              onRun: (selected) => {
                for (const row of selected.filter((item) => item.record.status === "active")) {
                  void context.mutate.patch(row.record.id, { status: "paused" }, { expectRevision: row.record.revision, event: "Automation paused from the library" });
                }
                context.toast("Paused", `${selected.length} automation${selected.length === 1 ? "" : "s"} will not start a new run.`);
              },
            },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function WorkflowQuickView({ context }: { context: ScreenContext }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId);
  const stored = row?.lastRun ? readRun(row.lastRun) : undefined;
  if (!row) return <Empty title="Choose an automation">Select a row to read its graph, its last run and its open issues.</Empty>;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Status", value: <Pill tone={statusTone(row.record.status)} dot>{row.record.status}</Pill> },
        { label: "Owner", value: row.record.ownerName },
        { label: "Trigger", value: row.trigger },
        { label: "Nodes", value: `${row.graph.nodes.length} nodes, ${row.graph.edges.length} connections` },
        { label: "Runs recorded", value: String(row.runCount) },
        { label: "Last run", value: row.lastRun ? `${row.lastRun.status} · ${context.dateTime(row.lastRun.at)}` : "Never run" },
        { label: "Step limit", value: `${row.graph.limits?.maxSteps ?? 40} steps, ${row.graph.limits?.maxVisits ?? 3} visits per node` },
      ]} />
      <Stack gap={2}>
        <strong>Steps in order</strong>
        {row.graph.nodes.map((node) => (
          <Row key={node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <Pill tone="neutral">{node.type}</Pill>
            <span className="ds-grow ds-truncate">{node.label}</span>
            <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{nodeSummary(node)}</span>
          </Row>
        ))}
      </Stack>
      {stored && (
        <Notice tone={stored.result.status === "completed" ? "success" : "warning"} title={`Last run: ${stored.result.status}`}>
          {stored.result.message}
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${row.record.id}`)}>Open the builder</Button>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs`)}>Run history</Button>
      </Row>
    </Stack>
  );
}

export function ActivationReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const rows = useWorkflowRows();
  const workflows = useCollection("workflows");
  const pool = useTriggerPool(workflows);
  const payload = context.overlayPayload as { id?: unknown } | undefined;
  const requestedId = typeof payload?.id === "string" ? payload.id : context.selectedId ?? context.params.id;
  const row = requestedId ? rows.find((item) => item.record.id === requestedId) : undefined;
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row) return <Empty title="No automation selected" />;
  const issues = validateWorkflow(row.graph, pool);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const providerNodes = row.graph.nodes.filter((node) => node.config?.kind === "provider.call");

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Properties rows={[
        { label: "Automation", value: row.record.title },
        { label: "Current status", value: row.record.status },
        { label: "Nodes", value: String(row.graph.nodes.length) },
        { label: "Blocking errors", value: <Pill tone={errors.length ? "danger" : "success"}>{errors.length}</Pill> },
        { label: "Warnings", value: <Pill tone={warnings.length ? "warning" : "success"}>{warnings.length}</Pill> },
      ]} />
      {errors.length > 0 ? (
        <Notice tone="danger" title="Activation is blocked">
          <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>
            {errors.map((issue) => <li key={issue.id}>{issue.title} — {issue.detail}</li>)}
          </ul>
        </Notice>
      ) : (
        <Notice tone="success" title="The graph passes validation">An active automation still only runs when a run is started here; no scheduler is running in this browser.</Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warning" title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}>
          <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>
            {warnings.map((issue) => <li key={issue.id}>{issue.title}</li>)}
          </ul>
        </Notice>
      )}
      {providerNodes.length > 0 && (
        <Notice tone="warning" title={`${providerNodes.length} step${providerNodes.length === 1 ? "" : "s"} would call a provider`}>
          Those steps will stop at the provider boundary and record that they did not run until a connection exists.
        </Notice>
      )}
      <Checkbox
        label="I have read what this automation changes in the workspace"
        checked={acknowledged}
        onChange={(event) => setAcknowledged(event.target.checked)}
      />
      <ModalActions>
        <Button
          variant="primary"
          icon={<PlayCircle size={15} />}
          disabled={errors.length > 0 || !acknowledged || busy}
          busy={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              if (!await context.mutate.patch(row.record.id, { status: "active" }, { expectRevision: row.record.revision, event: "Automation activated after review" })) {
                context.toast("Activation not saved", "The automation changed since you opened it. Reload before activating.", "blocked");
                return;
              }
              context.toast("Activated", `${row.record.title} is active. No scheduler or external action was started.`);
              close();
            } catch (error) {
              context.toast("Activation failed", error instanceof Error ? error.message : "Review and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Activate
        </Button>
        {row.record.status === "active" && (
          <Button
            variant="secondary"
            icon={<PauseCircle size={15} />}
            busy={busy}
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                if (!await context.mutate.patch(row.record.id, { status: "paused" }, { expectRevision: row.record.revision, event: "Automation paused from the activation review" })) {
                  context.toast("Pause not saved", "This automation changed. Reload before retrying.", "blocked");
                  return;
                }
                context.toast("Paused", `${row.record.title} will not start a new run.`);
                close();
              } catch (error) {
                context.toast("Pause failed", error instanceof Error ? error.message : "Review and retry.", "failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Pause instead
          </Button>
        )}
      </ModalActions>
    </Stack>
  );
}

export function ArchiveWorkflow({ context, close }: { context: ScreenContext; close: () => void }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId);
  const [confirm, setConfirm] = useState("");
  if (!row) return <Empty title="No automation selected">Select the automation you want to archive.</Empty>;
  return (
    <Stack gap={4}>
      <p>
        Archiving {row.record.title} keeps its {row.runCount} recorded run{row.runCount === 1 ? "" : "s"} and its graph. It stops appearing in the
        working library and cannot start a run.
      </p>
      <Field label={`Type the name to confirm: ${row.record.title}`}>
        <TextInput value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </Field>
      <Button
        variant="outline-danger"
        disabled={confirm.trim() !== row.record.title}
        onClick={async () => {
          if (!await context.mutate.patch(row.record.id, { status: "archived" }, { expectRevision: row.record.revision, event: "Automation archived" })) return;
          context.toast("Archived", `${row.record.title} is archived. Its runs are still in the run history.`);
          close();
        }}
      >
        Archive automation
      </Button>
    </Stack>
  );
}

export function DuplicateWorkflow({ context, close }: { context: ScreenContext; close: () => void }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId) ?? rows[0];
  const [name, setName] = useState(row ? `${row.record.title} (copy)` : "");
  if (!row) return <Empty title="No automation selected" />;
  const approvals = row.graph.nodes.filter((node) => node.type === "approval");
  const providers = row.graph.nodes.filter((node) => node.config?.kind === "provider.call");

  return (
    <Stack gap={4}>
      <Field label="Name of the copy" required>
        <TextInput aria-label="Name of the copy" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Notice tone="warning" title="The copy starts without grants or approvals">
        {approvals.length > 0 && `${approvals.length} approval gate${approvals.length === 1 ? "" : "s"} will be copied with the approver cleared, so an old grant cannot carry over. `}
        {providers.length > 0 && `${providers.length} provider step${providers.length === 1 ? "" : "s"} will keep the capability it names but lose any stored connection reference. `}
        The copy is created as a draft and must pass the activation review on its own.
      </Notice>
      <Button
        variant="primary"
        icon={<Copy size={15} />}
        disabled={name.trim() === ""}
        onClick={async () => {
          const copy: WorkflowGraph = {
            ...row.graph,
            nodes: row.graph.nodes.map((node) => ({
              ...node,
              config: {
                ...(node.config ?? {}),
                ...(node.type === "approval" ? { approvers: "" } : {}),
              },
            })),
          };
          const created = await context.mutate.create({
            collection: "workflows",
            title: name.trim(),
            status: "draft",
            summary: `Copy of ${row.record.title}. Grants and approvers were not copied.`,
            body: copy,
            fields: { copiedFrom: row.record.id, grantsCopied: false },
          }, `Automation duplicated from ${row.record.title} without grants`);
          context.toast("Duplicated", `${created.title} is a draft with no approver and no connection reference.`);
          context.navigate(`/o/${context.org.slug}/auto/workflows/${created.id}`);
          close();
        }}
      >
        Create the copy
      </Button>
    </Stack>
  );
}

export function CreateWorkflow({ context, close }: { context: ScreenContext; close: () => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [collection, setCollection] = useState("invoices");
  const [shape, setShape] = useState<"reminder" | "approval" | "blank">("reminder");

  return (
    <form
      id="auto-create"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const graph: WorkflowGraph = shape === "blank"
          ? { nodes: [{ id: "n1", type: "trigger", label: "When a record matches", x: 40, y: 80, config: { collection, event: "record.matches", timezone: context.org.timezone } }], edges: [], limits: { maxSteps: 40, maxVisits: 3 } }
          : shape === "approval"
            ? {
              nodes: [
                { id: "n1", type: "trigger", label: `Overdue ${collection}`, x: 40, y: 120, config: { collection, event: "record.overdue", timezone: context.org.timezone } },
                { id: "n2", type: "set", label: "Total at risk", x: 270, y: 120, config: { name: "atRisk", expr: "sum(trigger.matched.amountMinor)" } },
                { id: "n3", type: "approval", label: "Owner approves the chase", x: 500, y: 120, config: { approvers: context.actor } },
                { id: "n4", type: "action", label: "Record the chase decision", x: 730, y: 80, config: { kind: "log.note", summaryExpr: "Chase approved for {record.title}, {atRisk} minor units at risk.", retries: 0, onError: "halt", impact: "low" } },
              ],
              edges: [
                { id: "e1", from: "n1", to: "n2", port: "out" },
                { id: "e2", from: "n2", to: "n3", port: "out" },
                { id: "e3", from: "n3", to: "n4", port: "approved" },
              ],
              limits: { maxSteps: 40, maxVisits: 3 },
            }
            : {
              nodes: [
                { id: "n1", type: "trigger", label: `Overdue ${collection}`, x: 40, y: 120, config: { collection, event: "record.overdue", timezone: context.org.timezone } },
                { id: "n2", type: "condition", label: "Older than 7 days", x: 270, y: 120, config: { left: "overdueDays", op: "gt", right: "7" } },
                { id: "n3", type: "action", label: "Draft a reminder", x: 500, y: 60, config: { kind: "record.create", target: "messages", titleExpr: "Reminder: {record.title}", summaryExpr: "{record.title} is {overdueDays} days overdue.", retries: 0, onError: "halt", impact: "low" } },
                { id: "n4", type: "action", label: "Note that nothing is due", x: 500, y: 200, config: { kind: "log.note", summaryExpr: "{record.title} is not old enough to chase.", retries: 0, onError: "halt", impact: "low" } },
              ],
              edges: [
                { id: "e1", from: "n1", to: "n2", port: "out" },
                { id: "e2", from: "n2", to: "n3", port: "then" },
                { id: "e3", from: "n2", to: "n4", port: "else" },
              ],
              limits: { maxSteps: 40, maxVisits: 3 },
            };
        const created = await context.mutate.create({
          collection: "workflows",
          title: title.trim() || "New automation",
          status: "draft",
          summary: summary.trim() || `Watches ${collection} in ${context.org.shortName}.`,
          body: graph,
          fields: { scheduleTimezone: context.org.timezone, concurrency: 1 },
        }, "Automation created");
        context.toast("Automation created", `${created.title} is a draft. Open the builder to finish the graph.`);
        context.navigate(`/o/${context.org.slug}/auto/workflows/${created.id}`);
        close();
      }}
    >
      <Field label="Name" required><TextInput aria-label="Name" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Chase overdue invoices" /></Field>
      <Field label="What it should do"><TextArea aria-label="What it should do" rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Field label="Records it watches">
        <Select aria-label="Records it watches" value={collection} onChange={(event) => setCollection(event.target.value)}>
          {["invoices", "bills", "tasks", "tickets", "deals", "orders", "quotes"].map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Starting shape" hint="Every shape is a real graph you can edit; nothing is a placeholder.">
        <Select aria-label="Starting shape" value={shape} onChange={(event) => setShape(event.target.value as typeof shape)}>
          <option value="reminder">Trigger → condition → two branches</option>
          <option value="approval">Trigger → variable → approval gate → action</option>
          <option value="blank">Trigger only</option>
        </Select>
      </Field>
      <Notice tone="info" title="Created as a draft">A draft never runs by itself. You start a run from the builder or the test screen.</Notice>
    </form>
  );
}

export function WorkflowInspector({ context }: { context: ScreenContext }) {
  const record = useRecord(context.selectedId);
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId);
  if (!record || !row) {
    return <Empty title="Nothing selected" icon={<WorkflowIcon size={18} />}>Select an automation to see its trigger, its last run and what is blocking it.</Empty>;
  }
  return (
    <Stack gap={4}>
      <div>
        <h4 style={{ margin: 0 }}>{record.title}</h4>
        <p className="ds-subtle">{record.summary}</p>
      </div>
      <Properties rows={[
        { label: "Status", value: <Pill tone={statusTone(record.status)} dot>{record.status}</Pill> },
        { label: "Trigger", value: row.trigger },
        { label: "Graph", value: `${row.graph.nodes.length} nodes · ${row.graph.edges.length} edges` },
        { label: "Issues", value: row.errors ? `${row.errors} errors` : row.warnings ? `${row.warnings} warnings` : "None" },
        { label: "Runs", value: String(row.runCount) },
        { label: "Updated", value: context.dateTime(record.updatedAt) },
      ]} />
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${record.id}`)}>Open builder</Button>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Workflow quick view")}>Quick view</Button>
      </Row>
    </Stack>
  );
}
