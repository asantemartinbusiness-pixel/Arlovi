import { useMemo, useState } from "react";
import { CalendarClock, LineChart as LineIcon, Workflow } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, Empty, FactGrid, Field, Grid, LineChart, Notice, OverlaySection, OverlaySummary, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { addDays, clockIso, clockNow, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { ACTIVITY_LABEL, activitiesFor, activityKind, probabilityOf, stageOf } from "@/domain/crm-pipeline";
import { periodLabel, recentPeriods } from "@/domain/fin-ledger";
import { companyOfDeal, contactById, dealsOfContact, useCrmData } from "./data";
import type { CrmData } from "./data";
import { ActivityPill, CapabilityNotice, CapabilityPill, ConsentPill, ForecastNote, Money, StagePill } from "./parts";

/* ---------------------------- CRM-009 ---------------------------- */

function dealOf(data: CrmData, activity: Rec): Rec | undefined {
  const id = String(activity.fields.dealId ?? "");
  return id ? data.deals.find((deal) => deal.id === id) : undefined;
}

export function MyCalendar({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const start = startOfWeek(now);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const mine = data.activities.filter((activity) => String(activity.fields.owner ?? activity.ownerName) === context.actor);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="This week" value={String(mine.filter((activity) => {
          const at = new Date(activity.startAt ?? activity.at ?? activity.createdAt);
          return at >= start && at < addDays(start, 7);
        }).length)} meta={`${context.date(start)} to ${context.date(addDays(start, 6))}`} prov="human" />
        <Stat label="Open follow-ups" value={String(mine.filter((activity) => activity.status === "open").length)} prov="human" />
        <Stat label="Drafted, not sent" value={String(mine.filter((activity) => activity.status === "draft").length)} meta="No mail provider is connected" prov="unknown" />
        <Stat label="Calendar sync" value="Not connected" unavailable meta="Nothing is invited anywhere" />
      </StatRow>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", gap: "var(--space-2)", overflowX: "auto" }}>
        {days.map((day) => {
          const onDay = mine.filter((activity) => {
            const at = new Date(activity.startAt ?? activity.at ?? activity.createdAt);
            return at.toDateString() === day.toDateString();
          }).sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
          const isToday = day.toDateString() === now.toDateString();
          return (
            <section key={day.toISOString()} className="ds-panel" style={{ padding: "var(--space-3)", borderColor: isToday ? "var(--accent)" : undefined }} aria-label={context.date(day, { weekday: "long", day: "numeric", month: "long" })}>
              <div className="ds-eyebrow">{context.date(day, { weekday: "short" })}</div>
              <strong className="ds-num">{context.date(day, { day: "numeric", month: "short" })}</strong>
              <Stack gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
                {onDay.map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    className="ds-record-card"
                    onClick={() => { context.select(activity.id); context.openOverlay("Activity entry", { id: activity.id }); }}
                  >
                    <Row gap={1}>
                      <span className="ds-num ds-subtle">{activity.startAt ? context.dateTime(activity.startAt).split(" ").pop() : "—"}</span>
                      <ActivityPill activity={activity} />
                    </Row>
                    <span style={{ textAlign: "start" }}>{activity.title}</span>
                  </button>
                ))}
                {onDay.length === 0 && <span className="ds-subtle">Clear</span>}
              </Stack>
            </section>
          );
        })}
      </div>

      <CapabilityNotice id="calendar.sync" title="Nothing here is on anyone else's calendar" />
    </Stack>
  );
}

export function AllActivity({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const [kind, setKind] = useState<string>("all");
  const rows = useMemo(
    () => data.activities
      .filter((activity) => kind === "all" || activityKind(activity) === kind)
      .sort((a, b) => (b.startAt ?? b.at ?? "").localeCompare(a.startAt ?? a.at ?? "")),
    [data.activities, kind],
  );

  if (data.activities.length === 0) {
    return <Empty title="Nothing logged" icon={<CalendarClock size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Activity entry")}>Log an activity</Button>} />;
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[{ value: "all", label: "All" }, ...(["call", "meeting", "email", "task", "note"] as const).map((item) => ({ value: item, label: ACTIVITY_LABEL[item] }))]}
        />
        <span className="ds-grow" />
        <CapabilityPill id="calendar.sync" />
      </Row>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="All activity"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.status === "draft" ? "warning" : undefined)}
        columns={[
          { key: "when", header: "When", width: "160px", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt ?? row.at)}</span>, sortValue: (row) => row.startAt ?? row.at ?? "" },
          { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} />, filterValue: (row) => activityKind(row) },
          { key: "title", header: "What", primary: true, cell: (row) => (
            <span>
              {row.title}
              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{row.summary}</span>
            </span>
          ), filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "deal", header: "Deal", hideBelow: 1200, cell: (row) => dealOf(data, row)?.title ?? <span className="ds-subtle">—</span> },
          { key: "contact", header: "Contact", hideBelow: 1200, cell: (row) => contactById(data, String(row.fields.contactId ?? ""))?.title ?? <span className="ds-subtle">—</span> },
          { key: "owner", header: "Who", cell: (row) => String(row.fields.owner ?? row.ownerName) },
          { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "done" ? "success" : row.status === "draft" ? "warning" : "info"} dot>{row.status}</Pill> },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("Activity entry", { id }); }}
        bulkActions={[
          {
            label: "Mark complete",
            disabled: (selected) => selected.every((row) => row.status === "done"),
            onRun: async (selected) => {
              let done = 0;
              for (const activity of selected) {
                if (activity.status === "done") continue;
                if (activity.status === "draft") continue;
                await context.mutate.patch(activity.id, { status: "done", fields: { ...activity.fields, completedBy: context.actor } }, { event: `Activity ${activity.title} completed` });
                done += 1;
              }
              context.toast(done ? "Marked complete" : "Nothing changed", `${done} completed. A drafted message is not completed here, because it has not been sent.`, done ? "ok" : "blocked");
            },
          },
        ]}
      />
    </Stack>
  );
}

