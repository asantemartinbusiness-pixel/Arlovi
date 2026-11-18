import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";
import "./account.css";
import {
  Avatar, Button, Card, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { stageOf } from "@/domain/crm-pipeline";
import { companyById, useCrmData } from "./data";
import { ConsentPill, Money, StagePill } from "./parts";
import { CHAIN_STEPS, accountProfile, invoiceOutstanding } from "./accountProfile";
import type { DealChain, TimelineGroup } from "./accountProfile";

/* ---------------------- CRM-004 account profile ---------------------- */

/** The address of one account's page inside the Companies screen. */
export function accountHref(orgSlug: string, companyId: string): string {
  return `/o/${orgSlug}/crm/companies?tab=All&account=${encodeURIComponent(companyId)}`;
}

const TIMELINE_FILTERS: { value: "all" | TimelineGroup; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "conversation", label: "Conversations" },
  { value: "pipeline", label: "Pipeline" },
  { value: "finance", label: "Finance" },
];

function ChainSteps({ chain }: { chain: DealChain }) {
  if (chain.step === "lost") return <Pill tone="danger" dot>Closed lost</Pill>;
  const reached = CHAIN_STEPS.findIndex((step) => step.id === chain.step);
  return (
    <ol className="crm-chain" aria-label={`${chain.deal.title}: ${CHAIN_STEPS[reached]?.label ?? ""} reached`}>
      {CHAIN_STEPS.map((step, index) => {
        const skipped = step.id === "lead" && !chain.lead;
        const state = skipped ? "skipped" : index < reached ? "done" : index === reached ? "current" : "todo";
        return (
          <li key={step.id} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            {step.label}{skipped ? " (none)" : ""}
          </li>
        );
      })}
    </ol>
  );
}

