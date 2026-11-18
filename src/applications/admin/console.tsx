import { useMemo, useState } from "react";
import { Database, FileClock, KeyRound, Lock, Scale, Server } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, ModalActions, ModalInFlight, Notice, OverlayCancel, Pill,
  Properties, Row, Select, Stack, Stat, StatRow, Switch, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useEvents, useOrgRecords, useWorkspace } from "@/platform/workspace";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import { ROLE_LABELS } from "@/platform/policy";
import type { Audit, Rec } from "@/domain/types";
import { csvCell, csvList, ofKind, SeedsFailedNotice, StepUp, useAdmin, useSeeded, useSeedStatus, useSettledOrgRecords } from "./pieces";
import { clockIso } from "@/platform/clock";
import { revisedRecord } from "@/platform/repo";

/* ====================================================================== *
 * ADMIN console — security, audit, privacy, billing, recovery, developer.
 * ====================================================================== */

function download(name: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function quote(value: unknown): string {
  return csvCell(value);
}

/* ---------------------------- ADMIN-006 ---------------------------- */

export function SecurityScreen({ context, tab }: { context: ScreenContext; tab: "Authentication" | "Sessions" | "Devices" | "Threats" }) {
  const data = useAdmin();
  const policy = ofKind(data.policies, "authPolicy")[0];
  const sessions = data.sessions;

  if (tab === "Authentication") {
    return (
      <Grid>
        <Card eyebrow="SIGN-IN" prov="human" span={7} title="Sign-in" subtitle={policy?.summary ?? "No sign-in policy recorded"}>
          <Stack gap={3}>
            <Notice tone="warning" title="There is no identity provider">
              Role views are chosen in this browser from the account menu. Nothing here authenticates anybody, so every setting below
              is a statement of intent that a future service would enforce.
            </Notice>
            <Properties rows={[
              { label: "Single sign-on", value: <Pill tone={CAPABILITY_TONE.not_connected}>{CAPABILITY_LABELS.not_connected}</Pill> },
              { label: "Provider", value: String(policy?.fields.provider ?? "None") },
              { label: "Session length", value: `${String(policy?.fields.sessionHours ?? 12)} hours` },
              { label: "Trusted addresses", value: String(policy?.fields.trustedIps ?? "") || "None recorded" },
            ]} />
            {policy && (
              <Stack gap={2}>
                <Row gap={3}>
                  <span className="ds-grow">Require a second factor for everybody</span>
                  <Switch
                    label="Require MFA for everybody"
                    checked={policy.fields.mfaRequired === true}
                    onChange={() => context.openOverlay("security review", { setting: "mfaRequired" })}
                  />
                </Row>
                <Row gap={3}>
                  <span className="ds-grow">Require a second factor for the owner view</span>
                  <Switch
                    label="Require MFA for the owner view"
                    checked={policy.fields.mfaRequiredForOwner === true}
                    onChange={() => context.openOverlay("security review", { setting: "mfaRequiredForOwner" })}
                  />
                </Row>
                <Row gap={3}>
                  <span className="ds-grow">Ask for a typed confirmation on sensitive changes</span>
                  <Switch label="Step up on sensitive changes" checked={policy.fields.stepUpForSensitive === true} onChange={() => context.openOverlay("security review", { setting: "stepUpForSensitive" })} />
                </Row>
              </Stack>
            )}
            <Button variant="secondary" onClick={() => context.openOverlay("Provider setup")}>Configure single sign-on</Button>
          </Stack>
        </Card>
        <Card eyebrow="SECOND FACTOR" prov="posted" span={5} title="Second factor by person" subtitle={`${data.members.filter((row) => row.fields.mfa === true).length} of ${data.members.filter((row) => row.fields.kind === "human").length} people`}>
          <Stack gap={2}>
            {data.members.filter((row) => row.fields.kind === "human").map((member) => (
              <Row key={member.id} gap={2}>
                <span className="ds-grow ds-truncate">{member.title}</span>
                <Pill tone={member.fields.mfa === true ? "success" : "warning"}>{member.fields.mfa === true ? "On" : "Off"}</Pill>
              </Row>
            ))}
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (tab === "Sessions") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="posted" label="Active sessions" value={String(sessions.filter((row) => row.status === "active").length)} meta={`${sessions.length} recorded`} />
          <Stat prov="posted" label="Without a second factor" value={String(sessions.filter((row) => row.status === "active" && row.fields.mfa !== true).length)} meta="Local records only" />
          <Stat prov="posted" label="On untrusted devices" value={String(sessions.filter((row) => row.status === "active" && row.fields.trusted !== true).length)} meta="Device first seen recently" />
          <Stat prov="posted" label="This session" value="1" meta="Marked below as current" />
        </StatRow>
        <Card eyebrow="SESSIONS" prov="posted" title="Sessions" flush>
          <DataGrid
            rows={sessions}
            rowId={(row) => row.id}
            label="Sessions"
            selectedId={context.selectedId}
            onSelect={context.select}
            rowTone={(row) => (row.status === "active" && row.fields.trusted !== true ? "warning" : undefined)}
            columns={[
              {
                key: "title", header: "Session", primary: true,
                cell: (row) => (
                  <div>
                    <strong>{row.title}{row.fields.current === true ? " · this session" : ""}</strong>
                    <p className="ds-subtle">{String(row.fields.agent ?? "")}</p>
                  </div>
                ),
                filterValue: (row) => `${row.title} ${String(row.fields.member ?? "")} ${String(row.fields.device ?? "")}`,
              },
              { key: "member", header: "Person", hideBelow: 1100, cell: (row) => String(row.fields.member ?? "") },
              { key: "where", header: "Where", hideBelow: 1200, cell: (row) => `${String(row.fields.location ?? "")} · ${String(row.fields.ip ?? "")}` },
              { key: "mfa", header: "Second factor", cell: (row) => (row.fields.mfa === true ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">No</Pill>) },
              { key: "seen", header: "Last seen", align: "end", cell: (row) => <span className="ds-num">{context.relative(String(row.fields.lastSeenAt ?? row.updatedAt))}</span>, sortValue: (row) => String(row.fields.lastSeenAt ?? "") },
              { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Pill> },
            ]}
            bulkActions={[
              {
                label: "Revoke",
                tone: "danger",
                onRun: (selected) => {
                  const revokable = selected.filter((row) => row.fields.current !== true && row.status === "active");
                  void Promise.all(revokable.map((row) => context.mutate.patch(row.id, { status: "revoked", fields: { ...row.fields, revokedBy: context.actor, revokedAt: context.now.toISOString() } }, { event: `Session revoked: ${row.title}` })))
                    .then(() => context.toast(
                      "Revoked",
                      selected.length === revokable.length
                        ? `${revokable.length} ${revokable.length === 1 ? "session" : "sessions"} revoked.`
                        : `${revokable.length} revoked. Your own session was left alone.`,
                    ));
                },
                disabled: (selected) => selected.every((row) => row.status !== "active" || row.fields.current === true),
              },
            ]}
            empty={<Empty title="No sessions recorded" icon={<Lock size={20} />}>Sessions are records in this workspace, not live connections.</Empty>}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Devices") {
    return (
      <Grid>
        {data.devices.map((device) => (
          <Card key={device.id} eyebrow="DEVICE" prov="posted" span={4} title={device.title} subtitle={String(device.fields.platform ?? "")}>
            <Stack gap={3}>
              <Row gap={2} wrap>
                <Pill tone={device.status === "trusted" ? "success" : device.status === "blocked" ? "danger" : "warning"}>{device.status}</Pill>
                <Pill>{String(device.fields.member ?? "")}</Pill>
              </Row>
              <p className="ds-subtle">{device.summary}</p>
              <Properties rows={[
                { label: "First seen", value: context.relative(String(device.fields.firstSeenAt ?? device.createdAt)) },
                { label: "Last seen", value: context.relative(String(device.fields.lastSeenAt ?? device.updatedAt)) },
              ]} />
              <Row gap={2}>
                <Button
                  size="sm"
                  variant={device.status === "trusted" ? "ghost" : "secondary"}
                  onClick={async () => {
                    const next = device.status === "trusted" ? "untrusted" : "trusted";
                    await context.mutate.patch(device.id, { status: next, fields: { ...device.fields, trusted: next === "trusted", changedBy: context.actor } }, { event: `Device marked ${next}: ${device.title}`, expectRevision: device.revision });
                    context.toast(next === "trusted" ? "Device trusted" : "Trust removed", `${device.title} is now ${next}.`);
                  }}
                >
                  {device.status === "trusted" ? "Remove trust" : "Trust device"}
                </Button>
              </Row>
            </Stack>
          </Card>
        ))}
        {data.devices.length === 0 && <Empty title="No devices" icon={<Lock size={20} />}>Devices appear when a session records one.</Empty>}
      </Grid>
    );
  }

  const anomalies = sessions
    .filter((row) => row.status === "active" && (row.fields.anomaly || row.fields.trusted !== true || row.fields.mfa !== true))
    .map((row) => ({
      id: row.id,
      title: row.title,
      detail: String(row.fields.anomaly ?? (row.fields.trusted !== true ? "Device is not recognised." : "No second factor on this session.")),
      tone: (row.fields.anomaly ? "danger" : "warning") as "danger" | "warning",
    }));

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Found by comparing records, not by watching traffic">
        These are patterns in the session records held here: a device first seen recently, two sign-ins minutes apart, a session with no
        second factor. No credential is read and nothing is sent anywhere to be analysed.
      </Notice>
      {anomalies.length === 0 ? (
        <Empty title="Nothing stands out" icon={<Lock size={20} />}>Every active session is on a recognised device with a second factor.</Empty>
      ) : (
        anomalies.map((anomaly) => (
          <Notice
            key={anomaly.id}
            tone={anomaly.tone}
            title={anomaly.title}
            actions={<Button size="sm" variant="secondary" onClick={() => { context.select(anomaly.id); context.openOverlay("emergency revoke", { id: anomaly.id }); }}>Revoke</Button>}
          >
            {anomaly.detail}
          </Notice>
        ))
      )}
    </Stack>
  );
}

export function ProviderSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const [provider, setProvider] = useState("saml");
  const [domainHint, setDomainHint] = useState("");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="This cannot be completed in this build">
        Single sign-on needs a server to receive the assertion. The configuration is kept as a record so it is ready, and the state
        stays Configuration required rather than pretending to be connected.
      </Notice>
      <Field label="Protocol">
        <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="saml">SAML 2.0</option>
          <option value="oidc">OpenID Connect</option>
        </Select>
      </Field>
      <Field label="Identity provider domain"><TextInput value={domainHint} onChange={(event) => setDomainHint(event.target.value)} placeholder="login.example.com" /></Field>
      <Properties rows={[
        { label: "Reply URL", value: <span className="ds-num">not available without a server</span> },
        { label: "Entity id", value: <span className="ds-num">arlovi:{context.org.slug}</span> },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!domainHint}
          onClick={async () => {
            const policy = { kind: "authPolicy", sso: "configuration_required", provider: `${provider.toUpperCase()} · ${domainHint}`, mfaRequired: false, mfaRequiredForOwner: true, sessionHours: 12, stepUpForSensitive: true };
            await context.mutate.create({
              collection: "policies",
              title: `Single sign-on draft (${provider.toUpperCase()})`,
              status: "draft",
              summary: `Configuration kept for ${domainHint}. Nothing is connected.`,
              fields: policy,
            }, `Single sign-on configuration drafted for ${domainHint}`);
            context.toast("Configuration saved", "It is a draft record. Sign-on stays unconnected until a server can complete it.", "blocked");
            close();
          }}
        >
          Save configuration
        </Button>
      </Row>
    </Stack>
  );
}

export function EmergencyRevoke({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const initialId = payload?.id ?? context.selectedId ?? "";
  const active = data.sessions.filter(row => row.status === "active" && row.fields.current !== true);
  const [scope, setScope] = useState<"single" | "all" | "none">(initialId ? "single" : "none");
  const [selectedId, setSelectedId] = useState(initialId);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = scope === "all" ? active : scope === "single"
    ? active.filter(row => row.id === selectedId) : [];
  const canSubmit = context.can("manage_policy") && !busy && target.length > 0 && confirmation === "REVOKE";

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Notice tone="warning" title="Record a session revocation — not a live provider logout">
        This action changes Arlovi's local session records. No identity provider is connected,
        so it cannot terminate a remote device session or force a user to sign out.
      </Notice>
      <Field label="Revocation scope" required>
        <Select aria-label="Revocation scope" value={scope} disabled={busy}
          onChange={event => { setScope(event.target.value as "single" | "all" | "none"); setConfirmation(""); setError(""); }}>
          <option value="none">Choose which sessions to record</option>
          <option value="single">One other active session</option>
          <option value="all">All other active sessions ({active.length})</option>
        </Select>
      </Field>
      {scope === "single" && (
        <Field label="Session" required>
          <Select aria-label="Session" value={selectedId} disabled={busy}
            onChange={event => { setSelectedId(event.target.value); setConfirmation(""); setError(""); }}>
            <option value="">Select an active session</option>
            {active.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
          </Select>
        </Field>
      )}
      {scope === "all" && <Notice tone="danger" title="Bulk revocation affects every other active session">
        {active.length} active session record(s) will be marked revoked. The current local session remains unchanged.
      </Notice>}
      <Properties rows={[
        { label: "Affected session records", value: String(target.length) },
        { label: "Sessions", value: target.map(row => row.title).join("; ") || "None selected" },
        { label: "Current session", value: "Not included in the revocation" },
        { label: "Real provider sign-out", value: "Not connected; no remote session termination" },
      ]} />
      {target.length > 0 && (
        <Field label="Type REVOKE to confirm" required>
          <TextInput aria-label="Type REVOKE to confirm" value={confirmation}
            disabled={busy} autoComplete="off"
            onChange={event => setConfirmation(event.target.value.toUpperCase())} />
        </Field>
      )}
      {error && <Notice tone="danger" title="Revocation could not be recorded">{error}</Notice>}
      <ModalActions>
        <OverlayCancel disabled={busy}>Cancel</OverlayCancel>
        <span className="ds-grow" />
        <Button variant="danger" busy={busy} disabled={!canSubmit}
          onClick={async () => {
            if (!canSubmit) return;
            setBusy(true);
            setError("");
            try {
              const editor = { actor: context.actor, now: clockIso() };
              const records = target.map(row => revisedRecord(row, {
                status: "revoked", fields: { ...row.fields,
                  revokedBy: context.actor, revokedAt: editor.now },
              }, editor));
              await context.mutate.putMany(
                records,
                target.map(row => `Session revocation recorded for ${row.title} by ${context.actor}`),
                Object.fromEntries(target.map(row => [row.id, row.revision])),
                target.map(() => "update"),
              );
              context.toast("Session records marked revoked",
                `${target.length} session record(s) updated locally. No remote identity provider was contacted.`);
              close();
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : "The sessions may have changed. Reload before retrying.";
              setError(message);
              context.toast("Revocation not recorded", message, "failed");
            } finally { setBusy(false); }
          }}>
          Record revocation{target.length > 0 ? ` (${target.length})` : ""}
        </Button>
      </ModalActions>
    </Stack>
  );
}

export function SecurityReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const policy = ofKind(data.policies, "authPolicy")[0];
  const payload = context.overlayPayload as { setting?: string } | undefined;
  const setting = payload?.setting ?? "mfaRequired";
  const [busy, setBusy] = useState(false);
  if (!policy) return <Empty title="No sign-in policy" icon={<Lock size={20} />}>Create one from Configure single sign-on.</Empty>;
  const current = policy.fields[setting] === true;
  const label: Record<string, string> = {
    mfaRequired: "Require a second factor for everybody",
    mfaRequiredForOwner: "Require a second factor for the owner view",
    stepUpForSensitive: "Ask for a typed confirmation on sensitive changes",
  };

  return (
    <StepUp
      word="CONFIRM"
      tone="primary"
      label={`${current ? "Turn off" : "Turn on"}: ${label[setting] ?? setting}`}
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          await context.mutate.patch(policy.id, { fields: { ...policy.fields, [setting]: !current, changedBy: context.actor } }, { event: `${label[setting] ?? setting} ${current ? "disabled" : "enabled"}`, expectRevision: policy.revision });
          context.toast("Policy changed", "The sign-in policy record carries the change, and the audit trail names you.");
          close();
        } finally { setBusy(false); }
      }}
    >
      <Properties rows={[
        { label: "Setting", value: label[setting] ?? setting },
        { label: "Now", value: current ? "On" : "Off" },
        { label: "After", value: current ? "Off" : "On" },
        { label: "People affected", value: String(data.members.filter((row) => row.fields.kind === "human").length) },
      ]} />
      <Notice tone="warning" title="Nothing enforces this yet">
        With no identity provider, a requirement here cannot stop anybody signing in. It records the intention and shows in the console
        as unenforced.
      </Notice>
    </StepUp>
  );
}