export function FollowUps({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const open = data.activities.filter((activity) => activity.status === "open")
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
  const overdue = open.filter((activity) => new Date(activity.startAt ?? activity.at ?? now) < now);
  const quietDeals = data.deals.filter((deal) => stageOf(deal).kind === "open" && activitiesFor(data.activities, deal.id).length === 0);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Open follow-ups" value={String(open.length)} prov="human" />
        <Stat label="Past their date" value={String(overdue.length)} meta={overdue.length ? "Oldest first below" : "Nothing is late"} prov="human" />
        <Stat label="Open deals with nothing logged" value={String(quietDeals.length)} meta="No evidence behind their stage" prov="unknown" />
        <Stat
          label="Weighted value at risk"
          value={context.money(quietDeals.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0))}
          meta="Weighted value of the quiet deals"
          prov="human"
        />
      </StatRow>

      {open.length === 0 ? (
        <Empty title="No open follow-up">Scheduling a call or a task from a deal puts it here.</Empty>
      ) : (
        <DataGrid
          rows={open}
          rowId={(row) => row.id}
          label="Open follow-ups"
          rowTone={(row) => (new Date(row.startAt ?? row.at ?? now) < now ? "warning" : undefined)}
          columns={[
            { key: "when", header: "Due", cell: (row) => <span className="ds-num">{context.date(row.startAt ?? row.at)}</span>, sortValue: (row) => row.startAt ?? "" },
            { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} /> },
            { key: "title", header: "What", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "deal", header: "Deal", cell: (row) => dealOf(data, row)?.title ?? <span className="ds-subtle">—</span> },
            { key: "owner", header: "Who", cell: (row) => String(row.fields.owner ?? row.ownerName) },
            { key: "action", header: "", cell: (row) => (
              <Button size="sm" variant="ghost" onClick={async () => {
                await context.mutate.patch(row.id, { status: "done", fields: { ...row.fields, completedBy: context.actor } }, { expectRevision: row.revision, event: `Activity ${row.title} completed` });
                context.toast("Completed", `${row.title} is marked done by ${context.actor}.`);
              }}>Complete</Button>
            ) },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("Activity entry", { id }); }}
        />
      )}

      {quietDeals.length > 0 && (
        <Card eyebrow="QUIET DEALS" prov="unknown" title="Open deals with no logged activity" subtitle="Their stage has no evidence behind it">
          <Stack gap={2}>
            {quietDeals.map((deal) => (
              <Row key={deal.id} gap={3}>
                <span className="ds-grow">{deal.title}</span>
                <StagePill deal={deal} />
                <Money minor={deal.amountMinor} context={context} />
                <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/crm/deals/${deal.id}`)}>Open</Button>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

export function ActivityHistory({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now, org } = useWorkspace();
  const done = data.activities.filter((activity) => activity.status === "done");
  const months = recentPeriods(now, 6);
  const byMonth = months.map((period) => ({
    period,
    count: done.filter((activity) => (activity.startAt ?? activity.at ?? "").slice(0, 7) === period).length,
  }));

  return (
    <Stack gap={4}>
      <Card eyebrow="HISTORY" prov="human" title="Completed activity by month" subtitle="Counted from records, not from a target">
        <BarChart
          title="Completed activities by month"
          height={220}
          format={(value) => String(Math.round(value))}
          series={[{ name: "Completed", points: byMonth.map((entry) => ({ label: periodLabel(entry.period, org.locale).slice(0, 3), value: entry.count })) }]}
          footer={`${done.length} completed activities are on record in this workspace.`}
        />
      </Card>
      <DataGrid
        rows={done.sort((a, b) => (b.startAt ?? "").localeCompare(a.startAt ?? ""))}
        rowId={(row) => row.id}
        label="Completed activity"
        columns={[
          { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.date(row.startAt ?? row.at)}</span>, sortValue: (row) => row.startAt ?? "" },
          { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} /> },
          { key: "title", header: "What", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "outcome", header: "Outcome", cell: (row) => row.fields.outcome ? String(row.fields.outcome) : <span className="ds-subtle">Not recorded</span> },
          { key: "owner", header: "Who", cell: (row) => String(row.fields.owner ?? row.ownerName) },
        ]}
      />
    </Stack>
  );
}

export function ActivityEntry({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.activities.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [kind, setKind] = useState(existing ? activityKind(existing) : "call");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [when, setWhen] = useState((existing?.startAt ?? now.toISOString()).slice(0, 16));
  const [minutes, setMinutes] = useState(String(existing?.fields.minutes ?? 30));
  const [dealId, setDealId] = useState(String(existing?.fields.dealId ?? ""));
  const [contactId, setContactId] = useState(String(existing?.fields.contactId ?? ""));
  const [outcome, setOutcome] = useState(String(existing?.fields.outcome ?? ""));
  const [note, setNote] = useState(existing?.summary ?? "");
  const [busy, setBusy] = useState(false);

  const linkedDeal = data.deals.find((deal) => deal.id === dealId);
  const lastTouch = linkedDeal ? activitiesFor(data.activities, linkedDeal.id).find((activity) => activity.id !== existing?.id) : undefined;
  const clash = data.activities.find((activity) => {
    if (activity.id === existing?.id) return false;
    if (String(activity.fields.owner ?? activity.ownerName) !== context.actor) return false;
    if (!activity.startAt || !activity.endAt) return false;
    const start = new Date(when).getTime();
    const end = start + (Number(minutes) || 0) * 60_000;
    return new Date(activity.startAt).getTime() < end && new Date(activity.endAt).getTime() > start;
  });

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Kind">
          <Select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {(["call", "meeting", "email", "task", "note"] as const).map((item) => <option key={item} value={item}>{ACTIVITY_LABEL[item]}</option>)}
          </Select>
        </Field>
        <Field label="When"><TextInput aria-label="When" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></Field>
        <Field label="Minutes"><TextInput aria-label="Minutes" align="end" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))} /></Field>
      </Row>
      <Field label="What it is" required><TextInput aria-label="What it is" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Deal">
          <Select aria-label="Deal" value={dealId} onChange={(event) => {
            setDealId(event.target.value);
            // A deal names its contact; offer it rather than leave the history unattached.
            const linked = data.deals.find((deal) => deal.id === event.target.value)?.fields.contactId;
            if (linked && !contactId) setContactId(String(linked));
          }}>
            <option value="">Not linked</option>
            {data.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
          </Select>
        </Field>
        <Field label="Contact">
          <Select aria-label="Contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Not linked</option>
            {data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.title}</option>)}
          </Select>
        </Field>
      </Row>
      <Field label="Outcome" hint="What changed. Stage requirements are judged on this, not on the fact that a call happened.">
        <TextInput aria-label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} />
      </Field>
      <Field label="Notes"><TextArea aria-label="Notes" value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>

      {linkedDeal && (
        <OverlaySection title="Evidence it adds" hint="Stage requirements are judged on logged activity and its outcome.">
          <FactGrid columns={3} dense items={[
            { label: "Deal", value: linkedDeal.title, hint: stageOf(linkedDeal).label },
            { label: "Last touch", value: lastTouch ? context.relative(lastTouch.startAt ?? lastTouch.at) : "Never logged" },
            { label: "Outcome", value: outcome ? "Recorded" : "Missing", tone: outcome ? "success" : "warning" },
          ]} />
        </OverlaySection>
      )}
      {clash && (
        <Notice tone="warning" title="That overlaps something already in your diary">
          {clash.title} runs from {context.dateTime(clash.startAt)}. The entry can still be saved; this workspace does not hold your real calendar.
        </Notice>
      )}
      {kind === "meeting" && <CapabilityNotice id="calendar.sync" title="No invitation will be sent" />}

      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!title.trim()}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = { kind, owner: context.actor, minutes: Number(minutes) || 0 };
            if (dealId) fields.dealId = dealId;
            if (contactId) fields.contactId = contactId;
            if (outcome) fields.outcome = outcome;
            const start = new Date(when);
            const end = new Date(start.getTime() + (Number(minutes) || 0) * 60_000);
            if (existing) {
              await context.mutate.patch(existing.id, {
                title: title.trim(), summary: note, startAt: start.toISOString(), endAt: end.toISOString(), at: start.toISOString(),
                status: start > now ? "open" : existing.status === "draft" ? "draft" : "done",
                fields: { ...existing.fields, ...fields },
              }, { expectRevision: existing.revision, event: `Activity ${title.trim()} updated` });
              context.toast("Activity saved", `${title.trim()} is updated.`);
            } else {
              await context.mutate.create({
                collection: "activities",
                title: title.trim(),
                status: start > now ? "open" : "done",
                summary: note,
                startAt: start.toISOString(),
                endAt: end.toISOString(),
                at: start.toISOString(),
                parentId: dealId || contactId || undefined,
                fields,
              }, `Activity ${title.trim()} logged`);
              context.toast("Activity logged", start > now
                ? `${title.trim()} is scheduled for ${context.dateTime(start)} in this workspace only.`
                : `${title.trim()} is on the record.`);
            }
            setBusy(false);
            close();
          }}
        >
          {existing ? "Save" : "Log it"}
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function CalendarConflict({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const mine = data.activities.filter((activity) => String(activity.fields.owner ?? activity.ownerName) === context.actor && activity.startAt && activity.endAt);
  const clashes: { a: Rec; b: Rec }[] = [];
  for (let i = 0; i < mine.length; i += 1) {
    for (let j = i + 1; j < mine.length; j += 1) {
      const a = mine[i];
      const b = mine[j];
      if (new Date(a.startAt!) < new Date(b.endAt!) && new Date(b.startAt!) < new Date(a.endAt!)) clashes.push({ a, b });
    }
  }
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Entries checked", value: String(mine.length), mono: true, hint: `for ${context.actor}` },
        { label: "Overlaps", value: String(clashes.length), mono: true, tone: clashes.length ? "warning" : "success" },
      ]} />
      <p className="ds-subtle">Only this workspace's own entries are checked. No calendar provider is connected, so a clash with a real meeting cannot be seen from here.</p>
      {clashes.length === 0 ? <Empty title="No overlap in your logged diary" /> : (
        <OverlaySection title="Overlapping entries" tone="warning">
          <ul className="crm-evidence" data-flush>
            {clashes.map(({ a, b }) => {
              const overlap = Math.round((Math.min(new Date(a.endAt!).getTime(), new Date(b.endAt!).getTime()) - Math.max(new Date(a.startAt!).getTime(), new Date(b.startAt!).getTime())) / 60_000);
              return (
                <li key={`${a.id}-${b.id}`}>
                  <Pill tone="warning" dot>{overlap} min</Pill>
                  <span className="crm-evidence-label">{a.title} and {b.title}</span>
                  <span className="crm-evidence-value ds-subtle ds-num">{context.dateTime(a.startAt)}</span>
                </li>
              );
            })}
          </ul>
        </OverlaySection>
      )}
    </Stack>
  );
}

export function MeetingComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now, org } = useWorkspace();
  const [contactId, setContactId] = useState("");
  const [when, setWhen] = useState(new Date(now.getTime() + 86_400_000).toISOString().slice(0, 16));
  const [agenda, setAgenda] = useState("");
  const [busy, setBusy] = useState(false);
  const contact = contactById(data, contactId);
  const suppressed = contact?.fields.suppressed === true;
  const contactTouch = contact ? activitiesFor(data.activities, contact.id)[0] : undefined;
  const meetingStart = new Date(when).getTime();
  const diaryClash = data.activities.find((activity) => activity.startAt && activity.endAt
    && String(activity.fields.owner ?? activity.ownerName) === context.actor
    && new Date(activity.startAt).getTime() < meetingStart + 45 * 60_000 && new Date(activity.endAt).getTime() > meetingStart);

  return (
    <Stack gap={4}>
      <CapabilityNotice id="calendar.sync" title="A meeting is not claimed as invited" />
      <Row gap={3} wrap>
        <Field label="With" required>
          <Select aria-label="With" value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Choose a contact</option>
            {data.contacts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
        <Field label="When"><TextInput aria-label="When" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></Field>
      </Row>
      <Field label="Agenda"><TextArea aria-label="Agenda" value={agenda} rows={3} onChange={(event) => setAgenda(event.target.value)} /></Field>
      {contact && (
        <OverlaySection title={`About ${contact.title}`}>
          <FactGrid columns={2} dense items={[
            { label: "Email consent", value: <ConsentPill contact={contact} /> },
            { label: "Last touch", value: contactTouch ? context.relative(contactTouch.startAt ?? contactTouch.at) : "Never logged" },
            { label: "Open deals", value: String(dealsOfContact(data, contact.id).filter((deal) => stageOf(deal).kind === "open").length), mono: true },
            { label: "Diary at that time", value: diaryClash ? `Overlaps ${diaryClash.title}` : "Free", tone: diaryClash ? "warning" : "success" },
          ]} />
        </OverlaySection>
      )}
      {suppressed && <Notice tone="danger" title="This contact is suppressed">No invitation and no draft is prepared for them.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!contactId || suppressed}
          onClick={async () => {
            setBusy(true);
            const start = new Date(when);
            await context.mutate.create({
              collection: "activities",
              title: `Meeting with ${contact?.title}`,
              status: "open",
              summary: agenda || `Proposed meeting in ${org.name}'s workspace.`,
              startAt: start.toISOString(),
              endAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
              at: start.toISOString(),
              parentId: contactId,
              fields: { kind: "meeting", contactId, owner: context.actor, delivery: "not_connected" },
            }, `Meeting with ${contact?.title} proposed`);
            context.toast("Meeting recorded", `It is in your workspace diary for ${context.dateTime(start)}. Nobody has been invited, because no calendar is connected.`, "info");
            setBusy(false);
            close();
          }}
        >
          Record the meeting
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- CRM-010 ---------------------------- */

export function ForecastCurrent({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const open = data.forecast.byStage.filter((entry) => entry.stage.kind === "open");
  const quarters = ["commit", "best case", "pipeline"] as const;
  const categorised = quarters.map((category) => {
    const deals = data.deals.filter((deal) => {
      const probability = probabilityOf(deal);
      if (stageOf(deal).kind !== "open") return false;
      if (category === "commit") return probability >= 80;
      if (category === "best case") return probability >= 50 && probability < 80;
      return probability < 50;
    });
    return {
      category,
      deals,
      amountMinor: deals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      weightedMinor: deals.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0),
    };
  });

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Everything on this screen is a prediction">
        A forecast figure is an open deal's amount multiplied by its stage weighting. It is not revenue, it is not in the ledger, and no deal is counted twice: each belongs to exactly one category below.
      </Notice>
      <StatRow>
        <Stat label="Commit" value={context.money(categorised[0].amountMinor)} meta={`${categorised[0].deals.length} deals at 80% or more`} prov="human" />
        <Stat label="Best case" value={context.money(categorised[1].amountMinor)} meta={`${categorised[1].deals.length} deals between 50 and 79%`} prov="human" />
        <Stat label="Pipeline" value={context.money(categorised[2].amountMinor)} meta={`${categorised[2].deals.length} deals under 50%`} prov="human" />
        <Stat label="Weighted total" value={context.money(data.forecast.weightedMinor)} meta="The sum of amount × probability" prov="human" />
      </StatRow>

      <Grid>
        <Card span={7} eyebrow="FORECAST" prov="human" title="By category" subtitle="Each deal appears once">
          <BarChart
            title="Forecast by category"
            height={230}
            format={(value) => context.money(value)}
            series={[
              { name: "Amount", points: categorised.map((entry) => ({ label: entry.category, value: entry.amountMinor })) },
              { name: "Weighted", points: categorised.map((entry) => ({ label: entry.category, value: entry.weightedMinor })) },
            ]}
            footer="Categories are cut from each deal's probability, so no multi-product deal can be counted in two of them."
          />
        </Card>
        <Card span={5} eyebrow="STAGES" prov="human" title="By stage" subtitle="Open stages only">
          <Stack gap={3}>
            {open.map((entry) => (
              <Row key={entry.stage.id} gap={3}>
                <span className="ds-grow">{entry.stage.label}</span>
                <span className="ds-subtle">{entry.count}</span>
                <Money minor={entry.weightedMinor} context={context} bold />
              </Row>
            ))}
            <ForecastNote>
              {data.forecast.withoutAmountIds.length > 0
                ? `${data.forecast.withoutAmountIds.length} deals have no amount and are excluded from every figure here.`
                : "Every open deal carries an amount."}
            </ForecastNote>
          </Stack>
        </Card>
        <Card span={12} eyebrow="DEALS" prov="human" title="Every deal in the forecast" flush>
          <DataGrid
            rows={categorised.flatMap((entry) => entry.deals.map((deal) => ({ deal, category: entry.category })))}
            rowId={(row) => row.deal.id}
            label="Forecast detail"
            selectedId={context.selectedId}
            onSelect={(id) => context.select(id)}
            onOpen={(id) => context.navigate(`/o/${org.slug}/crm/deals/${id}`)}
            columns={[
              { key: "category", header: "Category", cell: (row) => <Pill tone={row.category === "commit" ? "success" : row.category === "best case" ? "info" : "neutral"}>{row.category}</Pill>, filterValue: (row) => row.category },
              { key: "deal", header: "Deal", primary: true, cell: (row) => row.deal.title, filterValue: (row) => row.deal.title },
              { key: "company", header: "Account", cell: (row) => companyOfDeal(data, row.deal)?.title ?? "None" },
              { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row.deal} /> },
              { key: "close", header: "Close", cell: (row) => row.deal.dueAt ? <span className="ds-num">{context.date(row.deal.dueAt)}</span> : <span className="ds-subtle">Not set</span>, sortValue: (row) => row.deal.dueAt ?? "~" },
              { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.deal.amountMinor} context={context} />, sortValue: (row) => Number(row.deal.amountMinor ?? 0) },
              { key: "weighted", header: "Weighted", align: "end", cell: (row) => <Money minor={Math.round((Number(row.deal.amountMinor ?? 0) * probabilityOf(row.deal)) / 100)} context={context} bold /> },
            ]}
            summary={<Money minor={data.forecast.weightedMinor} context={context} bold />}
          />
        </Card>
      </Grid>
      <span className="ds-sr-only">Prepared {context.date(now)}</span>
    </Stack>
  );
}

