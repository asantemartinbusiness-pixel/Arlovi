import { Activity, FileText, HardDrive, Server, ShieldAlert, Siren, Wrench } from "lucide-react";
import { Button, Field, OVERLAY_WIDTH, KeyValueList, Notice, Select, Stack, TextArea } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { closeFooter, submitFooter } from "@/applications/t6kit/kit";
import { openAct } from "@/applications/t6kit/act";
import {
  IncidentComparisonPanel, IncidentDetailPanel, ReleaseDiff, ReleaseGatesOverlay, ReportBuilderPanel, SavedFilterForm,
  acknowledgeIncident, addMonitor, alertThreshold, approveProposal, approveRelease, approveRepair, assignIncident,
  bookmarkOverlay, closeIncident, deployRelease, downloadReliability, executeRunbookOverlay, exportSecurityAudit,
  isolateConnector, mergeIncidents, pageOwner, pauseRunbook, proposalOverlay, reliabilityRows, resolveIncident,
  revokeAccess, rollbackRelease, runDiagnosticsNow, runbookEditor, shareLog, testRelease,
} from "./actions";
import {
  BackupOverlay, HealthTestOverlay, IncidentCreate, IncidentDetail, IncidentQueue, LogsAndTracing,
  OperationsHome, RedactionRules, Releases, ReliabilityReports, Remediation,
  RestoreConfirmation, SecurityCentre, ServiceInspector, SystemHealth, TraceWaterfall,
} from "./panels";
import { incidentRecordHeader } from "./recordHeads";
import { incidentSummary } from "./overlayHeads";
import { SEVERITIES, withEntry } from "./register";
import { makeEntry } from "./lifecycle";
import { useCollection } from "@/platform/workspace";

/* ====================================================================== *
 * IT — IT Operations & Reliability
 * Health comes from checks that genuinely run in this browser: a storage
 * estimate, an IndexedDB round trip, an indexed query, clock comparison
 * and feature detection. Anything a browser cannot observe is reported as
 * not measurable rather than filled in.
 * ====================================================================== */

function SeverityChange({ context, close }: { context: ScreenContext; close: () => void }) {
  const incidents = useCollection("incidents");
  const id = context.selectedId ?? context.params.id;
  const record = incidents.find((row) => row.id === id);
  // Raising to critical commits people and money; it follows the approval permission of the role view.
  const canEscalate = context.can("approve_mission");
  return (
    <form
      id="severity-change"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (!record) { context.toast("No incident selected", "Choose one on the queue first.", "blocked"); close(); return; }
        const severity = String(data.get("severity") ?? "medium");
        const reason = String(data.get("reason") ?? "").trim();
        if (severity === "critical" && !canEscalate) { context.toast("Needs approval authority", "Raising an incident to critical is limited to roles that can approve.", "blocked"); return; }
        const saved = await context.mutate.patch(record.id, {
          fields: { ...record.fields, severity, severityReason: reason },
          ...withEntry(record, makeEntry(context.actor, "severity", `Severity set to ${severity}: ${reason}`)),
        }, { expectRevision: record.revision, event: `Severity of ${record.title} changed to ${severity}: ${reason || "no reason given"}` });
        if (!saved) return;
        context.toast("Severity changed", "The reason is on the incident timeline.");
        close();
      }}
    >
      <Field label="Severity" htmlFor="severity-select" hint={canEscalate ? undefined : "Critical needs approval authority in your role view."}>
        <Select id="severity-select" name="severity" defaultValue={String(record?.fields.severity ?? "medium")}>
          {SEVERITIES.map((level) => <option key={level} value={level} disabled={level === "critical" && !canEscalate && record?.fields.severity !== "critical"}>{level}</option>)}
        </Select>
      </Field>
      <Field label="Why" htmlFor="severity-reason" hint="Severity decides who is asked and how fast. The reason is what makes the register readable later." required>
        <TextArea id="severity-reason" name="reason" rows={3} required />
      </Field>
    </form>
  );
}