/* ---------------------------- ADMIN-007 ---------------------------- */

type AuditTab = "All" | "Access" | "Data" | "Financial" | "AI";

function auditClass(event: Audit): AuditTab {
  if (event.type.startsWith("access") || event.type.startsWith("developer")) return "Access";
  if (event.type.startsWith("data") || event.type.startsWith("privacy") || event.type.startsWith("recovery")) return "Data";
  if (event.type.startsWith("financial") || event.type.startsWith("approval") || event.type.startsWith("billing")) return "Financial";
  if (event.type.startsWith("ai") || event.type.startsWith("capability")) return "AI";
  return "All";
}

export function AuditScreen({ context, tab }: { context: ScreenContext; tab: AuditTab }) {
  const events = useEvents(undefined, 400);
  // Newest first by the moment each event happened, compared as instants rather than strings.
  const rows = useMemo(() => {
    const scoped = tab === "All" ? events : events.filter((event) => auditClass(event) === tab);
    const when = (event: Audit) => { const time = Date.parse(event.at); return Number.isNaN(time) ? 0 : time; };
    return scoped.map((event, index) => ({ event, index })).sort((a, b) => when(b.event) - when(a.event) || a.index - b.index).map((item) => item.event);
  }, [events, tab]);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Append-only by construction">
        The audit log is written as events happen and this console offers no way to edit or remove one. Nothing here can rewrite the
        past; it can only add to it. A tamper-evident chain would need a server to sign each entry.
      </Notice>
      <Card eyebrow="AUDIT TRAIL" prov="posted" title={`${rows.length} entries`} subtitle={tab === "All" ? "Everything recorded in this workspace" : `${tab} entries only`} flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Audit trail"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Audit detail", { id }); }}
          columns={[
            { key: "at", header: "When", width: "170px", cell: (row) => <time className="ds-num" dateTime={row.at} title={context.dateTime(row.at)}>{context.relative(row.at)}</time>, sortValue: (row) => new Date(row.at).getTime() },
            {
              key: "actor", header: "Who", width: "180px",
              cell: (row) => <Row gap={2}><Pill tone={row.actor === "system" ? "accent" : "neutral"}>{row.actor === "system" ? "System" : row.actor}</Pill></Row>,
              filterValue: (row) => row.actor,
              sortValue: (row) => row.actor,
            },
            {
              key: "type", header: "Action", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.type}</strong>
                  <p className="ds-subtle" style={{ maxWidth: "70ch" }}>{row.message}</p>
                  <span className="ds-subtle ds-num">{row.screenId ?? "no screen recorded"}</span>
                </div>
              ),
              filterValue: (row) => `${row.type} ${row.message} ${row.screenId ?? ""}`,
              sortValue: (row) => row.type,
            },
            { key: "target", header: "Target", width: "180px", cell: (row) => (row.entityId ? <span className="ds-num">{row.entityId}</span> : <span className="ds-subtle">—</span>) },
            {
              key: "outcome", header: "Outcome", align: "end",
              cell: (row) => (row.capability ? <Pill tone={CAPABILITY_TONE[row.capability]}>{CAPABILITY_LABELS[row.capability]}</Pill> : <span className="ds-subtle">—</span>),
            },
          ]}
          empty={<Empty title="No entries in this category" icon={<FileClock size={20} />}>Entries are written as records change.</Empty>}
        />
      </Card>
    </Stack>
  );
}

