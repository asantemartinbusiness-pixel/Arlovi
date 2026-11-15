import { useState } from "react";
import { Siren } from "lucide-react";
import { Button, Empty, Field, Notice, Pill, Properties, Row, Select, Stack } from "@/design-system";
import type { Audit, Rec } from "@/domain/types";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { actOverlay, peopleOptions, redact, type ActInput } from "@/applications/t6kit/act";
import { downloadCsv } from "@/applications/t6kit/kit";
import { buildBackup, runAllChecks, summarise, type CheckResult } from "./diagnostics";
import { useItUi } from "./state";

/* ====================================================================== *
 * IT contract actions that change the register.
 * Every incident write passes expectRevision. Resolution and release
 * promotion read the diagnostics of this session; nothing is assumed.
 * ====================================================================== */

const kind = (record: Rec) => String(record.fields.kind ?? "incident");
const isIncident = (record: Rec) => kind(record) === "incident";
const isOpenIncident = (record: Rec) => isIncident(record) && !["resolved", "closed", "merged"].includes(record.status);
const isRelease = (record: Rec) => kind(record) === "release";
const nowIso = (context: ScreenContext) => context.now.toISOString();

/** Run the same diagnostics the health screen runs, outside a component. */
export async function runDiagnosticsNow(context: ScreenContext): Promise<{ pass: number; warn: number; fail: number; unavailable: number }> {
  const ui = useItUi.getState();
  ui.setRunning(true);
  try {
    const repo = await import("@/platform/repo");
    const events = await repo.listEvents(context.org.id, 400);
    const payload = await runAllChecks(context.org.id, context.org.name, context.now, events, ui.sessionErrors);
    useItUi.getState().setResults(payload);
    const totals = summarise(payload.results);
    await context.mutate.log(
      `Diagnostics run: ${totals.pass} passed, ${totals.warn} to review, ${totals.fail} failed, ${totals.unavailable} could not be measured in a browser.`,
      { type: "diagnostic" },
    );
    return totals;
  } finally {
    useItUi.getState().setRunning(false);
  }
}

function verifiedSince(record: Rec | undefined): boolean {
  const ranAt = useItUi.getState().ranAt;
  return Boolean(record && ranAt && ranAt > (record.at ?? record.createdAt));
}

const useWatchDiagnostics = () => useItUi((state) => `${state.ranAt}|${state.running}`);

function IncidentFacts({ record }: ActInput) {
  if (!record) return null;
  return (
    <Properties rows={[
      { label: "State", value: <Pill tone="info" dot>{record.status.replace(/_/g, " ")}</Pill> },
      { label: "Severity", value: String(record.fields.severity ?? "medium") },
      { label: "Owner", value: String(record.fields.owner ?? record.ownerName) },
      { label: "Origin", value: String(record.fields.origin ?? "ours") },
    ]} />
  );
}

function DiagnosticsGate({ record, context }: ActInput) {
  const ui = useItUi();
  const verified = Boolean(record && ui.ranAt && ui.ranAt > (record.at ?? record.createdAt));
  return (
    <Stack gap={2}>
      <Properties rows={[
        { label: "Opened", value: record ? <span className="ds-num">{context.dateTime(record.at ?? record.createdAt)}</span> : "—" },
        { label: "Last diagnostics run", value: ui.ranAt ? <span className="ds-num">{context.dateTime(ui.ranAt)}</span> : "Not in this session" },
        { label: "Verified since opening", value: verified ? <Pill tone="success">yes</Pill> : <Pill tone="warning">no</Pill> },
      ]} />
      <Button size="sm" variant="secondary" busy={ui.running} onClick={() => void runDiagnosticsNow(context)}>Run the diagnostics now</Button>
    </Stack>
  );
}

/* ------------------------------ Incidents ------------------------------ */

export const assignIncident = actOverlay({
  id: "assign incident",
  title: "Assign an incident",
  collection: "incidents",
  noun: "incident",
  candidates: (rows) => rows.filter(isOpenIncident),
  consequence: ({ record }) => `${record ? record.title : "The incident"} gets a named owner. The owner is who the queue shows and who a later reader asks; nothing is sent to them.`,
  Details: IncidentFacts,
  fields: ({ record, people }) => [
    { name: "owner", label: "Owner", kind: "select", options: peopleOptions(people), initial: String(record?.fields.owner ?? "") },
  ],
  submit: "Assign",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      ownerName: values.owner,
      fields: { ...record.fields, owner: values.owner, assignedBy: context.actor, assignedAt: nowIso(context) },
    }, { expectRevision: record.revision, event: `${record.title} assigned to ${values.owner} by ${context.actor}` });
    return saved ? `${values.owner} now owns ${record.title}.` : undefined;
  },
});

export const acknowledgeIncident = actOverlay({
  id: "acknowledge incident",
  title: "Acknowledge an incident",
  collection: "incidents",
  noun: "open incident",
  candidates: (rows) => rows.filter((record) => isIncident(record) && record.status === "open"),
  consequence: () => "Acknowledging records that a person has seen it and is looking. It moves to investigating; it does not resolve anything.",
  Details: IncidentFacts,
  fields: () => [{ name: "note", label: "First observation", kind: "textarea", placeholder: "What you can see so far" }],
  submit: "Acknowledge",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      status: "investigating",
      fields: { ...record.fields, acknowledgedBy: context.actor, acknowledgedAt: nowIso(context), ...(values.note ? { acknowledgeNote: values.note } : {}) },
    }, { expectRevision: record.revision, event: `${record.title} acknowledged by ${context.actor}${values.note ? `: ${values.note}` : ""}` });
    return saved ? `${record.title} is acknowledged and under investigation.` : undefined;
  },
});

