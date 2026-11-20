import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Archive, CheckCircle2, Cpu, Server, ShieldAlert, Siren,
} from "lucide-react";
import { BarChart, Button, Card, Checkbox, DataGrid, Empty, FactGrid, Field, Grid, KeyValueList, Meter, Notice, OverlaySection, Pill, Row, Select, Stack, Stat, StatRow, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso, daysBetween, freshness } from "@/platform/clock";
import { CAPABILITY_LABELS, PROVIDER_CAPABILITIES } from "@/platform/capability";
import { persistAll } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import { downloadCsv, downloadJson, downloadFile } from "@/applications/t6kit/kit";
import {
  buildBackup, formatBytes, inspectBackup, runAllChecks, summarise,
  type CheckResult,
} from "./diagnostics";
import { useItUi, watchErrors } from "./state";
import { IncidentLifecycle, TimelineComposer, timelineKindLabel, useVerified } from "./lifecycle";
import { SEVERITY_TONE, STAGE_LABELS, readTimeline, stageOf } from "./register";
import { AccessReviews, AssetRegister, ChangeRequests } from "./registers";

/* ---------------------------------------------------------------- *
 * Shared
 * ---------------------------------------------------------------- */


export function useDiagnostics(context: ScreenContext) {
  const ui = useItUi();
  const events = useEvents();
  const { org, now } = useWorkspace();

  useEffect(() => { watchErrors(); }, []);

  async function run(): Promise<void> {
    ui.setRunning(true);
    try {
      const payload = await runAllChecks(org.id, org.name, now, events, ui.sessionErrors);
      ui.setResults(payload);
      const totals = summarise(payload.results);
      await context.mutate.log(
        `Diagnostics run: ${totals.pass} passed, ${totals.warn} to review, ${totals.fail} failed, ${totals.unavailable} could not be measured in a browser.`,
        { type: "diagnostic" },
      );
    } finally {
      ui.setRunning(false);
    }
  }

  return { ui, run };
}

export function CheckRow({ result }: { result: CheckResult }) {
  return (
    <div className="t6-check" data-state={result.state === "unavailable" ? "warn" : result.state}>
      <span className="t6-check-dot" aria-hidden="true" />
      <div>
        <Row gap={2} wrap><strong className="ds-grow">{result.label}</strong></Row>
        <p className="ds-num" style={{ fontSize: "var(--text-sm)", margin: "2px 0" }}>{result.value}</p>
        <p className="ds-subtle">{result.detail}</p>
        <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Method: {result.method}{result.tookMs !== undefined ? ` · ${result.tookMs} ms` : ""}</p>
      </div>
      <Pill tone={result.state === "pass" ? "success" : result.state === "warn" ? "warning" : result.state === "fail" ? "danger" : "neutral"}>
        {result.state === "unavailable" ? "not measurable" : result.state}
      </Pill>
    </div>
  );
}

/* ================================================================ *
 * ARL-IT-001 — IT Operations Home
 * ================================================================ */

