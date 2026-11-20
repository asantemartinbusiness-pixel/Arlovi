import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Headphones, Inbox, MessageSquare, Smile, Timer, Wand2 } from "lucide-react";
import {
  Avatar, BarChart, Button, Card, Checkbox, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice, OverlaySummary,
  Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { SLA_TONE, formatMinutes, slaState, type SlaState } from "./sla";
import { CoachingAssignments, matchesCase, useCaseFilter } from "./caseFilter";
import { isBreachingOrAtRisk, queueCounts, triageCompare } from "./triage";
import { DeliveryPill, LinkedContextCard, QueueBar, ResolutionCard, TriageCard, type InboxSort, type InboxView } from "./triagePanels";

export function useCareData() {
  return useCollections(["tickets", "messages", "articles", "macros", "slas", "contacts", "employees", "members", "tasks"]);
}

/** A case reference, falling back to the prefix a title already carries. */
export function refOf(ticket: Rec): string {
  const field = String(ticket.fields.ref ?? "").trim();
  if (field) return field;
  const first = ticket.title.split(" ")[0];
  return /^[A-Z]+-\d+$/.test(first) ? first : "";
}

/** The subject without the reference a title may repeat. */
export function subjectOf(ticket: Rec): string {
  const first = ticket.title.split(" ")[0];
  return /^[A-Z]+-\d+$/.test(first) ? ticket.title.slice(first.length + 1) : ticket.title;
}

export function policyFor(ticket: Rec, policies: Rec[]): Rec | undefined {
  return policies.find((policy) => policy.id === ticket.fields.slaId)
    ?? policies.find((policy) => policy.fields.priority === ticket.fields.priority);
}

export function SlaBadge({ state }: { state: SlaState }) {
  const used = state.targetMinutes === 0 ? 0 : Math.min(100, (state.usedMinutes / state.targetMinutes) * 100);
  return (
    <span className="cr-sla" title={`${state.which}: ${formatMinutes(state.usedMinutes)} of ${formatMinutes(state.targetMinutes)} used`}>
      <span className="cr-sla-bar" data-status={state.status} aria-hidden="true"><i style={{ width: `${used}%` }} /></span>
      <Pill tone={SLA_TONE[state.status]} dot>{state.label}</Pill>
    </span>
  );
}

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral" | "info"> = {
  urgent: "danger", high: "warning", normal: "info", low: "neutral",
};