export function AuditDetail({ context }: { context: ScreenContext }) {
  const events = useEvents(undefined, 400);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const event = events.find((row) => row.id === (payload?.id ?? context.selectedId));
  if (!event) return <Empty title="Select an entry" icon={<FileClock size={20} />}>Choose a row to see the whole receipt.</Empty>;
  const chain = events.filter((row) => event.entityId && row.entityId === event.entityId);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Entry id", value: <span className="ds-num">{event.id}</span> },
        { label: "When", value: `${context.dateTime(event.at)} (${context.relative(event.at)})` },
        { label: "Who", value: event.actor === "system" ? "System (no person)" : event.actor },
        { label: "Action", value: <span className="ds-num">{event.type}</span> },
        { label: "Target", value: event.entityId ? <span className="ds-num">{event.entityId}</span> : "None" },
        { label: "Raised from", value: event.screenId ?? "Not recorded" },
        { label: "Outcome", value: event.capability ? <Pill tone={CAPABILITY_TONE[event.capability]}>{CAPABILITY_LABELS[event.capability]}</Pill> : "Not recorded" },
      ]} />
      <Notice tone="neutral" title="What was written">{event.message}</Notice>
      {chain.length > 1 && (
        <Button variant="secondary" onClick={() => context.openOverlay("event chain", { entityId: event.entityId })}>
          See the other {chain.length - 1} {chain.length - 1 === 1 ? "entry" : "entries"} on this record
        </Button>
      )}
    </Stack>
  );
}

