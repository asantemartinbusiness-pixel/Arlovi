import { useMemo, useState } from "react";
import { Archive, CalendarClock, FileSignature, FileText, Gavel, ShieldAlert } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, Meter, Notice, Pill, Properties, Row, Select,
  Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, daysBetween, startOfMonth, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { Redline, type Version } from "./redline";

export function useLegalData() {
  return useCollections(["contracts", "obligations", "risks", "documents", "policies", "employees", "members"]);
}

export interface Clause { id: string; title: string; text: string; risk: "standard" | "review" | "unusual"; note?: string }
export interface Signature { party: string; name: string; at: string; method: string }

export function clausesOf(contract: Rec): Clause[] {
  return (contract.body as { clauses?: Clause[] } | undefined)?.clauses ?? [];
}

export function versionsOf(contract: Rec): Version[] {
  return (contract.body as { versions?: Version[] } | undefined)?.versions ?? [];
}

export function signaturesOf(contract: Rec): Signature[] {
  return (contract.body as { signatures?: Signature[] } | undefined)?.signatures ?? [];
}

export const LIFECYCLE = ["draft", "in_review", "approved", "awaiting_signature", "active", "expiring", "archived"] as const;

export function lifecycleLabel(state: string): string {
  return state.replace(/_/g, " ");
}

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger" | "accent"> = {
  draft: "neutral", in_review: "info", approved: "accent", awaiting_signature: "warning",
  active: "success", expiring: "warning", expired: "danger", archived: "neutral",
};

export function Lifecycle({ status }: { status: string }) {
  const index = LIFECYCLE.indexOf(status as (typeof LIFECYCLE)[number]);
  return (
    <div className="lg-lifecycle" role="img" aria-label={`Lifecycle: ${lifecycleLabel(status)}`}>
      {LIFECYCLE.map((stage, position) => (
        <span
          key={stage}
          className="lg-stage"
          data-state={index < 0 ? undefined : position < index ? "done" : position === index ? "current" : undefined}
        >
          {lifecycleLabel(stage)}
        </span>
      ))}
    </div>
  );
}

