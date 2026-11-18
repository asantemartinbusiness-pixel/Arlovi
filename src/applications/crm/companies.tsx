import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Inbox, Target } from "lucide-react";
import {
  Avatar, Button, Card, DataGrid, Empty, Field, Grid, Meter, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import { LOST_REASONS, activitiesFor, scoreLead, stageOf } from "@/domain/crm-pipeline";
import type { LeadScore } from "@/domain/crm-pipeline";
import {
  companyById, contactById, contactsOfCompany, dealsOfCompany, invoicesOfContact, useCrmData,
} from "./data";
import type { CrmData } from "./data";
import { ActivityPill, ConsentPill, Money, StagePill } from "./parts";
import { clockIso } from "@/platform/clock";
import { AccountProfileView, accountHref } from "./account";

/* ---------------------------- CRM-004 ---------------------------- */

const COMPANY_TABS: Record<string, (company: Rec) => boolean> = {
  All: () => true,
  Active: (company) => company.status === "active",
  Prospects: (company) => company.status === "prospect",
  Archived: (company) => company.status === "archived",
};

function companyValue(data: CrmData, company: Rec): { openMinor: number; wonMinor: number; openCount: number } {
  const deals = dealsOfCompany(data, company.id);
  return {
    openMinor: deals.filter((deal) => stageOf(deal).kind === "open").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
    wonMinor: deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
    openCount: deals.filter((deal) => stageOf(deal).kind === "open").length,
  };
}

export function CompaniesTable({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const accountId = params.get("account");
  const rows = useMemo(
    () => data.companies.filter((company) => (COMPANY_TABS[tab] ?? (() => true))(company)),
    [data.companies, tab],
  );
  const totals = rows.reduce((sum, company) => sum + companyValue(data, company).openMinor, 0);
  const openAccount = (id: string) => {
    context.select(id);
    const next = new URLSearchParams(params);
    next.set("account", id);
    setParams(next);
  };
  const closeAccount = useCallback(() => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("account");
      return next;
    }, { replace: true });
  }, [setParams]);

  if (accountId) return <AccountProfileView context={context} companyId={accountId} onBack={closeAccount} />;

  if (rows.length === 0) {
    return (
      <Empty title={`No ${tab.toLowerCase()} accounts`} icon={<Building2 size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Account editor")}>New account</Button>}>
        An account groups contacts, deals and the invoices behind them.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label={tab} value={String(rows.length)} meta={`${data.companies.length} accounts in total`} prov="human" />
        <Stat label="Open opportunity" value={context.money(totals)} meta="Open deals on these accounts" prov="human" />
        <Stat label="Contacts" value={String(rows.reduce((sum, company) => sum + contactsOfCompany(data, company.id).length, 0))} prov="human" />
        <Stat
          label="Accounts with one contact"
          value={String(rows.filter((company) => contactsOfCompany(data, company.id).length === 1).length)}
          meta="Single-threaded relationships"
          prov="human"
        />
      </StatRow>

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} accounts`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.status === "archived" ? "warning" : undefined)}
        columns={[
          { key: "name", header: "Account", primary: true, cell: (row) => <Link to={accountHref(org.slug, row.id)} onClick={(event) => event.stopPropagation()} style={{ color: "inherit", fontWeight: 600 }}>{row.title}</Link>, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "industry", header: "Industry", cell: (row) => String(row.fields.industry ?? "—"), filterValue: (row) => String(row.fields.industry ?? "") },
          { key: "city", header: "Location", hideBelow: 1200, cell: (row) => String(row.fields.city ?? "—") },
          { key: "contacts", header: "Contacts", align: "end", cell: (row) => <span className="ds-num">{contactsOfCompany(data, row.id).length}</span> },
          { key: "deals", header: "Open deals", align: "end", cell: (row) => <span className="ds-num">{companyValue(data, row).openCount}</span> },
          { key: "owner", header: "Owner", hideBelow: 1400, cell: (row) => String(row.fields.owner ?? row.ownerName) },
          { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "active" ? "success" : row.status === "prospect" ? "info" : "neutral"} dot>{row.status}</Pill> },
          { key: "won", header: "Won", align: "end", hideBelow: 1400, cell: (row) => <Money minor={companyValue(data, row).wonMinor} context={context} /> },
          { key: "open", header: "Open value", align: "end", cell: (row) => <Money minor={companyValue(data, row).openMinor} context={context} bold />, sortValue: (row) => companyValue(data, row).openMinor },
        ]}
        onOpen={(id) => openAccount(id)}
        bulkActions={[
          { label: "Export", onRun: (selected) => exportCompanies(context, data, selected) },
        ]}
        summary={<Money minor={totals} context={context} bold />}
      />

      <Grid>
        {rows.slice(0, 6).map((company) => {
          const value = companyValue(data, company);
          const contacts = contactsOfCompany(data, company.id);
          return (
            <Card
              key={company.id}
              span={4}
              eyebrow="ACCOUNT"
              prov="human"
              title={company.title}
              subtitle={company.summary}
              actions={<Pill tone={company.status === "active" ? "success" : "info"}>{company.status}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => openAccount(company.id)}>Open the account</Button>
                <Button size="sm" variant="ghost" onClick={() => { context.select(company.id); context.openOverlay("relationship inspector", { id: company.id }); }}>Relationships</Button>
                <Button size="sm" variant="ghost" onClick={() => { context.select(company.id); context.openOverlay("Account editor", { id: company.id }); }}>Edit</Button>
              </>}
            >
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Industry", value: String(company.fields.industry ?? "Not recorded") },
                  { label: "Open deals", value: <Money minor={value.openMinor} context={context} bold /> },
                  { label: "Won to date", value: <Money minor={value.wonMinor} context={context} /> },
                ]} />
                <Row gap={1} wrap>
                  {contacts.slice(0, 6).map((contact) => (
                    <Link key={contact.id} to={`/o/${org.slug}/crm/contacts/${contact.id}`} title={contact.title}>
                      <Avatar name={contact.title} size="sm" />
                    </Link>
                  ))}
                  {contacts.length === 0 && <span className="ds-subtle">No contact recorded</span>}
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

export function exportCompanies(context: ScreenContext, data: CrmData, rows: Rec[]): void {
  const header = "account,industry,city,status,owner,contacts,open_deals,open_value_minor,won_value_minor\n";
  const body = rows.map((company) => {
    const value = companyValue(data, company);
    return [company.title, String(company.fields.industry ?? ""), String(company.fields.city ?? ""), company.status,
      String(company.fields.owner ?? company.ownerName), contactsOfCompany(data, company.id).length, value.openCount, value.openMinor, value.wonMinor]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",");
  }).join("\n");
  downloadFile(`${context.org.slug}-accounts.csv`, header + body, "text/csv");
  context.toast("Exported", `${rows.length} accounts written to a CSV file in this browser.`);
}

export function AccountEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const company = existing?.collection === "companies" ? existing : undefined;
  const [title, setTitle] = useState(company?.title ?? "");
  const [industry, setIndustry] = useState(String(company?.fields.industry ?? ""));
  const [city, setCity] = useState(String(company?.fields.city ?? ""));
  const [status, setStatus] = useState(company?.status ?? "prospect");
  const [owner, setOwner] = useState(String(company?.fields.owner ?? context.actor));
  const [summary, setSummary] = useState(company?.summary ?? "");
  const [busy, setBusy] = useState(false);
  const duplicate = data.companies.some((item) => item.title.trim().toLowerCase() === title.trim().toLowerCase() && item.id !== company?.id);

  return (
    <form
      id="account-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        setBusy(true);
        const fields = { industry, city, owner };
        if (company) {
          await context.mutate.patch(company.id, { title: title.trim(), status, summary, fields: { ...company.fields, ...fields } }, { expectRevision: company.revision, event: `Account ${title.trim()} updated` });
          context.toast("Account saved", `${title.trim()} is ${status}.`);
        } else {
          const created = await context.mutate.create({
            collection: "companies", title: title.trim(), status, summary,
            fields: { ...fields, customerSince: clockIso().slice(0, 10) },
          }, `Account ${title.trim()} created`);
          context.select(created.id);
          context.toast("Account created", `${created.title} can now hold contacts and deals.`);
        }
        setBusy(false);
        close();
      }}
    >
      <Field label="Account name" required><TextInput aria-label="Account name" value={title} invalid={duplicate} onChange={(event) => setTitle(event.target.value)} required /></Field>
      {duplicate && <Notice tone="danger" title="An account with that name exists">Merging later is harder than naming it correctly now.</Notice>}
      <Row gap={3} wrap>
        <Field label="Industry"><TextInput aria-label="Industry" value={industry} onChange={(event) => setIndustry(event.target.value)} /></Field>
        <Field label="Location"><TextInput aria-label="Location" value={city} onChange={(event) => setCity(event.target.value)} /></Field>
        <Field label="State">
          <Select aria-label="State" value={status} onChange={(event) => setStatus(event.target.value)}>
            {["prospect", "active", "archived"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Owner"><TextInput aria-label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
      </Row>
      <Field label="What they do"><TextArea aria-label="What they do" value={summary} rows={3} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!title.trim() || duplicate}>{company ? "Save the account" : "Create the account"}</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </form>
  );
}

export function RelationshipInspector({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const company = companyById(data, payload?.id ?? context.selectedId);
  if (!company) return <Empty title="Select an account first" />;

  const contacts = contactsOfCompany(data, company.id);
  const deals = dealsOfCompany(data, company.id);
  const invoices = contacts.flatMap((contact) => invoicesOfContact(data, contact.id));
  const activities = contacts.flatMap((contact) => activitiesFor(data.activities, contact.id))
    .concat(deals.flatMap((deal) => activitiesFor(data.activities, deal.id)));
  const unique = [...new Map(activities.map((activity) => [activity.id, activity])).values()]
    .sort((a, b) => (b.startAt ?? b.at ?? "").localeCompare(a.startAt ?? a.at ?? ""));

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Account", value: company.title },
        { label: "Industry", value: String(company.fields.industry ?? "Not recorded") },
        { label: "Owner", value: String(company.fields.owner ?? company.ownerName) },
        { label: "Customer since", value: company.fields.customerSince ? context.date(String(company.fields.customerSince)) : context.date(company.createdAt) },
        { label: "Contacts", value: String(contacts.length) },
        { label: "Deals", value: String(deals.length) },
        { label: "Invoices", value: String(invoices.length) },
      ]} />

      {contacts.length === 1 && (
        <Notice tone="warning" title="This account is single-threaded">
          Everything depends on {contacts[0].title}. Record the other people involved so the relationship is not one conversation deep.
        </Notice>
      )}

      <Card eyebrow="PEOPLE" prov="human" title="Who we know" subtitle={`${contacts.length} contacts`}>
        <Stack gap={2}>
          {contacts.map((contact) => (
            <Row key={contact.id} gap={3}>
              <Avatar name={contact.title} size="sm" />
              <Link to={`/o/${org.slug}/crm/contacts/${contact.id}`} className="ds-grow" style={{ color: "inherit" }}>{contact.title}</Link>
              <span className="ds-subtle">{String(contact.fields.role ?? "")}</span>
              <ConsentPill contact={contact} />
            </Row>
          ))}
          {contacts.length === 0 && <span className="ds-subtle">No contact is linked to this account.</span>}
        </Stack>
      </Card>

      <Card eyebrow="PIPELINE" prov="human" title="Deals" subtitle={`${deals.length} recorded`}>
        <Stack gap={2}>
          {deals.map((deal) => (
            <Row key={deal.id} gap={3}>
              <Link to={`/o/${org.slug}/crm/deals/${deal.id}`} className="ds-grow" style={{ color: "inherit" }}>{deal.title}</Link>
              <StagePill deal={deal} />
              <Money minor={deal.amountMinor} context={context} />
            </Row>
          ))}
          {deals.length === 0 && <span className="ds-subtle">No deal on this account.</span>}
        </Stack>
      </Card>

      <Card eyebrow="LEDGER" prov="posted" title="Invoices" subtitle="From Finance, by the contacts at this account">
        <Stack gap={2}>
          {invoices.map((invoice) => (
            <Row key={invoice.id} gap={3}>
              <Link to={`/o/${org.slug}/fin/invoices/${invoice.id}`} className="ds-grow" style={{ color: "inherit" }}>{invoice.title}</Link>
              <Pill tone={invoice.status === "paid" ? "success" : "info"} dot>{invoice.status.replace(/_/g, " ")}</Pill>
              <Money minor={invoice.amountMinor} context={context} />
            </Row>
          ))}
          {invoices.length === 0 && <span className="ds-subtle">Nothing has been invoiced to this account.</span>}
        </Stack>
      </Card>

      <Card eyebrow="HISTORY" prov="human" title="Conversation history" subtitle={`${unique.length} activities across the account`}>
        <Stack gap={2}>
          {unique.slice(0, 10).map((activity) => (
            <Row key={activity.id} gap={3}>
              <span className="ds-num ds-subtle" style={{ width: 92 }}>{context.date(activity.startAt ?? activity.at)}</span>
              <ActivityPill activity={activity} />
              <span className="ds-grow ds-truncate">{activity.title}</span>
            </Row>
          ))}
          {unique.length === 0 && <span className="ds-subtle">Nothing logged against this account.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}

export function CompanyMergePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const [leftId, setLeftId] = useState(context.selectedId ?? data.companies[0]?.id ?? "");
  const [rightId, setRightId] = useState(data.companies[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const left = companyById(data, leftId);
  const right = companyById(data, rightId);

  if (!left || !right) return <Empty title="Two accounts are needed to merge" />;

  const conflicts = (["industry", "city", "owner"] as const)
    .filter((field) => left.fields[field] && right.fields[field] && left.fields[field] !== right.fields[field])
    .map((field) => ({ field, left: String(left.fields[field]), right: String(right.fields[field]) }));

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A merge keeps every source id and every conflict">
        Nothing is silently dropped. The kept account records which ids it absorbed, and any field the two disagree on is listed below and kept as a note.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Keep">
          <Select aria-label="Keep" value={leftId} onChange={(event) => setLeftId(event.target.value)}>
            {data.companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
          </Select>
        </Field>
        <Field label="Merge in">
          <Select aria-label="Merge in" value={rightId} onChange={(event) => setRightId(event.target.value)}>
            {data.companies.filter((company) => company.id !== leftId).map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
          </Select>
        </Field>
      </Row>
      <Properties rows={[
        { label: "Contacts moving", value: String(contactsOfCompany(data, right.id).length) },
        { label: "Deals moving", value: String(dealsOfCompany(data, right.id).length) },
        { label: "Conflicting fields", value: conflicts.length ? conflicts.map((item) => item.field).join(", ") : "None" },
        { label: "Source ids kept", value: `${left.id}, ${right.id}` },
      ]} />
      {conflicts.length > 0 && (
        <Card eyebrow="CONFLICTS" prov="human" title="Where the two records disagree">
          <Stack gap={2}>
            {conflicts.map((item) => (
              <Row key={item.field} gap={3}>
                <span className="ds-grow">{item.field}</span>
                <Pill tone="success">{item.left}</Pill>
                <span className="ds-subtle">against</span>
                <Pill tone="warning">{item.right}</Pill>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = { ...left.fields };
            for (const [field, value] of Object.entries(right.fields)) {
              if (fields[field] === undefined || fields[field] === "") fields[field] = value;
            }
            fields.mergedFrom = right.id;
            if (conflicts.length > 0) fields.mergeConflicts = conflicts.map((item) => `${item.field}: kept ${item.left}, discarded ${item.right}`).join("; ");
            await context.mutate.patch(left.id, { fields }, { expectRevision: left.revision, event: `Account ${right.title} merged into ${left.title}` });
            for (const contact of contactsOfCompany(data, right.id)) {
              await context.mutate.patch(contact.id, { fields: { ...contact.fields, companyId: left.id } }, { event: `${contact.title} moved to ${left.title}` });
            }
            for (const deal of dealsOfCompany(data, right.id)) {
              await context.mutate.patch(deal.id, { parentId: left.id, fields: { ...deal.fields, companyId: left.id } }, { event: `${deal.title} moved to ${left.title}` });
            }
            await context.mutate.patch(right.id, { status: "merged", fields: { ...right.fields, mergedInto: left.id } }, { event: `${right.title} marked merged` });
            context.toast("Accounts merged", `${right.title} is marked merged and its records now point at ${left.title}. Both ids are kept.`);
            setBusy(false);
            close();
          }}
        >
          Merge into {left.title}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- CRM-005 ---------------------------- */

const LEAD_TABS: Record<string, (lead: Rec) => boolean> = {
  Inbox: (lead) => ["new", "working"].includes(lead.status),
  Qualified: (lead) => lead.status === "qualified",
  Disqualified: (lead) => lead.status === "disqualified",
};

function leadScoreOf(data: CrmData, lead: Rec, now: Date): LeadScore {
  return scoreLead(lead, {
    contact: contactById(data, String(lead.fields.contactId ?? "")),
    company: companyById(data, String(lead.fields.companyId ?? "")),
    activities: activitiesFor(data.activities, lead.id),
    now,
  });
}

export function LeadsBoard({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useCrmData();
  const { now } = useWorkspace();

  if (tab === "Rules") {
    return <RoutingRules context={context} />;
  }

  const rows = data.leads.filter((lead) => (LEAD_TABS[tab] ?? (() => true))(lead));

  if (rows.length === 0) {
    return <Empty title={`No ${tab.toLowerCase()} leads`} icon={<Inbox size={20} />}>Leads arrive from the website form, the showroom and referrals.</Empty>;
  }

  const scored = rows.map((lead) => ({ lead, score: leadScoreOf(data, lead, now) }))
    .sort((a, b) => b.score.total - a.score.total);
  const bands = ["hot", "warm", "cold"] as const;

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label={tab} value={String(rows.length)} meta={`${data.leads.length} leads in total`} prov="human" />
        <Stat label="Recorded value" value={context.money(rows.reduce((sum, lead) => sum + Number(lead.amountMinor ?? 0), 0))} meta="Not a forecast: nothing is weighted" prov="human" />
        <Stat label="Unassigned" value={String(rows.filter((lead) => !lead.fields.owner).length)} meta="Nobody is working them" prov="human" />
        <Stat label="No contact record" value={String(rows.filter((lead) => !lead.fields.contactId).length)} meta="Cannot be converted as they are" prov="unknown" />
      </StatRow>

      <Notice tone="info" title="The score is arithmetic you can argue with">
        Each factor adds a fixed number of points from a recorded field: value, source, consent, linked account, logged activity and age. No model is involved, and the factors are shown on every lead.
      </Notice>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(240px, 1fr))", gap: "var(--space-3)", overflowX: "auto", alignItems: "start" }}>
        {bands.map((band) => {
          const inBand = scored.filter((entry) => entry.score.band === band);
          return (
            <section key={band} className="ds-panel" style={{ padding: "var(--space-3)" }} aria-label={`${band} leads`}>
              <Row gap={2} style={{ marginBlockEnd: "var(--space-3)" }}>
                <strong className="ds-grow" style={{ textTransform: "capitalize" }}>{band}</strong>
                <Pill tone={band === "hot" ? "success" : band === "warm" ? "info" : "neutral"}>{inBand.length}</Pill>
              </Row>
              <Stack gap={2}>
                {inBand.map(({ lead, score }) => (
                  <button
                    key={lead.id}
                    type="button"
                    className="ds-record-card"
                    aria-selected={lead.id === context.selectedId}
                    onClick={() => { context.select(lead.id); context.openOverlay("Qualification inspector", { id: lead.id }); }}
                  >
                    <Row gap={2}>
                      <strong className="ds-grow" style={{ textAlign: "start" }}>{lead.title}</strong>
                      <Pill tone={band === "hot" ? "success" : band === "warm" ? "info" : "neutral"}>{score.total}</Pill>
                    </Row>
                    <span className="ds-subtle" style={{ textAlign: "start" }}>{String(lead.fields.source ?? "no source")} · {lead.fields.owner ? String(lead.fields.owner) : "unassigned"}</span>
                    <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                      <Money minor={lead.amountMinor} context={context} bold />
                      <span className="ds-grow" />
                      <span className="ds-subtle">{context.relative(lead.createdAt)}</span>
                    </Row>
                    <Meter value={score.total} max={100} label={`${lead.title} score`} tone={band === "hot" ? "success" : band === "cold" ? "warning" : undefined} />
                  </button>
                ))}
                {inBand.length === 0 && <span className="ds-subtle">Nothing in this band.</span>}
              </Stack>
            </section>
          );
        })}
      </div>

      <DataGrid
        rows={scored}
        rowId={(row) => row.lead.id}
        label={`${tab} leads`}
        columns={[
          { key: "title", header: "Lead", primary: true, cell: (row) => row.lead.title, filterValue: (row) => `${row.lead.title} ${row.lead.summary}` },
          { key: "source", header: "Source", cell: (row) => <Pill tone="neutral">{String(row.lead.fields.source ?? "unknown")}</Pill>, filterValue: (row) => String(row.lead.fields.source ?? "") },
          { key: "score", header: "Score", align: "end", cell: (row) => <span className="ds-num">{row.score.total}</span>, sortValue: (row) => row.score.total },
          { key: "owner", header: "Owner", cell: (row) => row.lead.fields.owner ? String(row.lead.fields.owner) : <Pill tone="warning">Unassigned</Pill> },
          { key: "contact", header: "Contact", cell: (row) => contactById(data, String(row.lead.fields.contactId ?? ""))?.title ?? <span className="ds-subtle">None</span> },
          { key: "age", header: "Age", align: "end", cell: (row) => <span className="ds-num">{Math.floor((now.getTime() - new Date(row.lead.createdAt).getTime()) / 86_400_000)}d</span> },
          { key: "amount", header: "Value", align: "end", cell: (row) => <Money minor={row.lead.amountMinor} context={context} bold />, sortValue: (row) => Number(row.lead.amountMinor ?? 0) },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("Qualification inspector", { id }); }}
        bulkActions={[
          {
            label: "Route to me",
            onRun: async (selected) => {
              let routed = 0;
              let skipped = 0;
              for (const row of selected) {
                const contact = contactById(data, String(row.lead.fields.contactId ?? ""));
                if (contact?.fields.suppressed === true) { skipped += 1; continue; }
                await context.mutate.patch(row.lead.id, { fields: { ...row.lead.fields, owner: context.actor } }, { event: `Lead ${row.lead.title} routed to ${context.actor}` });
                routed += 1;
              }
              context.toast(routed ? "Leads routed" : "Nothing routed",
                `${routed} assigned to ${context.actor}. ${skipped} skipped because the contact is suppressed.`,
                skipped && !routed ? "blocked" : "ok");
            },
          },
        ]}
      />
    </Stack>
  );
}

function RoutingRules({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const rules = data.workflows.filter((workflow) => String(workflow.fields.trigger ?? "").startsWith("lead"));
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A routing rule only ever assigns an owner and raises a task">
        No rule in this workspace contacts a customer. Outreach to a suppressed or unconsenting contact is refused at the point of sending, not left to a rule.
      </Notice>
      <Grid>
        <Card span={6} eyebrow="RULES" prov="human" title="Lead rules" subtitle={`${rules.length} defined`}>
          <Stack gap={3}>
            {rules.map((rule) => (
              <Row key={rule.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow">
                  <strong>{rule.title}</strong>
                  <p className="ds-subtle">{rule.summary}</p>
                </div>
                <Pill tone={rule.status === "active" ? "success" : "neutral"} dot>{rule.status}</Pill>
              </Row>
            ))}
            {rules.length === 0 && <span className="ds-subtle">No lead routing rule is defined.</span>}
          </Stack>
        </Card>
        <Card span={6} eyebrow="OWNERS" prov="human" title="Who can take a lead" subtitle="Availability is recorded, not guessed">
          <Stack gap={2}>
            {data.owners.map((owner) => (
              <Row key={owner} gap={3}>
                <Avatar name={owner} size="sm" />
                <span className="ds-grow">{owner}</span>
                <span className="ds-subtle">{data.leads.filter((lead) => String(lead.fields.owner ?? "") === owner).length} leads</span>
              </Row>
            ))}
          </Stack>
          <Notice tone="warning" title="Availability cannot be checked here">
            No calendar is connected, so a rule cannot know who is away. Routing goes by workload, which is counted above.
          </Notice>
        </Card>
      </Grid>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/crm/automation`)}>Open Sales Automation</Button>
    </Stack>
  );
}