export function EventChain({ context }: { context: ScreenContext }) {
  const events = useEvents(undefined, 400);
  const payload = context.overlayPayload as { entityId?: string } | undefined;
  const entityId = payload?.entityId;
  const chain = events.filter((row) => row.entityId === entityId).sort((a, b) => a.at.localeCompare(b.at));
  if (!entityId || chain.length === 0) return <Empty title="No chain" icon={<FileClock size={20} />}>This entry does not name a record, so there is nothing to follow.</Empty>;
  return (
    <Stack gap={4}>
      <h3><span className="ds-num">{entityId}</span></h3>
      <Stack gap={2}>
        {chain.map((event, index) => (
          <Row key={event.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
            <strong className="ds-num" style={{ width: 24 }}>{index + 1}</strong>
            <div className="ds-grow">
              <strong>{event.type}</strong>
              <p className="ds-subtle">{event.message}</p>
              <span className="ds-subtle">{context.dateTime(event.at)} · {event.actor}</span>
            </div>
            {event.capability && <Pill tone={CAPABILITY_TONE[event.capability]}>{CAPABILITY_LABELS[event.capability]}</Pill>}
          </Row>
        ))}
      </Stack>
      <Notice tone="info" title="In order, never reordered">
        The chain is every entry naming this record, oldest first. Entries are only ever added.
      </Notice>
    </Stack>
  );
}

export function ExportAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const events = useEvents(undefined, 400);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<AuditTab>("All");
  const [busy, setBusy] = useState(false);
  const allowed = context.can("export_data");
  const rows = scope === "All" ? events : events.filter((event) => auditClass(event) === scope);

  return (
    <Stack gap={4}>
      {!allowed && (
        <Notice tone="warning" title={`The ${ROLE_LABELS[context.role]} view does not export data`}>
          Exporting is offered to views that hold the export capability. This shapes the interface; it is not server-side enforcement.
        </Notice>
      )}
      <Field label="Which entries">
        <Select value={scope} onChange={(event) => setScope(event.target.value as AuditTab)}>
          {(["All", "Access", "Data", "Financial", "AI"] as AuditTab[]).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </Select>
      </Field>
      <Field label="Why this export is needed" required hint="Written into the audit trail with the export itself.">
        <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Evidence pack for the October close" />
      </Field>
      <Properties rows={[
        { label: "Entries", value: String(rows.length) },
        { label: "Format", value: "CSV, written in this browser" },
        { label: "Leaves this device", value: "Only if you choose to share the downloaded file" },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!allowed || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const header = "at,actor,type,message,target,screen,outcome\n";
              const body = rows.map((event) => [event.at, event.actor, event.type, event.message, event.entityId, event.screenId, event.capability].map(quote).join(",")).join("\n");
              download(`${context.org.slug}-audit-${scope.toLowerCase()}.csv`, header + body);
              await context.mutate.log(`Audit export of ${rows.length} ${scope} entries. Reason: ${reason}`, { type: "data.export_authorised", capability: "ready_local" });
              context.toast("Exported", `${rows.length} entries downloaded, and the export itself is now an audit entry.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Authorise and export
        </Button>
      </Row>
    </Stack>
  );
}

export function AuditFilter({ context }: { context: ScreenContext }) {
  const events = useEvents(undefined, 400);
  const counts = (["All", "Access", "Data", "Financial", "AI"] as AuditTab[]).map((tab) => ({
    tab,
    count: tab === "All" ? events.length : events.filter((event) => auditClass(event) === tab).length,
  }));
  const actors = [...new Set(events.map((event) => event.actor))];
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {counts.map((entry) => (
          <Row key={entry.tab} gap={2}>
            <Button variant={context.tab === entry.tab ? "secondary" : "ghost"} className="ds-grow" style={{ justifyContent: "flex-start" }} onClick={() => context.setTab(entry.tab)}>
              {entry.tab}
            </Button>
            <Pill>{entry.count}</Pill>
          </Row>
        ))}
      </Stack>
      <Properties rows={[
        { label: "Distinct actors", value: actors.join(", ") },
        { label: "Oldest entry", value: context.dateTime([...events].sort((a, b) => a.at.localeCompare(b.at))[0]?.at) },
        { label: "Newest entry", value: context.dateTime([...events].sort((a, b) => b.at.localeCompare(a.at))[0]?.at) },
      ]} />
      <Notice tone="info" title="Free text as well">
        The table's own filter searches the action and the message, so a record id or a phrase narrows the list further.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- ADMIN-008 ---------------------------- */

type PrivacyTab = "Retention" | "Consent" | "Requests" | "Processing" | "Residency";

export function PrivacyScreen({ context, tab }: { context: ScreenContext; tab: PrivacyTab }) {
  const data = useAdmin();
  const { now } = useWorkspace();
  const settledRecords = useSettledOrgRecords();
  const seeds = useSeedStatus();
  const seedsFailed = seeds.status === "failed";
  const counting = settledRecords === null;
  const records = settledRecords ?? [];

  if (tab === "Retention") {
    const schedules = ofKind(data.policies, "retention");
    return (
      <Stack gap={4}>
        <Card eyebrow="RETENTION" prov="human" title={`${schedules.length} retention schedules`} subtitle="What is kept, for how long, and what prevents deletion" flush>
          <DataGrid
            rows={schedules}
            rowId={(row) => row.id}
            label="Retention schedules"
            selectedId={context.selectedId}
            onSelect={context.select}
            columns={[
              { key: "title", header: "Schedule", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "collections", header: "Covers", hideBelow: 1100, cell: (row) => csvList(row.fields.collections).join(", ") },
              { key: "years", header: "Years", align: "end", cell: (row) => String(row.fields.years ?? "—") },
              { key: "basis", header: "Basis", hideBelow: 1280, cell: (row) => String(row.fields.basis ?? "") },
              {
                key: "hold", header: "Legal hold", align: "end",
                cell: (row) => (row.fields.legalHold === true ? <Pill tone="danger">Hold</Pill> : <span className="ds-subtle">None</span>),
              },
              { key: "review", header: "Next review", align: "end", cell: (row) => (row.fields.nextReviewAt ? <span className="ds-num">{context.date(String(row.fields.nextReviewAt))}</span> : "—") },
            ]}
            empty={<Empty title="No schedules" icon={<Scale size={20} />}>Without a schedule, nothing says when a record may be removed.</Empty>}
          />
        </Card>
        {schedules.filter((row) => row.fields.legalHold === true).map((row) => (
          <Notice key={row.id} tone="warning" title={`${row.title} is under a legal hold`}>
            {String(row.fields.holdReason ?? "A hold is recorded against this schedule.")} Deletion requests touching these records are
            refused while the hold stands, even where a person has asked for erasure.
          </Notice>
        ))}
      </Stack>
    );
  }

  if (tab === "Consent") {
    const consents = ofKind(data.policies, "consent");
    return (
      <Grid>
        {consents.map((record) => {
          const recorded = Number(record.fields.recorded ?? 0);
          const granted = Number(record.fields.granted ?? 0);
          return (
            <Card key={record.id} eyebrow="CONSENT" prov="human" span={6} title={record.title} subtitle={record.summary}>
              <Stack gap={3}>
                {recorded > 0 ? (
                  <>
                    <Meter value={granted} max={recorded} label={`${record.title} consent`} tone="success" />
                    <Properties rows={[
                      { label: "Lawful basis", value: String(record.fields.lawfulBasis ?? "") },
                      { label: "Records holding a decision", value: String(recorded) },
                      { label: "Granted", value: String(granted) },
                      { label: "Withdrawn", value: String(record.fields.withdrawn ?? 0) },
                      { label: "Last checked", value: record.fields.lastAuditAt ? context.relative(String(record.fields.lastAuditAt)) : "Never" },
                    ]} />
                  </>
                ) : (
                  <Notice tone="info" title="Not applicable">{String(record.fields.note ?? "No consent is collected for this purpose.")}</Notice>
                )}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (tab === "Requests") {
    return (
      <Card eyebrow="SUBJECT REQUESTS" prov="human" title={`${data.dataRequests.length} subject requests`} subtitle="Each one with its basis, its deadline and whether a hold applies" flush>
        {seedsFailed ? (
          <div style={{ padding: "var(--space-4)" }} role="alert">
            <SeedsFailedNotice retry={seeds.retry} />
          </div>
        ) : counting ? (
          <div style={{ padding: "var(--space-4)" }} role="status" aria-live="polite">
            <Notice tone="info" title="Counting the records each request covers">
              Records from every application are still arriving in this browser. The register appears once the count is complete, so a
              partial figure is never shown as the whole.
            </Notice>
          </div>
        ) : (
        <DataGrid
          rows={data.dataRequests}
          rowId={(row) => row.id}
          label="Data subject requests"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Data request", { id }); }}
          rowTone={(row) => (row.fields.legalHold === true ? "warning" : row.dueAt && new Date(row.dueAt) < now && row.status === "open" ? "danger" : undefined)}
          columns={[
            { key: "title", header: "Request", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.subject ?? "")}` },
            { key: "type", header: "Kind", cell: (row) => <Pill tone={row.fields.type === "erasure" ? "warning" : "neutral"}>{String(row.fields.type)}</Pill> },
            { key: "records", header: "Records", align: "end", cell: (row) => <span className="ds-num">{String(subjectRecords(row, records).length)}</span>, sortValue: (row) => subjectRecords(row, records).length },
            { key: "due", header: "Due", align: "end", cell: (row) => (row.dueAt ? <span className="ds-num">{context.date(row.dueAt)}</span> : "—"), sortValue: (row) => row.dueAt ?? "" },
            { key: "hold", header: "Hold", align: "end", cell: (row) => (row.fields.legalHold === true ? <Pill tone="danger">Legal hold</Pill> : <span className="ds-subtle">None</span>) },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "completed" ? "success" : "info"}>{row.status}</Pill> },
          ]}
          empty={<Empty title="No requests" icon={<Scale size={20} />}>Requests from people about their own data are recorded here.</Empty>}
        />
        )}
      </Card>
    );
  }

  if (tab === "Processing") {
    const byCollection = Object.entries(records.reduce<Record<string, number>>((all, record) => {
      all[record.collection] = (all[record.collection] ?? 0) + 1;
      return all;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return (
      <Stack gap={4}>
        {seedsFailed && <SeedsFailedNotice retry={seeds.retry} />}
        <Card eyebrow="PROCESSING" prov="posted" title="What this workspace holds" subtitle={seedsFailed ? "Not every application's records could be loaded" : counting ? "Counting records from every application…" : `${records.length} records in ${new Set(records.map((record) => record.collection)).size} collections`}>
          <BarChart
            title="Records by collection, largest twelve"
            height={220}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Records", points: byCollection.map(([collection, count]) => ({ label: collection, value: count })) }]}
            footer="Counted from this browser's store. Nothing is sampled or estimated."
          />
        </Card>
        <Card eyebrow="REGISTER" prov="human" title="Processing register" subtitle="Purpose, basis and who touches it">
          <Properties rows={[
            { label: "Customer records", value: "Fulfilling orders and keeping statutory accounts. Basis: contract and legal obligation." },
            { label: "Employment records", value: "Paying people and meeting employment law. Basis: contract and legal obligation." },
            { label: "Support conversations", value: "Honouring warranties. Basis: contract." },
            { label: "Marketing contacts", value: "Only where consent is recorded against the contact." },
            { label: "Processors", value: "None. No third party receives data from this workspace." },
            { label: "Automated decisions", value: "None. Agents prepare work; people decide." },
          ]} />
        </Card>
      </Stack>
    );
  }

  const residency = ofKind(data.policies, "residency")[0];
  return (
    <Grid>
      <Card eyebrow="RESIDENCY" prov="posted" span={7} title="Where the data is" subtitle={residency?.summary ?? "Not recorded"}>
        <Stack gap={3}>
          <Properties rows={[
            { label: "Region", value: String(residency?.fields.region ?? "This browser") },
            { label: "Processors", value: String(residency?.fields.processors ?? "None") },
            { label: "Transfers", value: String(residency?.fields.transfers ?? "None") },
            { label: "Backups", value: `${data.backups.filter((row) => row.fields.destination === "This browser").length} snapshots in this browser` },
          ]} />
          <Notice tone="info" title="Residency is simple here, and will not stay simple">
            Every record is in this device's storage. The moment a server or a provider is added, this page has to name the region, the
            processor and the transfer mechanism for each one.
          </Notice>
        </Stack>
      </Card>
      <Card eyebrow="JURISDICTION" prov="posted" span={5} title="Jurisdiction" subtitle={context.org.jurisdiction}>
        <Stack gap={3}>
          <Properties rows={[
            { label: "Workspace jurisdiction", value: context.org.jurisdiction },
            { label: "Statutory retention", value: `${ofKind(data.policies, "retention").length} schedules recorded` },
          ]} />
          <Button variant="secondary" onClick={() => context.openOverlay("jurisdiction disclaimer")}>Read the limits of this page</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

/**
 * The records a subject request covers, computed one way for the register, the
 * review, the export and the deletion impact. A record in one of the request's
 * collections is the subject's when it names them (its title, owner or any
 * field equals one of their names, or lists them) or when it links, through
 * its parent, contact, employee or member reference, to a record that is.
 */
export function subjectNames(request: Rec): string[] {
  const subject = String(request.fields.subject ?? "").trim();
  if (!subject) return [];
  const names = new Set([subject]);
  const bracket = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(subject);
  if (bracket) { names.add(bracket[1].trim()); names.add(bracket[2].trim()); }
  return [...names].filter(Boolean);
}

const LINK_FIELDS = ["contactId", "employeeId", "memberId", "companyId", "applicantId", "ticketId"];

export function subjectRecords(request: Rec, records: Rec[]): Rec[] {
  const names = subjectNames(request);
  if (names.length === 0) return [];
  const collections = csvList(request.fields.collections);
  const pool = records.filter((record) => collections.includes(record.collection) && record.organizationId === request.organizationId);
  const wanted = new Set(names);
  const namesIt = (value: unknown) => typeof value === "string" && (wanted.has(value.trim()) || csvList(value).some((entry) => wanted.has(entry)));
  const direct = (record: Rec) => wanted.has(record.title.trim()) || wanted.has(record.ownerName) || Object.values(record.fields).some(namesIt);
  const matched = new Map(pool.filter(direct).map((record) => [record.id, record]));
  // Records about a matched record belong to the subject too: follow links until nothing new joins.
  const all = records.filter((record) => record.organizationId === request.organizationId);
  const anchors = new Set([...matched.keys(), ...all.filter(direct).map((record) => record.id)]);
  for (let grew = true; grew;) {
    grew = false;
    for (const record of pool) {
      if (matched.has(record.id)) continue;
      const linked = (record.parentId && anchors.has(record.parentId)) || LINK_FIELDS.some((key) => anchors.has(String(record.fields[key] ?? "")));
      if (linked) { matched.set(record.id, record); anchors.add(record.id); grew = true; }
    }
  }
  return [...matched.values()];
}

export function DataRequestOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const settledRecords = useSettledOrgRecords();
  const seeds = useSeedStatus();
  const seedsFailed = seeds.status === "failed";
  const counting = settledRecords === null;
  const records = settledRecords ?? [];
  const payload = context.overlayPayload as { id?: string } | undefined;
  const request = data.dataRequests.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!request) return <Empty title="Select a request" icon={<Scale size={20} />}>Choose a request to review it.</Empty>;

  const subject = String(request.fields.subject ?? "");
  const collections = csvList(request.fields.collections);
  const matching = subjectRecords(request, records);
  const hold = request.fields.legalHold === true;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Subject", value: subject },
        { label: "Kind", value: String(request.fields.type) },
        { label: "Received", value: context.dateTime(request.at) },
        { label: "Due", value: request.dueAt ? `${context.date(request.dueAt)} (${context.relative(request.dueAt)})` : "No deadline recorded" },
        { label: "Basis", value: String(request.fields.lawfulBasis ?? "") },
        { label: "Handler", value: String(request.fields.handler ?? "Unassigned") },
        { label: "Records matched now", value: seedsFailed ? "Not every application's records could be loaded" : counting ? "Counting records from every application…" : `${matching.length} across ${collections.length} collections` },
        ...(counting ? [] : [{ label: "Where they are", value: collections.map((collection) => `${collection} ${matching.filter((row) => row.collection === collection).length}`).join(" · ") }]),
      ]} />
      {seedsFailed && <SeedsFailedNotice retry={seeds.retry} />}
      {hold && (
        <Notice tone="danger" title="A legal hold applies">
          {String(request.fields.holdReason ?? "A hold is recorded against these records.")} Erasure is refused while the hold stands.
          The person must be told that their request is lawfully restricted, not quietly ignored.
        </Notice>
      )}
      <Row gap={2} wrap>
        <Button
          variant="primary"
          busy={busy}
          disabled={counting}
          title={seedsFailed ? "Unavailable: not every application's records could be loaded" : counting ? "Wait until every record has been counted" : undefined}
          onClick={async () => {
            setBusy(true);
            try {
              const header = "collection,id,title,status,summary,updated\n";
              const body = matching.map((record) => [record.collection, record.id, record.title, record.status, record.summary, record.updatedAt].map(quote).join(",")).join("\n");
              // Persist the audit receipt before initiating a browser download,
              // so a navigation cannot lose the evidence of preparation.
              await context.mutate.patch(request.id, { fields: { exportPreparedAt: context.now.toISOString(), exportPreparedBy: context.actor } }, { event: `Subject data export prepared for ${subject} (${matching.length} records)` });
              download(`${context.org.slug}-${subject.replace(/\W+/g, "-").toLowerCase()}-data.csv`, header + body);
              context.toast("Copy prepared", `${matching.length} records downloaded as CSV, and the request records that it happened.`);
            } finally { setBusy(false); }
          }}
        >
          Export their data
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await context.mutate.patch(request.id, { status: "restricted", fields: { ...request.fields, restrictedBy: context.actor, restrictedAt: context.now.toISOString() } }, { event: `Processing restricted for ${subject}`, expectRevision: request.revision });
            context.toast("Processing restricted", "The request is marked restricted: the records stay but are not used further.");
          }}
        >
          Restrict processing
        </Button>
        <Button
          variant="outline-danger"
          disabled={hold || seedsFailed}
          title={hold ? "A legal hold prevents deletion" : seedsFailed ? "Unavailable: not every application's records could be loaded" : undefined}
          onClick={() => context.openOverlay("deletion impact", { id: request.id })}
        >
          Delete where lawful…
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

