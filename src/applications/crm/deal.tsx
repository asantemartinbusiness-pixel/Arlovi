import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Users } from "lucide-react";
import {
  Avatar, Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, Meter,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { ACTIVITY_LABEL, STAGES, activitiesFor, activityKind, probabilityOf, stageGuard, stageIndex, stageOf } from "@/domain/crm-pipeline";
import { documentTotals, readLines, statusFor, writeLines } from "@/domain/fin-invoice";
import {
  companyOfDeal, contactOfDeal, contactsOfCompany, invoicesOfDeal, quotesOfDeal, ticketsOfContact, useCrmData,
} from "./data";
import type { CrmData } from "./data";
import { ActivityPill, CapabilityNotice, ConsentPill, Money, ProbabilityPill, QuoteStatusPill, StagePill } from "./parts";
import { quoteTotals } from "./quotes";
import { useStageMove } from "./pipeline";

/* ---------------------------- CRM-007 ---------------------------- *
 * Deal detail: a real 360 built from linked records — activities, quotes,
 * invoices, contacts, tickets and the audit trail — not a summary string.
 * ------------------------------------------------------------------ */

export function useDeal(context: ScreenContext): { deal?: Rec; data: CrmData } {
  const data = useCrmData();
  const fromRoute = useRecord(context.params.id);
  const deal = fromRoute?.collection === "deals" ? fromRoute : data.deals.find((item) => item.id === context.selectedId) ?? data.deals[0];
  return { deal, data };
}

export function DealHeader({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  if (!deal) return null;
  const company = companyOfDeal(data, deal);
  const contact = contactOfDeal(data, deal);
  const stage = stageOf(deal);
  return (
    <Card flush>
      <div className="ds-card-body">
        <Row gap={4} wrap>
          <div className="ds-grow">
            <Row gap={2}>
              <h2 style={{ fontSize: "var(--text-xl)" }}>{deal.title}</h2>
              <StagePill deal={deal} />
              <ProbabilityPill deal={deal} />
            </Row>
            <p className="ds-subtle">{deal.summary}</p>
            <Row gap={3} wrap style={{ marginBlockStart: "var(--space-2)" }}>
              {company && <Link to={`/o/${context.org.slug}/crm/companies?tab=All`} style={{ color: "inherit" }}>{company.title}</Link>}
              {contact && <Link to={`/o/${context.org.slug}/crm/contacts/${contact.id}`} style={{ color: "inherit" }}>{contact.title}</Link>}
              <span className="ds-subtle">Owner {String(deal.fields.owner ?? deal.ownerName)}</span>
            </Row>
          </div>
          <Properties rows={[
            { label: "Expected close", value: deal.fields.closeDate ? context.date(String(deal.fields.closeDate)) : "Not set" },
            { label: "Created", value: context.date(deal.createdAt) },
            { label: "Last change", value: context.relative(deal.updatedAt) },
          ]} />
          <div style={{ textAlign: "end" }}>
            <span className="ds-stat-label">Amount</span>
            <div className="ds-stat-value">{context.money(Number(deal.amountMinor ?? 0))}</div>
            <span className="ds-subtle">Weighted {context.money(Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100))}</span>
          </div>
        </Row>
      </div>
    </Card>
  );
}

export function DealOverview({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  const { org, now } = useWorkspace();
  if (!deal) return <Empty title="No deal selected" />;

  const contact = contactOfDeal(data, deal);
  const company = companyOfDeal(data, deal);
  const quotes = quotesOfDeal(data, deal.id);
  const invoices = invoicesOfDeal(data, deal);
  const activities = activitiesFor(data.activities, deal.id);
  const tickets = ticketsOfContact(data, contact?.id);
  const stage = stageOf(deal);
  const next = STAGES[Math.min(STAGES.length - 1, stageIndex(stage.id) + 1)];
  const guard = stageGuard(deal, next);
  const open = activities.filter((activity) => activity.status === "open");
  const lastTouch = activities[0];

  return (
    <Grid>
      <Card span={4} title="Progress" subtitle={`${stage.label} at ${probabilityOf(deal)}%`}>
        <Stack gap={3}>
          <Meter value={stageIndex(stage.id) + 1} max={STAGES.length} label={`${deal.title} stage`} tone={stage.kind === "lost" ? "danger" : stage.kind === "won" ? "success" : undefined} />
          <Properties rows={[
            { label: "Next stage", value: stage.kind === "open" ? next.label : "Closed" },
            { label: "Blocked by", value: guard ?? "Nothing" },
            { label: "Last activity", value: lastTouch ? `${context.relative(lastTouch.startAt ?? lastTouch.at)} · ${lastTouch.title}` : "None logged" },
            { label: "Open follow-ups", value: String(open.length) },
          ]} />
          {guard
            ? <Notice tone="warning" title="This deal cannot advance yet">{guard}</Notice>
            : stage.kind === "open" && <Notice tone="success" title={`Ready for ${next.label}`}>Everything {stage.label} requires is recorded.</Notice>}
        </Stack>
      </Card>

      <Card span={4} title="People" subtitle={company ? `${contactsOfCompany(data, company.id).length} contacts at ${company.title}` : "No account linked"}>
        {contact ? (
          <Stack gap={3}>
            <Row gap={3}>
              <Avatar name={contact.title} />
              <div className="ds-grow">
                <Link to={`/o/${org.slug}/crm/contacts/${contact.id}`} style={{ fontWeight: 600, color: "inherit" }}>{contact.title}</Link>
                <p className="ds-subtle">{String(contact.fields.role ?? "")} · {String(contact.fields.email ?? "")}</p>
              </div>
            </Row>
            <ConsentPill contact={contact} />
            {company && contactsOfCompany(data, company.id).filter((item) => item.id !== contact.id).length > 0 && (
              <Stack gap={2}>
                <span className="ds-stat-label">Others at this account</span>
                {contactsOfCompany(data, company.id).filter((item) => item.id !== contact.id).map((item) => (
                  <Row key={item.id} gap={2}>
                    <Avatar name={item.title} size="sm" />
                    <Link to={`/o/${org.slug}/crm/contacts/${item.id}`} className="ds-grow" style={{ color: "inherit" }}>{item.title}</Link>
                    <span className="ds-subtle">{String(item.fields.role ?? "")}</span>
                  </Row>
                ))}
              </Stack>
            )}
            {contactsOfCompany(data, company?.id).length <= 1 && (
              <Notice tone="warning" title="Only one contact is recorded">
                A single contact is a risk on a deal this size. Add the other people involved so the account is not held by one relationship.
              </Notice>
            )}
          </Stack>
        ) : (
          <Empty title="No contact linked">Discovery requires a named contact before the deal can advance.</Empty>
        )}
      </Card>

      <Card span={4} title="Money" subtitle="Quotes and invoices that actually exist">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Deal amount", value: <Money minor={deal.amountMinor} context={context} bold /> },
            { label: "Quoted", value: quotes.length ? <Money minor={quotes.reduce((sum, quote) => sum + Number(quote.amountMinor ?? 0), 0)} context={context} /> : "No quote" },
            { label: "Invoiced", value: invoices.length ? <Money minor={invoices.reduce((sum, invoice) => sum + Number(invoice.amountMinor ?? 0), 0)} context={context} /> : "No invoice" },
          ]} />
          {quotes.length > 0 && quotes.some((quote) => Number(quote.amountMinor ?? 0) !== Number(deal.amountMinor ?? 0)) && (
            <Notice tone="info" title="The quote and the deal amount differ">
              The deal says {context.money(Number(deal.amountMinor ?? 0))} and the latest quote says {context.money(Number(quotes[0].amountMinor ?? 0))}. The quote is the priced document.
            </Notice>
          )}
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Quote builder", { dealId: deal.id })}>
              {quotes.length ? "New version" : "Build a quote"}
            </Button>
            {invoices.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/fin/invoices/${invoices[0].id}`)}>Open the invoice</Button>
            )}
          </Row>
        </Stack>
      </Card>

      <Card span={6} title="Recent activity" subtitle={`${activities.length} logged`} flush>
        {activities.length === 0 ? (
          <div className="ds-card-body"><Empty title="Nothing logged on this deal">A call, meeting or note recorded here is what the stage requirements are judged on.</Empty></div>
        ) : (
          <DataGrid
            rows={activities.slice(0, 8)}
            rowId={(row) => row.id}
            label="Deal activity"
            filterable={false}
            columns={[
              { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.date(row.startAt ?? row.at)}</span> },
              { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} /> },
              { key: "title", header: "What", primary: true, cell: (row) => row.title },
              { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "done" ? "success" : row.status === "draft" ? "warning" : "info"}>{row.status}</Pill> },
            ]}
            onOpen={() => context.navigate(`/o/${org.slug}/crm/activities`)}
          />
        )}
      </Card>

      <Card span={6} title="Service history" subtitle={contact ? `${tickets.length} tickets for ${contact.title}` : "No contact linked"}>
        {tickets.length === 0 ? (
          <span className="ds-subtle">No support ticket is recorded for this customer.</span>
        ) : (
          <Stack gap={2}>
            {tickets.map((ticket) => (
              <Row key={ticket.id} gap={3}>
                <span className="ds-grow ds-truncate">{ticket.title}</span>
                <Pill tone={ticket.status === "open" ? "warning" : "neutral"}>{ticket.status}</Pill>
              </Row>
            ))}
          </Stack>
        )}
        {deal.fields.campaignId && (
          <Notice tone="info" title="Attributed to a campaign">
            {data.campaigns.find((campaign) => campaign.id === String(deal.fields.campaignId))?.title ?? String(deal.fields.campaignId)} is recorded as the source of this deal.
          </Notice>
        )}
      </Card>

      {deal.fields.lostReason && (
        <div className="ds-col-12">
          <Notice tone="danger" title={`Closed lost: ${String(deal.fields.lostReason)}`}>
            Recorded by {String(deal.fields.lostBy ?? deal.updatedBy)} on {context.date(String(deal.fields.lostAt ?? deal.updatedAt))}. {deal.summary}
          </Notice>
        </div>
      )}
      {stageOf(deal).kind === "won" && (
        <div className="ds-col-12">
          <Notice tone="success" title="Closed won">
            {invoices.length > 0
              ? `${invoices[0].title} was created from this deal, so the amount has a document behind it.`
              : "No invoice is linked. A closed-won deal without a document is a number nobody can collect."}
          </Notice>
        </div>
      )}
      <div className="ds-col-12">{now && <span className="ds-sr-only">as at {context.date(now)}</span>}</div>
    </Grid>
  );
}

export function DealActivity({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  const events = useEvents(deal?.id, 60);
  if (!deal) return <Empty title="No deal selected" />;
  const activities = activitiesFor(data.activities, deal.id);

  return (
    <Grid>
      <Card span={7} title="Logged activity" subtitle={`${activities.length} calls, meetings, emails and notes`} flush>
        {activities.length === 0 ? (
          <div className="ds-card-body"><Empty title="Nothing logged yet" /></div>
        ) : (
          <DataGrid
            rows={activities}
            rowId={(row) => row.id}
            label="Activity on this deal"
            columns={[
              { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt ?? row.at)}</span>, sortValue: (row) => row.startAt ?? row.at ?? "" },
              { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} />, filterValue: (row) => activityKind(row) },
              { key: "title", header: "What", primary: true, cell: (row) => (
                <span>
                  {row.title}
                  <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{row.summary}</span>
                </span>
              ), filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "outcome", header: "Outcome", hideBelow: 1200, cell: (row) => row.fields.outcome ? String(row.fields.outcome) : <span className="ds-subtle">—</span> },
              { key: "owner", header: "Who", cell: (row) => String(row.fields.owner ?? row.ownerName) },
            ]}
          />
        )}
      </Card>
      <Card span={5} title="Record history" subtitle={`Revision ${deal.revision}`}>
        {events.length === 0 ? <span className="ds-subtle">No event recorded against this deal yet.</span> : (
          <ol className="ds-stack ds-gap-3">
            {events.map((event) => (
              <li key={event.id}>
                <Row gap={3} style={{ alignItems: "flex-start" }}>
                  <span className="ds-num ds-subtle" style={{ width: 130, flex: "none" }}>{context.dateTime(event.at)}</span>
                  <div className="ds-grow">
                    <strong>{event.message}</strong>
                    <span className="ds-subtle" style={{ display: "block" }}>{event.actor}</span>
                  </div>
                </Row>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Grid>
  );
}

export function DealProducts({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  const { org, now } = useWorkspace();
  if (!deal) return <Empty title="No deal selected" />;
  const quotes = quotesOfDeal(data, deal.id);
  const latest = quotes[0];
  const totals = latest ? quoteTotals(data, latest, org.jurisdiction, now) : undefined;

  if (!latest || !totals) {
    return (
      <Empty title="No quote, so no priced lines" action={<Button variant="primary" onClick={() => context.openOverlay("Quote builder", { dealId: deal.id })}>Build a quote</Button>}>
        Products and prices live on a quote, where tax is resolved per line. A deal carries only the amount.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Quote" value={String(latest.fields.number ?? latest.title)} meta={`Version ${String(latest.fields.version ?? 1)} · ${latest.status}`} />
        <Stat label="Net" value={context.money(totals.netMinor)} />
        <Stat label="Tax" value={context.money(totals.taxMinor)} meta={totals.byCode.map((group) => group.code.code).join(", ")} />
        <Stat label="Total" value={context.money(totals.grossMinor)} meta={totals.discountMinor ? `After ${context.money(totals.discountMinor)} discount` : "No discount"} />
      </StatRow>
      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Quoted lines</caption>
            <thead><tr><th>Line</th><th data-align="end">Qty</th><th data-align="end">Unit</th><th data-align="end">Disc</th><th>Code</th><th data-align="end">Net</th><th data-align="end">Tax</th><th data-align="end">Gross</th></tr></thead>
            <tbody>
              {totals.lines.map((line) => (
                <tr key={line.id} data-tone={line.taxCode.code === "UNKNOWN" ? "danger" : undefined}>
                  <td className="ds-table-primary">{line.description}</td>
                  <td data-align="end"><span className="ds-num">{line.quantity}</span></td>
                  <td data-align="end"><Money minor={line.unitPriceMinor} context={context} /></td>
                  <td data-align="end"><span className="ds-num">{line.discountBp ? `${(line.discountBp / 100).toFixed(1)}%` : "—"}</span></td>
                  <td><Pill tone={line.taxCode.code === "UNKNOWN" ? "danger" : "info"}>{line.taxCode.code}</Pill></td>
                  <td data-align="end"><Money minor={line.netMinor} context={context} /></td>
                  <td data-align="end"><Money minor={line.taxMinor} context={context} /></td>
                  <td data-align="end"><Money minor={line.grossMinor} context={context} bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Row gap={2}>
        <Button variant="secondary" onClick={() => context.openOverlay("Quote builder", { id: latest.id })}>Edit the quote</Button>
        <Button variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/quotes`)}>All quotes</Button>
      </Row>
    </Stack>
  );
}