export function QualificationInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const lead = data.leads.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(LOST_REASONS[0]);
  if (!lead) return <Empty title="Select a lead first" />;

  const score = leadScoreOf(data, lead, now);
  const contact = contactById(data, String(lead.fields.contactId ?? ""));
  const company = companyById(data, String(lead.fields.companyId ?? ""));
  const blockedReason = !contact
    ? "This lead has no contact record, so there is nobody to convert it against."
    : contact.fields.suppressed === true
      ? `${contact.title} is suppressed and must not be contacted.`
      : undefined;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Lead", value: lead.title },
        { label: "Source", value: String(lead.fields.source ?? "Not recorded") },
        { label: "Recorded value", value: <Money minor={lead.amountMinor} context={context} bold /> },
        { label: "Owner", value: lead.fields.owner ? String(lead.fields.owner) : "Unassigned" },
        { label: "Contact", value: contact?.title ?? "None" },
        { label: "Account", value: company?.title ?? "None" },
        { label: "Age", value: `${Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / 86_400_000)} days` },
      ]} />

      <Card eyebrow="SCORE" prov="human" title={`${score.total} of 100, ${score.band}`} subtitle="Every point is attributed to a recorded field">
        <Stack gap={2}>
          {score.factors.map((factor) => (
            <Row key={factor.label} gap={3}>
              <span style={{ width: 110 }}>{factor.label}</span>
              <span className="ds-num" style={{ width: 40, textAlign: "end" }}>{factor.points}</span>
              <span className="ds-subtle ds-grow">{factor.detail}</span>
            </Row>
          ))}
        </Stack>
        <Notice tone="info" title="What this score cannot tell you">
          It rewards a recorded value, a warm source and logged contact. It cannot judge fit, and a cold score is a reason to look rather than to discard.
        </Notice>
      </Card>

      {blockedReason && <Notice tone="danger" title="This lead cannot be converted">{blockedReason}</Notice>}

      <Row gap={2} wrap>
        <Button
          variant="primary"
          busy={busy}
          disabled={lead.status === "qualified" || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(lead.id, {
              status: "qualified",
              fields: { ...lead.fields, stage: "qualified", qualifiedBy: context.actor, score: score.total },
            }, { expectRevision: lead.revision, event: `Lead ${lead.title} qualified with a score of ${score.total}` });
            context.toast("Lead qualified", `${lead.title} is qualified. Converting it creates a deal linked to the contact and the account.`);
            setBusy(false);
          }}
        >
          Qualify
        </Button>
        <Button
          variant="secondary"
          busy={busy}
          disabled={Boolean(blockedReason) || lead.status === "disqualified"}
          title={blockedReason}
          onClick={() => context.openOverlay("convert dialog", { id: lead.id })}
        >
          Convert to a deal
        </Button>
        <Button
          variant="outline-danger"
          busy={busy}
          disabled={lead.status === "disqualified"}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(lead.id, {
              status: "disqualified",
              fields: { ...lead.fields, stage: "disqualified", disqualifiedReason: reason, disqualifiedBy: context.actor },
            }, { expectRevision: lead.revision, event: `Lead ${lead.title} disqualified: ${reason}` });
            context.toast("Lead disqualified", `${lead.title} stays on the record with its reason, which is what makes a source worth analysing.`, "blocked");
            setBusy(false);
            close();
          }}
        >
          Disqualify
        </Button>
        <Field label="Reason if disqualifying">
          <Select aria-label="Reason if disqualifying" value={reason} onChange={(event) => setReason(event.target.value)}>
            {["Below the trade minimum", "No contactable detail", ...LOST_REASONS].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
      </Row>
    </Stack>
  );
}