function conversationOf(messages: Rec[], ticketId: string): Rec[] {
  return messages
    .filter((message) => message.parentId === ticketId && message.fields.kind === "ticket")
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-001 · Service Overview
 * ------------------------------------------------------------------ */

export function ServiceOverview({ context, lens }: { context: ScreenContext; lens: "Overview" | "Queues" | "Quality" | "Trends" }) {
  const data = useCareData();
  const { now, org } = useWorkspace();
  const open = data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const states = useMemo(
    () => new Map(data.tickets.map((ticket) => [ticket.id, slaState(ticket, policyFor(ticket, data.slas), now)])),
    [data.tickets, data.slas, now],
  );
  const breached = open.filter((ticket) => states.get(ticket.id)?.status === "breached");
  const atRisk = open.filter((ticket) => states.get(ticket.id)?.status === "at_risk");
  const rated = data.tickets.filter((ticket) => Number(ticket.fields.csat ?? 0) > 0);
  const csat = rated.length ? rated.reduce((sum, ticket) => sum + Number(ticket.fields.csat ?? 0), 0) / rated.length : 0;

  if (lens === "Queues") {
    const queues = [...new Set(data.tickets.map((ticket) => String(ticket.fields.queue ?? "Unsorted")))];
    return (
      <Grid>
        {queues.map((queue) => {
          const inQueue = open.filter((ticket) => String(ticket.fields.queue ?? "Unsorted") === queue);
          const queueBreached = inQueue.filter((ticket) => states.get(ticket.id)?.status === "breached");
          return (
            <Card
              key={queue}
              span={4}
              title={queue}
              subtitle={`${inQueue.length} open`}
              actions={queueBreached.length > 0 ? <Pill tone="danger" dot>{queueBreached.length} breached</Pill> : <Pill tone="success" dot>Within target</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/care/tickets`)}>Open the queue</Button>}
            >
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Unassigned", value: String(inQueue.filter((ticket) => !ticket.fields.assignee).length) },
                  { label: "Urgent", value: String(inQueue.filter((ticket) => ticket.fields.priority === "urgent").length) },
                  { label: "Waiting on the customer", value: String(inQueue.filter((ticket) => ticket.status === "waiting" || ticket.status === "pending").length) },
                ]} />
                <Meter value={inQueue.length - queueBreached.length} max={Math.max(1, inQueue.length)} label={`${queue} within target`} tone={queueBreached.length > 0 ? "warning" : "success"} />
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Quality") {
    return (
      <Grid>
        <Card span={5} eyebrow="CSAT" prov="human" title="Satisfaction" subtitle={`${rated.length} cases rated`}>
          {rated.length === 0 ? <Stat label="CSAT" value="Unavailable" unavailable meta="No ratings recorded" /> : (
            <Stack gap={3}>
              <Stat label="Average CSAT" value={csat.toFixed(1)} meta={`out of 5, from ${rated.length} ratings`} />
              <DonutChart
                title="Ratings"
                size={150}
                points={[5, 4, 3, 2, 1].map((score) => ({ label: `${score} star`, value: rated.filter((ticket) => Number(ticket.fields.csat) === score).length })).filter((point) => point.value > 0)}
              />
            </Stack>
          )}
        </Card>
        <Card span={7} eyebrow="QUALITY" prov="human" title="Reopened cases" subtitle="A resolution that did not hold">
          {data.tickets.filter((ticket) => ticket.fields.reopened === true).length === 0 ? (
            <Empty title="Nothing has been reopened" icon={<Smile size={20} />} />
          ) : (
            <Stack gap={2}>
              {data.tickets.filter((ticket) => ticket.fields.reopened === true).map((ticket) => (
                <Row key={ticket.id} gap={2}>
                  <span className="ds-grow ds-truncate">{ticket.title}</span>
                  <Pill tone="warning">Reopened</Pill>
                  <span className="ds-subtle">{String(ticket.fields.assignee ?? "Unassigned")}</span>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={12} title="What a sentiment score would and would not be">
          <Notice tone="warning" title="No sentiment is inferred here">
            A rating on this screen is a number a customer chose. Nothing guesses how a customer feels from the words in a message,
            because a guess like that reads as a fact once it is on a dashboard.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Trends") {
    const weeks = [5, 4, 3, 2, 1, 0].map((back) => {
      const end = new Date(now.getTime() - back * 7 * 86_400_000);
      const start = new Date(end.getTime() - 7 * 86_400_000);
      return {
        label: context.date(start, { day: "numeric", month: "short" }),
        opened: data.tickets.filter((ticket) => ticket.at && new Date(ticket.at) >= start && new Date(ticket.at) < end).length,
        resolved: data.tickets.filter((ticket) => ticket.fields.resolvedAt && new Date(String(ticket.fields.resolvedAt)) >= start && new Date(String(ticket.fields.resolvedAt)) < end).length,
      };
    });
    return (
      <Grid>
        <Card span={12} eyebrow="VOLUME" prov="human" title="Opened against resolved" subtitle="Counted from the ticket records">
          <BarChart
            title="Cases opened and resolved by week"
            height={220}
            format={(value) => String(Math.round(value))}
            series={[
              { name: "Opened", points: weeks.map((week) => ({ label: week.label, value: week.opened })) },
              { name: "Resolved", points: weeks.map((week) => ({ label: week.label, value: week.resolved })) },
            ]}
            footer="A backlog forecast would need more history than this workspace holds, so none is offered."
          />
        </Card>
        <Card span={6} eyebrow="CHANNELS" prov="human" title="By channel">
          <DonutChart
            title="Cases by channel"
            size={150}
            points={[...new Set(data.tickets.map((ticket) => String(ticket.fields.channel ?? "other")))].map((channel) => ({ label: channel, value: data.tickets.filter((ticket) => ticket.fields.channel === channel).length }))}
          />
        </Card>
        <Card span={6} eyebrow="AI WORKFORCE" prov="agent" title="Handled with help from an AI employee">
          <Stack gap={3}>
            <Stat label="Drafted by an agent" value={String(data.tickets.filter((ticket) => ticket.fields.aiDrafted === true).length)} meta="Every one was sent by a person" />
            <Notice tone="info">A draft an agent wrote is marked on the case. Nothing was sent without somebody reading it.</Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Open cases" value={String(open.length)} prov="human" meta={`${data.tickets.filter((ticket) => !ticket.fields.assignee && !["resolved", "closed"].includes(ticket.status)).length} unassigned`} onClick={() => context.navigate(`/o/${org.slug}/care/inbox`)} />
        <Stat label="Breached" value={String(breached.length)} prov="human" meta="Past the policy target" onClick={() => context.openOverlay("SLA inspector")} />
        <Stat label="At risk" value={String(atRisk.length)} prov="human" meta="Inside a quarter of the target" onClick={() => context.openOverlay("SLA inspector")} />
        <Stat label="CSAT" value={rated.length ? csat.toFixed(1) : "Unavailable"} prov={rated.length ? "human" : undefined} unavailable={rated.length === 0} meta={rated.length ? `${rated.length} ratings` : "No ratings yet"} />
      </StatRow>

      <Grid>
        <Card
          span={7}
          eyebrow="SLA"
          prov="human"
          title="Needing attention"
          subtitle={`${breached.length + atRisk.length} cases against the clock`}
          actions={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/care/inbox`)}>Open the inbox</Button>}
        >
          {breached.length + atRisk.length === 0 ? (
            <Empty title="Every open case is inside its target" icon={<Timer size={20} />} />
          ) : (
            <Stack gap={2}>
              {[...breached, ...atRisk].map((ticket) => (
                <Row key={ticket.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <Row gap={2}>{refOf(ticket) && <span className="cr-item-ref">{refOf(ticket)}</span>}<strong>{subjectOf(ticket)}</strong></Row>
                    <p className="ds-subtle">{String(ticket.fields.queue ?? "")} · {String(ticket.fields.assignee || "Unassigned")}</p>
                  </div>
                  <SlaBadge state={states.get(ticket.id)!} />
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/care/tickets/${ticket.id}`)}>Open</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="WORKLOAD" prov="human" title="Load by person" subtitle="Open cases assigned">
          <Stack gap={2}>
            {[...new Set(open.map((ticket) => String(ticket.fields.assignee ?? "")))].filter(Boolean).map((person) => {
              const theirs = open.filter((ticket) => String(ticket.fields.assignee ?? "") === person);
              return (
                <div key={person}>
                  <Row gap={2}>
                    <Avatar name={person} kind={data.members.some((member) => member.title === person && member.fields.kind === "ai") ? "ai" : "human"} size="sm" />
                    <span className="ds-grow ds-truncate">{person}</span>
                    <span className="ds-num ds-subtle">{theirs.length}</span>
                  </Row>
                  <Meter value={theirs.length} max={6} label={`${person} load`} tone={theirs.length > 5 ? "warning" : undefined} />
                </div>
              );
            })}
            {open.filter((ticket) => !ticket.fields.assignee).length > 0 && (
              <Notice tone="warning" title={`${open.filter((ticket) => !ticket.fields.assignee).length} cases have no owner`}>
                An unassigned case still has an SLA clock running against it.
              </Notice>
            )}
          </Stack>
        </Card>

        <Card span={12} eyebrow="AI WORKFORCE" prov="agent" title="Where a handover to a person happened">
          <Notice tone="info" title="Agents draft; people answer">
            {data.tickets.filter((ticket) => ticket.fields.aiDrafted === true).length} cases have a draft written by an AI employee.
            Every reply on every case in this workspace was sent by a named person, and no reply has left the browser.
          </Notice>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-002 · Omnichannel Inbox
 * ------------------------------------------------------------------ */

export function OmnichannelInbox({ context, lens }: { context: ScreenContext; lens: "Unassigned" | "Mine" | "Team" | "Waiting" | "Closed" }) {
  const data = useCareData();
  const { now, actor, org } = useWorkspace();
  /* The open case lives in the URL, so a reload, Back or a shared link reopens
     the same conversation (and its saved draft) instead of whichever case
     currently sorts first. */
  const [params, setParams] = useSearchParams();
  const activeId = params.get("case") ?? "";
  const setActiveId = useCallback((id: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("case", id); else next.delete("case");
      return next;
    }, { replace: true });
  }, [setParams]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [view, setView] = useState<InboxView>("all");
  const [sort, setSort] = useState<InboxSort>("sla");

  const rows = useMemo(() => {
    const open = data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
    if (lens === "Unassigned") return open.filter((ticket) => !ticket.fields.assignee);
    if (lens === "Mine") return open.filter((ticket) => String(ticket.fields.assignee ?? "") === actor);
    if (lens === "Waiting") return data.tickets.filter((ticket) => ["waiting", "pending"].includes(ticket.status));
    if (lens === "Closed") return data.tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status));
    return open;
  }, [data.tickets, lens, actor]);
  const stateOf = (ticket: Rec) => slaState(ticket, policyFor(ticket, data.slas), now);
  const scored = rows.map((ticket) => ({ ticket, state: stateOf(ticket) }));
  const inViewBreaching = scored.filter((row) => isBreachingOrAtRisk(row.state)).length;
  const ordered = scored
    .filter((row) => view === "all" || isBreachingOrAtRisk(row.state))
    .sort(sort === "sla" ? triageCompare : (a, b) => (b.ticket.at ?? "").localeCompare(a.ticket.at ?? ""))
    .map((row) => row.ticket);
  const counts = queueCounts(data.tickets, actor, stateOf);

  /* An explicit choice survives the case leaving this filter, so answering an
     unassigned case does not throw the reader onto a different conversation. */
  const active = data.tickets.find((ticket) => ticket.id === activeId) ?? ordered[0] ?? rows[0];
  const draft = active ? (drafts[active.id] ?? String(active.fields.replyDraft ?? "")) : "";
  const setDraft = (value: string) => { if (active) setDrafts((current) => ({ ...current, [active.id]: value })); };
  const savedDraft = active ? String(active.fields.replyDraft ?? "") : "";
  const outOfView = Boolean(active && activeId === active.id && !rows.some((ticket) => ticket.id === active.id));
  const conversation = active ? conversationOf(data.messages, active.id) : [];
  const contact = active ? data.contacts.find((row) => row.id === active.fields.contactId) : undefined;

  if (rows.length === 0) {
    return <Empty title={`Nothing is ${lens.toLowerCase()}`} icon={<Inbox size={20} />}>Cases arrive by email, chat, phone and the portal.</Empty>;
  }

  async function send(internal: boolean) {
    if (!active || !draft.trim()) return;
    await context.mutate.create({
      collection: "messages",
      title: `${String(active.fields.ref ?? "")} — ${internal ? "internal note" : "reply"}`,
      status: internal ? "note" : "recorded",
      summary: draft.trim(),
      parentId: active.id,
      at: context.now.toISOString(),
      fields: { kind: "ticket", author: actor, side: "agent", channel: internal ? "internal" : String(active.fields.channel ?? "email"), internal, delivery: internal ? "internal" : "not_sent" },
    }, `${internal ? "Internal note added" : "Reply recorded (not sent, no provider)"} on ${String(active.fields.ref ?? active.title)} by ${actor}`);
    // No provider is connected, so the reply never reached the customer: it is
    // recorded as a first response but does not stop the first-response clock.
    if (!internal && !active.fields.firstResponseAt && !active.fields.firstResponseRecordedAt) {
      const saved = await context.mutate.patch(active.id, {
        status: active.status === "new" ? "open" : active.status,
        fields: { firstResponseRecordedAt: context.now.toISOString(), assignee: String(active.fields.assignee || actor), replyDraft: "" },
      }, { event: `First reply recorded (not delivered) on ${String(active.fields.ref ?? "")}` });
      if (!saved) return;
    } else if (active.fields.replyDraft) {
      const saved = await context.mutate.patch(active.id, { fields: { replyDraft: "" } }, { event: `Saved reply draft cleared on ${String(active.fields.ref ?? "")}` });
      if (!saved) return;
    }
    setDraft("");
    setActiveId(active.id);
    context.toast(internal ? "Note added" : "Reply recorded", internal ? "It is on the case and not visible to the customer." : "It is on the case. No mail provider is connected, so nothing left this browser.");
  }

  return (
    <div className="cr-inbox">
      <aside className="ds-stack ds-gap-3">
        <QueueBar counts={counts} view={view} sort={sort} onView={setView} onSort={setSort} inView={{ total: rows.length, breaching: inViewBreaching }} />
        {ordered.length === 0 && (
          <Empty title="Nothing at risk here" icon={<Inbox size={20} />}>
            No case in {lens.toLowerCase()} is breached or close to its target.
          </Empty>
        )}
        <div className="cr-list" role="listbox" aria-label={`${lens} cases`}>
          {ordered.map((ticket) => {
            const state = stateOf(ticket);
            return (
              <button
                key={ticket.id}
                type="button"
                role="option"
                className="cr-item"
                aria-selected={ticket.id === active?.id}
                aria-current={ticket.id === active?.id ? "true" : undefined}
                onClick={() => { setActiveId(ticket.id); context.select(ticket.id); }}
              >
                <span className="cr-item-top">
                  {refOf(ticket) && <span className="cr-item-ref">{refOf(ticket)}</span>}
                  <Pill tone={PRIORITY_TONE[String(ticket.fields.priority ?? "normal")] ?? "neutral"}>{String(ticket.fields.priority ?? "")}</Pill>
                  <span className="ds-grow" />
                  <span className="ds-subtle">{String(ticket.fields.channel ?? "")}</span>
                </span>
                <span className="cr-item-subject">{subjectOf(ticket)}</span>
                <SlaBadge state={state} />
              </button>
            );
          })}
        </div>
      </aside>

      <div>
        {active ? (
          <Stack gap={4}>
            <Row gap={2} wrap>
              <strong style={{ fontSize: "var(--text-lg)" }}>{active.title}</strong>
              <Pill tone={PRIORITY_TONE[String(active.fields.priority ?? "normal")] ?? "neutral"} dot>{String(active.fields.priority ?? "")}</Pill>
              <span className="ds-grow" />
              {String(active.fields.assignee ?? "") !== actor && !["resolved", "closed"].includes(active.status) && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const saved1 = await context.mutate.patch(active.id, { status: active.status === "new" ? "open" : active.status, fields: { ...active.fields, assignee: actor } }, { expectRevision: active.revision, event: `${String(active.fields.ref ?? active.title)} taken by ${actor}` });
                    if (!saved1) return;
                    setActiveId(active.id);
                    context.toast("Assigned to you", `${String(active.fields.ref ?? active.title)} is in your queue.`);
                  }}
                >
                  Assign to me
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => { context.select(active.id); context.openOverlay("Customer inspector", { id: active.id }); }}>Customer</Button>
              <Button size="sm" variant="secondary" onClick={() => { context.select(active.id); context.openOverlay("canned reply", { id: active.id }); }}>Macros</Button>
              <Button size="sm" variant="outline-danger" onClick={() => { context.select(active.id); context.openOverlay("escalation", { id: active.id }); }}>Escalate</Button>
            </Row>

            <Row gap={3} wrap>
              <SlaBadge state={slaState(active, policyFor(active, data.slas), now)} />
              <span className="ds-subtle">{[String(active.fields.queue ?? ""), String(active.fields.assignee || "Unassigned"), `opened ${context.relative(active.at)}`].filter(Boolean).join(" · ")}</span>
            </Row>

            {outOfView && (
              <Notice tone="info" title={`This case is no longer in ${lens}`}>
                Answering it put it in {String(active.fields.assignee ?? "somebody")}&rsquo;s queue. It stays open here until you
                choose another case, so the conversation does not disappear mid-sentence.
              </Notice>
            )}

            <div className="cr-conv">
              {conversation.map((message) => (
                <div key={message.id} className="cr-bubble" data-side={String(message.fields.side ?? "customer")} data-internal={message.fields.internal === true ? "true" : undefined}>
                  <div className="cr-bubble-head">
                    <Avatar name={String(message.fields.author ?? "")} kind={data.members.some((member) => member.title === message.fields.author && member.fields.kind === "ai") ? "ai" : "human"} size="sm" />
                    <strong>{String(message.fields.author ?? "")}</strong>
                    {message.fields.internal === true && <Pill tone="warning">Internal note</Pill>}
                    <DeliveryPill message={message} />
                    <span className="ds-subtle">{context.dateTime(message.at)}</span>
                  </div>
                  <p>{message.summary}</p>
                </div>
              ))}
              {conversation.length === 0 && <Empty title="No messages on this case" icon={<MessageSquare size={20} />} />}
            </div>

            <form className="cm-composer" onSubmit={(event) => { event.preventDefault(); void send(false); }}>
              <TextArea
                rows={4}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={`Reply to ${active.title}`}
                placeholder="Write a reply. A macro can fill this in from an approved article."
              />
              <Row gap={2} wrap>
                <span className="ds-subtle ds-grow">
                  {savedDraft && savedDraft === draft ? "Draft saved on the case. " : ""}A recorded reply stays on the case: no mail or chat provider is connected, so it is not sent.
                </span>
                <Button
                  variant="ghost"
                  disabled={!draft.trim() || draft === savedDraft}
                  onClick={async () => {
                    const saved2 = await context.mutate.patch(active.id, { fields: { ...active.fields, replyDraft: draft } }, { event: `Reply draft saved on ${String(active.fields.ref ?? "")} by ${actor}` });
                    if (!saved2) return;
                    setActiveId(active.id);
                    context.toast("Draft saved", "It is kept on the case for whoever picks it up. Nothing was sent.");
                  }}
                >
                  Save draft
                </Button>
                <Button variant="secondary" disabled={!draft.trim()} onClick={() => void send(true)}>Add as an internal note</Button>
                <Button type="submit" variant="primary" disabled={!draft.trim()}>Record the reply</Button>
              </Row>
            </form>

            {contact && (
              <Notice tone="info" title={`About ${contact.title}`}>
                {String(contact.fields.company ?? "Retail customer")} · {String(contact.fields.consent ?? "")}.
                Nothing beyond what this case needs is shown here, and nothing is disclosed to the customer automatically.
              </Notice>
            )}
            <Row gap={2}>
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/care/tickets/${active.id}`)}>Open the full case</Button>
            </Row>
          </Stack>
        ) : <Empty title="Choose a case" icon={<Headphones size={20} />} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-003 · Ticket List
 * ------------------------------------------------------------------ */

export function TicketList({ context, lens }: { context: ScreenContext; lens: "All" | "Open" | "Pending" | "Resolved" | "Archived" }) {
  const data = useCareData();
  const { now, org } = useWorkspace();
  const caseFilter = useCaseFilter();
  const lensRows = lens === "All"
    ? data.tickets
    : lens === "Open"
      ? data.tickets.filter((ticket) => ["new", "open"].includes(ticket.status))
      : lens === "Pending"
        ? data.tickets.filter((ticket) => ["waiting", "pending"].includes(ticket.status))
        : lens === "Resolved"
          ? data.tickets.filter((ticket) => ticket.status === "resolved")
          : data.tickets.filter((ticket) => ticket.status === "closed");
  const rows = lensRows.filter((ticket) => matchesCase(ticket, caseFilter));

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} cases`} icon={<Headphones size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Ticket create")}>Create a case</Button>} />
  ) : (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${lens} cases`}
      selectedId={context.selectedId}
      rowTone={(row) => {
        const state = slaState(row, policyFor(row, data.slas), now);
        return state.status === "breached" ? "danger" : state.status === "at_risk" ? "warning" : undefined;
      }}
      columns={[
        { key: "ref", header: "Case", cell: (row) => <span className="cr-item-ref">{refOf(row) || "—"}</span>, sortValue: (row) => refOf(row), width: "88px" },
        { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, ""), sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "priority", header: "Priority", cell: (row) => <Pill tone={PRIORITY_TONE[String(row.fields.priority ?? "normal")] ?? "neutral"} dot>{String(row.fields.priority ?? "")}</Pill>, sortValue: (row) => String(row.fields.priority ?? "") },
        { key: "channel", header: "Channel", cell: (row) => String(row.fields.channel ?? ""), hideBelow: 1100 },
        { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee || "Unassigned"), sortValue: (row) => String(row.fields.assignee ?? "~"), hideBelow: 900, filterValue: (row) => String(row.fields.assignee ?? "") },
        { key: "sla", header: "SLA", cell: (row) => <SlaBadge state={slaState(row, policyFor(row, data.slas), now)} /> },
        { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "resolved" || row.status === "closed" ? "success" : "neutral"}>{row.status}</Pill>, sortValue: (row) => row.status },
      ]}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/care/tickets/${id}`)}
      bulkActions={[
        { label: "Route", onRun: () => context.openOverlay("bulk assignment") },
        { label: "Change priority", onRun: () => context.openOverlay("priority change") },
      ]}
      summary={<span className="ds-subtle">{rows.filter((row) => slaState(row, policyFor(row, data.slas), now).status === "breached").length} breached{rows.length !== lensRows.length ? ` · filtered, ${rows.length} of ${lensRows.length}` : ""}</span>}
    />
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-004 · Ticket Detail
 * ------------------------------------------------------------------ */

/** The clock against the SLA: the figure a case is judged by, drawn once at the top of the case. */
export function SlaClock({ ticket, policy, state, context }: { ticket: Rec; policy: Rec | undefined; state: SlaState; context: ScreenContext }) {
  const used = state.targetMinutes === 0 ? 0 : Math.min(100, (state.usedMinutes / state.targetMinutes) * 100);
  const running = state.status === "due" || state.status === "at_risk" || state.status === "breached";
  const figure = state.status === "unknown" ? "No target" : state.status === "met" ? formatMinutes(state.usedMinutes) : state.status === "paused" ? "Paused" : `${state.remainingMinutes < 0 ? "+" : ""}${formatMinutes(state.remainingMinutes)}`;
  return (
    <section className="cr-clock" data-status={state.status} aria-label="SLA clock">
      <div className="cr-clock-figure">
        <span className="ds-eyebrow">{state.which === "first response" ? "First response" : "Resolution"} {state.status === "met" ? "taken" : state.remainingMinutes < 0 ? "over by" : "remaining"}</span>
        <strong className="cr-clock-value">{figure}</strong>
      </div>
      <div className="cr-clock-track">
        <div className="cr-clock-bar" role="img" aria-label={`${Math.round(used)}% of the ${state.which} target used`}>
          <i style={{ width: `${used}%` }} />
          <span className="cr-clock-mark" style={{ left: "75%" }} title="At risk from here" />
        </div>
        <div className="cr-clock-scale ds-num"><span>0</span><span>{state.targetMinutes ? `${formatMinutes(state.usedMinutes)} of ${formatMinutes(state.targetMinutes)}` : "No target"}</span></div>
      </div>
      <dl className="cr-clock-facts">
        <div><dt>Policy</dt><dd>{policy?.title ?? "None matched"}</dd></div>
        <div><dt>Counted in</dt><dd className="ds-num">{String(policy?.fields.businessHours ?? "business hours")}</dd></div>
        <div><dt>Waiting on customer</dt><dd>{policy?.fields.pauseWhileWaiting === true ? "Pauses the clock" : "Does not pause"}</dd></div>
        <div><dt>Clock</dt><dd>{running ? "Running" : state.status === "paused" ? "Paused" : state.status === "met" ? "Stopped at resolution" : "Not applicable"}</dd></div>
      </dl>
      {ticket.fields.firstResponseRecordedAt && !ticket.fields.firstResponseAt ? <p className="ds-subtle">A reply is recorded {context.dateTime(String(ticket.fields.firstResponseRecordedAt))} but never reached the customer, so the first-response clock keeps running.</p> : null}
    </section>
  );
}

/** Opened, replies, status moves and resolution on one line of time, newest last. */
function CaseTimeline({ ticket, conversation, context }: { ticket: Rec; conversation: Rec[]; context: ScreenContext }) {
  const events: { at: string; label: string; detail?: string; tone?: "warning" | "success" }[] = [
    { at: ticket.at ?? "", label: `Opened by ${ticket.createdBy}`, detail: String(ticket.fields.channel ?? "") ? `via ${String(ticket.fields.channel)}` : undefined },
    ...conversation.slice(0, 12).map((message) => ({
      at: message.at ?? "",
      label: message.fields.internal === true ? `Internal note by ${String(message.fields.author ?? "")}` : `${String(message.fields.side) === "agent" ? "Reply from" : "Message from"} ${String(message.fields.author ?? "")}`,
      detail: message.summary,
      tone: message.fields.internal === true ? ("warning" as const) : undefined,
    })),
    ...(ticket.fields.escalatedBy ? [{ at: ticket.updatedAt, label: `Escalated by ${String(ticket.fields.escalatedBy)}`, tone: "warning" as const }] : []),
    ...(ticket.fields.resolvedAt ? [{ at: String(ticket.fields.resolvedAt), label: `Resolved by ${String(ticket.fields.resolvedBy || "someone")}`, detail: String(ticket.fields.resolutionReason ?? ""), tone: "success" as const }] : []),
  ].filter((event) => event.at).sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="cr-timeline" aria-label="Case timeline">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} data-tone={event.tone}>
          <time className="ds-num">{context.dateTime(event.at)}</time>
          <div><strong>{event.label}</strong>{event.detail ? <p className="ds-subtle ds-truncate">{event.detail}</p> : null}</div>
        </li>
      ))}
    </ol>
  );
}

export function TicketDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCareData();
  const record = useRecord(context.params.id);
  const ticket = record ?? data.tickets[0];
  const { now, org } = useWorkspace();
  const events = useCollections(["tickets"]);
  if (!ticket) return <Empty title="No case" icon={<Headphones size={20} />} />;
  const conversation = conversationOf(data.messages, ticket.id);
  const contact = data.contacts.find((row) => row.id === ticket.fields.contactId);
  const state = slaState(ticket, policyFor(ticket, data.slas), now);

  if (lens === "Conversation") {
    return (
      <Stack gap={4}>
        <div className="cr-conv">
          {conversation.map((message) => (
            <div key={message.id} className="cr-bubble" data-side={String(message.fields.side ?? "customer")} data-internal={message.fields.internal === true ? "true" : undefined}>
              <div className="cr-bubble-head">
                <Avatar name={String(message.fields.author ?? "")} size="sm" />
                <strong>{String(message.fields.author ?? "")}</strong>
                {message.fields.internal === true && <Pill tone="warning">Internal note</Pill>}
                <DeliveryPill message={message} />
                <span className="ds-subtle">{context.dateTime(message.at)}</span>
              </div>
              <p>{message.summary}</p>
            </div>
          ))}
          {conversation.length === 0 && <Empty title="Nothing has been said on this case" icon={<MessageSquare size={20} />} />}
        </div>
        <Row gap={2}>
          <Button variant="primary" onClick={() => context.openOverlay("Response composer")}>Reply</Button>
          <Button variant="secondary" onClick={() => context.openOverlay("internal note")}>Internal note</Button>
        </Row>
      </Stack>
    );
  }

  if (lens === "Tasks") {
    const tasks = data.tasks.filter((task) => String(task.fields.ticketId ?? "") === ticket.id);
    return tasks.length === 0 ? (
      <Empty title="No work was raised from this case" icon={<Timer size={20} />}>
        A case that needs the bench becomes a task in Projects, with a link back here.
      </Empty>
    ) : (
      <DataGrid
        rows={tasks}
        rowId={(row) => row.id}
        label="Work from this case"
        filterable={false}
        columns={[
          { key: "title", header: "Task", primary: true, cell: (row) => row.title },
          { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
          { key: "stage", header: "Stage", align: "end", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)}
      />
    );
  }

  if (lens === "History") {
    return ticket.history.length === 0 ? <Empty title="No earlier versions" /> : (
      <DataGrid
        rows={ticket.history.map((snapshot, index) => ({ ...snapshot, id: `${ticket.id}-${index}` }))}
        rowId={(row) => row.id}
        label="Case history"
        filterable={false}
        columns={[
          { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
          { key: "status", header: "Status then", cell: (row) => <Pill>{row.status}</Pill> },
          { key: "owner", header: "Owner then", cell: (row) => String(row.fields.assignee ?? "Unassigned") },
          { key: "summary", header: "Summary then", cell: (row) => <span className="ds-subtle">{row.summary}</span>, hideBelow: 1000 },
        ]}
      />
    );
  }

  if (lens === "Audit") {
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Opened", value: `${context.dateTime(ticket.at)} by ${ticket.createdBy}` },
          { label: "First response", value: ticket.fields.firstResponseAt ? context.dateTime(String(ticket.fields.firstResponseAt)) : ticket.fields.firstResponseRecordedAt ? `Reply recorded ${context.dateTime(String(ticket.fields.firstResponseRecordedAt))}, not delivered` : "Not yet" },
          { label: "Resolved", value: ticket.fields.resolvedAt ? context.dateTime(String(ticket.fields.resolvedAt)) : "Not yet" },
          { label: "Reopened", value: ticket.fields.reopened === true ? "Yes, at least once" : "No" },
          { label: "Revisions", value: String(ticket.revision) },
          { label: "Drafted with an AI employee", value: ticket.fields.aiDrafted === true ? "Yes, and a person sent it" : "No" },
        ]} />
        <Notice tone="info" title="Reopening keeps the first resolution">
          When a case is reopened, the earlier resolution, its date and the person who gave it stay on this record.
          {events.tickets.length > 0 ? "" : ""} Nothing is overwritten.
        </Notice>
      </Stack>
    );
  }

  const policy = policyFor(ticket, data.slas);
  return (
    <Grid>
      <div className="ds-col-12"><SlaClock ticket={ticket} policy={policy} state={state} context={context} /></div>
      <Card span={7} prov="human" title="What was reported" subtitle={[String(ticket.fields.queue ?? ""), `opened ${context.relative(ticket.at)}`].filter(Boolean).join(" · ")}>
        <Stack gap={3}>
          <p>{ticket.summary}</p>
          <Properties rows={[
            { label: "Customer", value: contact ? contact.title : "Not linked" },
            { label: "Queue", value: String(ticket.fields.queue ?? "") || "Not set" },
            { label: "Opened", value: <span className="ds-num">{context.dateTime(ticket.at)}</span> },
            { label: "Channel", value: String(ticket.fields.channel ?? "") || "Not recorded" },
            { label: "Satisfaction", value: Number(ticket.fields.csat ?? 0) > 0 ? `${String(ticket.fields.csat)} of 5` : "Not rated" },
          ]} />
        </Stack>
      </Card>
      <TriageCard context={context} ticket={ticket} state={state} />
      <Card span={6} eyebrow="TIMELINE" prov="human" title="What happened" subtitle={`${conversation.length} ${conversation.length === 1 ? "message" : "messages"} on the case`}>
        <CaseTimeline ticket={ticket} conversation={conversation} context={context} />
      </Card>
      <Card span={6} eyebrow="CUSTOMER" prov="human" title="Customer" subtitle={contact ? String(contact.fields.company ?? "Retail customer") : "No contact linked"}>
        {contact ? (
          <Stack gap={3}>
            <Row gap={3}><Avatar name={contact.title} size="lg" /><div><strong>{contact.title}</strong><p className="ds-subtle">{String(contact.fields.email ?? "")}</p></div></Row>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/care/customers/${contact.id}`)}>Open the customer</Button>
          </Stack>
        ) : <span className="ds-subtle">No contact record is linked to this case.</span>}
      </Card>
      <ResolutionCard context={context} ticket={ticket} />
      <LinkedContextCard context={context} ticket={ticket} contact={contact} />
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-005 · Customer Context
 * ------------------------------------------------------------------ */

export function CustomerContext({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCareData();
  const record = useRecord(context.params.id);
  const contact = record ?? data.contacts[0];
  const { org } = useWorkspace();
  if (!contact) return <Empty title="No customer" icon={<Headphones size={20} />} />;
  const cases = data.tickets.filter((ticket) => ticket.fields.contactId === contact.id);

  if (lens === "Cases") {
    return cases.length === 0 ? <Empty title="No cases for this customer" /> : (
      <DataGrid
        rows={cases}
        rowId={(row) => row.id}
        label="Cases"
        columns={[
          { key: "ref", header: "Case", cell: (row) => <span className="ds-num">{refOf(row) || "—"}</span>, width: "88px" },
          { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, ""), filterValue: (row) => row.title },
          { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
          { key: "csat", header: "Rating", align: "end", cell: (row) => (Number(row.fields.csat ?? 0) > 0 ? `${String(row.fields.csat)}/5` : "—") },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/care/tickets/${id}`)}
      />
    );
  }

  if (lens === "Orders") {
    return (
      <Stack gap={4}>
        <Empty title="Orders live in Commerce" icon={<BookOpen size={20} />}>
          This screen shows what customer care is allowed to see. Order detail, payment detail and anything financial stay in the
          applications that own them.
        </Empty>
        <Notice tone="warning" title="Cross-department records are redacted here">
          A care specialist sees that an order exists and its reference. Card details are never collected or stored anywhere in
          this workspace, so there is nothing to redact.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Communications") {
    return (
      <Stack gap={3}>
        {cases.flatMap((ticket) => conversationOf(data.messages, ticket.id)).slice(0, 12).map((message) => (
          <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}><strong className="ds-grow">{String(message.fields.author ?? "")}</strong><span className="ds-subtle">{context.dateTime(message.at)}</span></Row>
            <p className="ds-subtle">{message.summary}</p>
          </div>
        ))}
        {cases.length === 0 && <Empty title="No communications" />}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={5} eyebrow="CUSTOMER" prov="human" title={<Row gap={3}><Avatar name={contact.title} size="lg" />{contact.title}</Row>} subtitle={String(contact.fields.company ?? "Retail customer")}>
        <Properties rows={[
          { label: "Email", value: String(contact.fields.email ?? "") },
          { label: "Phone", value: <span className="ds-subtle">{String(contact.fields.phone ?? "Not shared")}</span> },
          { label: "Kind", value: String(contact.fields.kind ?? "") },
          { label: "Customer since", value: <span className="ds-num">{context.date(contact.at)}</span> },
        ]} />
      </Card>
      <Card span={7} eyebrow="CONSENT" prov="human" title="Consent and preferences" subtitle="What the customer agreed to">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Marketing", value: String(contact.fields.consent ?? "Not recorded") },
            { label: "Identity verified", value: contact.fields.verifiedIdentity === true ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill> },
            { label: "Preferred channel", value: String(cases[0]?.fields.channel ?? "Not recorded") },
          ]} />
          {contact.fields.verifiedIdentity !== true && (
            <Notice tone="warning" title="Identity has not been verified">
              Nothing account-specific should be read out to this person until somebody has verified who they are.
            </Notice>
          )}
        </Stack>
      </Card>
      <Card span={12} eyebrow="HISTORY" prov="posted" title="Case history" subtitle={`${cases.length} cases`}>
        <Stack gap={2}>
          {cases.map((ticket) => (
            <Row key={ticket.id} gap={2}>
              <span className="cr-item-ref">{String(ticket.fields.ref ?? "")}</span>
              <span className="ds-grow ds-truncate">{ticket.title.replace(/^[A-Z]+-\d+\s/, "")}</span>
              <Pill tone={ticket.status === "closed" || ticket.status === "resolved" ? "success" : "neutral"}>{ticket.status}</Pill>
            </Row>
          ))}
          {cases.length === 0 && <span className="ds-subtle">No cases yet.</span>}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-006 · Knowledge Base
 * ------------------------------------------------------------------ */

export function KnowledgeBase({ context, lens }: { context: ScreenContext; lens: "Internal" | "Public" | "Draft" | "Retired" }) {
  const data = useCareData();
  const rows = lens === "Draft"
    ? data.articles.filter((article) => article.status === "draft")
    : lens === "Retired"
      ? data.articles.filter((article) => article.status === "retired")
      : data.articles.filter((article) => article.status === "published" && String(article.fields.audience ?? "") === lens.toLowerCase());

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} articles`} icon={<BookOpen size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Rich editor")}>Write an article</Button>} />
  ) : (
    <Stack gap={4}>
      {rows.map((article) => {
        const html = (article.body as { html?: string } | undefined)?.html ?? "";
        const superseded = String(article.fields.supersededBy ?? "");
        return (
          <Card
            key={article.id}
            title={article.title}
            subtitle={`Version ${String(article.fields.version ?? "1.0")} · ${String(article.fields.audience ?? "")} · updated ${context.relative(article.updatedAt)}`}
            actions={<Pill tone={article.status === "published" ? "success" : article.status === "retired" ? "warning" : "neutral"} dot>{article.status}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(article.id); context.openOverlay("Rich editor", { id: article.id }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(article.id); context.openOverlay("relevance test", { id: article.id }); }}>Test an answer</Button>
              <span className="ds-grow" />
              <span className="ds-subtle">{String(article.fields.helpful ?? 0)} found it useful · {String(article.fields.unhelpful ?? 0)} did not</span>
            </>}
          >
            <div className="cr-article" data-status={article.status}>
              <p className="ds-prose">{html.replace(/<[^>]+>/g, " ").trim()}</p>
            </div>
            {superseded && (
              <Notice tone="warning" title="This article has been superseded">
                It is kept so a reply that cited it can still be read in context. The current guidance is in {data.articles.find((row) => row.id === superseded)?.title ?? "another article"}.
              </Notice>
            )}
          </Card>
        );
      })}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-007 · Macros & Automation
 * ------------------------------------------------------------------ */

export function Automation({ context, lens }: { context: ScreenContext; lens: "Macros" | "Rules" | "Runs" | "Exceptions" }) {
  const data = useCareData();

  if (lens === "Rules") {
    const rules = [
      { id: "r1", when: "Channel is phone and priority is urgent", then: "Route to Technical and page the on-call maker", active: true },
      { id: "r2", when: "Subject mentions a refund", then: "Route to Billing and hold any automated reply", active: true },
      { id: "r3", when: "No first response within half the target", then: "Flag the case on the overview", active: true },
      { id: "r4", when: "Customer replies to a resolved case", then: "Reopen and keep the earlier resolution", active: true },
    ];
    return (
      <Stack gap={4}>
        <DataGrid
          rows={rules}
          rowId={(row) => row.id}
          label="Routing rules"
          filterable={false}
          columns={[
            { key: "when", header: "When", primary: true, cell: (row) => row.when },
            { key: "then", header: "Then", cell: (row) => row.then },
            { key: "active", header: "Active", align: "end", cell: (row) => <Pill tone={row.active ? "success" : "neutral"} dot>{row.active ? "on" : "off"}</Pill> },
          ]}
        />
        <Notice tone="warning" title="Automated replies are off for some subjects">
          Refunds, legal questions and anything about somebody's health are never answered automatically. A case on one of those
          subjects waits for a person however busy the queue is.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Runs") {
    const runs = data.macros.filter((macro) => Number(macro.fields.uses ?? 0) > 0);
    return (
      <DataGrid
        rows={runs}
        rowId={(row) => row.id}
        label="Macro use"
        filterable={false}
        columns={[
          { key: "title", header: "Macro", primary: true, cell: (row) => row.title },
          { key: "uses", header: "Times used", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.uses ?? 0)}</span>, sortValue: (row) => Number(row.fields.uses ?? 0) },
          { key: "article", header: "Cites", cell: (row) => data.articles.find((article) => article.id === row.fields.articleId)?.title ?? "No article" },
        ]}
      />
    );
  }

  if (lens === "Exceptions") {
    const drafts = data.macros.filter((macro) => macro.status === "draft");
    const uncited = data.macros.filter((macro) => !macro.fields.articleId);
    return (
      <Stack gap={3}>
        {drafts.map((macro) => <Notice key={macro.id} tone="warning" title={`${macro.title} is still a draft`}>It does not appear in the reply composer until somebody activates it.</Notice>)}
        {uncited.map((macro) => <Notice key={macro.id} tone="info" title={`${macro.title} cites no article`}>A macro without an approved article behind it is a template, not an answer.</Notice>)}
        {drafts.length === 0 && uncited.length === 0 && <Empty title="No exceptions" icon={<Wand2 size={20} />} />}
      </Stack>
    );
  }

  return (
    <Grid>
      {data.macros.map((macro) => {
        const steps = (macro.body as { steps?: string[] } | undefined)?.steps ?? [];
        return (
          <Card
            key={macro.id}
            span={6}
            title={macro.title}
            subtitle={macro.summary}
            actions={<Pill tone={macro.status === "active" ? "success" : "neutral"} dot>{macro.status}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(macro.id); context.openOverlay("Macro editor", { id: macro.id }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(macro.id); context.openOverlay("audience preview", { id: macro.id }); }}>Simulate</Button>
              <span className="ds-grow" />
              <span className="ds-subtle">used {String(macro.fields.uses ?? 0)} times</span>
            </>}
          >
            <Stack gap={2}>
              <ol className="ds-stack ds-gap-1" style={{ paddingInlineStart: "1.2em" }}>
                {steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {Boolean(macro.fields.articleId) && (
                <p className="ds-subtle">Cites {data.articles.find((article) => article.id === macro.fields.articleId)?.title}.</p>
              )}
            </Stack>
          </Card>
        );
      })}
      {data.macros.length === 0 && <Empty title="No macros" icon={<Wand2 size={20} />} />}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-008 · Service SLAs
 * ------------------------------------------------------------------ */

export function Slas({ context, lens }: { context: ScreenContext; lens: "Policies" | "Breaches" | "Exceptions" | "History" }) {
  const data = useCareData();
  const { now, org } = useWorkspace();

  if (lens === "Breaches") {
    const breached = data.tickets.filter((ticket) => slaState(ticket, policyFor(ticket, data.slas), now).status === "breached");
    return breached.length === 0 ? <Empty title="Nothing is breached" icon={<Timer size={20} />} /> : (
      <DataGrid
        rows={breached}
        rowId={(row) => row.id}
        label="Breached cases"
        rowTone={() => "danger"}
        columns={[
          { key: "ref", header: "Case", cell: (row) => <span className="ds-num">{refOf(row) || "—"}</span>, width: "88px" },
          { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, ""), filterValue: (row) => row.title },
          { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee || "Unassigned") },
          { key: "over", header: "Over by", align: "end", cell: (row) => <span className="ds-num">{formatMinutes(slaState(row, policyFor(row, data.slas), now).remainingMinutes)}</span> },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/care/tickets/${id}`)}
      />
    );
  }

  if (lens === "Exceptions") {
    return (
      <Stack gap={4}>
        <Card title="When the clock does not run">
          <Properties rows={[
            { label: "Outside business hours", value: "Mon–Fri 09:00–17:30 in this organisation's time zone" },
            { label: "Waiting on the customer", value: "The resolution clock pauses while a case is waiting" },
            { label: "Public holidays", value: "Excluded by the policy, when a holiday calendar is recorded" },
            { label: "Suspended cases", value: "A case put on hold stops both clocks until it is picked up" },
          ]} />
        </Card>
        <Notice tone="warning" title="No holiday calendar is loaded">
          The policies say holidays are excluded, but this workspace has no holiday list, so a bank holiday currently counts as a
          working day. That is stated rather than quietly assumed.
        </Notice>
      </Stack>
    );
  }

  if (lens === "History") {
    const resolved = data.tickets.filter((ticket) => Boolean(ticket.fields.resolvedAt));
    const met = resolved.filter((ticket) => slaState(ticket, policyFor(ticket, data.slas), now).status === "met");
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Resolved cases" value={String(resolved.length)} prov="human" />
          <Stat label="Inside target" value={String(met.length)} prov="human" meta={`${Math.round((met.length / Math.max(1, resolved.length)) * 100)}% of resolved cases`} />
          <Stat label="Outside target" value={String(resolved.length - met.length)} prov="human" />
        </StatRow>
        <DataGrid
          rows={resolved}
          rowId={(row) => row.id}
          label="Resolution history"
          columns={[
            { key: "ref", header: "Case", cell: (row) => <span className="ds-num">{refOf(row) || "—"}</span>, width: "88px" },
            { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, ""), filterValue: (row) => row.title },
            { key: "resolved", header: "Resolved", cell: (row) => context.date(String(row.fields.resolvedAt ?? "")), sortValue: (row) => String(row.fields.resolvedAt ?? "") },
            { key: "result", header: "Against target", align: "end", cell: (row) => {
              const state = slaState(row, policyFor(row, data.slas), now);
              return <Pill tone={SLA_TONE[state.status]} dot>{state.label}</Pill>;
            } },
          ]}
        />
      </Stack>
    );
  }

  return (
    <Grid>
      {data.slas.map((policy) => {
        const covered = data.tickets.filter((ticket) => policyFor(ticket, data.slas)?.id === policy.id);
        const breached = covered.filter((ticket) => slaState(ticket, policy, now).status === "breached");
        return (
          <Card
            key={policy.id}
            span={6}
            title={policy.title}
            subtitle={policy.summary}
            actions={<Pill tone={breached.length ? "warning" : "success"} dot>{covered.length} cases</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(policy.id); context.openOverlay("SLA form", { id: policy.id }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(policy.id); context.openOverlay("policy impact", { id: policy.id }); }}>What a change would do</Button>
            </>}
          >
            <Properties rows={[
              { label: "Priority", value: String(policy.fields.priority ?? "") },
              { label: "First response", value: <span className="ds-num">{String(policy.fields.firstResponseHours ?? 0)} business hours</span> },
              { label: "Resolution", value: <span className="ds-num">{String(policy.fields.resolutionHours ?? 0)} business hours</span> },
              { label: "Counted in", value: String(policy.fields.businessHours ?? "") },
              { label: "Pauses while waiting", value: policy.fields.pauseWhileWaiting === true ? "Yes" : "No" },
              { label: "Breached now", value: <span className="ds-num">{String(breached.length)}</span> },
            ]} />
          </Card>
        );
      })}
      {data.slas.length === 0 && <Empty title="No policies" icon={<Timer size={20} />} />}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-CARE-009 · Quality & Satisfaction
 * ------------------------------------------------------------------ */

export function Quality({ context, lens }: { context: ScreenContext; lens: "Surveys" | "Audits" | "Coaching" | "Reports" }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const rated = data.tickets.filter((ticket) => Number(ticket.fields.csat ?? 0) > 0);

  if (lens === "Audits") {
    const sample = data.tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status)).slice(0, 6);
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A sample, not a verdict">
          Six closed cases, read by a person against the written scorecard. An audit is evidence for a conversation,
          not an input to anybody's employment record.
        </Notice>
        <DataGrid
          rows={sample}
          rowId={(row) => row.id}
          label="Cases sampled for audit"
          filterable={false}
          columns={[
            { key: "ref", header: "Case", cell: (row) => <span className="ds-num">{refOf(row) || "—"}</span>, width: "88px" },
            { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, "") },
            { key: "owner", header: "Handled by", cell: (row) => String(row.fields.assignee || "Unassigned") },
            { key: "csat", header: "Customer rating", align: "end", cell: (row) => (Number(row.fields.csat ?? 0) > 0 ? `${String(row.fields.csat)}/5` : "Not rated") },
          ]}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => { context.select(id); context.openOverlay("QA scorecard", { id }); }}
        />
      </Stack>
    );
  }

  if (lens === "Coaching") {
    const people = [...new Set(data.tickets.map((ticket) => String(ticket.fields.assignee ?? "")))].filter(Boolean);
    return (
      <Grid>
        {people.map((person) => {
          const theirs = rated.filter((ticket) => String(ticket.fields.assignee ?? "") === person);
          const average = theirs.length ? theirs.reduce((sum, ticket) => sum + Number(ticket.fields.csat ?? 0), 0) / theirs.length : 0;
          return (
            <Card key={person} span={4} title={<Row gap={2}><Avatar name={person} size="sm" />{person}</Row>} subtitle={`${theirs.length} rated cases`}>
              <Stack gap={3}>
                {theirs.length === 0 ? (
                  <Stat label="Average rating" value="Unavailable" unavailable meta="No rated cases" />
                ) : (
                  <>
                    <Stat label="Average rating" value={average.toFixed(1)} meta={`from ${theirs.length} ratings`} />
                    <Meter value={average} max={5} label={`${person} average rating`} tone={average >= 4 ? "success" : average >= 3 ? undefined : "warning"} />
                  </>
                )}
              </Stack>
            </Card>
          );
        })}
        <Card span={12} eyebrow="COACHING" prov="human" title="Coaching assigned">
          <CoachingAssignments context={context} />
        </Card>
        <Card span={12} title="How a low score is used">
          <Notice tone="warning" title="A rating is not an employment decision">
            A low score opens a conversation about a case. It is never used on its own to make a decision about somebody's job,
            and this workspace will not produce a ranking of people from customer ratings.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Reports") {
    const months = [3, 2, 1, 0].map((back) => {
      const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      const inMonth = data.tickets.filter((ticket) => ticket.at && new Date(ticket.at) >= start && new Date(ticket.at) < end);
      const ratedInMonth = inMonth.filter((ticket) => Number(ticket.fields.csat ?? 0) > 0);
      return {
        label: start.toLocaleString("en-GB", { month: "short" }),
        cases: inMonth.length,
        csat: ratedInMonth.length ? ratedInMonth.reduce((sum, ticket) => sum + Number(ticket.fields.csat ?? 0), 0) / ratedInMonth.length : 0,
      };
    });
    return (
      <Grid>
        <Card span={7} title="Volume by month">
          <BarChart title="Cases opened by month" height={200} format={(value) => String(Math.round(value))} series={[{ name: "Cases", points: months.map((month) => ({ label: month.label, value: month.cases })) }]} />
        </Card>
        <Card span={5} title="Average rating by month">
          <BarChart title="Average rating by month" height={200} format={(value) => value.toFixed(1)} series={[{ name: "CSAT", points: months.map((month) => ({ label: month.label, value: month.csat })) }]} footer="A month with no ratings shows zero because there is nothing to average, not because customers were unhappy." />
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Responses" value={String(rated.length)} prov="human" meta={`of ${data.tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status)).length} closed cases`} />
        <Stat label="Average" value={rated.length ? (rated.reduce((sum, ticket) => sum + Number(ticket.fields.csat ?? 0), 0) / rated.length).toFixed(1) : "Unavailable"} unavailable={rated.length === 0} meta="out of 5" />
        <Stat label="Survey delivery" value="Not connected" unavailable meta="A request is recorded, not emailed" />
      </StatRow>
      <DataGrid
        rows={rated}
        rowId={(row) => row.id}
        label="Survey responses"
        columns={[
          { key: "ref", header: "Case", cell: (row) => <span className="ds-num">{refOf(row) || "—"}</span>, width: "88px" },
          { key: "subject", header: "Subject", primary: true, cell: (row) => row.title.replace(/^[A-Z]+-\d+\s/, ""), filterValue: (row) => row.title },
          { key: "owner", header: "Handled by", cell: (row) => String(row.fields.assignee || "Unassigned"), hideBelow: 900 },
          { key: "score", header: "Rating", align: "end", cell: (row) => <Pill tone={Number(row.fields.csat) >= 4 ? "success" : Number(row.fields.csat) >= 3 ? "neutral" : "warning"}>{String(row.fields.csat)}/5</Pill>, sortValue: (row) => Number(row.fields.csat ?? 0) },
        ]}
        onSelect={(id) => context.select(id)}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function ResponseComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCareData();
  const ticket = useRecord(payload?.id ?? context.params.id ?? context.selectedId) ?? data.tickets[0];
  const [text, setText] = useState("");
  const [macroId, setMacroId] = useState("");
  if (!ticket) return <Empty title="No case" />;
  const macro = data.macros.find((row) => row.id === macroId);
  const article = macro ? data.articles.find((row) => row.id === macro.fields.articleId) : undefined;

  return (
    <form
      id="cr-response"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: `${String(ticket.fields.ref ?? "")} — reply`,
          status: "recorded",
          summary: text.trim(),
          parentId: ticket.id,
          at: context.now.toISOString(),
          fields: { kind: "ticket", author: context.actor, side: "agent", channel: String(ticket.fields.channel ?? "email"), internal: false, delivery: "not_sent" },
        }, `Reply recorded on ${String(ticket.fields.ref ?? ticket.title)} by ${context.actor}`);
        if (!ticket.fields.firstResponseAt && !ticket.fields.firstResponseRecordedAt) {
          // Recorded, not delivered: the first-response clock keeps running.
          const saved = await context.mutate.patch(ticket.id, {
            status: ticket.status === "new" ? "open" : ticket.status,
            fields: { firstResponseRecordedAt: context.now.toISOString(), assignee: String(ticket.fields.assignee || context.actor) },
          }, { event: `First reply recorded (not delivered) on ${String(ticket.fields.ref ?? "")}` });
          if (!saved) return;
        }
        if (macro) {
          const saved3 = await context.mutate.patch(macro.id, { fields: { ...macro.fields, uses: Number(macro.fields.uses ?? 0) + 1 } }, { event: `${macro.title} used` });
          if (!saved3) return;
        }
        context.toast("Reply recorded", "It is on the case with your name. Nothing was sent outside this browser.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Case", value: ticket.title },
        { label: "Channel", value: String(ticket.fields.channel ?? "") },
      ]} />
      <Field label="Insert a macro" hint="A macro fills the box from an approved article; you can still edit it.">
        <Select
          value={macroId}
          onChange={(event) => {
            setMacroId(event.target.value);
            const chosen = data.macros.find((row) => row.id === event.target.value);
            const cited = chosen ? data.articles.find((row) => row.id === chosen.fields.articleId) : undefined;
            if (cited) {
              const html = (cited.body as { html?: string } | undefined)?.html ?? "";
              setText(`Thank you for getting in touch.\n\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n${context.actor}`);
            }
          }}
        >
          <option value="">No macro</option>
          {data.macros.filter((row) => row.status === "active").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {article && <Notice tone="info" title={`Cites ${article.title}`}>Version {String(article.fields.version ?? "")}, {String(article.fields.audience ?? "")}. The reply says only what the approved article says.</Notice>}
      <Field label="Reply" required><TextArea value={text} onChange={(event) => setText(event.target.value)} rows={8} required /></Field>
      <Notice tone="warning" title="Nothing is sent from here">
        No mail or chat provider is connected. The reply is recorded on the case with its author and time, which is what the rest
        of this workspace reads.
      </Notice>
    </form>
  );
}

export function CannedReply({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.selectedId);
  return (
    <Stack gap={3}>
      {data.macros.filter((macro) => macro.status === "active").map((macro) => {
        const article = data.articles.find((row) => row.id === macro.fields.articleId);
        return (
          <button
            key={macro.id}
            type="button"
            className="cr-macro"
            onClick={() => {
              context.select(ticket?.id ?? context.selectedId);
              context.openOverlay("Response composer", { id: ticket?.id });
            }}
          >
            <strong>{macro.title}</strong>
            <span className="ds-subtle">{macro.summary}</span>
            <span className="ds-subtle ds-num">{[(((macro.body as { steps?: string[] } | undefined)?.steps ?? []).map((step) => step.match(/^Set the queue to (\w+)/)?.[1]).find(Boolean) ?? "Any queue"), `${String(macro.fields.steps ?? 0)} steps`, `used ${String(macro.fields.uses ?? 0)} times`].join(" · ")}</span>
            {article && <span className="ds-subtle">Cites {article.title} v{String(article.fields.version ?? "")}</span>}
          </button>
        );
      })}
      <Notice tone="warning" title="Prohibited subjects">
        No macro answers a question about a refund amount, legal advice or anybody's health. Those wait for a person.
      </Notice>
    </Stack>
  );
}

export function CustomerInspector({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.selectedId) ?? data.tickets[0];
  const contact = ticket ? data.contacts.find((row) => row.id === ticket.fields.contactId) : undefined;
  if (!contact) return <Empty title="No customer linked to this case" />;
  const cases = data.tickets.filter((row) => row.fields.contactId === contact.id);
  return (
    <Stack gap={4}>
      <Row gap={3}><Avatar name={contact.title} size="lg" /><div><h3>{contact.title}</h3><p className="ds-subtle">{String(contact.fields.company ?? "Retail customer")}</p></div></Row>
      <Properties rows={[
        { label: "Email", value: String(contact.fields.email ?? "") },
        { label: "Phone", value: String(contact.fields.phone ?? "Not shared") },
        { label: "Identity", value: contact.fields.verifiedIdentity === true ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill> },
        { label: "Cases", value: <span className="ds-num">{String(cases.length)}</span> },
        { label: "Consent", value: String(contact.fields.consent ?? "") },
      ]} />
      <Notice tone="info" title="Only what this case needs">
        Order values, payment detail and anything from another department are not shown here, and nothing is read out to a
        customer whose identity has not been verified.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/care/customers/${contact.id}`)}>Open the customer</Button>
    </Stack>
  );
}

export function CaseSummary({ context, eyebrow }: { context: ScreenContext; eyebrow: string }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.params.id ?? context.selectedId) ?? data.tickets[0];
  if (!ticket) return null;
  const state = slaState(ticket, policyFor(ticket, data.slas), now);
  return (
    <OverlaySummary
      eyebrow={eyebrow}
      title={ticket.title}
      status={<Pill tone={SLA_TONE[state.status]} dot>{state.label}</Pill>}
      meta={[String(ticket.fields.queue ?? ""), `priority ${String(ticket.fields.priority ?? "normal")}`, `owner ${String(ticket.fields.assignee || "unassigned")}`]}
    />
  );
}

export function Escalation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.params.id ?? context.selectedId) ?? data.tickets[0];
  const [why, setWhy] = useState("");
  if (!ticket) return <Empty title="No case" />;
  const current = String(ticket.fields.assignee ?? "");
  const people = data.employees.filter((employee) => employee.status !== "alumni" && employee.title !== current);
  const reason = why.trim();
  return (
    <form
      id="cr-escalate"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (reason.length < 10) { context.toast("Say why", "An escalation needs a reason of at least a sentence.", "blocked"); return; }
        const form = new FormData(event.currentTarget);
        const to = String(form.get("to") ?? "");
        const saved = await context.mutate.patch(ticket.id, {
          status: "open",
          fields: { ...ticket.fields, assignee: to, previousAssignee: current, priority: String(form.get("priority") ?? ticket.fields.priority), queue: String(form.get("queue") ?? ticket.fields.queue), escalatedBy: context.actor },
        }, { expectRevision: ticket.revision, event: `${String(ticket.fields.ref ?? "")} escalated to ${to} by ${context.actor}` });
        if (!saved) return;
        await context.mutate.create({
          collection: "messages",
          title: `${String(ticket.fields.ref ?? "")} — internal note`,
          status: "note",
          summary: `Escalated to ${to}. ${reason}`,
          parentId: ticket.id,
          at: context.now.toISOString(),
          fields: { kind: "ticket", author: context.actor, side: "agent", channel: "internal", internal: true },
        }, `Escalation note added to ${String(ticket.fields.ref ?? "")}`);
        context.toast("Escalated", `${to} owns this case now, and the reason is on the record.`);
        close();
      }}
    >
      <Field label="Escalate to" required>
        <Select name="to" required>
          {people.map((employee) => <option key={employee.id}>{employee.title}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="Queue"><Select name="queue" defaultValue={String(ticket.fields.queue ?? "")}>{["Technical", "Orders", "Billing", "Trade"].map((queue) => <option key={queue}>{queue}</option>)}</Select></Field>
        <Field label="Priority"><Select name="priority" defaultValue={String(ticket.fields.priority ?? "normal")}>{["low", "normal", "high", "urgent"].map((priority) => <option key={priority}>{priority}</option>)}</Select></Field>
      </Row>
      <Field label="Why" required hint={reason.length < 10 ? "Say what has been tried and what is needed: at least a sentence." : undefined}>
        <TextArea name="why" rows={3} required value={why} onChange={(event) => setWhy(event.target.value)} />
      </Field>
      <Notice tone="info">The owner changes and an internal note records why. The customer sees nothing new.</Notice>
    </form>
  );
}

export function InternalNote({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const ticket = useRecord(context.params.id ?? context.selectedId) ?? data.tickets[0];
  if (!ticket) return <Empty title="No case" />;
  const resolved = Boolean(ticket.fields.resolvedAt);
  return (
    <form
      id="cr-note"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const reopen = form.get("reopen") === "on";
        await context.mutate.create({
          collection: "messages",
          title: `${String(ticket.fields.ref ?? "")} — internal note`,
          status: "note",
          summary: String(form.get("note") ?? ""),
          parentId: ticket.id,
          at: context.now.toISOString(),
          fields: { kind: "ticket", author: context.actor, side: "agent", channel: "internal", internal: true },
        }, `Internal note added to ${String(ticket.fields.ref ?? "")}`);
        if (reopen && resolved) {
          const saved5 = await context.mutate.patch(ticket.id, {
            status: "open",
            fields: {
              ...ticket.fields,
              reopened: true,
              previousResolutionAt: String(ticket.fields.resolvedAt ?? ""),
              previousResolutionBy: String(ticket.fields.assignee ?? ""),
              resolvedAt: "",
            },
          }, { expectRevision: ticket.revision, event: `${String(ticket.fields.ref ?? "")} reopened by ${context.actor}; earlier resolution preserved` });
          if (!saved5) return;
        }
        context.toast(reopen && resolved ? "Case reopened" : "Note added", reopen && resolved ? "The earlier resolution and its date are kept on the record." : "It is on the case and not visible to the customer.");
        close();
      }}
    >
      <Field label="Note" required><TextArea name="note" rows={4} required /></Field>
      {resolved && <Checkbox name="reopen" label="Reopen this case" />}
      {resolved && (
        <Notice tone="info" title="Reopening keeps what was already there">
          The first resolution, its date and the person who gave it stay on the record, and the case is marked as reopened.
        </Notice>
      )}
    </form>
  );
}

