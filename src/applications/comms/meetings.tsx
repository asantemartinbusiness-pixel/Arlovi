import { useState } from "react";
import { CalendarDays, Link2, MessageSquare, Trash2, Video } from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { routeForRecord } from "@/platform/attention";
import type { Rec } from "@/domain/types";
import { useCommsData } from "./panels";
import {
  addMinutes, agendaMinutes, agendaOf, answerOf, answerTally, findClashes, formatAgenda, instant, localDate, localParts, minutesBetween,
  parseAgenda, people, responsesOf, type AgendaItem, type Answer, type RecordedAnswer,
} from "./schedule";

/* ====================================================================== *
 * ARL-COMMS-007 / 008 · Scheduling and the meeting record.
 * No calendar or conferencing provider is connected: invitations are not
 * sent, answers are what a person recorded here, and a call cannot start.
 * ====================================================================== */

const LINKABLE = ["contacts", "deals", "projects", "candidates", "employees"] as const;
const LINKABLE_LABEL: Record<string, string> = {
  contacts: "Contact", deals: "Deal", projects: "Project", candidates: "Candidate", employees: "Employee",
};

function useLinkable() {
  return useCollections([...LINKABLE]);
}

function linkedRecordOf(meeting: Rec, pool: Record<string, Rec[]>): Rec | undefined {
  const id = String(meeting.fields.linkedRecordId ?? "");
  if (!id) return undefined;
  return LINKABLE.flatMap((collection) => pool[collection] ?? []).find((record) => record.id === id);
}

/* ------------------------------ Event form ----------------------------- */