export function ForecastScenarios({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const [slip, setSlip] = useState(0);
  const [win, setWin] = useState(0);
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const base = data.forecast.weightedMinor;
  const adjusted = open.reduce((sum, deal) => {
    const probability = Math.max(0, Math.min(100, probabilityOf(deal) + win));
    return sum + Math.round((Number(deal.amountMinor ?? 0) * probability) / 100);
  }, 0);
  const slipped = open.filter((deal) => deal.dueAt && new Date(deal.dueAt).getTime() < clockNow().getTime() + slip * 86_400_000);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A scenario changes the assumption, never the record">
        Moving the sliders below recomputes the figures in this view only. No deal is edited and no forecast is stored.
      </Notice>
      <Row gap={4} wrap>
        <Field label="Shift every probability by" hint="Percentage points">
          <TextInput aria-label="Shift every probability by" align="end" inputMode="numeric" value={String(win)} onChange={(event) => setWin(Number(event.target.value.replace(/[^0-9-]/g, "")) || 0)} />
        </Field>
        <Field label="Count deals closing within" hint="Days from today">
          <TextInput aria-label="Count deals closing within" align="end" inputMode="numeric" value={String(slip)} onChange={(event) => setSlip(Number(event.target.value.replace(/\D/g, "")) || 0)} />
        </Field>
      </Row>
      <StatRow>
        <Stat label="Weighted today" value={context.money(base)} prov="human" />
        <Stat label="With the shift applied" value={context.money(adjusted)} meta={`${win >= 0 ? "+" : ""}${win} points on every open deal`} prov="human" />
        <Stat label="Difference" value={context.money(adjusted - base)} prov="human" />
        <Stat label="Deals inside the window" value={String(slipped.length)} meta={`Closing within ${slip} days`} prov="human" />
      </StatRow>
      <Card eyebrow="SENSITIVITY" prov="human" title="What each deal contributes" flush>
        <DataGrid
          rows={open}
          rowId={(row) => row.id}
          label="Scenario detail"
          columns={[
            { key: "deal", header: "Deal", primary: true, cell: (row) => row.title },
            { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} /> },
            { key: "now", header: "Weighted now", align: "end", cell: (row) => <Money minor={Math.round((Number(row.amountMinor ?? 0) * probabilityOf(row)) / 100)} context={context} /> },
            { key: "then", header: "With the shift", align: "end", cell: (row) => <Money minor={Math.round((Number(row.amountMinor ?? 0) * Math.max(0, Math.min(100, probabilityOf(row) + win))) / 100)} context={context} bold /> },
          ]}
        />
      </Card>
    </Stack>
  );
}

