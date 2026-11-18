import { useState } from "react";
import { Building2, KeyRound, ShieldCheck, Users } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill,
  Properties, Row, Select, Stack, Stat, StatRow, Switch, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { CAPABILITY_LABELS, CAPABILITY_TONE, PROVIDER_CAPABILITIES } from "@/platform/capability";
import { can as roleCan, ROLE_LABELS, type Capability } from "@/platform/policy";
import type { Rec, Role } from "@/domain/types";
import { AccessRequests, EffectiveAccess } from "./access";
import { AccessWorkspace } from "./AccessWorkspace";
import { AccessStudio } from "./accessStudio";
import {
  appsForRole, CAPABILITIES, capabilityLabel, csvCell, csvList, ofKind, ROLES, RoleReach, StepUp,
  useAdmin, useOrganisationRecord, useSeeded, useSeededList,
} from "./pieces";
import { LeaverHandoffs, completeHandoffs, useLeaverHandoffs } from "./leavers";
import { TeamsManager } from "./teams";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * ADMIN panels — organisation, members, roles, autonomy, budgets.
 * ====================================================================== */

/* ---------------------------- ADMIN-001 ---------------------------- */

export function OrganizationSettings({ context, tab }: { context: ScreenContext; tab: "Profile" | "Branding" | "Business hours" | "Regional" }) {
  const record = useOrganisationRecord();
  const data = useAdmin();
  const hours = ofKind(data.policies, "businessHours");

  if (tab === "Profile") {
    return (
      <Grid>
        <Card eyebrow="IDENTITY" prov="human" span={7} title="Company identity" subtitle="Held on the organisation record in this browser">
          <Properties rows={[
            { label: "Workspace name", value: context.org.name },
            { label: "Legal name", value: legalNameOf(record, context) },
            { label: "Trading name", value: tradingNameOf(record, context) },
            { label: "Registration", value: context.org.registration ?? "Not recorded" },
            { label: "Company number", value: String(record?.fields.companyNumber ?? "Not recorded") },
            { label: "Jurisdiction", value: context.org.jurisdiction },
            { label: "Record revision", value: String(record?.revision ?? 0) },
            { label: "Last changed", value: record ? `${context.relative(record.updatedAt)} by ${record.updatedBy}` : "Unknown" },
          ]} />
          <Row gap={2} wrap style={{ marginBlockStart: "var(--space-4)" }}>
            <Button variant="primary" onClick={() => context.openOverlay("Identity form")}>Edit profile</Button>
            <Button variant="secondary" onClick={() => context.openOverlay("domain verify")}>Verify a domain</Button>
          </Row>
        </Card>
        <Card eyebrow="AUTHORITY" prov="human" span={5} title="Who may change this" subtitle="Legal identity is held to a higher bar">
          <Stack gap={3}>
            <Notice tone="warning" title="Legal identity changes need a deliberate confirmation">
              The legal name and company number appear on quotes, invoices and contracts already issued. Changing them asks for a typed
              confirmation and writes an audit entry naming who did it.
            </Notice>
            <RoleReach role={context.role} />
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (tab === "Branding") {
    const brands = data.brands;
    return (
      <Grid>
        {brands.map((brand) => (
          <Card key={brand.id} eyebrow="BRAND KIT" prov={brand.fields.proposedBy ? "agent" : "human"} span={6} title={brand.title} subtitle={brand.summary}>
            <Stack gap={3}>
              <Row gap={2} wrap>
                {["ink", "cobalt", "papaya", "aqua", "paper"].map((token) => {
                  const value = String(brand.fields[token] ?? "");
                  if (!value) return null;
                  return (
                    <Row key={token} gap={1}>
                      <i className="ds-swatch" style={{ background: value, width: 16, height: 16, border: "1px solid var(--border-default)" }} aria-hidden="true" />
                      <span className="ds-subtle">{token} {value}</span>
                    </Row>
                  );
                })}
              </Row>
              <Properties rows={[
                { label: "Status", value: <Pill tone={brand.status === "active" ? "success" : "neutral"}>{brand.status}</Pill> },
                { label: "Master", value: brand.fields.master === true ? "Yes" : "No" },
                { label: "Approved by", value: String(brand.fields.approvedBy ?? "Not approved") },
              ]} />
            </Stack>
          </Card>
        ))}
        <Card eyebrow="BRANDING" prov="human" span={12} title="Where branding is edited" subtitle="One source, used by every application">
          <Notice tone="info" title="Brand kits live in Assets">
            Administration records which kit is the master and who approved it. The logos, palette, type and rules themselves are
            edited in the asset library so every application draws on the same approved set.
            <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/brands`)}>Open brand kits</Button>
            </Row>
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (tab === "Business hours") {
    return (
      <Stack gap={4}>
        {hours.length === 0 ? (
          <Empty
            title="Business hours have not been set"
            icon={<Building2 size={20} />}
            action={<Button variant="primary" onClick={() => context.openOverlay("business hours")}>Set business hours</Button>}
          >
            Bookings, service levels and quiet hours all read these hours. Until they are set, each of those uses its own default and
            says so.
          </Empty>
        ) : (
          <Grid>
            {hours.map((policy) => (
              <Card key={policy.id} eyebrow="HOURS" prov="human" span={6} title={policy.title} subtitle={policy.summary}>
                <Properties rows={[
                  { label: "Open", value: `${String(policy.fields.open)} – ${String(policy.fields.close)}` },
                  { label: "Days", value: String(policy.fields.days) },
                  { label: "Time zone", value: String(policy.fields.timezone ?? context.org.timezone) },
                ]} />
              </Card>
            ))}
          </Grid>
        )}
        <Notice tone="info" title="Hours are a statement, not a scheduler">
          Nothing runs while this browser is closed. These hours shape what surfaces offer and when they warn, not a background job.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card eyebrow="REGION" prov="posted" span={6} title="Regional settings" subtitle="Defined by the workspace, used by every calculation">
        <Properties rows={[
          { label: "Reporting currency", value: context.org.currency },
          { label: "Locale", value: context.org.locale },
          { label: "Time zone", value: context.org.timezone },
          { label: "Tax jurisdiction", value: context.org.jurisdiction },
        ]} />
        <Row gap={2} style={{ marginBlockStart: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => context.openOverlay("region change impact")}>What a change would affect</Button>
        </Row>
      </Card>
      <Card eyebrow="BOUNDARY" prov="posted" span={6} title="Separate companies, separate books" subtitle="Northline and Harbor never consolidate">
        <Notice tone="warning" title="Tax is never inferred from currency">
          The jurisdiction above drives tax codes. A company billing in pounds is not assumed to be a UK taxpayer, and figures from one
          company are never added to the other's.
        </Notice>
      </Card>
    </Grid>
  );
}

/** The legal and trading names as the profile shows them, so the edit form starts from the same values. */
function legalNameOf(record: Rec | undefined, context: ScreenContext): string {
  return String(record?.fields.legalName ?? `${context.org.name} Ltd`);
}

function tradingNameOf(record: Rec | undefined, context: ScreenContext): string {
  return String(record?.fields.tradingName ?? context.org.shortName);
}

export function IdentityForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useOrganisationRecord();
  const [legalName, setLegalName] = useSeeded(record ? legalNameOf(record, context) : "");
  const [tradingName, setTradingName] = useSeeded(record ? tradingNameOf(record, context) : "");
  const [companyNumber, setCompanyNumber] = useSeeded(String(record?.fields.companyNumber ?? ""));
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Organisation record unavailable" />;

  const legalChanged = legalName !== legalNameOf(record, context) || companyNumber !== String(record.fields.companyNumber ?? "");

  async function save() {
    setBusy(true);
    try {
      await context.mutate.patch(record!.id, {
        fields: { ...record!.fields, legalName, tradingName, companyNumber },
      }, { event: `Organisation profile updated${legalChanged ? " (legal identity changed)" : ""}`, expectRevision: record!.revision });
      context.toast("Profile saved", legalChanged ? "The legal identity change is in the audit trail." : "The organisation record is updated.");
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <Field label="Legal name" required hint="Appears on quotes, invoices and contracts.">
        <TextInput value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
      </Field>
      <Field label="Trading name">
        <TextInput value={tradingName} onChange={(event) => setTradingName(event.target.value)} />
      </Field>
      <Field label="Company number">
        <TextInput value={companyNumber} onChange={(event) => setCompanyNumber(event.target.value)} />
      </Field>
      {legalChanged ? (
        <StepUp word="CHANGE" label="Change the legal identity" busy={busy} onConfirm={save}>
          <Properties rows={[
            { label: "Legal name", value: `${legalNameOf(record, context)} → ${legalName}` },
            { label: "Company number", value: `${String(record.fields.companyNumber ?? "—")} → ${companyNumber || "—"}` },
            { label: "Documents already issued", value: "Keep the name they were issued under; nothing is rewritten." },
          ]} />
        </StepUp>
      ) : (
        <Row gap={2}>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <span className="ds-grow" />
          <Button variant="primary" busy={busy} onClick={() => void save()}>Save profile</Button>
        </Row>
      )}
    </Stack>
  );
}

export function RegionChangeImpact({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const invoices = useCollection("invoices");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A regional change is not retrospective">
        Changing currency, locale or jurisdiction would apply to new records only. Everything already posted keeps the currency and tax
        treatment it was issued under.
      </Notice>
      <Properties rows={[
        { label: "Invoices already issued", value: `${invoices.length} in ${context.org.currency}` },
        { label: "Policies that name the jurisdiction", value: String(ofKind(data.policies, "retention").length + ofKind(data.policies, "residency").length) },
        { label: "Tax codes", value: `Resolved from ${context.org.jurisdiction}, never from the currency symbol` },
        { label: "Date and number formats", value: context.org.locale },
      ]} />
      <Notice tone="info" title="Not editable in this build">
        The workspace defines its region at the platform level, so this console shows it rather than offering to change it. A real
        change would be a migration with a dated cut-over, not a dropdown.
      </Notice>
    </Stack>
  );
}

export function DomainVerify({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const existing = ofKind(data.policies, "domain");
  const [domain, setDomain] = useState("");
  const token = `arlovi-verify=${context.org.slug}-${String(Math.abs(hashString(domain || context.org.slug)) % 1_000_000).padStart(6, "0")}`;

  return (
    <Stack gap={4}>
      <Field label="Domain to verify" required hint="Used to match invited people to your company.">
        <TextInput value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="northline.example" />
      </Field>
      <Card eyebrow="DNS" prov="human" title="DNS record to add" subtitle="TXT record at the domain root">
        <Properties rows={[
          { label: "Type", value: "TXT" },
          { label: "Name", value: domain || "your domain" },
          { label: "Value", value: <span className="ds-num">{token}</span> },
        ]} />
      </Card>
      <Notice tone="warning" title="Verification cannot complete here">
        Nothing in this workspace can read DNS, so the state stays Configuration required until a service checks it. The domain and its
        token are kept as a record so the check can run later.
      </Notice>
      {existing.length > 0 && (
        <Properties rows={existing.map((record) => ({ label: record.title, value: <Pill tone="warning">{CAPABILITY_LABELS.configuration_required}</Pill> }))} />
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!domain.includes(".")}
          onClick={async () => {
            await context.mutate.create({
              collection: "policies",
              title: domain,
              status: "pending",
              summary: `Domain claimed for ${context.org.name}. Waiting for a DNS check that this browser cannot perform.`,
              fields: { kind: "domain", domain, token, state: "configuration_required", claimedBy: context.actor },
            }, `Domain claim recorded for ${domain}`);
            context.toast("Domain recorded", "The claim and its token are saved. Verification needs a service that can read DNS.", "blocked");
            close();
          }}
        >
          Save the claim
        </Button>
      </Row>
    </Stack>
  );
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return hash;
}

export function BusinessHoursForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const [open, setOpen] = useState("09:00");
  const [shut, setShut] = useState("17:30");
  const [days, setDays] = useState("Mon,Tue,Wed,Thu,Fri");
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Open" required><TextInput type="time" value={open} onChange={(event) => setOpen(event.target.value)} /></Field>
        <Field label="Close" required><TextInput type="time" value={shut} onChange={(event) => setShut(event.target.value)} /></Field>
      </Row>
      <Field label="Days"><TextInput value={days} onChange={(event) => setDays(event.target.value)} /></Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.create({
              collection: "policies",
              title: "Business hours",
              status: "published",
              summary: `Open ${open} to ${shut} on ${days}.`,
              fields: { kind: "businessHours", open, close: shut, days, timezone: context.org.timezone },
            }, "Business hours set");
            context.toast("Hours set", "Bookings and service levels now read these hours.");
            close();
          }}
        >
          Save hours
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- ADMIN-002 ---------------------------- */

export function MembersScreen({ context, tab }: { context: ScreenContext; tab: "Members" | "Invitations" | "Teams" | "External" }) {
  const data = useAdmin();
  const internal = data.members.filter((member) => member.fields.external !== true);
  const external = data.members.filter((member) => member.fields.external === true);

  if (tab === "Invitations") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Invitations cannot be delivered">
          No mail provider is connected, so each invitation is kept as a record with its role, scope and expiry. Nothing has been
          emailed to anybody.
        </Notice>
        <Card eyebrow="INVITATIONS" prov="human" title={`${data.invitations.length} invitations`} flush>
          <DataGrid
            rows={data.invitations}
            rowId={(row) => row.id}
            label="Invitations"
            selectedId={context.selectedId}
            onSelect={context.select}
            columns={[
              { key: "email", header: "Email", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{String(row.fields.note ?? "")}</p></div>, filterValue: (row) => row.title },
              { key: "role", header: "Role", cell: (row) => <Pill>{ROLE_LABELS[String(row.fields.role) as Role] ?? String(row.fields.role)}</Pill> },
              { key: "invitedBy", header: "Invited by", hideBelow: 1100, cell: (row) => String(row.fields.invitedBy ?? "") },
              { key: "expires", header: "Expires", cell: (row) => (row.fields.expiresAt ? <span className="ds-num">{context.date(String(row.fields.expiresAt))}</span> : "—"), sortValue: (row) => String(row.fields.expiresAt ?? "") },
              {
                key: "state", header: "State", align: "end",
                cell: (row) => <Pill tone={row.status === "pending" ? "info" : row.status === "expired" ? "warning" : "neutral"}>{row.status}</Pill>,
                sortValue: (row) => row.status,
              },
            ]}
            bulkActions={[
              {
                label: "Revoke",
                tone: "danger",
                onRun: (rows) => {
                  void Promise.all(rows.map((row) => context.mutate.patch(row.id, { status: "revoked", fields: { ...row.fields, revokedBy: context.actor } }, { event: `Invitation revoked: ${row.title}` })))
                    .then(() => context.toast("Revoked", `${rows.length} ${rows.length === 1 ? "invitation" : "invitations"} can no longer be accepted.`));
                },
                disabled: (rows) => rows.every((row) => row.status === "revoked"),
              },
            ]}
            empty={<Empty title="No invitations" icon={<Users size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Invite wizard")}>Invite someone</Button>}>Invitations you draft appear here with their scope and expiry.</Empty>}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Teams") {
    return <TeamsManager context={context} members={internal} departments={data.departments} />;
  }

  const rows = tab === "External" ? external : internal;

  return (
    <Stack gap={4}>
      {tab === "Members" && <LeaverHandoffs context={context} members={internal} sessions={data.sessions} />}
      {tab === "External" && (
        <Notice tone="info" title="External people see only what is shared with them">
          A client or supplier contact holds the client view: their own records in the portal and nothing else. The scope column says
          exactly what each one can reach.
        </Notice>
      )}
      <Card eyebrow="MEMBERS" prov="posted" title={`${rows.length} ${tab === "External" ? "external collaborators" : "people and agents"}`} flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={tab === "External" ? "External collaborators" : "Members"}
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("role impact", { id }); }}
          rowTone={(row) => (row.status === "suspended" ? "warning" : undefined)}
          columns={[
            {
              key: "name", header: "Name", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.title}</strong>
                  <p className="ds-subtle">{String(row.fields.title ?? row.summary)}</p>
                </div>
              ),
              filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.email ?? "")}`,
              sortValue: (row) => row.title,
            },
            { key: "role", header: "Role view", cell: (row) => <Pill tone={row.fields.kind === "ai" ? "accent" : "neutral"}>{row.fields.kind === "ai" ? "Agent" : ROLE_LABELS[String(row.fields.role) as Role] ?? String(row.fields.role ?? "member")}</Pill>, sortValue: (row) => String(row.fields.role ?? "") },
            tab === "External"
              ? { key: "scope", header: "Scope", hideBelow: 1100, cell: (row: Rec) => String(row.fields.scope ?? "Not stated") }
              : { key: "department", header: "Department", hideBelow: 1100, cell: (row: Rec) => data.departments.find((department) => department.id === row.fields.departmentId)?.title ?? "—" },
            { key: "mfa", header: "Second factor", hideBelow: 1280, cell: (row) => (row.fields.mfa === true ? <Pill tone="success">On</Pill> : <Pill tone="warning">Off</Pill>) },
            { key: "last", header: "Last seen", align: "end", cell: (row) => (row.fields.lastAccessAt ? <span className="ds-num">{context.relative(String(row.fields.lastAccessAt))}</span> : "Never"), sortValue: (row) => String(row.fields.lastAccessAt ?? "") },
            { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "active" ? "success" : "warning"}>{row.status}</Pill>, sortValue: (row) => row.status },
          ]}
          bulkActions={[
            {
              label: "Suspend",
              tone: "danger",
              onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("revoke confirmation", { ids: selected.map((row) => row.id) }); },
              disabled: (selected) => selected.every((row) => row.status === "suspended"),
            },
            {
              label: "Export CSV",
              onRun: (selected) => {
                const header = "name,role,status,department,last seen\n";
                const body = selected.map((row) => [row.title, String(row.fields.role ?? ""), row.status, String(row.fields.departmentId ?? ""), String(row.fields.lastAccessAt ?? "")].map((cell) => csvCell(cell)).join(",")).join("\n");
                const blob = new Blob([header + body], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${context.org.slug}-members.csv`;
                link.click();
                URL.revokeObjectURL(url);
                void context.mutate.log(`Exported ${selected.length} member records to CSV.`, { type: "data.export", capability: "ready_local" });
                context.toast("Exported", "The CSV downloaded from this browser and the export is in the audit trail.");
              },
            },
          ]}
          empty={<Empty title={tab === "External" ? "No external collaborators" : "No members"} icon={<Users size={20} />}>People and agents in this workspace appear here.</Empty>}
        />
      </Card>
    </Stack>
  );
}

export function InviteWizard({ context, close }: { context: ScreenContext; close: () => void }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /.+@.+\..+/.test(email);

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        {[1, 2, 3].map((index) => (
          <Pill key={index} tone={index === step ? "accent" : index < step ? "success" : "neutral"}>
            {index}. {index === 1 ? "Who" : index === 2 ? "What they get" : "Confirm"}
          </Pill>
        ))}
      </Row>

      {step === 1 && (
        <Stack gap={4}>
          <Field label="Email" required error={email && !valid ? "That does not look like an email address." : undefined}>
            <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@northline.example" required />
          </Field>
          <Field label="Role view" hint="Least privilege: choose the narrowest view that lets them do their job.">
            <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.filter((entry) => entry !== "owner").map((entry) => <option key={entry} value={entry}>{ROLE_LABELS[entry]}</option>)}
            </Select>
          </Field>
          <Field label="Why" hint="Recorded with the invitation."><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          <Row gap={2}><span className="ds-grow" /><Button variant="primary" disabled={!valid} onClick={() => setStep(2)}>Next</Button></Row>
        </Stack>
      )}

      {step === 2 && (
        <Stack gap={4}>
          <RoleReach role={role} />
          <Notice tone="info" title="A suggestion, not an answer">
            For a job like this the narrowest sensible view is usually {role === "finance" ? "Finance without payment approval" : role === "sales" ? "Sales without data export" : "Team member"}.
            This is read from what the role view offers, not from anything about the person.
          </Notice>
          <Row gap={2}><Button variant="ghost" onClick={() => setStep(1)}>Back</Button><span className="ds-grow" /><Button variant="primary" onClick={() => setStep(3)}>Next</Button></Row>
        </Stack>
      )}

      {step === 3 && (
        <Stack gap={4}>
          <Properties rows={[
            { label: "Email", value: email },
            { label: "Role view", value: ROLE_LABELS[role] },
            { label: "Reason", value: note || "Not stated" },
            { label: "Expires", value: context.date(new Date(context.now.getTime() + 7 * 86_400_000)) },
            { label: "Delivery", value: <Pill tone="warning">Not connected — kept as a draft</Pill> },
          ]} />
          <Notice tone="warning" title="Nothing will be sent">
            The invitation is saved as a record. Until a mail provider is connected you will need to pass the invitation on another
            way, then mark it accepted here.
          </Notice>
          <Row gap={2}>
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <span className="ds-grow" />
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await context.mutate.create({
                    collection: "invitations",
                    title: email,
                    status: "pending",
                    summary: "Kept as a local draft: no mail provider is connected to send it.",
                    dueAt: new Date(context.now.getTime() + 7 * 86_400_000).toISOString(),
                    fields: { role, invitedBy: context.actor, sentAt: clockIso(), expiresAt: new Date(context.now.getTime() + 7 * 86_400_000).toISOString(), seat: "full", deliveryState: "not_connected", note },
                  }, `Invitation drafted for ${email} as ${ROLE_LABELS[role]}`);
                  context.toast("Invitation saved", "It is in Invitations with its role, scope and expiry. Nothing was emailed.", "blocked");
                  close();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save invitation
            </Button>
          </Row>
        </Stack>
      )}
    </Stack>
  );
}

export function RoleImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const member = data.members.find((row) => row.id === context.selectedId);
  const [roleValue, setRole] = useSeeded(String(member?.fields.role ?? "member"));
  const role = roleValue as Role;
  const [busy, setBusy] = useState(false);
  if (!member) return <Empty title="Select a member" icon={<Users size={20} />}>Choose a person to see what a role change would do.</Empty>;

  const current = (member.fields.role as Role) ?? "member";
  const gained = CAPABILITIES.filter((capability) => roleCan(role, capability) && !roleCan(current, capability));
  const lost = CAPABILITIES.filter((capability) => roleCan(current, capability) && !roleCan(role, capability));

  return (
    <Stack gap={4}>
      <h3>{member.title}</h3>
      <Field label="Role view">
        <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((entry) => <option key={entry} value={entry}>{ROLE_LABELS[entry]}</option>)}
        </Select>
      </Field>
      <Grid>
        <Card eyebrow="GAINS" prov="human" span={6} title="Gains" subtitle={`${gained.length} capabilities`}>
          {gained.length === 0 ? <span className="ds-subtle">Nothing new.</span> : <Row gap={1} wrap>{gained.map((capability) => <Pill key={capability} tone="success">{capabilityLabel(capability)}</Pill>)}</Row>}
        </Card>
        <Card eyebrow="LOSES" prov="human" span={6} title="Loses" subtitle={`${lost.length} capabilities`}>
          {lost.length === 0 ? <span className="ds-subtle">Nothing is removed.</span> : <Row gap={1} wrap>{lost.map((capability) => <Pill key={capability} tone="warning">{capabilityLabel(capability)}</Pill>)}</Row>}
        </Card>
      </Grid>
      <RoleReach role={role} />
      <Notice tone="warning" title="Role views are not an account boundary">
        Changing a view changes what this interface offers. It does not enforce anything on a server, and nobody should treat it as a
        security control.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={role === current}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(member.id, { fields: { ...member.fields, role } }, { event: `Role view changed from ${current} to ${role} for ${member.title}`, expectRevision: member.revision });
              if (!saved) return;
              context.toast("Role changed", `${member.title} now holds the ${ROLE_LABELS[role]} view, and the change is in the audit trail.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Change role view
        </Button>
      </Row>
    </Stack>
  );
}

export function RevokeConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const ids = payload?.ids ?? (context.selectedId ? [context.selectedId] : []);
  const members = data.members.filter((row) => ids.includes(row.id));
  const sessions = data.sessions.filter((session) => members.some((member) => member.title === String(session.fields.member)) && session.status === "active");
  const keys = data.apiKeys.filter((key) => members.some((member) => member.title === String(key.fields.createdBy)) && key.status === "active");
  const handoffs = useLeaverHandoffs().filter((task) => members.some((member) => member.title === String(task.fields.employeeName ?? "")));
  const [busy, setBusy] = useState(false);

  if (members.length === 0) return <Empty title="Select a member" icon={<Users size={20} />}>Choose who is leaving.</Empty>;

  return (
    <StepUp
      word="OFFBOARD"
      label={`Suspend ${members.length === 1 ? members[0].title : `${members.length} people`}`}
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          // A patch returns null when the record changed elsewhere (the helper
          // has already said so). Only a member whose suspension saved has
          // their sessions and keys revoked and their leaver step closed.
          const suspended: Rec[] = [];
          for (const member of members) {
            const saved = await context.mutate.patch(member.id, {
              status: "suspended",
              fields: { ...member.fields, suspendedBy: context.actor, suspendedAt: clockIso() },
            }, { event: `Access suspended for ${member.title}`, expectRevision: member.revision });
            if (saved) suspended.push(member);
          }
          if (suspended.length === 0) return;
          const names = suspended.map((member) => member.title);
          let revokedSessions = 0;
          for (const session of sessions.filter((row) => names.includes(String(row.fields.member)))) {
            const saved = await context.mutate.patch(session.id, {
              status: "revoked",
              fields: { ...session.fields, revokedBy: context.actor, revokedAt: clockIso() },
            }, { event: `Session revoked during offboarding: ${session.title}`, expectRevision: session.revision });
            if (saved) revokedSessions += 1;
          }
          let revokedKeys = 0;
          for (const key of keys.filter((row) => names.includes(String(row.fields.createdBy)))) {
            const saved = await context.mutate.patch(key.id, {
              status: "revoked",
              fields: { ...key.fields, revokedBy: context.actor, revokedAt: clockIso() },
            }, { event: `API key revoked during offboarding: ${key.title}`, expectRevision: key.revision });
            if (saved) revokedKeys += 1;
          }
          const failed = members.length - suspended.length;
          const closed = await completeHandoffs(context, handoffs, names, `member suspended, ${revokedSessions} sessions and ${revokedKeys} keys revoked`);
          context.toast(
            failed ? "Partly offboarded" : "Offboarded",
            `${suspended.length} suspended, ${revokedSessions} ${revokedSessions === 1 ? "session" : "sessions"} revoked, ${revokedKeys} ${revokedKeys === 1 ? "key" : "keys"} revoked.${closed ? ` ${closed} leaver ${closed === 1 ? "step" : "steps"} closed in People.` : ""}${failed ? ` ${failed} ${failed === 1 ? "member was" : "members were"} not suspended because the record changed elsewhere; reload and try again.` : ""}`,
            failed ? "blocked" : "ok",
          );
          if (failed) return;
          close();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Properties rows={[
        { label: "People", value: members.map((member) => member.title).join(", ") },
        { label: "Sessions revoked", value: `${sessions.length}${sessions.length ? `: ${sessions.map((session) => session.title).join("; ")}` : ""}` },
        { label: "API keys revoked", value: `${keys.length}${keys.length ? `: ${keys.map((key) => key.title).join("; ")}` : ""}` },
        { label: "Records kept", value: "Everything they created stays, with their name on it, for the audit trail." },
        ...(handoffs.length ? [{ label: "People leaver step", value: `Closed on ${handoffs.map((task) => String(task.fields.employeeName)).join(", ")}'s record when this is confirmed` }] : []),
      ]} />
      <Notice tone="warning" title="Suspending is not deleting">
        Their work, approvals and messages remain. A request to erase personal data is handled in Privacy, where a legal hold can
        lawfully prevent it.
      </Notice>
    </StepUp>
  );
}

/* ---------------------------- ADMIN-003 ---------------------------- */

export function RolesScreen({ context, tab }: { context: ScreenContext; tab: "Roles" | "Policies" | "Effective access" | "Exceptions" }) {
  const data = useAdmin();
  const [accessView, setAccessView] = useState<"templates" | "effective">("templates");
  const custom = ofKind(data.policies, "role");

  if (tab === "Roles") {
    return (
      <Stack gap={4}>
        <AccessWorkspace context={context} />
        <Card eyebrow="CUSTOM ROLES" prov="human" title={`Custom roles · ${custom.length}`} subtitle="Narrower views defined in this workspace" flush>
          <DataGrid
            rows={custom}
            rowId={(row) => row.id}
            label="Custom roles"
            selectedId={context.selectedId}
            onSelect={context.select}
            onOpen={(id) => { context.select(id); context.openOverlay("Policy editor", { id }); }}
            columns={[
              { key: "title", header: "Role", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "basedOn", header: "Based on", cell: (row) => ROLE_LABELS[String(row.fields.basedOn) as Role] ?? String(row.fields.basedOn) },
              { key: "caps", header: "Capabilities", cell: (row) => (csvList(row.fields.capabilities).length ? csvList(row.fields.capabilities).map(capabilityLabel).join(", ") : "None") },
              { key: "deny", header: "Explicit deny", hideBelow: 1200, cell: (row) => (csvList(row.fields.deny).length ? csvList(row.fields.deny).map(capabilityLabel).join(", ") : "—") },
              { key: "holders", header: "Holders", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.holders ?? 0)}</span> },
              { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "published" ? "success" : "info"}>{row.status}</Pill>, sortValue: (row) => row.status },
            ]}
            empty={<Empty title="No custom roles" icon={<ShieldCheck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Policy editor")}>Create a role</Button>}>A custom role narrows a built-in view; it can never widen one.</Empty>}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Policies") {
    const kinds = ["role", "autonomyGrant", "retention", "residency", "consent", "authPolicy", "subscription", "domain", "businessHours"];
    return (
      <Card eyebrow="POLICIES" prov="human" title={`${data.policies.length} policy records`} subtitle="Every policy in this workspace, whatever it governs" flush>
        <DataGrid
          rows={data.policies}
          rowId={(row) => row.id}
          label="Policies"
          selectedId={context.selectedId}
          onSelect={context.select}
          columns={[
            { key: "title", header: "Policy", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle ds-truncate" style={{ maxWidth: "58ch" }}>{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.kind ?? "")}` },
            { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "other")}</Pill>, sortValue: (row) => String(row.fields.kind ?? "") },
            { key: "author", header: "Author", hideBelow: 1100, cell: (row) => String(row.fields.author ?? row.ownerName) },
            { key: "updated", header: "Changed", align: "end", cell: (row) => <span className="ds-num">{context.relative(row.updatedAt)}</span>, sortValue: (row) => row.updatedAt },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "published" ? "success" : "info"}>{row.status}</Pill> },
          ]}
          toolbar={<span className="ds-subtle">{kinds.filter((kind) => ofKind(data.policies, kind).length > 0).length} kinds in use</span>}
          empty={<Empty title="No policies" icon={<ShieldCheck size={20} />}>Policies are created by the screens that govern them.</Empty>}
        />
      </Card>
    );
  }

  if (tab === "Effective access") return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant={accessView === "templates" ? "primary" : "secondary"} size="sm"
          aria-pressed={accessView === "templates"} onClick={() => setAccessView("templates")}>Role templates & apps</Button>
        <Button variant={accessView === "effective" ? "primary" : "secondary"} size="sm"
          aria-pressed={accessView === "effective"} onClick={() => setAccessView("effective")}>Current access preview</Button>
      </Row>
      {accessView === "templates"
        ? <AccessStudio context={context} />
        : <><AccessWorkspace detailed context={context} /><EffectiveAccess context={context} /></>}
    </Stack>
  );

  const exceptions = custom.filter((role) => csvList(role.fields.deny).length > 0 || role.status === "draft");
  return (
    <Stack gap={4}>
      <AccessRequests context={context} />
      <h3 style={{ fontSize: "var(--text-md)" }}>Custom roles that differ from their base view</h3>
      {exceptions.length === 0 ? (
        <Empty title="No exceptions" icon={<ShieldCheck size={20} />}>Every role in use matches its built-in view with nothing added.</Empty>
      ) : (
        exceptions.map((role) => {
          const base = String(role.fields.basedOn) as Role;
          const widened = csvList(role.fields.capabilities).filter((capability) => !roleCan(base, capability as Capability));
          return (
            <Notice
              key={role.id}
              tone={widened.length ? "danger" : "info"}
              title={widened.length ? `${role.title} would widen the ${ROLE_LABELS[base]} view` : `${role.title} narrows the ${ROLE_LABELS[base]} view`}
              actions={<Button size="sm" variant="secondary" onClick={() => { context.select(role.id); context.openOverlay("impact review", { id: role.id }); }}>Review</Button>}
            >
              {widened.length
                ? `It asks for ${widened.map(capabilityLabel).join(", ")}, which the base view does not hold. A role may only remove, so this cannot be published as written.`
                : `Denies ${csvList(role.fields.deny).map(capabilityLabel).join(", ") || "nothing"}. Status: ${role.status}.`}
            </Notice>
          );
        })
      )}
    </Stack>
  );
}