function daysUntil(value: string | undefined, now: Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return daysBetween(now, date);
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-001 · Governance Overview
 * ------------------------------------------------------------------ */

export function GovernanceOverview({ context, lens }: { context: ScreenContext; lens: "Overview" | "Obligations" | "Policies" | "Risks" }) {
  const data = useLegalData();
  const { now, org } = useWorkspace();
  const overdue = data.obligations.filter((obligation) => obligation.status !== "done" && (daysUntil(obligation.dueAt, now) ?? 1) < 0);
  const soon = data.obligations.filter((obligation) => obligation.status !== "done" && (daysUntil(obligation.dueAt, now) ?? 99) >= 0 && (daysUntil(obligation.dueAt, now) ?? 99) <= 30);
  const expiring = data.contracts.filter((contract) => (daysUntil(contract.endAt, now) ?? 999) <= 60 && (daysUntil(contract.endAt, now) ?? 999) >= -1 && contract.status !== "archived");
  const governance = data.policies.filter((policy) => policy.fields.kind === "governance" || !policy.fields.kind);
  const dueReview = governance.filter((policy) => (daysUntil(policy.dueAt, now) ?? 999) < 0);
  const material = data.risks.filter((risk) => risk.status !== "closed" && Number(risk.fields.score ?? 0) >= 6);

  if (lens === "Obligations") {
    return <ObligationTable context={context} rows={[...overdue, ...soon]} empty="Nothing is due in the next month" />;
  }

  if (lens === "Policies") {
    return governance.length === 0 ? <Empty title="No governance policies" icon={<Gavel size={20} />} /> : (
      <Stack gap={3}>
        {governance.map((policy) => {
          const overdueReview = (daysUntil(policy.dueAt, now) ?? 999) < 0;
          return (
            <Card
              key={policy.id}
              eyebrow="POLICY"
              prov="human"
              title={policy.title}
              subtitle={`Version ${String(policy.fields.version ?? "1.0")} · review ${context.date(policy.dueAt)}`}
              actions={<Pill tone={overdueReview ? "danger" : policy.status === "draft" ? "neutral" : "success"} dot>{overdueReview ? "review overdue" : policy.status.replace("_", " ")}</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/legal/policies`)}>Open the register</Button>}
            >
              <Stack gap={2}>
                <p>{policy.summary}</p>
                {overdueReview && (
                  <Notice tone="warning" title="The review date has passed">
                    A policy past its review date still applies. It is flagged so nobody assumes it was checked recently.
                  </Notice>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (lens === "Risks") {
    return <RiskRegister context={context} lens="High" />;
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Overdue obligations" value={String(overdue.length)} prov={overdue.length ? "human" : "posted"} meta={overdue.length ? `oldest ${context.date(overdue[0].dueAt)}` : "Nothing is late"} onClick={() => context.setTab("Obligations")} />
        <Stat label="Due in 30 days" value={String(soon.length)} prov="human" meta="Filings, renewals and attestations" onClick={() => context.setTab("Obligations")} />
        <Stat label="Contracts expiring" value={String(expiring.length)} prov="human" meta="Inside 60 days" onClick={() => context.navigate(`/o/${org.slug}/legal/contracts`)} />
        <Stat label="Material risks" value={String(material.length)} prov="human" meta="Score of six or more" onClick={() => context.setTab("Risks")} />
      </StatRow>

      <Grid>
        <Card span={7} eyebrow="OBLIGATIONS" prov="human" title="What is late or close" subtitle={`${overdue.length} overdue · ${soon.length} inside a month`}>
          {overdue.length + soon.length === 0 ? (
            <Empty title="Nothing is due" icon={<CalendarClock size={20} />}>Filings and renewals appear here as their dates approach.</Empty>
          ) : (
            <Stack gap={2}>
              {[...overdue, ...soon].slice(0, 7).map((obligation) => {
                const days = daysUntil(obligation.dueAt, now) ?? 0;
                return (
                  <Row key={obligation.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <div className="ds-grow">
                      <strong>{obligation.title}</strong>
                      <p className="ds-subtle">{[String(obligation.fields.owner ?? obligation.ownerName), String(obligation.fields.jurisdiction ?? ""), String(obligation.fields.recurrence ?? "")].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Pill tone={days < 0 ? "danger" : days <= 7 ? "warning" : "neutral"} dot>
                      <span className="ds-num">{days < 0 ? `${Math.abs(days)}d late` : `${days}d`}</span>
                    </Pill>
                    <Button size="sm" variant="secondary" onClick={() => { context.select(obligation.id); context.openOverlay("Obligation quick view", { id: obligation.id }); }}>Review</Button>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="CONTRACTS" prov="human" title="Deadlines on contracts" subtitle={`${expiring.length} inside 60 days`}>
          {expiring.length === 0 ? <Empty title="No contract is close to its end date" icon={<FileText size={20} />} /> : (
            <Stack gap={2}>
              {expiring.map((contract) => (
                <Row key={contract.id} gap={2}>
                  <span className="ds-grow ds-truncate">{contract.title}</span>
                  <span className="ds-subtle ds-num">{context.date(contract.endAt, { day: "numeric", month: "short" })}</span>
                  <Pill tone={STATUS_TONE[contract.status] ?? "neutral"}>{lifecycleLabel(contract.status)}</Pill>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={6} eyebrow="RISK" prov="human" title="Material risks" subtitle={`${material.length} scored six or more`}>
          <Stack gap={2}>
            {material.map((risk) => (
              <Row key={risk.id} gap={2}>
                <Pill tone={Number(risk.fields.score ?? 0) >= 9 ? "danger" : "warning"}><span className="ds-num">{String(risk.fields.score ?? 0)}</span></Pill>
                <span className="ds-grow ds-truncate">{risk.title}</span>
                <span className="ds-subtle">{risk.ownerName}</span>
              </Row>
            ))}
            {material.length === 0 && <span className="ds-subtle">Nothing on the register scores six or more.</span>}
          </Stack>
        </Card>

        <Card span={6} eyebrow="POLICY" prov="human" title="Policy reviews" subtitle={`${dueReview.length} past their review date`}>
          <Stack gap={2}>
            {governance.map((policy) => {
              const days = daysUntil(policy.dueAt, now) ?? 0;
              return (
                <Row key={policy.id} gap={2}>
                  <span className="ds-grow ds-truncate">{policy.title}</span>
                  <span className="ds-subtle ds-num">v{String(policy.fields.version ?? "")}</span>
                  <Pill tone={days < 0 ? "danger" : "neutral"} dot>{days < 0 ? "overdue" : context.date(policy.dueAt, { day: "numeric", month: "short" })}</Pill>
                </Row>
              );
            })}
          </Stack>
        </Card>

        <Card span={12} eyebrow="HONESTY" title="What this application does not do">
          <Notice tone="warning" title="Nothing here is legal advice, and nothing is filed">
            Clause notes are hypotheses with a citation to the clause they came from. No filing service, e-signature provider or
            court system is connected, so every deadline here is a reminder somebody has to act on.
          </Notice>
        </Card>
      </Grid>
    </Stack>
  );
}

function ObligationTable({ context, rows, empty }: { context: ScreenContext; rows: Rec[]; empty: string }) {
  const { now } = useWorkspace();
  return rows.length === 0 ? <Empty title={empty} icon={<CalendarClock size={20} />} /> : (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Obligations"
      selectedId={context.selectedId}
      rowTone={(row) => {
        const days = daysUntil(row.dueAt, now) ?? 999;
        return row.status === "done" ? undefined : days < 0 ? "danger" : days <= 7 ? "warning" : undefined;
      }}
      columns={[
        { key: "title", header: "Obligation", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.owner ?? "")}` },
        { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? row.ownerName), sortValue: (row) => String(row.fields.owner ?? ""), hideBelow: 900 },
        { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? ""), hideBelow: 1100 },
        { key: "jurisdiction", header: "Jurisdiction", cell: (row) => <span className="ds-num">{String(row.fields.jurisdiction ?? "")}</span>, hideBelow: 1200 },
        { key: "due", header: "Due", align: "end", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span>, sortValue: (row) => row.dueAt ?? "~" },
        { key: "state", header: "State", align: "end", cell: (row) => {
          const days = daysUntil(row.dueAt, now) ?? 0;
          return row.status === "done"
            ? <Pill tone="success" dot>done</Pill>
            : <Pill tone={days < 0 ? "danger" : days <= 7 ? "warning" : "neutral"} dot><span className="ds-num">{days < 0 ? `${Math.abs(days)}d late` : `${days}d`}</span></Pill>;
        } },
      ]}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => { context.select(id); context.openOverlay("Deadline editor", { id }); }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-002 · Contract Library
 * ------------------------------------------------------------------ */

export function ContractLibrary({ context, lens }: { context: ScreenContext; lens: "Draft" | "Review" | "Active" | "Expiring" | "Archived" }) {
  const data = useLegalData();
  const { now, org } = useWorkspace();
  const rows = useMemo(() => {
    if (lens === "Draft") return data.contracts.filter((contract) => contract.status === "draft");
    if (lens === "Review") return data.contracts.filter((contract) => ["in_review", "approved", "awaiting_signature"].includes(contract.status));
    if (lens === "Active") return data.contracts.filter((contract) => contract.status === "active");
    if (lens === "Archived") return data.contracts.filter((contract) => ["archived", "expired"].includes(contract.status));
    return data.contracts.filter((contract) => contract.status === "expiring" || ((daysUntil(contract.endAt, now) ?? 999) <= 90 && contract.status === "active"));
  }, [data.contracts, lens, now]);

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} contracts`} icon={<FileText size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Contract upload")}>Add a contract</Button>} />
  ) : (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${lens} contracts`}
      selectedId={context.selectedId}
      rowTone={(row) => ((daysUntil(row.endAt, now) ?? 999) < 30 && row.status !== "archived" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Contract", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.counterparty ?? "")} ${row.summary}` },
        { key: "counterparty", header: "Counterparty", cell: (row) => String(row.fields.counterparty ?? ""), sortValue: (row) => String(row.fields.counterparty ?? ""), hideBelow: 900 },
        { key: "type", header: "Type", cell: (row) => <Pill tone="neutral">{String(row.fields.type ?? "")}</Pill>, hideBelow: 1100 },
        { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? row.ownerName), hideBelow: 1200 },
        { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{row.amountMinor ? context.money(row.amountMinor) : "—"}</span>, sortValue: (row) => row.amountMinor ?? 0 },
        { key: "ends", header: "Ends", align: "end", cell: (row) => <span className="ds-num">{context.date(row.endAt)}</span>, sortValue: (row) => row.endAt ?? "~" },
        { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={STATUS_TONE[row.status] ?? "neutral"} dot>{lifecycleLabel(row.status)}</Pill>, sortValue: (row) => row.status },
      ]}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/legal/contracts/${id}`)}
      bulkActions={[
        { label: "Assign a reviewer", onRun: () => context.openOverlay("reviewer picker") },
        { label: "Send for signature", onRun: () => context.openOverlay("e-sign request") },
      ]}
      summary={<span className="ds-subtle"><span className="ds-num">{rows.filter((row) => (daysUntil(row.endAt, now) ?? 999) < 30).length}</span> ending inside a month</span>}
    />
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-003 · Contract Detail
 * ------------------------------------------------------------------ */

export function ContractDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useLegalData();
  const record = useRecord(context.params.id);
  const contract = record ?? data.contracts[0];
  const { now } = useWorkspace();
  const [compare, setCompare] = useState(1);
  if (!contract) return <Empty title="No contract" icon={<FileText size={20} />} />;
  const clauses = clausesOf(contract);
  const versions = versionsOf(contract);
  const signatures = signaturesOf(contract);
  const obligations = data.obligations.filter((obligation) => obligation.fields.contractId === contract.id);
  const days = daysUntil(contract.endAt, now);

  if (lens === "Clauses") {
    return (
      <Stack gap={4}>
        <Row gap={3} wrap>
          <Pill tone="neutral"><span className="ds-num">{clauses.length}</span> clauses</Pill>
          <Pill tone="warning"><span className="ds-num">{clauses.filter((clause) => clause.risk === "review").length}</span> to check</Pill>
          <Pill tone="danger"><span className="ds-num">{clauses.filter((clause) => clause.risk === "unusual").length}</span> unusual</Pill>
        </Row>
        <Stack gap={4}>
          {clauses.map((clause) => (
            <div key={clause.id} className="lg-clause" data-risk={clause.risk}>
              <div className="lg-clause-title">
                <strong>{clause.title}</strong>
                <span className="ds-subtle ds-num">{clause.id}</span>
                <Pill tone={clause.risk === "unusual" ? "danger" : clause.risk === "review" ? "warning" : "neutral"}>{clause.risk}</Pill>
              </div>
              <p className="ds-prose">{clause.text}</p>
              {clause.note && (
                <Notice tone={clause.risk === "unusual" ? "warning" : "info"} title="Flagged for a person to decide">
                  {clause.note}
                </Notice>
              )}
            </div>
          ))}
          {clauses.length === 0 && <Empty title="No clauses recorded" icon={<FileText size={20} />} />}
        </Stack>
        <Notice tone="warning" title="A flag is a hypothesis with a citation">
          Nothing here is legal advice and nothing is accepted on this organisation's behalf. Each note names the clause it came
          from so a person can read the wording for themselves.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Redline") {
    if (versions.length < 2) {
      return (
        <Stack gap={4}>
          <Empty title="Only one version is stored" icon={<FileText size={20} />}>
            A comparison needs two stored versions of the same text. This contract has {versions.length === 1 ? "one" : "none"}.
          </Empty>
          {versions.length === 1 && (
            <Card eyebrow="VERSION" prov="posted" title={versions[0].label} subtitle={`${versions[0].author} · ${context.date(versions[0].at)}`}>
              <p className="ds-prose">{versions[0].text}</p>
            </Card>
          )}
        </Stack>
      );
    }
    const after = versions[Math.min(compare, versions.length - 1)];
    const before = versions[Math.max(0, Math.min(compare, versions.length - 1) - 1)];
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Field label="Compare against">
            <Select value={String(compare)} onChange={(event) => setCompare(Number(event.target.value))}>
              {versions.slice(1).map((version, index) => (
                <option key={version.label} value={index + 1}>{versions[index].label} → {version.label}</option>
              ))}
            </Select>
          </Field>
        </Row>
        <Redline before={before} after={after} />
        {contract.fields.immutableSigned === true && (
          <Notice tone="warning" title="The signed version is immutable">
            This contract was signed on {context.date(String(contract.fields.signedAt ?? ""))}. The executed text is kept exactly
            as it was; a comparison never edits it, and a later mark-up is stored as its own version.
          </Notice>
        )}
      </Stack>
    );
  }

  if (lens === "Signatures") {
    return (
      <Stack gap={4}>
        {signatures.length === 0 ? (
          <Empty title="Nothing is signed" icon={<FileSignature size={20} />}>
            This contract has no signature on record. {contract.status === "awaiting_signature" ? "It is waiting for one." : ""}
          </Empty>
        ) : (
          <DataGrid
            rows={signatures.map((signature, index) => ({ ...signature, id: `${contract.id}-sig-${index}` }))}
            rowId={(row) => row.id}
            label="Signatures"
            filterable={false}
            columns={[
              { key: "party", header: "Party", primary: true, cell: (row) => row.party },
              { key: "name", header: "Signed by", cell: (row) => row.name },
              { key: "at", header: "On", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
              { key: "method", header: "How", cell: (row) => row.method, hideBelow: 1000 },
            ]}
          />
        )}
        <Card eyebrow="E-SIGNATURE" title="Sending this for signature" prov="unknown">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Provider", value: <Pill tone="warning" dot>Not connected</Pill> },
              { label: "What this workspace can do", value: "Prepare the request, record the parties and the date somebody signed on paper" },
              { label: "What it cannot do", value: "Send a signing request, verify an identity or hold a certificate" },
            ]} />
            <Notice tone="warning" title="No e-signature provider is connected">
              A signature recorded here is somebody saying a document was signed. It carries no cryptographic evidence and would
              not stand as one on its own.
            </Notice>
            <Button variant="secondary" onClick={() => context.openOverlay("sign authorization")}>Prepare a signature request</Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (lens === "History") {
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Created", value: `${context.date(contract.createdAt)} by ${contract.createdBy}` },
          { label: "Last change", value: `${context.dateTime(contract.updatedAt)} by ${contract.updatedBy}` },
          { label: "Revision", value: <span className="ds-num">{String(contract.revision)}</span> },
          { label: "Stored versions", value: <span className="ds-num">{String(versions.length)}</span> },
        ]} />
        {versions.length > 0 && (
          <DataGrid
            rows={versions.map((version, index) => ({ ...version, id: `${contract.id}-v-${index}` }))}
            rowId={(row) => row.id}
            label="Stored versions"
            filterable={false}
            columns={[
              { key: "label", header: "Version", primary: true, cell: (row) => row.label },
              { key: "author", header: "From", cell: (row) => row.author },
              { key: "at", header: "Dated", align: "end", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
            ]}
          />
        )}
        {contract.history.length > 0 && (
          <DataGrid
            rows={contract.history.map((snapshot, index) => ({ ...snapshot, id: `${contract.id}-h-${index}` }))}
            rowId={(row) => row.id}
            label="Record history"
            filterable={false}
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
              { key: "status", header: "Status then", cell: (row) => <Pill tone={STATUS_TONE[row.status] ?? "neutral"}>{lifecycleLabel(row.status)}</Pill> },
              { key: "title", header: "Title then", cell: (row) => row.title, hideBelow: 1000 },
            ]}
          />
        )}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={12} eyebrow="LIFECYCLE" prov="human" title={contract.title} subtitle={`${String(contract.fields.counterparty ?? "")} · ${String(contract.fields.type ?? "")}`}>
        <Stack gap={4}>
          <Lifecycle status={contract.status} />
          <p>{contract.summary}</p>
        </Stack>
      </Card>
      <Card span={6} eyebrow="PARTIES" prov="posted" title="Parties and dates">
        <Properties rows={[
          { label: "Counterparty", value: String(contract.fields.counterparty ?? "") },
          { label: "Owner here", value: String(contract.fields.owner ?? contract.ownerName) },
          { label: "Runs", value: <span className="ds-num">{context.date(contract.startAt)} – {context.date(contract.endAt)}</span> },
          { label: "Notice period", value: <span className="ds-num">{String(contract.fields.noticeDays ?? 0)} days</span> },
          { label: "Value", value: <span className="ds-num">{contract.amountMinor ? context.money(contract.amountMinor) : "Not a fixed value"}</span> },
          { label: "Signed", value: contract.fields.signedAt ? <span className="ds-num">{context.date(String(contract.fields.signedAt))}</span> : "Not signed" },
        ]} />
        {days !== null && days <= 60 && days >= -1 && contract.status !== "archived" && (
          <Notice tone="warning" title={`This ends in ${days} days`}>
            Notice of {String(contract.fields.noticeDays ?? 0)} days is required, so the decision date has already passed if nobody has acted.
          </Notice>
        )}
      </Card>
      <Card span={6} eyebrow="CLAUSES" prov="human" title="Clause summary" subtitle={`${clauses.length} clauses, ${clauses.filter((clause) => clause.risk !== "standard").length} flagged`}>
        <Stack gap={3}>
          <Meter value={clauses.filter((clause) => clause.risk === "standard").length} max={Math.max(1, clauses.length)} label="Standard clauses" tone={clauses.some((clause) => clause.risk === "unusual") ? "warning" : "success"} />
          <Stack gap={2}>
            {clauses.filter((clause) => clause.risk !== "standard").map((clause) => (
              <Row key={clause.id} gap={2}>
                <Pill tone={clause.risk === "unusual" ? "danger" : "warning"}>{clause.risk}</Pill>
                <span className="ds-grow ds-truncate">{clause.title}</span>
              </Row>
            ))}
            {clauses.every((clause) => clause.risk === "standard") && <span className="ds-subtle">Every clause is in the standard form.</span>}
          </Stack>
          <Button size="sm" variant="secondary" onClick={() => context.setTab("Clauses")}>Read the clauses</Button>
        </Stack>
      </Card>
      <Card span={6} eyebrow="OBLIGATIONS" prov="human" title="Obligations from this contract" subtitle={`${obligations.length} tracked`}>
        {obligations.length === 0 ? <span className="ds-subtle">No obligation has been extracted from this contract yet.</span> : (
          <Stack gap={2}>
            {obligations.map((obligation) => (
              <Row key={obligation.id} gap={2}>
                <span className="ds-grow ds-truncate">{obligation.title}</span>
                <span className="ds-subtle ds-num">{context.date(obligation.dueAt, { day: "numeric", month: "short" })}</span>
                <Pill tone={obligation.status === "done" ? "success" : (daysUntil(obligation.dueAt, now) ?? 1) < 0 ? "danger" : "neutral"} dot>{obligation.status}</Pill>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
      <Card span={6} eyebrow="APPROVALS" prov="human" title="Where this sits">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Status", value: <Pill tone={STATUS_TONE[contract.status] ?? "neutral"} dot>{lifecycleLabel(contract.status)}</Pill> },
            { label: "Versions stored", value: <span className="ds-num">{String(versions.length)}</span> },
            { label: "Signatures recorded", value: <span className="ds-num">{String(signatures.length)}</span> },
          ]} />
          <Notice tone="info" title="Approving a step is not accepting the contract">
            A legal step recorded here says a named person reviewed something. Nothing in this workspace accepts a right or an
            obligation on behalf of {context.org.shortName}.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-004 · Policy Register
 * ------------------------------------------------------------------ */

export function PolicyRegister({ context, lens }: { context: ScreenContext; lens: "All" | "Due review" | "Draft" | "Published" }) {
  const data = useLegalData();
  const { now } = useWorkspace();
  const governance = data.policies.filter((policy) => policy.fields.kind === "governance" || !policy.fields.kind);
  const rows = lens === "Due review"
    ? governance.filter((policy) => (daysUntil(policy.dueAt, now) ?? 999) < 30)
    : lens === "Draft"
      ? governance.filter((policy) => policy.status === "draft")
      : lens === "Published"
        ? governance.filter((policy) => policy.status === "published")
        : governance;

  const staff = data.employees.filter((employee) => employee.status !== "alumni").length;

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} policies`} icon={<Gavel size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Policy editor")}>Create a policy</Button>} />
  ) : (
    <Stack gap={3}>
      {rows.map((policy) => {
        const days = daysUntil(policy.dueAt, now) ?? 999;
        const superseded = String(policy.fields.supersedes ?? "");
        return (
          <Card
            key={policy.id}
            eyebrow="POLICY"
            prov="human"
            title={policy.title}
            subtitle={`Version ${String(policy.fields.version ?? "1.0")} · ${String(policy.fields.audience ?? "All employees")} · review ${context.date(policy.dueAt)}`}
            actions={<Pill tone={days < 0 ? "danger" : policy.status === "draft" ? "neutral" : "success"} dot>{days < 0 ? "review overdue" : policy.status.replace("_", " ")}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(policy.id); context.openOverlay("Policy editor", { id: policy.id }); }}>Revise</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(policy.id); context.openOverlay("publication impact", { id: policy.id }); }}>What publishing does</Button>
              <span className="ds-grow" />
              {policy.fields.acknowledgementRequired === true && (
                <span className="ds-subtle"><span className="ds-num">{String(policy.fields.acknowledged ?? 0)}</span> of <span className="ds-num">{staff}</span> acknowledged</span>
              )}
            </>}
          >
            <Stack gap={3}>
              <p>{policy.summary}</p>
              {policy.fields.acknowledgementRequired === true && (
                <Meter value={Number(policy.fields.acknowledged ?? 0)} max={Math.max(1, staff)} label={`${policy.title} acknowledgements`} tone={Number(policy.fields.acknowledged ?? 0) >= staff ? "success" : undefined} />
              )}
              {superseded && (
                <Notice tone="info" title={`This supersedes version ${superseded}`}>
                  The earlier version is kept so a decision taken under it can still be read against the wording that applied then.
                </Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-005 · Obligation Calendar
 * ------------------------------------------------------------------ */

export function ObligationCalendar({ context, lens }: { context: ScreenContext; lens: "Calendar" | "Owner" | "Overdue" | "Completed" }) {
  const data = useLegalData();
  const { now, org } = useWorkspace();
  const [monthOffset, setMonthOffset] = useState(0);
  const month = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [now, monthOffset]);

  if (lens === "Overdue") {
    return <ObligationTable context={context} rows={data.obligations.filter((obligation) => obligation.status !== "done" && (daysUntil(obligation.dueAt, now) ?? 1) < 0)} empty="Nothing is overdue" />;
  }

  if (lens === "Completed") {
    return <ObligationTable context={context} rows={data.obligations.filter((obligation) => obligation.status === "done")} empty="Nothing has been completed yet" />;
  }

  if (lens === "Owner") {
    const owners = [...new Set(data.obligations.map((obligation) => String(obligation.fields.owner ?? obligation.ownerName)))];
    return (
      <Grid>
        {owners.map((owner) => {
          const theirs = data.obligations.filter((obligation) => String(obligation.fields.owner ?? obligation.ownerName) === owner);
          const late = theirs.filter((obligation) => obligation.status !== "done" && (daysUntil(obligation.dueAt, now) ?? 1) < 0);
          return (
            <Card
              key={owner}
              span={4}
              eyebrow="OWNER"
              prov="human"
              title={owner}
              subtitle={`${theirs.length} obligations`}
              actions={late.length ? <Pill tone="danger" dot><span className="ds-num">{late.length}</span> late</Pill> : <Pill tone="success" dot>Up to date</Pill>}
            >
              <Stack gap={2}>
                {theirs.slice(0, 5).map((obligation) => (
                  <Row key={obligation.id} gap={2}>
                    <span className="ds-grow ds-truncate">{obligation.title}</span>
                    <span className="ds-subtle ds-num">{context.date(obligation.dueAt, { day: "numeric", month: "short" })}</span>
                  </Row>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value - 1)}>Previous month</Button>
        <strong className="ds-grow" style={{ fontSize: "var(--text-lg)" }}>{context.date(first, { month: "long", year: "numeric" })}</strong>
        <Button size="sm" variant="ghost" onClick={() => setMonthOffset(0)}>This month</Button>
        <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value + 1)}>Next month</Button>
      </Row>

      <div className="lg-cal" role="grid" aria-label={`Obligations for ${context.date(first, { month: "long", year: "numeric" })}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="lg-cal-head" role="columnheader">{label}</div>
        ))}
        {days.map((day) => {
          const due = data.obligations.filter((obligation) => obligation.dueAt && new Date(obligation.dueAt).toDateString() === day.toDateString());
          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              className="lg-cal-day"
              data-outside={day.getMonth() !== first.getMonth() ? "true" : undefined}
              data-today={day.toDateString() === now.toDateString() ? "true" : undefined}
            >
              <button
                type="button"
                className="lg-cal-num"
                style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textAlign: "start" }}
                aria-label={`${context.date(day, { weekday: "long", day: "numeric", month: "long" })}, ${due.length} obligations due. Add one.`}
                onClick={() => context.openOverlay("Deadline editor", { date: day.toISOString().slice(0, 10) })}
              >
                {day.getDate()}
              </button>
              {due.map((obligation) => (
                <button
                  key={obligation.id}
                  type="button"
                  className="lg-ob"
                  data-state={obligation.status === "done" ? "done" : (daysUntil(obligation.dueAt, now) ?? 1) < 0 ? "overdue" : undefined}
                  title={`${obligation.title} · ${String(obligation.fields.owner ?? "")} · ${String(obligation.fields.jurisdiction ?? "")}`}
                  onClick={() => { context.select(obligation.id); context.openOverlay("Deadline editor", { id: obligation.id }); }}
                >
                  {obligation.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <Notice tone="info" title="Dates are absolute, and their jurisdiction is recorded">
        A deadline is stored as a date with the jurisdiction and time zone it belongs to. A relative rule such as “thirty days
        before renewal” is converted once, by a person, and the result is what the calendar shows — so a time zone never quietly
        moves a filing date.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/legal/obligations?tab=Overdue`)}>See what is overdue</Button>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-006 · Risk Register
 * ------------------------------------------------------------------ */

const BAND = (score: number) => (score >= 6 ? "high" : score >= 3 ? "medium" : "low");

export function RiskRegister({ context, lens }: { context: ScreenContext; lens: "All" | "High" | "Owned" | "Closed" }) {
  const data = useLegalData();
  const { actor } = useWorkspace();
  const rows = lens === "High"
    ? data.risks.filter((risk) => Number(risk.fields.score ?? 0) >= 6 && risk.status !== "closed")
    : lens === "Owned"
      ? data.risks.filter((risk) => risk.ownerName === actor || String(risk.fields.owner ?? "") === actor)
      : lens === "Closed"
        ? data.risks.filter((risk) => risk.status === "closed")
        : data.risks;

  const levels = ["low", "medium", "high"] as const;

  return (
    <Stack gap={5}>
      {lens === "All" && (
        <Card eyebrow="RISK MATRIX" prov="human" title="Impact against likelihood" subtitle="Every open risk placed by its recorded scores">
          <div className="lg-matrix">
            <div className="lg-matrix-axis">Impact ↓ / Likelihood →</div>
            {levels.map((likelihood) => <div key={likelihood} className="lg-matrix-axis">{likelihood}</div>)}
            {[...levels].reverse().map((impact) => (
              <div key={impact} style={{ display: "contents" }}>
                <div className="lg-matrix-axis">{impact}</div>
                {levels.map((likelihood) => {
                  const inCell = data.risks.filter((risk) => risk.status !== "closed" && risk.fields.impact === impact && risk.fields.likelihood === likelihood);
                  const score = ({ low: 1, medium: 2, high: 3 }[impact] ?? 1) * ({ low: 1, medium: 2, high: 3 }[likelihood] ?? 1);
                  return (
                    <div key={likelihood} className="lg-matrix-cell" data-band={BAND(score)}>
                      {inCell.map((risk) => (
                        <button
                          key={risk.id}
                          type="button"
                          className="lg-matrix-chip"
                          onClick={() => { context.select(risk.id); context.openOverlay("score rationale", { id: risk.id }); }}
                          title={risk.title}
                        >
                          {risk.title}
                        </button>
                      ))}
                      {inCell.length === 0 && <span className="ds-subtle">·</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty title={`No ${lens.toLowerCase()} risks`} icon={<ShieldAlert size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Risk form")}>Add a risk</Button>} />
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${lens} risks`}
          selectedId={context.selectedId}
          rowTone={(row) => (row.status === "closed" ? undefined : Number(row.fields.score ?? 0) >= 6 ? "danger" : Number(row.fields.score ?? 0) >= 3 ? "warning" : undefined)}
          columns={[
            { key: "title", header: "Risk", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.category ?? "")}` },
            { key: "category", header: "Category", cell: (row) => <Pill tone="neutral">{String(row.fields.category ?? "")}</Pill>, sortValue: (row) => String(row.fields.category ?? ""), hideBelow: 900 },
            { key: "impact", header: "Impact", cell: (row) => String(row.fields.impact ?? ""), hideBelow: 1100 },
            { key: "likelihood", header: "Likelihood", cell: (row) => String(row.fields.likelihood ?? ""), hideBelow: 1100 },
            { key: "score", header: "Score", align: "end", cell: (row) => <Pill tone={Number(row.fields.score ?? 0) >= 6 ? "danger" : Number(row.fields.score ?? 0) >= 3 ? "warning" : "neutral"}><span className="ds-num">{String(row.fields.score ?? 0)}</span></Pill>, sortValue: (row) => Number(row.fields.score ?? 0) },
            { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? row.ownerName), hideBelow: 1200 },
            { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "closed" ? "success" : row.status === "mitigating" ? "info" : "warning"} dot>{row.status}</Pill>, sortValue: (row) => row.status },
          ]}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => { context.select(id); context.openOverlay("score rationale", { id }); }}
        />
      )}

      {rows.some((risk) => risk.fields.aiSuggested === true) && (
        <Notice tone="warning" title="One of these was suggested by an AI employee">
          A suggested risk is a prompt for a person, not a rating. The score and the owner on the register are set by somebody
          accountable for the decision.
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-007 · Audit & Evidence
 * ------------------------------------------------------------------ */

export function Evidence({ context, lens }: { context: ScreenContext; lens: "Packs" | "Requests" | "Holds" | "Exports" }) {
  const data = useLegalData();
  const packs = data.documents.filter((document) => document.fields.kind === "evidencePack");
  const held = packs.filter((pack) => pack.fields.legalHold === true);

  if (lens === "Holds") {
    return held.length === 0 ? <Empty title="Nothing is under a legal hold" icon={<Archive size={20} />} /> : (
      <Stack gap={3}>
        {held.map((pack) => (
          <Card
            key={pack.id}
            eyebrow="LEGAL HOLD"
            prov="posted"
            title={pack.title}
            subtitle={`${String(pack.fields.items ?? 0)} items · assembled by ${String(pack.fields.assembledBy ?? pack.ownerName)}`}
            actions={<Pill tone="danger" dot>Held</Pill>}
            footer={<Button size="sm" variant="secondary" onClick={() => { context.select(pack.id); context.openOverlay("legal hold", { id: pack.id }); }}>Review the hold</Button>}
          >
            <Stack gap={2}>
              <p>{pack.summary}</p>
              <Notice tone="warning" title="A hold overrides the retention schedule">
                Nothing in this pack is deleted while the hold is on, and it cannot be exported until somebody with the authority
                lifts it.
              </Notice>
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Requests") {
    const requests = packs.filter((pack) => pack.title.toLowerCase().includes("request"));
    return requests.length === 0 ? (
      <Empty title="No outstanding requests" icon={<Archive size={20} />}>
        A request from an auditor, an insurer or a regulator is recorded here with what it asked for.
      </Empty>
    ) : (
      <Stack gap={3}>
        {requests.map((pack) => (
          <Card key={pack.id} eyebrow="REQUEST" prov="human" title={pack.title} subtitle={`${String(pack.fields.items ?? 0)} documents requested`}>
            <Stack gap={2}>
              <p>{pack.summary}</p>
              <Properties rows={[
                { label: "Exportable", value: pack.fields.exportable === true ? <Pill tone="success">Yes</Pill> : <Pill tone="danger">Blocked by a hold</Pill> },
              ]} />
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Exports") {
    return (
      <Stack gap={4}>
        <DataGrid
          rows={packs}
          rowId={(row) => row.id}
          label="Export permissions"
          filterable={false}
          columns={[
            { key: "title", header: "Pack", primary: true, cell: (row) => row.title },
            { key: "items", header: "Items", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.items ?? 0)}</span> },
            { key: "hold", header: "Hold", cell: (row) => (row.fields.legalHold === true ? <Pill tone="danger" dot>On</Pill> : <Pill tone="neutral">Off</Pill>) },
            { key: "export", header: "May be exported", align: "end", cell: (row) => (row.fields.exportable === true && context.can("export_data") ? <Pill tone="success" dot>Yes</Pill> : <Pill tone="warning" dot>No</Pill>) },
          ]}
        />
        <Notice tone={context.can("export_data") ? "info" : "warning"} title={context.can("export_data") ? "Your role view may export" : "This role view may not export"}>
          Export is refused for a pack under a legal hold whatever the role view says. Role views shape the interface and are not
          an account security boundary; everything here is in one browser database.
        </Notice>
      </Stack>
    );
  }

  return packs.length === 0 ? (
    <Empty title="No evidence packs" icon={<Archive size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Evidence detail")}>Assemble a pack</Button>} />
  ) : (
    <Grid>
      {packs.map((pack) => (
        <Card
          key={pack.id}
          span={6}
          eyebrow="EVIDENCE"
          prov="posted"
          title={pack.title}
          subtitle={`${String(pack.fields.items ?? 0)} items · assembled by ${String(pack.fields.assembledBy ?? pack.ownerName)}`}
          actions={pack.fields.legalHold === true ? <Pill tone="danger" dot>Held</Pill> : <Pill tone="success" dot>Assembled</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { context.select(pack.id); context.openOverlay("Evidence detail", { id: pack.id }); }}>Open</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(pack.id); context.openOverlay("export permissions", { id: pack.id }); }}>Export rules</Button>
          </>}
        >
          <Stack gap={3}>
            <p className="ds-subtle">{pack.summary}</p>
            <Properties rows={[
              { label: "Assembled", value: <span className="ds-num">{context.date(pack.at)}</span> },
              { label: "Content hash", value: <span className="ds-num">{String(pack.fields.hash ?? "Not computed")}</span> },
            ]} />
          </Stack>
        </Card>
      ))}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function ObligationQuickView({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useLegalData();
  const { now } = useWorkspace();
  const obligation = useRecord(payload?.id ?? context.selectedId) ?? data.obligations[0];
  if (!obligation) return <Empty title="No obligation" icon={<CalendarClock size={20} />} />;
  const contract = data.contracts.find((row) => row.id === obligation.fields.contractId);
  const days = daysUntil(obligation.dueAt, now) ?? 0;
  return (
    <Stack gap={4}>
      <h3>{obligation.title}</h3>
      <p className="ds-subtle">{obligation.summary}</p>
      <Properties rows={[
        { label: "Owner", value: String(obligation.fields.owner ?? obligation.ownerName) },
        { label: "Due", value: <span className="ds-num">{context.date(obligation.dueAt)}</span> },
        { label: "State", value: <Pill tone={obligation.status === "done" ? "success" : days < 0 ? "danger" : "neutral"} dot>{obligation.status === "done" ? "done" : days < 0 ? `${Math.abs(days)} days late` : `${days} days away`}</Pill> },
        { label: "Jurisdiction", value: `${String(obligation.fields.jurisdiction ?? "")} · ${String(obligation.fields.timezone ?? "")}` },
        { label: "Recurrence", value: String(obligation.fields.recurrence ?? "One-off") },
        { label: "From contract", value: contract?.title ?? "Not from a contract" },
      ]} />
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={obligation.status === "done"}
          onClick={async () => {
            await context.mutate.patch(obligation.id, { status: "done", fields: { ...obligation.fields, completedBy: context.actor, completedAt: new Date().toISOString() } }, { expectRevision: obligation.revision, event: `${obligation.title} completed by ${context.actor}` });
            context.toast("Marked complete", "The record changed, with your name and the date against it.");
          }}
        >
          Mark complete
        </Button>
        <Button variant="secondary" onClick={() => context.openOverlay("evidence upload", { id: obligation.id })}>Record evidence</Button>
      </Row>
    </Stack>
  );
}

export function DeadlineEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; date?: string } | undefined;
  const existing = useRecord(payload?.id ?? (payload?.date ? undefined : context.selectedId));
  const data = useLegalData();
  return (
    <form
      id="lg-deadline"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const date = String(form.get("due") ?? "");
        const fields = {
          kind: String(form.get("kind") ?? "compliance"),
          owner: String(form.get("owner") ?? context.actor),
          recurrence: String(form.get("recurrence") ?? "One-off"),
          jurisdiction: String(form.get("jurisdiction") ?? context.org.jurisdiction),
          timezone: context.org.timezone,
          contractId: String(form.get("contract") ?? ""),
          evidenceId: String(existing?.fields.evidenceId ?? ""),
          reminderDays: 14,
        };
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: String(form.get("title") ?? existing.title),
            summary: String(form.get("detail") ?? existing.summary),
            dueAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
            fields: { ...existing.fields, ...fields },
          }, { expectRevision: existing.revision, event: `${existing.title} rescheduled by ${context.actor}` });
        } else {
          await context.mutate.create({
            collection: "obligations",
            title: String(form.get("title") ?? "Obligation"),
            status: "upcoming",
            summary: String(form.get("detail") ?? ""),
            dueAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
            at: new Date().toISOString(),
            fields,
          }, `Obligation created by ${context.actor}`);
        }
        context.toast("Obligation saved", "It is on the calendar with its jurisdiction and time zone recorded.");
        close();
      }}
    >
      <Field label="Obligation" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="What has to happen"><TextArea name="detail" rows={3} defaultValue={existing?.summary ?? ""} /></Field>
      <Row gap={3}>
        <Field label="Due" required><TextInput name="due" type="date" defaultValue={payload?.date ?? (existing?.dueAt ?? "").slice(0, 10)} required /></Field>
        <Field label="Recurrence">
          <Select name="recurrence" defaultValue={String(existing?.fields.recurrence ?? "One-off")}>
            {["One-off", "Monthly", "Quarterly", "Half-yearly", "Annual"].map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
      </Row>
      <Row gap={3}>
        <Field label="Owner">
          <Select name="owner" defaultValue={String(existing?.fields.owner ?? context.actor)}>
            {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id}>{employee.title}</option>)}
          </Select>
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue={String(existing?.fields.kind ?? "compliance")}>
            {["filing", "compliance", "contract", "insurance", "privacy"].map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
      </Row>
      <Row gap={3}>
        <Field label="Jurisdiction" hint="The date is stored absolutely, in this jurisdiction's time zone.">
          <Select name="jurisdiction" defaultValue={String(existing?.fields.jurisdiction ?? context.org.jurisdiction)}>
            {["GB", "US-NY", "FR", "DE", "IE"].map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
        <Field label="From contract">
          <Select name="contract" defaultValue={String(existing?.fields.contractId ?? "")}>
            <option value="">Not from a contract</option>
            {data.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}
          </Select>
        </Field>
      </Row>
      <Notice tone="info" title="No reminder leaves this browser">
        The obligation appears on the calendar and on the overview. Nothing emails anybody, because no mail provider is connected.
      </Notice>
    </form>
  );
}

export function ScoreRationale({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const risk = useRecord(payload?.id ?? context.selectedId);
  if (!risk) return <Empty title="Select a risk" icon={<ShieldAlert size={20} />} />;
  const scoreOf = (value: string) => ({ low: 1, medium: 2, high: 3 }[value] ?? 1);
  return (
    <form
      id="lg-score"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const impact = String(form.get("impact") ?? "low");
        const likelihood = String(form.get("likelihood") ?? "low");
        await context.mutate.patch(risk.id, {
          summary: String(form.get("why") ?? risk.summary),
          fields: {
            ...risk.fields, impact, likelihood, score: scoreOf(impact) * scoreOf(likelihood),
            aiSuggested: false, reviewedAt: new Date().toISOString().slice(0, 10), scoredBy: context.actor,
          },
        }, { expectRevision: risk.revision, event: `${risk.title} scored by ${context.actor}` });
        context.toast("Score recorded", `${risk.title} is scored by ${context.actor}, with the reasoning on the record.`);
        close();
      }}
    >
      <h3>{risk.title}</h3>
      <p className="ds-subtle">{risk.summary}</p>
      <Row gap={3}>
        <Field label="Impact"><Select name="impact" defaultValue={String(risk.fields.impact ?? "medium")}>{["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Likelihood"><Select name="likelihood" defaultValue={String(risk.fields.likelihood ?? "medium")}>{["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      </Row>
      <Field label="Why this score" required hint="A score without a reason cannot be argued with later.">
        <TextArea name="why" rows={4} defaultValue={risk.summary} required />
      </Field>
      <Properties rows={[
        { label: "Current score", value: <span className="ds-num">{String(risk.fields.score ?? 0)}</span> },
        { label: "Mitigation on record", value: String(risk.fields.mitigation ?? "None") },
        { label: "Control", value: String(risk.fields.control ?? "None") },
      ]} />
      {risk.fields.aiSuggested === true && (
        <Notice tone="warning" title="This risk was suggested by an AI employee">
          Saving a score here makes a named person accountable for it, and clears the suggested flag.
        </Notice>
      )}
    </form>
  );
}
