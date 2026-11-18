import { useState } from "react";
import { Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { listByCollection } from "@/platform/repo";
import type { Rec } from "@/domain/types";
import { askFirst, Boundary, logBoundary, pickRecord, recordOf, selectedOf } from "@/applications/hr/opsKit";
import { policyFor, useCareData } from "./panels";
import { slaState } from "./sla";
import { caseFilterNow, matchesCase, setCaseFilter, useCaseFilter } from "./caseFilter";
export { CoachingAssignments, matchesCase, useCaseFilter } from "./caseFilter";

/* ------------------------------------------------------------------ *
 * Contract actions for the Customer Care module that change records.
 * ------------------------------------------------------------------ */

const isOpen = (ticket: Rec) => !["resolved", "closed"].includes(ticket.status);
const ref = (ticket: Rec) => String(ticket.fields.ref ?? ticket.title);
const PROHIBITED = ["refund amount", "legal advice", "medical", "health", "diagnos", "compensation"];

function download(name: string, header: string[], rows: (string | number)[][]): void {
  const csv = [header.join(","), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------------- reassign / assign (001, 002, 008) ---------------- */

export function ReassignCase({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; breachedOnly?: boolean } | undefined;
  const data = useCareData();
  const { now } = useWorkspace();
  const candidates = data.tickets.filter((ticket) => isOpen(ticket) && (!payload?.breachedOnly || ["breached", "at_risk"].includes(slaState(ticket, policyFor(ticket, data.slas), now).status)));
  const initial = candidates.find((row) => row.id === (payload?.id ?? context.selectedId))?.id ?? candidates[0]?.id ?? "";
  const [ticketIdRaw, setTicketId] = useState<string | null>(null);
  const ticketId = ticketIdRaw ?? initial;
  const ticket = candidates.find((row) => row.id === ticketId);
  return (
    <form
      id="cr-reassign"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const owner = String(form.get("owner") ?? "");
        const queue = String(form.get("queue") ?? "");
        if (!ticket || !owner) return;
        await context.mutate.patch(ticket.id, { status: ticket.status === "new" ? "open" : ticket.status, fields: { ...ticket.fields, assignee: owner, queue: queue || String(ticket.fields.queue ?? ""), previousAssignee: String(ticket.fields.assignee ?? ""), assignedBy: context.actor } }, { expectRevision: ticket.revision, event: `${ref(ticket)} assigned to ${owner}${queue ? ` in ${queue}` : ""} by ${context.actor}` });
        context.toast("Case assigned", `${ref(ticket)} now belongs to ${owner}.`);
        close();
      }}
    >
      {candidates.length === 0 ? <Empty title={payload?.breachedOnly ? "No case is breached or at risk" : "No open case"} /> : (
        <>
          <Field label="Case"><Select value={ticketId} onChange={(event) => setTicketId(event.target.value)}>{candidates.map((row) => <option key={row.id} value={row.id}>{row.title} · {String(row.fields.assignee || "unassigned")}</option>)}</Select></Field>
          {ticket && <Properties rows={[{ label: "Owner now", value: String(ticket.fields.assignee || "Unassigned") }, { label: "Clock", value: slaState(ticket, policyFor(ticket, data.slas), now).label }]} />}
          <Row gap={3}>
            <Field label="New owner" required>
              <Select name="owner" required defaultValue="">
                <option value="">Choose a person</option>
                {data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id}>{row.title}</option>)}
              </Select>
            </Field>
            <Field label="Queue"><Select name="queue" defaultValue={String(ticket?.fields.queue ?? "")}>{["Technical", "Orders", "Billing", "Trade"].map((queue) => <option key={queue}>{queue}</option>)}</Select></Field>
          </Row>
          <Notice tone="info">Reassigning keeps the earlier owner on the record. The SLA clock is not reset.</Notice>
        </>
      )}
    </form>
  );
}

/* ---------------- ARL-CARE-001 · manage staffing ---------------- */