export function DealDocuments({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  const { org } = useWorkspace();
  if (!deal) return <Empty title="No deal selected" />;
  const quotes = quotesOfDeal(data, deal.id);
  const invoices = invoicesOfDeal(data, deal);
  const threads = data.threads.filter((thread) => String(thread.fields.dealId ?? "") === deal.id);

  return (
    <Grid>
      <Card span={6} title="Quotes" subtitle={`${quotes.length} version${quotes.length === 1 ? "" : "s"}`} flush>
        {quotes.length === 0 ? (
          <div className="ds-card-body"><Empty title="No quote yet" action={<Button variant="primary" onClick={() => context.openOverlay("Quote builder", { dealId: deal.id })}>Build one</Button>} /></div>
        ) : (
          <DataGrid
            rows={quotes}
            rowId={(row) => row.id}
            label="Quotes on this deal"
            filterable={false}
            columns={[
              { key: "number", header: "Quote", primary: true, cell: (row) => String(row.fields.number ?? row.title) },
              { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)}</span> },
              { key: "status", header: "Status", cell: (row) => <QuoteStatusPill status={row.status} /> },
              { key: "amount", header: "Total", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold /> },
            ]}
            onOpen={(id) => context.openOverlay("Quote builder", { id })}
          />
        )}
      </Card>
      <Card span={6} title="Invoices" subtitle={`${invoices.length} linked`} flush>
        {invoices.length === 0 ? (
          <div className="ds-card-body">
            <Empty title="No invoice linked">
              Closing this deal as won creates a real invoice record in Finance, linked both ways. A won deal with no document is just a status string.
            </Empty>
          </div>
        ) : (
          <DataGrid
            rows={invoices}
            rowId={(row) => row.id}
            label="Invoices from this deal"
            filterable={false}
            columns={[
              { key: "number", header: "Invoice", primary: true, cell: (row) => row.title },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "paid" ? "success" : row.status === "draft" ? "neutral" : "info"} dot>{row.status.replace(/_/g, " ")}</Pill> },
              { key: "due", header: "Due", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span> },
              { key: "amount", header: "Gross", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold /> },
            ]}
            onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
          />
        )}
      </Card>
      <Card span={12} title="Correspondence" subtitle={`${threads.length} local drafts`}>
        <Stack gap={2}>
          {threads.map((thread) => (
            <Row key={thread.id} gap={3}>
              <span className="ds-grow">{thread.title}</span>
              <Pill tone="warning">Not sent</Pill>
            </Row>
          ))}
          {threads.length === 0 && <span className="ds-subtle">No message thread is recorded against this deal.</span>}
        </Stack>
        <CapabilityNotice id="email.send" />
      </Card>
    </Grid>
  );
}

