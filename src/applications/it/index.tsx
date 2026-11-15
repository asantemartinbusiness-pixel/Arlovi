import { Activity, FileText, HardDrive, Server, ShieldAlert, Siren, Wrench } from "lucide-react";
import { Button, Notice, Properties, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { closeFooter, submitFooter } from "@/applications/t6kit/kit";
import {
  BackupOverlay, HealthTestOverlay, IncidentCreate, IncidentDetail, IncidentQueue, LogsAndTracing,
  OperationsHome, RedactionRules, Releases, ReliabilityReports, Remediation, ReportBuilder,
  RestoreConfirmation, SavedFilter, SecurityCentre, ServiceInspector, SystemHealth, TraceWaterfall,
  MonitorRule,
} from "./panels";

/* ====================================================================== *
 * IT — IT Operations & Reliability
 * Health comes from checks that genuinely run in this browser: a storage
 * estimate, an IndexedDB round trip, an indexed query, clock comparison
 * and feature detection. Anything a browser cannot observe is reported as
 * not measurable rather than filled in.
 * ====================================================================== */

function SeverityChange({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="severity-change"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const repo = await import("@/platform/repo");
        const id = context.selectedId ?? context.params.id;
        const record = id ? await repo.getRecord(id) : undefined;
        if (!record) { context.toast("No incident selected", "Choose one on the queue first.", "blocked"); close(); return; }
        await context.mutate.patch(record.id, {
          fields: { ...record.fields, severity: String(data.get("severity") ?? "medium"), severityReason: String(data.get("reason") ?? "") },
        }, { expectRevision: record.revision, event: `Severity of ${record.title} changed to ${String(data.get("severity"))}: ${String(data.get("reason") ?? "no reason given")}` });
        context.toast("Severity changed", "The reason is recorded with the change.");
        close();
      }}
    >
      <Notice tone="info" title="A severity change needs a reason">
        Severity drives who is asked and how fast. Changing it without a reason makes the register impossible to read later.
      </Notice>
      <label className="ds-field-label" htmlFor="severity-select">Severity</label>
      <select id="severity-select" name="severity" className="ds-select" defaultValue="medium">
        {["low", "medium", "high"].map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
      <label className="ds-field-label" htmlFor="severity-reason">Why</label>
      <textarea id="severity-reason" name="reason" className="ds-textarea" rows={3} required />
    </form>
  );
}