export function DeletionImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const settledRecords = useSettledOrgRecords();
  const seeds = useSeedStatus();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const request = data.dataRequests.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!request) return <Empty title="Select a request" />;
  if (seeds.status === "failed") return <SeedsFailedNotice retry={seeds.retry} />;
  if (settledRecords === null) {
    return (
      <Notice tone="info" title="Counting the records this request covers">
        Records from every application are still arriving in this browser. Deletion is offered once the full set is known, so no record
        is missed.
      </Notice>
    );
  }
  const records = settledRecords;

  const subject = String(request.fields.subject ?? "");
  const collections = csvList(request.fields.collections);
  const retention = ofKind(data.policies, "retention").filter((policy) => csvList(policy.fields.collections).some((entry) => collections.includes(entry)));
  const held = retention.filter((policy) => policy.fields.legalHold === true);
  const covered = subjectRecords(request, records);
  const deletable = covered.filter((record) => !held.some((policy) => csvList(policy.fields.collections).includes(record.collection)));
  const blocked = covered.filter((record) => held.some((policy) => csvList(policy.fields.collections).includes(record.collection)));

  return (
    <StepUp
      word="DELETE"
      label={deletable.length ? `Delete ${deletable.length} ${deletable.length === 1 ? "record" : "records"}` : "Nothing may be deleted"}
      busy={busy}
      onConfirm={async () => {
        if (deletable.length === 0) {
          context.toast("Nothing deleted", "Every matching record is under a retention rule or a legal hold.", "blocked");
          return;
        }
        setBusy(true);
        try {
          for (const record of deletable) {
            await context.mutate.remove(record.id, `Erasure request ${request.id}: deleted ${record.collection} ${record.id}`);
          }
          await context.mutate.patch(request.id, {
            status: blocked.length ? "partially_completed" : "completed",
            fields: { ...request.fields, deletedCount: deletable.length, blockedCount: blocked.length, completedBy: context.actor },
          }, { event: `Erasure completed for ${subject}: ${deletable.length} deleted, ${blocked.length} retained under a hold` });
          context.toast("Deleted where lawful", `${deletable.length} removed, ${blocked.length} kept under a legal hold.`);
          close();
        } finally { setBusy(false); }
      }}
    >
      <Properties rows={[
        { label: "Subject", value: subject },
        { label: "Records that may be deleted", value: deletable.length ? deletable.map((record) => `${record.collection}/${record.id}`).join(", ") : "None" },
        { label: "Records that must be kept", value: blocked.length ? blocked.map((record) => `${record.collection}/${record.id}`).join(", ") : "None" },
        { label: "Rules preventing deletion", value: held.map((policy) => policy.title).join("; ") || "None" },
      ]} />
      <Notice tone="warning" title="Deleting is permanent and audited">
        Each deletion is written to the audit trail with the request that justified it. Links from other records to a deleted record
        will show as unavailable rather than silently disappearing.
      </Notice>
    </StepUp>
  );
}

export function JurisdictionDisclaimer({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="This console is not legal advice">
        The schedules, bases and deadlines here are what somebody in this workspace typed. Nothing validates them against the law of
        {" "}{context.org.jurisdiction} or anywhere else.
      </Notice>
      <Properties rows={[
        { label: "Workspace jurisdiction", value: context.org.jurisdiction },
        { label: "What is enforced", value: "Nothing. This browser holds records; it does not police them." },
        { label: "What is honoured", value: "A recorded legal hold blocks the deletion actions in this console." },
        { label: "Statutory periods", value: "Entered by a person and shown with the basis they gave." },
      ]} />
    </Stack>
  );
}

/* ---------------------------- ADMIN-009 ---------------------------- */

export function BillingScreen({ context, tab }: { context: ScreenContext; tab: "Overview" | "Invoices" | "Usage" | "Payment" }) {
  const data = useAdmin();
  const subscription = ofKind(data.policies, "subscription")[0];
  const people = data.members.filter((row) => row.fields.kind === "human" && row.fields.external !== true && row.status === "active");
  const agents = data.members.filter((row) => row.fields.kind === "ai");
  const included = Number(subscription?.fields.seatsIncluded ?? 0);
  const processor = capabilityById("payment.capture");

  if (tab === "Overview") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="No payment processor is connected to this workspace">
          Nothing on these tabs can charge a card, and no card details are collected or stored anywhere in this product. The amounts
          are from subscription records kept in this browser.
        </Notice>
        <StatRow>
          <Stat prov="human" label="Plan" value={String(subscription?.fields.plan ?? "None")} meta={String(subscription?.fields.term ?? "")} />
          <Stat prov="posted" label="Seats used" value={`${people.length + agents.length} of ${included}`} meta={`${people.length} people, ${agents.length} agents`} />
          <Stat prov={subscription?.fields.renewsAt ? "human" : undefined} label="Renews" value={subscription?.fields.renewsAt ? context.date(String(subscription.fields.renewsAt)) : "Unavailable"} unavailable={!subscription?.fields.renewsAt} meta="From the subscription record" />
          <Stat prov="posted" label="Balance" value={context.money(Number(subscription?.fields.balanceMinor ?? 0))} meta="Nothing is owed to this browser" />
        </StatRow>
        <Grid>
          <Card eyebrow="SEATS" prov="posted" span={7} title="Seats" subtitle={`${included} included`}>
            <Stack gap={3}>
              <Meter value={people.length + agents.length} max={Math.max(1, included)} label="Seats used" tone={people.length + agents.length > included ? "danger" : "success"} />
              <Properties rows={[
                { label: "People with access", value: String(people.length) },
                { label: "Agent seats", value: String(agents.length) },
                { label: "Suspended, not billed", value: String(data.members.filter((row) => row.status === "suspended").length) },
                { label: "External collaborators", value: `${data.members.filter((row) => row.fields.external === true).length} · not charged a seat` },
                { label: "Price per seat", value: `${context.money(Number(subscription?.fields.pricePerSeatMinor ?? 0))} per month` },
              ]} />
            </Stack>
          </Card>
          <Card eyebrow="SUBSCRIPTION" prov="human" span={5} title="Subscription actions">
            <Stack gap={3}>
              <Button variant="primary" onClick={() => context.openOverlay("Checkout")}>Manage subscription</Button>
              <Button variant="secondary" onClick={() => context.openOverlay("billing support")}>Billing question</Button>
              <Button variant="ghost" onClick={() => context.openOverlay("cancellation")}>Cancel subscription…</Button>
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (tab === "Invoices") {
    return (
      <Card eyebrow="INVOICES" prov="posted" title="Invoices" subtitle={`${data.billingInvoices.length} subscription invoices held as records`} flush>
        <DataGrid
          rows={data.billingInvoices}
          rowId={(row) => row.id}
          label="Subscription invoices"
          selectedId={context.selectedId}
          onSelect={context.select}
          columns={[
            { key: "title", header: "Invoice", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{String(row.fields.lines ?? row.summary)}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "period", header: "Period", cell: (row) => String(row.fields.period ?? "") },
            { key: "seats", header: "Seats", align: "end", cell: (row) => String(row.fields.seats ?? "") },
            { key: "amount", header: "Amount", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span>, sortValue: (row) => row.amountMinor ?? 0 },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "paid_locally" ? "success" : "warning"}>{row.status.replace(/_/g, " ")}</Pill> },
          ]}
          bulkActions={[
            {
              label: "Download",
              onRun: (selected) => {
                const text = selected.map((row) => [row.title, String(row.fields.period ?? ""), String(row.amountMinor ?? 0), row.status, String(row.fields.lines ?? "")].map(quote).join(",")).join("\n");
                download(`${context.org.slug}-subscription-invoices.csv`, `invoice,period,amount minor,status,lines\n${text}`);
                context.toast("Downloaded", `${selected.length} ${selected.length === 1 ? "invoice" : "invoices"} written to a CSV file in this browser.`);
              },
            },
            {
              label: "Mark paid locally",
              onRun: (selected) => {
                void Promise.all(selected.filter((row) => row.status !== "paid_locally").map((row) => context.mutate.patch(row.id, { status: "paid_locally", fields: { ...row.fields, paidAt: clockIso(), paidBy: context.actor } }, { event: `Subscription invoice marked paid locally: ${row.title}` })))
                  .then(() => context.toast("Marked paid locally", "The record says paid locally, which is not the same as a processor confirming a payment.", "info"));
              },
              disabled: (selected) => selected.every((row) => row.status === "paid_locally"),
            },
          ]}
          empty={<Empty title="No invoices" icon={<Database size={20} />}>Subscription invoices appear here as records.</Empty>}
        />
      </Card>
    );
  }

  if (tab === "Usage") {
    const feature = [
      { label: "Members", value: data.members.length },
      { label: "Agents", value: data.agents.length },
      { label: "Missions", value: data.missions.length },
      { label: "Policies", value: data.policies.length },
      { label: "Sessions recorded", value: data.sessions.length },
      { label: "API keys", value: data.apiKeys.length },
    ];
    return (
      <Stack gap={4}>
        <Card eyebrow="USAGE" prov="posted" title="Feature usage" subtitle="Counted from records in this workspace">
          <BarChart
            title="Records that drive the plan"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Records", points: feature.map((entry) => ({ label: entry.label, value: entry.value })) }]}
            footer="These are the counts a plan would be measured against. No usage is reported to anybody."
          />
        </Card>
        <Card eyebrow="UNAVAILABLE" prov="unknown" title="What cannot be shown" subtitle="Because no provider is connected">
          <Properties rows={[
            { label: "Model spend", value: <Pill tone="warning">Unavailable</Pill> },
            { label: "Storage billed", value: <Pill tone="warning">Unavailable</Pill> },
            { label: "Outbound messages", value: <Pill tone="warning">Unavailable — nothing is sent</Pill> },
          ]} />
        </Card>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card eyebrow="PAYMENT" prov="unknown" span={7} title="Payment method" subtitle="None, by design">
        <Stack gap={3}>
          <Notice tone="warning" title={`${processor?.provider ?? "Payment processor"}: ${CAPABILITY_LABELS.not_connected}`}>
            {processor?.note ?? "No processor is connected."} {processor?.localEquivalent ?? ""}
          </Notice>
          <Properties rows={[
            { label: "Card on file", value: "None. No card field exists in this product." },
            { label: "Where a card would be handled", value: "By a compliant provider's own hosted form, never by this interface." },
            { label: "What this workspace stores", value: "The subscription record, its seats and its invoices." },
          ]} />
          <Button variant="secondary" onClick={() => context.openOverlay("Checkout")}>What changing the plan would involve</Button>
        </Stack>
      </Card>
      <Card eyebrow="BILLING CONTACT" prov="human" span={5} title="Billing contact" subtitle="Used on invoices">
        <Properties rows={[
          { label: "Company", value: context.org.name },
          { label: "Registration", value: context.org.registration ?? "Not recorded" },
          { label: "Contact", value: context.actor },
          { label: "Currency", value: context.org.currency },
        ]} />
      </Card>
    </Grid>
  );
}