export function Staffing({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["tickets", "employees", "preferences"]);
  const rota = data.preferences.filter((row) => row.fields.kind === "careRota");
  const queues = ["Technical", "Orders", "Billing", "Trade"];
  const people = data.employees.filter((row) => row.status !== "alumni");
  const [personRaw, setPerson] = useState<string | null>(null);
  const person = personRaw ?? (people[0]?.title ?? "");
  const current = rota.find((row) => row.fields.person === person);
  return (
    <Stack gap={4}>
      <DataGrid
        rows={queues.map((queue) => ({
          id: queue,
          queue,
          open: data.tickets.filter((ticket) => isOpen(ticket) && String(ticket.fields.queue ?? "") === queue).length,
          staffed: rota.filter((row) => row.fields.onRota === true && listOf(row.fields.queues).includes(queue)).map((row) => String(row.fields.person)),
        }))}
        rowId={(row) => row.id}
        label="Queues and who covers them"
        filterable={false}
        rowTone={(row) => (row.open > 0 && row.staffed.length === 0 ? "warning" : undefined)}
        columns={[
          { key: "queue", header: "Queue", primary: true, cell: (row) => row.queue },
          { key: "open", header: "Open", align: "end", cell: (row) => <span className="ds-num">{row.open}</span> },
          { key: "staffed", header: "On the rota", cell: (row) => (row.staffed.length ? row.staffed.join(", ") : <Pill tone="warning">Nobody</Pill>) },
        ]}
      />
      <form
        id="cr-staffing"
        className="ds-stack ds-gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const chosen = queues.filter((queue) => form.get(queue) === "on");
          const fields = { kind: "careRota", person, queues: chosen.join(","), onRota: chosen.length > 0, setBy: context.actor };
          if (current) await context.mutate.patch(current.id, { fields }, { expectRevision: current.revision, event: `${person}'s care rota set to ${chosen.join(", ") || "off"} by ${context.actor}` });
          else await context.mutate.create({ collection: "preferences", title: `Care rota · ${person}`, status: "active", summary: "Which care queues this person covers.", fields }, `${person} put on the care rota by ${context.actor}`);
          context.toast("Rota saved", chosen.length ? `${person} covers ${chosen.join(", ")}.` : `${person} is off the care rota.`);
          close();
        }}
      >
        <Field label="Person"><Select value={person} onChange={(event) => setPerson(event.target.value)}>{people.map((row) => <option key={row.id}>{row.title}</option>)}</Select></Field>
        <Row gap={3} wrap key={person}>
          {queues.map((queue) => <Checkbox key={queue} name={queue} label={queue} defaultChecked={listOf(current?.fields.queues).includes(queue)} />)}
        </Row>
        <Notice tone="info">The rota records who covers a queue. Absence is not modelled here; check the leave calendar before relying on it.</Notice>
      </form>
    </Stack>
  );
}

const listOf = (value: unknown) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

/* ---------------- ARL-CARE-002 · tag / link record ---------------- */

export function TagCase({ context, close }: { context: ScreenContext; close: () => void }) {
  const ticket = useRecord(context.selectedId);
  if (!ticket || ticket.collection !== "tickets") return <Empty title="Choose a case in the list" />;
  return (
    <form
      id="cr-tag"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const tags = listOf(new FormData(event.currentTarget).get("tags")).map((tag) => tag.toLowerCase());
        await context.mutate.patch(ticket.id, { tags }, { expectRevision: ticket.revision, event: `${ref(ticket)} tagged ${tags.join(", ") || "with nothing"} by ${context.actor}` });
        context.toast("Tags saved", tags.join(", ") || "No tags.");
        close();
      }}
    >
      <h3>{ticket.title}</h3>
      <Field label="Tags" hint="Separate with commas."><TextInput name="tags" defaultValue={ticket.tags.join(", ")} /></Field>
      <Notice tone="info">Tags describe the case. A sentiment tag is a person's reading, never a certain fact about the customer.</Notice>
    </form>
  );
}