export function AccountProfileView({ context, companyId, onBack }: { context: ScreenContext; companyId: string; onBack: () => void }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const company = companyById(data, companyId);
  const openedOn = useRef(context.tab);
  const [filter, setFilter] = useState<"all" | TimelineGroup>("all");

  // Choosing another tab of the Companies screen goes back to that list.
  useEffect(() => {
    if (context.tab !== openedOn.current) onBack();
  }, [context.tab, onBack]);

  const profile = useMemo(() => company ? accountProfile({
    company, contacts: data.contacts, deals: data.deals, leads: data.leads, quotes: data.quotes,
    invoices: data.invoices, activities: data.activities, now,
  }) : undefined, [company, data.contacts, data.deals, data.leads, data.quotes, data.invoices, data.activities, now]);

  if (!company || !profile) {
    return (
      <Empty title="This account is not in the workspace" icon={<Building2 size={20} />}
        action={<Button variant="secondary" onClick={onBack}>All accounts</Button>}>
        It may have been merged or the link may be wrong. No other account was substituted.
      </Empty>
    );
  }

  const timeline = profile.timeline.filter((entry) => filter === "all" || entry.group === filter);

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={onBack}>All accounts</Button>
        <span className="ds-grow" />
        <Button variant="secondary" size="sm" onClick={() => { context.select(company.id); context.openOverlay("Account editor", { id: company.id }); }}>Edit the account</Button>
      </Row>

      <Card prov="human" flush>
        <div className="ds-card-body">
          <Row gap={4} wrap>
            <div className="ds-grow" style={{ minWidth: 0 }}>
              <Row gap={2} wrap>
                <h2 style={{ fontSize: "var(--text-xl)" }}>{company.title}</h2>
                <Pill tone={company.status === "active" ? "success" : company.status === "prospect" ? "info" : "neutral"} dot>{company.status}</Pill>
              </Row>
              <p className="ds-subtle">{company.summary || "No description recorded."}</p>
            </div>
            <Properties rows={[
              { label: "Industry", value: String(company.fields.industry ?? "Not recorded") },
              { label: "Location", value: String(company.fields.city ?? "Not recorded") },
              { label: "Owner", value: String(company.fields.owner ?? company.ownerName) },
              { label: "Customer since", value: company.fields.customerSince ? context.date(String(company.fields.customerSince)) : context.date(company.createdAt) },
            ]} />
          </Row>
        </div>
      </Card>

      <StatRow>
        <Stat prov="human" label="Open pipeline" value={context.money(profile.openMinor)} meta={`${profile.openDeals.length} open · ${context.money(profile.weightedMinor)} weighted, a prediction`} />
        <Stat prov="human" label="Won to date" value={context.money(profile.wonMinor)} meta={`${profile.deals.length - profile.openDeals.length} closed deals`} />
        <Stat prov="posted" label="Outstanding" value={context.money(profile.outstandingMinor)}
          meta={`Of ${context.money(profile.invoicedMinor)} invoiced by Finance · ${profile.overdueInvoices.length ? `${context.money(profile.overdueMinor)} past due` : "nothing past due"}`}
          delta={profile.overdueInvoices.length ? { dir: "down", text: `${profile.overdueInvoices.length} late` } : undefined} />
        <Stat prov="human" label="Last conversation"
          value={profile.daysSinceTouch === undefined ? "None logged" : profile.daysSinceTouch === 0 ? "Today" : `${profile.daysSinceTouch} days ago`}
          unavailable={profile.daysSinceTouch === undefined}
          meta={`${profile.openTasks.length} follow-up${profile.openTasks.length === 1 ? "" : "s"} open`} />
      </StatRow>

      {profile.risks.length > 0 && (
        <Notice tone="warning" title="Needs attention">
          <ul className="crm-risk-list">
            {profile.risks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </Notice>
      )}

      <Grid>
        <Card span={7} eyebrow="LEAD TO CASH" prov="human" title="Deals, quotes and invoices"
          subtitle="Each deal from its lead through to the invoice Finance posted">
          {profile.chains.length === 0 ? (
            <Empty title="No deal on this account">Open a deal from the pipeline board, or convert a lead for this company.</Empty>
          ) : (
            <Stack gap={3}>
              {profile.chains.map((chain) => (
                <div key={chain.deal.id} className="ds-panel crm-chain-card">
                  <Row gap={2} wrap>
                    <Link to={`/o/${org.slug}/crm/deals/${chain.deal.id}`} className="ds-grow" style={{ color: "inherit", fontWeight: 600 }}>{chain.deal.title}</Link>
                    <StagePill deal={chain.deal} />
                    <Money minor={chain.deal.amountMinor} context={context} bold />
                  </Row>
                  <ChainSteps chain={chain} />
                  <Row gap={3} wrap>
                    {chain.lead && <span className="ds-subtle">From lead {chain.lead.title}</span>}
                    {chain.quotes.map((quote) => (
                      <Link key={quote.id} to={`/o/${org.slug}/crm/quotes?tab=${quote.status === "accepted" ? "Accepted" : quote.status === "sent" ? "Sent" : quote.status === "draft" ? "Draft" : "Review"}`} style={{ color: "inherit" }}>
                        {quote.title} · {quote.status}
                      </Link>
                    ))}
                    {chain.invoices.map((invoice) => (
                      <Link key={invoice.id} to={`/o/${org.slug}/fin/invoices/${invoice.id}`} style={{ color: "inherit" }}>
                        {invoice.title} · {invoice.status.replace(/_/g, " ")}{invoiceOutstanding(invoice) ? ` · ${context.money(invoiceOutstanding(invoice))} owed` : ""}
                      </Link>
                    ))}
                  </Row>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-sm)" }}>{chain.next}</p>
                </div>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="PEOPLE" prov="human" title="Who we know" subtitle={`${profile.contacts.length} contact${profile.contacts.length === 1 ? "" : "s"}`}>
          <Stack gap={2}>
            {profile.contacts.map((contact) => (
              <Row key={contact.id} gap={3}>
                <Avatar name={contact.title} size="sm" />
                <div className="ds-grow" style={{ minWidth: 0 }}>
                  <Link to={`/o/${org.slug}/crm/contacts/${contact.id}`} style={{ color: "inherit" }}>{contact.title}</Link>
                  <span className="ds-subtle ds-truncate" style={{ display: "block", fontSize: "var(--text-xs)" }}>{String(contact.fields.role ?? "Role not recorded")}</span>
                </div>
                <ConsentPill contact={contact} />
              </Row>
            ))}
            {profile.contacts.length === 0 && <span className="ds-subtle">No contact is linked to this account.</span>}
          </Stack>
        </Card>
      </Grid>

      <Grid>
        <Card span={5} eyebrow="NEXT STEPS" prov="human" title="Follow-ups" subtitle="Tasks on this account, its people and its deals">
          <Stack gap={4}>
            <FollowUpList context={context} tasks={profile.openTasks} />
            <FollowUpForm context={context} company={company} deals={profile.openDeals} contacts={profile.contacts} />
          </Stack>
        </Card>

        <Card span={7} eyebrow="HISTORY" prov="human" title="Account timeline" subtitle={`${profile.timeline.length} events across conversations, pipeline and Finance`}>
          <Stack gap={3}>
            <div className="crm-timeline-filter">
              <Segmented label="Show" value={filter} onChange={setFilter} options={TIMELINE_FILTERS} />
            </div>
            <NoteForm context={context} company={company} />
            {timeline.length === 0 ? (
              <span className="ds-subtle">Nothing of this kind is recorded for the account.</span>
            ) : (
              <ol className="crm-timeline" aria-label="Account timeline">
                {timeline.slice(0, 40).map((entry) => (
                  <li key={`${entry.group}-${entry.id}`} data-group={entry.group}>
                    <span className="ds-num ds-subtle crm-timeline-date">{context.date(entry.at)}</span>
                    <div style={{ minWidth: 0 }}>
                      <Row gap={2} wrap>
                        <Pill tone={entry.group === "finance" ? "success" : entry.group === "pipeline" ? "info" : "neutral"}>{entry.kind}</Pill>
                        {entry.href
                          ? <Link to={`/o/${org.slug}/${entry.href}`} style={{ color: "inherit" }}>{entry.title}</Link>
                          : <span>{entry.title}</span>}
                        {entry.group === "conversation" && entry.status === "open" && <Pill tone="warning">Open</Pill>}
                      </Row>
                      {entry.detail && <p className="ds-subtle" style={{ fontSize: "var(--text-sm)" }}>{entry.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {timeline.length > 40 && <span className="ds-subtle">Showing the latest 40 of {timeline.length}.</span>}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

function FollowUpList({ context, tasks }: { context: ScreenContext; tasks: Rec[] }) {
  const { now } = useWorkspace();
  const [busy, setBusy] = useState<string>();
  if (tasks.length === 0) return <span className="ds-subtle">No follow-up is open on this account.</span>;
  return (
    <ul className="crm-task-list" aria-label="Open follow-ups">
      {tasks.map((task) => {
        const due = task.dueAt ?? task.startAt ?? task.at;
        const late = due ? new Date(due) < now : false;
        return (
          <li key={task.id}>
            <div className="ds-grow" style={{ minWidth: 0 }}>
              <span>{task.title}</span>
              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>
                {String(task.fields.owner ?? task.ownerName)} · due {context.date(due)}
              </span>
            </div>
            {late && <Pill tone="danger" dot>Overdue</Pill>}
            <Button size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} busy={busy === task.id}
              aria-label={`Mark ${task.title} done`}
              onClick={async () => {
                setBusy(task.id);
                try {
                  const saved = await context.mutate.patch(task.id, {
                    status: "done",
                    fields: { ...task.fields, completedBy: context.actor, completedAt: clockIso() },
                  }, { expectRevision: task.revision, event: `Follow-up ${task.title} completed by ${context.actor}` });
                  if (saved) context.toast("Follow-up done", `${task.title} moved to the account timeline.`);
                } finally {
                  setBusy(undefined);
                }
              }}>Done</Button>
          </li>
        );
      })}
    </ul>
  );
}

function FollowUpForm({ context, company, deals, contacts }: { context: ScreenContext; company: Rec; deals: Rec[]; contacts: Rec[] }) {
  const { now } = useWorkspace();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10));
  const [dealId, setDealId] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const past = due < now.toISOString().slice(0, 10);
  return (
    <form
      className="ds-stack ds-gap-3"
      aria-label="Add a follow-up"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || past || !due) return;
        setBusy(true);
        try {
          const at = new Date(`${due}T09:00:00`).toISOString();
          const deal = deals.find((item) => item.id === dealId);
          await context.mutate.create({
            collection: "activities",
            title: title.trim(),
            status: "open",
            summary: deal ? `Follow-up on ${deal.title} for ${company.title}.` : `Follow-up for ${company.title}.`,
            at, startAt: at, dueAt: at,
            parentId: deal?.id ?? company.id,
            tags: ["follow-up"],
            fields: {
              kind: "task", companyId: company.id, owner: context.actor,
              ...(deal ? { dealId: deal.id } : {}), ...(contactId ? { contactId } : {}),
            },
          }, `Follow-up on ${company.title}: ${title.trim()}`);
          context.toast("Follow-up added", `Due ${context.date(at)}. It also appears in Activities › Follow-ups. No calendar is notified.`);
          setTitle("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong style={{ fontSize: "var(--text-sm)" }}>Add a follow-up</strong>
      <Field label="Follow-up" required><TextInput aria-label="Follow-up" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Call about the spring order" /></Field>
      <Row gap={3} wrap>
        <Field label="Due" required hint={past ? "Choose today or a later date." : undefined}>
          <TextInput aria-label="Due" type="date" value={due} invalid={past} onChange={(event) => setDue(event.target.value)} />
        </Field>
        <Field label="Deal">
          <Select aria-label="Deal" value={dealId} onChange={(event) => setDealId(event.target.value)}>
            <option value="">The account generally</option>
            {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title} · {stageOf(deal).label}</option>)}
          </Select>
        </Field>
        <Field label="With">
          <Select aria-label="With" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Anyone at the account</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.title}</option>)}
          </Select>
        </Field>
      </Row>
      <Row gap={2}>
        <Button type="submit" variant="primary" size="sm" busy={busy} disabled={!title.trim() || past}>Add the follow-up</Button>
      </Row>
    </form>
  );
}

function NoteForm({ context, company }: { context: ScreenContext; company: Rec }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ds-stack ds-gap-2"
      aria-label="Add an account note"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = text.trim();
        if (!body) return;
        setBusy(true);
        try {
          const at = clockIso();
          await context.mutate.create({
            collection: "activities",
            title: body.length > 80 ? `${body.slice(0, 77)}…` : body,
            status: "done",
            summary: body,
            at, startAt: at,
            parentId: company.id,
            tags: ["note"],
            fields: { kind: "note", companyId: company.id, owner: context.actor },
          }, `Note on ${company.title}`);
          context.toast("Note saved", `Kept on ${company.title}'s timeline.`);
          setText("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Account note"><TextArea aria-label="Account note" rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="What was agreed, who decides, what to watch" /></Field>
      <Row gap={2}><Button type="submit" size="sm" variant="secondary" busy={busy} disabled={!text.trim()}>Save the note</Button></Row>
    </form>
  );
}