export function CheckoutOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const subscription = ofKind(data.policies, "subscription")[0];
  const [seats, setSeats] = useSeeded(Number(subscription?.fields.seatsIncluded ?? 10));
  const perSeat = Number(subscription?.fields.pricePerSeatMinor ?? 2_400);
  const used = data.members.filter((row) => row.fields.external !== true && row.status === "active").length;

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Nothing is charged and no card is collected">
        A real checkout hands you to the processor's own hosted form. Here, changing seats writes to the subscription record and
        nothing else happens.
      </Notice>
      <Field label="Seats" error={seats < used ? `${used} seats are in use; a smaller plan would need people suspended first.` : undefined}>
        <TextInput type="number" min={1} value={String(seats)} onChange={(event) => setSeats(Number(event.target.value))} invalid={seats < used} />
      </Field>
      <Properties rows={[
        { label: "Seats in use", value: String(used) },
        { label: "Price per seat", value: `${context.money(perSeat)} per month` },
        { label: "Yearly total", value: context.money(seats * perSeat * 12) },
        { label: "Charged now", value: "Nothing" },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!subscription || seats < used}
          onClick={async () => {
            if (!subscription) return;
            await context.mutate.patch(subscription.id, {
              summary: `${String(subscription.fields.plan)} plan, ${seats} seats, ${String(subscription.fields.term)}. Nothing is charged from this browser.`,
              amountMinor: seats * perSeat,
              fields: { ...subscription.fields, seatsIncluded: seats, changedBy: context.actor },
            }, { event: `Subscription seats set to ${seats}`, expectRevision: subscription.revision });
            context.toast("Plan record updated", `${seats} seats on the subscription record. No payment was taken.`, "info");
            close();
          }}
        >
          Save the plan record
        </Button>
      </Row>
    </Stack>
  );
}

export function CancellationOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const subscription = ofKind(data.policies, "subscription")[0];
  const records = useOrgRecords();
  const [busy, setBusy] = useState(false);
  return (
    <StepUp
      word="CANCEL"
      label="Record the cancellation"
      busy={busy}
      onConfirm={async () => {
        if (!subscription) return;
        setBusy(true);
        try {
          await context.mutate.patch(subscription.id, { status: "cancelled", fields: { ...subscription.fields, cancelledBy: context.actor, cancelledAt: clockIso() } }, { event: "Subscription cancellation recorded", expectRevision: subscription.revision });
          context.toast("Cancellation recorded", "The subscription record says cancelled. Your records stay in this browser and can be exported.", "info");
          close();
        } finally { setBusy(false); }
      }}
    >
      <Properties rows={[
        { label: "Plan", value: String(subscription?.fields.plan ?? "None") },
        { label: "Renews", value: subscription?.fields.renewsAt ? context.date(String(subscription.fields.renewsAt)) : "Unknown" },
        { label: "Records in this workspace", value: `${records.length} — not deleted by cancelling` },
        { label: "Export first", value: "Backups & recovery writes a full JSON copy from this browser." },
      ]} />
      <Notice tone="info" title="Cancelling here changes a record">
        There is no billing service to tell. The record is the only thing that changes, and your data is unaffected.
      </Notice>
    </StepUp>
  );
}

export function BillingSupport({ context, close }: { context: ScreenContext; close: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const mail = capabilityById("email.send");
  return (
    <Stack gap={4}>
      <Field label="Subject" required><TextInput value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
      <Field label="Question" required><TextArea rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
      <Notice tone="warning" title={`${mail?.label ?? "Send email"}: ${CAPABILITY_LABELS.not_connected}`}>
        The question is saved as a document in this workspace with the subscription details attached. Nothing is sent until a mail
        provider is connected.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!subject.trim() || !body.trim()}
          onClick={async () => {
            await context.mutate.create({
              collection: "documents",
              title: `Billing question: ${subject}`,
              status: "draft",
              summary: body.slice(0, 160),
              fields: { kind: "billingSupport", raisedBy: context.actor, deliveryState: "not_connected" },
              body: { text: body },
            }, `Billing question drafted: ${subject}`);
            context.toast("Saved as a draft", "It is in Documents. No mail provider is connected, so nothing left this browser.", "blocked");
            close();
          }}
        >
          Save the question
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- ADMIN-010 ---------------------------- */

export function RecoveryScreen({ context, tab }: { context: ScreenContext; tab: "Backups" | "Exports" | "Restores" | "Failures" }) {
  const data = useAdmin();
  const records = useOrgRecords();
  const rows = tab === "Backups"
    ? data.backups.filter((row) => row.fields.kind === "snapshot" && row.status !== "failed")
    : tab === "Exports"
      ? data.backups.filter((row) => row.fields.kind === "export")
      : tab === "Restores"
        ? data.backups.filter((row) => row.fields.kind === "restore")
        : data.backups.filter((row) => row.status === "failed" || row.status === "blocked");

  return (
    <Stack gap={4}>
      {tab === "Backups" && (
        <StatRow>
          <Stat prov="posted" label="Records held now" value={String(records.length)} meta="Counted from this browser" />
          <Stat prov="posted" label="Snapshots kept" value={String(data.backups.filter((row) => row.fields.kind === "snapshot" && row.status === "ok").length)} meta="Inside the retention window" />
          <Stat prov={rows[0] ? "posted" : undefined} label="Latest snapshot" value={rows[0] ? context.relative(rows[0].at) : "None"} unavailable={!rows[0]} meta={rows[0] ? `${String(rows[0].fields.records)} records` : "Take one now"} />
          <Stat label="Off-device copies" value="None" unavailable meta="A snapshot here never leaves this browser" />
        </StatRow>
      )}
      {tab === "Exports" && (
        <Notice tone="info" title="An export is the only copy that leaves this device">
          A snapshot is written inside the browser's own storage, so it disappears with the browser profile. An export writes a file you
          control.
        </Notice>
      )}
      <Card
        eyebrow="RECOVERY"
        prov="posted"
        title={tab}
        subtitle={`${rows.length} ${rows.length === 1 ? "record" : "records"}`}
        flush
        actions={
          tab === "Exports"
            ? (
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  const payload = JSON.stringify({ organisation: context.org.slug, exportedAt: context.now.toISOString(), count: records.length, records }, null, 2);
                  download(`${context.org.slug}-export.json`, payload, "application/json");
                  await context.mutate.create({
                    collection: "backups",
                    title: "Full export",
                    status: "ok",
                    summary: `${records.length} records written to a JSON file from this browser.`,
                    fields: { kind: "export", records: records.length, bytes: payload.length, destination: "Downloads folder", format: "json", requestedBy: context.actor, reason: "Manual export", verified: true },
                  }, `Full export of ${records.length} records`);
                  context.toast("Exported", `${records.length} records in a JSON file, and the export is recorded here.`);
                }}
              >
                Export everything now
              </Button>
            )
            : undefined
        }
      >
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${tab} jobs`}
          selectedId={context.selectedId}
          onSelect={context.select}
          rowTone={(row) => (row.status === "failed" ? "danger" : row.status === "blocked" ? "warning" : undefined)}
          columns={[
            { key: "title", header: "Job", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at ?? "" },
            { key: "records", header: "Records", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.records ?? 0)}</span> },
            { key: "bytes", header: "Size", align: "end", hideBelow: 1100, cell: (row) => (Number(row.fields.bytes ?? 0) > 0 ? `${(Number(row.fields.bytes) / 1_000_000).toFixed(2)} MB` : <span className="ds-subtle">—</span>) },
            { key: "where", header: "Destination", hideBelow: 1280, cell: (row) => String(row.fields.destination ?? row.fields.source ?? "—") },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "ok" ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status}</Pill> },
          ]}
          bulkActions={tab === "Failures" ? [
            {
              label: "Retry",
              onRun: (selected) => {
                void Promise.all(selected.map((row) => context.mutate.create({
                  collection: "backups",
                  title: `${row.title} (retry)`,
                  status: "ok",
                  summary: `Retried after: ${String(row.fields.failureReason ?? "a failure")}`,
                  fields: { ...row.fields, records: records.length, retryOf: row.id, requestedBy: context.actor },
                }, `Retried ${row.title}`))).then(() => context.toast("Retried", `${selected.length} ${selected.length === 1 ? "job" : "jobs"} re-run and recorded.`));
              },
            },
          ] : undefined}
          empty={
            <Empty
              title={`No ${tab.toLowerCase()}`}
              icon={<Database size={20} />}
              action={tab === "Backups" ? <Button variant="primary" onClick={() => context.openOverlay("retention check")}>Take a snapshot</Button> : undefined}
            >
              {tab === "Failures" ? "Nothing has failed." : "Jobs you run appear here with their record count and size."}
            </Empty>
          }
        />
      </Card>
    </Stack>
  );
}

export function RetentionCheck({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const data = useAdmin();
  const [busy, setBusy] = useState(false);
  const bytes = useMemo(() => JSON.stringify(records).length, [records]);
  const schedules = ofKind(data.policies, "retention");

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Records to snapshot", value: String(records.length) },
        { label: "Approximate size", value: `${(bytes / 1_000_000).toFixed(2)} MB` },
        { label: "Destination", value: "This browser's storage" },
        { label: "Retention schedules that apply", value: schedules.map((policy) => policy.title).join("; ") || "None recorded" },
        { label: "Legal holds", value: schedules.some((policy) => policy.fields.legalHold === true) ? "Yes — held records are included and must not be pruned" : "None" },
      ]} />
      <Notice tone="warning" title="A snapshot in the browser is not a backup">
        It lives in the same storage as the records themselves, so clearing site data removes both. Use Export for a copy you keep.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.create({
                collection: "backups",
                title: "Snapshot",
                status: "ok",
                summary: `${records.length} records catalogued in this browser.`,
                fields: {
                  kind: "snapshot", records: records.length, bytes, destination: "This browser",
                  retainUntil: new Date(context.now.getTime() + 14 * 86_400_000).toISOString(), verified: true, requestedBy: context.actor,
                },
              }, `Snapshot taken: ${records.length} records`);
              context.toast("Snapshot taken", `${records.length} records catalogued, with its size and retention recorded.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Take the snapshot
        </Button>
      </Row>
    </Stack>
  );
}

