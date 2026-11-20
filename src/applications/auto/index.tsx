import {
  AlertOctagon, CalendarClock, FlaskConical, GitBranch, History, Radio,
  Workflow as WorkflowIcon, Wrench,
} from "lucide-react";
import { Button, ModalActions, Notice, OVERLAY_WIDTH, OverlayActions, Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import { knownRecord } from "@/platform/repo";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { readGraph } from "./engine";
import { validateWorkflow } from "./validate";
import {
  ActivationReview, ActivationSummary, ArchiveWorkflow, WorkflowQuickSummary, AutomationLibrary, CreateWorkflow, DuplicateWorkflow,
  WorkflowInspector, WorkflowQuickView, type LibraryTab,
} from "./library";
import {
  BranchEditor, ConnectorGrants, FixtureEditor, NodeConfiguration, NodePicker,
  ValidationReport, WorkflowBuilder,
} from "./builder";
import {
  SampleInspection, ScheduleRecurrence, TriggerConfiguration, TriggerSelection, WebhookSetup,
} from "./triggers";
import { ActionNodes, ActionParameter, PolicySimulation, VariableSelector } from "./actions";
import { ApproveTestResult, AssertionBuilder, RunComparison, RunDryRun, SimulatedReceipt, WorkflowTesting } from "./testing";
import {
  IncidentLink, NodeTrace, RedactionPanel, ReplayConfirmation, ReplaySummary, RetrySafetyCheck, RunDetail,
  RunDetailHeader, RunHistory, RunInspector, RunSummary, exportRun, runRecordHeader, type RunTab,
} from "./runs";
import {
  AssignException, AutomationExceptions, ConnectorReconnect, ImpactWarning, IncidentDetail, IncidentSummary,
  QueuePriority, ResolutionRecord, RetryFromException, ScheduleEditor, SchedulesAndQueues,
  type ExceptionTab,
} from "./ops";
import { getDraft } from "./store";
import { loadGraphRecords } from "./runner";
import { getRecordInOrg } from "@/platform/repo";
import "./auto.css";

/* ====================================================================== *
 * AUTO — Automation & Workflow Builder
 *
 * The graph is a real node graph, and the run is produced by the interpreter in
 * ./engine.ts: step order, conditions, variable bindings, retries, approval
 * gates that stop and wait, and a receipt per step. A step whose action would
 * reach a provider stops at the boundary in src/platform/capability.ts and is
 * recorded as not run.
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

/** The automation is the page head of the builder (ScreenDef.record). */
function builderRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const record = knownRecord(context.params.id);
  if (!record || record.organizationId !== context.org.id || record.collection !== "workflows") return null;
  const graph = readGraph(record);
  const tone = record.status === "active" ? "success" : record.status === "paused" ? "warning" : record.status === "archived" ? "neutral" : "info";
  return {
    eyebrow: "Workflow builder",
    title: record.title,
    status: <Pill tone={tone} dot>{record.status}</Pill>,
    meta: [`${graph.nodes.length} nodes, ${graph.edges.length} connections`, record.ownerName ? `Owner ${record.ownerName}` : undefined],
  };
}

function needsSelection(context: ScreenContext): string | undefined {
  return context.selectedId ? undefined : "Select an automation first";
}

function needsRun(context: ScreenContext): string | undefined {
  return context.selectedId ? undefined : "Select a run first";
}