export function LinkRecord({ context, close }: { context: ScreenContext; close: () => void }) {
  const ticket = useRecord((context.overlayPayload as { id?: string } | undefined)?.id ?? context.params.id ?? context.selectedId);
  const data = useCollections(["contacts", "orders"]);
  const [contactIdRaw, setContactId] = useState<string | null>(null);
  const contactId = contactIdRaw ?? (String(ticket?.fields.contactId ?? ""));
  if (!ticket || ticket.collection !== "tickets") return <Empty title="Choose a case in the list" />;
  const orders = data.orders.filter((order) => !contactId || String(order.fields.contactId ?? "") === contactId);
  return (
    <form
      id="cr-link"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const orderId = String(new FormData(event.currentTarget).get("order") ?? "");
        const contact = data.contacts.find((row) => row.id === contactId);
        await context.mutate.patch(ticket.id, { fields: { ...ticket.fields, contactId, orderId } }, { expectRevision: ticket.revision, event: `${ref(ticket)} linked to ${contact?.title ?? "no customer"}${orderId ? ` and order ${data.orders.find((row) => row.id === orderId)?.title ?? orderId}` : ""} by ${context.actor}` });
        context.toast("Linked", `${ref(ticket)} now points at ${contact?.title ?? "no customer"}.`);
        close();
      }}
    >
      <h3>{ticket.title}</h3>
      <Field label="Customer">
        <Select value={contactId} onChange={(event) => setContactId(event.target.value)}>
          <option value="">Not linked</option>
          {data.contacts.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Order">
        <Select name="order" defaultValue={String(ticket.fields.orderId ?? "")}>
          <option value="">No order</option>
          {orders.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Linking discloses nothing">A link lets the care team see the record here. Nothing about it is added to a reply unless a person writes it in.</Notice>
    </form>
  );
}

/* ---------------- ARL-CARE-003 · filter / export ---------------- */