export function RestoreImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const records = useOrgRecords();
  const snapshots = data.backups.filter((row) => row.fields.kind === "snapshot" && row.status === "ok");
  const [source, setSource] = useSeeded(snapshots[0]?.id ?? "");
  const [planApproved, setPlanApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const snapshot = snapshots.find((row) => row.id === source);
  const newer = snapshot ? records.filter((record) => record.updatedAt > snapshot.at!) : [];

  return (
    <Stack gap={4}>
      <Field label="Restore from">
        <Select value={source} onChange={(event) => setSource(event.target.value)}>
          {snapshots.map((row) => <option key={row.id} value={row.id}>{row.title} · {context.dateTime(row.at)}</option>)}
        </Select>
      </Field>
      {snapshot ? (
        <>
          <Properties rows={[
            { label: "Snapshot taken", value: `${context.dateTime(snapshot.at)} (${context.relative(snapshot.at)})` },
            { label: "Records in the snapshot", value: String(snapshot.fields.records ?? 0) },
            { label: "Records here now", value: String(records.length) },
            { label: "Changed since the snapshot", value: `${newer.length} records would be overwritten` },
          ]} />
          {newer.length > 0 && (
            <Notice tone="danger" title={`${newer.length} records are newer than this snapshot`}>
              A restore would replace them with older versions. That needs an approved plan saying which of the two is correct, so the
              console will only rehearse the restore until the plan is approved.
              <ul style={{ marginBlockStart: "var(--space-2)" }}>
                {newer.slice(0, 5).map((record) => <li key={record.id}>{record.collection}/{record.id} — changed {context.relative(record.updatedAt)}</li>)}
              </ul>
            </Notice>
          )}
          <Checkbox
            label="A restore plan has been written and approved for these records"
            checked={planApproved}
            onChange={(event) => setPlanApproved(event.target.checked)}
          />
          <Row gap={2} wrap>
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await context.mutate.create({
                    collection: "backups",
                    title: "Restore rehearsal",
                    status: newer.length > 0 && !planApproved ? "blocked" : "ok",
                    summary: newer.length > 0 && !planApproved
                      ? `Blocked: ${newer.length} records are newer than the snapshot and no plan is approved.`
                      : `Dry run against ${snapshot.title}. No record was overwritten.`,
                    fields: {
                      kind: "restore", records: Number(snapshot.fields.records ?? 0), bytes: Number(snapshot.fields.bytes ?? 0),
                      source: snapshot.title, mode: "dry_run", newerRecords: newer.length, plan: planApproved ? "approved" : "missing",
                      requestedBy: context.actor,
                      ...(newer.length > 0 && !planApproved ? { failureReason: "A restore may not overwrite newer changes without an approved plan." } : {}),
                    },
                  }, `Restore rehearsal against ${snapshot.title}`);
                  context.toast(
                    newer.length > 0 && !planApproved ? "Rehearsal blocked" : "Rehearsal recorded",
                    newer.length > 0 && !planApproved
                      ? `${newer.length} newer records stand in the way. The attempt is recorded under Failures with its reason.`
                      : "The dry run is recorded under Restores. Nothing was overwritten.",
                    newer.length > 0 && !planApproved ? "blocked" : "ok",
                  );
                  close();
                } finally { setBusy(false); }
              }}
            >
              Rehearse the restore
            </Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </Row>
          <Notice tone="info" title="A real restore needs a server">
            This build rehearses and records. Writing a whole snapshot back over live records is exactly the operation that should not
            be a single button in a browser.
          </Notice>
        </>
      ) : (
        <Empty title="No snapshot to restore from" icon={<Database size={20} />}>Take a snapshot first.</Empty>
      )}
    </Stack>
  );
}

export function DisasterDrill({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const records = useOrgRecords();
  const lastSnapshot = data.backups.filter((row) => row.fields.kind === "snapshot" && row.status === "ok")[0];
  const lastExport = data.backups.filter((row) => row.fields.kind === "export" && row.status === "ok")[0];
  const steps = [
    { label: "A snapshot exists inside the retention window", ok: Boolean(lastSnapshot), detail: lastSnapshot ? `${context.relative(lastSnapshot.at)}, ${String(lastSnapshot.fields.records)} records` : "None recorded" },
    { label: "An export exists outside this browser", ok: Boolean(lastExport), detail: lastExport ? `${context.relative(lastExport.at)} to ${String(lastExport.fields.destination)}` : "No export has been taken" },
    { label: "A restore has been rehearsed", ok: data.backups.some((row) => row.fields.kind === "restore" && row.status === "ok"), detail: "Rehearse from the Restores tab" },
    { label: "Someone other than the owner can do this", ok: data.members.filter((row) => row.fields.role === "owner" || row.fields.role === "finance").length > 1, detail: `${data.members.filter((row) => row.fields.kind === "human").length} people hold a view` },
    { label: "The record count is known", ok: records.length > 0, detail: `${records.length} records` },
  ];
  const ready = steps.filter((step) => step.ok).length;

  return (
    <Stack gap={4}>
      <Meter value={ready} max={steps.length} label="Recovery readiness" tone={ready === steps.length ? "success" : ready > steps.length / 2 ? "warning" : "danger"} />
      <Stack gap={2}>
        {steps.map((step) => (
          <Row key={step.label} gap={3} style={{ alignItems: "flex-start" }}>
            <Pill tone={step.ok ? "success" : "warning"}>{step.ok ? "Ready" : "Not yet"}</Pill>
            <div className="ds-grow">
              <strong>{step.label}</strong>
              <p className="ds-subtle">{step.detail}</p>
            </div>
          </Row>
        ))}
      </Stack>
      <Notice tone="warning" title="The honest worst case">
        If this browser profile is cleared, everything not exported is gone. There is no second copy anywhere, and no service to ask.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- ADMIN-011 ---------------------------- */

export function DeveloperScreen({ context, tab }: { context: ScreenContext; tab: "API" | "Webhooks" | "Sandbox" | "Logs" }) {
  const data = useAdmin();
  const events = useEvents(undefined, 200);

  if (tab === "API") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="There is no API server in this build">
          Keys are records with a prefix and the last four characters. A key's full value is shown once when it is issued and is never
          stored, never shown again, and never placed in anything an agent can read.
        </Notice>
        <Card eyebrow="API KEYS" prov="human" title={`${data.apiKeys.length} keys`} flush>
          <DataGrid
            rows={data.apiKeys}
            rowId={(row) => row.id}
            label="API keys"
            selectedId={context.selectedId}
            onSelect={context.select}
            rowTone={(row) => (row.status === "revoked" ? "warning" : undefined)}
            columns={[
              { key: "title", header: "Key", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "prefix", header: "Value", cell: (row) => <span className="ds-num">{String(row.fields.prefix)}…{String(row.fields.last4)}</span> },
              { key: "scopes", header: "Scopes", hideBelow: 1100, cell: (row) => csvList(row.fields.scopes).join(", ") },
              { key: "env", header: "Environment", cell: (row) => <Pill tone={row.fields.environment === "live" ? "warning" : "neutral"}>{String(row.fields.environment)}</Pill> },
              { key: "used", header: "Last used", align: "end", hideBelow: 1280, cell: (row) => (row.fields.lastUsedAt ? <span className="ds-num">{context.relative(String(row.fields.lastUsedAt))}</span> : "Never") },
              { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Pill> },
            ]}
            bulkActions={[
              {
                label: "Revoke",
                tone: "danger",
                onRun: (selected) => {
                  void Promise.all(selected.filter((row) => row.status === "active").map((row) => context.mutate.patch(row.id, { status: "revoked", fields: { ...row.fields, revokedBy: context.actor, revokedAt: context.now.toISOString() } }, { event: `API key revoked: ${row.title}` })))
                    .then(() => context.toast("Revoked", "The key records say revoked. With no server, nothing was calling them anyway."));
                },
                disabled: (selected) => selected.every((row) => row.status !== "active"),
              },
            ]}
            empty={<Empty title="No keys" icon={<KeyRound size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Key creation")}>Issue a key</Button>}>A key would let a script read this workspace, once there is a server to ask.</Empty>}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Webhooks") {
    return (
      <Grid>
        {data.webhooks.map((hook) => (
          <Card key={hook.id} eyebrow="ENDPOINT" prov="human" span={6} title={hook.title} subtitle={hook.summary}>
            <Stack gap={3}>
              <Properties rows={[
                { label: "Events", value: csvList(hook.fields.events).join(", ") },
                { label: "Environment", value: String(hook.fields.environment) },
                { label: "Delivery attempts", value: String(hook.fields.attempts ?? 0) },
                { label: "Failures", value: String(hook.fields.failures ?? 0) },
                { label: "State", value: <Pill tone="warning">{hook.status}</Pill> },
              ]} />
              <Row gap={2}>
                <Button size="sm" variant="secondary" onClick={() => { context.select(hook.id); context.openOverlay("callback tester", { id: hook.id }); }}>Test</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await context.mutate.remove(hook.id, `Webhook removed: ${hook.title}`);
                    context.toast("Removed", "The endpoint record is gone.");
                  }}
                >
                  Remove
                </Button>
              </Row>
            </Stack>
          </Card>
        ))}
        {data.webhooks.length === 0 && <Empty title="No endpoints" icon={<Server size={20} />}>Endpoints are records here; nothing can be delivered without a server.</Empty>}
      </Grid>
    );
  }

  if (tab === "Sandbox") {
    return (
      <Grid>
        <Card eyebrow="ENVIRONMENTS" prov="posted" span={7} title="Environments" subtitle="What exists, and what does not">
          <Properties rows={[
            { label: "Live", value: "This browser profile. The only environment with records in it." },
            { label: "Sandbox", value: "Not provisioned. There is no second store to copy into." },
            { label: "How to get a safe copy", value: "Export the workspace, then open it in a separate browser profile." },
          ]} />
          <Notice tone="warning" title="A sandbox would need somewhere to live">
            Copying this workspace into a sandbox means a second store. Until there is one, the honest answer is that the sandbox does
            not exist, rather than a button that appears to make one.
          </Notice>
        </Card>
        <Card eyebrow="SEED" prov="posted" span={5} title="Seed and reset" subtitle="What the application itself does">
          <Properties rows={[
            { label: "Seeded on first load", value: "Base fixtures plus each application's own" },
            { label: "Re-seed", value: "Clearing site data and reloading starts again" },
            { label: "Your changes", value: "Kept in this browser until you clear it" },
          ]} />
        </Card>
      </Grid>
    );
  }

  const developerEvents = events.filter((event) => event.type.startsWith("developer") || event.type.includes("export") || event.type.startsWith("capability"));
  return (
    <Stack gap={4}>
      <Notice tone="info" title="No request logs exist">
        Nothing has called this workspace, because there is nothing to call. What is shown instead is every entry about keys, exports
        and capability states, which is the closest honest equivalent.
      </Notice>
      <Card eyebrow="DEVELOPER LOG" prov="posted" title={`${developerEvents.length} entries`} flush>
        <DataGrid
          rows={developerEvents}
          rowId={(row) => row.id}
          label="Developer log"
          columns={[
            { key: "at", header: "When", width: "160px", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor },
            { key: "type", header: "Entry", primary: true, cell: (row) => <div><strong>{row.type}</strong><p className="ds-subtle">{row.message}</p></div>, filterValue: (row) => `${row.type} ${row.message}` },
            { key: "outcome", header: "Outcome", align: "end", cell: (row) => (row.capability ? <Pill tone={CAPABILITY_TONE[row.capability]}>{CAPABILITY_LABELS[row.capability]}</Pill> : <span className="ds-subtle">—</span>) },
          ]}
          empty={<Empty title="Nothing logged yet" icon={<Server size={20} />}>Key and export activity appears here.</Empty>}
        />
      </Card>
    </Stack>
  );
}

function randomKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function KeyCreation({ context, close }: { context: ScreenContext; close: () => void }) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("sandbox");
  const [scopes, setScopes] = useState<string[]>(["records:read"]);
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (issued) {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Copy this now — it is not stored">
          Only the prefix and the last four characters are kept on the record. This value is not saved, is not recoverable, and is
          never included in anything an agent reads.
        </Notice>
        <Field label="Key">
          <TextInput readOnly value={issued} onFocus={(event) => event.currentTarget.select()} />
        </Field>
        <Row gap={2}>
          <span className="ds-grow" />
          <Button variant="primary" onClick={close}>I have copied it</Button>
        </Row>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Field label="What is it for" required><TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Showroom tablet reader" required /></Field>
      <Field label="Environment">
        <Select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
          <option value="sandbox">Sandbox</option>
          <option value="live">Live</option>
        </Select>
      </Field>
      <Field label="Scopes" hint="Least privilege: a reader key cannot write.">
        <Stack gap={2}>
          {["records:read", "records:write", "export:write", "policy:read"].map((scope) => (
            <Checkbox
              key={scope}
              label={scope}
              checked={scopes.includes(scope)}
              onChange={(event) => setScopes((current) => (event.target.checked ? [...current, scope] : current.filter((entry) => entry !== scope)))}
            />
          ))}
        </Stack>
      </Field>
      {scopes.includes("records:write") && environment === "live" && (
        <Notice tone="warning" title="A live write key is the riskiest thing on this page">
          Consider a sandbox key, or read-only, unless something genuinely has to change records without a person.
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!name.trim() || scopes.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              const value = `arl_${environment === "live" ? "live" : "test"}_${randomKey()}`;
              await context.mutate.create({
                collection: "apiKeys",
                title: name,
                status: "active",
                summary: `${scopes.join(", ")} in ${environment}.`,
                fields: {
                  prefix: value.slice(0, 13), last4: value.slice(-4), scopes: scopes.join(","), environment,
                  createdBy: context.actor, shownOnce: true,
                  expiresAt: new Date(context.now.getTime() + 90 * 86_400_000).toISOString(),
                },
              }, `API key issued: ${name} (${scopes.join(", ")})`);
              await context.mutate.log(`API key issued for ${name}. The value was shown once and not stored.`, { type: "developer.key_issued", capability: "ready_local" });
              setIssued(value);
            } finally { setBusy(false); }
          }}
        >
          Issue the key
        </Button>
      </Row>
    </Stack>
  );
}

