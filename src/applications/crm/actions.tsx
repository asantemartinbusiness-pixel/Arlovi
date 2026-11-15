import { useMemo, useState } from "react";
import {
  Button, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import { activitiesFor, activityKind, probabilityOf, stageOf, STAGES } from "@/domain/crm-pipeline";
import { companyById, contactById, contactOfDeal, useCrmData } from "./data";
import type { CrmData } from "./data";
import { CapabilityNotice, ConsentPill, Money, StagePill, isExpired } from "./parts";
import { quoteTotals } from "./quotes";

/* ====================================================================== *
 * CRM contract actions that perform the named operation. Each writes the
 * record it names, says what it changed, and stops at the provider boundary
 * where a real product would contact somebody.
 * ====================================================================== */

interface Owner { name: string; available: boolean; why?: string; load: number }

/** People who can own CRM work, with whatever availability is recorded. */
export function ownersOf(data: CrmData): Owner[] {
  const names = new Set<string>(data.owners);
  for (const member of data.members) {
    if (String(member.fields.kind ?? "human") !== "human") continue;
    if (["owner", "sales"].includes(String(member.fields.role ?? ""))) names.add(member.title);
  }
  return [...names].sort().map((name) => {
    const member = data.members.find((item) => item.title === name);
    const away = member && (member.status !== "active" || String(member.fields.availability ?? "") === "away");
    const load = data.leads.filter((lead) => String(lead.fields.owner ?? "") === name && ["new", "working"].includes(lead.status)).length
      + data.deals.filter((deal) => String(deal.fields.owner ?? deal.ownerName) === name && stageOf(deal).kind === "open").length;
    return { name, available: !away, why: away ? `${name} is recorded as ${member?.status === "active" ? "away" : member?.status}` : undefined, load };
  });
}

function OwnerSelect({ owners, value, onChange }: { owners: Owner[]; value: string; onChange: (next: string) => void }) {
  return (
    <Field label="Owner" required hint="Availability comes from the member record. No calendar is connected.">
      <Select aria-label="Owner" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose an owner</option>
        {owners.map((owner) => (
          <option key={owner.name} value={owner.name} disabled={!owner.available}>
            {owner.name} · {owner.load} open{owner.available ? "" : " · unavailable"}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* ------------------------------ CRM-001 ------------------------------ */

export function OpenDeal({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open")
    .sort((a, b) => Number(b.amountMinor ?? 0) - Number(a.amountMinor ?? 0));
  return (
    <Stack gap={3}>
      <DataGrid
        rows={open}
        rowId={(row) => row.id}
        label="Open deals"
        empty={<Empty title="No open deal" />}
        columns={[
          { key: "deal", header: "Deal", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} /> },
          { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? row.ownerName) },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
        ]}
        onOpen={(id) => { close(); context.navigate(`/o/${context.org.slug}/crm/deals/${id}`); }}
      />
      <p className="ds-subtle">Press Enter on a row, or double-click it, to open the deal.</p>
    </Stack>
  );
}

export function AssignFollowUp({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const owners = ownersOf(data);
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open").map((deal) => {
    const last = activitiesFor(data.activities, deal.id)[0];
    const quiet = last ? Math.floor((now.getTime() - new Date(last.startAt ?? last.at ?? last.createdAt).getTime()) / 86_400_000) : 999;
    return { deal, quiet };
  }).sort((a, b) => b.quiet - a.quiet);
  const [dealId, setDealId] = useState(open[0]?.deal.id ?? "");
  const deal = data.deals.find((item) => item.id === dealId);
  const [owner, setOwner] = useState(String(deal?.fields.owner ?? ""));
  const [due, setDue] = useState(new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10));
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = owners.find((item) => item.name === owner);
  const blocked = !deal ? "Choose a deal." : !owner ? "Choose an owner." : chosen && !chosen.available ? chosen.why : !what.trim() ? "Say what the follow-up is." : undefined;

  return (
    <Stack gap={4}>
      <Field label="Deal" hint="Quietest first, by days since the last logged activity.">
        <Select aria-label="Deal" value={dealId} onChange={(event) => { setDealId(event.target.value); const next = data.deals.find((item) => item.id === event.target.value); setOwner(String(next?.fields.owner ?? "")); }}>
          {open.map(({ deal: item, quiet }) => <option key={item.id} value={item.id}>{item.title} · {quiet >= 999 ? "never touched" : `${quiet} days quiet`}</option>)}
        </Select>
      </Field>
      <OwnerSelect owners={owners} value={owner} onChange={setOwner} />
      <Row gap={3} wrap>
        <Field label="Due" required><TextInput aria-label="Due" type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
        <Field label="Follow-up" required><TextInput aria-label="Follow-up" value={what} onChange={(event) => setWhat(event.target.value)} placeholder="Call to confirm the finish" /></Field>
      </Row>
      {blocked && owner && <Notice tone="warning" title="Not ready to assign">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked)}
          onClick={async () => {
            if (!deal) return;
            setBusy(true);
            await context.mutate.create({
              collection: "activities",
              title: what.trim(),
              status: "open",
              summary: `Follow-up on ${deal.title}, assigned by ${context.actor}.`,
              dueAt: `${due}T17:00:00.000Z`,
              startAt: `${due}T09:00:00.000Z`,
              at: `${due}T09:00:00.000Z`,
              parentId: deal.id,
              fields: { kind: "task", dealId: deal.id, contactId: String(deal.fields.contactId ?? ""), owner, assignedBy: context.actor },
            }, `Follow-up on ${deal.title} assigned to ${owner}`);
            context.toast("Follow-up assigned", `${owner} owns “${what.trim()}” on ${deal.title}, due ${context.date(due)}.`);
            setBusy(false);
            close();
          }}
        >
          Assign the follow-up
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** A question for the Sales AI employee. No model is called; the question is kept and answered from records. */
export function AskSales({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const words = (asked ?? "").toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const matches = asked ? data.deals.filter((deal) => words.some((word) => `${deal.title} ${deal.summary}`.toLowerCase().includes(word))).slice(0, 6) : [];

  return (
    <Stack gap={4}>
      <CapabilityNotice id="model.inference" title="Sales cannot reason about this yet" />
      <Field label="Your question for Sales" required>
        <TextArea aria-label="Your question for Sales" value={question} rows={3} onChange={(event) => setQuestion(event.target.value)} placeholder="Which proposal deals are at risk this month?" />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!question.trim()}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "messages",
              title: `Question for Sales: ${question.trim().slice(0, 60)}`,
              status: "queued_local",
              summary: question.trim(),
              tags: ["crm", "ask-sales"],
              fields: { to: "Sales", askedBy: context.actor, screenId: context.screen.id, capability: "not_connected" },
            }, `Question asked of Sales by ${context.actor}`);
            setAsked(question.trim());
            context.toast("Question kept", "It is stored for the Sales employee. No model is connected, so the answer below is only the records that match your words.", "info");
            setBusy(false);
          }}
        >
          Ask Sales
        </Button>
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
      {asked && (
        <Stack gap={2}>
          <strong>Records that mention your words</strong>
          {matches.length === 0 ? <span className="ds-subtle">No deal mentions them. Nothing is inferred beyond what the records state.</span> : matches.map((deal) => (
            <Row key={deal.id} gap={3}>
              <span className="ds-grow">{deal.title}</span>
              <StagePill deal={deal} />
              <Money minor={deal.amountMinor} context={context} />
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/* ------------------------------ CRM-003 ------------------------------ */

export function AttachRecord({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const contact = data.contacts.find((item) => item.id === context.params.id) ?? data.contacts.find((item) => item.id === context.selectedId);
  const [kind, setKind] = useState<"deals" | "quotes" | "invoices" | "tickets">("deals");
  const [recordId, setRecordId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!contact) return <Empty title="No contact selected" />;
  const pool: Rec[] = kind === "deals" ? data.deals : kind === "quotes" ? data.quotes : kind === "invoices" ? data.invoices : data.tickets;
  const attached = ((contact.body as { attached?: { id: string; collection: string; title: string; by: string; at: string }[] })?.attached) ?? [];
  const record = pool.find((item) => item.id === recordId);
  const already = attached.some((item) => item.id === recordId);
  const otherContact = record && String(record.fields.contactId ?? "") && String(record.fields.contactId) !== contact.id
    ? contactById(data, String(record.fields.contactId)) : undefined;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Attaching links, it does not copy">
        The record stays where it is. The contact keeps a link with who attached it and when, so it shows on their profile.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Kind">
          <Select aria-label="Kind" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setRecordId(""); }}>
            <option value="deals">Deal</option><option value="quotes">Quote</option><option value="invoices">Invoice</option><option value="tickets">Support ticket</option>
          </Select>
        </Field>
        <Field label="Record" required>
          <Select aria-label="Record" value={recordId} onChange={(event) => setRecordId(event.target.value)}>
            <option value="">Choose a record</option>
            {pool.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      </Row>
      {otherContact && <Notice tone="warning" title="This record belongs to someone else">It is linked to {otherContact.title}. Attaching adds a reference here without moving it.</Notice>}
      {already && <Notice tone="warning" title="Already attached">This record is already on {contact.title}.</Notice>}
      {attached.length > 0 && (
        <Properties rows={attached.map((item) => ({ label: item.collection, value: `${item.title} · ${item.by}, ${context.date(item.at)}` }))} />
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!record || already}
          onClick={async () => {
            if (!record) return;
            setBusy(true);
            const saved = await context.mutate.patch(contact.id, {
              body: { ...(contact.body as object ?? {}), attached: [...attached, { id: record.id, collection: record.collection, title: record.title, by: context.actor, at: new Date().toISOString() }] },
            }, { expectRevision: contact.revision, event: `${record.title} attached to ${contact.title}` });
            if (saved) context.toast("Record attached", `${record.title} is linked on ${contact.title}'s profile.`);
            setBusy(false);
            close();
          }}
        >
          Attach to {contact.title}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-004 ------------------------------ */

export function CompanyExport({ close, run }: { context: ScreenContext; close: () => void; run: (rows: Rec[], data: CrmData) => void }) {
  const data = useCrmData();
  const [scope, setScope] = useState("all");
  const rows = scope === "all" ? data.companies.filter((company) => company.status !== "merged") : data.companies.filter((company) => company.status === scope);
  return (
    <Stack gap={4}>
      <Field label="Which accounts">
        <Select aria-label="Which accounts" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">Every account</option>
          {[...new Set(data.companies.map((company) => company.status))].map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Button variant="primary" disabled={rows.length === 0} onClick={() => { run(rows, data); close(); }}>Download {rows.length} accounts as CSV</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-005 ------------------------------ */

function leadBlock(data: CrmData, lead: Rec): string | undefined {
  const contact = contactById(data, String(lead.fields.contactId ?? ""));
  if (contact?.fields.suppressed === true) return `${contact.title} is suppressed`;
  return undefined;
}

export function AssignLead({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const owners = ownersOf(data);
  const lead = data.leads.find((item) => item.id === context.selectedId);
  const [owner, setOwner] = useState(String(lead?.fields.owner ?? ""));
  const [busy, setBusy] = useState(false);
  if (!lead) return <Empty title="Select a lead first" />;
  const contact = contactById(data, String(lead.fields.contactId ?? ""));
  const chosen = owners.find((item) => item.name === owner);
  const blocked = leadBlock(data, lead) ?? (!owner ? "Choose an owner." : chosen && !chosen.available ? chosen.why : owner === String(lead.fields.owner ?? "") ? `${owner} already owns this lead.` : undefined);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Lead", value: lead.title },
        { label: "Current owner", value: String(lead.fields.owner ?? "Unassigned") },
        { label: "Contact", value: contact ? <Row gap={2}>{contact.title}<ConsentPill contact={contact} /></Row> : "None" },
      ]} />
      <OwnerSelect owners={owners} value={owner} onChange={setOwner} />
      {blocked && owner && <Notice tone="warning" title="This lead cannot be assigned like that">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(lead.id, {
              status: lead.status === "new" ? "working" : lead.status,
              fields: { ...lead.fields, owner, assignedBy: context.actor, assignedAt: new Date().toISOString() },
            }, { expectRevision: lead.revision, event: `Lead ${lead.title} assigned to ${owner} by ${context.actor}` });
            if (saved) context.toast("Lead assigned", `${owner} now owns ${lead.title}. Nobody was contacted.`);
            setBusy(false);
            close();
          }}
        >
          Assign to {owner || "…"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Routes every unassigned inbox lead to the available owner with the lightest load. */
export function BulkRoute({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const owners = ownersOf(data);
  const unassigned = data.leads.filter((lead) => ["new", "working"].includes(lead.status) && !lead.fields.owner);
  const plan = useMemo(() => {
    const load = new Map(owners.filter((owner) => owner.available).map((owner) => [owner.name, owner.load]));
    return unassigned.map((lead) => {
      const blocked = leadBlock(data, lead);
      if (blocked) return { lead, owner: undefined as string | undefined, why: blocked };
      const next = [...load.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
      if (!next) return { lead, owner: undefined, why: "Nobody is available" };
      load.set(next[0], next[1] + 1);
      return { lead, owner: next[0], why: `Lightest load (${next[1]} open)` };
    });
  }, [data, owners, unassigned]);
  const [busy, setBusy] = useState(false);
  const routable = plan.filter((row) => row.owner);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Routing assigns an owner and nothing else">
        Each unassigned lead goes to the available owner with the fewest open leads and deals. A suppressed contact is skipped, an unavailable owner is never chosen, and no customer is contacted.
      </Notice>
      <DataGrid
        rows={plan}
        rowId={(row) => row.lead.id}
        label="Routing plan"
        filterable={false}
        empty={<Empty title="No unassigned lead in the inbox" />}
        columns={[
          { key: "lead", header: "Lead", primary: true, cell: (row) => row.lead.title },
          { key: "owner", header: "Goes to", cell: (row) => row.owner ?? <Pill tone="warning">Skipped</Pill> },
          { key: "why", header: "Why", cell: (row) => <span className="ds-subtle">{row.why}</span> },
        ]}
      />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={routable.length === 0 || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            for (const row of routable) {
              await context.mutate.patch(row.lead.id, {
                status: row.lead.status === "new" ? "working" : row.lead.status,
                fields: { ...row.lead.fields, owner: row.owner!, assignedBy: context.actor, routedBy: "bulk route" },
              }, { expectRevision: row.lead.revision, event: `Lead ${row.lead.title} routed to ${row.owner}` });
            }
            context.toast("Leads routed", `${routable.length} assigned. ${plan.length - routable.length} skipped.`);
            setBusy(false);
            close();
          }}
        >
          Route {routable.length} lead{routable.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-006 ------------------------------ */

export function AssignOwner({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const owners = ownersOf(data);
  const deal = data.deals.find((item) => item.id === context.selectedId);
  const current = String(deal?.fields.owner ?? deal?.ownerName ?? "");
  const [owner, setOwner] = useState(current);
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="Select a deal first" />;
  const chosen = owners.find((item) => item.name === owner);
  const blocked = !owner ? "Choose an owner." : owner === current ? `${owner} already owns this deal.` : chosen && !chosen.available ? chosen.why : undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Deal", value: deal.title },
        { label: "Stage", value: <StagePill deal={deal} /> },
        { label: "Current owner", value: current || "Unassigned" },
      ]} />
      <OwnerSelect owners={owners} value={owner} onChange={setOwner} />
      {blocked && owner && owner !== current && <Notice tone="warning" title="Cannot assign">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(deal.id, {
              fields: { ...deal.fields, owner, previousOwner: current, ownerChangedBy: context.actor },
            }, { expectRevision: deal.revision, event: `${deal.title} reassigned from ${current || "nobody"} to ${owner}` });
            if (saved) context.toast("Owner assigned", `${owner} now owns ${deal.title}.`);
            setBusy(false);
            close();
          }}
        >
          Assign to {owner || "…"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-008 ------------------------------ */

export function ApproveQuote({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { org, now, role } = useWorkspace();
  const quote = data.quotes.find((item) => item.id === context.selectedId);
  const [busy, setBusy] = useState(false);
  if (!quote) return <Empty title="Select a quote first" />;
  const totals = quoteTotals(data, quote, org.jurisdiction, now);
  const blocked = !["draft", "review"].includes(quote.status)
    ? `${quote.title} is ${quote.status}${quote.fields.approvedBy ? `, approved by ${String(quote.fields.approvedBy)}` : ""}.`
    : isExpired(quote, now) ? "The pricing has expired. Re-price it before approving."
      : totals.hasUnknownRate ? "A line has no approved tax rate."
        : quote.fields.discountApproval && role !== "owner" ? `${String(quote.fields.discountApproval)} Only the Owner view can approve it.`
          : undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Quote", value: quote.title },
        { label: "Total", value: <Money minor={totals.grossMinor} context={context} bold /> },
        { label: "Discount", value: <Money minor={totals.discountMinor} context={context} /> },
        { label: "Holds until", value: context.date(quote.dueAt) },
        { label: "Policy", value: quote.fields.discountApproval ? String(quote.fields.discountApproval) : "Within the 10% ceiling" },
      ]} />
      <Notice tone={blocked ? "danger" : "info"} title={blocked ? "This quote cannot be approved" : "Approving records you against this version"}>
        {blocked ?? `Version ${String(quote.fields.version ?? 1)} at ${context.money(totals.grossMinor)} is approved by ${context.actor}. An edit after approval needs a new approval.`}
      </Notice>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = {
              ...quote.fields, approvedBy: context.actor, approvedAt: new Date().toISOString(), approvedVersion: Number(quote.fields.version ?? 1), approvedGrossMinor: totals.grossMinor,
            };
            delete fields.discountApproval;
            const saved = await context.mutate.patch(quote.id, { status: "approved", fields }, { expectRevision: quote.revision, event: `Quote ${quote.title} approved by ${context.actor}` });
            if (saved) context.toast("Quote approved", `${quote.title} is approved by ${context.actor} and can be sent.`);
            setBusy(false);
            close();
          }}
        >
          Approve the quote
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Copies a quote as a new draft for re-pricing. The original is untouched. */
export function DuplicateQuote({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const quote = data.quotes.find((item) => item.id === context.selectedId);
  const numbers = data.quotes.map((item) => Number(/(\d+)/.exec(String(item.fields.number ?? item.title))?.[1] ?? 0)).filter((value) => value > 0);
  const [number, setNumber] = useState(`Q-${Math.max(100, ...numbers) + 1}`);
  const [busy, setBusy] = useState(false);
  if (!quote) return <Empty title="Select a quote first" />;
  const taken = data.quotes.some((item) => String(item.fields.number ?? "").toLowerCase() === number.trim().toLowerCase());
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The copy starts as a draft with fresh validity">
        Lines are copied. Approval, send history and acceptance are not, so an expired price cannot travel into the new quote as approved.
      </Notice>
      <Field label="New number" required error={taken ? "That number is already used" : undefined}>
        <TextInput aria-label="New number" value={number} invalid={taken} onChange={(event) => setNumber(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!number.trim() || taken}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = { ...quote.fields, number: number.trim(), version: 1, duplicatedFrom: quote.id };
            for (const key of ["approvedBy", "approvedAt", "approvedVersion", "approvedGrossMinor", "sentAt", "sentBy", "delivery", "acceptedAt", "discountApproval"]) delete fields[key];
            const body = { ...(quote.body as Record<string, unknown> ?? {}) };
            delete body.sends;
            const created = await context.mutate.create({
              collection: "quotes",
              title: `${number.trim()} ${quote.title.replace(/^\S+\s*/, "")}`,
              status: "draft",
              summary: `Re-pricing copy of ${quote.title}.`,
              amountMinor: quote.amountMinor,
              at: now.toISOString(),
              dueAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
              parentId: quote.parentId,
              fields,
              body,
            }, `Quote ${quote.title} duplicated as ${number.trim()}`);
            context.select(created.id);
            context.toast("Duplicated", `${created.title} is a draft copy. Open it to re-price.`);
            setBusy(false);
            context.openOverlay("Quote editor", { id: created.id });
          }}
        >
          Duplicate and open
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-009 ------------------------------ */

export function AddReminder({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(new Date(now.getTime() + 86_400_000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const deal = data.deals.find((item) => item.id === dealId);
  const past = new Date(when) <= now;
  return (
    <Stack gap={4}>
      <CapabilityNotice id="calendar.sync" title="The reminder lives in this workspace" />
      <Field label="About" hint="Optional. Link the reminder to a deal.">
        <Select aria-label="About" value={dealId} onChange={(event) => setDealId(event.target.value)}>
          <option value="">Nothing in particular</option>
          {data.deals.filter((item) => stageOf(item).kind === "open").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Remind me to" required><TextInput aria-label="Remind me to" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="When" required hint={past ? "Choose a time in the future." : undefined}>
        <TextInput aria-label="When" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!title.trim() || past}
          onClick={async () => {
            setBusy(true);
            const at = new Date(when).toISOString();
            await context.mutate.create({
              collection: "activities",
              title: title.trim(),
              status: "open",
              summary: deal ? `Reminder on ${deal.title}.` : "Reminder.",
              startAt: at,
              dueAt: at,
              at,
              parentId: deal?.id,
              tags: ["reminder"],
              fields: { kind: "task", reminder: true, remindAt: at, owner: context.actor, delivery: "not_connected", ...(deal ? { dealId: deal.id } : {}) },
            }, `Reminder set for ${context.actor}: ${title.trim()}`);
            context.toast("Reminder set", `It appears in Follow-ups at ${context.dateTime(at)}. No calendar or phone will alert you.`, "info");
            setBusy(false);
            close();
          }}
        >
          Add the reminder
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function CompleteTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const open = data.activities.filter((activity) => activity.status === "open" && ["task", "call", "email"].includes(activityKind(activity)))
    .sort((a, b) => (a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? ""));
  const [id, setId] = useState(open.find((item) => item.id === context.selectedId)?.id ?? open[0]?.id ?? "");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const task = open.find((item) => item.id === id);
  if (open.length === 0) return <Empty title="No open task">Everything on the follow-up list is done.</Empty>;
  return (
    <Stack gap={4}>
      <Field label="Task">
        <Select aria-label="Task" value={id} onChange={(event) => setId(event.target.value)}>
          {open.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.owner ?? item.ownerName)} · due {context.date(item.dueAt ?? item.startAt)}</option>)}
        </Select>
      </Field>
      <Field label="Outcome" hint="What was done. Kept on the activity."><TextInput aria-label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!task}
          onClick={async () => {
            if (!task) return;
            setBusy(true);
            const saved = await context.mutate.patch(task.id, {
              status: "done",
              fields: { ...task.fields, completedBy: context.actor, completedAt: new Date().toISOString(), ...(outcome ? { outcome } : {}) },
            }, { expectRevision: task.revision, event: `Activity ${task.title} completed by ${context.actor}` });
            if (saved) context.toast("Task completed", `${task.title} is done and moved to History.`);
            setBusy(false);
            close();
          }}
        >
          Mark complete
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-010 ------------------------------ */

function weighted(deal: Rec, shift = 0): number {
  return Math.round((Number(deal.amountMinor ?? 0) * Math.max(0, Math.min(100, probabilityOf(deal) + shift))) / 100);
}

/** Deals counted more than once: the same quote behind two open deals. */
function doubleCounted(open: Rec[]): Map<string, Rec[]> {
  const byQuote = new Map<string, Rec[]>();
  for (const deal of open) {
    const key = String(deal.fields.quoteId ?? "");
    if (!key) continue;
    byQuote.set(key, [...(byQuote.get(key) ?? []), deal]);
  }
  return new Map([...byQuote.entries()].filter(([, rows]) => rows.length > 1));
}

export function AdjustAssumptions({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const [shift, setShift] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const base = open.reduce((sum, deal) => sum + weighted(deal), 0);
  const adjusted = open.reduce((sum, deal) => sum + weighted(deal, shift), 0);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="An assumption is saved as a scenario">
        No deal is edited. The scenario stores the shift, the result and who set it, labelled as a prediction.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Shift every probability by" hint="Percentage points, -50 to 50">
          <TextInput aria-label="Shift every probability by" align="end" value={String(shift)} onChange={(event) => setShift(Math.max(-50, Math.min(50, Number(event.target.value.replace(/[^0-9-]/g, "")) || 0)))} />
        </Field>
        <Field label="Scenario name" required><TextInput aria-label="Scenario name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cautious December" /></Field>
      </Row>
      <StatRow>
        <Stat prov="human" label="Weighted today" value={context.money(base)} />
        <Stat prov="human" label="Under this assumption" value={context.money(adjusted)} meta="Prediction, not revenue" />
      </StatRow>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!name.trim()}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "preferences",
              title: `Forecast scenario · ${name.trim()}`,
              status: "saved",
              summary: `Every open deal shifted ${shift >= 0 ? "+" : ""}${shift} points.`,
              amountMinor: adjusted,
              fields: { kind: "salesForecastScenario", shift, baseMinor: base, adjustedMinor: adjusted, setBy: context.actor, openDeals: open.length },
            }, `Forecast scenario ${name.trim()} saved by ${context.actor}`);
            context.toast("Scenario saved", `${name.trim()}: ${context.money(adjusted)} weighted. No deal changed.`);
            setBusy(false);
            close();
          }}
        >
          Save the assumption
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ForecastDrillDown({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const doubles = doubleCounted(open);
  const doubleIds = new Set([...doubles.values()].flatMap((rows) => rows.slice(1).map((deal) => deal.id)));
  return (
    <Stack gap={4}>
      {doubles.size > 0 ? (
        <Notice tone="warning" title={`${doubleIds.size} deal${doubleIds.size === 1 ? " is" : "s are"} excluded as double counted`}>
          More than one open deal points at the same quote. Only the first is counted, so a multi-product opportunity is not weighted twice.
        </Notice>
      ) : <Notice tone="success" title="No double counting found">No two open deals share a quote.</Notice>}
      {STAGES.filter((stage) => stage.kind === "open").map((stage) => {
        const rows = open.filter((deal) => stageOf(deal).id === stage.id);
        if (rows.length === 0) return null;
        return (
          <DataGrid
            key={stage.id}
            rows={rows}
            rowId={(row) => row.id}
            label={`${stage.label} deals`}
            filterable={false}
            rowTone={(row) => (doubleIds.has(row.id) ? "warning" : undefined)}
            columns={[
              { key: "deal", header: stage.label, primary: true, cell: (row) => row.title },
              { key: "contact", header: "Contact", cell: (row) => contactOfDeal(data, row)?.title ?? "None" },
              { key: "weight", header: "Weight", align: "end", cell: (row) => <span className="ds-num">{probabilityOf(row)}%{row.fields.probabilityOverride ? " (override)" : ""}</span> },
              { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
              { key: "weighted", header: "Weighted", align: "end", cell: (row) => doubleIds.has(row.id) ? <Pill tone="warning">Excluded</Pill> : <Money minor={weighted(row)} context={context} bold /> },
            ]}
            onOpen={(id) => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/crm/deals/${id}`); }}
            summary={<Money minor={rows.filter((row) => !doubleIds.has(row.id)).reduce((sum, row) => sum + weighted(row), 0)} context={context} bold />}
          />
        );
      })}
    </Stack>
  );
}

export function ReviewForecast({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const f = data.forecast;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A review freezes today's forecast">
        The figures below are stored as a reviewed snapshot with your name, so next month's outcome can be compared against what was predicted.
      </Notice>
      <Properties rows={[
        { label: "Open deals", value: String(f.openCount) },
        { label: "Pipeline", value: <Money minor={f.pipelineMinor} context={context} /> },
        { label: "Weighted", value: <Money minor={f.weightedMinor} context={context} bold /> },
        { label: "Excluded for no amount", value: String(f.withoutAmountIds.length) },
      ]} />
      <Field label="Review note"><TextArea aria-label="Review note" value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "preferences",
              title: `Forecast reviewed ${context.date(context.now)}`,
              status: "reviewed",
              summary: note || "Forecast reviewed with no comment.",
              amountMinor: f.weightedMinor,
              at: new Date().toISOString(),
              fields: { kind: "salesForecastSnapshot", pipelineMinor: f.pipelineMinor, weightedMinor: f.weightedMinor, openCount: f.openCount, reviewedBy: context.actor },
              body: { byStage: f.byStage.map((entry) => ({ stage: entry.stage.id, count: entry.count, amountMinor: entry.amountMinor, weightedMinor: entry.weightedMinor })) },
            }, `Sales forecast reviewed by ${context.actor}`);
            context.toast("Forecast reviewed", `A snapshot of ${context.money(f.weightedMinor)} weighted is kept under History.`);
            setBusy(false);
            close();
          }}
        >
          Record the review
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function exportForecast(context: ScreenContext, data: CrmData): void {
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const doubles = doubleCounted(open);
  const excluded = new Set([...doubles.values()].flatMap((rows) => rows.slice(1).map((deal) => deal.id)));
  const header = "deal,stage,owner,company,amount_minor,probability,weighted_minor,counted\n";
  const body = open.map((deal) => [
    deal.title, stageOf(deal).label, String(deal.fields.owner ?? deal.ownerName), companyById(data, String(deal.fields.companyId ?? deal.parentId ?? ""))?.title ?? "",
    Number(deal.amountMinor ?? 0), probabilityOf(deal), weighted(deal), excluded.has(deal.id) ? "no (double counted)" : "yes",
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile(`${context.org.slug}-sales-forecast.csv`, header + body, "text/csv");
  context.toast("Exported", `${open.length} open deals written to a CSV file. The weighted figure is a prediction, not revenue.`);
}

export function ForecastExport({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  return (
    <Stack gap={4}>
      <p>Every open deal with its stage, weight and weighted value. A deal excluded as double counted is marked in the file.</p>
      <Row gap={2}>
        <Button variant="primary" onClick={() => { exportForecast(context, data); close(); }}>Download the CSV</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ CRM-011 ------------------------------ */

export function StopRule({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const rule = data.workflows.find((item) => item.id === context.selectedId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!rule) return <Empty title="Select a rule first" />;
  const queued = data.runs.filter((run) => String(run.fields.workflowId ?? run.parentId ?? "") === rule.id && ["queued", "running"].includes(run.status));
  return (
    <Stack gap={4}>
      <Notice tone="warning" title={`Stopping ${rule.title}`}>
        It will not run again until it is activated, and {queued.length} queued run{queued.length === 1 ? " is" : "s are"} cancelled. Nothing it already did is undone.
      </Notice>
      {rule.status !== "active" && <Notice tone="info" title="Not running">{rule.title} is {rule.status}.</Notice>}
      <Field label="Why" required><TextInput aria-label="Why" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={rule.status !== "active" || !reason.trim() || !context.can("run_automation")}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(rule.id, {
              status: "stopped",
              fields: { ...rule.fields, stoppedBy: context.actor, stoppedAt: new Date().toISOString(), stopReason: reason.trim() },
            }, { expectRevision: rule.revision, event: `Workflow ${rule.title} stopped by ${context.actor}: ${reason.trim()}` });
            for (const run of queued) {
              await context.mutate.patch(run.id, { status: "cancelled", fields: { ...run.fields, cancelledBy: context.actor } }, { event: `Run of ${rule.title} cancelled when the rule stopped` });
            }
            if (saved) context.toast("Rule stopped", `${rule.title} is stopped. ${queued.length} queued runs cancelled.`, "blocked");
            setBusy(false);
            close();
          }}
        >
          Stop the rule
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function MergeGroups({ groups, onPick, context }: { groups: { key: string; rows: Rec[] }[]; onPick: (ids: string[]) => void; context: ScreenContext }) {
  if (groups.length === 0) return <Empty title="No duplicate to merge">No two contacts share an identical name.</Empty>;
  return (
    <Stack gap={3}>
      <p className="ds-subtle">Choose the group to review. Consent and suppression on every record are shown before anything changes.</p>
      {groups.map((group) => (
        <Row key={group.key} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <strong className="ds-grow">{group.rows[0].title}</strong>
          {group.rows.map((row) => <ConsentPill key={row.id} contact={row} />)}
          <span className="ds-subtle">{group.rows.length} records · oldest {context.date(group.rows.map((row) => row.createdAt).sort()[0])}</span>
          <Button size="sm" variant="primary" onClick={() => onPick(group.rows.map((row) => row.id))}>Review</Button>
        </Row>
      ))}
    </Stack>
  );
}