export const mergeIncidents = actOverlay({
  id: "merge review",
  title: "Merge incidents",
  collection: "incidents",
  noun: "incident to keep",
  width: 620,
  candidates: (rows) => rows.filter(isOpenIncident),
  consequenceTitle: "Merged only with evidence",
  consequence: () => "The duplicate is closed as merged and points at the one you keep; the kept incident records both summaries. Neither record is deleted. A merge is refused unless the evidence you name is actually present on both records.",
  fields: ({ record, records }) => [
    {
      name: "duplicate", label: "Incident to merge into it", kind: "select", required: true,
      options: [{ value: "", label: "Choose…" }, ...records.filter((row) => isOpenIncident(row) && row.id !== record?.id).map((row) => ({ value: row.id, label: row.title }))],
    },
    {
      name: "evidence", label: "Evidence they share", kind: "select",
      options: [
        { value: "connector", label: "The same related connector" },
        { value: "cause", label: "The same recorded cause" },
        { value: "service", label: "The same service, opened within 24 hours" },
      ],
    },
    { name: "note", label: "Why they are one problem", kind: "textarea", required: true },
  ],
  submit: "Merge with evidence",
  apply: async ({ record, records, values, context }) => {
    if (!record) return;
    const duplicate = records.find((row) => row.id === values.duplicate);
    if (!duplicate) throw new Error("Choose the incident to merge.");
    const same = (key: string) => String(record.fields[key] ?? "") !== "" && String(record.fields[key]) === String(duplicate.fields[key] ?? "");
    const hours = Math.abs(new Date(record.at ?? record.createdAt).getTime() - new Date(duplicate.at ?? duplicate.createdAt).getTime()) / 3_600_000;
    const holds = values.evidence === "connector" ? same("connectorId")
      : values.evidence === "cause" ? same("cause")
        : same("service") && hours <= 24;
    if (!holds) {
      throw new Error(values.evidence === "connector"
        ? "The two incidents do not name the same connector, so that is not evidence. They stay separate."
        : values.evidence === "cause" ? "The two incidents do not record the same cause. They stay separate."
          : "They are not on the same service within 24 hours of each other. They stay separate.");
    }
    const mergedFrom = [String(record.fields.mergedFrom ?? ""), duplicate.id].filter(Boolean).join(",");
    const kept = await context.mutate.patch(record.id, {
      summary: `${record.summary}\n\nMerged from ${duplicate.title}: ${duplicate.summary}`,
      fields: { ...record.fields, mergedFrom, mergeEvidence: `${values.evidence}: ${values.note}` },
    }, { expectRevision: record.revision, event: `${duplicate.title} merged into ${record.title} on evidence (${values.evidence}): ${values.note}` });
    if (!kept) return;
    await context.mutate.patch(duplicate.id, {
      status: "merged",
      fields: { ...duplicate.fields, mergedInto: record.id, mergeEvidence: `${values.evidence}: ${values.note}` },
    }, { expectRevision: duplicate.revision, event: `${duplicate.title} closed as merged into ${record.title}` });
    return `${duplicate.title} is merged into ${record.title}. Both records are kept.`;
  },
});

export const resolveIncident = actOverlay({
  id: "resolve incident",
  title: "Resolve an incident",
  collection: "incidents",
  noun: "incident",
  candidates: (rows) => rows.filter(isOpenIncident),
  useWatch: useWatchDiagnostics,
  consequence: () => "The incident is marked resolved with you as the verifier. It can only be resolved after the diagnostics have run since it was opened.",
  Details: DiagnosticsGate,
  blocked: ({ record }) => (verifiedSince(record) ? undefined : "Run the diagnostics after this incident was opened. An incident does not resolve on a belief."),
  fields: () => [{ name: "resolution", label: "What fixed it", kind: "textarea", required: true }],
  submit: "Resolve",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      status: "resolved",
      endAt: nowIso(context),
      fields: { ...record.fields, verifiedBy: context.actor, verifiedRunAt: useItUi.getState().ranAt, resolution: values.resolution },
    }, { expectRevision: record.revision, event: `Incident ${record.title} resolved after a verified check: ${values.resolution}` });
    return saved ? `${record.title} is resolved and carries the check that verified it.` : undefined;
  },
});