export function DealTeam({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  if (!deal) return <Empty title="No deal selected" />;
  const collaborators = ((deal.body as { collaborators?: { name: string; role: string }[] })?.collaborators) ?? [];
  const owner = String(deal.fields.owner ?? deal.ownerName);
  const activityPeople = [...new Set(activitiesFor(data.activities, deal.id).map((activity) => String(activity.fields.owner ?? activity.ownerName)))];

  return (
    <Grid>
      <Card span={6} title="Who is on this deal" subtitle={`${collaborators.length + 1} named people`}>
        <Stack gap={3}>
          <Row gap={3}>
            <Avatar name={owner} />
            <div className="ds-grow"><strong>{owner}</strong><p className="ds-subtle">Owner</p></div>
            <Pill tone="accent">Owner</Pill>
          </Row>
          {collaborators.map((person) => (
            <Row key={person.name} gap={3}>
              <Avatar name={person.name} size="sm" />
              <div className="ds-grow"><strong>{person.name}</strong><p className="ds-subtle">{person.role}</p></div>
            </Row>
          ))}
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("collaborator picker")}>Add a collaborator</Button>
        </Stack>
      </Card>
      <Card span={6} title="Who has actually touched it" subtitle="From logged activity, not from the team list">
        {activityPeople.length === 0 ? (
          <Empty title="Nobody has logged anything" icon={<Users size={20} />} />
        ) : (
          <Stack gap={2}>
            {activityPeople.map((person) => {
              const count = activitiesFor(data.activities, deal.id).filter((activity) => String(activity.fields.owner ?? activity.ownerName) === person).length;
              return (
                <Row key={person} gap={3}>
                  <Avatar name={person} size="sm" />
                  <span className="ds-grow">{person}</span>
                  <span className="ds-subtle">{count} {count === 1 ? "activity" : "activities"}</span>
                </Row>
              );
            })}
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

/* --------------------------- Overlays --------------------------- */

export function CollaboratorPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { deal, data } = useDeal(context);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Specification");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="No deal selected" />;
  const collaborators = ((deal.body as { collaborators?: { name: string; role: string }[] })?.collaborators) ?? [];

  return (
    <Stack gap={4}>
      <Field label="Person" required>
        <Select value={name} onChange={(event) => setName(event.target.value)}>
          <option value="">Choose someone</option>
          {data.members.filter((member) => member.fields.kind !== "ai").map((member) => <option key={member.id} value={member.title}>{member.title} · {String(member.fields.title ?? "")}</option>)}
        </Select>
      </Field>
      <Field label="Their part"><TextInput value={role} onChange={(event) => setRole(event.target.value)} /></Field>
      {collaborators.length > 0 && (
        <Properties rows={collaborators.map((person) => ({ label: person.name, value: person.role }))} />
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!name || collaborators.some((person) => person.name === name)}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(deal.id, {
              body: { ...(deal.body as object ?? {}), collaborators: [...collaborators, { name, role }] },
            }, { expectRevision: deal.revision, event: `${name} added to ${deal.title} as ${role}` });
            context.toast("Collaborator added", `${name} is on ${deal.title}. They are not notified: no mail provider is connected.`);
            setBusy(false);
            close();
          }}
        >
          Add to the deal
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/**
 * Closing a deal as won creates the real linked records: a quote if none
 * exists, and a draft invoice in Finance priced through the tax engine.
 */
export function ClosureConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const { deal, data } = useDeal(context);
  const { org, now } = useWorkspace();
  const move = useStageMove(context);
  const [createInvoice, setCreateInvoice] = useState("yes");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="No deal selected" />;

  const quotes = quotesOfDeal(data, deal.id);
  const latest = quotes.find((quote) => quote.status === "accepted") ?? quotes[0];
  const contact = contactOfDeal(data, deal);
  const existingInvoices = invoicesOfDeal(data, deal);
  const wonStage = STAGES.find((stage) => stage.kind === "won")!;
  const guard = stageGuard(deal, wonStage);

  const lines = latest ? readLines(latest) : [];
  const totals = documentTotals({
    lines: lines.length ? lines : [{ id: "l1", description: deal.title, quantity: 1, unitPriceMinor: Number(deal.amountMinor ?? 0), taxCategory: "standard" }],
    jurisdiction: org.jurisdiction,
    customerStatus: statusFor(latest, contact),
    date: now.toISOString().slice(0, 10),
  });

  if (stageOf(deal).kind === "won") {
    return (
      <Stack gap={4}>
        <Notice tone="success" title="This deal is already closed won">
          {existingInvoices.length ? `${existingInvoices[0].title} is linked to it.` : "No invoice is linked yet."}
        </Notice>
        {existingInvoices.length > 0 && (
          <Button variant="secondary" onClick={() => { close(); context.navigate(`/o/${org.slug}/fin/invoices/${existingInvoices[0].id}`); }}>Open the invoice</Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone={guard ? "danger" : "info"} title={guard ? "This deal cannot be closed won yet" : "Closing won creates real records"}>
        {guard ?? "A won deal gets a draft invoice in Finance, linked both ways, priced line by line through the tax engine. A status alone would leave nothing to collect."}
      </Notice>
      <Properties rows={[
        { label: "Deal", value: deal.title },
        { label: "Amount", value: <Money minor={deal.amountMinor} context={context} bold /> },
        { label: "Customer", value: contact?.title ?? "No contact linked" },
        { label: "Quote used for pricing", value: latest ? `${String(latest.fields.number ?? latest.title)} (${latest.status})` : "None, the deal amount is used as a single line" },
        { label: "Invoice net", value: <Money minor={totals.netMinor} context={context} /> },
        { label: "Invoice tax", value: <Money minor={totals.taxMinor} context={context} /> },
        { label: "Invoice gross", value: <Money minor={totals.grossMinor} context={context} bold /> },
        { label: "Resolved codes", value: totals.byCode.map((group) => group.code.code).join(", ") || "None" },
      ]} />
      {totals.hasUnknownRate && (
        <Notice tone="warning" title="A line has no approved tax rate">
          The invoice will be created as a draft with the line held as UNKNOWN. Finance cannot approve it until the combination is approved, which is deliberate.
        </Notice>
      )}
      <Field label="Create the invoice">
        <Select value={createInvoice} onChange={(event) => setCreateInvoice(event.target.value)}>
          <option value="yes">Yes, create a draft invoice in Finance</option>
          <option value="no">No, I will raise it myself</option>
        </Select>
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(guard) || !context.can("edit_pipeline")}
          title={guard}
          onClick={async () => {
            setBusy(true);
            let invoiceId: string | undefined;
            if (createInvoice === "yes") {
              const numbers = data.invoices.map((invoice) => Number(/(\d+)/.exec(String(invoice.fields.number ?? invoice.title))?.[1] ?? 0));
              const number = `INV-${Math.max(1000, ...numbers) + 1}`;
              const invoice = await context.mutate.create({
                collection: "invoices",
                title: number,
                status: "draft",
                summary: `Raised from the won deal ${deal.title}.`,
                amountMinor: totals.grossMinor,
                at: now.toISOString(),
                dueAt: new Date(now.getTime() + 21 * 86_400_000).toISOString(),
                parentId: contact?.id,
                tags: ["draft", "from-deal"],
                fields: {
                  number,
                  contactId: contact?.id ?? "",
                  dealId: deal.id,
                  quoteId: latest?.id ?? "",
                  netMinor: totals.netMinor,
                  taxMinor: totals.taxMinor,
                  customerTaxStatus: statusFor(latest, contact),
                  taxUnresolved: totals.hasUnknownRate,
                },
                body: writeLines(totals.lines),
              }, `Invoice ${number} drafted from the won deal ${deal.title}`);
              invoiceId = invoice.id;
            }
            if (latest && latest.status !== "accepted") {
              await context.mutate.patch(latest.id, { status: "accepted", fields: { ...latest.fields, acceptedAt: now.toISOString() } }, { event: `Quote ${latest.title} accepted` });
            }
            await context.mutate.patch(deal.id, {
              status: "won",
              fields: {
                ...deal.fields,
                stage: "won",
                probability: 100,
                wonAt: now.toISOString(),
                wonBy: context.actor,
                ...(invoiceId ? { invoiceId } : {}),
              },
            }, { expectRevision: deal.revision, event: `${deal.title} closed won${invoiceId ? " with a linked draft invoice" : ""}` });
            context.toast(
              "Deal closed won",
              invoiceId
                ? `A draft invoice for ${context.money(totals.grossMinor)} is in Finance and linked to this deal. It is not on the ledger until Finance approves it.`
                : `${deal.title} is closed won. No invoice was created, so nothing is receivable yet.`,
            );
            setBusy(false);
            close();
            if (invoiceId) context.navigate(`/o/${org.slug}/fin/invoices/${invoiceId}`);
          }}
        >
          <CheckCircle2 size={15} aria-hidden="true" /> Close won
        </Button>
        <Button
          variant="outline-danger"
          busy={busy}
          onClick={() => { close(); context.openOverlay("lost reason", { id: deal.id }); }}
        >
          Close lost instead
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
      <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        {stageOf(deal).label} → {wonStage.label}. {move ? "" : ""}The same stage validation runs here as on the board.
      </span>
    </Stack>
  );
}

export function RequestApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const { deal, data } = useDeal(context);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="No deal selected" />;
  const quotes = quotesOfDeal(data, deal.id);
  const needsApproval = quotes.filter((quote) => quote.fields.discountApproval);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="An approval request is a record">
        It appears on the approvals list for whoever holds the Owner view. Nobody is notified, because no mail provider is connected.
      </Notice>
      <Properties rows={[
        { label: "Deal", value: deal.title },
        { label: "Amount", value: <Money minor={deal.amountMinor} context={context} bold /> },
        { label: "Quotes needing a discount approval", value: String(needsApproval.length) },
      ]} />
      <Field label="What you are asking for" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!note.trim()}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "approvals",
              title: `Approval for ${deal.title}`,
              status: "pending",
              summary: note,
              amountMinor: deal.amountMinor,
              fields: { kind: "deal", recordId: deal.id, raisedBy: context.actor },
            }, `Approval requested on ${deal.title}`);
            context.toast("Approval requested", "It is on the approvals list. Nothing has been sent.");
            setBusy(false);
            close();
          }}
        >
          Request the approval
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function DealInspector({ context }: { context: ScreenContext }) {
  const { deal, data } = useDeal(context);
  const { org } = useWorkspace();
  if (!deal) return <Empty title="No deal" />;
  const stage = stageOf(deal);
  const next = STAGES[Math.min(STAGES.length - 1, stageIndex(stage.id) + 1)];
  const guard = stageGuard(deal, next);
  const invoices = invoicesOfDeal(data, deal);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Stage", value: <StagePill deal={deal} /> },
        { label: "Weighting", value: <ProbabilityPill deal={deal} /> },
        { label: "Weighted value", value: <Money minor={Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100)} context={context} bold /> },
        { label: "Owner", value: String(deal.fields.owner ?? deal.ownerName) },
        { label: "Revision", value: String(deal.revision) },
      ]} />
      {guard
        ? <Notice tone="warning" title={`Cannot reach ${next.label}`}>{guard}</Notice>
        : stage.kind === "open" && <Pill tone="success" dot>Ready for {next.label}</Pill>}
      <Stack gap={2}>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Quote builder", { dealId: deal.id })}>Build a quote</Button>
        {invoices.length > 0 && <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/fin/invoices/${invoices[0].id}`)}>Open the invoice</Button>}
        <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/deals`)}>Back to the board</Button>
      </Stack>
      {activitiesFor(data.activities, deal.id).length === 0 && (
        <Notice tone="warning" title="Nothing is logged on this deal">
          With no call, meeting or note recorded, there is no evidence behind its stage.
        </Notice>
      )}
      <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        {ACTIVITY_LABEL.call}s, meetings and notes are counted from the activity records linked to this deal.
      </span>
    </Stack>
  );
}