export function PolicyEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = ofKind(data.policies, "role").find((row) => row.id === (payload?.id ?? context.selectedId));
  const [title, setTitle] = useSeeded(existing?.title ?? "");
  const [basedOnValue, setBasedOn] = useSeeded(String(existing?.fields.basedOn ?? "member"));
  const basedOn = basedOnValue as Role;
  const [caps, setCaps] = useSeededList(typeof existing?.fields.capabilities === "string" ? existing.fields.capabilities : "");
  const [deny, setDeny] = useSeededList(typeof existing?.fields.deny === "string" ? existing.fields.deny : "");
  const [error, setError] = useState("");

  const widened = caps.filter((capability) => !roleCan(basedOn, capability as Capability));

  return (
    <form
      id="policy-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) { setError("Give the role a name."); return; }
        if (widened.length) { setError(`A role may only narrow its base. Remove ${widened.map(capabilityLabel).join(", ")}.`); return; }
        setError("");
        const fields = { kind: "role", basedOn, capabilities: caps.join(","), deny: deny.join(","), apps: "", holders: Number(existing?.fields.holders ?? 0), author: context.actor };
        if (existing) {
          await context.mutate.patch(existing.id, { title, summary: `Based on ${ROLE_LABELS[basedOn]}, ${caps.length} capabilities.`, fields: { ...existing.fields, ...fields } }, { event: `Role draft updated: ${title}`, expectRevision: existing.revision });
          context.toast("Role saved", `${title} is a ${existing.status} role.`);
        } else {
          await context.mutate.create({
            collection: "policies",
            title,
            status: "draft",
            summary: `Based on ${ROLE_LABELS[basedOn]}, ${caps.length} capabilities.`,
            fields,
          }, `Role drafted: ${title}`);
          context.toast("Role drafted", "It stays a draft until you publish it, and publishing changes what the interface offers.");
        }
        close();
      }}
    >
      <Field label="Role name" required error={error && !title.trim() ? error : undefined}>
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Showroom host" required />
      </Field>
      <Field label="Based on" hint="A custom role can only take capabilities away from its base.">
        <Select value={basedOn} onChange={(event) => setBasedOn(event.target.value as Role)}>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </Select>
      </Field>
      <Field label="Capabilities" error={widened.length ? error || `Not held by ${ROLE_LABELS[basedOn]}: ${widened.map(capabilityLabel).join(", ")}` : undefined}>
        <Stack gap={2}>
          {CAPABILITIES.map((capability) => (
            <Checkbox
              key={capability}
              label={`${capabilityLabel(capability)}${roleCan(basedOn, capability) ? "" : " — not in the base view"}`}
              checked={caps.includes(capability)}
              onChange={(event) => setCaps((current) => (event.target.checked ? [...current, capability] : current.filter((entry) => entry !== capability)))}
            />
          ))}
        </Stack>
      </Field>
      <Field label="Explicit deny" hint="Written down so a later change to the base view cannot quietly grant it.">
        <Stack gap={2}>
          {CAPABILITIES.filter((capability) => roleCan(basedOn, capability)).map((capability) => (
            <Checkbox
              key={capability}
              label={capabilityLabel(capability)}
              checked={deny.includes(capability)}
              onChange={(event) => setDeny((current) => (event.target.checked ? [...current, capability] : current.filter((entry) => entry !== capability)))}
            />
          ))}
        </Stack>
      </Field>
      <Notice tone="info">Saved as a draft. Publishing is a separate, logged action.</Notice>
    </form>
  );
}