export const pageOwner = actOverlay({
  id: "page owner",
  title: "Page the owner",
  collection: "incidents",
  noun: "incident",
  candidates: (rows) => rows.filter(isOpenIncident),
  consequenceTitle: "Nobody will be paged",
  consequence: ({ record }) => `The page for ${String(record?.fields.owner ?? record?.ownerName ?? "the owner")} is recorded on the incident as not sent, with your message. Reaching a phone needs a paging or telephony provider, and none is connected.`,
  Details: IncidentFacts,
  boundary: { id: "telephony", action: "Paging the owner" },
  fields: () => [{ name: "message", label: "Page message", kind: "textarea", required: true, placeholder: "High severity: storage persistence not granted" }],
  submit: "Record the page",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const owner = String(record.fields.owner ?? record.ownerName);
    const saved = await context.mutate.patch(record.id, {
      fields: { ...record.fields, pageRequestedAt: nowIso(context), pageRequestedBy: context.actor, pageState: "not_connected", pageMessage: values.message },
    }, { expectRevision: record.revision, event: `Page to ${owner} recorded, not sent: no paging provider is connected` });
    if (!saved) return;
    await context.mutate.log(`Page for ${record.title} to ${owner} stopped at the telephony boundary. Nothing left this browser.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Recorded, not sent", body: `${owner} was not paged. The page is on the incident as not connected.`, tone: "blocked" };
  },
});

export const approveRepair = actOverlay({
  id: "Remediation approval",
  title: "Approve the repair",
  collection: "incidents",
  noun: "incident",
  width: 620,
  candidates: (rows) => rows.filter(isOpenIncident),
  consequence: () => "Approving records who agreed to which repair. Only reversible, local steps can be approved here; a step that reaches a provider or a credential needs a person outside this workspace.",
  Details: ({ record }) => (
    <Stack gap={2}>
      {record?.fields.repairApprovedBy && <Notice tone="success" title="Already approved">{`Approved by ${String(record.fields.repairApprovedBy)}: ${String(record.fields.repairPlan ?? "")}`}</Notice>}
      <Properties rows={[
        { label: "Re-run the diagnostics", value: <Pill tone="success">allowed</Pill> },
        { label: "Export a backup", value: <Pill tone="success">allowed</Pill> },
        { label: "Re-index a collection", value: <Pill tone="success">allowed</Pill> },
        { label: "Reconnect a provider", value: <Pill tone="warning">needs a person outside this workspace</Pill> },
      ]} />
    </Stack>
  ),
  blocked: ({ record }) => (record?.fields.repairApprovedBy ? `Already approved by ${String(record.fields.repairApprovedBy)}.` : undefined),
  fields: () => [
    { name: "step", label: "Approved step", kind: "select", options: [
      { value: "Re-run the diagnostics", label: "Re-run the diagnostics" },
      { value: "Export a backup", label: "Export a backup" },
      { value: "Re-index a collection", label: "Re-index a collection" },
    ] },
    { name: "plan", label: "Plan and how it will be verified", kind: "textarea", required: true },
  ],
  submit: "Approve the repair",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      status: "mitigating",
      fields: { ...record.fields, repairApprovedBy: context.actor, repairApprovedAt: nowIso(context), repairStep: values.step, repairPlan: values.plan },
    }, { expectRevision: record.revision, event: `Repair approved for ${record.title} by ${context.actor}: ${values.step}` });
    return saved ? `${values.step} is approved and the incident is mitigating. Resolving still needs a verified check.` : undefined;
  },
});

export const closeIncident = actOverlay({
  id: "close incident",
  title: "Close the incident",
  collection: "incidents",
  noun: "incident",
  candidates: (rows) => rows.filter((record) => isIncident(record) && record.status !== "closed" && record.status !== "merged"),
  consequence: () => "Closing ends the incident for good: it leaves the queue and is read from the postmortems. It is only possible once it has been resolved against a verified check.",
  Details: IncidentFacts,
  blocked: ({ record }) => (record && record.status !== "resolved" ? "Resolve it first, against a diagnostics run made after it was opened. An incident cannot close until health is verified." : undefined),
  fields: () => [{ name: "note", label: "Closing note", kind: "textarea", required: true }],
  submit: "Close the incident",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      status: "closed",
      fields: { ...record.fields, closedBy: context.actor, closedAt: nowIso(context), closingNote: values.note },
    }, { expectRevision: record.revision, event: `Incident ${record.title} closed by ${context.actor}: ${values.note}` });
    return saved ? `${record.title} is closed.` : undefined;
  },
});

export function IncidentDetailPanel({ context }: { context: ScreenContext }) {
  const incidents = useCollection("incidents").filter(isIncident);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = incidents.find((row) => row.id === (payload?.id ?? context.selectedId));
  if (!record) {
    return <Empty title="No incident selected" icon={<Siren size={20} />}>Select a row in the queue, then open its detail.</Empty>;
  }
  return (
    <Stack gap={3}>
      <strong>{record.title}</strong>
      <p className="ds-prose">{record.summary}</p>
      <Properties rows={[
        { label: "State", value: <Pill tone="info" dot>{record.status.replace(/_/g, " ")}</Pill> },
        { label: "Severity", value: String(record.fields.severity ?? "medium") },
        { label: "Owner", value: String(record.fields.owner ?? record.ownerName) },
        { label: "Service", value: String(record.fields.service ?? "Workspace") },
        { label: "Origin", value: String(record.fields.origin ?? "ours") },
        { label: "Opened", value: <span className="ds-num">{context.dateTime(record.at ?? record.createdAt)}</span> },
        { label: "Impact", value: String(record.fields.impact ?? "Not recorded") },
        { label: "Paged", value: record.fields.pageRequestedAt ? "Recorded, not sent (no provider)" : "No" },
      ]} />
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onClick={() => context.openOverlay("assign incident", { id: record.id })}>Assign</Button>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/incidents/${record.id}`)}>Open the incident</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ Operations home / health ------------------------------ */

const MONITOR_CHECKS = [
  { value: "storage-quota", label: "Storage used, per cent of quota" },
  { value: "last-error", label: "Uncaught errors in a session" },
  { value: "clock-skew", label: "Clock difference, minutes" },
  { value: "db-query", label: "Indexed query, milliseconds" },
];

export const addMonitor = actOverlay({
  id: "monitor rule",
  title: "Add a monitor",
  consequence: () => "A monitor is a recorded rule: which check to watch and the threshold that should raise it. It is evaluated whenever the diagnostics run in this browser; nothing watches while the tab is closed, and no alert is sent anywhere.",
  boundary: { id: "email.send", action: "Sending an alert" },
  fields: () => [
    { name: "name", label: "Monitor name", required: true, placeholder: "Storage pressure" },
    { name: "check", label: "Check to watch", kind: "select", options: MONITOR_CHECKS },
    { name: "threshold", label: "Raise when the value passes", kind: "number", required: true, initial: "70" },
  ],
  submit: "Add the monitor",
  apply: async ({ values, context }) => {
    const check = MONITOR_CHECKS.find((item) => item.value === values.check);
    const created = await context.mutate.create({
      collection: "incidents",
      title: values.name,
      status: "active",
      summary: `${check?.label ?? values.check} above ${values.threshold}. Evaluated when the diagnostics run in this browser.`,
      at: nowIso(context),
      fields: { kind: "monitor", check: values.check, threshold: Number(values.threshold), channel: "not_connected" },
    }, `Monitor ${values.name} added: ${check?.label ?? values.check} above ${values.threshold}`);
    return `${created.title} is recorded. It is checked when the diagnostics run; no alert channel is connected.`;
  },
});

export const alertThreshold = actOverlay({
  id: "alert threshold",
  title: "Change an alert threshold",
  collection: "incidents",
  noun: "monitor",
  candidates: (rows) => rows.filter((record) => kind(record) === "monitor"),
  optionLabel: (record) => `${record.title} · above ${String(record.fields.threshold ?? "?")}`,
  consequence: ({ record }) => `The threshold of ${record?.title ?? "the monitor"} changes from the next diagnostics run. The previous value stays in the record history.`,
  fields: ({ record }) => [
    { name: "threshold", label: "Raise when the value passes", kind: "number", required: true, initial: String(record?.fields.threshold ?? "") },
    { name: "reason", label: "Why", kind: "textarea", required: true },
  ],
  submit: "Save the threshold",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, {
      summary: record.summary.replace(/above [\d.]+/, `above ${values.threshold}`),
      fields: { ...record.fields, threshold: Number(values.threshold), thresholdReason: values.reason },
    }, { expectRevision: record.revision, event: `Threshold on ${record.title} changed from ${String(record.fields.threshold)} to ${values.threshold}: ${values.reason}` });
    return saved ? `${record.title} now raises above ${values.threshold}.` : undefined;
  },
});

/* ------------------------------ Logs ------------------------------ */

