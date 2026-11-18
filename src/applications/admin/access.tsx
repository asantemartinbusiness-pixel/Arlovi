import { useMemo, useState } from "react";
import { KeyRound, Search } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { ROLE_LABELS, can as roleCan, type Capability } from "@/platform/policy";
import { clockIso } from "@/platform/clock";
import type { Role } from "@/domain/types";
import { CAPABILITIES, ROLES, appsForRole, capabilityLabel, ofKind, useAdmin } from "./pieces";

/* ====================================================================== *
 * ADMIN access: what each capability lets a person do, searchable, and
 * access requests that are reviewed with their exact gains and losses.
 * ====================================================================== */

export const CAPABILITY_EXPLAINED: Record<Capability, { what: string; risk: "high" | "medium" | "low"; where: string }> = {
  post_journal: { what: "Post journals to the general ledger, which changes the books and every report built on them.", risk: "high", where: "Finance" },
  approve_payment: { what: "Approve bills, refunds and payment runs. Money leaves only through a connected provider; here it is recorded as approved.", risk: "high", where: "Finance, Procurement, Inbox approvals" },
  approve_mission: { what: "Approve an AI mission's plan and spend cap so it can continue past a decision point.", risk: "medium", where: "Missions, Inbox approvals" },
  edit_people: { what: "Create and change people, departments, reporting lines and employment records.", risk: "medium", where: "People, Headquarters" },
  view_payroll: { what: "See salaries, payroll runs and pay history.", risk: "high", where: "People, Finance" },
  edit_pipeline: { what: "Create and move deals, quotes and leads through the sales pipeline.", risk: "low", where: "CRM, Marketing" },
  publish_campaign: { what: "Schedule or publish a campaign, which can reach customers once a sending provider is connected.", risk: "medium", where: "Marketing" },
  manage_connectors: { what: "Connect, disconnect and configure external services and the keys they use.", risk: "high", where: "Integrations, Developer access" },
  manage_policy: { what: "Change roles, autonomy grants, retention, sign-in and other workspace policies.", risk: "high", where: "Administration" },
  delete_records: { what: "Delete records permanently rather than archive them. Legal holds still refuse deletion.", risk: "high", where: "Every application" },
  edit_knowledge: { what: "Approve facts and documents into the company brain that agents read from.", risk: "medium", where: "Brain, Documents" },
  run_automation: { what: "Run and resume automations and agent steps that act without a person each time.", risk: "medium", where: "Automations, Missions" },
  export_data: { what: "Export records out of the workspace as files.", risk: "medium", where: "Every application with an export" },
  view_legal: { what: "Read contracts, legal matters and privacy requests.", risk: "medium", where: "Legal, Privacy" },
};

const RISK_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export function capabilityMatches(capability: Capability, query: string, role: string): boolean {
  if (role !== "all" && !roleCan(role as Role, capability)) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const info = CAPABILITY_EXPLAINED[capability];
  const holders = ROLES.filter((entry) => roleCan(entry, capability)).map((entry) => ROLE_LABELS[entry]).join(" ");
  return `${capabilityLabel(capability)} ${capability} ${info.what} ${info.where} ${info.risk} ${holders}`.toLowerCase().includes(needle);
}