export function EffectiveRights({ context }: { context: ScreenContext }) {
  const [left, setLeft] = useState<Role>("finance");
  const [right, setRight] = useState<Role>("member");
  const only = (a: Role, b: Role) => CAPABILITIES.filter((capability) => roleCan(a, capability) && !roleCan(b, capability));
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Compare"><Select value={left} onChange={(event) => setLeft(event.target.value as Role)}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Select></Field>
        <Field label="With"><Select value={right} onChange={(event) => setRight(event.target.value as Role)}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Select></Field>
      </Row>
      <Grid>
        <Card eyebrow="EXCLUSIVE" prov="posted" span={6} title={`Only ${ROLE_LABELS[left]}`}>
          <Row gap={1} wrap>{only(left, right).map((capability) => <Pill key={capability} tone="info">{capabilityLabel(capability)}</Pill>)}</Row>
          {only(left, right).length === 0 && <span className="ds-subtle">Nothing exclusive.</span>}
        </Card>
        <Card eyebrow="EXCLUSIVE" prov="posted" span={6} title={`Only ${ROLE_LABELS[right]}`}>
          <Row gap={1} wrap>{only(right, left).map((capability) => <Pill key={capability} tone="info">{capabilityLabel(capability)}</Pill>)}</Row>
          {only(right, left).length === 0 && <span className="ds-subtle">Nothing exclusive.</span>}
        </Card>
      </Grid>
      <Properties rows={[
        { label: "Applications only in the first", value: appsOnly(left, right).join(", ") || "None" },
        { label: "Applications only in the second", value: appsOnly(right, left).join(", ") || "None" },
        { label: "Your view", value: ROLE_LABELS[context.role] },
      ]} />
    </Stack>
  );
}