export function SavedFilterForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const events = useEvents(undefined, 400);
  const current = useItUi((state) => state.logFilter);
  const setFilter = useItUi((state) => state.setLogFilter);
  const kinds = [...new Set(events.map((event) => event.type))].sort();
  const actors = [...new Set(events.map((event) => event.actor))].sort();
  const [kindValue, setKind] = useState(current.kind);
  const [actor, setActor] = useState(current.actor);
  const [text, setText] = useState(current.text);
  const matched = events.filter((event) => (!kindValue || event.type === kindValue) && (!actor || event.actor === actor) && (!text || event.message.toLowerCase().includes(text.toLowerCase()))).length;
  return (
    <form
      id="saved-filter"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const name = [kindValue, actor, text].filter(Boolean).join(" · ") || "All entries";
        setFilter({ name, kind: kindValue, actor, text });
        context.setTab("Logs");
        context.toast("Filter applied", `${matched} of ${events.length} entries match ${name}.`);
        close();
      }}
    >
      <Field label="Kind" htmlFor="flt-kind">
        <Select id="flt-kind" value={kindValue} onChange={(event) => setKind(event.target.value)}>
          <option value="">Any kind</option>
          {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Actor" htmlFor="flt-actor">
        <Select id="flt-actor" value={actor} onChange={(event) => setActor(event.target.value)}>
          <option value="">Anyone</option>
          {actors.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Entry contains" htmlFor="flt-text">
        <input id="flt-text" className="ds-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="backup" />
      </Field>
      <Notice tone="info" title={`${matched} of ${events.length} entries match`}>The filter applies to the Logs tab for this session. It is a view, not a record anyone else sees.</Notice>
      {(current.kind || current.actor || current.text) && (
        <Button variant="ghost" onClick={() => { setFilter({ name: "", kind: "", actor: "", text: "" }); close(); }}>Clear the current filter</Button>
      )}
    </form>
  );
}

export const bookmarkOverlay = actOverlay({
  id: "bookmark entry",
  title: "Bookmark a log entry",
  useWatch: () => useEvents(undefined, 60),
  consequence: () => "A bookmark is a record that points at one audit entry, with your note. It appears at the top of the Logs tab for everyone in this workspace.",
  blocked: ({ watched }) => ((watched as Audit[] | undefined)?.length ? undefined : "There is no log entry to bookmark yet."),
  fields: ({ context, watched }) => {
    const events = (watched as Audit[] | undefined) ?? [];
    const payload = context.overlayPayload as { eventId?: string } | undefined;
    return [
      { name: "eventId", label: "Entry", kind: "select", initial: payload?.eventId ?? events[0]?.id, options: events.map((event) => ({ value: event.id, label: `${context.dateTime(event.at)} · ${event.message.slice(0, 70)}` })) },
      { name: "note", label: "Why it matters", kind: "textarea", required: true },
    ];
  },
  submit: "Bookmark it",
  apply: async ({ values, context, watched }) => {
    const events = (watched as Audit[] | undefined) ?? [];
    const event = events.find((item) => item.id === values.eventId) ?? events[0];
    if (!event) throw new Error("There is no log entry to bookmark.");
    await context.mutate.create({
      collection: "logBookmarks",
      title: event.message.slice(0, 90),
      status: "active",
      summary: values.note,
      at: event.at,
      fields: { eventId: event.id, eventType: event.type, eventActor: event.actor },
    }, `Log entry bookmarked: ${event.message.slice(0, 60)}`);
    context.setTab("Logs");
    return "The bookmark is at the top of the Logs tab.";
  },
});

export const shareLog = actOverlay({
  id: "share log",
  title: "Share the log with someone authorised",
  consequence: () => "A redacted copy of the audit log is written to a file in this browser for you to hand to the person who is authorised to read it. Email addresses, phone numbers and anything shaped like a credential are masked. Nothing is sent from here.",
  boundary: { id: "email.send", action: "Sending the log" },
  fields: ({ people }) => [
    { name: "recipient", label: "Authorised reader", kind: "select", options: peopleOptions(people) },
    { name: "kind", label: "Entries to include", kind: "select", options: [
      { value: "", label: "Every kind" }, { value: "export", label: "Exports" }, { value: "capability", label: "Provider attempts" },
      { value: "diagnostic", label: "Diagnostics" }, { value: "privacy", label: "Privacy" }, { value: "update", label: "Record changes" },
    ] },
    { name: "actors", label: "Keep actor names", kind: "checkbox", checked: true },
  ],
  submit: "Write the redacted file",
  apply: async ({ values, context }) => {
    const repo = await import("@/platform/repo");
    const events = (await repo.listEvents(context.org.id, 400)).filter((event) => !values.kind || event.type === values.kind);
    downloadCsv(`${context.org.slug}-audit-log-redacted.csv`, ["at", "actor", "type", "message"],
      events.map((event) => [event.at, values.actors ? event.actor : "[actor redacted]", event.type, redact(event.message)]));
    await context.mutate.log(`Redacted audit log (${events.length} entries) prepared for ${values.recipient}. Written to a local file; nothing was sent.`, { type: "export" });
    return `${events.length} redacted entries written for ${values.recipient}. Hand the file over yourself.`;
  },
});

/* ------------------------------ Remediation ------------------------------ */

const RUNBOOK_OPTIONS = [
  { value: "diagnostics", label: "Verify the workspace (diagnostics)" },
  { value: "backup", label: "Take a backup" },
];

function runbookKey(record: Rec): string {
  const explicit = String(record.fields.runbookId ?? "");
  if (explicit) return explicit;
  return /backup/i.test(record.title) ? "backup" : "diagnostics";
}

export async function executeRunbook(context: ScreenContext, key: string): Promise<string> {
  if (key === "backup") {
    const backup = await buildBackup();
    const { downloadJson } = await import("@/applications/t6kit/kit");
    downloadJson(`${context.org.slug}-workspace-backup.json`, backup);
    await context.mutate.log(`Runbook executed: workspace backup exported, ${backup.counts.records} records and ${backup.counts.events} events.`, { type: "export" });
    return `Backup written: ${backup.counts.records} records and ${backup.counts.events} events.`;
  }
  const totals = await runDiagnosticsNow(context);
  return `Diagnostics: ${totals.pass} passed, ${totals.warn} to review, ${totals.fail} failed.`;
}