export function OperationsHome({ context, lens }: { context: ScreenContext; lens: "Health" | "Incidents" | "Changes" | "Capacity" }) {
  const { ui, run } = useDiagnostics(context);
  const incidents = useCollection("incidents");
  const connectors = useCollection("connectors");
  const events = useEvents();
  const { org, now } = useWorkspace();

  const open = incidents.filter((record) => record.status === "open" || record.status === "investigating");
  const totals = summarise(ui.results);
  const storage = ui.storage;

  if (lens === "Incidents") {
    return <IncidentQueue context={context} lens="Active" />;
  }

  if (lens === "Changes") {
    const changes = events.filter((event) => ["update", "create", "delete"].includes(event.type)).slice(0, 60);
    return (
      <Stack gap={4}>
        <ChangeRequests context={context} />
        <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Record changes in this workspace</h2>
        <Notice tone="info" title="A change here is a write to this workspace">
          There is no deployment pipeline. Every row below is an audit entry for a record that changed, which is the only change log that exists.
        </Notice>
        {changes.length === 0 ? <Empty title="No changes recorded" icon={<Activity size={20} />} /> : (
          <DataGrid
            rows={changes}
            rowId={(row) => row.id}
            label="Recent changes"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
              { key: "actor", header: "Who", cell: (row) => row.actor },
              { key: "type", header: "Kind", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
              { key: "message", header: "Change", cell: (row) => row.message, filterValue: (row) => row.message },
              { key: "screen", header: "From", cell: (row) => <span className="ds-num">{row.screenId ?? "—"}</span> },
            ]}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Capacity") {
    const share = storage?.quotaBytes ? (storage.usageBytes ?? 0) / storage.quotaBytes : 0;
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat
            label="Storage used"
            value={storage?.supported ? formatBytes(storage.usageBytes) : "Unavailable"}
            prov={storage?.supported ? "posted" : undefined}
            unavailable={!storage?.supported}
            meta={storage?.supported ? `of ${formatBytes(storage.quotaBytes)} the browser allows` : "navigator.storage.estimate is unavailable"}
          />
          <Stat label="Records" value={ui.counts ? String(ui.counts.records) : "Not counted"} prov={ui.counts ? "posted" : undefined} unavailable={!ui.counts} meta={ui.counts ? `${ui.counts.orgRecords} in ${org.shortName}` : "Run the checks to count them"} />
          <Stat label="Audit events" value={ui.counts ? String(ui.counts.events) : "Not counted"} prov={ui.counts ? "posted" : undefined} unavailable={!ui.counts} meta="Rows in the events table" />
          <Stat label="Worker capacity" value="Unavailable" unavailable meta="There are no workers; nothing runs outside this tab" />
        </StatRow>
        {!ui.counts && (
          <Notice tone="info" title="Nothing has been measured yet in this session"
            actions={<Button size="sm" variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks</Button>}>
            The figures above stay blank until a real measurement is taken.
          </Notice>
        )}
        {storage?.supported && (
          <Card eyebrow="STORAGE" prov="posted" title="Quota" subtitle="Reported by the browser for this origin">
            <Stack gap={3}>
              <Meter value={storage.usageBytes ?? 0} max={storage.quotaBytes ?? 1} label="Storage used" tone={share > 0.9 ? "danger" : share > 0.7 ? "warning" : "success"} />
              <KeyValueList items={[
                { label: "Used", value: <span className="ds-num">{formatBytes(storage.usageBytes)}</span> },
                { label: "Quota", value: <span className="ds-num">{formatBytes(storage.quotaBytes)}</span> },
                { label: "Share", value: <span className="ds-num">{`${(share * 100).toFixed(2)}%`}</span> },
                { label: "Persistence", value: storage.persisted === undefined ? <Pill tone="neutral">unknown</Pill> : storage.persisted ? <Pill tone="success">granted</Pill> : <Pill tone="warning">not granted</Pill> },
              ]} />
              <Notice tone={storage.persisted ? "info" : "warning"} title={storage.persisted ? "The browser has agreed to keep this" : "The browser may clear this workspace"}>
                {storage.persisted
                  ? "A persistence grant means the workspace survives storage pressure on this device."
                  : "Without a persistence grant, the browser can evict this origin when the device runs short of space. The backup on the health screen is the answer."}
              </Notice>
            </Stack>
          </Card>
        )}
        {ui.counts && (
          <Card eyebrow="RECORDS" prov="posted" title="Records by collection" subtitle={`Counted in ${ui.counts.took} ms for ${org.name}`}>
            <BarChart
              title="Records per collection"
              height={Math.max(200, Math.min(420, ui.counts.byCollection.length * 18))}
              format={(value) => String(Math.round(value))}
              series={[{ name: "Records", points: ui.counts.byCollection.slice(0, 18).map((row) => ({ label: row.collection, value: row.count })) }]}
              footer="Counted from the records table in this browser, not estimated."
            />
          </Card>
        )}
      </Stack>
    );
  }

  const unconnected = PROVIDER_CAPABILITIES.filter((capability) => capability.state === "not_connected").length;
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat
          label="Checks passing"
          value={ui.results.length ? `${totals.pass} of ${ui.results.length}` : "Not run"}
          prov={ui.results.length ? "posted" : undefined}
          unavailable={ui.results.length === 0}
          meta={ui.results.length ? `${totals.fail} failing · ${totals.unavailable} not measurable here` : "Run the checks to measure"}
          onClick={() => context.navigate(`/o/${org.slug}/it/health`)}
        />
        <Stat label="Open incidents" value={String(open.length)} prov="posted" meta={`${incidents.length} on the register`} onClick={() => context.navigate(`/o/${org.slug}/it/incidents`)} />
        <Stat label="Providers connected" value="0" prov="posted" meta={`${unconnected} capabilities, none connected`} onClick={() => context.navigate(`/o/${org.slug}/connect/health`)} />
        <Stat label="Alert load" value="Unavailable" unavailable meta="No alerting system is wired to this workspace" />
      </StatRow>

      <Grid>
        <Card
          span={7}
          eyebrow="SERVICE HEALTH"
          prov={ui.results.length ? "posted" : "unknown"}
          title="What this browser can actually check"
          subtitle={ui.ranAt ? `Last run ${context.dateTime(ui.ranAt)}` : "Not run in this session"}
          footer={<>
            <Button size="sm" variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks</Button>
            <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/it/health`)}>Full diagnostics</Button>
          </>}
        >
          {ui.results.length === 0 ? (
            <Empty title="Nothing measured yet" icon={<Cpu size={20} />}>
              Every figure on this screen comes from a check that ran. Until one does, the panel stays empty rather than showing a reassuring green.
            </Empty>
          ) : (
            <Stack gap={2}>
              {ui.results.filter((result) => result.state === "fail" || result.state === "warn").slice(0, 5).map((result) => <CheckRow key={result.id} result={result} />)}
              {ui.results.every((result) => result.state === "pass" || result.state === "unavailable") && (
                <Notice tone="success" title="Nothing is failing">
                  {totals.pass} checks passed. {totals.unavailable} could not be measured in a browser and are listed as such rather than as passes.
                </Notice>
              )}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="INCIDENTS" prov="human" title="Open now" subtitle={`${open.length} of ${incidents.length}`}>
          {open.length === 0 ? <Empty title="No open incident" icon={<CheckCircle2 size={20} />} /> : (
            <Stack gap={2}>
              {open.slice(0, 5).map((record) => (
                <Row key={record.id} gap={2}>
                  <button type="button" className="ds-record-card ds-grow" onClick={() => context.navigate(`/o/${org.slug}/it/incidents/${record.id}`)}>
                    <Row gap={2}>
                      <span className="ds-grow ds-truncate" style={{ textAlign: "start", fontWeight: 600 }}>{record.title}</span>
                      <Pill tone={SEVERITY_TONE[String(record.fields.severity ?? "medium")] ?? "warning"}>{String(record.fields.severity ?? "medium")}</Pill>
                    </Row>
                    <span className="ds-subtle ds-truncate">{record.summary}</span>
                  </button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={7} eyebrow="THIRD PARTY" prov="unknown" title="Provider state" subtitle="Not ours to repair, and never shown as ours">
          <Stack gap={2}>
            {PROVIDER_CAPABILITIES.map((capability) => (
              <Row key={capability.id} gap={2}>
                <span className="ds-grow">{capability.label}</span>
                <Pill tone="warning" dot>{CAPABILITY_LABELS[capability.state]}</Pill>
              </Row>
            ))}
          </Stack>
          <Notice tone="warning" title="Every one of these is our own missing connection">
            None of them is a provider outage. If one were, this panel would say the fault is outside and would not offer a repair that cannot work.
          </Notice>
        </Card>

        <Card span={5} eyebrow="FRESHNESS" prov="posted" title="How current this register is">
          <KeyValueList items={[
            { label: "Incidents recorded", value: <span className="ds-num">{String(incidents.length)}</span> },
            { label: "Most recent", value: incidents.length ? <span className="ds-num">{context.relative([...incidents].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0].at)}</span> : "None" },
            { label: "Connector records", value: <span className="ds-num">{String(connectors.length)}</span> },
            {
              label: "Register age", value: incidents.length
                ? <span className="ds-num">{`${freshness([...incidents].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0].at, now, 14).days} days`}</span>
                : "Unavailable",
            },
          ]} />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-IT-002 — Incident Queue
 * ================================================================ */

/** The service an incident is against, naming the connector when it is about one. */
export function incidentService(record: Rec, connectors: Rec[]): string {
  const connectorId = String(record.fields.connectorId ?? "");
  const connector = connectorId ? String(record.fields.connectorName ?? "") || connectors.find((item) => item.id === connectorId)?.title || "" : "";
  const service = String(record.fields.service ?? (connector ? "Connectors" : "Workspace"));
  return connector ? `${service} · ${connector}` : service;
}

export function IncidentQueue({ context, lens }: { context: ScreenContext; lens: "Active" | "Awaiting user" | "Resolved" | "Postmortems" }) {
  const incidents = useCollection("incidents").filter((record) => String(record.fields.kind ?? "incident") === "incident");
  const connectors = useCollection("connectors");
  const { org, now } = useWorkspace();
  const rows = incidents.filter((record) => {
    if (lens === "Active") return ["open", "investigating", "mitigating"].includes(record.status);
    if (lens === "Awaiting user") return record.status === "awaiting_user";
    if (lens === "Resolved") return record.status === "resolved" || record.status === "closed";
    return Boolean(record.fields.postmortem);
  });

  if (lens === "Postmortems") {
    return rows.length === 0
      ? <Empty title="No postmortem written" icon={<Archive size={20} />}>A postmortem is written against a resolved incident, and names what was verified rather than what was assumed.</Empty>
      : (
        <Stack gap={4}>
          {rows.map((record) => (
            <Card key={record.id} eyebrow="POSTMORTEM" prov="human" title={record.title} subtitle={`Resolved ${context.date(record.endAt ?? record.updatedAt)}`}>
              <Stack gap={3}>
                <p className="ds-prose">{String(record.fields.postmortem)}</p>
                <KeyValueList items={[
                  { label: "Time to resolve", value: record.at && record.endAt ? <span className="ds-num">{`${Math.max(0, Math.round((new Date(record.endAt).getTime() - new Date(record.at).getTime()) / 3_600_000))} hours`}</span> : "Not recorded" },
                  { label: "Verified by", value: String(record.fields.verifiedBy ?? "Not recorded") },
                ]} />
              </Stack>
            </Card>
          ))}
        </Stack>
      );
  }

  if (rows.length === 0) {
    return (
      <Empty title={`No ${lens.toLowerCase()} incidents`} icon={<CheckCircle2 size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("incident create")}>Open an incident</Button>}>
        An incident here is a real problem with this workspace or with something it depends on.
      </Empty>
    );
  }

  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Incidents"
      rowTone={(row) => (String(row.fields.severity) === "high" ? "danger" : row.status === "open" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Incident", primary: true, cell: (row) => (row.fields.latestReport
          ? <span className="ds-stack"><span>{row.title}</span><span className="ds-subtle">Latest report: {String(row.fields.latestReport)}</span></span>
          : row.title), sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.latestReport ?? "")}` },
        { key: "stage", header: "Stage", cell: (row) => STAGE_LABELS[stageOf(row)], sortValue: (row) => ["open", "triage", "mitigate", "resolve", "postmortem"].indexOf(stageOf(row)) },
        { key: "severity", header: "Severity", cell: (row) => <Pill tone={SEVERITY_TONE[String(row.fields.severity ?? "medium")] ?? "warning"}>{String(row.fields.severity ?? "medium")}</Pill> },
        { key: "service", header: "Service", cell: (row) => incidentService(row, connectors) },
        { key: "origin", header: "Origin", cell: (row) => <Pill tone={String(row.fields.origin) === "provider" ? "neutral" : "info"}>{String(row.fields.origin ?? "ours")}</Pill> },
        { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? row.ownerName) },
        { key: "started", header: "Started", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at ?? "" },
        { key: "age", header: "Age", align: "end", cell: (row) => <span className="ds-num">{row.at ? `${daysBetween(new Date(row.at), now)} d` : "—"}</span> },
        { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "resolved" ? "success" : row.status === "awaiting_user" ? "warning" : "info"} dot>{row.status.replace(/_/g, " ")}</Pill> },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/it/incidents/${id}`)}
      onSelect={(id) => context.select(id)}
      selectedId={context.selectedId}
      bulkActions={[
        { label: "Assign to me", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { fields: { ...row.fields, owner: context.actor } }, { event: `Incident ${row.title} assigned to ${context.actor}` })) },
        { label: "Escalate", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { fields: { ...row.fields, severity: "high" } }, { event: `Incident ${row.title} escalated to high severity` })) },
      ]}
      summary={<span>An incident is resolved only after a check has verified the fix, which is why the resolve action on an incident is guarded by the diagnostics.</span>}
    />
  );
}

/* ================================================================ *
 * ARL-IT-003 — Incident Detail
 * ================================================================ */

export function IncidentDetail({ context, lens }: { context: ScreenContext; lens: "Overview" | "Timeline" | "Evidence" | "Remediation" | "Postmortem" }) {
  const incidents = useCollection("incidents");
  const routed = useRecord(context.params.id);
  const record = routed?.collection === "incidents" ? routed : incidents[0];
  const events = useEvents(record?.id);
  const connectors = useCollection("connectors");
  const missions = useCollection("missions");
  const { ui } = useDiagnostics(context);
  const verifiedSinceOpening = useVerified(record);
  if (!record) return <Empty title="No incident" icon={<Siren size={20} />} />;

  if (lens === "Timeline") {
    const recorded = readTimeline(record);
    const entries = [
      { at: record.at ?? record.createdAt, who: record.createdBy, what: `Incident opened: ${record.title}`, kind: "Opened" },
      ...recorded.map((entry) => ({ at: entry.at, who: entry.by, what: entry.text, kind: timelineKindLabel(entry.kind) })),
      ...(recorded.length ? [] : record.history.map((snapshot) => ({ at: snapshot.at, who: record.updatedBy, what: `Status was ${snapshot.status}`, kind: "History" }))),
      ...events.filter((event) => event.type === "note").map((event) => ({ at: event.at, who: event.actor, what: event.message, kind: "Note" })),
    ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    return (
      <Stack gap={4}>
      <TimelineComposer context={context} record={record} />
      <ol className="t6-timeline" aria-label="Incident timeline">
        {entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <div>
              <strong className="ds-num">{context.dateTime(entry.at)}</strong>
              <div className="ds-subtle">{entry.who}</div>
            </div>
            <div><Pill tone="neutral">{entry.kind}</Pill> {entry.what}</div>
          </li>
        ))}
      </ol>
      </Stack>
    );
  }

  if (lens === "Evidence") {
    const connector = connectors.find((item) => item.id === String(record.fields.connectorId ?? ""));
    return (
      <Grid>
        <Card span={7} eyebrow="EVIDENCE" prov="posted" title="What was observed" subtitle="Audit entries and checks, not inference">
          {events.length === 0 ? <Empty title="No events recorded against this incident" icon={<Activity size={20} />} /> : (
            <Stack gap={2}>
              {events.slice(0, 10).map((event) => (
                <div key={event.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <strong style={{ fontSize: "var(--text-sm)" }}>{event.message}</strong>
                  <div className="ds-subtle ds-num">{context.dateTime(event.at)} · {event.actor}</div>
                </div>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={5} eyebrow="RELATED" prov="human" title="What this touches">
          <KeyValueList items={[
            { label: "Connector", value: connector ? connector.title : "None" },
            { label: "Affected missions", value: <span className="ds-num">{String(missions.filter((mission) => mission.status === "running" || mission.status === "waiting_approval").length)}</span> },
            { label: "Origin", value: <Pill tone={String(record.fields.origin) === "provider" ? "neutral" : "info"}>{String(record.fields.origin ?? "ours")}</Pill> },
            { label: "Last check", value: ui.ranAt ? <span className="ds-num">{context.dateTime(ui.ranAt)}</span> : "Not run in this session" },
          ]} />
          <Notice tone="info" title="Symptoms are only merged with evidence">
            Two incidents are merged when the same audit entries explain both. A similar description is not evidence, so this workspace does not merge on one.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Remediation") {
    return <RemediationPanel context={context} record={record} />;
  }

  if (lens === "Postmortem") {
    return (
      <Grid>
        <Card span={8} eyebrow="POSTMORTEM" prov="human" title="What happened, and what was verified">
          <form
            id="postmortem"
            className="ds-stack ds-gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              await context.mutate.patch(record.id, {
                fields: { ...record.fields, postmortem: String(data.get("text") ?? ""), verifiedBy: context.actor },
              }, { expectRevision: record.revision, event: `Postmortem written for ${record.title}` });
              context.toast("Postmortem saved", "It is on the incident record and in the postmortems tab.");
            }}
          >
            <Field label="What happened" required>
              <TextArea name="text" rows={8} defaultValue={String(record.fields.postmortem ?? "")} required />
            </Field>
            <Button type="submit" variant="primary">Save the postmortem</Button>
          </form>
        </Card>
        <Card span={4} eyebrow="RULE" prov="human" title="Resolution needs verification">
          <Notice tone="warning" title="An incident does not close on a belief">
            The resolve action is unavailable until the diagnostics have been run since the incident was opened, so closing one always has a measurement behind it.
          </Notice>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
    <IncidentLifecycle context={context} record={record} />
    <Grid>
      <Card span={7} prov="human" title="Details">
        <KeyValueList columns={2} items={[
          { label: "Started", value: context.dateTime(record.at), mono: true },
          { label: "Owner", value: String(record.fields.owner ?? record.ownerName) },
          { label: "Service", value: incidentService(record, connectors) },
          { label: "Origin", value: String(record.fields.origin ?? "ours") === "provider" ? "Provider (not repairable by us)" : "Ours" },
          ...(record.fields.latestReport ? [{ label: "Latest report", value: `${String(record.fields.latestReport)} — ${String(record.fields.latestReportBy ?? "")}, ${context.dateTime(String(record.fields.latestReportAt ?? ""))}` }] : []),
          { label: "Revision", value: String(record.revision), mono: true },
        ]} />
      </Card>
      <Card span={5} eyebrow="IMPACT" prov="posted" title="What it affects">
        <Stack gap={3}>
          <p className="ds-prose">{String(record.fields.impact ?? "No impact statement recorded.")}</p>
          <Notice tone={record.status === "resolved" || record.status === "closed" || verifiedSinceOpening ? "success" : "warning"} title={record.status === "resolved" || record.status === "closed" ? "Verified before closing" : verifiedSinceOpening ? "Checked since it opened" : "Not yet verified"}>
            {record.status === "resolved" || record.status === "closed"
              ? `Closed by ${String(record.fields.verifiedBy ?? record.updatedBy)} after a check.`
              : verifiedSinceOpening
                ? "Diagnostics have run since this incident was opened, so it can be resolved once the fix is recorded."
                : "Run the diagnostics on the health screen before resolving this; the resolve action is guarded on it."}
          </Notice>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Run the diagnostics</Button>
        </Stack>
      </Card>
    </Grid>
    </Stack>
  );
}

export function RemediationPanel({ context, record }: { context: ScreenContext; record: Rec }) {
  const { ui, run } = useDiagnostics(context);
  const verified = ui.ranAt && record.at ? ui.ranAt > (record.at ?? "") : false;
  return (
    <Grid>
      <Card span={7} eyebrow="RUNBOOK" prov="human" title="Allowed steps" subtitle="Everything here is reversible and local">
        <Stack gap={3}>
          {[
            { label: "Re-run the diagnostics", detail: "Reads storage, the database and the browser. Changes nothing." },
            { label: "Export a backup", detail: "Writes a JSON file from this browser. Changes nothing." },
            { label: "Re-index a collection", detail: "Reads every record of one collection to confirm the index answers." },
            { label: "Reconnect a provider", detail: "Cannot complete; the authorisation stops at the redirect." },
          ].map((step) => (
            <Row key={step.label} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow"><strong>{step.label}</strong><p className="ds-subtle">{step.detail}</p></div>
              <Pill tone={step.label.startsWith("Reconnect") ? "warning" : "success"}>{step.label.startsWith("Reconnect") ? "blocked" : "allowed"}</Pill>
            </Row>
          ))}
          <Notice tone="warning" title="No step raises its own privileges">
            Everything a runbook may do here is read-only or reversible. Nothing patches a running system, because there is no running system to patch.
          </Notice>
          <Notice tone={context.can("approve_mission") ? "info" : "warning"} title={context.can("approve_mission") ? "You can approve a repair" : "Approving a repair needs approval authority"}>
            {context.can("approve_mission")
              ? "Approval is recorded with your name and the plan, and is part of the incident history."
              : "Your role view can read the plan but not approve it. Ask an owner or finance approver."}
          </Notice>
        </Stack>
      </Card>
      <Card span={5} eyebrow="VERIFY" prov={verified ? "posted" : "unknown"} title="Before this can be resolved">
        <Stack gap={3}>
          <KeyValueList items={[
            { label: "Incident opened", value: <span className="ds-num">{context.dateTime(record.at)}</span> },
            { label: "Last diagnostics run", value: ui.ranAt ? <span className="ds-num">{context.dateTime(ui.ranAt)}</span> : "Not in this session" },
            { label: "Verified since opening", value: verified ? <Pill tone="success">yes</Pill> : <Pill tone="warning">no</Pill> },
          ]} />
          <Button variant="secondary" busy={ui.running} onClick={() => void run()}>Run the diagnostics now</Button>
          <Button
            variant="primary"
            disabled={!verified || record.status === "resolved"}
            title={!verified ? "Run the workspace diagnostics after the incident was opened first" : undefined}
            onClick={async () => {
              await context.mutate.patch(record.id, {
                status: "resolved",
                endAt: clockIso(),
                fields: { ...record.fields, verifiedBy: context.actor },
              }, { expectRevision: record.revision, event: `Incident ${record.title} resolved after a verified check` });
              context.toast("Resolved", "The record carries the check that verified it.");
            }}
          >
            Resolve this incident
          </Button>
          {!verified && <Notice tone="warning" title="Resolution is blocked">An incident cannot be closed until the health checks have been run since it was opened.</Notice>}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-IT-004 — System Health (diagnostics, storage, backup)
 * ================================================================ */

export function SystemHealth({ context, lens }: { context: ScreenContext; lens: "Services" | "Workers" | "Storage" | "Provider status" }) {
  const { ui, run } = useDiagnostics(context);
  const { org } = useWorkspace();
  const totals = summarise(ui.results);

  if (lens === "Workers") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="There are no workers">
          Everything in this workspace runs in the tab you are looking at. There is no queue, no background job and no second process, so a worker count would be an invention.
        </Notice>
        <Grid>
          <Card span={6} eyebrow="RUNTIME" prov="posted" title="What actually executes">
            <KeyValueList items={[
              { label: "Processes", value: <span className="ds-num">1 — this tab</span> },
              { label: "Service worker", value: typeof navigator !== "undefined" && "serviceWorker" in navigator ? <Pill tone="neutral">available, not registered</Pill> : <Pill tone="warning">unavailable</Pill> },
              { label: "Background queue", value: <Pill tone="warning">none</Pill> },
              { label: "Scheduled jobs", value: <Pill tone="warning">none</Pill> },
            ]} />
          </Card>
          <Card span={6} eyebrow="CONSEQUENCE" prov="human" title="What that means for the work">
            <Notice tone="info" title="Nothing happens while the tab is closed">
              A reminder, a sync or a retry would need something running outside the browser. Every workflow in this product is therefore a draft waiting for a person, which is why no screen claims something will happen later.
            </Notice>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (lens === "Storage") {
    return <StoragePanel context={context} />;
  }

  if (lens === "Provider status") {
    return (
      <Stack gap={4}>
        <AssetRegister context={context} />
        <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Provider capabilities</h2>
        <Notice tone="warning" title="Provider status cannot be read from here">
          A status page is a network call, and this workspace makes none. What is shown is the capability register's own state, which is about our connection rather than their service.
        </Notice>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Provider capabilities and their state</caption>
            <thead><tr><th scope="col">Capability</th><th scope="col">Provider</th><th scope="col">Our state</th><th scope="col">Their status</th><th scope="col">Done here instead</th></tr></thead>
            <tbody>
              {PROVIDER_CAPABILITIES.map((capability) => (
                <tr key={capability.id}>
                  <th scope="row">{capability.label}</th>
                  <td>{capability.provider}</td>
                  <td><Pill tone="warning" dot>{CAPABILITY_LABELS[capability.state]}</Pill></td>
                  <td><span className="ds-subtle">Unavailable</span></td>
                  <td>{capability.localEquivalent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/connect/health`)}>Open connector health</Button>
      </Stack>
    );
  }

  const groups: CheckResult["group"][] = ["Storage", "Database", "Clock", "Browser", "Network", "Workspace"];
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Passing" value={ui.results.length ? String(totals.pass) : "Not run"} prov={ui.results.length ? "posted" : undefined} unavailable={ui.results.length === 0} meta="Checks that performed a real operation" />
        <Stat label="To review" value={ui.results.length ? String(totals.warn) : "Not run"} prov={ui.results.length ? "posted" : undefined} unavailable={ui.results.length === 0} meta="Ran, and the result needs a look" />
        <Stat label="Failing" value={ui.results.length ? String(totals.fail) : "Not run"} prov={ui.results.length ? "posted" : undefined} unavailable={ui.results.length === 0} meta="Ran, and did not succeed" />
        <Stat label="Not measurable here" value={ui.results.length ? String(totals.unavailable) : "Not run"} unavailable meta="Would need something a browser does not have" />
      </StatRow>

      <Row gap={2} wrap>
        <Button variant="primary" busy={ui.running} onClick={() => void run()}>{ui.results.length ? "Run the checks again" : "Run the checks"}</Button>
        <Button variant="secondary" disabled={ui.results.length === 0} onClick={() => {
          downloadCsv(`${org.slug}-diagnostics.csv`, ["group", "check", "state", "value", "method", "detail"],
            ui.results.map((result) => [result.group, result.label, result.state, result.value, result.method, result.detail]));
          context.toast("Exported", `${ui.results.length} check results written to CSV.`);
        }}>Export the results</Button>
        <Button variant="ghost" onClick={() => context.openOverlay("Backup and restore")}>Backup and restore</Button>
        {ui.ranAt && <span className="ds-subtle ds-num">Last run {context.dateTime(ui.ranAt)}</span>}
      </Row>

      {ui.results.length === 0 ? (
        <Empty title="No check has run in this session" icon={<Cpu size={20} />}
          action={<Button variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks</Button>}>
          Every result on this screen is produced by an operation that really happens: a write to IndexedDB, a storage estimate, a feature test. Nothing is shown until one runs.
        </Empty>
      ) : (
        <Stack gap={5}>
          {groups.map((group) => {
            const rows = ui.results.filter((result) => result.group === group);
            if (rows.length === 0) return null;
            return (
              <Card key={group} eyebrow={group.toUpperCase()} prov="posted" title={group} subtitle={`${rows.length} checks`}>
                <div className="t6-checks">{rows.map((result) => <CheckRow key={result.id} result={result} />)}</div>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

export function StoragePanel({ context }: { context: ScreenContext }) {
  const { ui, run } = useDiagnostics(context);
  const { org } = useWorkspace();
  const storage = ui.storage;
  const share = storage?.quotaBytes ? (storage.usageBytes ?? 0) / storage.quotaBytes : 0;

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Used" value={storage?.supported ? formatBytes(storage.usageBytes) : "Not measured"} prov={storage?.supported ? "posted" : undefined} unavailable={!storage?.supported} meta="navigator.storage.estimate" />
        <Stat label="Quota" value={storage?.supported ? formatBytes(storage.quotaBytes) : "Not measured"} prov={storage?.supported ? "posted" : undefined} unavailable={!storage?.supported} meta="What the browser allows this origin" />
        <Stat label="Records" value={ui.counts ? String(ui.counts.records) : "Not counted"} prov={ui.counts ? "posted" : undefined} unavailable={!ui.counts} meta={ui.counts ? `${ui.counts.byCollection.length} collections` : "Run the checks"} />
        <Stat label="Persistence" value={storage?.persisted === undefined ? "Unknown" : storage.persisted ? "Granted" : "Not granted"} prov={storage?.persisted === undefined ? undefined : "posted"} unavailable={storage?.persisted === undefined} meta="navigator.storage.persisted" />
      </StatRow>

      {!storage && (
        <Notice tone="info" title="Nothing measured yet" actions={<Button size="sm" variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks</Button>}>
          The storage figures come from the browser at the moment a check runs.
        </Notice>
      )}

      {storage?.supported && (
        <Card eyebrow="QUOTA" prov="posted" title="Origin storage" subtitle={`${(share * 100).toFixed(2)}% of the quota the browser reports`}>
          <Meter value={storage.usageBytes ?? 0} max={storage.quotaBytes ?? 1} label="Storage used" tone={share > 0.9 ? "danger" : share > 0.7 ? "warning" : "success"} />
        </Card>
      )}

      <BackupRestore context={context} />

      {ui.counts && (
        <Card eyebrow="BY COLLECTION" prov="posted" title={`Records in ${org.name}`} subtitle={`${ui.counts.orgRecords} rows, counted in ${ui.counts.took} ms`}>
          <DataGrid
            rows={ui.counts.byCollection}
            rowId={(row) => row.collection}
            label="Records by collection"
            columns={[
              { key: "collection", header: "Collection", primary: true, cell: (row) => row.collection, sortValue: (row) => row.collection, filterValue: (row) => row.collection },
              { key: "count", header: "Records", align: "end", cell: (row) => <span className="ds-num">{String(row.count)}</span>, sortValue: (row) => row.count },
            ]}
          />
        </Card>
      )}
    </Stack>
  );
}

export function BackupRestore({ context }: { context: ScreenContext }) {
  const ui = useItUi();
  const { org } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState("");
  const check = ui.restorePreview ? inspectBackup(ui.restorePreview) : undefined;

  return (
    <Grid>
      <Card span={6} eyebrow="BACKUP" prov="posted" title="Export the whole workspace" subtitle="Every record and every audit event, as one JSON file">
        <Stack gap={3}>
          <Notice tone="info" title="This is the answer to an evicted browser">
            The workspace lives in IndexedDB. If the browser clears it, the backup is what remains. It is written from this browser and goes nowhere else.
          </Notice>
          <Button
            variant="primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const backup = await buildBackup();
                downloadJson(`${org.slug}-workspace-backup.json`, backup);
                setLastBackup(backup.takenAt);
                await context.mutate.log(`Workspace backup exported: ${backup.counts.records} records and ${backup.counts.events} events.`, { type: "export" });
                context.toast("Backup written", `${backup.counts.records} records and ${backup.counts.events} events downloaded as JSON.`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Export a backup
          </Button>
          {lastBackup && <p className="ds-subtle ds-num">Last export {context.dateTime(lastBackup)}</p>}
          <Button variant="ghost" onClick={async () => {
            const backup = await buildBackup();
            downloadCsv(`${org.slug}-records.csv`, ["id", "organizationId", "collection", "title", "status", "updatedAt"],
              backup.records.map((record) => [record.id, record.organizationId, record.collection, record.title, record.status, record.updatedAt]));
            context.toast("Index exported", "A readable CSV index of every record was written.");
          }}>Export a readable index instead</Button>
        </Stack>
      </Card>

      <Card span={6} eyebrow="RESTORE" prov="human" title="Restore from a backup" subtitle="Checked before anything is written">
        <Stack gap={3}>
          <Field label="Backup file" hint="The file is read in this browser; nothing is uploaded.">
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Choose a backup file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                ui.setRestorePreview(text);
              }}
            />
          </Field>
          <Field label="Or paste the file" hint="Useful when a download cannot be opened.">
            <TextArea rows={3} value={ui.restorePreview.slice(0, 400)} onChange={(event) => ui.setRestorePreview(event.target.value)} placeholder='{"format":"arlovi.workspace.backup", ...}' />
          </Field>
          {check && (check.ok ? (
            <Notice tone="success" title="The file checks out">
              {check.summary?.records} records and {check.summary?.events} events across {check.summary?.collections} collections, taken {check.summary?.takenAt}.
            </Notice>
          ) : (
            <Notice tone="danger" title="This file will not be restored">
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{check.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </Notice>
          ))}
          <Button
            variant="outline-danger"
            disabled={!check?.ok}
            onClick={() => context.openOverlay("Restore confirmation")}
          >
            Restore this backup
          </Button>
          <Notice tone="warning" title="A restore replaces everything">
            Restoring writes the file's records over the workspace and removes anything not in it. That is why it asks for a confirmation and why the file is checked first.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

export function RestoreConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const ui = useItUi();
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const check = ui.restorePreview ? inspectBackup(ui.restorePreview) : undefined;
  if (!check?.ok) {
    return <Notice tone="danger" title="There is no checked backup to restore">Choose a file on the storage tab first; it is inspected before this dialog will do anything.</Notice>;
  }
  return (
    <Stack gap={4}>
      <KeyValueList items={[
        { label: "Records in the file", value: <span className="ds-num">{String(check.summary?.records)}</span> },
        { label: "Events in the file", value: <span className="ds-num">{String(check.summary?.events)}</span> },
        { label: "Organisations", value: check.summary?.organizations.join(", ") ?? "—" },
        { label: "Taken", value: <span className="ds-num">{check.summary?.takenAt ?? "not recorded"}</span> },
      ]} />
      <Notice tone="danger" title="Everything currently in this browser is replaced">
        Records that are not in the file are removed. Export a backup of the current state first if there is any doubt.
      </Notice>
      <Field label="Type RESTORE to confirm" required>
        <TextInput value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="RESTORE" />
      </Field>
      <Button
        variant="danger"
        busy={busy}
        disabled={typed.trim().toUpperCase() !== "RESTORE"}
        onClick={async () => {
          setBusy(true);
          try {
            const parsed = JSON.parse(ui.restorePreview) as { records: Rec[]; events: [] };
            await persistAll(parsed.records, []);
            await context.mutate.log(`Workspace restored from a backup: ${parsed.records.length} records written, everything else removed.`, { type: "restore" });
            context.toast("Restored", `${parsed.records.length} records were written back into this browser.`);
            ui.setRestorePreview("");
            close();
          } catch (error) {
            context.toast("Restore failed", error instanceof Error ? error.message : "The file could not be written.", "failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        Replace the workspace
      </Button>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-IT-005 — Logs & Tracing
 * ================================================================ */

export function LogsAndTracing({ context, lens }: { context: ScreenContext; lens: "Traces" | "Logs" | "Metrics" | "Sampling" }) {
  const allEvents = useEvents(undefined, 400);
  const { ui } = useDiagnostics(context);
  const { org } = useWorkspace();
  const [redact, setRedact] = useState(true);
  const filter = useItUi((state) => state.logFilter);
  const clearFilter = useItUi((state) => state.setLogFilter);
  const bookmarks = useCollection("logBookmarks");
  const filtering = Boolean(filter.kind || filter.actor || filter.text);
  const events = lens === "Logs" && filtering
    ? allEvents.filter((event) => (!filter.kind || event.type === filter.kind) && (!filter.actor || event.actor === filter.actor) && (!filter.text || event.message.toLowerCase().includes(filter.text.toLowerCase())))
    : allEvents;

  if (lens === "Traces") {
    const timed = ui.results.filter((result) => result.tookMs !== undefined);
    const max = Math.max(1, ...timed.map((result) => result.tookMs ?? 0));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="These are real durations, from the checks that ran">
          A trace needs something that spans services. The only timed operations in this workspace are its own database calls, and those are below with the time each actually took.
        </Notice>
        {timed.length === 0 ? (
          <Empty title="No timed operation yet" icon={<Activity size={20} />}>Run the diagnostics on the health screen and the durations appear here.</Empty>
        ) : (
          <Card eyebrow="DURATIONS" prov="posted" title="Measured operations" subtitle={`Longest ${max} ms`}>
            <div className="t6-wf">
              {timed.map((result) => (
                <div key={result.id} className="t6-wf-row">
                  <span className="ds-truncate">{result.label}</span>
                  <span className="t6-wf-track">
                    <i className="t6-wf-bar" data-tone={(result.tookMs ?? 0) > 200 ? "warning" : undefined} style={{ left: 0, width: `${Math.max(2, ((result.tookMs ?? 0) / max) * 100)}%` }} />
                  </span>
                  <span className="ds-num">{result.tookMs} ms</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Stack>
    );
  }

  if (lens === "Metrics") {
    const byType = events.reduce<Record<string, number>>((map, event) => {
      map[event.type] = (map[event.type] ?? 0) + 1;
      return map;
    }, {});
    return (
      <Stack gap={4}>
        <Card eyebrow="EVENTS" prov="posted" title="Audit events by kind" subtitle={`${events.length} most recent entries`}>
          <BarChart
            title="Audit events by kind"
            height={220}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Events", points: Object.entries(byType).map(([type, count]) => ({ label: type, value: count })) }]}
            footer="Counted from the events table. There is no metrics pipeline; this is the whole of what is measured."
          />
        </Card>
        <Notice tone="warning" title="Latency, throughput and error rate are not here">
          Each would need a server handling requests. The durations on the Traces tab are the only timings this workspace can produce.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Sampling") {
    return (
      <Grid>
        <Card span={6} eyebrow="SAMPLING" prov="posted" title="Everything is kept" subtitle="There is no sampling to configure">
          <KeyValueList items={[
            { label: "Events written", value: <Pill tone="success">every consequential action</Pill> },
            { label: "Sample rate", value: <span className="ds-num">100%</span> },
            { label: "Retention", value: "Until the browser clears the origin or a restore replaces it" },
            { label: "Volume", value: ui.counts ? <span className="ds-num">{String(ui.counts.events)}</span> : "Run the checks to count" },
          ]} />
        </Card>
        <Card span={6} eyebrow="REDACTION" prov="human" title="What is never written to a log">
          <Stack gap={3}>
            <Checkbox label="Redact answer values and personal detail in log entries" checked={redact} onChange={(event) => setRedact(event.target.checked)} />
            <Notice tone="info" title="A message names a record, not its contents">
              Audit messages carry the record title and what changed, never the field values. A submission's answers, for example, live on the record and are redacted in its own table until someone chooses to reveal them.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant="secondary" onClick={() => {
          downloadCsv(`${org.slug}-audit-log.csv`, ["at", "actor", "type", "message", "screen"],
            events.map((event) => [event.at, event.actor, event.type, event.message, event.screenId ?? ""]));
          context.toast("Exported", `${events.length} log entries written to CSV.`);
        }}>Export the log</Button>
        <Button variant="ghost" onClick={() => context.openOverlay("saved filter")}>Filter</Button>
        {filtering && <Pill tone="info" dot>{`Filtered: ${filter.name} · ${events.length} of ${allEvents.length}`}</Pill>}
        {filtering && <Button size="sm" variant="ghost" onClick={() => clearFilter({ name: "", kind: "", actor: "", text: "" })}>Clear filter</Button>}
      </Row>
      {bookmarks.length > 0 && (
        <Card eyebrow="BOOKMARKS" prov="human" title="Bookmarked entries" subtitle={`${bookmarks.length} kept by people in this workspace`}>
          <Stack gap={2}>
            {bookmarks.map((bookmark) => (
              <Row key={bookmark.id} gap={2} wrap>
                <span className="ds-num ds-subtle">{context.dateTime(bookmark.at)}</span>
                <span className="ds-grow">{bookmark.title}</span>
                <span className="ds-subtle">{bookmark.summary} · {bookmark.createdBy}</span>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Trace waterfall", { id: String(bookmark.fields.eventId ?? "") })}>Inspect</Button>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
      {events.length === 0 ? <Empty title="No log entries" icon={<Activity size={20} />} /> : (
        <DataGrid
          rows={events}
          rowId={(row) => row.id}
          label="Audit log"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Actor", cell: (row) => row.actor, filterValue: (row) => row.actor },
            { key: "type", header: "Kind", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
            { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
            { key: "screen", header: "Screen", cell: (row) => <span className="ds-num">{row.screenId ?? "—"}</span> },
            { key: "entity", header: "Record", cell: (row) => <span className="ds-num">{row.entityId ? row.entityId.slice(0, 18) : "—"}</span> },
          ]}
          onOpen={(id) => context.openOverlay("Trace waterfall", { id })}
          summary={<span>Entries carry the record a change touched, never the values inside it.</span>}
        />
      )}
    </Stack>
  );
}

/* ================================================================ *
 * ARL-IT-006 — Automated Remediation
 * ================================================================ */

export function Remediation({ context, lens }: { context: ScreenContext; lens: "Runbooks" | "Proposals" | "Runs" | "Failures" }) {
  const incidents = useCollection("incidents");
  const events = useEvents();
  const { ui, run } = useDiagnostics(context);
  const runbooks = incidents.filter((record) => String(record.fields.kind ?? "") === "runbook");

  if (lens === "Proposals") {
    const failing = ui.results.filter((result) => result.state === "fail" || result.state === "warn");
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A proposal is derived from a check that failed">
          Nothing is proposed on a hunch. Each row below exists because a diagnostic returned a result that needs action, and names the step that would address it.
        </Notice>
        {incidents.some((record) => String(record.fields.kind ?? "") === "remediation") && (
          <Card eyebrow="APPROVED" prov="human" title="Approved remediations" subtitle="Approved by a person; approval does not run them">
            <Stack gap={2}>
              {incidents.filter((record) => String(record.fields.kind ?? "") === "remediation").map((record) => (
                <Row key={record.id} gap={2} wrap><span className="ds-grow"><strong>{record.title}</strong> — {record.summary}</span><span className="ds-subtle">{String(record.fields.approvedBy ?? "")}</span><Pill tone="success">{record.status}</Pill></Row>
              ))}
            </Stack>
          </Card>
        )}
        {ui.results.length === 0 ? (
          <Empty title="No checks have run" icon={<Cpu size={20} />} action={<Button variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks</Button>}>
            There is nothing to propose until something has been measured.
          </Empty>
        ) : failing.length === 0 ? (
          <Notice tone="success" title="Nothing needs remediation">Every check that ran either passed or could not be measured in a browser.</Notice>
        ) : (
          <Stack gap={2}>
            {failing.map((result) => (
              <Row key={result.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                <div className="ds-grow">
                  <strong>{result.label}</strong>
                  <p className="ds-subtle">{result.detail}</p>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Proposed: {proposalFor(result)}</p>
                </div>
                <Pill tone={result.state === "fail" ? "danger" : "warning"}>{result.state}</Pill>
              </Row>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  if (lens === "Runs") {
    const runs = events.filter((event) => event.type === "diagnostic" || event.type === "restore" || event.type === "export");
    return runs.length === 0
      ? <Empty title="No run recorded" icon={<Activity size={20} />}>Running the diagnostics, exporting a backup or restoring one each write an entry here.</Empty>
      : (
        <DataGrid
          rows={runs}
          rowId={(row) => row.id}
          label="Remediation runs"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor },
            { key: "type", header: "Kind", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
            { key: "message", header: "Outcome", cell: (row) => row.message, filterValue: (row) => row.message },
          ]}
        />
      );
  }

  if (lens === "Failures") {
    const failed = ui.results.filter((result) => result.state === "fail");
    const sessionErrors = ui.sessionErrors;
    return (
      <Stack gap={4}>
        {failed.length === 0 && sessionErrors.length === 0 ? (
          <Empty title="No failures" icon={<CheckCircle2 size={20} />}>No check has failed and no uncaught error has been seen since this screen opened.</Empty>
        ) : (
          <>
            {failed.map((result) => <CheckRow key={result.id} result={result} />)}
            {sessionErrors.map((error) => (
              <div key={error.at} className="t6-check" data-state="fail">
                <span className="t6-check-dot" aria-hidden="true" />
                <div>
                  <strong>Uncaught error</strong>
                  <p className="ds-subtle">{error.message}</p>
                  <p className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)" }}>{context.dateTime(error.at)}</p>
                </div>
                <Pill tone="danger">observed</Pill>
              </div>
            ))}
          </>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A runbook here never escalates its own privileges">
        Every allowed step is read-only or reversible and runs in this browser. Nothing patches a production system, because there is no production system to patch and nothing could authorise it if there were.
      </Notice>
      <Grid>
        {RUNBOOKS.map((runbook) => (
          <Card key={runbook.id} span={6} eyebrow="RUNBOOK" prov="human" title={runbook.title} subtitle={runbook.when}
            actions={<Pill tone={runbook.allowed ? "success" : "warning"}>{runbook.allowed ? "allowed" : "needs a person"}</Pill>}
            footer={<Button size="sm" variant={runbook.allowed ? "primary" : "secondary"} busy={ui.running && runbook.id === "diagnostics"} onClick={async () => {
              if (runbook.id === "diagnostics") { await run(); context.toast("Runbook complete", "The diagnostics ran and the result is recorded."); return; }
              context.openOverlay("Runbook editor", { id: runbook.id });
            }}>{runbook.allowed ? "Run it" : "Read it"}</Button>}>
            <Stack gap={2}>
              <ol className="ds-prose">{runbook.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <KeyValueList items={[{ label: "Reversible", value: runbook.allowed ? "Yes" : "Not applicable" }]} />
            </Stack>
          </Card>
        ))}
        {runbooks.map((record) => (
          <Card key={record.id} span={6} eyebrow="RUNBOOK" prov="human" title={record.title} subtitle={record.summary}
            actions={<Pill tone={record.status === "paused" ? "warning" : "success"}>{record.status}</Pill>}
            footer={<Button size="sm" variant="secondary" disabled={record.status === "paused"} onClick={() => context.openOverlay("execute runbook", { id: record.id })}>Execute</Button>}>
            {record.fields.lastRunAt ? <p className="ds-subtle ds-num">{`Last run ${context.dateTime(String(record.fields.lastRunAt))}: ${String(record.fields.lastOutcome ?? "")}`}</p> : <p className="ds-subtle">Not executed yet.</p>}
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

function proposalFor(result: CheckResult): string {
  if (result.id === "storage-quota") return "Export a backup and remove records that are no longer needed.";
  if (result.id === "storage-persisted") return "Ask the browser for persistent storage, and keep exporting backups until it is granted.";
  if (result.id === "db-roundtrip") return "Check that site data is not blocked for this origin, then run the check again.";
  if (result.id === "db-query") return "Count the records; a very large collection may need a narrower view.";
  if (result.id.startsWith("clock")) return "Correct the device clock, or accept the frozen clock if it was set deliberately.";
  if (result.id.startsWith("feature-")) return "Use a browser that provides this feature; the affected screens will not work without it.";
  if (result.id === "last-error") return "Read the error on the failures tab and open an incident if it recurs.";
  return "No automatic step is proposed; this one needs a person.";
}

const RUNBOOKS: { id: string; title: string; when: string; steps: string[]; allowed: boolean }[] = [
  {
    id: "diagnostics", title: "Verify the workspace", when: "Before resolving any incident",
    steps: ["Read the storage estimate", "Write, read and delete one row in IndexedDB", "Run the indexed query the lists use", "Compare the clocks", "Detect the browser features the interface needs"],
    allowed: true,
  },
  {
    id: "backup", title: "Take a backup before a risky change", when: "Before a restore or a bulk delete",
    steps: ["Export every record and event as JSON", "Confirm the counts in the file match the workspace", "Keep the file outside this browser"],
    allowed: true,
  },
  {
    id: "reconnect", title: "Restore a provider connection", when: "When a capability is needed",
    steps: ["Open the authorisation flow", "Review the scopes", "Complete the provider redirect", "Verify with one real read"],
    allowed: false,
  },
  {
    id: "rotate", title: "Rotate a credential", when: "After a suspected exposure",
    steps: ["Revoke the existing grant at the provider", "Issue a new credential at the provider", "Store it in an encrypted server-side store"],
    allowed: false,
  },
];

/* ================================================================ *
 * ARL-IT-007 — Release Management
 * ================================================================ */

export function Releases({ context, lens }: { context: ScreenContext; lens: "Planned" | "Staging" | "Production" | "Rollbacks" }) {
  const incidents = useCollection("incidents");
  const projects = useCollection("appProjects");
  const sites = useCollection("sites");
  const releases = incidents.filter((record) => String(record.fields.kind ?? "") === "release");
  const rows = releases.filter((record) => {
    if (lens === "Planned") return record.status === "planned";
    if (lens === "Staging") return record.status === "staging";
    if (lens === "Production") return record.status === "blocked" || record.status === "released";
    return record.status === "rolled_back";
  });

  if (lens === "Production") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Nothing has reached production">
          There is no runtime and no host, so every attempt to promote has been recorded as blocked at the boundary. The rows below are those attempts, kept as they happened.
        </Notice>
        {rows.length === 0 ? <Empty title="No production attempt recorded" icon={<Server size={20} />} /> : <ReleaseGrid context={context} rows={rows} />}
        <Grid>
          <Card span={6} eyebrow="SITES" prov="posted" title="Sites waiting on a host" subtitle={`${sites.length} in this workspace`}>
            <Stack gap={2}>
              {sites.map((site) => <Row key={site.id} gap={2}><span className="ds-grow">{site.title}</span><Pill tone="warning">export only</Pill></Row>)}
            </Stack>
          </Card>
          <Card span={6} eyebrow="APPS" prov="posted" title="Apps waiting on a runtime" subtitle={`${projects.length} in this workspace`}>
            <Stack gap={2}>
              {projects.map((project) => <Row key={project.id} gap={2}><span className="ds-grow">{project.title}</span><Pill tone="warning">not deployed</Pill></Row>)}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty title={`No ${lens.toLowerCase()} releases`} icon={<Server size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("release gates")}>See the gates</Button>}>
        A release here is a planned change to this workspace, with the gates that would have to pass before it moved.
      </Empty>
    );
  }

  return <ReleaseGrid context={context} rows={rows} />;
}

function ReleaseGrid({ context, rows }: { context: ScreenContext; rows: Rec[] }) {
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Releases"
      rowTone={(row) => (row.status === "blocked" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Release", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at ?? "" },
        { key: "env", header: "Environment", cell: (row) => <Pill tone={String(row.fields.environment) === "production" ? "danger" : "warning"} dot>{String(row.fields.environment ?? "staging")}</Pill> },
        { key: "gates", header: "Gates", cell: (row) => String(row.fields.gates ?? "not recorded") },
        { key: "status", header: "Outcome", cell: (row) => <Pill tone={row.status === "released" ? "success" : row.status === "rolled_back" ? "warning" : "danger"}>{row.status.replace(/_/g, " ")}</Pill> },
        { key: "owner", header: "By", cell: (row) => row.ownerName },
      ]}
      onOpen={(id) => context.openOverlay("Diff review", { id })}
    />
  );
}

/* ================================================================ *
 * ARL-IT-008 — Security Centre
 * ================================================================ */

export function SecurityCentre({ context, lens }: { context: ScreenContext; lens: "Alerts" | "Access" | "Secrets" | "Policy" | "Audit" }) {
  const events = useEvents(undefined, 400);
  const incidents = useCollection("incidents");
  const forms = useCollection("forms");
  const { ui } = useDiagnostics(context);
  const { org, role, actor } = useWorkspace();

  if (lens === "Access") {
    return (
      <Stack gap={5}>
      <AccessReviews context={context} />
      <Grid>
        <Card span={7} eyebrow="SESSIONS" prov="posted" title="What a browser can honestly say" subtitle="No account system exists, so there is no session list">
          <KeyValueList items={[
            { label: "Signed-in account", value: <Pill tone="warning">none — there is no account system</Pill> },
            { label: "Role view in this tab", value: <span className="ds-num">{role}</span> },
            { label: "Acting as", value: actor },
            { label: "Storage origin", value: <span className="ds-num">{typeof window !== "undefined" ? window.location.origin : "unknown"}</span> },
            { label: "Other devices", value: <Pill tone="warning">unknowable from here</Pill> },
            { label: "Other tabs", value: <Pill tone="warning">unknowable from here</Pill> },
          ]} />
          <Notice tone="warning" title="A device list would be fiction">
            A browser cannot see other devices, other browser profiles or other tabs of the same workspace. Listing them would mean inventing them, so this panel lists what it can observe and names what it cannot.
          </Notice>
        </Card>
        <Card span={5} eyebrow="ROLE VIEWS" prov="human" title="What a role view is">
          <Stack gap={3}>
            <Notice tone="warning" title="Role views shape the interface; they are not account security">
              Changing the role view changes what this interface offers. Everything in the workspace stays readable to anything that can open this browser profile, and no server enforces anything.
            </Notice>
            <KeyValueList items={[
              { label: "Enforced by", value: "This interface only" },
              { label: "Would be enforced by", value: "A server, once one exists" },
              { label: "Revocation", value: <Pill tone="warning">not possible here</Pill> },
            ]} />
          </Stack>
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (lens === "Secrets") {
    return (
      <Stack gap={4}>
        <Notice tone="danger" title="This workspace stores no secret">
          There is nowhere safe to keep one. IndexedDB is readable by anything running on this page, so no credential is stored, none is generated, and no screen offers a field to type one into.
        </Notice>
        <Grid>
          <Card span={6} eyebrow="HELD" prov="posted" title="Credentials in this browser">
            <KeyValueList items={[
              { label: "API keys", value: <span className="ds-num">0</span> },
              { label: "Provider tokens", value: <span className="ds-num">0</span> },
              { label: "Passwords", value: <span className="ds-num">0</span> },
              { label: "Generated by this product", value: <span className="ds-num">0</span> },
            ]} />
          </Card>
          <Card span={6} eyebrow="FORMS" prov="posted" title="Sensitive answers that are held" subtitle="Not credentials, but still personal">
            <Stack gap={2}>
              {forms.flatMap((form) => {
                const body = form.body && typeof form.body === "object" ? (form.body as { fields?: { label?: string; sensitive?: boolean }[] }) : {};
                return (body.fields ?? []).filter((field) => field.sensitive).map((field) => (
                  <Row key={`${form.id}-${field.label}`} gap={2}>
                    <span className="ds-grow">{form.title} · {field.label}</span>
                    <Pill tone="danger">redacted by default</Pill>
                  </Row>
                ));
              })}
              {forms.every((form) => {
                const body = form.body && typeof form.body === "object" ? (form.body as { fields?: { sensitive?: boolean }[] }) : {};
                return !(body.fields ?? []).some((field) => field.sensitive);
              }) && <span className="ds-subtle">No field is flagged sensitive.</span>}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (lens === "Policy") {
    return (
      <Grid>
        <Card span={6} eyebrow="RETENTION" prov="human" title="How long things are kept" subtitle="Measured against, never enforced behind your back">
          <Stack gap={3}>
            <KeyValueList items={[
              { label: "Records", value: "Kept until deleted or replaced by a restore" },
              { label: "Audit events", value: "Kept with the workspace" },
              { label: "Form submissions", value: "Each form sets its own period; the submissions screen measures against it" },
              { label: "Automatic deletion", value: <Pill tone="warning">none — deletion is always an action</Pill> },
            ]} />
            <Notice tone="info" title="Nothing is deleted on a schedule">
              There is no process running outside this tab, so a retention period is a measurement the interface shows rather than a job that runs. Every deletion is pressed by a person and written to the audit log.
            </Notice>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/forms/forms`)}>Review the form retention periods</Button>
          </Stack>
        </Card>
        <Card span={6} eyebrow="SETTINGS" prov="human" title="Operations settings" subtitle="Kept in this browser for this person">
          <Stack gap={3}>
            <Checkbox label="Run the diagnostics when the operations home opens" />
            <Checkbox label="Warn when storage passes seventy per cent of the quota" defaultChecked />
            <Checkbox label="Require a verified check before an incident can be resolved" defaultChecked disabled />
            <Checkbox label="Write an audit entry for every export" defaultChecked disabled />
            <Notice tone="info" title="Two of these cannot be turned off">
              Verification before resolution and an audit entry for every export are what make the other screens trustworthy, so they are shown as fixed rather than offered and ignored.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Audit") {
    const security = events.filter((event) => ["privacy", "export", "restore", "capability", "delete"].includes(event.type));
    return (
      <Stack gap={4}>
        <Row gap={2}>
          <Button variant="secondary" onClick={() => {
            downloadCsv(`${org.slug}-security-audit.csv`, ["at", "actor", "type", "message"],
              security.map((event) => [event.at, event.actor, event.type, event.message]));
            context.toast("Exported", `${security.length} audit entries written to CSV.`);
          }}>Export the audit</Button>
        </Row>
        {security.length === 0 ? <Empty title="No security-relevant entries yet" icon={<ShieldAlert size={20} />}>Reveals, exports, restores and provider attempts all appear here.</Empty> : (
          <DataGrid
            rows={security}
            rowId={(row) => row.id}
            label="Security audit"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
              { key: "actor", header: "Who", cell: (row) => row.actor },
              { key: "type", header: "Kind", cell: (row) => <Pill tone={row.type === "privacy" ? "warning" : "neutral"}>{row.type}</Pill> },
              { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
            ]}
          />
        )}
      </Stack>
    );
  }

  const alerts = [
    ...ui.results.filter((result) => result.state === "fail").map((result) => ({ id: result.id, title: result.label, detail: result.detail, tone: "danger" as const, source: "diagnostics" })),
    ...ui.sessionErrors.map((error) => ({ id: error.at, title: "Uncaught error in this session", detail: error.message, tone: "danger" as const, source: "browser" })),
    ...incidents.filter((record) => String(record.fields.severity) === "high" && record.status !== "resolved").map((record) => ({ id: record.id, title: record.title, detail: record.summary, tone: "warning" as const, source: "incident register" })),
  ];
  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Alerts" value={String(alerts.length)} prov="posted" meta="From checks, caught errors and the register" />
        <Stat label="Credentials held" value="0" prov="posted" meta="None, by design" />
        <Stat label="Access anomalies" value="Unavailable" unavailable meta="There is no account system to observe" />
        <Stat label="Threat feed" value="Unavailable" unavailable meta="No external feed is connected" />
      </StatRow>
      {alerts.length === 0 ? (
        <Empty title="No alert" icon={<ShieldCheckIcon />}>Nothing has failed, no error has been caught and no high-severity incident is open.</Empty>
      ) : (
        <Stack gap={2}>
          {alerts.map((alert) => (
            <Row key={alert.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
              <div className="ds-grow"><strong>{alert.title}</strong><p className="ds-subtle">{alert.detail}</p></div>
              <Pill tone={alert.tone}>{alert.source}</Pill>
            </Row>
          ))}
        </Stack>
      )}
      <Notice tone="warning" title="Containment is proposed, never self-authorised">
        If a connector were ever connected and misbehaving, this screen would propose revoking its grant. It would not revoke it, because an assistant that can widen or narrow its own access is not a safe assistant.
      </Notice>
    </Stack>
  );
}

function ShieldCheckIcon() {
  return <CheckCircle2 size={20} />;
}

/* ================================================================ *
 * ARL-IT-009 — Reliability Reports
 * ================================================================ */

export function ReliabilityReports({ context, lens }: { context: ScreenContext; lens: "Trends" | "Root causes" | "Capacity" | "Costs" }) {
  const incidents = useCollection("incidents").filter((record) => String(record.fields.kind ?? "incident") === "incident");
  const { ui } = useDiagnostics(context);
  const { org, now } = useWorkspace();

  const resolved = incidents.filter((record) => record.at && record.endAt);
  const mttrHours = resolved.length
    ? resolved.reduce((sum, record) => sum + (new Date(record.endAt!).getTime() - new Date(record.at!).getTime()), 0) / resolved.length / 3_600_000
    : undefined;

  if (lens === "Root causes") {
    const byCause = incidents.reduce<Record<string, number>>((map, record) => {
      const cause = String(record.fields.cause ?? "not recorded");
      map[cause] = (map[cause] ?? 0) + 1;
      return map;
    }, {});
    const entries = Object.entries(byCause).sort(([, a], [, b]) => b - a);
    return (
      <Stack gap={4}>
        {incidents.length === 0 ? <Empty title="No incidents to analyse" icon={<AlertTriangle size={20} />} /> : (
          <>
            <Card eyebrow="ROOT CAUSES" prov="posted" title="Recorded causes" subtitle={`${incidents.length} incidents on the register`}>
              <BarChart
                title="Incidents by recorded cause"
                height={200}
                format={(value) => String(Math.round(value))}
                series={[{ name: "Incidents", points: entries.map(([cause, count]) => ({ label: cause, value: count })) }]}
                footer="Counted from the cause written on each incident. Where none was written the row says so rather than guessing."
              />
            </Card>
            <Notice tone={entries.length && entries[0][1] > 1 ? "warning" : "info"} title={entries.length && entries[0][1] > 1 ? `${entries[0][1]} incidents share one cause` : "No cause repeats yet"}>
              {entries.length && entries[0][1] > 1
                ? `"${entries[0][0]}" is the most common. With ${incidents.length} incidents in total this is a small sample, so it is a pattern worth watching rather than a conclusion.`
                : "A structural fix needs a cause that recurs. None does yet."}
            </Notice>
          </>
        )}
      </Stack>
    );
  }

  if (lens === "Capacity") {
    return <StoragePanel context={context} />;
  }

  if (lens === "Costs") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Infrastructure" value={context.money(0)} prov="posted" meta="Nothing is hosted" />
          <Stat label="Providers" value={context.money(0)} prov="posted" meta="Nothing is connected" />
          <Stat label="Storage" value={ui.storage?.supported ? formatBytes(ui.storage.usageBytes) : "Not measured"} prov={ui.storage?.supported ? "posted" : undefined} unavailable={!ui.storage?.supported} meta="On this device, at no cost" />
          <Stat label="Forecast" value="Unavailable" unavailable meta="A forecast needs a price list and a volume" />
        </StatRow>
        <Notice tone="info" title="Nought here is a measurement, not an omission">
          No service is paid for, because none is used. The only resource consumed is space on this device, and that figure comes from the browser.
        </Notice>
      </Stack>
    );
  }

  const months = [5, 4, 3, 2, 1, 0].map((back) => {
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
    return {
      label: start.toLocaleString(org.locale, { month: "short" }),
      value: incidents.filter((record) => record.at && new Date(record.at) >= start && new Date(record.at) < end).length,
    };
  });

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Incidents" value={String(incidents.length)} prov="posted" meta="On the register in this workspace" />
        <Stat label="Open" value={String(incidents.filter((record) => record.status !== "resolved").length)} prov="posted" meta="Not yet verified and closed" />
        <Stat
          label="Mean time to resolve"
          value={mttrHours === undefined ? "Unavailable" : `${mttrHours.toFixed(1)} h`}
          prov={mttrHours === undefined ? undefined : "posted"}
          unavailable={mttrHours === undefined}
          meta={mttrHours === undefined ? "No incident has both a start and an end recorded" : `From ${resolved.length} resolved incidents`}
        />
        <Stat label="Availability" value="Unavailable" unavailable meta="Nothing is served, so there is no uptime to measure" />
      </StatRow>
      <Card eyebrow="TREND" prov="posted" title="Incidents by month" subtitle="Counted from the dates on the register">
        <BarChart
          title="Incidents opened by month"
          height={220}
          format={(value) => String(Math.round(value))}
          series={[{ name: "Incidents", points: months }]}
          footer={`${incidents.length} incidents in total. With a register this small a trend line would be noise, so the counts are shown without one.`}
        />
      </Card>
      <Notice tone="info" title="Every figure here comes from a record">
        Mean time to resolve is computed from the start and end written on each incident. Where an incident has no end, it is excluded and the count says how many were used.
      </Notice>
    </Stack>
  );
}

/* ---------------------------------------------------------------- *
 * Overlay bodies
 * ---------------------------------------------------------------- */

export function ServiceInspector({ context }: { context: ScreenContext }) {
  const { ui } = useDiagnostics(context);
  const payload = context.overlayPayload as { group?: CheckResult["group"] } | undefined;
  const rows = ui.results.filter((result) => (payload?.group ? result.group === payload.group : true));
  return (
    <Stack gap={3}>
      {rows.length === 0 ? (
        <Notice tone="info" title="Nothing has been measured yet">Run the checks on the health screen and the detail appears here.</Notice>
      ) : (
        <div className="t6-checks">{rows.map((result) => <CheckRow key={result.id} result={result} />)}</div>
      )}
    </Stack>
  );
}

export function IncidentCreate({ context, close }: { context: ScreenContext; close: () => void }) {
  const { now } = useWorkspace();
  const connectors = useCollection("connectors");
  return (
    <form
      id="incident-create"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const created = await context.mutate.create({
          collection: "incidents",
          title: String(data.get("title") ?? "Incident"),
          status: "open",
          summary: String(data.get("summary") ?? ""),
          at: now.toISOString(),
          fields: {
            kind: "incident",
            severity: String(data.get("severity") ?? "medium"),
            service: String(data.get("service") ?? "Workspace"),
            origin: String(data.get("origin") ?? "ours"),
            owner: context.actor,
            impact: String(data.get("impact") ?? ""),
            connectorId: String(data.get("connectorId") ?? ""),
          },
        }, `Incident opened: ${String(data.get("title") ?? "Incident")}`);
        context.toast("Incident opened", `${created.title} is on the register and cannot be resolved until a check verifies the fix.`);
        close();
      }}
    >
      <Field label="What is wrong" required><TextInput name="title" required /></Field>
      <Row gap={2}>
        <Field label="Severity">
          <Select name="severity" defaultValue="medium">{["low", "medium", "high"].map((level) => <option key={level} value={level}>{level}</option>)}</Select>
        </Field>
        <Field label="Service">
          <Select name="service" defaultValue="Workspace">{["Workspace", "Storage", "Connectors", "Site export", "App builder"].map((service) => <option key={service} value={service}>{service}</option>)}</Select>
        </Field>
        <Field label="Origin" hint="Ours or a third party's. The distinction changes what can be done.">
          <Select name="origin" defaultValue="ours"><option value="ours">ours</option><option value="provider">provider</option></Select>
        </Field>
      </Row>
      <Field label="Related connector">
        <Select name="connectorId" defaultValue=""><option value="">None</option>{connectors.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</Select>
      </Field>
      <Field label="What is affected"><TextInput name="impact" placeholder="Outbound mail stays in draft" /></Field>
      <Field label="Detail"><TextArea name="summary" rows={3} /></Field>
      <Notice tone="info" title="Resolution will need a verified check">
        This incident cannot be closed until the diagnostics have been run after it was opened. That rule is enforced by the resolve action, not by a reminder.
      </Notice>
    </form>
  );
}

export function HealthTestOverlay({ context }: { context: ScreenContext }) {
  const { ui, run } = useDiagnostics(context);
  const totals = summarise(ui.results);
  return (
    <Stack gap={4}>
      <FactGrid columns={4} items={[
        { label: "Passed", value: String(totals.pass), mono: true, tone: "success" },
        { label: "To review", value: String(totals.warn), mono: true, tone: totals.warn ? "warning" : undefined },
        { label: "Failed", value: String(totals.fail), mono: true, tone: totals.fail ? "danger" : undefined },
        { label: "Not measurable", value: String(totals.unavailable), mono: true },
      ]} />
      <Row gap={3} wrap>
        <Button variant="primary" busy={ui.running} onClick={() => void run()}>Run the checks now</Button>
        <span className="ds-subtle">{ui.ranAt ? `Last run ${context.dateTime(ui.ranAt)}` : "Not run in this session"}</span>
      </Row>
      {ui.results.length > 0 && <OverlaySection title="Results" flush><div className="t6-checks">{ui.results.slice(0, 6).map((result) => <CheckRow key={result.id} result={result} />)}</div></OverlaySection>}
    </Stack>
  );
}

export function MonitorRule({ context }: { context: ScreenContext }) {
  const { ui } = useDiagnostics(context);
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="A monitor needs something that runs">
        Nothing executes while this tab is closed, so a monitor here can only check when someone opens the screen. That is what the setting below does, and the wording says so rather than implying a watchdog.
      </Notice>
      <Checkbox label="Run the checks automatically when the operations home opens" />
      <Field label="Warn when storage passes">
        <Select defaultValue="70">{["50", "70", "85", "95"].map((value) => <option key={value} value={value}>{value}% of the quota</option>)}</Select>
      </Field>
      <KeyValueList items={[
        { label: "Current usage", value: ui.storage?.supported ? <span className="ds-num">{formatBytes(ui.storage.usageBytes)}</span> : "Not measured" },
        { label: "Alerting channel", value: <Pill tone="warning" dot>none connected</Pill> },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Open the diagnostics</Button>
    </Stack>
  );
}

export function TraceWaterfall({ context }: { context: ScreenContext }) {
  const events = useEvents();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const event = events.find((item) => item.id === payload?.id) ?? events[0];
  if (!event) return <Empty title="No entry selected" icon={<Activity size={20} />} />;
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "When", value: context.dateTime(event.at), mono: true },
        { label: "Actor", value: event.actor },
        { label: "Kind", value: <Pill tone="neutral">{event.type}</Pill> },
        { label: "Screen", value: event.screenId ?? "—", mono: true },
        { label: "Record", value: event.entityId ?? "—", mono: true },
      ]} />
      <OverlaySection title="What was recorded">{event.message}</OverlaySection>
      <Notice tone="info" title="No field values are in this entry">
        An audit entry names what changed and on which record. The values themselves stay on the record, where the screen that owns them decides whether to show them.
      </Notice>
    </Stack>
  );
}

export function RedactionRules() {
  return (
    <Stack gap={3}>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">What is written to a log and what is not</caption>
          <thead><tr><th scope="col">Kind of data</th><th scope="col">In the audit log</th></tr></thead>
          <tbody>
            <tr><td>Record title and id</td><td><Pill tone="success">written</Pill></td></tr>
            <tr><td>What changed</td><td><Pill tone="success">written</Pill></td></tr>
            <tr><td>Form answer values</td><td><Pill tone="danger">never written</Pill></td></tr>
            <tr><td>Email addresses from a submission</td><td><Pill tone="danger">never written</Pill></td></tr>
            <tr><td>Credentials</td><td><Pill tone="danger">none exist to write</Pill></td></tr>
          </tbody>
        </table>
      </div>
      <Notice tone="info" title="The rule is in the write path, not in the reader">
        Log entries are composed from the record's title and the name of the change. There is no code path that copies a field value into one, which is why nothing has to be filtered out afterwards.
      </Notice>
    </Stack>
  );
}

export function SavedFilter({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Field label="Name"><TextInput placeholder="Exports by Maya" /></Field>
      <Field label="Kinds to keep">
        <Select defaultValue="export">{["export", "privacy", "restore", "capability", "update", "diagnostic"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</Select>
      </Field>
      <Notice tone="info" title="Saved in this browser for this person">
        A filter is a preference, not a record anyone else sees. Sharing one would need an account system.
      </Notice>
      <Button variant="secondary" onClick={() => context.closeOverlay()}>Close</Button>
    </Stack>
  );
}

export function ReportBuilder({ context }: { context: ScreenContext }) {
  const incidents = useCollection("incidents");
  const { ui } = useDiagnostics(context);
  const { org } = useWorkspace();
  return (
    <Stack gap={3}>
      <KeyValueList items={[
        { label: "Incidents available", value: <span className="ds-num">{String(incidents.length)}</span> },
        { label: "Check results available", value: <span className="ds-num">{String(ui.results.length)}</span> },
        { label: "Source", value: "Records and measurements in this browser" },
      ]} />
      <Notice tone="info" title="A report is only as real as its rows">
        Everything exported below comes from a record or from a check that ran. Nothing is modelled or estimated to fill a gap.
      </Notice>
      <Row gap={2} wrap>
        <Button variant="primary" onClick={() => {
          downloadCsv(`${org.slug}-reliability.csv`, ["incident", "severity", "status", "opened", "resolved", "cause"],
            incidents.map((record) => [record.title, String(record.fields.severity ?? ""), record.status, record.at ?? "", record.endAt ?? "", String(record.fields.cause ?? "")]));
          context.toast("Exported", `${incidents.length} incidents written to CSV.`);
        }}>Export the incidents</Button>
        <Button variant="secondary" disabled={ui.results.length === 0} onClick={() => {
          downloadFile(`${org.slug}-diagnostics.json`, JSON.stringify({ ranAt: ui.ranAt, results: ui.results, counts: ui.counts, storage: ui.storage }, null, 2), "application/json");
          context.toast("Exported", "The last diagnostics run was written as JSON, with the method for every check.");
        }}>Export the last run</Button>
      </Row>
    </Stack>
  );
}

export function BackupOverlay({ context }: { context: ScreenContext }) {
  return <BackupRestore context={context} />;
}