function appsOnly(a: Role, b: Role): string[] {
  const other = new Set(appsForRole(b));
  return appsForRole(a).filter((code) => !other.has(code));
}

export function ImpactReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const role = ofKind(data.policies, "role").find((row) => row.id === (payload?.id ?? context.selectedId));
  const [capability, setCapability] = useState<Capability>("post_journal");
  const [simulatedRole, setSimulatedRole] = useState<Role>("finance");
  const [busy, setBusy] = useState(false);

  const allowed = roleCan(simulatedRole, capability);
  const base = role ? (String(role.fields.basedOn) as Role) : undefined;
  const widened = role ? csvList(role.fields.capabilities).filter((entry) => base && !roleCan(base, entry as Capability)) : [];

  return (
    <Stack gap={4}>
      <Card eyebrow="SIMULATION" prov="human" title="Try a decision" subtitle="Reads the policy as it is; changes nothing">
        <Stack gap={3}>
          <Row gap={3} wrap>
            <Field label="Role view"><Select value={simulatedRole} onChange={(event) => setSimulatedRole(event.target.value as Role)}>{ROLES.map((entry) => <option key={entry} value={entry}>{ROLE_LABELS[entry]}</option>)}</Select></Field>
            <Field label="Capability"><Select value={capability} onChange={(event) => setCapability(event.target.value as Capability)}>{CAPABILITIES.map((entry) => <option key={entry} value={entry}>{capabilityLabel(entry)}</option>)}</Select></Field>
          </Row>
          <Notice tone={allowed ? "success" : "warning"} title={allowed ? "Allowed by the role view" : "Denied by the role view"}>
            {allowed
              ? `${ROLE_LABELS[simulatedRole]} holds ${capabilityLabel(capability).toLowerCase()}, so the interface offers it.`
              : `${ROLE_LABELS[simulatedRole]} does not hold ${capabilityLabel(capability).toLowerCase()}, so the control is not offered and the action would not run.`}
          </Notice>
        </Stack>
      </Card>
      {role && (
        <Card eyebrow="PUBLISH" prov="human" title={`Publishing ${role.title}`} subtitle={role.status === "published" ? "Already published" : "Draft"}>
          <Stack gap={3}>
            <Properties rows={[
              { label: "Based on", value: base ? ROLE_LABELS[base] : "—" },
              { label: "Holders today", value: String(role.fields.holders ?? 0) },
              { label: "Would widen", value: widened.length ? widened.map(capabilityLabel).join(", ") : "Nothing" },
            ]} />
            {widened.length > 0 ? (
              <Notice tone="danger" title="Cannot be published">A custom role may only narrow its base view. Remove the widened capabilities first.</Notice>
            ) : (
              <Button
                variant="primary"
                busy={busy}
                disabled={role.status === "published"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await context.mutate.patch(role.id, { status: "published", fields: { ...role.fields, publishedBy: context.actor, publishedAt: clockIso() } }, { event: `Role published: ${role.title}`, expectRevision: role.revision });
                    context.toast("Published", `${role.title} is live in the interface and the change is in the audit trail.`);
                    close();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Publish this role
              </Button>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

/* ---------------------------- ADMIN-004 ---------------------------- */

export function AutonomyScreen({ context, tab }: { context: ScreenContext; tab: "Company" | "Departments" | "Agents" | "Missions" | "History" }) {
  const data = useAdmin();
  const grants = ofKind(data.policies, "autonomyGrant");
  const organisation = useOrganisationRecord();
  const events = useCollection("timelineEvents");
  const auditEvents = useEvents(undefined, 200);

  if (tab === "Company") {
    const company = grants.find((grant) => grant.fields.scope === "company");
    const agentWork = auditEvents.filter((event) => event.type.startsWith("ai."));
    const paused = organisation?.fields.executionPaused === true;
    return (
      <Grid>
        <Card eyebrow="COMPANY GRANT" prov="human" span={7} title={company?.title ?? "Company autonomy"} subtitle={company?.summary ?? "No company grant is recorded"}>
          {company ? (
            <Stack gap={3}>
              <Properties rows={[
                { label: "Mode", value: <Pill tone={company.fields.mode === "draft" ? "info" : "warning"}>{String(company.fields.mode)}</Pill> },
                { label: "Spend cap", value: context.money(Number(company.fields.maxSpendMinor ?? 0)) },
                { label: "Always needs a person", value: csvList(company.fields.requiresApproval).map(capabilityLabel).join(", ") || "Nothing" },
                { label: "Set by", value: String(company.fields.author ?? company.ownerName) },
                { label: "Last changed", value: context.relative(company.updatedAt) },
              ]} />
              <Row gap={3}>
                <span className="ds-grow">Unrestricted autonomy</span>
                <Switch label="Unrestricted autonomy" checked={false} onChange={() => context.toast("Not available", "There is no switch that bypasses the guardrails. Raise a specific grant with a cap and an expiry instead.", "blocked")} />
              </Row>
              <Notice tone="warning" title="There is no global override">
                Every grant names a scope, a cap and what still needs a person. A single switch that turned all of that off would be the
                one control nobody could reason about, so it does not exist.
              </Notice>
            </Stack>
          ) : (
            <Empty title="No company grant" icon={<ShieldCheck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Grant editor")}>Set the company grant</Button>}>
              Without a grant, agents may only read and draft.
            </Empty>
          )}
        </Card>
        <Card eyebrow="EMERGENCY" prov="human" span={5} title="Emergency pause" subtitle={paused ? "Automation is paused" : "Automation is running"}>
          <Stack gap={3}>
            <Notice tone={paused ? "danger" : "info"} title={paused ? "Every agent and mission step is held" : "Agents may take the steps their grant allows"}>
              {paused
                ? `Paused by ${String(organisation?.fields.pausedBy ?? "someone")}. Nothing is discarded; steps resume where they stopped.`
                : "Pausing stops agents and missions immediately and writes to the organisation record."}
            </Notice>
            <Button variant={paused ? "primary" : "outline-danger"} onClick={() => context.openOverlay("revoke confirmation", { intent: "pause" })}>
              {paused ? "Resume automation" : "Pause all automation"}
            </Button>
          </Stack>
        </Card>
        <Card machine eyebrow="AI WORKFORCE" prov="agent" span={12} title="What the agents have done under this grant" subtitle={`${agentWork.length} recorded steps`}>
          {agentWork.length === 0 ? (
            <p className="ds-subtle">No agent has taken a step that was worth recording yet.</p>
          ) : (
            <Stack gap={3}>
              {agentWork.slice(0, 5).map((event) => (
                <Row key={event.id} gap={3} style={{ alignItems: "flex-start" }}>
                  <span className="ds-num" style={{ width: 120 }}>{context.relative(event.at)}</span>
                  <div className="ds-grow">
                    <strong>{event.actor}</strong>
                    <p className="ds-subtle">{event.message}</p>
                  </div>
                  <span className="ds-num">{event.capability === "blocked" ? "stopped and asked" : "completed"}</span>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  if (tab === "Departments") {
    const departmentGrants = grants.filter((grant) => grant.fields.scope === "department");
    return (
      <Grid>
        {departmentGrants.map((grant) => {
          const department = data.departments.find((row) => row.id === grant.fields.departmentId);
          return (
            <Card key={grant.id} eyebrow="DEPARTMENT GRANT" prov="human" span={6} title={department?.title ?? grant.title} subtitle={grant.summary}>
              <Properties rows={[
                { label: "Mode", value: <Pill tone="info">{String(grant.fields.mode)}</Pill> },
                { label: "Spend cap", value: context.money(Number(grant.fields.maxSpendMinor ?? 0)) },
                { label: "Needs a person", value: csvList(grant.fields.requiresApproval).map(capabilityLabel).join(", ") || "Nothing" },
              ]} />
              <Row gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
                <Button size="sm" variant="secondary" onClick={() => { context.select(grant.id); context.openOverlay("Grant editor", { id: grant.id }); }}>Edit grant</Button>
              </Row>
            </Card>
          );
        })}
        {departmentGrants.length === 0 && <Empty title="No department grants" icon={<ShieldCheck size={20} />}>Departments inherit the company grant until one is set.</Empty>}
      </Grid>
    );
  }

  if (tab === "Agents") {
    return (
      <Card machine eyebrow="AI WORKFORCE" prov="agent" title={`${data.agents.length} agents`} subtitle="What each one may do, and what it must ask for" flush>
        <DataGrid
          rows={data.agents}
          rowId={(row) => row.id}
          label="Agents"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Grant editor", { agentId: id }); }}
          columns={[
            { key: "title", header: "Agent", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "role", header: "Role", cell: (row) => String(row.fields.role ?? "") },
            { key: "autonomy", header: "Mode", cell: (row) => <Pill tone={row.fields.autonomy === "draft" ? "info" : "warning"}>{String(row.fields.autonomy ?? "suggest")}</Pill> },
            {
              key: "model", header: "Model", cell: (row) => <Pill tone={CAPABILITY_TONE.not_connected}>{CAPABILITY_LABELS[(String(row.fields.model ?? "not_connected")) as keyof typeof CAPABILITY_LABELS] ?? "Not connected"}</Pill>,
            },
            {
              key: "grant", header: "Grant", hideBelow: 1200,
              cell: (row) => {
                const grant = grants.find((entry) => entry.fields.agentId === row.id);
                return grant ? grant.title : <span className="ds-subtle">Inherits the company grant</span>;
              },
            },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "active" ? "success" : "warning"}>{row.status}</Pill> },
          ]}
          bulkActions={[
            {
              label: "Suspend agent",
              tone: "danger",
              onRun: (selected) => {
                void Promise.all(selected.map((row) => context.mutate.patch(row.id, { status: "suspended", fields: { ...row.fields, suspendedBy: context.actor } }, { event: `Agent suspended: ${row.title}` })))
                  .then(() => context.toast("Suspended", `${selected.length} ${selected.length === 1 ? "agent" : "agents"} will take no further step.`));
              },
              disabled: (selected) => selected.every((row) => row.status === "suspended"),
            },
          ]}
          empty={<Empty title="No agents" icon={<ShieldCheck size={20} />}>Agents are created in the Team application.</Empty>}
        />
      </Card>
    );
  }

  if (tab === "Missions") {
    const missionGrants = grants.filter((grant) => grant.fields.scope === "mission");
    return (
      <Stack gap={4}>
        {missionGrants.map((grant) => {
          const mission = data.missions.find((row) => row.id === grant.fields.missionId);
          const cap = Number(grant.fields.maxSpendMinor ?? 0);
          const committed = Number(mission?.fields.spentMinor ?? 0);
          return (
            <Card key={grant.id} machine eyebrow="MISSION GRANT" prov="agent" span={12} title={mission?.title ?? grant.title} subtitle={grant.summary}>
              <Stack gap={3}>
                <Meter value={committed} max={Math.max(1, cap)} label={`${mission?.title ?? grant.title} spend against cap`} tone={committed > cap * 0.9 ? "warning" : "success"} />
                <Properties rows={[
                  { label: "Committed locally", value: `${context.money(committed)} of ${context.money(cap)}` },
                  { label: "Mode", value: String(grant.fields.mode) },
                  { label: "Expires", value: grant.fields.expiresAt ? context.date(String(grant.fields.expiresAt)) : "No expiry" },
                  { label: "Still needs a person", value: csvList(grant.fields.requiresApproval).map(capabilityLabel).join(", ") || "Nothing" },
                ]} />
              </Stack>
            </Card>
          );
        })}
        {missionGrants.length === 0 && <Empty title="No mission grants" icon={<ShieldCheck size={20} />}>A mission inherits the company grant unless one is set for it.</Empty>}
      </Stack>
    );
  }

  const policyEvents = events.filter((event) => ["decision", "technology"].includes(String(event.fields.kind ?? "")));
  return (
    <Card eyebrow="HISTORY" prov="posted" title="Grant history" subtitle="Changes to authority, from the company timeline" flush>
      <DataGrid
        rows={policyEvents}
        rowId={(row) => row.id}
        label="Autonomy history"
        columns={[
          { key: "at", header: "When", width: "160px", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "title", header: "Entry", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "kind", header: "Kind", align: "end", cell: (row) => <Pill>{String(row.fields.kind ?? "")}</Pill> },
        ]}
        empty={<Empty title="No recorded changes" icon={<ShieldCheck size={20} />}>Grant changes appear here and in the audit trail.</Empty>}
      />
    </Card>
  );
}

export function GrantEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string; agentId?: string } | undefined;
  const grants = ofKind(data.policies, "autonomyGrant");
  const existing = grants.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? (payload?.agentId ? grants.find((row) => row.fields.agentId === payload.agentId) : undefined);
  const agent = payload?.agentId ? data.agents.find((row) => row.id === payload.agentId) : undefined;
  const [mode, setMode] = useSeeded(String(existing?.fields.mode ?? "draft"));
  const [cap, setCap] = useSeeded(Number(existing?.fields.maxSpendMinor ?? 0));
  const [requires, setRequires] = useSeededList(typeof existing?.fields.requiresApproval === "string" ? existing.fields.requiresApproval : "post_journal,approve_payment");
  const [busy, setBusy] = useState(false);

  const scope = existing ? String(existing.fields.scope) : agent ? "agent" : "company";

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Scope", value: scope },
        { label: "Applies to", value: existing?.title ?? agent?.title ?? context.org.name },
      ]} />
      <Field label="Mode" hint="Draft means an agent prepares and a person decides.">
        <Select value={mode} onChange={(event) => setMode(event.target.value)}>
          {["suggest", "draft", "execute_with_approval"].map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <Field label="Spend cap (minor units)" hint="0 means nothing involving money may be committed under this grant.">
        <TextInput type="number" min={0} step={1000} value={String(cap)} onChange={(event) => setCap(Number(event.target.value))} />
      </Field>
      <Field label="Always needs a person">
        <Stack gap={2}>
          {(["post_journal", "approve_payment", "approve_mission", "publish_campaign", "delete_records", "export_data"] as Capability[]).map((capability) => (
            <Checkbox
              key={capability}
              label={capabilityLabel(capability)}
              checked={requires.includes(capability)}
              onChange={(event) => setRequires((current) => (event.target.checked ? [...current, capability] : current.filter((entry) => entry !== capability)))}
            />
          ))}
        </Stack>
      </Field>
      {mode === "execute_with_approval" && cap > 0 && (
        <Notice tone="warning" title="This grant lets an agent commit money">
          Up to {context.money(cap)} within the scope above, and only for actions not listed as needing a person. Each commitment is
          still recorded against the mission budget.
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (existing) {
                await context.mutate.patch(existing.id, {
                  summary: `${mode.replace(/_/g, " ")} up to ${context.money(cap)}.`,
                  amountMinor: cap,
                  fields: { ...existing.fields, mode, maxSpendMinor: cap, requiresApproval: requires.join(","), author: context.actor },
                }, { event: `Autonomy grant updated: ${existing.title}`, expectRevision: existing.revision });
                context.toast("Grant saved", `${existing.title} is now ${mode.replace(/_/g, " ")} with a cap of ${context.money(cap)}.`);
              } else {
                await context.mutate.create({
                  collection: "policies",
                  title: agent ? `${agent.title} grant` : `${context.org.shortName} autonomy`,
                  status: "published",
                  summary: `${mode.replace(/_/g, " ")} up to ${context.money(cap)}.`,
                  amountMinor: cap,
                  fields: { kind: "autonomyGrant", scope, agentId: agent?.id ?? "", mode, maxSpendMinor: cap, requiresApproval: requires.join(","), globalUnrestricted: false, author: context.actor },
                }, `Autonomy grant created for ${agent?.title ?? context.org.name}`);
                context.toast("Grant created", "It is published and the change is in the audit trail.");
              }
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Save grant
        </Button>
      </Row>
    </Stack>
  );
}

export function ActionSimulator({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const grants = ofKind(data.policies, "autonomyGrant");
  const [agentId, setAgentId] = useSeeded(data.agents[0]?.id ?? "");
  const [action, setAction] = useState<Capability>("post_journal");
  const [amount, setAmount] = useState(50_000);

  const agent = data.agents.find((row) => row.id === agentId);
  const grant = grants.find((row) => row.fields.agentId === agentId) ?? grants.find((row) => row.fields.scope === "company");
  const requires = csvList(grant?.fields.requiresApproval);
  const cap = Number(grant?.fields.maxSpendMinor ?? 0);
  const needsPerson = requires.includes(action) || requires.includes("all");
  const overCap = amount > cap;

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Agent">
          <Select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {data.agents.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </Select>
        </Field>
        <Field label="Action">
          <Select value={action} onChange={(event) => setAction(event.target.value as Capability)}>
            {CAPABILITIES.map((capability) => <option key={capability} value={capability}>{capabilityLabel(capability)}</option>)}
          </Select>
        </Field>
        <Field label="Amount (minor units)">
          <TextInput type="number" min={0} step={1000} value={String(amount)} onChange={(event) => setAmount(Number(event.target.value))} />
        </Field>
      </Row>
      <Notice tone={needsPerson || overCap ? "warning" : "success"} title={needsPerson ? "Would stop and ask" : overCap ? "Would stop at the cap" : "Would proceed under the grant"}>
        {agent?.title ?? "The agent"} is in {String(agent?.fields.autonomy ?? "draft")} mode under {grant?.title ?? "the company grant"}.
        {needsPerson
          ? ` ${capabilityLabel(action)} is listed as always needing a person, so the agent would prepare the work and raise an approval.`
          : overCap
            ? ` ${context.money(amount)} is above the ${context.money(cap)} cap, so the agent would stop and raise an approval for the difference.`
            : ` ${capabilityLabel(action)} at ${context.money(amount)} is inside the cap and not reserved to a person.`}
      </Notice>
      <Properties rows={[
        { label: "Grant", value: grant?.title ?? "None" },
        { label: "Cap", value: context.money(cap) },
        { label: "Reserved to a person", value: requires.map(capabilityLabel).join(", ") || "Nothing" },
        { label: "Model provider", value: <Pill tone="warning">{CAPABILITY_LABELS.not_connected}</Pill> },
      ]} />
      <Notice tone="info" title="A simulation never acts">
        This reads the grant and says what would happen. No step is taken and no record changes.
      </Notice>
    </Stack>
  );
}

export function AutonomyRevoke({ context, close }: { context: ScreenContext; close: () => void }) {
  const organisation = useOrganisationRecord();
  const data = useAdmin();
  const payload = context.overlayPayload as { intent?: string; id?: string } | undefined;
  const grant = ofKind(data.policies, "autonomyGrant").find((row) => row.id === (payload?.id ?? context.selectedId));
  const paused = organisation?.fields.executionPaused === true;
  const [busy, setBusy] = useState(false);

  if (payload?.intent === "pause" || !grant) {
    return paused ? (
      <Stack gap={4}>
        <Notice tone="danger" title="Automation is paused">
          Paused by {String(organisation?.fields.pausedBy ?? "someone")}. Missions are holding at their current step.
        </Notice>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.patch(context.org.id, { fields: { ...(organisation?.fields ?? {}), executionPaused: false, pausedBy: context.actor } }, { event: "Automation resumed from the autonomy centre" });
              context.toast("Resumed", "Agents and missions may take steps again.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Resume automation
        </Button>
      </Stack>
    ) : (
      <StepUp
        word="PAUSE"
        label="Pause all automation"
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await context.mutate.patch(context.org.id, { fields: { ...(organisation?.fields ?? {}), executionPaused: true, pausedBy: context.actor } }, { event: "Automation paused from the autonomy centre" });
            context.toast("Paused", "Every agent and mission step is held, and the organisation record carries the pause.", "blocked");
            close();
          } finally { setBusy(false); }
        }}
      >
        <Properties rows={[
          { label: "Agents affected", value: String(data.agents.filter((row) => row.status === "active").length) },
          { label: "Missions holding", value: String(data.missions.filter((row) => ["running", "executing", "dispatched"].includes(row.status)).length) },
          { label: "People", value: "Unaffected: everyone keeps working as normal." },
        ]} />
      </StepUp>
    );
  }

  return (
    <StepUp
      word="REVOKE"
      label={`Revoke ${grant.title}`}
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          await context.mutate.patch(grant.id, { status: "revoked", fields: { ...grant.fields, revokedBy: context.actor, revokedAt: clockIso() } }, { event: `Autonomy grant revoked: ${grant.title}`, expectRevision: grant.revision });
          context.toast("Revoked", `${grant.title} no longer applies. Anything it allowed now needs a person.`);
          close();
        } finally { setBusy(false); }
      }}
    >
      <Properties rows={[
        { label: "Grant", value: grant.title },
        { label: "Scope", value: String(grant.fields.scope) },
        { label: "After revoking", value: "The scope falls back to draft: prepare and ask." },
      ]} />
    </StepUp>
  );
}

/* ---------------------------- ADMIN-005 ---------------------------- */

export function BudgetScreen({ context, tab }: { context: ScreenContext; tab: "AI" | "Missions" | "Providers" | "Limits" | "Invoices" }) {
  const data = useAdmin();
  const { now } = useWorkspace();

  if (tab === "AI") {
    const quota = data.budgets.find((row) => row.fields.kind === "aiQuota");
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Model spend this period" value="Unavailable" unavailable meta="No model provider is connected" />
          <Stat label="Tokens used" value="Unavailable" unavailable meta="Nothing is sent to a model, so nothing is counted" />
          <Stat prov="human" label="Quota set" value={quota ? context.money(Number(quota.amountMinor ?? 0)) : "None"} meta={quota ? String(quota.fields.period) : "Set one in Limits"} />
          <Stat prov="agent" label="Agents in draft mode" value={String(data.agents.filter((row) => row.fields.autonomy === "draft").length)} meta={`of ${data.agents.length} agents`} />
        </StatRow>
        <Notice tone="warning" title="There is no model usage to report">
          Agent answers in this workspace are composed from local records, and the records are named. Because nothing is sent to a model
          provider, token counts and model costs do not exist rather than being estimated.
        </Notice>
        <Card machine eyebrow="AI WORKFORCE" prov="agent" title="What the agents actually did" subtitle="Counted from records, not inferred">
          <Properties rows={[
            { label: "Agents active", value: String(data.agents.filter((row) => row.status === "active").length) },
            { label: "Drafts prepared for a person", value: String(data.missions.filter((row) => row.status === "needs_decision").length + data.policies.filter((row) => row.fields.proposedBy === "agent").length) },
            { label: "Grants held by agents", value: String(ofKind(data.policies, "autonomyGrant").filter((row) => row.fields.scope === "agent").length) },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (tab === "Missions") {
    const caps = data.budgets.filter((row) => row.fields.kind === "missionCap");
    return (
      <Stack gap={4}>
        <Card eyebrow="MISSION SPEND" prov="posted" title="Mission spend against cap" subtitle="Committed locally against local supplier quotes">
          <BarChart
            title="Mission budget and committed spend"
            height={200}
            format={(value) => context.money(value)}
            series={[
              { name: "Cap", points: caps.map((row) => ({ label: data.missions.find((mission) => mission.id === row.fields.scope)?.title ?? row.title, value: Number(row.amountMinor ?? 0) })) },
              { name: "Committed", points: caps.map((row) => ({ label: data.missions.find((mission) => mission.id === row.fields.scope)?.title ?? row.title, value: Number(row.fields.committedMinor ?? 0) })) },
            ]}
            footer="Reservations are written to the budget record before a commitment, so two steps cannot spend the same headroom."
          />
        </Card>
        <Grid>
          {caps.map((row) => {
            const committed = Number(row.fields.committedMinor ?? 0);
            const reserved = Number(row.fields.reservedMinor ?? 0);
            const total = Number(row.amountMinor ?? 0);
            return (
              <Card key={row.id} eyebrow="LIMIT" prov="human" span={6} title={row.title} subtitle={row.summary}>
                <Stack gap={3}>
                  <Meter value={committed + reserved} max={Math.max(1, total)} label={`${row.title} headroom`} tone={committed + reserved > total * 0.9 ? "warning" : "success"} />
                  <Properties rows={[
                    { label: "Cap", value: context.money(total) },
                    { label: "Committed", value: context.money(committed) },
                    { label: "Reserved but not committed", value: context.money(reserved) },
                    { label: "Headroom", value: context.money(Math.max(0, total - committed - reserved)) },
                  ]} />
                </Stack>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    );
  }

  if (tab === "Providers") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Provider charges lag reality">
          Even with a provider connected, charges arrive after the work. A figure here would be at least a day behind, and this console
          would say so rather than presenting it as current.
        </Notice>
        <Card eyebrow="PROVIDERS" prov="unknown" title="Providers" subtitle={`${PROVIDER_CAPABILITIES.length} capabilities, none connected`} flush>
          <DataGrid
            rows={PROVIDER_CAPABILITIES}
            rowId={(row) => row.id}
            label="Provider capabilities"
            columns={[
              { key: "label", header: "Capability", primary: true, cell: (row) => <div><strong>{row.label}</strong><p className="ds-subtle">{row.note}</p></div>, filterValue: (row) => `${row.label} ${row.provider}` },
              { key: "provider", header: "Provider", cell: (row) => row.provider },
              { key: "state", header: "State", cell: (row) => <Pill tone={CAPABILITY_TONE[row.state]}>{CAPABILITY_LABELS[row.state]}</Pill> },
              { key: "local", header: "Kept locally instead", hideBelow: 1200, cell: (row) => row.localEquivalent },
              { key: "spend", header: "Charges", align: "end", cell: () => <span className="ds-subtle">None</span> },
            ]}
            empty={<Empty title="No providers" />}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Limits") {
    return (
      <Card eyebrow="LIMITS" prov="human" title={`${data.budgets.length} limits`} subtitle="Quotas and caps, with reservations shown separately" flush>
        <DataGrid
          rows={data.budgets}
          rowId={(row) => row.id}
          label="Limits"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Spend limit", { id }); }}
          columns={[
            { key: "title", header: "Limit", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind)}</Pill> },
            { key: "cap", header: "Cap", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.amountMinor ?? 0))}</span>, sortValue: (row) => row.amountMinor ?? 0 },
            { key: "committed", header: "Committed", align: "end", cell: (row) => (row.fields.usageKnown === false ? <span className="ds-subtle">Unavailable</span> : context.money(Number(row.fields.committedMinor ?? 0))) },
            { key: "reserved", header: "Reserved", align: "end", hideBelow: 1100, cell: (row) => <span className="ds-num">{context.money(Number(row.fields.reservedMinor ?? 0))}</span> },
            { key: "period", header: "Period", align: "end", cell: (row) => String(row.fields.period ?? "") },
          ]}
          empty={<Empty title="No limits set" action={<Button variant="primary" onClick={() => context.openOverlay("Spend limit")}>Set a quota</Button>}>Without a limit, a mission may commit whatever its grant allows.</Empty>}
        />
      </Card>
    );
  }

  const invoices = data.billingInvoices;
  return (
    <Card eyebrow="SUBSCRIPTION" prov="posted" title="Subscription invoices" subtitle={`${invoices.length} records · nothing is charged from this browser`} flush>
      <DataGrid
        rows={invoices}
        rowId={(row) => row.id}
        label="Subscription invoices"
        columns={[
          { key: "title", header: "Invoice", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => row.title },
          { key: "period", header: "Period", cell: (row) => String(row.fields.period ?? "") },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span>, sortValue: (row) => row.amountMinor ?? 0 },
          { key: "due", header: "Due", align: "end", cell: (row) => (row.fields.dueAt ? <span className="ds-num">{context.date(String(row.fields.dueAt))}</span> : "—") },
          {
            key: "status", header: "State", align: "end",
            cell: (row) => <Pill tone={row.status === "paid_locally" ? "success" : new Date(String(row.fields.dueAt ?? now)) < now ? "warning" : "info"}>{row.status.replace(/_/g, " ")}</Pill>,
          },
        ]}
        empty={<Empty title="No invoices" />}
      />
    </Card>
  );
}

export function SpendLimit({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.budgets.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [cap, setCap] = useSeeded(Number(existing?.amountMinor ?? 25_000));
  const [busy, setBusy] = useState(false);
  const committed = Number(existing?.fields.committedMinor ?? 0);
  const reserved = Number(existing?.fields.reservedMinor ?? 0);
  const tooLow = cap < committed + reserved;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Limit", value: existing?.title ?? "New quota" },
        { label: "Committed", value: context.money(committed) },
        { label: "Reserved", value: context.money(reserved) },
      ]} />
      <Field label="Cap (minor units)" error={tooLow ? "A cap below what is already committed and reserved would make the limit meaningless." : undefined}>
        <TextInput type="number" min={0} step={1000} value={String(cap)} onChange={(event) => setCap(Number(event.target.value))} invalid={tooLow} />
      </Field>
      <Notice tone="info" title="Reservations are taken before a commitment">
        A step reserves its headroom on the budget record first and commits afterwards, so two steps in the same period cannot both
        spend the last of a cap.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={tooLow}
          onClick={async () => {
            setBusy(true);
            try {
              if (existing) {
                await context.mutate.patch(existing.id, { amountMinor: cap }, { event: `Quota set to ${context.money(cap)} on ${existing.title}`, expectRevision: existing.revision });
                context.toast("Quota saved", `${existing.title} is capped at ${context.money(cap)}.`);
              } else {
                await context.mutate.create({
                  collection: "budgets",
                  title: `${context.org.shortName} quota`,
                  status: "active",
                  summary: `Capped at ${context.money(cap)} for this period.`,
                  amountMinor: cap,
                  fields: { kind: "toolSpend", period: "month", scope: "company", committedMinor: 0, reservedMinor: 0, provider: "local", usageKnown: true },
                }, `Quota created at ${context.money(cap)}`);
                context.toast("Quota set", "The limit is a record in this workspace.");
              }
              close();
            } finally { setBusy(false); }
          }}
        >
          Save quota
        </Button>
      </Row>
    </Stack>
  );
}

export function CostAllocation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const [department, setDepartment] = useSeeded(data.departments[0]?.id ?? "");
  const [amount, setAmount] = useState(5_000);
  const [busy, setBusy] = useState(false);
  const target = data.budgets.find((row) => row.fields.scope === department);

  return (
    <Stack gap={4}>
      <Field label="Department">
        <Select value={department} onChange={(event) => setDepartment(event.target.value)}>
          {data.departments.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Allocate (minor units)">
        <TextInput type="number" min={0} step={1000} value={String(amount)} onChange={(event) => setAmount(Number(event.target.value))} />
      </Field>
      <Properties rows={[
        { label: "Existing allocation", value: target ? context.money(Number(target.amountMinor ?? 0)) : "None" },
        { label: "After this change", value: context.money(Number(target?.amountMinor ?? 0) + amount) },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!department || amount <= 0}
          onClick={async () => {
            setBusy(true);
            try {
              if (target) {
                await context.mutate.patch(target.id, { amountMinor: Number(target.amountMinor ?? 0) + amount }, { event: `Allocated ${context.money(amount)} to ${target.title}`, expectRevision: target.revision });
              } else {
                const name = data.departments.find((row) => row.id === department)?.title ?? "Department";
                await context.mutate.create({
                  collection: "budgets",
                  title: `${name} tools`,
                  status: "active",
                  summary: `Allocated ${context.money(amount)} for this period.`,
                  amountMinor: amount,
                  fields: { kind: "toolSpend", period: "month", scope: department, committedMinor: 0, reservedMinor: 0, provider: "local", usageKnown: true },
                }, `Allocated ${context.money(amount)} to ${name}`);
              }
              context.toast("Allocated", "The budget record carries the new allocation.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Allocate
        </Button>
      </Row>
    </Stack>
  );
}

export function BudgetWarning({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const budget = data.budgets.find((row) => row.id === context.selectedId) ?? data.budgets[0];
  if (!budget) return <Empty title="No limit selected" icon={<KeyRound size={20} />}>Choose a limit to inspect its headroom.</Empty>;
  const total = Number(budget.amountMinor ?? 0);
  const committed = Number(budget.fields.committedMinor ?? 0);
  const reserved = Number(budget.fields.reservedMinor ?? 0);
  const headroom = total - committed - reserved;

  return (
    <Stack gap={4}>
      <h3>{budget.title}</h3>
      <Meter value={committed + reserved} max={Math.max(1, total)} label={`${budget.title} usage`} tone={headroom <= 0 ? "danger" : headroom < total * 0.15 ? "warning" : "success"} />
      <Properties rows={[
        { label: "Cap", value: context.money(total) },
        { label: "Committed", value: budget.fields.usageKnown === false ? "Unavailable — no provider is connected" : context.money(committed) },
        { label: "Reserved", value: context.money(reserved) },
        { label: "Headroom", value: context.money(Math.max(0, headroom)) },
        { label: "Provider lag", value: budget.fields.lagDays ? `${String(budget.fields.lagDays)} days behind, were a provider connected` : "Not applicable" },
      ]} />
      {headroom <= 0 && (
        <Notice tone="danger" title="No headroom left">
          Further steps under this limit will stop and raise an approval instead of committing. Raising the cap is a decision, so it
          goes through Approvals.
        </Notice>
      )}
      <Button
        variant="secondary"
        onClick={async () => {
          await context.mutate.create({
            collection: "approvals",
            title: `Raise the cap on ${budget.title}`,
            status: "awaiting_approval",
            summary: `Requested by ${context.actor} from Budget & AI usage.`,
            amountMinor: Math.round(total * 1.25),
            fields: {
              requester: context.actor, requesterKind: "human", action: "admin.raise_budget", targetId: budget.id, targetTitle: budget.title,
              risk: "medium", accounts: "Budget record", planVersion: String(budget.revision), scope: "One limit, one period",
              assignee: "Maya Chen", capability: "approve_payment", evidence: `Cap ${context.money(total)}, committed ${context.money(committed)}, reserved ${context.money(reserved)}.`,
            },
          }, `Budget increase requested for ${budget.title}`);
          context.toast("Request raised", "It is in Approvals, bound to this budget record at its current revision.");
        }}
      >
        Request an increase
      </Button>
    </Stack>
  );
}
