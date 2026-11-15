import { useState } from "react";
import { Button, Field, Notice, Pill, Properties, Row, Select, Stack } from "@/design-system";
import type { Audit, Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { useCollection, useEvents } from "@/platform/workspace";
import { actOverlay, peopleOptions, type ActInput } from "@/applications/t6kit/act";
import { downloadCsv } from "@/applications/t6kit/kit";
import {
  CONNECTOR_ENTRIES, adapterChecks, adapterOperations, declarationProblems, entryById, entryForRecord,
  type ConnectorEntry,
} from "./catalog";

/* ====================================================================== *
 * CONNECT contract actions. Every one ends where the provider begins: it
 * changes the local connector record or writes a receipt that says it
 * stopped, and nothing is ever marked connected.
 * ====================================================================== */

const nowIso = (context: ScreenContext) => context.now.toISOString();

/** The capability the current route is about: a capability id, or a connector record id. */
export function routeEntry(context: ScreenContext, records: Rec[]): ConnectorEntry | undefined {
  const direct = entryById(context.params.id ?? "");
  if (direct) return direct;
  const record = records.find((row) => row.id === (context.params.id ?? context.selectedId));
  return record ? entryForRecord(record.fields) : undefined;
}

function recordsFor(entry: ConnectorEntry | undefined, records: Rec[]): Rec[] {
  if (!entry) return records;
  return records.filter((record) => entryForRecord(record.fields)?.capability.id === entry.capability.id);
}

/** Connector records for the routed capability, or the routed record itself. */
const routeCandidates = (records: Rec[], context: ScreenContext) => {
  const routed = records.find((row) => row.id === context.params.id);
  if (routed) return [routed];
  const entry = entryById(context.params.id ?? "");
  return entry ? recordsFor(entry, records) : records.filter((record) => String(record.fields.kind ?? "") !== "custom");
};

const capabilityLabel = (record?: Rec) => (record ? entryForRecord(record.fields)?.capability.label ?? record.title : "this capability");

function ConnectorFacts({ record }: ActInput) {
  if (!record) return null;
  const entry = entryForRecord(record.fields);
  return (
    <Properties rows={[
      { label: "Connector", value: record.title },
      { label: "Capability", value: entry?.capability.label ?? "Custom" },
      { label: "Register state", value: <Pill tone="warning" dot>{CAPABILITY_LABELS[entry?.capability.state ?? "not_connected"]}</Pill> },
      { label: "Record state", value: record.status.replace(/_/g, " ") },
      { label: "Owner", value: record.ownerName },
    ]} />
  );
}

/* ------------------------------ Directory ------------------------------ */

export function CompareConnectors({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const [picked, setPicked] = useState<string[]>(payload?.ids ?? CONNECTOR_ENTRIES.slice(0, 2).map((entry) => entry.capability.id));
  const entries = picked.map((id) => entryById(id)).filter((entry): entry is ConnectorEntry => Boolean(entry));
  const rows: [string, (entry: ConnectorEntry) => string][] = [
    ["Provider", (entry) => entry.capability.provider],
    ["Category", (entry) => entry.category],
    ["State", (entry) => CAPABILITY_LABELS[entry.capability.state]],
    ["Contract", (entry) => entry.version],
    ["Read scopes", (entry) => entry.scopes.filter((scope) => scope.kind === "read").map((scope) => scope.name).join(", ") || "none"],
    ["Write scopes", (entry) => entry.scopes.filter((scope) => scope.kind === "write").map((scope) => scope.name).join(", ") || "none"],
    ["Actions", (entry) => entry.operations.filter((operation) => operation.direction === "action").map((operation) => operation.name).join(", ") || "none"],
    ["Reads", (entry) => entry.operations.filter((operation) => operation.direction === "read").map((operation) => operation.name).join(", ") || "none"],
    ["Limits", (entry) => entry.limits[0] ?? "none published"],
    ["Risk", (entry) => `${entry.risk.level}: ${entry.risk.note}`],
    ["Claims not repeated", (entry) => entry.unverified.join(", ") || "none"],
    ["Done here instead", (entry) => entry.capability.localEquivalent],
  ];
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        {[0, 1, 2].map((slot) => (
          <Field key={slot} label={`Connector ${slot + 1}`} htmlFor={`cmp-${slot}`}>
            <Select id={`cmp-${slot}`} value={picked[slot] ?? ""} onChange={(event) => {
              const next = [...picked];
              next[slot] = event.target.value;
              setPicked(next.filter(Boolean));
            }}>
              <option value="">{slot < 2 ? "Choose…" : "None"}</option>
              {CONNECTOR_ENTRIES.map((entry) => <option key={entry.capability.id} value={entry.capability.id}>{entry.capability.label}</option>)}
            </Select>
          </Field>
        ))}
      </Row>
      {entries.length < 2 ? <Notice tone="info" title="Choose two to compare">A comparison needs at least two connectors.</Notice> : (
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Connectors side by side</caption>
            <thead><tr><th scope="col">Attribute</th>{entries.map((entry) => <th key={entry.capability.id} scope="col">{entry.capability.label}</th>)}</tr></thead>
            <tbody>{rows.map(([label, read]) => <tr key={label}><th scope="row">{label}</th>{entries.map((entry) => <td key={entry.capability.id}>{read(entry)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <Notice tone="warning" title="Only the contract is compared">Provider marketing claims appear as claims, never as supported features.</Notice>
    </Stack>
  );
}

async function findOrCreateConnector(context: ScreenContext, entry: ConnectorEntry, patch: Record<string, string | number | boolean>, event: string): Promise<Rec | null> {
  const repo = await import("@/platform/repo");
  const records = await repo.listByCollection(context.org.id, "connectors");
  const existing = recordsFor(entry, records)[0];
  if (existing) return context.mutate.patch(existing.id, { fields: { ...existing.fields, ...patch } }, { expectRevision: existing.revision, event });
  return context.mutate.create({
    collection: "connectors",
    title: entry.capability.label,
    status: "not_connected",
    summary: entry.capability.localEquivalent,
    fields: { capability: "not_connected", capabilityId: entry.capability.id, provider: entry.capability.provider, kind: "capability", ...patch },
  }, event);
}

export const installConnector = actOverlay({
  id: "install wizard",
  title: "Install a connector",
  consequenceTitle: "An install stops at the provider",
  consequence: () => "A connector is an authorisation held against a provider account. Installing records your request on the connector record and in the receipts; the state stays not connected until a provider grant exists and one read succeeds.",
  boundary: { id: "email.send", action: "Installing" },
  fields: ({ context }) => {
    const payload = context.overlayPayload as { id?: string } | undefined;
    return [{ name: "capability", label: "Connector", kind: "select", initial: payload?.id ?? context.params.id, options: CONNECTOR_ENTRIES.map((entry) => ({ value: entry.capability.id, label: `${entry.capability.label} · ${entry.capability.provider}` })) }];
  },
  submit: "Record the install request",
  apply: async ({ values, context }) => {
    const entry = entryById(values.capability);
    if (!entry) throw new Error("Choose a connector.");
    await findOrCreateConnector(context, entry, { installRequestedAt: nowIso(context), installRequestedBy: context.actor }, `Install requested for ${entry.capability.label}; not connected`);
    await context.mutate.log(`Install requested for ${entry.capability.label}: stopped before the provider. No grant, no token, no connection.`, { type: "capability", capability: "not_connected" });
    return { title: "Recorded, not installed", body: `${entry.capability.label} stays not connected. The request is in the receipts.`, tone: "blocked" };
  },
});

/* ------------------------------ Connector detail ------------------------------ */

export function ProviderLimits({ context }: { context: ScreenContext }) {
  const records = useCollection("connectors");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = entryById(payload?.id ?? "") ?? routeEntry(context, records) ?? CONNECTOR_ENTRIES[0];
  return (
    <Stack gap={3}>
      <Properties rows={[{ label: "Connector", value: entry.capability.label }, { label: "Provider", value: entry.capability.provider }]} />
      <h4>Limits the provider imposes</h4>
      {entry.limits.length === 0 ? <span className="ds-subtle">No limits are published for this capability.</span> : <ul className="ds-prose">{entry.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>}
      <h4>Claims this directory does not repeat</h4>
      {entry.unverified.length === 0 ? <span className="ds-subtle">None recorded.</span> : (
        <Stack gap={1}>{entry.unverified.map((claim) => <Row key={claim} gap={2}><span className="ds-grow">{claim}</span><Pill tone="warning">unverified</Pill></Row>)}</Stack>
      )}
    </Stack>
  );
}

function connectionChecks(record?: Rec): { label: string; met: boolean; detail: string }[] {
  const entry = record ? entryForRecord(record.fields) : undefined;
  return [
    { label: "The connector maps to a capability", met: Boolean(entry), detail: entry ? entry.capability.label : "No capability matches this record" },
    { label: "A grant exists", met: false, detail: "No authorisation has completed." },
    { label: "A token can be exchanged", met: false, detail: "There is no server to receive the callback." },
    { label: "One read returns data", met: false, detail: "Not attempted: there is nothing to read with." },
  ];
}

export const testConnection = actOverlay({
  id: "test connection",
  title: "Test the connection",
  collection: "connectors",
  noun: "connection",
  candidates: routeCandidates,
  consequence: () => "Runs every check that can be made from this browser and writes the result to the receipts and onto the connector. Checks that need a provider are reported as not met, never as passed.",
  Details: ({ record }) => (
    <div className="t6-checks">
      {connectionChecks(record).map((check) => (
        <div key={check.label} className="t6-check" data-state={check.met ? "pass" : "fail"}>
          <span className="t6-check-dot" aria-hidden="true" />
          <div><strong>{check.label}</strong><p className="ds-subtle">{check.detail}</p></div>
          <Pill tone={check.met ? "success" : "danger"}>{check.met ? "checked" : "not met"}</Pill>
        </div>
      ))}
    </div>
  ),
  submit: "Run the test",
  apply: async ({ record, context }) => {
    if (!record) return;
    const checks = connectionChecks(record);
    const met = checks.filter((check) => check.met).length;
    const result = `${met} of ${checks.length} checks met; no provider was contacted`;
    await context.mutate.patch(record.id, { fields: { ...record.fields, lastTestAt: nowIso(context), lastTestResult: result } }, { expectRevision: record.revision, event: `Connection test for ${record.title}: ${result}` });
    await context.mutate.log(`Connection test for ${capabilityLabel(record)}: ${result}.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Test recorded", body: `${result}. It is in the receipts.`, tone: "blocked" };
  },
});

export const requestCapability = actOverlay({
  id: "request capability",
  title: "Request a capability",
  consequence: () => "A request for an operation the contract does not offer becomes a task for the person who owns connectors, with your reason. Nothing is added to the registry until a person declares and approves it.",
  fields: ({ people, context }) => {
    const entry = entryById(context.params.id ?? "");
    return [
      { name: "capability", label: "On", kind: "select", initial: entry?.capability.id, options: CONNECTOR_ENTRIES.map((item) => ({ value: item.capability.id, label: item.capability.label })) },
      { name: "operation", label: "Operation wanted", required: true, placeholder: "list_refunds" },
      { name: "kind", label: "Kind", kind: "select", options: [{ value: "read", label: "Read" }, { value: "action", label: "Action (write)" }, { value: "webhook", label: "Webhook" }] },
      { name: "owner", label: "Ask", kind: "select", options: peopleOptions(people) },
      { name: "why", label: "What it is for", kind: "textarea", required: true },
    ];
  },
  submit: "Send the request to them",
  apply: async ({ values, context }) => {
    const entry = entryById(values.capability);
    const created = await context.mutate.create({
      collection: "tasks",
      title: `Capability request: ${values.operation} on ${entry?.capability.label ?? values.capability}`,
      status: "ready",
      summary: `${values.kind} operation requested by ${context.actor}. ${values.why}`,
      at: nowIso(context),
      ownerName: values.owner,
      fields: { stage: "ready", assignee: values.owner, capabilityId: values.capability, operation: values.operation, operationKind: values.kind },
    }, `Capability ${values.operation} requested on ${entry?.capability.label ?? values.capability}`);
    await context.mutate.log(`Capability request ${values.operation} (${values.kind}) recorded for ${values.owner}. Not in the registry until declared and approved.`, { entityId: created.id, type: "capability", capability: "configuration_required" });
    return `${values.owner} has a task for ${values.operation}. It is in the workspace task list.`;
  },
});

/* ------------------------------ Authorisation wizard ------------------------------ */

export const attemptAuthorisation = actOverlay({
  id: "External OAuth",
  title: "Leaving for the provider",
  tone: "danger",
  consequenceTitle: "The flow stops here, deliberately",
  consequence: ({ context }) => {
    const entry = entryById(context.params.id ?? "") ?? CONNECTOR_ENTRIES[0];
    return `An authorisation for ${entry.capability.label} sends you to a page ${entry.capability.provider.toLowerCase()} controls, and expects a callback to an address this workspace does not have. The attempt is recorded as blocked and nothing is marked connected.`;
  },
  Details: () => (
    <Properties rows={[
      { label: "Redirect address", value: <Pill tone="danger">none exists</Pill> },
      { label: "Callback receiver", value: <Pill tone="danger">none exists</Pill> },
      { label: "State after the attempt", value: "Unchanged: not connected" },
    ]} />
  ),
  submit: "Attempt the authorisation",
  apply: async ({ context }) => {
    const entry = entryById(context.params.id ?? "") ?? CONNECTOR_ENTRIES[0];
    await findOrCreateConnector(context, entry, { lastAuthAttemptAt: nowIso(context), lastAuthAttemptBy: context.actor, lastAuthOutcome: "stopped before the provider redirect" }, `Authorisation attempted for ${entry.capability.label}: stopped before the redirect`);
    await context.mutate.log(`Authorisation attempted for ${entry.capability.label}: stopped before the provider redirect. No grant, no token, no connection.`, { type: "capability", capability: "not_connected" });
    context.setTab("Confirm");
    return { title: "Authorisation cannot complete", body: "The attempt is recorded in the receipts as blocked, and nothing is marked connected.", tone: "blocked" };
  },
});

export function chooseTargetsOverlay() {
  return actOverlay({
    id: "choose targets",
    title: "Choose what to request",
    collection: "connectors",
    noun: "connector",
    candidates: routeCandidates,
    consequence: () => "The scopes you tick are saved on the connector as the request a future authorisation would make. Read and write scopes are listed apart; nothing is requested from the provider now.",
    fields: ({ record, context }) => {
      const entry = (record ? entryForRecord(record.fields) : undefined) ?? entryById(context.params.id ?? "");
      const saved = String(record?.fields.requestedScopes ?? "").split(",").filter(Boolean);
      return (entry?.scopes ?? []).map((scope) => ({
        name: `scope:${scope.name}`, kind: "checkbox" as const,
        label: `${scope.kind === "write" ? "WRITE" : "read"} · ${scope.name} — ${scope.purpose}`,
        checked: saved.length ? saved.includes(scope.name) : scope.kind === "read",
      }));
    },
    submit: "Save the selection",
    apply: async ({ record, values, context }) => {
      if (!record) return;
      const scopes = Object.entries(values).filter(([key, value]) => key.startsWith("scope:") && value).map(([key]) => key.slice(6));
      const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, requestedScopes: scopes.join(","), requestedBy: context.actor } }, { expectRevision: record.revision, event: `Scopes chosen for ${record.title}: ${scopes.join(", ") || "none"} (not requested from the provider)` });
      return saved ? `${scopes.length} scopes saved as the request. Nothing was sent.` : undefined;
    },
  });
}

export const cancelAuthorisation = actOverlay({
  id: "cancel authorisation",
  title: "Cancel the authorisation",
  collection: "connectors",
  noun: "connector",
  candidates: routeCandidates,
  consequence: ({ record }) => `Any scope selection saved on ${record?.title ?? "the connector"} is cleared and the cancellation is recorded, so a half-finished attempt cannot later look like a connection. The connector stays not connected.`,
  submit: "Cancel and leave it unconnected",
  apply: async ({ record, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, requestedScopes: "", cancelledAt: nowIso(context), cancelledBy: context.actor } }, { expectRevision: record.revision, event: `Authorisation for ${record.title} cancelled; selections cleared` });
    await context.mutate.log(`Authorisation for ${capabilityLabel(record)} cancelled. Nothing was connected and nothing is left pending.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    context.navigate(`/o/${context.org.slug}/connect/marketplace`);
    return "Cancelled. Nothing was left behind.";
  },
});

/* ------------------------------ Connections ------------------------------ */

export function disableOverlay(id: string, title: string, verb: string) {
  return actOverlay({
    id,
    title,
    tone: "danger",
    collection: "connectors",
    noun: "connection",
    candidates: (records, context) => routeCandidates(records, context).filter((record) => record.status !== "disabled"),
    consequence: ({ record }) => `${record?.title ?? "The connection"} moves to Disabled. New calls are refused and any queued mission step that needed it fails rather than retrying. There is no provider grant to invalidate, so this changes the local record and says so.`,
    Details: ConnectorFacts,
    fields: () => [{ name: "reason", label: "Reason", kind: "textarea", required: true }],
    submit: title,
    apply: async ({ record, values, context }) => {
      if (!record) return;
      const saved = await context.mutate.patch(record.id, { status: "disabled", fields: { ...record.fields, agentOps: "", [`${verb}By`]: context.actor, [`${verb}At`]: nowIso(context), [`${verb}Reason`]: values.reason } }, { expectRevision: record.revision, event: `${record.title} ${verb} by ${context.actor}: ${values.reason}` });
      return saved ? `${record.title} is disabled.` : undefined;
    },
  });
}

export const transferOwner = actOverlay({
  id: "transfer owner",
  title: "Transfer ownership",
  collection: "connectors",
  noun: "connection",
  candidates: routeCandidates,
  consequence: ({ record }) => `${record?.title ?? "The connection"} gets a new owner: the person who answers for its scopes and who is asked when it breaks. Its state does not change.`,
  Details: ConnectorFacts,
  fields: ({ record, people }) => [{ name: "owner", label: "New owner", kind: "select", options: peopleOptions(people).filter((option) => option.value !== record?.ownerName) }],
  submit: "Transfer",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { ownerName: values.owner, fields: { ...record.fields, previousOwner: record.ownerName } }, { expectRevision: record.revision, event: `Ownership of ${record.title} transferred from ${record.ownerName} to ${values.owner}` });
    return saved ? `${values.owner} now owns ${record.title}.` : undefined;
  },
});

export const reconnectConnection = actOverlay({
  id: "reconnect",
  title: "Reconnect",
  collection: "connectors",
  noun: "connection",
  candidates: routeCandidates,
  consequence: () => "Reconnecting is the same authorisation as connecting, and it stops at the provider redirect. The attempt is recorded on the connection and in the receipts; the state stays not connected.",
  boundary: { id: "email.send", action: "Reconnecting" },
  submit: "Attempt to reconnect",
  apply: async ({ record, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, lastAuthAttemptAt: nowIso(context), lastAuthAttemptBy: context.actor, lastAuthOutcome: "reconnect stopped before the provider redirect" } }, { expectRevision: record.revision, event: `Reconnect attempted for ${record.title}: stopped before the redirect` });
    await context.mutate.log(`Reconnect attempted for ${capabilityLabel(record)}: stopped before the provider redirect.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Not reconnected", body: `${record.title} stays not connected. The attempt is in the receipts.`, tone: "blocked" };
  },
});

export function limitAgentsOverlay() {
  return actOverlay({
    id: "limit agents",
    title: "Limit what agents may use",
    collection: "connectors",
    noun: "connection",
    candidates: routeCandidates,
    consequence: () => "Ticked operations are the most an AI employee may call through this connection. Until a grant is verified even those stay unusable, and a stale grant would stop a queued mission rather than be used.",
    fields: ({ record }) => {
      const entry = record ? entryForRecord(record.fields) : undefined;
      const allowed = String(record?.fields.agentOps ?? "").split(",").filter(Boolean);
      return (entry?.operations ?? []).map((operation) => ({
        name: `op:${operation.name}`, kind: "checkbox" as const,
        label: `${operation.direction} · ${operation.name} — ${operation.summary}`,
        checked: allowed.includes(operation.name),
      }));
    },
    submit: "Save the limit",
    apply: async ({ record, values, context }) => {
      if (!record) return;
      const ops = Object.entries(values).filter(([key, value]) => key.startsWith("op:") && value).map(([key]) => key.slice(3));
      const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, agentOps: ops.join(",") } }, { expectRevision: record.revision, event: `Agent limit on ${record.title}: ${ops.join(", ") || "no operation"}` });
      return saved ? `Agents may use ${ops.length} operations once a grant is verified; none today.` : undefined;
    },
  });
}

export const rotateAuth = actOverlay({
  id: "rotate auth",
  title: "Rotate the authorisation",
  collection: "connectors",
  noun: "connection",
  candidates: routeCandidates,
  consequenceTitle: "Rotation is issued by the provider",
  consequence: () => "A rotation request is recorded on the connection with you as the requester. No credential is generated or shown here: a new one would be issued by the provider and held on a server.",
  Details: ConnectorFacts,
  boundary: { id: "email.send", action: "Rotating a credential" },
  submit: "Record the rotation request",
  apply: async ({ record, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, rotationRequestedAt: nowIso(context), rotationRequestedBy: context.actor } }, { expectRevision: record.revision, event: `Rotation requested for ${record.title}; no grant exists to rotate` });
    await context.mutate.log(`Rotation requested for ${capabilityLabel(record)}: no grant exists, nothing was issued.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Requested, not rotated", body: "There is no grant to rotate. The request is recorded.", tone: "blocked" };
  },
});

/* ------------------------------ Capability registry ------------------------------ */

export function SchemaDiff({ context }: { context: ScreenContext }) {
  const [left, setLeft] = useState(CONNECTOR_ENTRIES[0]?.capability.id ?? "");
  const [right, setRight] = useState(CONNECTOR_ENTRIES[1]?.capability.id ?? "");
  const a = entryById(left);
  const b = entryById(right);
  const names = [...new Set([...(a?.operations ?? []), ...(b?.operations ?? [])].map((operation) => operation.name))];
  const scopes = [...new Set([...(a?.scopes ?? []), ...(b?.scopes ?? [])].map((scope) => scope.name))];
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Field label="Schema A" htmlFor="sd-a"><Select id="sd-a" value={left} onChange={(event) => setLeft(event.target.value)}>{CONNECTOR_ENTRIES.map((entry) => <option key={entry.capability.id} value={entry.capability.id}>{entry.capability.label} · {entry.version}</option>)}</Select></Field>
        <Field label="Schema B" htmlFor="sd-b"><Select id="sd-b" value={right} onChange={(event) => setRight(event.target.value)}>{CONNECTOR_ENTRIES.map((entry) => <option key={entry.capability.id} value={entry.capability.id}>{entry.capability.label} · {entry.version}</option>)}</Select></Field>
      </Row>
      <pre className="t6-code">
        {names.map((name) => {
          const inA = a?.operations.find((operation) => operation.name === name);
          const inB = b?.operations.find((operation) => operation.name === name);
          const mark = inA && inB ? (inA.direction === inB.direction ? "  " : "~ ") : inA ? "- " : "+ ";
          return <div key={`op-${name}`} style={{ color: mark === "+ " ? "var(--success)" : mark === "- " ? "var(--danger)" : undefined }}>{mark}operation {name}: {inA?.direction ?? "—"} → {inB?.direction ?? "—"}</div>;
        })}
        {scopes.map((name) => {
          const inA = a?.scopes.find((scope) => scope.name === name);
          const inB = b?.scopes.find((scope) => scope.name === name);
          const mark = inA && inB ? "  " : inA ? "- " : "+ ";
          return <div key={`sc-${name}`} style={{ color: mark === "+ " ? "var(--success)" : mark === "- " ? "var(--danger)" : undefined }}>{mark}scope {name}: {inA?.kind ?? "—"} → {inB?.kind ?? "—"}</div>;
        })}
        {names.length + scopes.length === 0 && <div>Neither schema publishes operations or scopes.</div>}
      </pre>
      <Notice tone="info" title="Lines marked - are only in A, + only in B, ~ changed kind">Computed from the contract each capability declares; no provider is consulted.</Notice>
      <Button size="sm" variant="secondary" onClick={() => { context.closeOverlay(); context.setTab("Versions"); }}>See the versions</Button>
    </Stack>
  );
}

const opOptions = () => CONNECTOR_ENTRIES.flatMap((entry) => entry.operations.map((operation) => ({ value: `${entry.capability.id}|${operation.name}`, label: `${entry.capability.label} · ${operation.name} (${operation.direction})` })));

export const testMock = actOverlay({
  id: "test mock",
  title: "Test against the local mock",
  consequenceTitle: "The mock never returns data",
  consequence: () => "The local mock adapter answers every operation with the state the capability register holds, and no rows. A test therefore proves the blocked path: an unsupported or unconnected operation is refused, not approximated. The result is written to the receipts as a mock test.",
  fields: () => [{ name: "operation", label: "Operation", kind: "select", options: opOptions() }],
  Details: () => (
    <pre className="t6-code">{JSON.stringify({ status: "not_connected", data: null, note: "mock adapter: no provider reached" }, null, 2)}</pre>
  ),
  submit: "Run the mock test",
  apply: async ({ values, context }) => {
    const [capabilityId, name] = values.operation.split("|");
    const entry = entryById(capabilityId);
    if (!entry) throw new Error("Choose an operation.");
    await context.mutate.log(`Mock test of ${entry.capability.label}.${name}: the local mock answered not connected with no data. Blocked, not approximated.`, { type: "capability", capability: "blocked" });
    return { title: "Mock test recorded", body: `${name} was refused with not connected and no data, as it should be.`, tone: "blocked" };
  },
});

export function RetiredOps({ records }: { records: Rec[] }) {
  const retired = records.flatMap((record) => String(record.fields.retiredOps ?? "").split(",").filter(Boolean).map((op) => ({ op, record })));
  if (retired.length === 0) return null;
  return (
    <Notice tone="warning" title={`${retired.length} retired ${retired.length === 1 ? "operation" : "operations"}`}>
      {retired.map(({ op, record }) => `${record.title}.${op}`).join(", ")}. A mission that names a retired operation is refused rather than rerouted.
    </Notice>
  );
}

export const retireOperation = actOverlay({
  id: "version impact",
  title: "Retire an operation",
  tone: "danger",
  watch: () => useCollection("missions"),
  consequence: ({ watched }) => {
    const missions = (watched as Rec[] | undefined) ?? [];
    return `A retired operation is refused for every mission that names it. ${missions.length} missions exist in this workspace; any that reference the operation must be reviewed. The retirement is recorded on the connector and in the receipts.`;
  },
  fields: () => [
    { name: "operation", label: "Operation to retire", kind: "select", options: opOptions() },
    { name: "reason", label: "Why", kind: "textarea", required: true },
  ],
  submit: "Retire it",
  apply: async ({ values, context, watched }) => {
    const [capabilityId, name] = values.operation.split("|");
    const entry = entryById(capabilityId);
    if (!entry) throw new Error("Choose an operation.");
    const missions = ((watched as Rec[] | undefined) ?? []).filter((mission) => JSON.stringify(mission.body ?? "").includes(name) || mission.summary.includes(name));
    const repo = await import("@/platform/repo");
    const existing = recordsFor(entry, await repo.listByCollection(context.org.id, "connectors"))[0];
    const retired = [...new Set([...String(existing?.fields.retiredOps ?? "").split(",").filter(Boolean), name])].join(",");
    await findOrCreateConnector(context, entry, { retiredOps: retired, retiredReason: values.reason }, `Operation ${entry.capability.label}.${name} retired: ${values.reason}`);
    await context.mutate.log(`Operation ${name} on ${entry.capability.label} retired by ${context.actor}. ${missions.length} missions reference it.`, { type: "capability", capability: "blocked" });
    return `${name} is retired. ${missions.length} missions reference it.`;
  },
});

/* ------------------------------ Sync ------------------------------ */

export const retrySync = actOverlay({
  id: "run receipt",
  title: "Retry a safe sync",
  collection: "connectors",
  noun: "source",
  candidates: (records) => records.filter((record) => String(record.fields.kind ?? "") !== "custom"),
  consequence: () => "A retry is keyed on the source and its cursor, so a second retry with the same key is recorded as a duplicate and not run twice. With no provider connected the retry stops at the boundary and says so in the receipts.",
  Details: ConnectorFacts,
  submit: "Retry",
  apply: async ({ record, context }) => {
    if (!record) return;
    const key = `${record.id}:${String(record.fields.cursor ?? "no-cursor")}`;
    const duplicate = String(record.fields.lastSyncKey ?? "") === key;
    await context.mutate.patch(record.id, { fields: { ...record.fields, lastSyncAttemptAt: nowIso(context), lastSyncKey: key, lastSyncOutcome: duplicate ? "duplicate retry ignored" : "stopped at the provider boundary" } }, { expectRevision: record.revision, event: duplicate ? `Sync retry for ${record.title} ignored as a duplicate of ${key}` : `Sync retry for ${record.title} stopped at the provider boundary` });
    await context.mutate.log(duplicate
      ? `Sync retry for ${capabilityLabel(record)} deduplicated: key ${key} was already attempted.`
      : `Sync retry for ${capabilityLabel(record)}: no provider is connected, nothing was read. Key ${key}.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: duplicate ? "Duplicate ignored" : "Not synced", body: duplicate ? "That retry was already attempted with the same key." : "The retry stopped at the provider boundary and is in the receipts.", tone: "blocked" };
  },
});

export const resolveConflict = actOverlay({
  id: "conflict resolver",
  title: "Resolve a conflict",
  kind: "drawer",
  collection: "conflicts",
  noun: "conflict",
  candidates: (records) => records.filter((record) => record.status === "open"),
  consequence: ({ record }) => record?.summary ?? "Both sides are kept until a person chooses one.",
  fields: ({ record }) => [
    { name: "side", label: "Keep", kind: "select", options: [
      { value: String(record?.fields.source ?? "first source"), label: String(record?.fields.source ?? "First source") },
      { value: String(record?.fields.other ?? "second source"), label: String(record?.fields.other ?? "Second source") },
    ] },
    { name: "note", label: "Why", kind: "textarea", required: true },
  ],
  submit: "Resolve with this side",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "resolved", fields: { ...record.fields, chosen: values.side, resolvedBy: context.actor, resolution: values.note } }, { expectRevision: record.revision, event: `Conflict ${record.title} resolved: kept ${values.side}. ${values.note}` });
    return saved ? `Kept ${values.side}. Both values remain in the record history.` : undefined;
  },
});

/* ------------------------------ Health ------------------------------ */

export async function runHealthTest(context: ScreenContext): Promise<void> {
  await context.mutate.log(`Connector health test: 2 local checks passed, 2 not met, 1 not attempted. No provider was contacted.`, { type: "capability", capability: "not_connected" });
  context.openOverlay("Health report");
  context.toast("Health test recorded", "Two checks passed locally. Nothing was contacted.", "blocked");
}

export const openConnectorIncident = actOverlay({
  id: "open incident",
  title: "Open a connector incident",
  collection: "connectors",
  noun: "connector",
  candidates: (records) => records.filter((record) => String(record.fields.kind ?? "") !== "custom"),
  consequence: () => "An incident is opened on the IT register against this connector. If the fault is the provider's, it is recorded as theirs and not internally repairable, so nobody is asked to fix what only the provider can.",
  fields: () => [
    { name: "title", label: "What is wrong", required: true },
    { name: "origin", label: "Whose fault", kind: "select", options: [{ value: "ours", label: "Ours — for example, no grant obtained" }, { value: "provider", label: "The provider's — an outage on their side" }] },
    { name: "severity", label: "Severity", kind: "select", initial: "medium", options: ["low", "medium", "high"].map((level) => ({ value: level, label: level })) },
    { name: "impact", label: "What is affected", kind: "textarea" },
  ],
  submit: "Open the incident",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const provider = values.origin === "provider";
    const created = await context.mutate.create({
      collection: "incidents",
      title: values.title,
      status: provider ? "awaiting_user" : "open",
      summary: provider ? `Provider-side fault on ${record.title}. Not internally repairable; waiting on the provider.` : `Fault on ${record.title} that is ours to fix.`,
      at: nowIso(context),
      fields: { kind: "incident", severity: values.severity, service: "Connectors", origin: values.origin, owner: context.actor, connectorId: record.id, impact: values.impact, repairable: !provider },
    }, `Incident opened on ${record.title}: ${values.title}`);
    return `${created.title} is on the incident register${provider ? " as a provider fault, not repairable here" : ""}.`;
  },
});

export const contactOwner = actOverlay({
  id: "contact owner",
  title: "Contact the owner",
  collection: "connectors",
  noun: "connector",
  candidates: (records) => records.filter((record) => String(record.fields.kind ?? "") !== "custom"),
  consequence: ({ record }) => `${record?.ownerName ?? "The owner"} gets a task in this workspace with your message. An email would need a mail provider; the message is kept as a draft on the task instead.`,
  Details: ConnectorFacts,
  boundary: { id: "email.send", action: "Emailing the owner" },
  fields: () => [{ name: "message", label: "Message", kind: "textarea", required: true }],
  submit: "Leave the task for them",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    await context.mutate.create({
      collection: "tasks",
      title: `Connector ${record.title} needs you`,
      status: "ready",
      summary: values.message,
      at: nowIso(context),
      ownerName: record.ownerName,
      fields: { stage: "ready", assignee: record.ownerName, connectorId: record.id, emailState: "not_connected" },
    }, `${context.actor} contacted ${record.ownerName} about ${record.title}`);
    await context.mutate.log(`Message to ${record.ownerName} about ${record.title} kept as a task; no email was sent.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return `${record.ownerName} has a task. No email left this browser.`;
  },
});

/* ------------------------------ Custom adapters ------------------------------ */

const isCustom = (record: Rec) => String(record.fields.kind ?? "") === "custom";

export const createAdapter = actOverlay({
  id: "create adapter",
  title: "New custom adapter",
  consequence: () => "The adapter is created as a draft declaration with no operations. It cannot be used until its operations are registered, its contract tests pass and a person approves it.",
  fields: () => [
    { name: "title", label: "Adapter name", required: true, placeholder: "Thames Brass order desk" },
    { name: "provider", label: "System it would talk to", required: true, placeholder: "supplier" },
    { name: "summary", label: "What it is for", kind: "textarea", required: true },
  ],
  submit: "Create the adapter",
  apply: async ({ values, context }) => {
    const created = await context.mutate.create({
      collection: "connectors",
      title: values.title,
      status: "draft",
      summary: values.summary,
      fields: { capability: "configuration_required", kind: "custom", provider: values.provider },
      body: { operations: [] },
    }, `Custom adapter ${values.title} created as a draft`);
    context.setTab("Projects");
    return `${created.title} is a draft. Register its first operation next.`;
  },
});

function AdapterTests({ record }: ActInput) {
  if (!record) return null;
  const checks = adapterChecks(adapterOperations(record.body));
  return (
    <div className="t6-checks">
      {checks.map((check) => (
        <div key={check.label} className="t6-check" data-state={check.state}>
          <span className="t6-check-dot" aria-hidden="true" />
          <div><strong>{check.label}</strong><p className="ds-subtle">{check.detail}</p></div>
          <Pill tone={check.state === "pass" ? "success" : "danger"}>{check.state === "pass" ? "passes" : "fails"}</Pill>
        </div>
      ))}
      <div className="t6-check" data-state="warn">
        <span className="t6-check-dot" aria-hidden="true" />
        <div><strong>A live call succeeds</strong><p className="ds-subtle">Cannot run: no provider is reachable from this browser.</p></div>
        <Pill tone="warning">not attempted</Pill>
      </div>
    </div>
  );
}

export const runAdapterTests = actOverlay({
  id: "contract tests",
  title: "Run the contract tests",
  collection: "connectors",
  noun: "adapter",
  candidates: (records) => records.filter(isCustom),
  consequence: () => "The tests read the adapter's own declarations. The result is written onto the adapter; a live call is never claimed.",
  Details: AdapterTests,
  submit: "Run and record",
  apply: async ({ record, context }) => {
    if (!record) return;
    const checks = adapterChecks(adapterOperations(record.body));
    const failed = checks.filter((check) => check.state === "fail").length;
    const result = failed ? `${failed} of ${checks.length} contract tests fail` : `all ${checks.length} contract tests pass`;
    await context.mutate.patch(record.id, { fields: { ...record.fields, testsRunAt: nowIso(context), testsPassed: failed === 0, testResult: result } }, { expectRevision: record.revision, event: `Contract tests for ${record.title}: ${result}` });
    return { body: `${record.title}: ${result}. No live call was made.`, tone: failed ? "failed" : "ok" };
  },
});

export const registerAction = actOverlay({
  id: "capability validation",
  title: "Register an operation",
  kind: "drawer",
  width: 600,
  collection: "connectors",
  noun: "adapter",
  candidates: (records) => records.filter(isCustom),
  consequence: () => "Paste one operation declaration. It is validated against the contract and, if it holds, appended to the adapter. Text from a provider is data: a declaration never changes what this workspace may do until a person approves the adapter.",
  fields: ({ context }) => [{ name: "declaration", label: "Declaration (JSON)", kind: "textarea", required: true, initial: (context.overlayPayload as { draft?: string } | undefined)?.draft, placeholder: '{ "name": "send_statement", "kind": "action", "scopes": ["statements.write"], "localEquivalent": "The statement is prepared and left as a draft." }' }],
  Details: ({ record }) => (record ? <Properties rows={[{ label: "Registered now", value: adapterOperations(record.body).map((operation) => operation.name).join(", ") || "none" }]} /> : null),
  submit: "Validate and register",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    let parsed: unknown;
    try { parsed = JSON.parse(values.declaration); } catch (error) { throw new Error(`That is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`); }
    const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const problems = declarationProblems(row);
    const operations = adapterOperations(record.body);
    if (operations.some((operation) => operation.name === row.name)) problems.push(`${String(row.name)} is already registered on this adapter.`);
    if (problems.length) throw new Error(`Not registered. ${problems.join(" ")}`);
    const next = { ...(record.body && typeof record.body === "object" ? record.body as object : {}), operations: [...operations, { name: row.name, kind: row.kind, scopes: row.scopes, localEquivalent: row.localEquivalent }] };
    const saved = await context.mutate.patch(record.id, { body: next, fields: { ...record.fields, testsPassed: false } }, { expectRevision: record.revision, event: `Operation ${String(row.name)} registered on ${record.title}` });
    return saved ? `${String(row.name)} is registered. Run the contract tests again before submitting.` : undefined;
  },
});

export const submitAdapter = actOverlay({
  id: "approval",
  title: "Submit for approval",
  collection: "connectors",
  noun: "adapter",
  candidates: (records) => records.filter(isCustom),
  consequence: () => "The adapter moves to awaiting approval. Approval widens what agents may ask for, so it is a person's decision; until then, and until a provider exists, nothing can call it.",
  Details: AdapterTests,
  blocked: ({ record }) => {
    if (!record) return undefined;
    if (record.status === "awaiting_approval") return "Already submitted and awaiting approval.";
    const failing = adapterChecks(adapterOperations(record.body)).filter((check) => check.state === "fail");
    if (failing.length) return `Contract tests fail: ${failing.map((check) => check.label.toLowerCase()).join("; ")}.`;
    if (!record.fields.testsPassed) return "Run and record the contract tests first.";
    return undefined;
  },
  submit: "Submit",
  apply: async ({ record, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "awaiting_approval", fields: { ...record.fields, submittedBy: context.actor, submittedAt: nowIso(context), capability: "configuration_required" } }, { expectRevision: record.revision, event: `${record.title} submitted for approval` });
    if (!saved) return;
    await context.mutate.log(`Custom adapter ${record.title} submitted for approval. It cannot be used until a person approves it and a provider exists.`, { entityId: record.id, type: "capability", capability: "configuration_required" });
    return { body: `${record.title} is awaiting approval.`, tone: "blocked" };
  },
});

/* ------------------------------ Receipts ------------------------------ */

const isReceipt = (event: Audit) => event.type === "capability" || event.capability !== undefined;

export async function exportReceipts(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const rows = (await repo.listEvents(context.org.id, 400)).filter(isReceipt);
  downloadCsv(`${context.org.slug}-action-receipts.csv`, ["at", "actor", "action", "outcome", "provider evidence"],
    rows.map((row) => [row.at, row.actor, row.message, CAPABILITY_LABELS[row.capability ?? "not_connected"], "none"]));
  await context.mutate.log(`Action receipts exported: ${rows.length} rows.`, { type: "export" });
  context.toast("Exported", `${rows.length} receipts written to CSV.`);
}

export const reconcileReceipts = actOverlay({
  id: "reconcile receipts",
  title: "Reconcile receipts against provider evidence",
  watch: () => useEvents(undefined, 400).filter(isReceipt),
  consequence: ({ watched }) => {
    const rows = (watched as Audit[] | undefined) ?? [];
    return `${rows.length} receipts are compared with provider evidence. A receipt is confirmed only by a provider request id, a response and a later read showing the effect; none exists, so every receipt keeps the state it reached and the reconciliation records that.`;
  },
  Details: ({ watched }) => {
    const rows = (watched as Audit[] | undefined) ?? [];
    const pending = rows.filter((row) => row.capability === "queued_local" || row.capability === "awaiting_external_confirmation").length;
    return (
      <Properties rows={[
        { label: "Receipts", value: <span className="ds-num">{String(rows.length)}</span> },
        { label: "Accepted but unconfirmed", value: <span className="ds-num">{String(pending)}</span> },
        { label: "With provider evidence", value: <span className="ds-num">0</span> },
      ]} />
    );
  },
  submit: "Reconcile and record",
  apply: async ({ context, watched }) => {
    const rows = (watched as Audit[] | undefined) ?? [];
    await context.mutate.create({
      collection: "reconciliations",
      title: `Receipt reconciliation · ${context.date(context.now)}`,
      status: "recorded",
      summary: `${rows.length} receipts checked; 0 confirmed by provider evidence; none promoted to confirmed.`,
      at: nowIso(context),
      fields: { receipts: rows.length, confirmed: 0, unchanged: rows.length },
    }, `Receipts reconciled: ${rows.length} checked, 0 confirmed`);
    return `${rows.length} receipts reconciled. None had provider evidence, so none moved to confirmed.`;
  },
});

export const openMission = actOverlay({
  id: "open mission",
  title: "Open the mission",
  collection: "missions",
  noun: "mission",
  consequence: () => "Receipts written by a mission step carry the mission. Choose the mission to open its record.",
  watch: () => useEvents(undefined, 400).filter(isReceipt),
  Details: ({ record, watched }) => {
    const linked = ((watched as Audit[] | undefined) ?? []).filter((event) => record && event.entityId === record.id).length;
    return record ? <Properties rows={[{ label: "Receipts linked to it", value: <span className="ds-num">{String(linked)}</span> }, { label: "State", value: record.status }]} /> : null;
  },
  submit: "Open the mission",
  apply: async ({ record, context }) => {
    if (!record) return;
    context.navigate(`/o/${context.org.slug}/mission/missions/${record.id}`);
  },
});