/** Converting a lead creates a real deal record linked to the contact and account. */
export function ConvertDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const lead = data.leads.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [amount, setAmount] = useState(Number(lead?.amountMinor ?? 0));
  const [owner, setOwner] = useState(String(lead?.fields.owner ?? context.actor));
  const [withQuote, setWithQuote] = useState("yes");
  const [busy, setBusy] = useState(false);
  if (!lead) return <Empty title="Select a lead first" />;

  const contact = contactById(data, String(lead.fields.contactId ?? ""));
  const company = companyById(data, String(lead.fields.companyId ?? ""));
  const blocked = !contact
    ? "A lead needs a contact record before it can become a deal."
    : contact.fields.suppressed === true
      ? `${contact.title} is suppressed.`
      : amount <= 0
        ? "Give the deal an amount, or it is excluded from every forecast figure."
        : undefined;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Conversion creates records, not a status">
        A deal record is created and linked to the contact and the account, and the lead keeps a pointer to it. Optionally a draft quote is created at the same amount so the deal can advance past Proposal.
      </Notice>
      <Properties rows={[
        { label: "Lead", value: lead.title },
        { label: "Contact", value: contact?.title ?? "None" },
        { label: "Account", value: company?.title ?? "None, the deal will have no account" },
      ]} />
      <Row gap={3} wrap>
        <Field label="Deal amount"><MoneyInput label="Deal amount" currency={context.org.currency} valueMinor={amount} onChangeMinor={setAmount} /></Field>
        <Field label="Owner"><TextInput aria-label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
        <Field label="Also create a draft quote">
          <Select aria-label="Also create a draft quote" value={withQuote} onChange={(event) => setWithQuote(event.target.value)}>
            <option value="yes">Yes, one line at the deal amount</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </Row>
      {blocked && <Notice tone="danger" title="This lead cannot be converted">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("edit_pipeline")}
          title={blocked}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = {
              stage: "qualified", probability: 40, owner, leadId: lead.id, budgetConfirmed: false,
            };
            if (contact) fields.contactId = contact.id;
            if (company) fields.companyId = company.id;
            const deal = await context.mutate.create({
              collection: "deals",
              title: lead.title,
              status: "qualified",
              summary: `Converted from the ${String(lead.fields.source ?? "unknown")} lead ${lead.title}.`,
              amountMinor: amount,
              at: now.toISOString(),
              parentId: company?.id,
              fields,
            }, `Deal created from lead ${lead.title}`);

            let quoteId: string | undefined;
            if (withQuote === "yes") {
              const numbers = data.quotes.map((quote) => Number(/(\d+)/.exec(String(quote.fields.number ?? quote.title))?.[1] ?? 0));
              const number = `Q-${Math.max(100, ...numbers) + 1}`;
              const quote = await context.mutate.create({
                collection: "quotes",
                title: `${number} ${lead.title}`,
                status: "draft",
                summary: `Draft quote created when the lead ${lead.title} was converted.`,
                amountMinor: amount,
                at: now.toISOString(),
                dueAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
                parentId: deal.id,
                fields: {
                  number, dealId: deal.id, contactId: contact?.id ?? "", version: 1,
                  netMinor: amount, taxMinor: 0, customerTaxStatus: String(contact?.fields.taxStatus ?? "domestic"),
                },
                body: { lines: [{ id: "l1", description: lead.title, quantity: 1, unitPriceMinor: amount, taxCategory: "standard", discountBp: 0 }] },
              }, `Quote ${number} drafted from the converted lead`);
              quoteId = quote.id;
              await context.mutate.patch(deal.id, { fields: { ...fields, quoteId } }, { event: `Quote ${number} linked to ${deal.title}` });
            }

            await context.mutate.patch(lead.id, {
              status: "qualified",
              fields: { ...lead.fields, stage: "converted", dealId: deal.id, convertedBy: context.actor, convertedAt: now.toISOString() },
            }, { expectRevision: lead.revision, event: `Lead ${lead.title} converted to a deal` });

            context.toast("Lead converted", quoteId
              ? `${deal.title} is in Qualified with a draft quote attached, so it can advance past Proposal.`
              : `${deal.title} is in Qualified. It will need a quote before it can advance past Proposal.`);
            setBusy(false);
            close();
            context.navigate(`/o/${context.org.slug}/crm/deals/${deal.id}`);
          }}
        >
          <Target size={15} aria-hidden="true" /> Convert to a deal
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function RoutingRulesOverlay({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <RoutingRules context={context} />
    </Stack>
  );
}

export function LeadsStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const open = data.leads.filter((lead) => ["new", "working"].includes(lead.status));
  const hot = open.filter((lead) => leadScoreOf(data, lead, now).band === "hot");
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{open.length} in the inbox</Pill>
      <Pill tone={hot.length ? "success" : "neutral"} dot>{hot.length} hot</Pill>
      <span>Recorded value <Money minor={open.reduce((sum, lead) => sum + Number(lead.amountMinor ?? 0), 0)} context={context} bold /></span>
      <span className="ds-grow" />
      <span className="ds-subtle">A lead value is what someone typed, not a forecast.</span>
    </Row>
  );
}