export function EventForm({ context, close, formId = "cm-event" }: { context: ScreenContext; close: () => void; formId?: string }) {
  const payload = context.overlayPayload as { date?: string; time?: string; id?: string } | undefined;
  const editingId = payload?.id ?? (formId === "cm-event-edit" ? context.params.id : undefined);
  const existing = useRecord(editingId);
  const data = useCommsData();
  const linkable = useLinkable();
  const editing = existing && existing.collection === "meetings" ? existing : undefined;

  const [loaded, setLoaded] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(payload?.date ?? localDate(context.now));
  const [start, setStart] = useState(payload?.time ?? "10:00");
  const [minutes, setMinutes] = useState(30);
  const [where, setWhere] = useState("Studio table");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [agenda, setAgenda] = useState("");
  const [linked, setLinked] = useState("");
  const [error, setError] = useState("");

  if (editing && loaded !== editing.id) {
    setLoaded(editing.id);
    setTitle(editing.title);
    // The form shows local wall-clock time; startAt is stored as UTC.
    const parts = localParts(editing.startAt);
    setDate(parts.date);
    setStart(parts.time);
    setMinutes(minutesBetween(editing.startAt, editing.endAt) || Number(editing.fields.minutes ?? 30));
    setWhere(String(editing.fields.where ?? ""));
    setAttendees(people(editing.fields.attendees).filter((name) => name !== String(editing.fields.organizer ?? "")));
    setAgenda(formatAgenda(agendaOf(editing)));
    setLinked(String(editing.fields.linkedRecordId ?? ""));
  }

  const organizer = editing ? String(editing.fields.organizer ?? context.actor) : context.actor;
  const everyone = [organizer, ...attendees.filter((name) => name !== organizer)];
  const startAt = instant(date, start);
  const endAt = startAt ? addMinutes(startAt, minutes) : "";
  const clashes = startAt ? findClashes(data.meetings, { startAt, endAt, attendees: everyone, excludeId: editing?.id }) : [];
  const staff = data.employees.filter((employee) => employee.status !== "alumni").map((employee) => employee.title);
  const options = [...new Set([...staff, ...attendees])].filter((name) => name !== organizer).sort();
  const linkOptions = LINKABLE.flatMap((collection) => (linkable[collection] ?? [])
    .filter((record) => collection !== "employees" || record.status !== "alumni")
    .map((record) => ({ id: record.id, label: record.title, collection })));
  const linkedRecord = linkOptions.find((option) => option.id === linked);

  return (
    <form
      id={formId}
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) { setError("Give the event a title."); return; }
        if (!startAt) { setError("Choose a valid date and start time."); return; }
        if (minutes < 5 || minutes > 720) { setError("A meeting runs between 5 and 720 minutes."); return; }
        setError("");
        const items: AgendaItem[] = parseAgenda(agenda).map((item) => {
          const before = editing ? agendaOf(editing).find((row) => row.title === item.title) : undefined;
          return { ...item, covered: before?.covered ?? false };
        });
        const status = editing?.status === "finished" ? "finished" : clashes.length > 0 ? "tentative" : editing?.status === "tentative" ? "scheduled" : editing?.status ?? "scheduled";
        const fields = {
          ...(editing?.fields ?? {}),
          where, organizer, attendees: everyone.join(","), agenda: items.map((item) => item.title).join(", "),
          minutes, recurring: Boolean(editing?.fields.recurring ?? false), conferencing: "not_connected",
          accepted: editing ? answerTally({ ...editing, fields: { ...editing.fields, attendees: everyone.join(",") } }).accepted : 0,
          linkedRecordId: linkedRecord?.id ?? "", linkedCollection: linkedRecord?.collection ?? "", linkedTitle: linkedRecord?.label ?? "",
        };
        const body = { ...((editing?.body as object | undefined) ?? {}), agendaItems: items };
        try {
          if (editing) {
            const saved = await context.mutate.patch(editing.id, {
              title: title.trim(), status, summary: fields.agenda, startAt, endAt, at: startAt, fields, body,
            }, { expectRevision: editing.revision, event: `${title.trim()} updated by ${context.actor}` });
            if (!saved) {
              setError("This event changed elsewhere before your edit was saved. Close it, reopen the event and apply the change again.");
              return;
            }
            context.toast("Event updated", clashes.length > 0 ? "Saved as tentative because of a clash. No updated invitation was sent." : "The calendar shows the new details. No updated invitation was sent.");
          } else {
            await context.mutate.create({
              collection: "meetings", title: title.trim(), status, summary: fields.agenda, startAt, endAt, at: startAt, fields, body,
            }, `Meeting created by ${context.actor}`);
            context.toast("Meeting created", clashes.length > 0 ? "Saved as tentative because of a clash." : "It is in the calendar in this workspace.");
          }
          close();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "The event was not saved. Reopen it and try again.");
        }
      }}
    >
      <Field label="Title" required><TextInput name="title" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Row gap={3} wrap>
        <Field label="Date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Start"><TextInput type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Minutes"><TextInput inputMode="numeric" align="end" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value) || 0)} /></Field>
      </Row>
      <Field label="Where"><TextInput name="where" value={where} onChange={(event) => setWhere(event.target.value)} /></Field>
      <Field label="Attendees" hint={`${organizer} organises and is always included. Hold Ctrl or ⌘ to choose several.`}>
        <Select
          multiple
          value={attendees}
          onChange={(event) => setAttendees(Array.from(event.target.selectedOptions).map((option) => option.value))}
          style={{ minHeight: 120 }}
        >
          {options.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Linked record" hint="The meeting appears on the record's context, and its notes link back.">
        <Select value={linked} onChange={(event) => setLinked(event.target.value)}>
          <option value="">Not linked</option>
          {LINKABLE.map((collection) => {
            const rows = linkOptions.filter((option) => option.collection === collection);
            return rows.length === 0 ? null : (
              <optgroup key={collection} label={`${LINKABLE_LABEL[collection]}s`}>
                {rows.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </optgroup>
            );
          })}
        </Select>
      </Field>
      <Field label="Agenda" hint="One item per line. Add an owner after a dash and minutes after a comma: “Glaze decision — Maya Chen, 15”.">
        <TextArea name="agenda" rows={4} value={agenda} onChange={(event) => setAgenda(event.target.value)} />
      </Field>
      {agendaMinutes(parseAgenda(agenda)) > minutes && (
        <Notice tone="warning" title="The agenda is longer than the meeting">
          The items add up to {agendaMinutes(parseAgenda(agenda))} minutes against {minutes} booked.
        </Notice>
      )}
      {clashes.length > 0 ? (
        <Notice tone="warning" title={`${clashes.length} clash${clashes.length === 1 ? "" : "es"} with this time`}>
          {clashes.map((clash) => `${clash.meeting.title} at ${context.dateTime(clash.meeting.startAt)} (${clash.who.join(", ")})`).join("; ")}.
          The meeting can still be saved; it is marked tentative.
        </Notice>
      ) : startAt ? (
        <p className="ds-subtle" role="status">No clash with anything recorded in this workspace for these people.</p>
      ) : null}
      {error && <Notice tone="danger" title="Not saved">{error}</Notice>}
      <Notice tone="info" title="Invites are not sent">
        No calendar provider is connected. Attendees appear on the record as invited, and their answer is only known here if
        somebody records it.
      </Notice>
    </form>
  );
}