export const autoApp = registerApp({
  code: "AUTO",
  short: "Automation",
  name: "Automation & Workflow Builder",
  purpose: "Graphs that actually run, with a trace you can read",
  icon: WorkflowIcon,
  nav: [
    {
      items: [
        { label: "Automation Library", screenId: "ARL-AUTO-001", icon: WorkflowIcon },
        { label: "Workflow Builder", screenId: "ARL-AUTO-002", icon: GitBranch },
      ],
    },
    {
      label: "Configure",
      items: [
        { label: "Triggers", screenId: "ARL-AUTO-003", icon: Radio },
        { label: "Actions & AI", screenId: "ARL-AUTO-004", icon: Wrench },
        { label: "Testing", screenId: "ARL-AUTO-005", icon: FlaskConical },
      ],
    },
    {
      label: "Operate",
      items: [
        { label: "Run History", screenId: "ARL-AUTO-006", icon: History },
        { label: "Schedules & Queues", screenId: "ARL-AUTO-008", icon: CalendarClock },
        { label: "Exceptions", screenId: "ARL-AUTO-009", icon: AlertOctagon },
      ],
    },
  ],

  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-AUTO-001": {
      id: "ARL-AUTO-001",
      subtitle: () => "Nothing runs by itself in this browser. Every run is started by hand and recorded with its trace.",
      inspectorTitle: "Automation",
      inspector: (context) => <WorkflowInspector context={context} />,
      tabs: (["All", "Active", "Draft", "Paused", "Failed"] as LibraryTab[]).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AutomationLibrary context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create", label: "Create an automation", placement: "primary", run: (context) => context.openOverlay("Create workflow") },
        { id: "duplicate", label: "Duplicate", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("duplicate copy") },
        { id: "activate", label: "Activation review", placement: "secondary", capability: "run_automation", guard: needsSelection, run: (context) => context.openOverlay("activation review") },
        {
          id: "pause", label: "Pause", placement: "overflow", capability: "run_automation",
          guard: needsSelection,
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const record = await getRecordInOrg(context.org.id, id);
            if (!record) { context.toast("Not paused", "That automation is not on record in this workspace.", "blocked"); return; }
            if (record.status === "paused") { context.toast("Already paused", `${record.title} already reads paused.`, "info"); return; }
            const saved = await context.mutate.patch(id, { status: "paused" }, { expectRevision: record.revision, event: "Automation paused from the library" });
            if (!saved) return;
            context.toast("Paused", `${record.title} will not start a new run.`);
          },
        },
        { id: "archive", label: "Archive", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => context.openOverlay("archive") },
      ],
      overlays: [
        { id: "Workflow quick view", kind: "drawer", title: "Automation", width: OVERLAY_WIDTH.form, summary: ({ ...context }) => <WorkflowQuickSummary context={context} />, render: ({ ...context }) => <WorkflowQuickView context={context} /> },
        { id: "activation review", kind: "modal", title: "Activation review", width: OVERLAY_WIDTH.modal, summary: ({ ...context }) => <ActivationSummary context={context} />, capability: "run_automation", presentation: { selectedRecord: true, collection: "workflows", guidance: "Review the workflow graph, blocking errors, warnings and disconnected providers before activating it." }, render: ({ close, ...context }) => <ActivationReview context={context} close={close} /> },
        { id: "archive", kind: "modal", title: "Archive this automation", tone: "danger", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ArchiveWorkflow context={context} close={close} /> },
        { id: "Create workflow", kind: "modal", title: "New automation", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CreateWorkflow context={context} close={close} />, footer: submitFooter("auto-create", "Create automation") },
        { id: "duplicate copy", kind: "modal", title: "Duplicate without grants", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <DuplicateWorkflow context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-AUTO-002": {
      id: "ARL-AUTO-002",
      title: () => "Visual workflow builder",
      record: builderRecordHeader,
      tabs: ["Design", "Parameters", "Test", "History"].map((tab) => ({ id: tab, render: () => null })),
      surface: (context) => <WorkflowBuilder context={context} />,
      actions: [
        { id: "Drag node", label: "Add node", placement: "primary", run: (context) => context.openOverlay("Node picker") },
        { id: "connect", label: "Connect", placement: "secondary", run: (context) => context.openOverlay("branch editor") },
        { id: "configure", label: "Configure a node", placement: "secondary", run: (context) => context.openOverlay("node configuration") },
        {
          id: "validate", label: "Validate", placement: "overflow",
          run: async (context) => {
            const draft = getDraft(context.params.id ?? "");
            if (!draft) { context.toast("Nothing to validate", "Open an automation first.", "blocked"); return; }
            // References are checked against the trigger collection's records,
            // as the builder's own panel does; with none, record.* is unchecked.
            const issues = validateWorkflow(draft.graph, await loadGraphRecords(context.org.id, draft.graph));
            const errors = issues.filter((issue) => issue.severity === "error").length;
            context.toast(
              errors ? `${errors} error${errors === 1 ? "" : "s"}` : "The graph passes",
              errors ? "The validation report lists each one with the node it belongs to." : `${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"} recorded.`,
              errors ? "failed" : "ok",
            );
            context.openOverlay("validation report");
          },
        },
        {
          id: "save", label: "Save graph", placement: "overflow",
          guard: (context) => {
            const draft = getDraft(context.params.id ?? "");
            if (!draft) return "Open an automation first";
            return draft.dirty ? undefined : "No unsaved change";
          },
          run: async (context) => {
            const draft = getDraft(context.params.id ?? "");
            if (!draft) return;
            const saved = await context.mutate.patch(draft.workflowId, { body: draft.graph }, { event: `Graph saved: ${draft.lastNote}` });
            if (saved) {
              const { markSaved } = await import("./store");
              markSaved(draft.workflowId, saved.revision);
              context.toast("Graph saved", `${draft.graph.nodes.length} nodes are on the record.`);
            }
          },
        },
      ],
      overlays: [
        { id: "Node picker", kind: "modal", title: "Add a node", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <NodePicker context={context} close={close} /> },
        { id: "connector grants", kind: "drawer", title: "Provider grants", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ConnectorGrants context={context} /> },
        { id: "branch editor", kind: "modal", title: "Connections and branches", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <BranchEditor context={context} close={close} /> },
        { id: "node configuration", kind: "modal", title: "Configure a node", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <NodeConfiguration context={context} close={close} /> },
        { id: "validation report", kind: "drawer", title: "Validation", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ValidationReport context={context} /> },
        { id: "Fixture editor", kind: "modal", title: "Dry-run fixture", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <FixtureEditor context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-AUTO-003": {
      id: "ARL-AUTO-003",
      subtitle: () => "Counts are evaluated against the records this company holds.",
      tabs: ["Events", "Schedules", "Filters", "Tests"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <TriggerConfiguration context={context} />,
      })),
      actions: [
        { id: "Select trigger", label: "Select trigger", placement: "primary", run: (context) => context.openOverlay("trigger selection") },
        { id: "set timezone", label: "Set the time zone", placement: "secondary", run: (context) => context.openOverlay("schedule recurrence") },
        { id: "test", label: "Record a test delivery", placement: "secondary", run: (context) => context.openOverlay("Webhook setup") },
        {
          id: "activate", label: "Activate", placement: "overflow", capability: "run_automation",
          run: async (context) => {
            const id = context.params.id;
            if (!id) return;
            const record = await getRecordInOrg(context.org.id, id);
            if (!record) {
              context.toast("Activation blocked", "This automation is not on record in this workspace.", "blocked");
              return;
            }
            if (record.status === "active") {
              context.toast("Already active", `${record.title} is already active. Activating it again would change nothing.`, "info");
              return;
            }
            // Validate what the person is looking at: the open draft, or the
            // stored graph when no draft is open. References are checked
            // against the trigger collection's real records.
            const graph = getDraft(id)?.graph ?? readGraph(record);
            const errors = validateWorkflow(graph, await loadGraphRecords(context.org.id, graph)).filter((issue) => issue.severity === "error");
            if (errors.length) {
              context.toast("Activation blocked", `${errors[0].title}. Fix it in the builder's validation panel.`, "blocked");
              return;
            }
            const saved = await context.mutate.patch(id, { status: "active" }, { event: "Automation activated from the trigger screen", expectRevision: record.revision });
            if (!saved) return;
            context.toast("Activated", `${record.title} reads active. Nothing is registered with a scheduler, because none exists in this browser.`);
          },
        },
      ],
      overlays: [
        { id: "Webhook setup", kind: "modal", title: "Inbound webhook", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <WebhookSetup context={context} close={close} /> },
        { id: "schedule recurrence", kind: "modal", title: "Recurrence", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleRecurrence context={context} close={close} /> },
        { id: "sample inspection", kind: "drawer", title: "Sample payload", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SampleInspection context={context} /> },
        { id: "trigger selection", kind: "modal", title: "Select the trigger", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TriggerSelection context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-AUTO-004": {
      id: "ARL-AUTO-004",
      subtitle: () => "A high-impact step is never executed from a dry run.",
      tabs: ["Actions", "AI", "Approval", "Control flow"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <ActionNodes context={context} />,
      })),
      actions: [
        { id: "Map fields", label: "Map fields", placement: "primary", run: (context) => context.openOverlay("Action parameter") },
        { id: "add capability", label: "Capability", placement: "secondary", run: (context) => context.openOverlay("policy simulation") },
        { id: "set retries", label: "Retries", placement: "overflow", run: (context) => context.openOverlay("Action parameter") },
        { id: "inspect permission", label: "Inspect permission", placement: "overflow", run: (context) => context.openOverlay("policy simulation") },
      ],
      overlays: [
        { id: "Action parameter", kind: "modal", title: "Action parameters", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ActionParameter context={context} close={close} /> },
        { id: "policy simulation", kind: "modal", title: "What this step is permitted to do", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <PolicySimulation context={context} /> },
        { id: "variable selector", kind: "drawer", title: "Bindings available", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <VariableSelector context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-AUTO-005": {
      id: "ARL-AUTO-005",
      subtitle: () => "A dry run evaluates real records and writes nothing. Assertions are checked against its result.",
      tabs: ["Simulation", "Test runs", "Assertions", "Failures"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <WorkflowTesting context={context} />,
      })),
      actions: [
        { id: "Run dry-run", label: "Run a dry run", placement: "primary", run: (context) => context.openOverlay("run dry run") },
        { id: "inspect", label: "Inspect a step receipt", placement: "secondary", run: (context) => context.openOverlay("simulated receipt") },
        { id: "compare", label: "Compare runs", placement: "overflow", run: (context) => context.openOverlay("run comparison") },
        { id: "approve", label: "Approve the test result", placement: "secondary", capability: "run_automation", run: (context) => context.openOverlay("approve test") },
        { id: "fixture", label: "Edit the fixture", placement: "overflow", run: (context) => context.openOverlay("Fixture editor") },
        { id: "assertions", label: "Add an assertion", placement: "overflow", run: (context) => context.openOverlay("assertion builder") },
      ],
      overlays: [
        { id: "Fixture editor", kind: "modal", title: "Dry-run fixture", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <FixtureEditor context={context} close={close} /> },
        { id: "assertion builder", kind: "modal", title: "Add an assertion", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <AssertionBuilder context={context} close={close} /> },
        { id: "simulated receipt", kind: "drawer", title: "Simulated receipt", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SimulatedReceipt context={context} /> },
        { id: "run comparison", kind: "drawer", title: "Compare two runs", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <RunComparison context={context} /> },
        { id: "run dry run", kind: "modal", title: "Run a dry run", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <RunDryRun context={context} close={close} /> },
        { id: "approve test", kind: "modal", title: "Approve the test result", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ApproveTestResult context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-AUTO-006": {
      id: "ARL-AUTO-006",
      subtitle: () => "A retry is offered only where the first outcome is known.",
      tabs: (["All", "Running", "Failed", "Completed", "Waiting"] as RunTab[]).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <RunHistory context={context} tab={tab} />,
      })),
      actions: [
        { id: "Open trace", label: "Open trace", placement: "primary", guard: needsRun, run: (context) => context.navigate(`/o/${context.org.slug}/auto/runs/${context.selectedId}`) },
        { id: "retry safe step", label: "Retry safely", placement: "secondary", capability: "run_automation", guard: needsRun, run: (context) => context.openOverlay("retry safety check") },
        {
          id: "cancel", label: "Cancel", placement: "overflow",
          guard: (context) => {
            if (!context.selectedId) return "Select a run first";
            return undefined;
          },
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const run = await getRecordInOrg(context.org.id, id);
            if (!run) { context.toast("Not cancelled", "That run is not on record in this workspace.", "blocked"); return; }
            if (!["running", "waiting_approval", "blocked"].includes(run.status)) {
              context.toast("Nothing to cancel", `This run already reads ${run.status.replace(/_/g, " ")}.`, "info");
              return;
            }
            const saved = await context.mutate.patch(id, { status: "cancelled", summary: "Cancelled by hand. The steps already recorded are kept." }, { expectRevision: run.revision, event: "Run cancelled" });
            if (!saved) return;
            context.toast("Cancelled", "The run reads cancelled. Steps already recorded are kept, because they happened.");
          },
        },
        { id: "incident", label: "Raise an exception", placement: "overflow", guard: needsRun, run: (context) => context.openOverlay("incident link") },
      ],
      overlays: [
        { id: "Run inspector", kind: "drawer", title: "Run", width: OVERLAY_WIDTH.record, summary: ({ ...context }) => <RunSummary context={context} />, render: ({ ...context }) => <RunInspector context={context} /> },
        { id: "retry safety check", kind: "modal", title: "Retry safety check", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <RetrySafetyCheck context={context} close={close} /> },
        { id: "incident link", kind: "modal", title: "Raise an exception", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <IncidentLink context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-AUTO-007": {
      id: "ARL-AUTO-007",
      title: () => "Workflow run",
      record: runRecordHeader,
      header: (context) => <RunDetailHeader context={context} />,
      tabs: ["Timeline", "Inputs", "Outputs", "Logs", "Decisions"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <RunDetail context={context} />,
      })),
      actions: [
        { id: "Inspect node", label: "Inspect a node", placement: "primary", run: (context) => context.openOverlay("Node trace") },
        { id: "replay safe path", label: "Replay", placement: "secondary", capability: "run_automation", run: (context) => context.openOverlay("replay confirmation") },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export run") },
        { id: "redaction", label: "What is redacted", placement: "overflow", run: (context) => context.openOverlay("redaction") },
      ],
      overlays: [
        { id: "Node trace", kind: "drawer", title: "Node trace", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <NodeTrace context={context} /> },
        { id: "redaction", kind: "modal", title: "Redaction in this role view", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <RedactionPanel context={context} /> },
        { id: "replay confirmation", kind: "modal", title: "Replay this run", tone: "danger", width: OVERLAY_WIDTH.record, summary: ({ ...context }) => <ReplaySummary context={context} />, render: ({ close, ...context }) => <ReplayConfirmation context={context} close={close} /> },
        { id: "export run", kind: "modal", title: "Export the trace", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <ExportPanel context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-AUTO-008": {
      id: "ARL-AUTO-008",
      subtitle: (context) => `Firings are computed in ${context.org.timezone}. Nothing in this browser wakes up to run them.`,
      tabs: ["Calendar", "Queues", "Limits", "History"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <SchedulesAndQueues context={context} />,
      })),
      actions: [
        { id: "Reschedule", label: "Reschedule", placement: "primary", run: (context) => context.openOverlay("Schedule editor") },
        {
          id: "pause", label: "Pause a schedule", placement: "secondary", capability: "run_automation",
          guard: needsSelection,
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const record = await getRecordInOrg(context.org.id, id);
            if (!record) { context.toast("Not paused", "That automation is not on record in this workspace.", "blocked"); return; }
            if (record.fields.schedulePaused === true) { context.toast("Already paused", `${record.title} has no firing computed already.`, "info"); return; }
            const saved = await context.mutate.patch(id, { fields: { schedulePaused: true } }, { expectRevision: record.revision, event: "Schedule paused" });
            if (!saved) return;
            context.toast("Schedule paused", "No firing is computed for it until it is resumed.");
          },
        },
        { id: "change concurrency", label: "Concurrency", placement: "secondary", run: (context) => context.openOverlay("queue priority") },
        { id: "inspect", label: "Inspect the impact", placement: "overflow", run: (context) => context.openOverlay("impact warning") },
      ],
      overlays: [
        { id: "Schedule editor", kind: "modal", title: "Reschedule", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleEditor context={context} close={close} /> },
        { id: "queue priority", kind: "modal", title: "Queue and concurrency", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <QueuePriority context={context} close={close} /> },
        { id: "impact warning", kind: "drawer", title: "Impact of this schedule", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ImpactWarning context={context} /> },
      ],
    },

    /* ------------------------------ 009 ------------------------------ */
    "ARL-AUTO-009": {
      id: "ARL-AUTO-009",
      subtitle: () => "A provider-caused exception is never shown as a verified fix.",
      tabs: (["New", "Investigating", "Awaiting user", "Resolved"] as ExceptionTab[]).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AutomationExceptions context={context} tab={tab} />,
      })),
      actions: [
        { id: "Assign", label: "Assign", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select an exception first"), run: (context) => context.openOverlay("assign exception") },
        { id: "retry", label: "Retry", placement: "secondary", capability: "run_automation", guard: (context) => (context.selectedId ? undefined : "Select an exception first"), run: (context) => context.openOverlay("retry from exception") },
        { id: "fix connection", label: "Fix the connection", placement: "secondary", run: (context) => context.openOverlay("connector reconnect") },
        { id: "close", label: "Close with a resolution", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an exception first"), run: (context) => context.openOverlay("resolution record") },
      ],
      overlays: [
        { id: "Incident detail", kind: "drawer", title: "Exception", width: OVERLAY_WIDTH.form, summary: ({ ...context }) => <IncidentSummary context={context} />, render: ({ ...context }) => <IncidentDetail context={context} /> },
        { id: "connector reconnect", kind: "modal", title: "Connection", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ConnectorReconnect context={context} close={close} /> },
        { id: "resolution record", kind: "modal", title: "Record a resolution", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ResolutionRecord context={context} close={close} /> },
        { id: "assign exception", kind: "modal", title: "Assign", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <AssignException context={context} close={close} /> },
        { id: "retry from exception", kind: "modal", title: "Retry the automation", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <RetryFromException context={context} close={close} /> },
      ],
    },
  },

  fallback: (context) => (
    <Notice tone="warning" title={`${context.screen.title} is not built yet`}>
      {context.screen.purpose} It is recorded as outstanding for the Automation application rather than shown as a generic page.
    </Notice>
  ),
});

function ExportPanel({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <div className="ds-stack ds-gap-4">
      <p>
        A JSON file of every step with its input, output, attempts and receipt, written in this browser. Receipts are local checksums, not provider
        confirmations, and the file says so.
      </p>
      <ModalActions>
        <OverlayActions
          primary={(
            <Button
              variant="primary"
              onClick={async () => {
                const { db } = await import("@/platform/workspace");
                const run = context.params.id ? await db.records.get(context.params.id) : undefined;
                if (!run || run.organizationId !== context.org.id) {
                  context.toast("Nothing to export", "That run is not on record in this workspace.", "blocked");
                  return;
                }
                exportRun(context, run);
                close();
              }}
            >
              Download the trace
            </Button>
          )}
          secondary={<Button variant="secondary" onClick={() => { context.openOverlay("Node trace"); }}>Read it here instead</Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </div>
  );
}

export { readGraph };