export function ScopeLimits({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const key = data.apiKeys.find((row) => row.id === context.selectedId) ?? data.apiKeys[0];
  if (!key) return <Empty title="No key selected" icon={<KeyRound size={20} />}>Issue a key to see what it could reach.</Empty>;
  const scopes = csvList(key.fields.scopes);
  return (
    <Stack gap={4}>
      <h3>{key.title}</h3>
      <Properties rows={[
        { label: "Value", value: <span className="ds-num">{String(key.fields.prefix)}…{String(key.fields.last4)}</span> },
        { label: "Environment", value: String(key.fields.environment) },
        { label: "Expires", value: key.fields.expiresAt ? context.date(String(key.fields.expiresAt)) : "No expiry" },
      ]} />
      <Card eyebrow="SCOPES" prov="human" title="What each scope allows">
        <Properties rows={[
          { label: "records:read", value: scopes.includes("records:read") ? "Read records in this organisation only" : "Not granted" },
          { label: "records:write", value: scopes.includes("records:write") ? "Create and change records; every write is audited" : "Not granted" },
          { label: "export:write", value: scopes.includes("export:write") ? "Write export files" : "Not granted" },
          { label: "policy:read", value: scopes.includes("policy:read") ? "Read policies, never change them" : "Not granted" },
        ]} />
      </Card>
      <Notice tone="warning" title="A key is never scoped across companies">
        Northline and Harbor are separate workspaces. A key issued here could only ever reach {context.org.name}.
      </Notice>
    </Stack>
  );
}

export function CallbackTester({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const hook = data.webhooks.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? data.webhooks[0];
  const [result, setResult] = useState<string | null>(null);
  if (!hook) return <Empty title="No endpoint" icon={<Server size={20} />}>Add an endpoint first.</Empty>;

  const example = {
    event: csvList(hook.fields.events)[0] ?? "record.updated",
    organisation: context.org.slug,
    at: clockIso(),
    data: { id: "nl-invoices-001", collection: "invoices", status: "issued" },
  };

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Endpoint", value: <span className="ds-num">{hook.title}</span> },
        { label: "Events", value: csvList(hook.fields.events).join(", ") },
        { label: "Signing secret", value: <span className="ds-num">{String(hook.fields.secretPrefix)}…</span> },
      ]} />
      <Field label="What would be sent">
        <TextArea rows={10} readOnly value={JSON.stringify(example, null, 2)} />
      </Field>
      <Notice tone="warning" title="Nothing is sent">
        A browser cannot sign and post this without exposing the secret, and there is no server to do it from. The payload shape is
        shown so an endpoint can be written against it.
      </Notice>
      <Row gap={2}>
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.patch(hook.id, { fields: { ...hook.fields, lastTestAt: clockIso(), lastTestBy: context.actor } }, { event: `Webhook payload inspected: ${hook.title}` });
            await context.mutate.log(`Webhook test on ${hook.title}: payload shown, nothing delivered.`, { entityId: hook.id, type: "developer.webhook_test", capability: "not_connected" });
            setResult("Recorded as inspected. No delivery was attempted, so there is no response code to show.");
          }}
        >
          Record the test
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
      {result && <Notice tone="info" title="Result">{result}</Notice>}
    </Stack>
  );
}

export function WebhookForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["record.updated"]);
  const valid = /^https:\/\/.+\..+/.test(url) || url.startsWith("http://localhost");
  return (
    <Stack gap={4}>
      <Field label="Endpoint URL" required error={url && !valid ? "Use an https address, or http://localhost for development." : undefined}>
        <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.example.com/arlovi" />
      </Field>
      <Field label="Events">
        <Stack gap={2}>
          {["record.updated", "invoice.paid", "order.created", "approval.decided"].map((entry) => (
            <Checkbox
              key={entry}
              label={entry}
              checked={events.includes(entry)}
              onChange={(event) => setEvents((current) => (event.target.checked ? [...current, entry] : current.filter((value) => value !== entry)))}
            />
          ))}
        </Stack>
      </Field>
      <Notice tone="warning" title="It will be saved disabled">
        There is nothing to deliver from, so the endpoint is recorded with no attempts and the state stays disabled.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!valid || events.length === 0}
          onClick={async () => {
            await context.mutate.create({
              collection: "webhooks",
              title: url,
              status: "disabled",
              summary: `Would be called for ${events.join(", ")}. Nothing can be delivered from this browser.`,
              fields: { events: events.join(","), secretPrefix: `whsec_${randomKey().slice(0, 2)}`, attempts: 0, failures: 0, environment: url.includes("localhost") ? "sandbox" : "live", createdBy: context.actor },
            }, `Webhook endpoint recorded: ${url}`);
            context.toast("Endpoint saved", "It is disabled, with no delivery attempts, because there is no server to send from.", "blocked");
            close();
          }}
        >
          Save endpoint
        </Button>
      </Row>
    </Stack>
  );
}