export const executeRunbookOverlay = actOverlay({
  id: "execute runbook",
  title: "Execute a runbook",
  collection: "incidents",
  noun: "runbook",
  candidates: (rows) => rows.filter((record) => kind(record) === "runbook"),
  consequence: () => "Only allowlisted runbooks execute here, and each is read-only or reversible: the diagnostics read and write one test row; a backup writes a file. Runbooks that would reach a provider or a credential are not offered.",
  blocked: ({ record }) => (record?.status === "paused" ? `${record.title} is paused. Resume it before executing.` : record && record.fields.allowed === false ? "This runbook needs a person; it is not allowlisted." : undefined),
  submit: "Execute",
  apply: async ({ record, context }) => {
    if (!record) return;
    const outcome = await executeRunbook(context, runbookKey(record));
    await context.mutate.patch(record.id, { fields: { ...record.fields, lastRunAt: nowIso(context), lastRunBy: context.actor, lastOutcome: outcome } }, { expectRevision: record.revision, event: `Runbook ${record.title} executed by ${context.actor}: ${outcome}` });
    context.setTab("Runs");
    return outcome;
  },
});

export const pauseRunbook = actOverlay({
  id: "pause runbook",
  title: "Pause or resume a runbook",
  collection: "incidents",
  noun: "runbook",
  candidates: (rows) => rows.filter((record) => kind(record) === "runbook"),
  optionLabel: (record) => `${record.title} · ${record.status}`,
  consequence: ({ record }) => (record?.status === "paused"
    ? `${record.title} is paused. Resuming lets it be executed again.`
    : `${record?.title ?? "The runbook"} will refuse to execute until it is resumed. Its history is kept.`),
  fields: () => [{ name: "reason", label: "Reason", kind: "textarea", required: true }],
  submit: "Apply",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const next = record.status === "paused" ? "active" : "paused";
    const saved = await context.mutate.patch(record.id, { status: next, fields: { ...record.fields, pauseReason: values.reason, pausedBy: next === "paused" ? context.actor : "" } }, { expectRevision: record.revision, event: `Runbook ${record.title} ${next === "paused" ? "paused" : "resumed"} by ${context.actor}: ${values.reason}` });
    return saved ? `${record.title} is ${next}.` : undefined;
  },
});

export const runbookEditor = actOverlay({
  id: "Runbook editor",
  title: "Runbook",
  kind: "drawer",
  collection: "incidents",
  noun: "runbook",
  candidates: (rows) => rows.filter((record) => kind(record) === "runbook"),
  consequence: () => "The title and steps can be edited. Whether a runbook is allowlisted cannot be changed here: a runbook never widens its own privileges.",
  Details: ({ record }) => <Properties rows={[{ label: "Allowlisted", value: record?.fields.allowed === false ? <Pill tone="warning">no — needs a person</Pill> : <Pill tone="success">yes — reversible and local</Pill> }]} />,
  fields: ({ record }) => [
    { name: "title", label: "Title", required: true, initial: record?.title },
    { name: "summary", label: "Steps", kind: "textarea", required: true, initial: record?.summary },
    { name: "runbookId", label: "Executes", kind: "select", options: RUNBOOK_OPTIONS, initial: record ? runbookKey(record) : "diagnostics" },
  ],
  submit: "Save the runbook",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { title: values.title, summary: values.summary, fields: { ...record.fields, runbookId: values.runbookId } }, { expectRevision: record.revision, event: `Runbook ${values.title} edited` });
    return saved ? `${values.title} is saved.` : undefined;
  },
});

export const approveProposal = actOverlay({
    id: "approve proposal",
    title: "Approve a remediation proposal",
    useWatch: () => useItUi((state) => state.ranAt),
    consequence: () => "Approving records the proposal as an approved remediation on the register, with you as the approver. A proposal exists only because a check failed or needs review; approving it does not run it.",
    blocked: () => {
      const failing = useItUi.getState().results.filter((result) => result.state === "fail" || result.state === "warn");
      return useItUi.getState().results.length === 0 ? "Run the checks first. Nothing is proposed until something has been measured." : failing.length === 0 ? "Every check passed or could not be measured, so there is nothing to approve." : undefined;
    },
    fields: () => [
      { name: "check", label: "Proposal", kind: "select", options: useItUi.getState().results.filter((result) => result.state === "fail" || result.state === "warn").map((result) => ({ value: result.id, label: `${result.label} — ${proposalText(result)}` })) },
      { name: "note", label: "Approval note", kind: "textarea" },
    ],
    submit: "Approve",
    apply: async ({ values, context }) => {
      const result = useItUi.getState().results.find((item) => item.id === values.check);
      if (!result) throw new Error("That check is no longer in the latest run.");
      await context.mutate.create({
        collection: "incidents",
        title: `Remediation: ${result.label}`,
        status: "approved",
        summary: proposalText(result),
        at: nowIso(context),
        fields: { kind: "remediation", checkId: result.id, checkState: result.state, approvedBy: context.actor, approvedAt: nowIso(context), note: values.note },
      }, `Remediation approved by ${context.actor} for ${result.label}`);
      return `Approved. It is listed under approved remediations on the Proposals tab.`;
    },
});

export function proposalText(result: CheckResult): string {
  if (result.id === "storage-quota") return "Export a backup and remove records that are no longer needed.";
  if (result.id === "storage-persisted") return "Ask the browser for persistent storage, and keep exporting backups until it is granted.";
  if (result.id === "db-roundtrip") return "Check that site data is not blocked for this origin, then run the check again.";
  if (result.id === "db-query") return "Count the records; a very large collection may need a narrower view.";
  if (result.id.startsWith("clock")) return "Correct the device clock, or accept the frozen clock if it was set deliberately.";
  if (result.id.startsWith("feature-")) return "Use a browser that provides this feature.";
  if (result.id === "last-error") return "Read the error on the failures tab and open an incident if it recurs.";
  return "No automatic step is proposed; this one needs a person.";
}

/* ------------------------------ Releases ------------------------------ */

function gateRows(record: Rec | undefined): { label: string; ok: boolean; detail: string }[] {
  const ui = useItUi.getState();
  const totals = summarise(ui.results);
  const gates = String(record?.fields.gates ?? "");
  return [
    { label: "Diagnostics ran in this session", ok: Boolean(ui.ranAt), detail: ui.ranAt ? `Ran ${ui.ranAt.slice(0, 16).replace("T", " ")}` : "Not run" },
    { label: "No failing check", ok: Boolean(ui.ranAt) && totals.fail === 0, detail: ui.ranAt ? `${totals.fail} failing` : "Unknown until run" },
    { label: "Functional and security gates recorded clear", ok: Boolean(gates) && !/fail/i.test(gates), detail: gates || "No gate result recorded on the release" },
    { label: "Not already blocked or rolled back", ok: Boolean(record) && !["blocked", "rolled_back"].includes(record!.status), detail: record ? record.status.replace(/_/g, " ") : "—" },
  ];
}

