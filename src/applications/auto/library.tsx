import { useMemo, useState } from "react";
import { Copy, PauseCircle, PlayCircle, Workflow as WorkflowIcon } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, KeyValueList, ModalActions, ModalInFlight, Notice,
  OverlayActions, OverlaySection, OverlaySummary, Pill, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
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
              onRun: async (selected) => {
                const active = selected.filter((item) => item.record.status === "active");
                let paused = 0;
                for (const row of active) {
                  const saved = await context.mutate.patch(row.record.id, { status: "paused" }, { expectRevision: row.record.revision, event: "Automation paused from the library" });
                  if (saved) paused += 1;
                }
                if (paused === 0) return;
                context.toast(
                  paused === active.length ? "Paused" : "Paused in part",
                  `${paused} automation${paused === 1 ? "" : "s"} will not start a new run.${paused < active.length ? ` ${active.length - paused} changed elsewhere and kept their status.` : ""}`,
                  paused === active.length ? "ok" : "info",
                );
              },
            },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function WorkflowQuickSummary({ context }: { context: ScreenContext }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId);
  if (!row) return null;
  return (
    <OverlaySummary
      eyebrow="Automation"
      title={row.record.title}
      status={<Pill tone={statusTone(row.record.status)} dot>{row.record.status}</Pill>}
      meta={[row.record.ownerName, row.trigger]}
    />
  );
}

export function WorkflowQuickView({ context }: { context: ScreenContext }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === context.selectedId);
  const stored = row?.lastRun ? readRun(row.lastRun) : undefined;
  if (!row) return <Empty title="Choose an automation">Select a row to read its graph, its last run and its open issues.</Empty>;
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Graph", value: `${row.graph.nodes.length} nodes, ${row.graph.edges.length} connections` },
        { label: "Runs recorded", value: String(row.runCount), mono: true },
        { label: "Last run", value: row.lastRun ? `${row.lastRun.status} · ${context.dateTime(row.lastRun.at)}` : "Never run" },
        { label: "Limits", value: `${row.graph.limits?.maxSteps ?? 40} steps, ${row.graph.limits?.maxVisits ?? 3} visits per node` },
      ]} />
      <OverlaySection title="Steps in order" hint={`${row.graph.nodes.length} nodes`}>
        <Stack gap={2}>
          {row.graph.nodes.map((node) => (
            <Row key={node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <Pill tone="neutral">{node.type}</Pill>
              <span className="ds-grow ds-truncate">{node.label}</span>
              <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{nodeSummary(node)}</span>
            </Row>
          ))}
        </Stack>
      </OverlaySection>
      {stored && (
        <Notice tone={stored.result.status === "completed" ? "success" : "warning"} title={`Last run: ${stored.result.status}`}>
          {stored.result.message}
        </Notice>
      )}
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${row.record.id}`)}>Open the builder</Button>}
          secondary={<Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/runs`)}>Run history</Button>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function ActivationSummary({ context }: { context: ScreenContext }) {
  const rows = useWorkflowRows();
  const row = rows.find((item) => item.record.id === activationTarget(context));
  if (!row) return null;
  return (
    <OverlaySummary
      eyebrow="Automation"
      title={row.record.title}
      status={<Pill tone={statusTone(row.record.status)} dot>{row.record.status}</Pill>}
      meta={[row.trigger, `${row.graph.nodes.length} nodes`]}
    />
  );
}

function activationTarget(context: ScreenContext): string | undefined {
  const payload = context.overlayPayload as { id?: unknown } | undefined;
  return typeof payload?.id === "string" ? payload.id : context.selectedId ?? context.params.id;
}