/* ---------------------------- Meeting record --------------------------- */

interface MeetingAction { label: string; owner: string; done: boolean; taskId?: string }

const ANSWERS: { value: Answer; label: string; tone: "neutral" | "success" | "warning" | "danger" }[] = [
  { value: "invited", label: "Invited", tone: "neutral" },
  { value: "accepted", label: "Accepted", tone: "success" },
  { value: "tentative", label: "Tentative", tone: "warning" },
  { value: "declined", label: "Declined", tone: "danger" },
];

function bodyOf(meeting: Rec) {
  return (meeting.body as { notes?: string; actions?: MeetingAction[]; agendaItems?: AgendaItem[]; responses?: Record<string, RecordedAnswer> } | undefined) ?? {};
}

function LinkedRecordCard({ context, meeting }: { context: ScreenContext; meeting: Rec }) {
  const linkable = useLinkable();
  const { org } = useWorkspace();
  const record = linkedRecordOf(meeting, linkable);
  const id = String(meeting.fields.linkedRecordId ?? "");
  const href = record ? routeForRecord(record, org.slug) : undefined;
  return (
    <Card eyebrow="LINKED RECORD" prov="human" title={record ? record.title : id ? String(meeting.fields.linkedTitle || "Linked record") : "Not linked"}
      subtitle={record ? LINKABLE_LABEL[record.collection] ?? record.collection : id ? "The linked record is not in this workspace any more" : "Link a contact, deal, project, candidate or employee"}>
      <Row gap={2} wrap>
        {href && <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => context.navigate(href)}>Open {record?.title}</Button>}
        {meeting.status !== "finished" && <Button size="sm" variant="ghost" onClick={() => context.openOverlay("edit event", { id: meeting.id })}>{id ? "Change link" : "Link a record"}</Button>}
      </Row>
    </Card>
  );
}