export function ReleaseGatesPanel({ record }: { record?: Rec }) {
  useItUi((state) => state.ranAt);
  const rows = gateRows(record);
  return (
    <ul className="t6-steps">
      {rows.map((row, index) => (
        <li key={row.label} className="t6-step" data-state={row.ok ? "done" : "blocked"}>
          <span className="t6-step-n">{index + 1}</span>{row.label} · {row.detail}
        </li>
      ))}
    </ul>
  );
}

export function ReleaseGatesOverlay({ context }: { context: ScreenContext }) {
  const releases = useCollection("incidents").filter(isRelease);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [id, setId] = useState(payload?.id ?? context.selectedId ?? releases[0]?.id ?? "");
  const record = releases.find((row) => row.id === id) ?? releases[0];
  return (
    <Stack gap={3}>
      <Field label="Release" htmlFor="gate-release">
        <Select id="gate-release" value={record?.id ?? ""} onChange={(event) => setId(event.target.value)}>
          {releases.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <ReleaseGatesPanel record={record} />
      <Notice tone="warning" title="A failing gate blocks promotion; it is not a warning to click past">
        Approving and deploying both refuse while any gate above is not met.
      </Notice>
      <Button size="sm" variant="secondary" onClick={() => void runDiagnosticsNow(context)}>Run the diagnostics</Button>
    </Stack>
  );
}

export const approveRelease = actOverlay({
  id: "approve release",
  title: "Approve a release",
  collection: "incidents",
  noun: "release",
  width: 620,
  useWatch: useWatchDiagnostics,
  candidates: (rows) => rows.filter((record) => isRelease(record) && ["planned", "staging"].includes(record.status)),
  consequence: () => "Approving records you as the person who accepted this release. It is refused while any gate is unmet; it does not deploy.",
  Details: ({ record }) => <ReleaseGatesPanel record={record} />,
  blocked: ({ record }) => {
    const failed = gateRows(record).filter((row) => !row.ok);
    return failed.length ? `Gates not met: ${failed.map((row) => row.label.toLowerCase()).join("; ")}.` : undefined;
  },
  fields: () => [{ name: "note", label: "Approval note", kind: "textarea", required: true }],
  submit: "Approve the release",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "approved", fields: { ...record.fields, approvedBy: context.actor, approvedAt: nowIso(context), approvalNote: values.note } }, { expectRevision: record.revision, event: `Release ${record.title} approved by ${context.actor} with every gate met` });
    return saved ? `${record.title} is approved. Deploying it still stops at the host boundary.` : undefined;
  },
});

export const deployRelease = actOverlay({
  id: "deploy release",
  title: "Deploy a release",
  collection: "incidents",
  noun: "approved release",
  candidates: (rows) => rows.filter((record) => isRelease(record) && record.status === "approved"),
  consequenceTitle: "This stops at the hosting boundary",
  consequence: () => "The deployment is recorded on the release as blocked, because no host or runtime is connected. It is not marked released and is never rewritten as a success.",
  boundary: { id: "site.publish", action: "Deploying a release" },
  blocked: ({ record }) => (record && !record.fields.approvedBy ? "Approve the release first; promotion never follows a failed or skipped gate." : undefined),
  submit: "Record the deployment attempt",
  apply: async ({ record, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "blocked", fields: { ...record.fields, environment: "production", deployAttemptAt: nowIso(context), deployAttemptBy: context.actor, capability: "not_connected" } }, { expectRevision: record.revision, event: `Deployment of ${record.title} stopped at the hosting boundary` });
    if (!saved) return;
    await context.mutate.log(`Deployment of ${record.title} attempted: no host is connected, so nothing was deployed.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    context.setTab("Production");
    return { title: "Not deployed", body: `${record.title} is recorded as blocked at the host boundary.`, tone: "blocked" };
  },
});

export const testRelease = actOverlay({
  id: "test release",
  title: "Test a release",
  collection: "incidents",
  noun: "release",
  candidates: (rows) => rows.filter(isRelease),
  consequence: () => "Runs the workspace diagnostics now and writes the result onto the release, so its gates are judged on a measurement made for it.",
  submit: "Run the checks against it",
  apply: async ({ record, context }) => {
    if (!record) return;
    const totals = await runDiagnosticsNow(context);
    const result = `${totals.pass} passed, ${totals.warn} to review, ${totals.fail} failed`;
    await context.mutate.patch(record.id, { fields: { ...record.fields, testedAt: nowIso(context), testedBy: context.actor, testResult: result } }, { expectRevision: record.revision, event: `Release ${record.title} tested: ${result}` });
    return { body: `${record.title}: ${result}.`, tone: totals.fail ? "blocked" : "ok" };
  },
});

export const rollbackRelease = actOverlay({
  id: "rollback confirmation",
  title: "Roll back a release",
  tone: "danger",
  collection: "incidents",
  noun: "release",
  candidates: (rows) => rows.filter((record) => isRelease(record) && record.status !== "rolled_back"),
  consequence: ({ record }) => `${record?.title ?? "The release"} is marked rolled back and moves to the Rollbacks tab. Nothing is serving, so the rollback is a record of the decision; take a backup first if records will be restored by hand.`,
  fields: () => [{ name: "reason", label: "Why it is rolled back", kind: "textarea", required: true }],
  submit: "Roll back",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "rolled_back", fields: { ...record.fields, rolledBackBy: context.actor, rolledBackAt: nowIso(context), rollbackReason: values.reason } }, { expectRevision: record.revision, event: `Release ${record.title} rolled back by ${context.actor}: ${values.reason}` });
    context.setTab("Rollbacks");
    return saved ? `${record.title} is rolled back.` : undefined;
  },
});

export function ReleaseDiff({ context }: { context: ScreenContext }) {
  const releases = useCollection("incidents").filter(isRelease);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = releases.find((row) => row.id === payload?.id) ?? releases[0];
  if (!record) return <Empty title="No release" icon={<Siren size={20} />} />;
  const keys = [...new Set([...Object.keys(record.fields), ...record.history.flatMap((snapshot) => Object.keys(snapshot.fields))])];
  const previous = record.history[0];
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Release", value: record.title },
        { label: "Revision", value: <span className="ds-num">{String(record.revision)}</span> },
        { label: "Compared with", value: previous ? <span className="ds-num">{context.dateTime(previous.at)}</span> : "No earlier revision" },
      ]} />
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">What changed on this release</caption>
          <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">Now</th></tr></thead>
          <tbody>
            <tr><th scope="row">status</th><td>{previous?.status ?? "—"}</td><td>{record.status}</td></tr>
            {keys.map((key) => {
              const before = previous ? String(previous.fields[key] ?? "") : "";
              const now = String(record.fields[key] ?? "");
              return <tr key={key} data-changed={before !== now ? "true" : undefined}><th scope="row">{key}</th><td>{before || "—"}</td><td>{now || "—"}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

/* ------------------------------ Security ------------------------------ */

export const revokeAccess = actOverlay({
  id: "revoke access",
  title: "Revoke a connector's access",
  tone: "danger",
  collection: "connectors",
  noun: "connector",
  candidates: (rows) => rows.filter((record) => record.status !== "disabled"),
  consequence: ({ record }) => `${record?.title ?? "The connector"} is disabled, any requested scopes are cleared and every queued call against it is refused. No grant exists to invalidate at the provider, so the revocation is recorded here and stated as such.`,
  fields: () => [{ name: "reason", label: "Reason", kind: "textarea", required: true }],
  submit: "Revoke",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "disabled", fields: { ...record.fields, requestedScopes: "", agentOps: "", revokedBy: context.actor, revokedAt: nowIso(context), revokeReason: values.reason } }, { expectRevision: record.revision, event: `Access for ${record.title} revoked by ${context.actor}: ${values.reason}` });
    if (!saved) return;
    await context.mutate.log(`Revocation for ${record.title}: no provider grant existed; local scopes cleared and new calls refused.`, { entityId: record.id, type: "capability", capability: "blocked" });
    return `${record.title} is disabled and holds no requested scope.`;
  },
});

export const isolateConnector = actOverlay({
  id: "isolate",
  title: "Isolate an integration",
  tone: "danger",
  collection: "connectors",
  noun: "integration",
  candidates: (rows) => rows.filter((record) => !record.fields.isolated),
  consequence: ({ record }) => `${record?.title ?? "The integration"} is isolated: disabled, removed from every agent's allowed operations, and marked so nothing re-enables it without a person. An AI employee cannot isolate or release anything on its own; this is recorded as your decision.`,
  fields: () => [{ name: "reason", label: "What was observed", kind: "textarea", required: true }],
  submit: "Isolate it",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "disabled", fields: { ...record.fields, isolated: true, agentOps: "", isolatedBy: context.actor, isolatedAt: nowIso(context), isolateReason: values.reason } }, { expectRevision: record.revision, event: `${record.title} isolated by ${context.actor}: ${values.reason}` });
    return saved ? `${record.title} is isolated and disabled.` : undefined;
  },
});