const FINISHED_TASK = new Set(["done", "closed", "cancelled", "canceled", "rejected", "declined"]);

/** The refund request still waiting on finance for this case, if there is one. */
export function pendingRefundFor(ticket: Rec | undefined, tasks: Rec[]): Rec | undefined {
  if (!ticket) return undefined;
  return tasks.find((task) => task.fields.ticketId === ticket.id
    && task.title.startsWith("Refund request")
    && !FINISHED_TASK.has(task.status)
    && !FINISHED_TASK.has(String(task.fields.stage ?? "")));
}

export function RefundFooter({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const ticket = useRecord(context.params.id ?? context.selectedId) ?? data.tickets[0];
  const pending = pendingRefundFor(ticket, data.tasks);
  return (
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <span className="ds-grow" />
      <Button variant="primary" type="submit" form="cr-refund" disabled={Boolean(pending)}>Request from finance</Button>
    </>
  );
}

export function RefundRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const ticket = useRecord(context.params.id ?? context.selectedId) ?? data.tickets[0];
  const [amount, setAmount] = useState("0.00");
  if (!ticket) return <Empty title="No case" />;
  const pending = pendingRefundFor(ticket, data.tasks);
  return (
    <form
      id="cr-refund"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pendingRefundFor(ticket, data.tasks)) {
          context.toast("Refund already requested", "This case already has a refund request waiting on finance. A second one is refused.", "blocked");
          return;
        }
        await context.mutate.create({
          collection: "tasks",
          title: `Refund request for ${String(ticket.fields.ref ?? "")}`,
          status: "ready",
          summary: `${context.money(Math.round(Number(amount) * 100))} requested by ${context.actor}. Awaiting a finance decision. No payment processor is connected.`,
          fields: { stage: "ready", assignee: "Jonah Adeyemi", priority: "high", estimateHours: 1, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false, ticketId: ticket.id },
        }, `Refund requested on ${String(ticket.fields.ref ?? "")} by ${context.actor}`);
        const saved6 = await context.mutate.patch(ticket.id, { status: "pending", fields: { ...ticket.fields, refundRequested: true } }, { event: `Refund requested on ${String(ticket.fields.ref ?? "")}` });
        if (!saved6) return;
        context.toast("Refund requested", "A finance task was created. Nothing has been refunded and no card has been touched.");
        close();
      }}
    >
      <Properties rows={[{ label: "Case", value: ticket.title }, { label: "Customer", value: data.contacts.find((row) => row.id === ticket.fields.contactId)?.title ?? "Not linked" }]} />
      {pending ? (
        <Notice tone="danger" title="A refund has already been requested on this case">
          {pending.summary || pending.title} Finance has not decided it yet, so a second request is refused. One case carries one refund request at a time.
        </Notice>
      ) : null}
      <Field label="Amount" required>
        <Row gap={2}>
          <span className="ds-subtle">{context.org.currency}</span>
          <TextInput value={amount} inputMode="decimal" align="end" onChange={(event) => setAmount(event.target.value)} required />
        </Row>
      </Field>
      <Notice tone="warning" title="Nothing is refunded from here">
        No payment processor is connected to this workspace. This raises a task for finance and puts the case on hold.
        Never tell a customer a refund has been taken.
      </Notice>
    </form>
  );
}