function EscalationRules({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Nothing can page anyone from here">
        Escalation means reaching a person on a channel this workspace does not have. Raising severity changes the register and writes an audit entry; it does not send anything.
      </Notice>
      <Properties rows={[
        { label: "On high severity", value: "The incident moves to the top of the queue and is marked" },
        { label: "Notification", value: "Not connected" },
        { label: "On-call rota", value: "Not modelled — it would be a list nobody is paged from" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>See what a provider would add</Button>
    </Stack>
  );
}

function MergeReview({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Two incidents are merged only with evidence">
        A shared description is not evidence. A merge needs the same audit entries, or the same failing check, to explain both. Without that the register keeps them apart, even when they look alike.
      </Notice>
      <Properties rows={[
        { label: "Evidence required", value: "A common audit entry or a common failing check" },
        { label: "Not sufficient", value: "A similar title, a similar time, or a hunch" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Run the checks to gather evidence</Button>
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

function ReleaseGates({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <ul className="t6-steps">
        <li className="t6-step" data-state="done"><span className="t6-step-n">1</span>Model and content checks</li>
        <li className="t6-step" data-state="done"><span className="t6-step-n">2</span>Accessibility and link checks</li>
        <li className="t6-step" data-state="current"><span className="t6-step-n">3</span>A person approves</li>
        <li className="t6-step" data-state="blocked"><span className="t6-step-n">4</span>Host or runtime</li>
      </ul>
      <Notice tone="warning" title="A failing gate blocks promotion; it is not a warning to click past">
        The publish review in the websites application and the release review in the app builder both refuse while a check is failing. That is the same rule, applied in the two places it matters.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites`)}>Open the sites</Button>
    </Stack>
  );
}

function RollbackConfirmation({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="A rollback restores a record, not a server">
        Nothing is serving, so rolling back means writing an earlier revision of a record back over the current one. Every record keeps up to twenty-five revisions.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Take a backup first</Button>
    </Stack>
  );
}

function SessionRevoke({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is no session to revoke">
        No account system issued one. The workspace is open to anything that can open this browser profile, and saying otherwise would be the most dangerous sentence in the product.
      </Notice>
      <Properties rows={[
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
      <Properties rows={[
        { label: "Current role view", value: <span className="ds-num">{context.role}</span> },
        { label: "Enforced by", value: "This interface" },
        { label: "Not enforced by", value: "Any server" },
      ]} />
    </Stack>
  );
}

function IncidentComparison({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Comparison needs two incidents with recorded causes">
        Where a cause was not written down, the comparison says so rather than inferring one from the title.
      </Notice>
      <Button variant="secondary" onClick={() => context.setTab("Root causes")}>Open the recorded causes</Button>
    </Stack>
  );
}

function ProposalPanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="A structural proposal needs a cause that repeats">
        One incident is an event. The same cause twice is a pattern worth fixing. The root causes tab counts them, and says plainly when the sample is too small to act on.
      </Notice>
      <Button variant="secondary" onClick={() => context.setTab("Root causes")}>See the counts</Button>
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
        { id: "open issue", label: "Open an incident", placement: "secondary", run: (context) => context.openOverlay("incident create") },
        { id: "Inspect service", label: "Inspect a group", placement: "overflow", run: (context) => context.openOverlay("Service inspector") },
        { id: "acknowledge", label: "Full diagnostics", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/it/health`) },
      ],
      overlays: [
        { id: "Service inspector", kind: "drawer", title: "Checks", width: 600, render: ({ ...context }) => <ServiceInspector context={context} /> },
        { id: "incident create", kind: "modal", title: "Open an incident", width: 620, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        { id: "health test", kind: "modal", title: "Health checks", width: 620, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
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
        { id: "assign", label: "Open an incident", placement: "primary", run: (context) => context.openOverlay("Incident detail") },
        {
          id: "escalate", label: "Change severity", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select an incident first"),
          run: (context) => context.openOverlay("severity change"),
        },
        { id: "merge", label: "Merge", placement: "overflow", run: (context) => context.openOverlay("merge review") },
        { id: "page owner", label: "Escalation rules", placement: "overflow", run: (context) => context.openOverlay("escalation rules") },
        {
          id: "resolve", label: "Resolve", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select an incident first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/it/incidents/${context.selectedId}?tab=Remediation`),
        },
      ],
      overlays: [
        { id: "Incident detail", kind: "modal", title: "Open an incident", width: 620, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        { id: "severity change", kind: "modal", title: "Change severity", width: 520, render: ({ close, ...context }) => <SeverityChange context={context} close={close} />, footer: submitFooter("severity-change", "Change severity") },
        { id: "escalation rules", kind: "drawer", title: "Escalation", width: 500, render: ({ ...context }) => <EscalationRules context={context} /> },
        { id: "merge review", kind: "modal", title: "Merging incidents", width: 540, render: ({ ...context }) => <MergeReview context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-IT-003": {
      id: "ARL-IT-003",
      title: () => "Incident",
      subtitle: () => "Timeline, evidence and a resolution gated on a real check.",
      tabs: (["Overview", "Timeline", "Evidence", "Remediation", "Postmortem"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <IncidentDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Acknowledge", label: "Take it", placement: "primary", run: async (context) => {
          const repo = await import("@/platform/repo");
          const record = context.params.id ? await repo.getRecord(context.params.id) : undefined;
          if (!record) return;
          await context.mutate.patch(record.id, { status: "investigating", fields: { ...record.fields, owner: context.actor } }, { expectRevision: record.revision, event: `${context.actor} took ${record.title}` });
          context.toast("Taken", `${record.title} is assigned to you and marked investigating.`);
        } },
        { id: "approve repair", label: "Remediation", placement: "secondary", run: (context) => context.setTab("Remediation") },
        { id: "assign", label: "Severity", placement: "overflow", run: (context) => context.openOverlay("severity change") },
        { id: "close", label: "Add a note", placement: "overflow", run: (context) => context.openOverlay("mitigation note") },
      ],
      overlays: [
        { id: "Remediation approval", kind: "drawer", title: "Remediation", width: 620, render: ({ ...context }) => <IncidentDetail context={context} lens="Remediation" /> },
        { id: "affected work", kind: "drawer", title: "Evidence", width: 620, render: ({ ...context }) => <IncidentDetail context={context} lens="Evidence" /> },
        { id: "mitigation note", kind: "modal", title: "Add a note", width: 520, render: ({ close, ...context }) => <MitigationNote context={context} close={close} />, footer: submitFooter("mitigation-note", "Record the note") },
        { id: "severity change", kind: "modal", title: "Change severity", width: 520, render: ({ close, ...context }) => <SeverityChange context={context} close={close} />, footer: submitFooter("severity-change", "Change severity") },
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
        { id: "Drill down", label: "Run the checks", placement: "primary", run: (context) => { context.setTab("Services"); context.openOverlay("health test"); } },
        { id: "export", label: "Backup and restore", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("Backup and restore") },
        { id: "add monitor", label: "Monitor rule", placement: "overflow", run: (context) => context.openOverlay("monitor rule") },
        { id: "alert threshold", label: "Service detail", placement: "overflow", run: (context) => context.openOverlay("Service health detail") },
      ],
      overlays: [
        { id: "Service health detail", kind: "drawer", title: "Checks", width: 620, render: ({ ...context }) => <ServiceInspector context={context} /> },
        { id: "monitor rule", kind: "modal", title: "Monitor", width: 540, render: ({ ...context }) => <MonitorRule context={context} />, footer: closeFooter() },
        { id: "Backup and restore", kind: "drawer", title: "Backup and restore", width: 720, render: ({ ...context }) => <BackupOverlay context={context} /> },
        { id: "Restore confirmation", kind: "modal", title: "Replace the workspace", tone: "danger", width: 560, blocking: true, render: ({ close, ...context }) => <RestoreConfirmation context={context} close={close} /> },
        { id: "health test", kind: "modal", title: "Health checks", width: 620, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
        {
          id: "scale request", kind: "modal", title: "Scaling", width: 520,
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
        { id: "Filter", label: "Saved filters", placement: "primary", run: (context) => context.openOverlay("saved filter") },
        { id: "inspect", label: "Inspect an entry", placement: "secondary", run: (context) => context.openOverlay("Trace waterfall") },
        { id: "bookmark", label: "Redaction rules", placement: "overflow", run: (context) => context.openOverlay("redaction rules") },
        { id: "share authorized", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.setTab("Logs") },
      ],
      overlays: [
        { id: "Trace waterfall", kind: "drawer", title: "Entry", width: 560, render: ({ ...context }) => <TraceWaterfall context={context} /> },
        { id: "redaction rules", kind: "modal", title: "Redaction", width: 600, render: () => <RedactionRules />, footer: closeFooter() },
        { id: "saved filter", kind: "modal", title: "Saved filter", width: 480, render: ({ ...context }) => <SavedFilter context={context} />, footer: closeFooter() },
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
        { id: "Test runbook", label: "Run the verification runbook", placement: "primary", run: (context) => context.setTab("Runbooks") },
        { id: "approve", label: "Proposals", placement: "secondary", run: (context) => context.setTab("Proposals") },
        { id: "execute", label: "Runbook detail", placement: "overflow", run: (context) => context.openOverlay("Runbook editor") },
        { id: "pause", label: "Failures", placement: "overflow", run: (context) => context.setTab("Failures") },
      ],
      overlays: [
        {
          id: "Runbook editor", kind: "drawer", title: "Runbook", width: 560,
          render: ({ ...context }) => (
            <Stack gap={3}>
              <Notice tone="warning" title="A runbook step is allowed only if it is reversible">
                Reading storage, writing a backup and re-running a query all qualify. Reconnecting a provider and rotating a credential do not, and are marked as needing a person.
              </Notice>
              <Button variant="secondary" onClick={() => context.setTab("Runbooks")}>Back to the runbooks</Button>
            </Stack>
          ),
        },
        {
          id: "remediation impact", kind: "modal", title: "Impact", width: 540,
          render: () => (
            <Notice tone="info" title="Nothing here changes a system outside this browser">
              The impact of every allowed step is confined to this workspace, which is why they can run without an approval queue. The steps that would reach outside are blocked instead.
            </Notice>
          ),
          footer: closeFooter(),
        },
        { id: "verify result", kind: "modal", title: "Verify", width: 620, render: ({ ...context }) => <HealthTestOverlay context={context} />, footer: closeFooter() },
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
        { id: "Approve release", label: "Release gates", placement: "primary", run: (context) => context.openOverlay("release gates") },
        { id: "test", label: "Run the checks", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/it/health`) },
        { id: "deploy", label: "What is waiting", placement: "overflow", run: (context) => context.setTab("Production") },
        { id: "rollback", label: "Rollback", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("rollback confirmation") },
      ],
      overlays: [
        { id: "Diff review", kind: "drawer", title: "Release", width: 560, render: ({ ...context }) => <ReportBuilder context={context} /> },
        { id: "release gates", kind: "modal", title: "Release gates", width: 560, render: ({ ...context }) => <ReleaseGates context={context} />, footer: closeFooter() },
        { id: "rollback confirmation", kind: "modal", title: "Rollback", tone: "danger", width: 520, render: ({ ...context }) => <RollbackConfirmation context={context} />, footer: closeFooter() },
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
        { id: "Investigate", label: "Audit trail", placement: "primary", run: (context) => context.setTab("Audit") },
        { id: "revoke", label: "Sessions", placement: "secondary", run: (context) => context.openOverlay("session revoke") },
        { id: "isolate", label: "Policy simulation", placement: "overflow", run: (context) => context.openOverlay("policy simulation") },
        { id: "export", label: "Export the audit", placement: "overflow", capability: "export_data", run: (context) => context.setTab("Audit") },
      ],
      overlays: [
        { id: "Security incident", kind: "modal", title: "Open an incident", width: 620, render: ({ close, ...context }) => <IncidentCreate context={context} close={close} />, footer: submitFooter("incident-create", "Open the incident") },
        { id: "session revoke", kind: "modal", title: "Sessions", width: 520, render: ({ ...context }) => <SessionRevoke context={context} />, footer: closeFooter() },
        { id: "policy simulation", kind: "drawer", title: "Policy", width: 500, render: ({ ...context }) => <PolicySimulation context={context} /> },
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
        { id: "Generate", label: "Build a report", placement: "primary", run: (context) => context.openOverlay("Report builder") },
        { id: "compare", label: "Compare incidents", placement: "secondary", run: (context) => context.openOverlay("incident comparison") },
        { id: "propose remediation", label: "Propose a fix", placement: "overflow", run: (context) => context.openOverlay("proposal") },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("Report builder") },
      ],
      overlays: [
        { id: "Report builder", kind: "drawer", title: "Report", width: 560, render: ({ ...context }) => <ReportBuilder context={context} /> },
        { id: "incident comparison", kind: "modal", title: "Comparison", width: 520, render: ({ ...context }) => <IncidentComparison context={context} />, footer: closeFooter() },
        { id: "proposal", kind: "modal", title: "Proposal", width: 520, render: ({ ...context }) => <ProposalPanel context={context} />, footer: closeFooter() },
      ],
    },
  },
});