export function CaseFilter({ context: _context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const current = useCaseFilter();
  const [value, setValue] = useState(current);
  const owners = [...new Set(data.tickets.map((ticket) => String(ticket.fields.assignee ?? "")).filter(Boolean))].sort();
  return (
    <Stack gap={4}>
      <Field label="Priority"><Select value={value.priority} onChange={(event) => setValue({ ...value, priority: event.target.value })}><option value="">Any</option>{["low", "normal", "high", "urgent"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
      <Field label="Queue"><Select value={value.queue} onChange={(event) => setValue({ ...value, queue: event.target.value })}><option value="">Any</option>{["Technical", "Orders", "Billing", "Trade"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
      <Field label="Owner"><Select value={value.owner} onChange={(event) => setValue({ ...value, owner: event.target.value })}><option value="">Anyone</option><option value="__none">Unassigned</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</Select></Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={() => { setCaseFilter({ priority: "", queue: "", owner: "" }); close(); }}>Clear</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={() => { setCaseFilter(value); close(); }}>Apply the filter</Button>
      </Row>
    </Stack>
  );
}

export function CaseFilterNotice({ total, shown }: { total: number; shown: number }) {
  const filter = useCaseFilter();
  if (!filter.priority && !filter.queue && !filter.owner) return null;
  return (
    <Notice tone="info" title={`Filtered: ${[filter.priority, filter.queue, filter.owner === "__none" ? "unassigned" : filter.owner].filter(Boolean).join(" · ")}`}>
      <Row gap={2}><span className="ds-grow">{shown} of {total} cases shown.</span><Button size="sm" variant="ghost" onClick={() => setCaseFilter({ priority: "", queue: "", owner: "" })}>Clear the filter</Button></Row>
    </Notice>
  );
}

export async function exportCases(context: ScreenContext): Promise<void> {
  const tickets = (await listByCollection(context.org.id, "tickets")).filter((ticket) => matchesCase(ticket, caseFilterNow()));
  download(`${context.org.slug}-cases.csv`, ["ref", "subject", "priority", "queue", "owner", "status", "opened", "resolved", "csat"], tickets.map((ticket) => [
    String(ticket.fields.ref ?? ""), ticket.title, String(ticket.fields.priority ?? ""), String(ticket.fields.queue ?? ""), String(ticket.fields.assignee ?? ""), ticket.status, ticket.at ?? "", String(ticket.fields.resolvedAt ?? ""), String(ticket.fields.csat ?? 0),
  ]));
  await context.mutate.log(`${tickets.length} cases exported by ${context.actor}`, { type: "export" });
  context.toast("Cases exported", `${tickets.length} cases downloaded as CSV from this browser. Message bodies are not included.`);
}

/* ---------------- ARL-CARE-004 · reopen / assign specialist ---------------- */

export async function reopenCase(context: ScreenContext): Promise<void> {
  const ticket = await recordOf(context, context.params.id, "tickets");
  if (!ticket) { context.toast("Open a case first", "Nothing was reopened.", "blocked"); return; }
  if (isOpen(ticket)) { context.toast("Already open", `${ref(ticket)} is ${ticket.status}.`, "info"); return; }
  askFirst(context, {
    title: `Reopen ${ref(ticket)}`,
    body: "The case goes back to open. The earlier resolution, its date and who resolved it are kept on the case and in its history, and the reopen is counted.",
    rows: [
      { label: "Resolved", value: ticket.fields.resolvedAt ? context.dateTime(String(ticket.fields.resolvedAt)) : "No date recorded" },
      { label: "Times reopened before", value: String(ticket.fields.reopenCount ?? 0) },
    ],
    confirm: "Reopen the case",
    run: async () => {
      await context.mutate.patch(ticket.id, {
        status: "open",
        fields: { ...ticket.fields, reopened: true, reopenCount: Number(ticket.fields.reopenCount ?? 0) + 1, previousStatus: ticket.status, previousResolvedAt: String(ticket.fields.resolvedAt ?? ""), resolvedAt: "", reopenedBy: context.actor },
      }, { expectRevision: ticket.revision, event: `${ref(ticket)} reopened by ${context.actor}; prior resolution ${String(ticket.fields.resolvedAt ?? "")} kept` });
      context.toast("Case reopened", "The earlier resolution is preserved on the case.");
    },
  });
}

export function AssignSpecialist({ context, close }: { context: ScreenContext; close: () => void }) {
  const ticket = useRecord(context.params.id);
  const employees = useCollections(["employees"]).employees.filter((row) => row.status !== "alumni");
  if (!ticket) return <Empty title="Open a case first" />;
  return (
    <form
      id="cr-specialist"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const specialist = String(form.get("specialist") ?? "");
        const reason = String(form.get("reason") ?? "").trim();
        if (!specialist || !reason) return;
        await context.mutate.patch(ticket.id, { fields: { ...ticket.fields, assignee: specialist, specialist, previousAssignee: String(ticket.fields.assignee ?? ""), specialistReason: reason } }, { expectRevision: ticket.revision, event: `${ref(ticket)} assigned to specialist ${specialist} by ${context.actor}: ${reason}` });
        await context.mutate.create({ collection: "messages", title: `${ref(ticket)} — internal`, status: "note", summary: `Handed to ${specialist}: ${reason}`, parentId: ticket.id, at: context.now.toISOString(), fields: { kind: "ticket", author: context.actor, side: "agent", channel: "internal", internal: true } }, `Hand-off note on ${ref(ticket)}`);
        context.toast("Specialist assigned", `${specialist} owns ${ref(ticket)}; the hand-off note is internal.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Case", value: ticket.title }, { label: "Owner now", value: String(ticket.fields.assignee || "Unassigned") }]} />
      <Field label="Specialist" required>
        <Select name="specialist" required defaultValue="">
          <option value="">Choose a person</option>
          {employees.map((row) => <option key={row.id} value={row.title}>{row.title} · {String(row.fields.title ?? "")}</option>)}
        </Select>
      </Field>
      <Field label="Why a specialist" required><TextArea name="reason" rows={3} required /></Field>
    </form>
  );
}

/* ---------------- ARL-CARE-005 · schedule ---------------- */

export function ScheduleFollowUp({ context, close }: { context: ScreenContext; close: () => void }) {
  const contact = useRecord(context.params.id);
  const { now } = useWorkspace();
  const [date, setDate] = useState(new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  if (!contact) return <Empty title="Open a customer first" />;
  const at = new Date(`${date}T${time}:00.000Z`);
  const past = at < now;
  return (
    <form
      id="cr-schedule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (past) return;
        const form = new FormData(event.currentTarget);
        const kind = String(form.get("kind") ?? "Call back");
        const task = await context.mutate.create({ collection: "tasks", title: `${kind}: ${contact.title}`, status: "ready", summary: String(form.get("note") ?? ""), dueAt: at.toISOString(), startAt: at.toISOString(), endAt: at.toISOString(), parentId: contact.id, fields: { kind: "careFollowUp", contactId: contact.id, assignee: context.actor, stage: "ready", priority: "normal" } }, `${kind} with ${contact.title} scheduled by ${context.actor} for ${at.toISOString()}`);
        await logBoundary(context, kind === "Call back" ? "telephony" : "calendar.sync", `${kind} with ${contact.title} kept as a local task`, task.id);
        context.toast("Follow-up scheduled", `${kind} with ${contact.title} on ${context.dateTime(at)}, assigned to ${context.actor}. Nothing was sent to the customer.`);
        close();
      }}
    >
      <Field label="What"><Select name="kind">{["Call back", "Email follow-up", "Showroom visit"].map((kind) => <option key={kind}>{kind}</option>)}</Select></Field>
      <Row gap={3}>
        <Field label="Date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} invalid={past} /></Field>
        <Field label="Time (UTC)"><TextInput type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
      </Row>
      {past && <Notice tone="danger" title="That time has passed">Choose a time after now.</Notice>}
      <Field label="Note"><TextArea name="note" rows={2} /></Field>
      <Boundary id="calendar.sync" />
    </form>
  );
}

/* ---------------- ARL-CARE-006 · update without overwriting ---------------- */

export function ArticleRevision({ context, close }: { context: ScreenContext; close: () => void }) {
  const article = useRecord(context.selectedId);
  if (!article || article.collection !== "articles") return <Empty title="Choose an article first" />;
  const html = (article.body as { html?: string } | undefined)?.html ?? "";
  const published = article.status === "published";
  const version = String(article.fields.version ?? "1.0");
  const next = `${Number(version.split(".")[0])}.${Number(version.split(".")[1] ?? 0) + 1}`;
  return (
    <form
      id="cr-article-update"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = String(form.get("body") ?? "");
        const body = { html: `<p>${text.replace(/\n{2,}/g, "</p><p>")}</p>` };
        const title = String(form.get("title") ?? article.title);
        if (published) {
          await context.mutate.create({ collection: "articles", title, status: "draft", summary: text.slice(0, 140), fields: { ...article.fields, version: next, supersedes: article.id, helpful: 0, unhelpful: 0, supersededBy: "" }, body }, `Draft version ${next} of ${article.title} started by ${context.actor}; version ${version} stays published`);
          context.toast("New draft version", `Version ${version} stays published until v${next} is reviewed and published.`);
        } else {
          await context.mutate.patch(article.id, { title, summary: text.slice(0, 140), body }, { expectRevision: article.revision, event: `Draft ${article.title} updated by ${context.actor}` });
          context.toast("Draft updated", "It is still a draft.");
        }
        close();
      }}
    >
      <Field label="Title" required><TextInput name="title" defaultValue={article.title} required /></Field>
      <Field label="Article" required><TextArea name="body" rows={10} defaultValue={html.replace(/<\/p><p>/g, "\n\n").replace(/<[^>]+>/g, "")} required /></Field>
      {published && <Notice tone="warning" title="The published wording is not overwritten">Saving starts draft version {next}. Version {version} stays published, and is retired only when the new draft is published.</Notice>}
    </form>
  );
}

/** Publishing a draft that supersedes another article retires the old one, keeping it readable. */
export async function retireSuperseded(context: ScreenContext, draft: Rec): Promise<void> {
  const supersedes = String(draft.fields.supersedes ?? "");
  if (!supersedes) return;
  const old = await recordOf(context, supersedes, "articles");
  if (!old || old.status === "retired") return;
  await context.mutate.patch(old.id, { status: "retired", fields: { ...old.fields, supersededBy: draft.id } }, { expectRevision: old.revision, event: `${old.title} v${String(old.fields.version ?? "")} retired, superseded by v${String(draft.fields.version ?? "")}` });
}

/* ---------------- ARL-CARE-007 · activate / review ---------------- */

export async function activateMacro(context: ScreenContext): Promise<void> {
  const macro = await selectedOf(context, "macros", "a macro");
  if (!macro) return;
  const active = macro.status === "active";
  const text = `${macro.title} ${macro.summary} ${((macro.body as { steps?: string[] } | undefined)?.steps ?? []).join(" ")}`.toLowerCase();
  const hit = PROHIBITED.find((word) => text.includes(word));
  if (!active && hit) {
    context.toast("Not activated", `This macro touches a prohibited topic (“${hit}”). Automated responses are disabled for it; a person must answer those cases.`, "blocked");
    return;
  }
  if (!active && !macro.fields.articleId) {
    context.toast("Not activated", "A macro has to cite a published article before it can be offered in replies.", "blocked");
    return;
  }
  askFirst(context, {
    title: active ? `Deactivate ${macro.title}` : `Activate ${macro.title}`,
    body: active ? "It stops being offered in the reply composer. Replies that already used it are unchanged." : "It is offered in the reply composer. A person still chooses to use it and reads the reply before it is recorded.",
    confirm: active ? "Deactivate" : "Activate",
    run: async () => {
      await context.mutate.patch(macro.id, { status: active ? "draft" : "active", fields: { ...macro.fields, activatedBy: active ? "" : context.actor } }, { expectRevision: macro.revision, event: `${macro.title} ${active ? "deactivated" : "activated"} by ${context.actor}` });
      context.toast(active ? "Deactivated" : "Activated", `${macro.title} is ${active ? "no longer" : "now"} offered in replies.`);
    },
  });
}

export function ReviewMacro({ context, close }: { context: ScreenContext; close: () => void }) {
  const macro = useRecord(context.selectedId);
  const articles = useCollections(["articles"]).articles;
  if (!macro || macro.collection !== "macros") return <Empty title="Choose a macro first" />;
  const article = articles.find((row) => row.id === macro.fields.articleId);
  const stale = article && article.status !== "published";
  return (
    <form
      id="cr-macro-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const outcome = String(form.get("outcome") ?? "approved");
        await context.mutate.patch(macro.id, { status: outcome === "approved" ? macro.status : "draft", fields: { ...macro.fields, reviewedBy: context.actor, reviewedAt: context.now.toISOString(), reviewOutcome: outcome, reviewNote: String(form.get("note") ?? "") } }, { expectRevision: macro.revision, event: `${macro.title} reviewed by ${context.actor}: ${outcome}` });
        context.toast("Review recorded", outcome === "approved" ? "The macro is approved as it stands." : "The macro is back to draft until it is fixed.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Macro", value: macro.title },
        { label: "Cites", value: article ? `${article.title} v${String(article.fields.version ?? "")} (${article.status})` : "No article" },
        { label: "Last reviewed", value: macro.fields.reviewedBy ? `${String(macro.fields.reviewedBy)}, ${context.relative(String(macro.fields.reviewedAt ?? ""))}` : "Never" },
      ]} />
      {stale && <Notice tone="warning" title="The cited article is not published">It was retired or is a draft. The macro would repeat wording that is no longer approved.</Notice>}
      <Field label="Outcome"><Select name="outcome" defaultValue={stale ? "needs changes" : "approved"}><option value="approved">Approved</option><option value="needs changes">Needs changes — back to draft</option></Select></Field>
      <Field label="Note"><TextArea name="note" rows={3} /></Field>
    </form>
  );
}

/* ---------------- ARL-CARE-008 · report / acknowledge ---------------- */

export function SlaReport({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const rows = data.slas.map((policy) => {
    const covered = data.tickets.filter((ticket) => policyFor(ticket, data.slas)?.id === policy.id);
    const states = covered.map((ticket) => slaState(ticket, policy, now).status);
    return { id: policy.id, policy: policy.title, cases: covered.length, met: states.filter((state) => state === "met").length, breached: states.filter((state) => state === "breached").length, atRisk: states.filter((state) => state === "at_risk").length };
  });
  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="SLA report"
        filterable={false}
        columns={[
          { key: "policy", header: "Policy", primary: true, cell: (row) => row.policy },
          { key: "cases", header: "Cases", align: "end", cell: (row) => <span className="ds-num">{row.cases}</span> },
          { key: "met", header: "Met", align: "end", cell: (row) => <span className="ds-num">{row.met}</span> },
          { key: "risk", header: "At risk", align: "end", cell: (row) => <span className="ds-num">{row.atRisk}</span> },
          { key: "breached", header: "Breached", align: "end", cell: (row) => <Pill tone={row.breached ? "danger" : "success"}>{row.breached}</Pill> },
        ]}
      />
      <Button variant="primary" disabled={!context.can("export_data")} onClick={async () => {
        download(`${context.org.slug}-sla-report.csv`, ["policy", "cases", "met", "at_risk", "breached"], rows.map((row) => [row.policy, row.cases, row.met, row.atRisk, row.breached]));
        await context.mutate.log(`SLA report exported by ${context.actor}`, { type: "export" });
        context.toast("Report downloaded", "Counted in business hours from the records in this browser.");
      }}>Download the report</Button>
      <Notice tone="warning" title="Holidays are not excluded">No holiday calendar is loaded, so a bank holiday counts as a working day in these figures.</Notice>
    </Stack>
  );
}

export function acknowledgeBreach(context: ScreenContext, tickets: Rec[], slas: Rec[]): void {
  pickRecord(context, {
    title: "Acknowledge a breach",
    collection: "tickets",
    filter: (ticket) => !ticket.fields.breachAcknowledgedBy && slaState(ticket, policyFor(ticket, slas), context.now).status === "breached",
    describe: (ticket) => `${String(ticket.fields.assignee || "Unassigned")} · ${slaState(ticket, policyFor(ticket, slas), context.now).label}`,
    pickLabel: "Acknowledge",
    empty: tickets.length ? "No unacknowledged breach" : "No cases",
    onPick: (ticket) => askFirst(context, {
      title: `Acknowledge the breach on ${ref(ticket)}`,
      body: "Records that a named person has seen this breach. The clock and the breach stay exactly as counted; acknowledging does not pause or excuse anything.",
      confirm: "Acknowledge the breach",
      run: async () => {
        await context.mutate.patch(ticket.id, { fields: { ...ticket.fields, breachAcknowledgedBy: context.actor, breachAcknowledgedAt: context.now.toISOString() } }, { expectRevision: ticket.revision, event: `SLA breach on ${ref(ticket)} acknowledged by ${context.actor}` });
        context.toast("Breach acknowledged", `${ref(ticket)} still counts as breached; your acknowledgement is on the record.`);
      },
    }),
  });
}

/* ---------------- ARL-CARE-009 · annotate / assign coaching / export ---------------- */

export function Annotate({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const ticket = useRecord(context.selectedId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!ticket || ticket.collection !== "tickets") return <Empty title="Choose a case on the Audits tab" />;
  const messages = data.messages.filter((message) => message.parentId === ticket.id && message.fields.kind === "ticket").sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return (
    <Stack gap={3}>
      <h3>{ticket.title}</h3>
      {messages.length === 0 && <Empty title="Nothing was recorded on this case" />}
      {messages.map((message) => (
        <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}><strong className="ds-grow">{String(message.fields.author ?? "")}</strong><span className="ds-subtle ds-num">{context.dateTime(message.at)}</span></Row>
          <p className="ds-subtle">{message.summary}</p>
          {message.fields.qaNote && <Notice tone="info" title={`Annotated by ${String(message.fields.qaNoteBy ?? "")}`}>{String(message.fields.qaNote)}</Notice>}
          <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
            <TextInput aria-label={`Annotation for ${String(message.fields.author ?? "message")} at ${context.dateTime(message.at)}`} value={notes[message.id] ?? ""} onChange={(event) => setNotes({ ...notes, [message.id]: event.target.value })} placeholder="What a reviewer noticed here" />
            <Button size="sm" variant="secondary" disabled={!notes[message.id]?.trim()} onClick={async () => {
              await context.mutate.patch(message.id, { fields: { ...message.fields, qaNote: notes[message.id].trim(), qaNoteBy: context.actor } }, { expectRevision: message.revision, event: `QA annotation on ${ref(ticket)} by ${context.actor}` });
              setNotes({ ...notes, [message.id]: "" });
              context.toast("Annotation saved", "It is on the message, attributed to you.");
            }}>Annotate</Button>
          </Row>
        </div>
      ))}
    </Stack>
  );
}

export function AssignCoaching({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const ticket = data.tickets.find((row) => row.id === context.selectedId);
  const { now } = useWorkspace();
  const people = [...new Set(data.tickets.map((row) => String(row.fields.assignee ?? "")).filter(Boolean))];
  return (
    <form
      id="cr-coaching"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const person = String(form.get("person") ?? "");
        const focus = String(form.get("focus") ?? "").trim();
        if (!person || !focus) return;
        const due = String(form.get("due") ?? "");
        await context.mutate.create({ collection: "tasks", title: `Coaching: ${person} — ${focus}`, status: "ready", summary: `Assigned by ${context.actor}${ticket ? ` from ${ref(ticket)}` : ""}. A coaching conversation, not an employment decision.`, dueAt: due ? new Date(`${due}T17:00:00.000Z`).toISOString() : undefined, parentId: ticket?.id, fields: { kind: "coaching", coachee: person, coach: context.actor, focus, sourceTicketId: ticket?.id ?? "", stage: "ready", assignee: context.actor } }, `Coaching on ${focus} assigned for ${person} by ${context.actor}`);
        context.toast("Coaching assigned", `${context.actor} will coach ${person} on ${focus}.`);
        close();
      }}
    >
      {ticket && <Properties rows={[{ label: "From case", value: ticket.title }, { label: "Rating", value: Number(ticket.fields.csat ?? 0) > 0 ? `${String(ticket.fields.csat)} of 5` : "Not rated" }]} />}
      <Field label="Who" required>
        <Select name="person" required defaultValue={String(ticket?.fields.assignee ?? "")}>
          <option value="">Choose a person</option>
          {people.map((person) => <option key={person}>{person}</option>)}
        </Select>
      </Field>
      <Field label="Focus" required hint="A behaviour to practise, taken from a reviewed case."><TextInput name="focus" required /></Field>
      <Field label="By"><TextInput type="date" name="due" defaultValue={new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10)} /></Field>
      <Notice tone="warning" title="Not an employment decision">A low score is a reason to talk. Coaching is recorded as a conversation and is never used on its own for a decision about somebody's job.</Notice>
    </form>
  );
}

export async function exportQuality(context: ScreenContext): Promise<void> {
  const [tickets, reviews] = await Promise.all([listByCollection(context.org.id, "tickets"), listByCollection(context.org.id, "qaReviews")]);
  const rated = tickets.filter((ticket) => Number(ticket.fields.csat ?? 0) > 0);
  download(`${context.org.slug}-quality.csv`, ["case", "rating", "qa_tone", "qa_accuracy", "reviewed_by"], [
    ...rated.map((ticket) => [ref(ticket), String(ticket.fields.csat), "", "", ""]),
    ...reviews.map((review) => [String(review.fields.ref ?? ""), "", String(review.fields.tone ?? ""), String(review.fields.accuracy ?? ""), String(review.fields.reviewer ?? "")]),
  ]);
  await context.mutate.log(`Quality data exported by ${context.actor}: ${rated.length} ratings, ${reviews.length} reviews`, { type: "export" });
  context.toast("Quality exported", `${rated.length} ratings and ${reviews.length} reviews downloaded. The file holds cases and reviews, not a ranking of people.`);
}