export async function exportSecurityAudit(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const events = (await repo.listEvents(context.org.id, 400)).filter((event) => ["privacy", "export", "restore", "capability", "delete"].includes(event.type));
  downloadCsv(`${context.org.slug}-security-audit.csv`, ["at", "actor", "type", "message"], events.map((event) => [event.at, event.actor, event.type, redact(event.message)]));
  await context.mutate.log(`Security audit exported: ${events.length} entries, personal detail masked.`, { type: "export" });
  context.toast("Exported", `${events.length} security audit entries written to CSV.`);
}

/* ------------------------------ Reliability reports ------------------------------ */

interface ReportRow { incident: string; severity: string; status: string; opened: string; resolved: string; hours: string; cause: string }

export function reliabilityRows(incidents: Rec[], since?: Date): ReportRow[] {
  return incidents
    .filter((record) => isIncident(record) && (!since || new Date(record.at ?? record.createdAt) >= since))
    .map((record) => ({
      incident: record.title,
      severity: String(record.fields.severity ?? ""),
      status: record.status,
      opened: record.at ?? record.createdAt,
      resolved: record.endAt ?? "",
      hours: record.at && record.endAt ? String(Math.round((new Date(record.endAt).getTime() - new Date(record.at).getTime()) / 3_600_000)) : "",
      cause: String(record.fields.cause ?? "") || "not recorded",
    }));
}

export function downloadReliability(slug: string, rows: ReportRow[], label: string): void {
  downloadCsv(`${slug}-reliability-${label}.csv`, ["incident", "severity", "status", "opened", "resolved", "hours to resolve", "cause"],
    rows.map((row) => [row.incident, row.severity, row.status, row.opened, row.resolved, row.hours, row.cause]));
}