export function ForecastHistory({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const months = recentPeriods(now, 6);
  const won = months.map((period) => ({
    period,
    minor: data.deals
      .filter((deal) => stageOf(deal).kind === "won" && (deal.updatedAt ?? "").slice(0, 7) === period)
      .reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
  }));
  const invoiced = months.map((period) => ({
    period,
    minor: data.invoices
      .filter((invoice) => !["draft", "void"].includes(invoice.status) && (invoice.at ?? "").slice(0, 7) === period)
      .reduce((sum, invoice) => sum + Number(invoice.amountMinor ?? 0), 0),
  }));

  return (
    <Stack gap={4}>
      {(() => {
        const snapshots = data.preferences.filter((record) => record.fields.kind === "salesForecastSnapshot").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return snapshots.length === 0 ? (
          <Notice tone="warning" title="Historical accuracy cannot be measured yet">
            No forecast has been reviewed, so there is no snapshot of what the forecast said to compare against. Use Review to freeze one. What can be shown meanwhile is what closed and what was invoiced.
          </Notice>
        ) : (
          <Card eyebrow="REVIEWED" prov="human" title="Reviewed forecasts" subtitle="Snapshots frozen when someone reviewed the forecast">
            <Stack gap={2}>
              {snapshots.map((snapshot) => (
                <Row key={snapshot.id} gap={3}>
                  <span className="ds-num ds-subtle">{context.date(snapshot.createdAt)}</span>
                  <span className="ds-grow">{String(snapshot.fields.reviewedBy ?? snapshot.createdBy)} · {snapshot.summary}</span>
                  <Money minor={Number(snapshot.fields.weightedMinor ?? 0)} context={context} bold />
                </Row>
              ))}
            </Stack>
          </Card>
        );
      })()}
      <Card eyebrow="OUTCOMES" prov="posted" title="Closed won against invoiced" subtitle="Deals closed in the month and invoices issued in the same month">
        <LineChart
          title="Closed won and invoiced by month"
          height={240}
          format={(value) => context.money(value)}
          series={[
            { name: "Closed won", points: won.map((entry) => ({ label: periodLabel(entry.period, org.locale).slice(0, 3), value: entry.minor })) },
            { name: "Invoiced", points: invoiced.map((entry) => ({ label: periodLabel(entry.period, org.locale).slice(0, 3), value: entry.minor })) },
          ]}
          footer="Invoiced figures come from Finance records; a deal closed won without an invoice shows as a gap between the lines."
        />
      </Card>
      <Card eyebrow="LOSSES" prov="human" title="Why deals were lost" subtitle="From the reason recorded at the time">
        <Stack gap={2}>
          {[...new Set(data.deals.filter((deal) => deal.fields.lostReason).map((deal) => String(deal.fields.lostReason)))].map((reason) => {
            const deals = data.deals.filter((deal) => String(deal.fields.lostReason ?? "") === reason);
            return (
              <Row key={reason} gap={3}>
                <span className="ds-grow">{reason}</span>
                <span className="ds-subtle">{deals.length}</span>
                <Money minor={deals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)} context={context} />
              </Row>
            );
          })}
          {data.deals.every((deal) => !deal.fields.lostReason) && <span className="ds-subtle">No deal has been closed lost with a reason.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}

export function ForecastMethodology() {
  const data = useCrmData();
  return (
    <Stack gap={4}>
      <Card eyebrow="METHOD" prov="human" title="How every figure on these screens is computed" subtitle="So the number can be checked by hand">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Pipeline", value: "The sum of the amount on every deal in an open stage." },
            { label: "Weighted forecast", value: "For each open deal, amount × probability ÷ 100, rounded to the penny, then summed." },
            { label: "Probability", value: "The figure recorded on the deal if there is one, otherwise the default for its stage." },
            { label: "Commit, best case, pipeline", value: "Cut from probability at 80 and 50. Each deal falls into exactly one, so nothing is double counted." },
            { label: "Closed won", value: "Excluded from the forecast. Recognised revenue comes from posted journals in Finance." },
            { label: "Closed lost", value: "Excluded from every figure except the loss analysis." },
            { label: "Deals with no amount", value: `Excluded and listed. There are ${data.forecast.withoutAmountIds.length} of them.` },
          ]} />
          <Notice tone="info" title="What this method does not do">
            It does not learn from past accuracy, it does not adjust for who owns the deal, and it does not model a close date slipping. A probability is a stage default or a figure someone typed, not a measured rate.
          </Notice>
        </Stack>
      </Card>
      <Card eyebrow="STAGES" prov="human" title="Stage weightings in use" flush>
        <DataGrid
          rows={data.forecast.byStage}
          rowId={(row) => row.stage.id}
          label="Stage weightings"
          filterable={false}
          columns={[
            { key: "stage", header: "Stage", primary: true, cell: (row) => row.stage.label },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.stage.kind === "open" ? "info" : row.stage.kind === "won" ? "success" : "neutral"}>{row.stage.kind}</Pill> },
            { key: "probability", header: "Default weighting", align: "end", cell: (row) => <span className="ds-num">{row.stage.probability}%</span> },
            { key: "requires", header: "Must be recorded to advance", cell: (row) => (row.stage.requires ?? []).map((requirement) => requirement.label).join(", ") || "Nothing" },
            { key: "count", header: "Deals", align: "end", cell: (row) => <span className="ds-num">{row.count}</span> },
          ]}
        />
      </Card>
    </Stack>
  );
}