export function MeetingWorkspace({ context, lens }: { context: ScreenContext; lens: "Call" | "Chat" | "Notes" | "Participants" }) {
  const data = useCommsData();
  const record = useRecord(context.params.id);
  const meeting = record ?? data.meetings[0];
  const [notes, setNotes] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [busy, setBusy] = useState(false);
  if (!meeting) return <Empty title="No meeting" icon={<CalendarDays size={20} />} />;
  const attendees = people(meeting.fields.attendees);
  const body = bodyOf(meeting);
  const actions = body.actions ?? [];
  const agenda = agendaOf(meeting);
  const patchBody = (next: object, event: string) =>
    context.mutate.patch(meeting.id, { body: { ...body, ...next } }, { expectRevision: meeting.revision, event });

  if (lens === "Chat") {
    return (
      <Stack gap={4}>
        <Empty title="No meeting chat was recorded" icon={<MessageSquare size={20} />}>
          Chat during a call would be kept with the meeting record. Nothing was captured for this one.
        </Empty>
        <Notice tone="info">Discussion that matters belongs in a channel, where it can be found again.</Notice>
      </Stack>
    );
  }

  if (lens === "Notes") {
    const value = notes ?? body.notes ?? "";
    return (
      <Grid>
        <Card span={7} title="Notes" subtitle={body.notes ? "Recorded in this workspace" : "Nothing recorded yet"}>
          <form
            className="ds-stack ds-gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await patchBody({ notes: value }, `Notes saved on ${meeting.title}`);
              context.toast("Notes saved", "They are on the meeting record.");
              setNotes(null);
            }}
          >
            <Field label="What was decided"><TextArea rows={7} value={value} onChange={(event) => setNotes(event.target.value)} /></Field>
            <Row gap={2}>
              <Button type="submit" variant="primary" disabled={notes === null || notes === (body.notes ?? "")}>Save notes</Button>
              {notes !== null && notes !== (body.notes ?? "") && <span className="ds-subtle">Unsaved changes</span>}
            </Row>
          </form>
        </Card>
        <Stack gap={4} style={{ gridColumn: "span 5" }}>
          <LinkedRecordCard context={context} meeting={meeting} />
        </Stack>
        <Card span={12} title="Actions" subtitle={`${actions.filter((item) => !item.done).length} open of ${actions.length}`}>
          <Stack gap={3}>
            {actions.map((action, index) => (
              <div key={`${action.label}-${index}`} className="cm-agenda-item">
                <Checkbox
                  label={`${action.label} — ${action.owner}`}
                  checked={action.done}
                  onChange={async (event) => {
                    const next = actions.map((item, position) => (position === index ? { ...item, done: event.target.checked } : item));
                    await patchBody({ actions: next }, `Meeting action “${action.label}” ${event.target.checked ? "done" : "reopened"} on ${meeting.title}`);
                  }}
                />
                <span />
                {action.taskId ? (
                  <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/project/tasks/${action.taskId}`)}>Open the task</Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
                    setBusy(true);
                    try {
                      const task = await context.mutate.create({
                        collection: "tasks", title: action.label, status: "ready",
                        summary: `Action from the meeting “${meeting.title}” on ${context.date(meeting.startAt)}, raised by ${context.actor}.`,
                        fields: { stage: "ready", assignee: action.owner, priority: "normal", estimateHours: 1, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false, sourceMeetingId: meeting.id },
                      }, `Task raised from ${meeting.title} by ${context.actor}`);
                      const next = actions.map((item, position) => (position === index ? { ...item, taskId: task.id } : item));
                      await patchBody({ actions: next }, `Action “${action.label}” linked to task ${task.id}`);
                      context.toast("Task created", `${action.label} is in Projects, assigned to ${action.owner}, with a link back to this meeting.`);
                    } finally { setBusy(false); }
                  }}>Make a task</Button>
                )}
              </div>
            ))}
            {actions.length === 0 && <span className="ds-subtle">No actions were recorded.</span>}
            <form
              className="ds-row ds-gap-2 ds-wrap"
              onSubmit={async (event) => {
                event.preventDefault();
                const label = actionLabel.trim();
                const owner = actionOwner || attendees[0] || context.actor;
                if (!label) return;
                await patchBody({ actions: [...actions, { label, owner, done: false }] }, `Action “${label}” recorded on ${meeting.title} for ${owner}`);
                setActionLabel("");
                context.toast("Action recorded", `${label} is on the meeting record for ${owner}.`);
              }}
            >
              <Field label="New action"><TextInput value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="What needs doing" /></Field>
              <Field label="Owner">
                <Select value={actionOwner || attendees[0] || context.actor} onChange={(event) => setActionOwner(event.target.value)}>
                  {[...new Set([...attendees.filter((name) => name !== "Everyone"), context.actor])].map((name) => <option key={name}>{name}</option>)}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" disabled={!actionLabel.trim()} style={{ alignSelf: "end" }}>Record an action</Button>
            </form>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Participants") {
    const tally = answerTally(meeting);
    const responses = responsesOf(meeting);
    const recordAnswer = async (name: string, answer: Answer) => {
      const next = { ...responses, [name]: { answer, recordedBy: context.actor, at: context.now.toISOString() } };
      const accepted = attendees.filter((person) => (next[person]?.answer ?? "invited") === "accepted").length;
      await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, accepted }, body: { ...body, responses: next } },
        { expectRevision: meeting.revision, event: `${context.actor} recorded ${name} as ${answer} for ${meeting.title}` });
    };
    return (
      <Grid>
        <Card span={8} title={`${attendees.length} people`} subtitle={`${tally.accepted} accepted · ${tally.tentative} tentative · ${tally.declined} declined · ${tally.invited} no answer recorded`}
          actions={meeting.status !== "finished" && attendees[0] !== "Everyone" ? <Button size="sm" variant="secondary" onClick={() => context.openOverlay("invite")}>Invite someone</Button> : undefined}>
          <div role="list" aria-label="Participants">
            {attendees.map((name) => {
              const stored = responses[name];
              const organiser = name === String(meeting.fields.organizer ?? "");
              return (
                <div key={name} className="cm-attendee" role="listitem">
                  <Stack gap={1}>
                    <Row gap={2}>
                      <Avatar name={name} size="sm" />
                      <strong>{name}</strong>
                      {organiser && <Pill tone="info">Organiser</Pill>}
                      {String(meeting.fields.recordingConsent ?? "").split(",").includes(name) && <Pill tone="success">Consents to recording</Pill>}
                    </Row>
                    <span className="ds-subtle">{stored ? `Answer recorded by ${stored.recordedBy}, ${context.relative(stored.at)}` : "No answer recorded here"}</span>
                  </Stack>
                  <Row gap={2}>
                    <Select aria-label={`Answer for ${name}`} value={answerOf(meeting, name)} onChange={(event) => void recordAnswer(name, event.target.value as Answer)}>
                      {ANSWERS.map((answer) => <option key={answer.value} value={answer.value}>{answer.label}</option>)}
                    </Select>
                    {!organiser && name !== "Everyone" && meeting.status !== "finished" && (
                      <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} aria-label={`Remove ${name}`} onClick={async () => {
                        const rest = { ...responses };
                        delete rest[name];
                        await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, attendees: attendees.filter((person) => person !== name).join(",") }, body: { ...body, responses: rest } },
                          { expectRevision: meeting.revision, event: `${name} removed from ${meeting.title} by ${context.actor}` });
                        context.toast("Removed", `${name} is no longer on ${meeting.title}. Nobody was notified.`);
                      }} />
                    )}
                  </Row>
                </div>
              );
            })}
          </div>
        </Card>
        <Stack gap={4} style={{ gridColumn: "span 4" }}>
          <Notice tone="warning" title="Answers are recorded, not received">
            No calendar provider is connected, so an acceptance made elsewhere is not known here. An answer shows only when somebody
            in this workspace records it, with their name beside it.
          </Notice>
        </Stack>
      </Grid>
    );
  }

  const booked = minutesBetween(meeting.startAt, meeting.endAt) || Number(meeting.fields.minutes ?? 0);
  const planned = agendaMinutes(agenda);
  return (
    <Grid>
      <Card span={7} eyebrow="MEETING" prov="human" title={meeting.title}
        subtitle={<span><span className="ds-num">{context.dateTime(meeting.startAt)}</span> · {booked} minutes · {String(meeting.fields.where ?? "")}</span>}
        actions={<Pill tone={meeting.status === "tentative" ? "warning" : meeting.status === "finished" ? "neutral" : "info"} dot>{meeting.status}</Pill>}>
        <Stack gap={4}>
          <div className="ds-panel" style={{ padding: "var(--space-5)", textAlign: "center" }}>
            <Video size={28} aria-hidden="true" />
            <h3 style={{ marginBlock: "var(--space-2)" }}>No conferencing service is connected</h3>
            <p className="ds-prose" style={{ margin: "0 auto" }}>
              This workspace cannot open a microphone, a camera or a call. The meeting record holds its time, place, attendees,
              agenda, notes and actions, which is what the rest of the workspace reads.
            </p>
          </div>
          <Row gap={2} wrap>
            {meeting.status !== "finished" && <Button variant="primary" onClick={() => context.openOverlay("edit event", { id: meeting.id })}>Edit details</Button>}
            <Button variant="secondary" onClick={() => context.openOverlay("recording consent")}>Record consent</Button>
            <Button variant="outline-danger" disabled={meeting.status === "finished"} onClick={async () => {
              await context.mutate.patch(meeting.id, { status: "finished" }, { expectRevision: meeting.revision, event: `${meeting.title} marked finished by ${context.actor}` });
              context.toast("Meeting closed", "The record is marked finished.");
            }}>End the meeting</Button>
          </Row>
          <Properties rows={[
            { label: "Organiser", value: String(meeting.fields.organizer ?? "") },
            { label: "Attendees", value: `${attendees.length} · ${answerTally(meeting).accepted} accepted as recorded here` },
            { label: "Recording", value: <Pill tone="warning">Not possible here</Pill> },
          ]} />
        </Stack>
      </Card>
      <Stack gap={4} style={{ gridColumn: "span 5" }}>
        <Card eyebrow="AGENDA" prov="human" title="Agenda" subtitle={agenda.length ? `${agenda.filter((item) => item.covered).length} of ${agenda.length} covered${planned ? ` · ${planned} of ${booked} minutes planned` : ""}` : "No agenda recorded"}>
          <Stack gap={1}>
            {agenda.map((item, index) => (
              <div key={`${item.title}-${index}`} className="cm-agenda-item">
                <Checkbox
                  label={item.title}
                  checked={item.covered}
                  onChange={async (event) => {
                    const next = agenda.map((row, position) => (position === index ? { ...row, covered: event.target.checked } : row));
                    await patchBody({ agendaItems: next }, `Agenda item “${item.title}” ${event.target.checked ? "covered" : "reopened"} on ${meeting.title}`);
                  }}
                />
                <span className="ds-subtle ds-truncate">{item.owner}</span>
                <span className="ds-subtle ds-num">{item.minutes ? `${item.minutes} min` : ""}</span>
              </div>
            ))}
            {agenda.length === 0 && <span className="ds-subtle">Add agenda items from Edit details.</span>}
          </Stack>
          {planned > booked && <Notice tone="warning" title="Over-planned">The agenda needs {planned} minutes; {booked} are booked.</Notice>}
        </Card>
        <LinkedRecordCard context={context} meeting={meeting} />
      </Stack>
    </Grid>
  );
}