export function ReportBuilderPanel({ context }: { context: ScreenContext }) {
  const incidents = useCollection("incidents");
  const saved = useCollection("reliabilityReports");
  const { org, now } = useWorkspace();
  const [days, setDays] = useState("90");
  const since = days === "all" ? undefined : new Date(now.getTime() - Number(days) * 86_400_000);
  const rows = reliabilityRows(incidents, since);
  const resolved = rows.filter((row) => row.hours !== "");
  const mttr = resolved.length ? Math.round(resolved.reduce((sum, row) => sum + Number(row.hours), 0) / resolved.length) : undefined;
  const causes = rows.reduce<Record<string, number>>((map, row) => ({ ...map, [row.cause]: (map[row.cause] ?? 0) + 1 }), {});
  const label = days === "all" ? "all" : `${days}d`;
  return (
    <Stack gap={3}>
      <Field label="Period" htmlFor="report-period">
        <Select id="report-period" value={days} onChange={(event) => setDays(event.target.value)}>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">Everything recorded</option>
        </Select>
      </Field>
      <Properties rows={[
        { label: "Incidents in the period", value: <span className="ds-num">{String(rows.length)}</span> },
        { label: "Resolved", value: <span className="ds-num">{String(resolved.length)}</span> },
        { label: "Mean time to resolve", value: mttr === undefined ? <Pill tone="warning">no resolved incident</Pill> : <span className="ds-num">{`${mttr} hours`}</span> },
        { label: "Causes", value: Object.entries(causes).map(([cause, count]) => `${cause} (${count})`).join(", ") || "None" },
      ]} />
      <Notice tone="info" title="Every figure is counted from the register">Nothing is modelled or estimated. A cause that was not written down is reported as not recorded.</Notice>
      <Row gap={2} wrap>
        <Button variant="primary" onClick={async () => {
          await context.mutate.create({
            collection: "reliabilityReports",
            title: `Reliability report · ${label} · ${context.date(now)}`,
            status: "generated",
            summary: `${rows.length} incidents, ${resolved.length} resolved${mttr === undefined ? "" : `, mean ${mttr} hours to resolve`}.`,
            at: now.toISOString(),
            fields: { period: label, incidents: rows.length, resolved: resolved.length, mttrHours: mttr ?? "", causes: JSON.stringify(causes) },
          }, `Reliability report generated for ${label}`);
          context.toast("Report generated", `Saved with ${rows.length} incidents counted.`);
        }}>Generate and save</Button>
        <Button variant="secondary" onClick={() => { downloadReliability(org.slug, rows, label); context.toast("Exported", `${rows.length} rows written to CSV.`); }}>Export CSV</Button>
      </Row>
      {saved.length > 0 && (
        <Stack gap={1}>
          <strong>Generated reports</strong>
          {saved.slice(0, 5).map((report) => <Row key={report.id} gap={2}><span className="ds-grow">{report.title}</span><span className="ds-subtle">{report.summary}</span></Row>)}
        </Stack>
      )}
    </Stack>
  );
}

export function IncidentComparisonPanel({ context }: { context: ScreenContext }) {
  const incidents = useCollection("incidents").filter(isIncident);
  const [left, setLeft] = useState(incidents[0]?.id ?? "");
  const [right, setRight] = useState(incidents[1]?.id ?? "");
  const a = incidents.find((row) => row.id === (left || incidents[0]?.id));
  const b = incidents.find((row) => row.id === (right || incidents[1]?.id));
  if (incidents.length < 2) return <Empty title="Comparison needs two incidents" icon={<Siren size={20} />} />;
  const hours = (record?: Rec) => (record?.at && record.endAt ? `${Math.round((new Date(record.endAt).getTime() - new Date(record.at).getTime()) / 3_600_000)} h` : "not resolved");
  const rows: [string, (record?: Rec) => string][] = [
    ["Severity", (record) => String(record?.fields.severity ?? "")],
    ["Service", (record) => String(record?.fields.service ?? "")],
    ["Origin", (record) => String(record?.fields.origin ?? "ours")],
    ["Cause", (record) => String(record?.fields.cause ?? "") || "not recorded"],
    ["State", (record) => record?.status ?? ""],
    ["Time to resolve", hours],
    ["Owner", (record) => String(record?.fields.owner ?? record?.ownerName ?? "")],
  ];
  const sameCause = a && b && String(a.fields.cause ?? "") !== "" && a.fields.cause === b.fields.cause;
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Field label="First" htmlFor="cmp-a"><Select id="cmp-a" value={a?.id ?? ""} onChange={(event) => setLeft(event.target.value)}>{incidents.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
        <Field label="Second" htmlFor="cmp-b"><Select id="cmp-b" value={b?.id ?? ""} onChange={(event) => setRight(event.target.value)}>{incidents.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
      </Row>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">Two incidents side by side</caption>
          <thead><tr><th scope="col">Attribute</th><th scope="col">{a?.title}</th><th scope="col">{b?.title}</th></tr></thead>
          <tbody>{rows.map(([label, read]) => <tr key={label}><th scope="row">{label}</th><td>{read(a)}</td><td>{read(b)}</td></tr>)}</tbody>
        </table>
      </div>
      <Notice tone={sameCause ? "warning" : "info"} title={sameCause ? "Same recorded cause" : "No shared recorded cause"}>
        {sameCause ? "Both incidents record the same cause. That is a pattern worth a structural proposal." : "Where a cause was not written down the comparison says so rather than inferring one from the title."}
      </Notice>
      <Button size="sm" variant="secondary" onClick={() => context.setTab("Root causes")}>Open the recorded causes</Button>
    </Stack>
  );
}

function repeatedCauses(records: Rec[]): [string, number][] {
  const counts = records.filter(isIncident).reduce<Record<string, number>>((map, record) => {
    const cause = String(record.fields.cause ?? "");
    if (cause) map[cause] = (map[cause] ?? 0) + 1;
    return map;
  }, {});
  return Object.entries(counts).filter(([, count]) => count >= 2).sort((x, y) => y[1] - x[1]);
}

export function proposalOverlay(): OverlayDef {
  return actOverlay({
    id: "proposal",
    title: "Propose a structural fix",
    collection: "incidents",
    noun: "incident",
    candidates: (rows) => {
      const causes = repeatedCauses(rows).map(([cause]) => cause);
      return rows.filter((record) => isIncident(record) && causes.includes(String(record.fields.cause ?? "")))
        .filter((record, index, all) => all.findIndex((other) => other.fields.cause === record.fields.cause) === index);
    },
    optionLabel: (record) => `${String(record.fields.cause)} — e.g. ${record.title}`,
    consequence: ({ records }) => {
      const repeated = repeatedCauses(records);
      return repeated.length
        ? `Causes that repeat: ${repeated.map(([cause, count]) => `${cause} (${count})`).join(", ")}. The proposal is recorded on the register for a person to accept; nothing is changed.`
        : "No recorded cause repeats yet. One incident is an event; a structural proposal needs the same cause at least twice.";
    },
    fields: () => [{ name: "proposal", label: "Proposed structural fix", kind: "textarea", required: true }],
    submit: "Record the proposal",
    apply: async ({ record, records, values, context }) => {
      if (!record) return;
      const cause = String(record.fields.cause);
      const count = records.filter((row) => isIncident(row) && row.fields.cause === cause).length;
      await context.mutate.create({
        collection: "incidents",
        title: `Proposal: ${cause}`,
        status: "proposed",
        summary: values.proposal,
        at: nowIso(context),
        fields: { kind: "proposal", cause, occurrences: count, proposedBy: context.actor },
      }, `Structural fix proposed for ${cause} (${count} incidents)`);
      return `Recorded against ${count} incidents with the cause ${cause}.`;
    },
  });
}