export function ActivationReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const rows = useWorkflowRows();
  const workflows = useCollection("workflows");
  const pool = useTriggerPool(workflows);
  const requestedId = activationTarget(context);
  const row = requestedId ? rows.find((item) => item.record.id === requestedId) : undefined;
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row) return <Empty title="No automation selected">Choose an automation in the library, then open its activation review.</Empty>;
  const issues = validateWorkflow(row.graph, pool);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const providerNodes = row.graph.nodes.filter((node) => node.config?.kind === "provider.call");
  const isActive = row.record.status === "active";

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <FactGrid columns={3} dense items={[
        { label: "Status now", value: row.record.status },
        { label: "Blocking errors", value: String(errors.length), mono: true, tone: errors.length ? "danger" : "success" },
        { label: "Warnings", value: String(warnings.length), mono: true, tone: warnings.length ? "warning" : "success" },
      ]} />
      {errors.length > 0 ? (
        <OverlaySection tone="danger" title="Activation is blocked">
          <ul className="auto-plan">
            {errors.map((issue) => <li key={issue.id}><strong>{issue.title}</strong><span>{issue.detail}</span></li>)}
          </ul>
        </OverlaySection>
      ) : (
        <Notice tone={isActive ? "info" : "success"} title={isActive ? "Already active" : "The graph passes validation"}>
          {isActive
            ? "Activating again would change nothing. Pause it, or leave it as it is."
            : "An active automation still only runs when someone starts a run here. No scheduler is running in this browser."}
        </Notice>
      )}
      {warnings.length > 0 && (
        <OverlaySection tone="warning" title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}>
          <ul className="auto-plan">
            {warnings.map((issue) => <li key={issue.id}><strong>{issue.title}</strong></li>)}
          </ul>
        </OverlaySection>
      )}
      {providerNodes.length > 0 && (
        <Notice tone="warning" title={`${providerNodes.length} step${providerNodes.length === 1 ? "" : "s"} would call a provider`}>
          They stop at the provider boundary and record that they did not run until a connection exists.
        </Notice>
      )}
      {!isActive && (
        <Checkbox
          label="I have read what this automation changes in the workspace"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
      )}
      <ModalActions>
        <OverlayActions
          primary={isActive ? (
            <Button
              variant="primary"
              icon={<PauseCircle size={15} />}
              busy={busy}
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const saved = await context.mutate.patch(row.record.id, { status: "paused" }, { expectRevision: row.record.revision, event: "Automation paused from the activation review" });
                  if (!saved) return;
                  context.toast("Paused", `${row.record.title} will not start a new run.`);
                  close();
                } catch (error) {
                  context.toast("Pause failed", error instanceof Error ? error.message : "Review and retry.", "failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Pause the automation
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<PlayCircle size={15} />}
              disabled={errors.length > 0 || !acknowledged || busy}
              busy={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const saved = await context.mutate.patch(row.record.id, { status: "active" }, { expectRevision: row.record.revision, event: "Automation activated after review" });
                  if (!saved) return;
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
          )}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
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
        Archiving keeps its {row.runCount} recorded run{row.runCount === 1 ? "" : "s"} and its graph. It leaves the working library and cannot start a run.
      </p>
      <Field label={`Type the name to confirm: ${row.record.title}`}>
        <TextInput value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </Field>
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
          primary={(
            <Button
              variant="outline-danger"
              disabled={confirm.trim() !== row.record.title}
              onClick={async () => {
                const saved = await context.mutate.patch(row.record.id, { status: "archived" }, { expectRevision: row.record.revision, event: "Automation archived" });
                if (!saved) return;
                context.toast("Archived", `${row.record.title} is archived. Its runs are still in the run history.`);
                close();
              }}
            >
              Archive automation
            </Button>
          )}
        />
      </ModalActions>
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
      <ModalActions>
        <OverlayActions
          primary={<Button
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
      </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
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
      <OverlaySummary
        title={record.title}
        status={<Pill tone={statusTone(record.status)} dot>{record.status}</Pill>}
        meta={[record.summary]}
      />
      <KeyValueList items={[
        { label: "Trigger", value: row.trigger },
        { label: "Graph", value: `${row.graph.nodes.length} nodes · ${row.graph.edges.length} edges`, mono: true },
        { label: "Issues", value: row.errors ? `${row.errors} error${row.errors === 1 ? "" : "s"}` : row.warnings ? `${row.warnings} warning${row.warnings === 1 ? "" : "s"}` : "None", tone: row.errors ? "danger" : undefined },
        { label: "Runs", value: String(row.runCount), mono: true },
        { label: "Updated", value: context.dateTime(record.updatedAt), mono: true },
      ]} />
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${record.id}`)}>Open builder</Button>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Workflow quick view")}>Quick view</Button>
      </Row>
    </Stack>
  );
}