export function ForecastModel({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const open = data.forecast.byStage.filter((entry) => entry.stage.kind === "open");
  return (
    <Stack gap={4}>
      <FactGrid columns={3} items={[
        { label: "Open deals", value: String(data.forecast.openCount), mono: true },
        { label: "Pipeline", value: context.money(data.forecast.pipelineMinor), mono: true },
        { label: "Weighted", value: context.money(data.forecast.weightedMinor), mono: true, hint: "amount x stage probability" },
      ]} />
      <OverlaySection title="Stage by stage" hint="Each row is the sum the weighted figure is built from.">
        <ul className="crm-evidence" data-flush>
          {open.map((entry) => (
            <li key={entry.stage.id}>
              <span className="ds-num">{entry.stage.probability}%</span>
              <span className="crm-evidence-label">{entry.stage.label} <span className="ds-subtle">({entry.count})</span></span>
              <span className="crm-evidence-value ds-num">{context.money(entry.amountMinor)} to {context.money(entry.weightedMinor)}</span>
            </li>
          ))}
        </ul>
        {data.forecast.withoutAmountIds.length > 0 && (
          <p className="ds-subtle">{data.forecast.withoutAmountIds.length} deal(s) with no amount are excluded, not counted as zero.</p>
        )}
      </OverlaySection>
      <Notice tone="info" title="No predictive certainty is claimed">
        The model is arithmetic over records someone typed. It has no training data and no opinion about whether a deal will close.
      </Notice>
    </Stack>
  );
}

export function ConfidenceExplanation() {
  const data = useCrmData();
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const evidence = open.map((deal) => ({
    deal,
    activities: activitiesFor(data.activities, deal.id).length,
    hasQuote: Boolean(deal.fields.quoteId),
    hasClose: Boolean(deal.fields.closeDate),
  }));
  return (
    <Stack gap={4}>
      <FactGrid columns={4} items={[
        { label: "Open deals", value: String(evidence.length), mono: true },
        { label: "With logged activity", value: String(evidence.filter((row) => row.activities > 0).length), mono: true },
        { label: "With a quote", value: String(evidence.filter((row) => row.hasQuote).length), mono: true },
        { label: "With a close date", value: String(evidence.filter((row) => row.hasClose).length), mono: true },
      ]} />
      <p className="ds-subtle">Confidence here means evidence, not a score. A deal with a quote, a close date and logged activity has more behind its weighting than one with none.</p>
      <DataGrid
        rows={evidence}
        rowId={(row) => row.deal.id}
        label="Evidence behind each weighting"
        filterable={false}
        columns={[
          { key: "deal", header: "Deal", primary: true, cell: (row) => row.deal.title },
          { key: "probability", header: "Weighting", align: "end", cell: (row) => <span className="ds-num">{probabilityOf(row.deal)}%</span> },
          { key: "activities", header: "Logged activity", align: "end", cell: (row) => row.activities ? <span className="ds-num">{row.activities}</span> : <Pill tone="warning">None</Pill> },
          { key: "quote", header: "Quote", cell: (row) => row.hasQuote ? <Pill tone="success">Linked</Pill> : <Pill tone="warning">None</Pill> },
          { key: "close", header: "Close date", cell: (row) => row.hasClose ? <Pill tone="success">Set</Pill> : <Pill tone="warning">Not set</Pill> },
        ]}
      />
    </Stack>
  );
}

export function OverrideReason({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const deal = data.deals.find((item) => item.id === context.selectedId);
  const [probability, setProbability] = useState(deal ? String(probabilityOf(deal)) : "50");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="Select a deal first">Choose a deal on the forecast, then override its weighting.</Empty>;

  const value = Math.max(0, Math.min(100, Number(probability) || 0));
  const before = Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100);
  const after = Math.round((Number(deal.amountMinor ?? 0) * value) / 100);

  return (
    <Stack gap={4}>
      <OverlaySummary eyebrow="Deal" title={deal.title} status={<StagePill deal={deal} />} meta={[<span className="ds-num" key="a">{context.money(Number(deal.amountMinor ?? 0))}</span>, `stage default ${stageOf(deal).probability}%`]} />
      <FactGrid columns={3} items={[
        { label: "Weighted now", value: context.money(before), mono: true, hint: `${probabilityOf(deal)}%` },
        { label: "Weighted after", value: context.money(after), mono: true, hint: `${value}%` },
        { label: "Moves the forecast by", value: context.money(after - before), mono: true, tone: after === before ? undefined : after > before ? "success" : "warning" },
      ]} />
      <p className="ds-subtle">An override changes the forecast, so the reason is stored with the figure.</p>
      <Row gap={3} wrap>
        <Field label="Probability" hint="0 to 100">
          <TextInput aria-label="Probability" align="end" inputMode="numeric" value={probability} onChange={(event) => setProbability(event.target.value.replace(/\D/g, ""))} />
        </Field>
      </Row>
      <Field label="Why" required><TextArea aria-label="Why" value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!reason.trim() || !context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(deal.id, {
              fields: { ...deal.fields, probability: value, probabilityOverride: reason, probabilityOverrideBy: context.actor },
            }, { expectRevision: deal.revision, event: `Weighting on ${deal.title} overridden to ${value}%: ${reason}` });
            context.toast("Weighting overridden", `${deal.title} is weighted at ${value}%. The forecast moved by ${context.money(after - before)}.`);
            setBusy(false);
            close();
          }}
        >
          Apply the override
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ForecastStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral" dot>Prediction, not revenue</Pill>
      <span>Pipeline <Money minor={data.forecast.pipelineMinor} context={context} bold /></span>
      <span>Weighted <Money minor={data.forecast.weightedMinor} context={context} bold /></span>
      <span>Won to date <Money minor={data.forecast.wonMinor} context={context} bold /></span>
      <span className="ds-grow" />
      <span className="ds-subtle"><LineIcon size={13} aria-hidden="true" /> Recognised revenue lives in Finance.</span>
    </Row>
  );
}