export function EffectiveAccess(_props: { context: ScreenContext }) {
  const data = useAdmin();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const rows = CAPABILITIES.filter((capability) => capabilityMatches(capability, query, role));
  const holdersOf = (entry: Role) => data.members.filter((member) => member.fields.role === entry).length;

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Deny wins, and a server would decide">
        This is what the interface offers each role view today. In a product with a server, deny takes precedence over allow and the
        tenant boundary is enforced there, not here. Nothing in this browser is a security boundary.
      </Notice>
      <Row gap={2} wrap>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
          <TextInput type="search" aria-label="Search capabilities" placeholder="Search: payroll, export, delete, Finance…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ paddingInlineStart: 32 }} />
          <Search size={15} aria-hidden="true" style={{ position: "absolute", insetInlineStart: 10, insetBlockStart: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }} />
        </div>
        <Select aria-label="Held by role" value={role} onChange={(event) => setRole(event.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="all">Every role view</option>
          {ROLES.map((entry) => <option key={entry} value={entry}>Held by {ROLE_LABELS[entry]}</option>)}
        </Select>
        <span className="ds-subtle">{rows.length} of {CAPABILITIES.length} capabilities</span>
      </Row>
      {role !== "all" && rows.length === 0 && (
        <Notice tone="info" title={`The ${ROLE_LABELS[role as Role]} view holds no capabilities`}>
          It can still open {appsForRole(role as Role).length} applications and work in them; it cannot post, approve, publish, export or
          change policy.
        </Notice>
      )}
      {rows.length === 0 && role === "all" ? (
        <Empty title="No capability matches" icon={<Search size={20} />}>Try a different word.</Empty>
      ) : (
        <Card eyebrow="EFFECTIVE ACCESS" prov="posted" title="Role against capability" subtitle="Each capability with what it lets a person do" flush>
          <div className="ds-grid-wrap">
            <div className="ds-grid-scroll">
              <table className="ds-table">
                <caption className="ds-sr-only">Capabilities held by each role view</caption>
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    {ROLES.map((entry) => <th key={entry} scope="col">{ROLE_LABELS[entry]} <span className="ds-subtle">({holdersOf(entry)})</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((capability) => {
                    const info = CAPABILITY_EXPLAINED[capability];
                    return (
                      <tr key={capability}>
                        <th scope="row" className="ds-table-primary" style={{ minWidth: 260, whiteSpace: "normal", textTransform: "none", letterSpacing: "normal", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg-default)", background: "transparent", position: "static" }}>
                          <Row gap={2}><span>{capabilityLabel(capability)}</span><Pill tone={RISK_TONE[info.risk]}>{info.risk} risk</Pill></Row>
                          <p className="ds-subtle" style={{ fontWeight: 400, marginBlockStart: 4, maxWidth: "52ch" }}>{info.what}</p>
                          <p className="ds-subtle" style={{ fontWeight: 400 }}>Used in {info.where}</p>
                        </th>
                        {ROLES.map((entry) => (
                          <td key={entry}>
                            {roleCan(entry, capability) ? <Pill tone="success">Allowed</Pill> : <span className="ds-subtle">Denied</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </Stack>
  );
}

/* ----------------------------- Access requests ----------------------------- */

export function accessChange(from: Role, to: Role): { gained: Capability[]; lost: Capability[]; appsGained: string[] } {
  const gained = CAPABILITIES.filter((capability) => roleCan(to, capability) && !roleCan(from, capability));
  const lost = CAPABILITIES.filter((capability) => roleCan(from, capability) && !roleCan(to, capability));
  const before = new Set(appsForRole(from));
  return { gained, lost, appsGained: appsForRole(to).filter((code) => !before.has(code)) };
}

export function AccessRequests({ context }: { context: ScreenContext }) {
  const data = useAdmin();
  const requests = ofKind(data.policies, "accessRequest").sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.updatedAt.localeCompare(a.updatedAt));
  const open = requests.filter((row) => row.status === "open");
  return (
    <Card
      eyebrow="ACCESS REQUESTS"
      prov="human"
      title={`${open.length} waiting for review`}
      subtitle="A person asks for a different role view; an owner decides with the exact change in front of them"
      actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("access request form")}>Request access</Button>}
      flush
    >
      <DataGrid
        rows={requests}
        rowId={(row) => row.id}
        label="Access requests"
        selectedId={context.selectedId}
        onSelect={context.select}
        onOpen={(id) => { context.select(id); context.openOverlay("access review", { id }); }}
        columns={[
          { key: "who", header: "Requested by", primary: true, cell: (row) => <div><strong>{String(row.fields.memberName ?? row.ownerName)}</strong><p className="ds-subtle ds-truncate" style={{ maxWidth: "48ch" }}>{row.summary}</p></div>, filterValue: (row) => `${String(row.fields.memberName ?? "")} ${row.summary}` },
          { key: "change", header: "Change", cell: (row) => `${ROLE_LABELS[String(row.fields.fromRole) as Role] ?? String(row.fields.fromRole)} → ${ROLE_LABELS[String(row.fields.requestedRole) as Role] ?? String(row.fields.requestedRole)}` },
          { key: "when", header: "Asked", align: "end", hideBelow: 1100, cell: (row) => <span className="ds-num">{context.relative(row.at ?? row.createdAt)}</span>, sortValue: (row) => row.at ?? row.createdAt },
          { key: "state", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "approved" ? "success" : row.status === "declined" ? "danger" : "warning"}>{row.status === "open" ? "Waiting" : row.status}</Pill>, sortValue: (row) => row.status },
        ]}
        empty={<Empty title="No access requests" icon={<KeyRound size={20} />}>Requests for a different role view appear here for an owner to review.</Empty>}
      />
    </Card>
  );
}

export function AccessReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const { role: viewerRole } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const request = ofKind(data.policies, "accessRequest").find((row) => row.id === (payload?.id ?? context.selectedId));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!request) return <Empty title="Select a request" icon={<KeyRound size={20} />}>Choose an access request to review.</Empty>;

  const member = data.members.find((row) => row.id === request.fields.memberId);
  const from = (String(member?.fields.role ?? request.fields.fromRole) || "member") as Role;
  const to = String(request.fields.requestedRole) as Role;
  const change = accessChange(from, to);
  const decided = request.status !== "open";
  const canDecide = roleCan(viewerRole, "manage_policy");
  const stale = member && String(member.fields.role) !== String(request.fields.fromRole);

  async function decide(outcome: "approved" | "declined") {
    if (!request) return;
    if (outcome === "declined" && !note.trim()) { setError("Say why, so the person knows what would change the answer."); return; }
    setBusy(true);
    try {
      if (outcome === "approved") {
        if (!member) { setError("The member is no longer in this workspace."); return; }
        await context.mutate.patch(member.id, { fields: { ...member.fields, role: to } }, { event: `Role view changed from ${from} to ${to} for ${member.title} (access request approved)`, expectRevision: member.revision });
      }
      await context.mutate.patch(request.id, {
        status: outcome,
        fields: { ...request.fields, decidedBy: context.actor, decidedAt: clockIso(), decisionNote: note.trim() },
      }, { event: `Access request ${outcome} by ${context.actor}: ${String(request.fields.memberName)} → ${to}${note.trim() ? ` (${note.trim()})` : ""}`, expectRevision: request.revision });
      context.toast(outcome === "approved" ? "Access granted" : "Request declined", outcome === "approved" ? `${String(request.fields.memberName)} now holds the ${ROLE_LABELS[to]} view.` : "The reason is stored on the request.");
      close();
    } finally { setBusy(false); }
  }

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Requested by", value: String(request.fields.memberName ?? request.ownerName) },
        { label: "Change", value: `${ROLE_LABELS[from]} → ${ROLE_LABELS[to] ?? to}` },
        { label: "Reason given", value: request.summary || "None given" },
        { label: "Asked", value: context.dateTime(request.at ?? request.createdAt) },
        ...(decided ? [
          { label: "Decision", value: <Pill tone={request.status === "approved" ? "success" : "danger"}>{request.status}</Pill> },
          { label: "Decided by", value: `${String(request.fields.decidedBy ?? "")} · ${context.relative(String(request.fields.decidedAt ?? ""))}` },
          ...(request.fields.decisionNote ? [{ label: "Note", value: String(request.fields.decisionNote) }] : []),
        ] : []),
      ]} />
      {stale && !decided && <Notice tone="warning" title="The person's role changed since they asked">They asked from {ROLE_LABELS[String(request.fields.fromRole) as Role]}; they now hold {ROLE_LABELS[from]}. The change below is from their current view.</Notice>}
      <Card eyebrow="EXACT CHANGE" prov="posted" title="What approving would change">
        <Stack gap={3}>
          <div>
            <strong>Gains</strong>
            {change.gained.length === 0 ? <p className="ds-subtle">No new capabilities.</p> : (
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
                {change.gained.map((capability) => <li key={capability}><strong>{capabilityLabel(capability)}</strong> <span className="ds-subtle">— {CAPABILITY_EXPLAINED[capability].what}</span></li>)}
              </ul>
            )}
          </div>
          <div>
            <strong>Loses</strong>
            {change.lost.length === 0 ? <p className="ds-subtle">Nothing is removed.</p> : <Row gap={1} wrap>{change.lost.map((capability) => <Pill key={capability} tone="warning">{capabilityLabel(capability)}</Pill>)}</Row>}
          </div>
          <div>
            <strong>New applications</strong>
            {change.appsGained.length === 0 ? <p className="ds-subtle">None.</p> : <Row gap={1} wrap>{change.appsGained.map((code) => <Pill key={code}>{code}</Pill>)}</Row>}
          </div>
        </Stack>
      </Card>
      {change.gained.some((capability) => CAPABILITY_EXPLAINED[capability].risk === "high") && !decided && (
        <Notice tone="warning" title="This includes high-risk capabilities">Consider a narrower custom role instead of the whole view.</Notice>
      )}
      {!decided && !canDecide && <Notice tone="info" title="Only an owner can decide">Your role view cannot change roles. The request stays waiting for an owner.</Notice>}
      {!decided && (
        <Field label="Note" hint="Required to decline. Stored on the request and in the audit trail." error={error || undefined}>
          <TextArea rows={2} value={note} onChange={(event) => { setNote(event.target.value); setError(""); }} />
        </Field>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>{decided ? "Close" : "Cancel"}</Button>
        <span className="ds-grow" />
        {!decided && (
          <>
            <Button variant="danger" busy={busy} disabled={!canDecide} onClick={() => void decide("declined")}>Decline</Button>
            <Button variant="primary" busy={busy} disabled={!canDecide || !member} onClick={() => void decide("approved")}>Approve and change role</Button>
          </>
        )}
      </Row>
    </Stack>
  );
}

export function AccessRequestForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAdmin();
  const people = useMemo(() => data.members.filter((row) => row.fields.kind !== "ai"), [data.members]);
  const mine = people.find((row) => row.title === context.actor);
  const [memberId, setMemberId] = useState("");
  const chosen = people.find((row) => row.id === (memberId || mine?.id)) ?? people[0];
  const [requested, setRequested] = useState<Role | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = (String(chosen?.fields.role ?? "member")) as Role;
  const target = (requested || ROLES.find((entry) => entry !== from && entry !== "client") || "member") as Role;
  const change = accessChange(from, target);

  return (
    <Stack gap={4}>
      <Field label="Who needs access">
        <Select value={chosen?.id ?? ""} onChange={(event) => setMemberId(event.target.value)}>
          {people.map((row) => <option key={row.id} value={row.id}>{row.title} · {ROLE_LABELS[String(row.fields.role) as Role] ?? String(row.fields.role)}</option>)}
        </Select>
      </Field>
      <Field label="Role view requested">
        <Select value={target} onChange={(event) => setRequested(event.target.value as Role)}>
          {ROLES.filter((entry) => entry !== from).map((entry) => <option key={entry} value={entry}>{ROLE_LABELS[entry]}</option>)}
        </Select>
      </Field>
      <p className="ds-subtle">
        {change.gained.length ? `Would add ${change.gained.map(capabilityLabel).join(", ")}.` : "Adds no capabilities."}
        {change.lost.length ? ` Would remove ${change.lost.map(capabilityLabel).join(", ")}.` : ""}
      </p>
      <Field label="Why" required error={error || undefined}>
        <TextArea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} placeholder="Covering month-end while Jonah is away" />
      </Field>
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={!chosen}
          onClick={async () => {
            if (!chosen) return;
            if (!reason.trim()) { setError("Give the reviewer a reason."); return; }
            if (ofKind(data.policies, "accessRequest").some((row) => row.status === "open" && row.fields.memberId === chosen.id && row.fields.requestedRole === target)) {
              setError("That request is already waiting for review."); return;
            }
            setBusy(true);
            try {
              await context.mutate.create({
                collection: "policies",
                title: `${chosen.title}: ${ROLE_LABELS[from]} → ${ROLE_LABELS[target]}`,
                status: "open",
                summary: reason.trim(),
                at: clockIso(),
                tags: ["accessRequest"],
                fields: { kind: "accessRequest", memberId: chosen.id, memberName: chosen.title, fromRole: from, requestedRole: target, requestedBy: context.actor },
              }, `Access requested for ${chosen.title}: ${from} → ${target}`);
              context.toast("Request recorded", "An owner reviews it under Exceptions with the exact change shown.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Send for review
        </Button>
      </Row>
    </Stack>
  );
}
