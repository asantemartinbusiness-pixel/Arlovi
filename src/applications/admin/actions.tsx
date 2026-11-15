import { useState } from "react";
import {
  Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useOrgRecords } from "@/platform/workspace";
import { capabilityById, CAPABILITY_LABELS } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import { ofKind, StepUp, useAdmin } from "./pieces";

/* ====================================================================== *
 * ADMIN contract actions that change the record they name.
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

const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function boundary(id: string): string {
  const capability = capabilityById(id);
  return capability ? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}. ${capability.note}` : "";
}

/* ------------------------------ ADMIN-001 ------------------------------ */

/** Legal identity changes need a deliberate confirmation and the Owner view. */
export function ConfigureEntity({ context, close }: { context: ScreenContext; close: () => void }) {
  const entities = useCollection("legalEntities").filter((record) => !record.fields.kind);
  const [id, setId] = useState(entities[0]?.id ?? "");
  const entity = entities.find((record) => record.id === id);
  const [name, setName] = useState<string>();
  const [registration, setRegistration] = useState<string>();
  const [taxId, setTaxId] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (entities.length === 0) return <Empty title="No legal entity is recorded">Add one from Finance, Multi-Entity.</Empty>;
  const nextName = name ?? entity?.title ?? "";
  const nextRegistration = registration ?? String(entity?.fields.registration ?? "");
  const nextTax = taxId ?? String(entity?.fields.taxId ?? entity?.fields.vatNumber ?? "");
  const changed = entity && (nextName !== entity.title || nextRegistration !== String(entity.fields.registration ?? "") || nextTax !== String(entity.fields.taxId ?? entity.fields.vatNumber ?? ""));
  return (
    <Stack gap={4}>
      <Field label="Entity">
        <Select aria-label="Entity" value={id} onChange={(event) => { setId(event.target.value); setName(undefined); setRegistration(undefined); setTaxId(undefined); }}>
          {entities.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
        </Select>
      </Field>
      <Field label="Legal name" required><TextInput aria-label="Legal name" value={nextName} onChange={(event) => setName(event.target.value)} /></Field>
      <Row gap={3} wrap>
        <Field label="Registration number"><TextInput aria-label="Registration number" value={nextRegistration} onChange={(event) => setRegistration(event.target.value)} /></Field>
        <Field label="Tax registration"><TextInput aria-label="Tax registration" value={nextTax} onChange={(event) => setTaxId(event.target.value)} /></Field>
      </Row>
      {!context.can("manage_policy") ? (
        <Notice tone="warning" title="Only the Owner view can change legal identity">This shapes the interface; it is not an account security boundary.</Notice>
      ) : (
        <StepUp
          word="ENTITY"
          label="Save the legal identity"
          busy={busy}
          onConfirm={async () => {
            if (!entity || !changed || !nextName.trim()) { context.toast("Nothing changed", "Edit a field first.", "info"); return; }
            setBusy(true);
            const previous = { title: entity.title, registration: entity.fields.registration ?? "", taxId: entity.fields.taxId ?? entity.fields.vatNumber ?? "" };
            const saved = await context.mutate.patch(entity.id, {
              title: nextName.trim(),
              fields: { ...entity.fields, registration: nextRegistration, taxId: nextTax, identityChangedBy: context.actor, identityChangedAt: new Date().toISOString(), previousIdentity: JSON.stringify(previous) },
            }, { expectRevision: entity.revision, event: `Legal identity of ${entity.title} changed by ${context.actor} after a typed confirmation` });
            if (saved) context.toast("Entity updated", `${nextName.trim()} is saved. The previous identity is kept on the record.`);
            setBusy(false);
            close();
          }}
        >
          <Notice tone="info" title="Nothing is filed">Changing a legal name or number here does not notify any registry or tax authority.</Notice>
        </StepUp>
      )}
    </Stack>
  );
}

/* ------------------------------ ADMIN-002 ------------------------------ */

/** Suspension stops access and live sessions, keeps grants and keys, and can be lifted. */
export function SuspendMember({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const member = data.members.find((row) => row.id === context.selectedId);
  const [busy, setBusy] = useState(false);
  if (!member) return <Empty title="Select a member" />;
  const sessions = data.sessions.filter((session) => String(session.fields.member) === member.title && session.status === "active");
  const suspended = member.status === "suspended";
  const self = member.title === context.actor;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Member", value: member.title },
        { label: "Status", value: <Pill tone={suspended ? "warning" : "success"} dot>{member.status}</Pill> },
        { label: "Live sessions ended", value: String(sessions.length) },
        { label: "Kept", value: "Role, grants and API keys, so a suspension can be lifted without rebuilding access" },
      ]} />
      {self && <Notice tone="danger" title="You cannot suspend yourself">Ask another owner.</Notice>}
      <Row gap={2}>
        <Button
          variant={suspended ? "primary" : "danger"}
          busy={busy}
          disabled={self || !context.can("edit_people")}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(member.id, {
              status: suspended ? "active" : "suspended",
              fields: { ...member.fields, ...(suspended ? { reinstatedBy: context.actor, reinstatedAt: new Date().toISOString() } : { suspendedBy: context.actor, suspendedAt: new Date().toISOString() }) },
            }, { expectRevision: member.revision, event: `${member.title} ${suspended ? "reinstated" : "suspended"} by ${context.actor}` });
            if (!suspended) {
              for (const session of sessions) {
                await context.mutate.patch(session.id, { status: "revoked", fields: { ...session.fields, revokedBy: context.actor, revokedAt: new Date().toISOString() } }, { event: `Session ended on suspension: ${session.title}` });
              }
            }
            if (saved) context.toast(suspended ? "Reinstated" : "Suspended", suspended ? `${member.title} can use the workspace again.` : `${member.title} is suspended and ${sessions.length} session${sessions.length === 1 ? " was" : "s were"} ended.`);
            setBusy(false);
            close();
          }}
        >
          {suspended ? `Reinstate ${member.title}` : `Suspend ${member.title}`}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function MembersExport({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const [includeAgents, setIncludeAgents] = useState(false);
  const rows = data.members.filter((row) => includeAgents || String(row.fields.kind ?? "human") === "human");
  return (
    <Stack gap={4}>
      <Checkbox label="Include AI employees" checked={includeAgents} onChange={(event) => setIncludeAgents(event.target.checked)} />
      <p className="ds-subtle">Name, role view, status, second factor, last access and who invited them. Nothing secret is included.</p>
      <Row gap={2}>
        <Button variant="primary" onClick={async () => {
          const header = "name,kind,role,status,email,mfa,last_access,invited_by\n";
          download(`${context.org.slug}-members.csv`, header + rows.map((row) => [row.title, row.fields.kind, row.fields.role, row.status, row.fields.email, row.fields.mfa, row.fields.lastAccessAt, row.fields.invitedBy].map(cell).join(",")).join("\n"));
          await context.mutate.log(`Member list exported by ${context.actor} (${rows.length} rows)`, { type: "admin.export" });
          context.toast("Exported", `${rows.length} members written to a CSV file in this browser.`);
          close();
        }}>Download {rows.length} rows</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ ADMIN-005 ------------------------------ */

export function ApproveIncrease({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const approvals = useCollection("approvals").filter((row) => row.fields.action === "admin.raise_budget" && row.status === "awaiting_approval");
  const [id, setId] = useState(approvals.find((row) => row.fields.targetId === context.selectedId)?.id ?? approvals[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const request = approvals.find((row) => row.id === id);
  const budget = data.budgets.find((row) => row.id === String(request?.fields.targetId ?? ""));
  if (approvals.length === 0) return <Empty title="No increase is waiting">Request one from Inspect headroom first. An increase is approved against a request, never set silently.</Empty>;
  const drifted = budget && String(budget.revision) !== String(request?.fields.planVersion ?? "");
  const blocked = !budget ? "The budget this request names is not in the workspace."
    : drifted ? `The budget changed since the request (revision ${String(request?.fields.planVersion)} → ${budget.revision}). Raise a fresh request.`
      : String(request?.fields.requester ?? "") === context.actor ? "You raised this request, so someone else must approve it." : undefined;
  return (
    <Stack gap={4}>
      <Field label="Request">
        <Select aria-label="Request" value={id} onChange={(event) => setId(event.target.value)}>
          {approvals.map((row) => <option key={row.id} value={row.id}>{row.title} · {context.money(row.amountMinor)}</option>)}
        </Select>
      </Field>
      {budget && <Properties rows={[
        { label: "Current cap", value: context.money(budget.amountMinor) },
        { label: "Requested cap", value: context.money(request?.amountMinor) },
        { label: "Committed and reserved", value: context.money(Number(budget.fields.committedMinor ?? 0) + Number(budget.fields.reservedMinor ?? 0)) },
        { label: "Requested by", value: String(request?.fields.requester ?? "") },
        { label: "Provider spend", value: budget.fields.usageKnown === false ? "Unknown: no provider connected" : budget.fields.lagDays ? `Lags ${String(budget.fields.lagDays)} days` : "Local figures" },
      ]} />}
      {blocked && <Notice tone="danger" title="This increase cannot be approved">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("approve_payment")}
          onClick={async () => {
            if (!budget || !request) return;
            setBusy(true);
            // Bound to the revision the request was raised against, so a concurrent change is refused.
            const saved = await context.mutate.patch(budget.id, {
              amountMinor: Number(request.amountMinor ?? 0),
              fields: { ...budget.fields, previousCapMinor: Number(budget.amountMinor ?? 0), capRaisedBy: context.actor, capRaisedAt: new Date().toISOString() },
            }, { expectRevision: budget.revision, event: `Cap on ${budget.title} raised to ${context.money(request.amountMinor)} by ${context.actor}` });
            if (saved) {
              await context.mutate.patch(request.id, { status: "approved", fields: { ...request.fields, decision: "approved", decidedBy: context.actor, decidedAt: new Date().toISOString() } }, { expectRevision: request.revision, event: `Budget increase approved by ${context.actor}` });
              context.toast("Increase approved", `${budget.title} is capped at ${context.money(request.amountMinor)}. ${context.actor} is recorded as approver.`);
            }
            setBusy(false);
            close();
          }}
        >
          Approve the increase
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ ADMIN-006 ------------------------------ */

export function SessionsExport({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const [activeOnly, setActiveOnly] = useState(true);
  const rows = data.sessions.filter((row) => !activeOnly || row.status === "active");
  return (
    <Stack gap={4}>
      <Checkbox label="Active sessions only" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
      <Notice tone="info" title="Local session records">These are records in this browser. No identity provider has verified them.</Notice>
      <Row gap={2}>
        <Button variant="primary" onClick={async () => {
          const header = "session,member,device,platform,location,status,mfa,started\n";
          download(`${context.org.slug}-sessions.csv`, header + rows.map((row) => [row.title, row.fields.member, row.fields.device, row.fields.platform, row.fields.location, row.status, row.fields.mfa, row.at].map(cell).join(",")).join("\n"));
          await context.mutate.log(`Sessions exported by ${context.actor} (${rows.length} rows)`, { type: "admin.export" });
          context.toast("Exported", `${rows.length} sessions written to a CSV file.`);
          close();
        }}>Download {rows.length} sessions</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ ADMIN-007 ------------------------------ */

/** Audit retention can be lengthened, never used to delete entries. */
export function AuditRetention({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const events = useEvents(undefined, 500);
  const policy = ofKind(data.policies, "auditRetention")[0];
  const current = Number(policy?.fields.years ?? 6);
  const [years, setYears] = useState(current);
  const [busy, setBusy] = useState(false);
  const oldest = events.map((event) => event.at).sort()[0];
  const shorter = years < current;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The audit trail is append-only">
        Retention says how long entries must be kept. It can be lengthened. It can never be shortened below what is already promised, and nothing here deletes an entry.
      </Notice>
      <Properties rows={[
        { label: "Kept for now", value: `${current} years` },
        { label: "Entries held", value: String(events.length) },
        { label: "Oldest entry", value: oldest ? context.date(oldest) : "None" },
      ]} />
      <Field label="Keep audit entries for, years" hint={shorter ? "Shorter than the current promise: refused." : undefined}>
        <TextInput aria-label="Keep audit entries for, years" type="number" min={1} value={String(years)} onChange={(event) => setYears(Math.max(1, Number(event.target.value) || 1))} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={shorter || years === current || !context.can("manage_policy")}
          onClick={async () => {
            setBusy(true);
            if (policy) await context.mutate.patch(policy.id, { fields: { ...policy.fields, years, changedBy: context.actor } }, { expectRevision: policy.revision, event: `Audit retention lengthened from ${current} to ${years} years by ${context.actor}` });
            else await context.mutate.create({ collection: "policies", title: "Audit retention", status: "active", summary: `Audit entries kept for ${years} years.`, fields: { kind: "auditRetention", years, changedBy: context.actor } }, `Audit retention set to ${years} years by ${context.actor}`);
            context.toast("Retention saved", `Audit entries are kept for ${years} years.`);
            setBusy(false);
            close();
          }}
        >
          Save retention
        </Button>
        <Button variant="secondary" onClick={() => { close(); context.navigate(`/o/${context.org.slug}/admin/privacy`); }}>Other retention schedules</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ ADMIN-009 ------------------------------ */

function unpaid(rows: Rec[]): Rec[] {
  return rows.filter((row) => !["paid", "paid_locally", "void"].includes(row.status));
}

/** Paying stops at the processor boundary: the request is recorded, nothing is charged. */
export function PaySubscription({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const open = unpaid(data.billingInvoices);
  const [id, setId] = useState(open[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const invoice = open.find((row) => row.id === id);
  if (open.length === 0) return <Empty title="Nothing is due">Every subscription invoice is settled.</Empty>;
  const pending = invoice?.fields.paymentState === "awaiting_external_confirmation";
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No card is taken here">{boundary("payment.capture")} The invoice is marked as awaiting the processor so nobody pays it twice.</Notice>
      <Field label="Invoice">
        <Select aria-label="Invoice" value={id} onChange={(event) => setId(event.target.value)}>
          {open.map((row) => <option key={row.id} value={row.id}>{row.title} · {context.money(row.amountMinor)} · due {context.date(String(row.fields.dueAt ?? ""))}</option>)}
        </Select>
      </Field>
      {pending && <Notice tone="info" title="Already awaiting the processor">Requested by {String(invoice?.fields.paymentRequestedBy ?? "someone")}. A second request is refused.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!invoice || pending || !context.can("manage_policy")}
          onClick={async () => {
            if (!invoice) return;
            setBusy(true);
            const saved = await context.mutate.patch(invoice.id, {
              fields: { ...invoice.fields, paymentState: "awaiting_external_confirmation", paymentRequestedBy: context.actor, paymentRequestedAt: new Date().toISOString() },
            }, { expectRevision: invoice.revision, event: `Payment of ${invoice.title} requested by ${context.actor}; awaiting a payment processor` });
            await context.mutate.log(`Payment of ${invoice.title} held at the processor boundary`, { entityId: invoice.id, type: "billing.payment", capability: "awaiting_external_confirmation" });
            if (saved) context.toast("Awaiting the processor", `${invoice.title} is marked for payment. Nothing was charged and no card data was collected.`, "info");
            setBusy(false);
            close();
          }}
        >
          Pay {invoice ? context.money(invoice.amountMinor) : ""}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function DownloadInvoices({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const [chosen, setChosen] = useState<string[]>(data.billingInvoices.map((row) => row.id));
  const rows = data.billingInvoices.filter((row) => chosen.includes(row.id));
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {data.billingInvoices.map((row) => (
          <Checkbox key={row.id} label={`${row.title} · ${context.money(row.amountMinor)} · ${row.status.replace(/_/g, " ")}`} checked={chosen.includes(row.id)}
            onChange={(event) => setChosen((list) => (event.target.checked ? [...list, row.id] : list.filter((item) => item !== row.id)))} />
        ))}
      </Stack>
      <Row gap={2}>
        <Button variant="primary" disabled={rows.length === 0} onClick={() => {
          const header = "invoice,period,lines,amount_minor,status,due,processor\n";
          download(`${context.org.slug}-subscription-invoices.csv`, header + rows.map((row) => [row.title, row.fields.period, row.fields.lines, row.amountMinor, row.status, row.fields.dueAt, row.fields.processor].map(cell).join(",")).join("\n"));
          context.toast("Downloaded", `${rows.length} invoice${rows.length === 1 ? "" : "s"} in a CSV file from this browser.`);
          close();
        }}>Download {rows.length}</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function UpdatePaymentMethod({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const subscription = ofKind(data.policies, "subscription")[0];
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Card details belong with a compliant processor">
        {boundary("payment.capture")} This page never asks for a card number. Updating the method records that a change is wanted; the processor's own secure form would take the details.
      </Notice>
      <Properties rows={[
        { label: "Method on file", value: String(subscription?.fields.paymentMethod ?? "None recorded") },
        { label: "Update requested", value: subscription?.fields.methodUpdateRequestedBy ? `${String(subscription.fields.methodUpdateRequestedBy)}, ${context.dateTime(String(subscription.fields.methodUpdateRequestedAt ?? ""))}` : "No" },
      ]} />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!subscription || !context.can("manage_policy")}
          onClick={async () => {
            if (!subscription) return;
            setBusy(true);
            const saved = await context.mutate.patch(subscription.id, {
              fields: { ...subscription.fields, methodUpdateRequestedBy: context.actor, methodUpdateRequestedAt: new Date().toISOString(), methodUpdateState: "not_connected" },
            }, { expectRevision: subscription.revision, event: `Payment method update requested by ${context.actor}; no processor connected` });
            if (saved) context.toast("Request recorded", "The update is waiting for a payment processor. No card data was collected.", "info");
            setBusy(false);
            close();
          }}
        >
          Request a method update
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ ADMIN-010 ------------------------------ */

export function ExportEverything({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Records", value: String(records.length) },
        { label: "Format", value: "JSON, written by this browser" },
        { label: "Destination", value: "Your downloads folder. Nothing is uploaded." },
      ]} />
      <Row gap={2}>
        <Button variant="primary" busy={busy} disabled={!context.can("export_data")} onClick={async () => {
          setBusy(true);
          const payload = JSON.stringify({ organisation: context.org.slug, exportedAt: new Date().toISOString(), count: records.length, records }, null, 2);
          download(`${context.org.slug}-export.json`, payload, "application/json");
          await context.mutate.create({
            collection: "backups", title: "Full export", status: "ok",
            summary: `${records.length} records written to a JSON file from this browser.`,
            fields: { kind: "export", records: records.length, bytes: payload.length, destination: "Downloads folder", format: "json", requestedBy: context.actor, reason: "Manual export", verified: true },
          }, `Full export of ${records.length} records`);
          context.toast("Exported", `${records.length} records in a JSON file, and the export is recorded.`);
          setBusy(false);
          close();
        }}>Export everything</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Archiving is requested, never executed silently: an export must exist and nothing is deleted. */
export function ArchiveOrg({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const exports = data.backups.filter((row) => row.fields.kind === "export" && row.status === "ok");
  const latest = exports.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const already = data.backups.find((row) => row.fields.kind === "archiveRequest" && row.status === "requested");
  const [busy, setBusy] = useState(false);
  if (!context.can("manage_policy")) return <Notice tone="warning" title="Only the Owner view can archive the organisation">This shapes the interface; it is not an account security boundary.</Notice>;
  if (already) return <Notice tone="info" title="Archiving is already requested">Requested by {String(already.fields.requestedBy ?? "")} on {context.date(already.createdAt)}. The workspace stays usable until a person completes it.</Notice>;
  if (!latest) return <Notice tone="danger" title="Export first">An organisation cannot be archived without a full export on record. Use Export everything first.</Notice>;
  return (
    <StepUp
      word="ARCHIVE"
      label={`Request archiving of ${context.org.name}`}
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        await context.mutate.create({
          collection: "backups", title: `Archive ${context.org.name}`, status: "requested",
          summary: `Archiving requested by ${context.actor}. Records are kept read-only once completed; nothing is deleted.`,
          fields: { kind: "archiveRequest", requestedBy: context.actor, exportId: latest.id, exportRecords: Number(latest.fields.records ?? 0) },
        }, `Organisation archive requested by ${context.actor}`);
        context.toast("Archive requested", "The request is recorded against the latest export. The workspace is unchanged and nothing was deleted.", "info");
        setBusy(false);
        close();
      }}
    >
      <Properties rows={[
        { label: "Latest export", value: `${context.date(latest.createdAt)} · ${String(latest.fields.records ?? 0)} records` },
        { label: "What happens", value: "The request is recorded. Records stay, read-only once completed. Legal holds and statutory retention still apply." },
      ]} />
    </StepUp>
  );
}

/* ------------------------------ ADMIN-011 ------------------------------ */

function randomKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function RotateKey({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const key = data.apiKeys.find((row) => row.id === context.selectedId);
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (issued) {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Copy this now — it is not stored">Only the prefix and last four characters are kept. The value is never included in anything an agent reads.</Notice>
        <Field label="New key"><TextInput aria-label="New key" readOnly value={issued} onFocus={(event) => event.currentTarget.select()} /></Field>
        <Row gap={2}><span className="ds-grow" /><Button variant="primary" onClick={close}>I have copied it</Button></Row>
      </Stack>
    );
  }
  if (!key) return <Empty title="Select a key" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Key", value: key.title },
        { label: "Current", value: `${String(key.fields.prefix ?? "")}…${String(key.fields.last4 ?? "")}` },
        { label: "Scopes kept", value: String(key.fields.scopes ?? "") },
      ]} />
      <Notice tone="warning" title="The old value stops working at once">Anything still using it fails until it is given the new value.</Notice>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={key.status !== "active" || !context.can("manage_connectors")}
          onClick={async () => {
            setBusy(true);
            const secret = `${String(key.fields.environment) === "live" ? "arl_live" : "arl_test"}_${randomKey()}`;
            const saved = await context.mutate.patch(key.id, {
              fields: { ...key.fields, prefix: secret.slice(0, 13), last4: secret.slice(-4), rotatedBy: context.actor, rotatedAt: new Date().toISOString(), previousLast4: String(key.fields.last4 ?? ""), shownOnce: true },
            }, { expectRevision: key.revision, event: `API key rotated by ${context.actor}: ${key.title}` });
            if (saved) setIssued(secret);
            setBusy(false);
          }}
        >
          Rotate the key
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function RevokeKey({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const key = data.apiKeys.find((row) => row.id === context.selectedId);
  const [busy, setBusy] = useState(false);
  if (!key) return <Empty title="Select a key" />;
  if (key.status !== "active") return <Notice tone="info" title={`This key is ${key.status}`}>Nothing to revoke.</Notice>;
  return (
    <StepUp
      word="REVOKE"
      label={`Revoke ${key.title}`}
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        const saved = await context.mutate.patch(key.id, { status: "revoked", fields: { ...key.fields, revokedBy: context.actor, revokedAt: new Date().toISOString() } }, { expectRevision: key.revision, event: `API key revoked by ${context.actor}: ${key.title}` });
        if (saved) context.toast("Revoked", `${key.title} no longer works. The record stays for the audit trail.`, "blocked");
        setBusy(false);
        close();
      }}
    >
      <Properties rows={[
        { label: "Key", value: `${key.title} · ${String(key.fields.prefix ?? "")}…${String(key.fields.last4 ?? "")}` },
        { label: "Last used", value: key.fields.lastUsedAt ? context.dateTime(String(key.fields.lastUsedAt)) : "Never" },
      ]} />
    </StepUp>
  );
}