/* ---------------------------- CRM-011 ---------------------------- */

export function WorkflowsTab({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const [busy, setBusy] = useState<string>();

  if (data.workflows.length === 0) {
    return <Empty title="No workflow" icon={<Workflow size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Workflow designer")}>Create a rule</Button>} />;
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No automation in this workspace contacts a customer">
        A rule can assign an owner, create a task and draft a document. Sending is refused: there is no mail or telephony provider, and a suppressed or unconsenting contact is excluded from every step regardless.
      </Notice>
      <Grid>
        {data.workflows.map((workflow) => {
          const runs = data.runs.filter((run) => String(run.fields.workflowId ?? run.parentId ?? "") === workflow.id);
          const failed = runs.filter((run) => ["failed", "blocked"].includes(run.status));
          const nodes = ((workflow.body as { nodes?: { id: string; type: string; label: string }[] })?.nodes) ?? [];
          return (
            <Card
              key={workflow.id}
              span={6}
              eyebrow="WORKFLOW"
              prov="human"
              title={workflow.title}
              subtitle={workflow.summary}
              actions={<Pill tone={workflow.status === "active" ? "success" : workflow.status === "draft" ? "neutral" : "warning"} dot>{workflow.status}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => { context.select(workflow.id); context.openOverlay("Workflow designer", { id: workflow.id }); }}>Open</Button>
                <Button size="sm" variant="ghost" onClick={() => { context.select(workflow.id); context.openOverlay("test data", { id: workflow.id }); }}>Simulate</Button>
                {workflow.status === "active" ? (
                  <Button
                    size="sm" variant="outline-danger" busy={busy === workflow.id}
                    disabled={!context.can("run_automation")}
                    onClick={async () => {
                      setBusy(workflow.id);
                      await context.mutate.patch(workflow.id, { status: "stopped", fields: { ...workflow.fields, stoppedBy: context.actor } }, { expectRevision: workflow.revision, event: `Workflow ${workflow.title} stopped` });
                      context.toast("Stopped", `${workflow.title} will not run again until it is activated.`, "blocked");
                      setBusy(undefined);
                    }}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="primary" busy={busy === workflow.id}
                    disabled={!context.can("run_automation")}
                    onClick={() => { context.select(workflow.id); context.openOverlay("activation approval", { id: workflow.id }); }}
                  >
                    Activate
                  </Button>
                )}
              </>}
            >
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Trigger", value: String(workflow.fields.trigger ?? "Not set") },
                  { label: "Scope", value: String(workflow.fields.scope ?? "All records") },
                  { label: "Runs recorded", value: String(runs.length) },
                  { label: "Failed or blocked", value: failed.length ? `${failed.length}` : "None" },
                  { label: "Last run", value: workflow.fields.lastRunAt ? context.relative(String(workflow.fields.lastRunAt)) : "Never" },
                ]} />
                <Row gap={1} wrap>
                  {nodes.map((node) => (
                    <Pill key={node.id} tone={node.type === "trigger" ? "accent" : node.type === "condition" ? "info" : node.type === "approval" ? "warning" : "neutral"}>{node.label}</Pill>
                  ))}
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

export function TemplatesTab() {
  const data = useCrmData();
  if (data.templates.length === 0) return <Empty title="No template">A template is wording or a checklist kept for reuse.</Empty>;
  return (
    <Stack gap={4}>
      <DataGrid
        rows={data.templates}
        rowId={(row) => row.id}
        label="Templates"
        columns={[
          { key: "title", header: "Template", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "kind", header: "Kind", cell: (row) => <Pill tone="neutral">{String(row.fields.kind ?? "note")}</Pill> },
          { key: "channel", header: "Channel", cell: (row) => String(row.fields.channel ?? "—") },
          { key: "delivery", header: "Delivery", cell: (row) => row.fields.delivery === "not_connected" ? <Pill tone="warning">Not connected</Pill> : <span className="ds-subtle">Local use only</span> },
          { key: "summary", header: "What it is for", cell: (row) => <span className="ds-subtle">{row.summary}</span> },
        ]}
      />
      <CapabilityNotice id="email.send" title="A template is wording, not a send" />
    </Stack>
  );
}

export function RunsTab({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const runs = [...data.runs].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  if (runs.length === 0) return <Empty title="No run recorded">A run is recorded whenever a rule does something, including when it refuses.</Empty>;
  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Runs" value={String(runs.length)} prov="human" />
        <Stat label="Succeeded" value={String(runs.filter((run) => run.status === "succeeded").length)} prov="human" />
        <Stat label="Failed" value={String(runs.filter((run) => run.status === "failed").length)} prov="human" />
        <Stat label="Blocked by consent" value={String(runs.filter((run) => run.status === "blocked").length)} meta="A refusal is recorded, not hidden" prov="human" />
      </StatRow>
      <DataGrid
        rows={runs}
        rowId={(row) => row.id}
        label="Workflow runs"
        columns={[
          { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "workflow", header: "Rule", cell: (row) => data.workflows.find((workflow) => workflow.id === String(row.fields.workflowId ?? row.parentId ?? ""))?.title ?? "Unknown" },
          { key: "title", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "status", header: "Result", cell: (row) => <Pill tone={row.status === "succeeded" ? "success" : row.status === "blocked" ? "warning" : "danger"} dot>{row.status}</Pill> },
          { key: "detail", header: "Detail", cell: (row) => row.fields.error ? String(row.fields.error) : <span className="ds-subtle">{row.summary}</span> },
          { key: "duration", header: "Took", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.durationMs ?? "—")}ms</span> },
        ]}
      />
    </Stack>
  );
}

export function FailuresTab({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const failures = data.runs.filter((run) => ["failed", "blocked"].includes(run.status));
  return (
    <Stack gap={4}>
      {failures.length === 0 ? (
        <Empty title="No failure or refusal recorded">Every recorded run completed.</Empty>
      ) : (
        <Stack gap={3}>
          {failures.map((run) => (
            <Card
              key={run.id}
              eyebrow={run.status === "blocked" ? "REFUSED" : "FAILED"}
              prov={run.status === "blocked" ? "human" : "unknown"}
              title={run.title}
              subtitle={run.summary}
              actions={<Pill tone={run.status === "blocked" ? "warning" : "danger"} dot>{run.status}</Pill>}
            >
              <Properties rows={[
                { label: "When", value: <span className="ds-num">{context.dateTime(run.at)}</span> },
                { label: "Rule", value: data.workflows.find((workflow) => workflow.id === String(run.fields.workflowId ?? ""))?.title ?? "Unknown" },
                { label: "Reason", value: String(run.fields.error ?? "Not recorded") },
                { label: "Record", value: String(run.fields.recordId ?? "None") },
              ]} />
              {run.status === "blocked" && (
                <Notice tone="info" title="A refusal is the rule working">
                  The step stopped because the contact is suppressed or has no consent. Nothing was sent, and the refusal is on the record.
                </Notice>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function WorkflowDesigner({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.workflows.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [trigger, setTrigger] = useState(String(existing?.fields.trigger ?? "lead.created"));
  const savedAction = ((existing?.body as { nodes?: { type: string; label: string }[] } | undefined)?.nodes ?? []).find((node) => node.type === "action")?.label;
  const [action, setAction] = useState(() => ({ "Assign an owner": "assign", "Create a follow-up task": "task", "Draft a document": "draft", "Send an email": "email", "Send a text message": "sms" } as Record<string, string>)[savedAction ?? ""] ?? "assign");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [busy, setBusy] = useState(false);

  const ACTIONS = [
    { value: "assign", label: "Assign an owner", safe: true },
    { value: "task", label: "Create a follow-up task", safe: true },
    { value: "draft", label: "Draft a document", safe: true },
    { value: "email", label: "Send an email", safe: false },
    { value: "sms", label: "Send a text message", safe: false },
  ];
  const chosen = ACTIONS.find((item) => item.value === action)!;

  return (
    <Stack gap={4}>
      <Field label="Rule name" required><TextInput aria-label="Rule name" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="When">
          <Select aria-label="When" value={trigger} onChange={(event) => setTrigger(event.target.value)}>
            {["lead.created", "deal.idle", "deal.stage_changed", "quote.accepted", "invoice.overdue"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Then">
          <Select aria-label="Then" value={action} onChange={(event) => setAction(event.target.value)}>
            {ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Field>
      </Row>
      <Field label="What it is for"><TextArea aria-label="What it is for" value={summary} rows={2} onChange={(event) => setSummary(event.target.value)} /></Field>
      {!chosen.safe && (
        <Notice tone="danger" title={`${chosen.label} cannot be part of a rule here`}>
          There is no mail or telephony provider connected, and an automated message to a customer is exactly the thing this workspace will not fake. The rule can draft a document for a person to send instead.
        </Notice>
      )}
      <OverlaySection title="The rule reads as" hint="The second step is not a setting. A refusal is recorded as a blocked run so you can see it happened.">
        <ol className="crm-steps">
          <li><strong>When</strong> {trigger}</li>
          <li><strong>Check</strong> the contact is not suppressed</li>
          <li><strong>Then</strong> {chosen.label.toLowerCase()}</li>
        </ol>
      </OverlaySection>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!title.trim() || !chosen.safe || !context.can("run_automation")}
          title={!chosen.safe ? "Choose an action this workspace can actually perform" : undefined}
          onClick={async () => {
            setBusy(true);
            const nodes = [
              { id: "n1", type: "trigger", label: trigger, x: 40, y: 80 },
              { id: "n2", type: "condition", label: "Contact is not suppressed", x: 240, y: 80 },
              { id: "n3", type: "action", label: chosen.label, x: 460, y: 80 },
            ];
            if (existing) {
              await context.mutate.patch(existing.id, {
                title: title.trim(), summary,
                fields: { ...existing.fields, trigger },
                body: { nodes, edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] },
              }, { expectRevision: existing.revision, event: `Workflow ${title.trim()} edited` });
            } else {
              await context.mutate.create({
                collection: "workflows",
                title: title.trim(),
                status: "draft",
                summary: summary || `${trigger} then ${chosen.label.toLowerCase()}.`,
                fields: { trigger, scope: "all records", runs: 0 },
                body: { nodes, edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] },
              }, `Workflow ${title.trim()} created`);
            }
            context.toast("Rule saved as a draft", "A draft rule never runs. Activating it is a separate, recorded decision.");
            setBusy(false);
            close();
          }}
        >
          {existing ? "Save the rule" : "Create as a draft"}
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function TestData({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const workflow = data.workflows.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!workflow) return <Empty title="Select a rule first" />;

  const trigger = String(workflow.fields.trigger ?? "");
  const subjects = trigger.startsWith("lead")
    ? data.leads
    : trigger.startsWith("deal")
      ? data.deals
      : trigger.startsWith("quote")
        ? data.quotes
        : data.invoices;

  const simulated = subjects.slice(0, 8).map((record) => {
    const contact = contactById(data, String(record.fields.contactId ?? ""));
    const blocked = contact?.fields.suppressed === true
      ? "Contact is suppressed"
      : !record.fields.contactId
        ? "No contact record on the subject"
        : undefined;
    return { record, blocked };
  });

  return (
    <Stack gap={4}>
      <FactGrid columns={3} items={[
        { label: "Examined", value: String(simulated.length), mono: true, hint: trigger },
        { label: "Would act on", value: String(simulated.filter((entry) => !entry.blocked).length), mono: true, tone: "success" },
        { label: "Would refuse", value: String(simulated.filter((entry) => entry.blocked).length), mono: true, tone: simulated.some((entry) => entry.blocked) ? "warning" : undefined },
      ]} />
      <p className="ds-subtle">A simulation changes nothing: it runs {workflow.title} against real records and writes no record and no run.</p>
      <DataGrid
        rows={simulated}
        rowId={(row) => row.record.id}
        label="Simulation result"
        filterable={false}
        columns={[
          { key: "subject", header: "Record", primary: true, cell: (row) => row.record.title },
          { key: "verdict", header: "Would", cell: (row) => row.blocked ? <Pill tone="warning" dot>Refuse</Pill> : <Pill tone="success" dot>Act</Pill> },
          { key: "why", header: "Why", cell: (row) => row.blocked ?? <span className="ds-subtle">Conditions met</span> },
        ]}
      />
    </Stack>
  );
}

export function ActivationApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const workflow = data.workflows.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!workflow) return <Empty title="Select a rule first" />;
  const nodes = ((workflow.body as { nodes?: { id: string; type: string; label: string }[] })?.nodes) ?? [];
  const sends = nodes.some((node) => /email|text|sms|call/i.test(node.label));

  return (
    <Stack gap={4}>
      <Notice tone={sends ? "danger" : "warning"} title={sends ? "This rule claims to contact a customer" : "Activating means the rule can write records"}>
        {sends
          ? "No provider is connected, so a sending step would be a lie. Edit the rule to draft a document instead."
          : "It will assign owners, create tasks and draft documents when its trigger matches. It will never contact anyone."}
      </Notice>
      <OverlaySection title={workflow.title} hint={`Triggers on ${String(workflow.fields.trigger ?? "nothing yet")}. Approver: ${context.actor}.`}>
        {nodes.length === 0 ? <span className="ds-subtle">No steps recorded.</span> : (
          <ol className="crm-steps">
            {nodes.map((node) => <li key={node.id}><strong>{node.type}</strong> {node.label}</li>)}
          </ol>
        )}
      </OverlaySection>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={sends || !context.can("run_automation")}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(workflow.id, {
              status: "active",
              fields: { ...workflow.fields, activatedBy: context.actor, activatedAt: clockIso() },
            }, { expectRevision: workflow.revision, event: `Workflow ${workflow.title} activated by ${context.actor}` });
            context.toast("Rule activated", `${workflow.title} is active. ${context.actor} is recorded as the approver, and every run will be listed under Runs.`);
            setBusy(false);
            close();
          }}
        >
          Activate the rule
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function AutomationStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  void context;
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{data.workflows.filter((workflow) => workflow.status === "active").length} active</Pill>
      <Pill tone="neutral">{data.workflows.filter((workflow) => workflow.status === "draft").length} draft</Pill>
      <span className="ds-subtle">{data.runs.length} runs recorded</span>
      <Pill tone={data.runs.some((run) => run.status === "failed") ? "danger" : "success"} dot>
        {data.runs.filter((run) => run.status === "failed").length} failed
      </Pill>
      <span className="ds-grow" />
      <span className="ds-subtle">No rule contacts a customer.</span>
    </Row>
  );
}