export function SlaInspector({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const open = data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const rows = open.map((ticket) => ({ ticket, state: slaState(ticket, policyFor(ticket, data.slas), now) }))
    .filter((row) => row.state.status === "breached" || row.state.status === "at_risk")
    .sort((a, b) => a.state.remainingMinutes - b.state.remainingMinutes);
  return rows.length === 0 ? <Empty title="Everything is inside its target" icon={<Timer size={20} />} /> : (
    <Stack gap={3}>
      {rows.map((row) => (
        <div key={row.ticket.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}>
            <span className="cr-item-ref">{String(row.ticket.fields.ref ?? "")}</span>
            <strong className="ds-grow ds-truncate">{row.ticket.title.replace(/^[A-Z]+-\d+\s/, "")}</strong>
            <SlaBadge state={row.state} />
          </Row>
          <p className="ds-subtle">
            {row.state.which === "first response" ? "No first response yet." : "Open past the resolution target."}{" "}
            Counted in {String(policyFor(row.ticket, data.slas)?.fields.businessHours ?? "business hours")}.
          </p>
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => context.navigate(`/o/${context.org.slug}/care/tickets/${row.ticket.id}`)}>Open the case</Button>
        </div>
      ))}
    </Stack>
  );
}

export function QueueRules({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const queues = [...new Set(data.tickets.map((ticket) => String(ticket.fields.queue ?? "Unsorted")))];
  return (
    <Stack gap={3}>
      {queues.map((queue) => (
        <div key={queue} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <strong>{queue}</strong>
          <Properties rows={[
            { label: "Routed when", value: queue === "Technical" ? "The subject is about a fitting, a driver or an install" : queue === "Billing" ? "The subject mentions an invoice, a price or a refund" : queue === "Trade" ? "The customer is a trade account" : "Everything else" },
            { label: "Open now", value: String(data.tickets.filter((ticket) => String(ticket.fields.queue ?? "") === queue && !["resolved", "closed"].includes(ticket.status)).length) },
          ]} />
        </div>
      ))}
      <Notice tone="info">Routing is a rule a person wrote, applied when a case is created. Nothing reroutes a case on its own afterwards.</Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/care/automation`)}>Open the rules</Button>
    </Stack>
  );
}