function EscalationRules({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Nothing can page anyone from here">
        Escalation means reaching a person on a channel this workspace does not have. Raising severity changes the register and writes an audit entry; it does not send anything.
      </Notice>
      <KeyValueList items={[
        { label: "On high severity", value: "The incident moves to the top of the queue and is marked" },
        { label: "Notification", value: "Not connected" },
        { label: "On-call rota", value: "Not modelled — it would be a list nobody is paged from" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>See what a provider would add</Button>
    </Stack>
  );
}


function MitigationNote({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="mitigation-note"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await context.mutate.log(String(data.get("note") ?? ""), { entityId: context.params.id, type: "note" });
        context.toast("Note recorded", "It is on the incident timeline.");
        close();
      }}
    >
      <label className="ds-field-label" htmlFor="mitigation-text">What was done, and what it changed</label>
      <textarea id="mitigation-text" name="note" className="ds-textarea" rows={5} required />
      <Notice tone="info">The note joins the timeline with the time and the person, so a later reader can tell what was tried.</Notice>
    </form>
  );
}



function SessionRevoke({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is no session to revoke">
        No account system issued one. The workspace is open to anything that can open this browser profile, and saying otherwise would be the most dangerous sentence in the product.
      </Notice>
      <KeyValueList items={[
        { label: "Sessions issued", value: <span className="ds-num">0</span> },
        { label: "Tokens held", value: <span className="ds-num">0</span> },
        { label: "What would end access", value: "Clearing site data for this origin in the browser" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Export a backup before clearing anything</Button>
    </Stack>
  );
}

function PolicySimulation({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="A simulation shows what the interface would offer">
        Switching the role view changes which applications and actions this interface presents. It does not change what the data layer will return, because there is no server enforcing anything.
      </Notice>
      <KeyValueList items={[
        { label: "Current role view", value: <span className="ds-num">{context.role}</span> },
        { label: "Enforced by", value: "This interface" },
        { label: "Not enforced by", value: "Any server" },
      ]} />
    </Stack>
  );
}



export const itApp = registerApp({
  code: "IT",
  short: "IT Operations",
  name: "IT Operations & Reliability",
  purpose: "Measure what a browser can measure, and say what it cannot",
  icon: Server,
  nav: [
    {
      items: [
        { label: "Operations", screenId: "ARL-IT-001", icon: Server },
        { label: "Incidents", screenId: "ARL-IT-002", icon: Siren },
        { label: "Health & backup", screenId: "ARL-IT-004", icon: HardDrive },
      ],
    },
    {
      label: "Evidence", items: [
        { label: "Logs", screenId: "ARL-IT-005", icon: Activity },
        { label: "Remediation", screenId: "ARL-IT-006", icon: Wrench },
        { label: "Releases", screenId: "ARL-IT-007", icon: FileText },
        { label: "Security", screenId: "ARL-IT-008", icon: ShieldAlert },
        { label: "Reports", screenId: "ARL-IT-009", icon: FileText },
      ],
    },
  ],
  screens: {
    "ARL-IT-001": {
      id: "ARL-IT-001",
      title: () => "IT operations",
      subtitle: (context) => `What is measurable about ${context.org.name} in this browser, and what is not.`,
      tabs: (["Health", "Incidents", "Changes", "Capacity"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <OperationsHome context={context} lens={lens} />,
      })),
      actions: [
        { id: "run check", label: "Run the checks", placement: "primary", run: (context) => { context.setTab("Health"); context.openOverlay("health test"); } },
        { id: "open issue", label: "Open an issue (incident)", placement: "secondary", run: (context) => context.openOverlay("incident create") },
        { id: "Inspect service", label: "Inspect a group", placement: "overflow", run: (context) => context.openOverlay("Service inspector") },
        { id: "acknowledge", label: "Acknowledge an incident", placement: "overflow", run: openAct("acknowledge incident") },
        { id: "full diagnostics", label: "Full diagnostics", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/it/health`) },
      ],
      overlays: [
        acknowledgeIncident,
        { id: "Service inspector", kind: "drawer", title: "Checks", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ServiceInspector context={context} /> },
        { id: "incident create", kind: "modal", title: "Open an incident", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        { id: "health test", kind: "modal", title: "Health checks", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-IT-002": {
      id: "ARL-IT-002",
      title: () => "Incident queue",
      subtitle: () => "An incident closes only after a check has verified the fix.",
      tabs: (["Active", "Awaiting user", "Resolved", "Postmortems"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <IncidentQueue context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Assign", label: "Assign", placement: "primary",
          guard: (context) => (context.selectedId ? undefined : "Select an incident first"),
          run: openAct("assign incident"),
        },
        { id: "open incident", label: "Open an incident", placement: "secondary", run: (context) => context.openOverlay("incident create") },
        {
          id: "escalate", label: "Escalate severity", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select an incident first"),
          run: (context) => context.openOverlay("severity change"),
        },
        { id: "merge", label: "Merge with evidence", placement: "overflow", run: openAct("merge review") },
        { id: "page owner", label: "Page the owner", placement: "overflow", run: openAct("page owner") },
        { id: "escalation rules", label: "Escalation rules", placement: "overflow", run: (context) => context.openOverlay("escalation rules") },
        { id: "incident detail", label: "Incident detail", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an incident first"), run: (context) => context.openOverlay("Incident detail", { id: context.selectedId }) },
        {
          id: "resolve", label: "Resolve", placement: "overflow",
          run: openAct("resolve incident"),
        },
      ],
      overlays: [
        { id: "Incident detail", kind: "drawer", title: "Incident", width: OVERLAY_WIDTH.form, summary: incidentSummary(), render: ({ ...context }) => <IncidentDetailPanel context={context} /> },
        { id: "incident create", kind: "modal", title: "Open an incident", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        assignIncident, pageOwner, resolveIncident,
        { id: "severity change", kind: "modal", title: "Change severity", width: OVERLAY_WIDTH.compact, summary: incidentSummary("Severity"), render: ({ close, ...context }) => <SeverityChange context={context} close={close} />, footer: submitFooter("severity-change", "Change severity") },
        { id: "escalation rules", kind: "drawer", title: "Escalation", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <EscalationRules context={context} /> },
        mergeIncidents,
      ],
    },

    "ARL-IT-003": {
      id: "ARL-IT-003",
      title: () => "Incident",
      record: incidentRecordHeader,
      tabs: (["Overview", "Timeline", "Evidence", "Remediation", "Postmortem"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <IncidentDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Acknowledge", label: "Acknowledge and take it", placement: "primary", run: async (context) => {
          const repo = await import("@/platform/repo");
          const record = context.params.id ? await repo.getRecord(context.params.id) : undefined;
          if (!record) return;
          if (record.fields.acknowledgedAt) { context.toast("Already acknowledged", `${String(record.fields.acknowledgedBy)} acknowledged it.`, "info"); return; }
          await context.mutate.patch(record.id, { status: record.status === "open" ? "investigating" : record.status, ownerName: context.actor, fields: { ...record.fields, owner: context.actor, acknowledgedBy: context.actor, acknowledgedAt: context.now.toISOString() } }, { expectRevision: record.revision, event: `${context.actor} acknowledged and took ${record.title}` });
          context.toast("Acknowledged", `${record.title} is acknowledged, assigned to you and marked investigating.`);
        } },
        { id: "approve repair", label: "Approve the repair", placement: "secondary", capability: "approve_mission", run: openAct("Remediation approval") },
        { id: "assign", label: "Assign", placement: "overflow", run: openAct("assign incident") },
        { id: "close", label: "Close", placement: "overflow", run: openAct("close incident") },
        { id: "add note", label: "Add a note", placement: "overflow", run: (context) => context.openOverlay("mitigation note") },
        { id: "change severity", label: "Change severity", placement: "overflow", run: (context) => context.openOverlay("severity change") },
      ],
      overlays: [
        { ...approveRepair, capability: "approve_mission" }, assignIncident, closeIncident,
        { id: "affected work", kind: "drawer", title: "Evidence", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <IncidentDetail context={context} lens="Evidence" /> },
        { id: "mitigation note", kind: "modal", title: "Add a note", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <MitigationNote context={context} close={close} />, footer: submitFooter("mitigation-note", "Record the note") },
        { id: "severity change", kind: "modal", title: "Change severity", width: OVERLAY_WIDTH.compact, summary: incidentSummary("Severity"), render: ({ close, ...context }) => <SeverityChange context={context} close={close} />, footer: submitFooter("severity-change", "Change severity") },
      ],
    },

    "ARL-IT-004": {
      id: "ARL-IT-004",
      title: () => "System health",
      subtitle: () => "Every figure here was measured by an operation that really ran, or is marked as not measurable.",
      tabs: (["Services", "Workers", "Storage", "Provider status"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SystemHealth context={context} lens={lens} />,
      })),
      actions: [
        { id: "Drill down", label: "Drill into the checks", placement: "primary", run: (context) => context.openOverlay("Service health detail") },
        { id: "run checks", label: "Run the checks", placement: "secondary", run: (context) => { context.setTab("Services"); context.openOverlay("health test"); } },
        { id: "export", label: "Export a backup", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("Backup and restore") },
        { id: "add monitor", label: "Add a monitor", placement: "overflow", run: (context) => context.openOverlay("monitor rule") },
        { id: "alert threshold", label: "Change an alert threshold", placement: "overflow", run: (context) => context.openOverlay("alert threshold") },
      ],
      overlays: [
        { id: "Service health detail", kind: "drawer", title: "Checks", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <ServiceInspector context={context} /> },
        addMonitor, alertThreshold,
        { id: "Backup and restore", kind: "drawer", title: "Backup and restore", width: 720, render: ({ ...context }) => <BackupOverlay context={context} /> },
        { id: "Restore confirmation", kind: "modal", title: "Replace the workspace", tone: "danger", width: OVERLAY_WIDTH.modal, blocking: true, render: ({ close, ...context }) => <RestoreConfirmation context={context} close={close} /> },
        { id: "health test", kind: "modal", title: "Health checks", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
        {
          id: "scale request", kind: "modal", title: "Scaling", width: OVERLAY_WIDTH.form,
          render: () => (
            <Notice tone="warning" title="There is nothing to scale">
              The workspace runs in one tab against one browser database. More capacity would mean a server, which is the same boundary every other screen reports.
            </Notice>
          ),
          footer: closeFooter(),
        },
      ],
    },

    "ARL-IT-005": {
      id: "ARL-IT-005",
      title: () => "Logs & timings",
      subtitle: () => "The audit log, and the durations of operations that were actually timed.",
      tabs: (["Traces", "Logs", "Metrics", "Sampling"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LogsAndTracing context={context} lens={lens} />,
      })),
      actions: [
        { id: "Filter", label: "Filter the log", placement: "primary", run: (context) => context.openOverlay("saved filter") },
        { id: "inspect", label: "Inspect an entry", placement: "secondary", run: (context) => context.openOverlay("Trace waterfall") },
        { id: "bookmark", label: "Bookmark an entry", placement: "overflow", run: (context) => context.openOverlay("bookmark entry") },
        { id: "share authorized", label: "Share with an authorised reader", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("share log") },
        { id: "redaction", label: "Redaction rules", placement: "overflow", run: (context) => context.openOverlay("redaction rules") },
      ],
      overlays: [
        { id: "Trace waterfall", kind: "drawer", title: "Entry", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <TraceWaterfall context={context} /> },
        { id: "redaction rules", kind: "modal", title: "Redaction", width: OVERLAY_WIDTH.modal, render: () => <RedactionRules />, footer: closeFooter() },
        { id: "saved filter", kind: "modal", title: "Filter the log", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <SavedFilterForm context={context} close={close} />, footer: submitFooter("saved-filter", "Apply the filter") },
        bookmarkOverlay, shareLog,
      ],
    },

    "ARL-IT-006": {
      id: "ARL-IT-006",
      title: () => "Remediation",
      subtitle: () => "Allowlisted steps that are read-only or reversible, and nothing that raises its own privileges.",
      tabs: (["Runbooks", "Proposals", "Runs", "Failures"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Remediation context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Test runbook", label: "Test the verification runbook", placement: "primary",
          run: async (context) => {
            const totals = await runDiagnosticsNow(context);
            context.setTab("Runs");
            context.toast("Runbook tested", `${totals.pass} passed, ${totals.warn} to review, ${totals.fail} failed. The run is on the Runs tab.`, totals.fail ? "blocked" : "ok");
          },
        },
        { id: "approve", label: "Approve a proposal", placement: "secondary", run: (context) => context.openOverlay("approve proposal") },
        { id: "execute", label: "Execute a runbook", placement: "overflow", run: (context) => context.openOverlay("execute runbook") },
        { id: "pause", label: "Pause or resume a runbook", placement: "overflow", run: (context) => context.openOverlay("pause runbook") },
        { id: "edit runbook", label: "Edit a runbook", placement: "overflow", run: (context) => context.openOverlay("Runbook editor") },
      ],
      overlays: [
        runbookEditor, approveProposal, executeRunbookOverlay, pauseRunbook,
        {
          id: "remediation impact", kind: "modal", title: "Impact", width: OVERLAY_WIDTH.form,
          render: () => (
            <Notice tone="info" title="Nothing here changes a system outside this browser">
              The impact of every allowed step is confined to this workspace, which is why they can run without an approval queue. The steps that would reach outside are blocked instead.
            </Notice>
          ),
          footer: closeFooter(),
        },
        { id: "verify result", kind: "modal", title: "Verify", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-IT-007": {
      id: "ARL-IT-007",
      title: () => "Release management",
      subtitle: () => "Changes to this workspace, and the gates a promotion would have to pass.",
      tabs: (["Planned", "Staging", "Production", "Rollbacks"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Releases context={context} lens={lens} />,
      })),
      actions: [
        { id: "Approve release", label: "Approve a release", placement: "primary", run: (context) => context.openOverlay("approve release") },
        { id: "test", label: "Test a release", placement: "secondary", run: (context) => context.openOverlay("test release") },
        { id: "deploy", label: "Deploy", placement: "overflow", run: (context) => context.openOverlay("deploy release") },
        { id: "rollback", label: "Roll back", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("rollback confirmation") },
        { id: "gates", label: "Release gates", placement: "overflow", run: (context) => context.openOverlay("release gates") },
      ],
      overlays: [
        { id: "Diff review", kind: "drawer", title: "What changed on the release", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ReleaseDiff context={context} /> },
        { id: "release gates", kind: "modal", title: "Release gates", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ReleaseGatesOverlay context={context} />, footer: closeFooter() },
        rollbackRelease, approveRelease, deployRelease, testRelease,
      ],
    },

    "ARL-IT-008": {
      id: "ARL-IT-008",
      title: () => "Security",
      subtitle: () => "What a browser can observe about access, and the much larger list of what it cannot.",
      tabs: (["Alerts", "Access", "Secrets", "Policy", "Audit"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SecurityCentre context={context} lens={lens} />,
      })),
      actions: [
        { id: "Investigate", label: "Investigate (open a security incident)", placement: "primary", run: (context) => context.openOverlay("Security incident") },
        { id: "revoke", label: "Revoke a connector's access", placement: "secondary", run: (context) => context.openOverlay("revoke access") },
        { id: "isolate", label: "Isolate an integration", placement: "overflow", run: (context) => context.openOverlay("isolate") },
        { id: "export", label: "Export the audit", placement: "overflow", capability: "export_data", run: (context) => exportSecurityAudit(context) },
        { id: "audit trail", label: "Audit trail", placement: "overflow", run: (context) => context.setTab("Audit") },
        { id: "sessions", label: "Sessions", placement: "overflow", run: (context) => context.openOverlay("session revoke") },
        { id: "simulate policy", label: "Policy simulation", placement: "overflow", run: (context) => context.openOverlay("policy simulation") },
      ],
      overlays: [
        { id: "Security incident", kind: "modal", title: "Open an incident", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        { id: "session revoke", kind: "modal", title: "Sessions", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SessionRevoke context={context} />, footer: closeFooter() },
        { id: "policy simulation", kind: "drawer", title: "Policy", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <PolicySimulation context={context} /> },
        revokeAccess, isolateConnector,
      ],
    },

    "ARL-IT-009": {
      id: "ARL-IT-009",
      title: () => "Reliability reports",
      subtitle: () => "Counted from the incident register and from checks that ran. Nothing is modelled.",
      tabs: (["Trends", "Root causes", "Capacity", "Costs"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ReliabilityReports context={context} lens={lens} />,
      })),
      actions: [
        { id: "Generate", label: "Generate a report", placement: "primary", run: (context) => context.openOverlay("Report builder") },
        { id: "compare", label: "Compare incidents", placement: "secondary", run: (context) => context.openOverlay("incident comparison") },
        { id: "propose remediation", label: "Propose a fix", placement: "overflow", run: (context) => context.openOverlay("proposal") },
        {
          id: "export", label: "Export", placement: "overflow", capability: "export_data",
          run: async (context) => {
            const repo = await import("@/platform/repo");
            const rows = reliabilityRows(await repo.listByCollection(context.org.id, "incidents"));
            downloadReliability(context.org.slug, rows, "all");
            await context.mutate.log(`Reliability report exported: ${rows.length} incidents.`, { type: "export" });
            context.toast("Exported", `${rows.length} incidents written to CSV, counted from the register.`);
          },
        },
      ],
      overlays: [
        { id: "Report builder", kind: "drawer", title: "Generate a report", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ReportBuilderPanel context={context} /> },
        { id: "incident comparison", kind: "modal", title: "Compare incidents", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <IncidentComparisonPanel context={context} />, footer: closeFooter() },
        proposalOverlay(),
      ],
    },
  },
});
