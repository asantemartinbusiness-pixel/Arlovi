import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button, Empty, Notice, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { addDays, sameDay, startOfDay, startOfMonth, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { clashingIds, people, upcomingByDay } from "./schedule";

/* Every view below is positioned from `context.now`; no date is written down. */

export type CalendarView = "Day" | "Week" | "Month" | "Agenda";

function eventsOn(meetings: Rec[], day: Date): Rec[] {
  return meetings
    .filter((meeting) => meeting.startAt && sameDay(new Date(meeting.startAt), day))
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
}

export function MonthView({ context, meetings, month, onPick, onPickDay }: {
  context: ScreenContext; meetings: Rec[]; month: Date; onPick: (meeting: Rec) => void; onPickDay: (day: Date) => void;
}) {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return (
    <div className="cm-cal" role="grid" aria-label={`Month view for ${context.date(first, { month: "long", year: "numeric" })}`}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
        <div key={label} className="cm-cal-head" role="columnheader">{label}</div>
      ))}
      {days.map((day) => {
        const items = eventsOn(meetings, day);
        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            className="cm-cal-day"
            data-outside={day.getMonth() !== first.getMonth() ? "true" : undefined}
            data-today={sameDay(day, context.now) ? "true" : undefined}
            onDoubleClick={() => onPickDay(day)}
          >
            <button
              type="button"
              className="cm-cal-num"
              style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textAlign: "start" }}
              aria-label={`${context.date(day, { weekday: "long", day: "numeric", month: "long" })}, ${items.length} meetings. Create an event.`}
              onClick={() => onPickDay(day)}
            >
              {day.getDate()}
            </button>
            {items.slice(0, 3).map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                className="cm-event"
                data-state={meeting.status}
                onClick={() => onPick(meeting)}
                title={`${meeting.title} · ${context.dateTime(meeting.startAt)}`}
              >
                {context.date(meeting.startAt, { hour: "2-digit", minute: "2-digit" }).split(", ").pop()} {meeting.title}
              </button>
            ))}
            {items.length > 3 && <span className="ds-subtle" style={{ fontSize: 11 }}>+{items.length - 3} more</span>}
          </div>
        );
      })}
    </div>
  );
}

export function WeekView({ context, meetings, weekStart, onPick, onCreateAt }: {
  context: ScreenContext; meetings: Rec[]; weekStart: Date; onPick: (meeting: Rec) => void; onCreateAt: (day: Date, time?: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const hours = Array.from({ length: 12 }, (_, index) => index + 7);
  const clashes = clashingIds(meetings);
  return (
    <div className="cm-week" role="grid" aria-label={`Week beginning ${context.date(weekStart)}`}>
      <div className="cm-week-hour" />
      {days.map((day) => (
        <div key={day.toISOString()} className="cm-cal-head" role="columnheader">
          {context.date(day, { weekday: "short", day: "numeric" })}
        </div>
      ))}
      {hours.map((hour) => (
        <div key={hour} style={{ display: "contents" }}>
          <div className="cm-week-hour">{String(hour).padStart(2, "0")}:00</div>
          {days.map((day) => {
            const slotStart = new Date(day);
            slotStart.setHours(hour, 0, 0, 0);
            const items = meetings.filter((meeting) => {
              if (!meeting.startAt) return false;
              const start = new Date(meeting.startAt);
              return sameDay(start, day) && start.getHours() === hour;
            });
            const isNow = sameDay(day, context.now) && context.now.getHours() === hour;
            return (
              <div key={day.toISOString() + hour} className="cm-week-cell" data-now={isNow ? "true" : undefined} role="gridcell">
                {items.map((meeting) => (
                  <button
                    key={meeting.id}
                    type="button"
                    className="cm-event"
                    data-state={meeting.status}
                    data-clash={clashes.has(meeting.id) ? "true" : undefined}
                    title={`${meeting.title} · ${context.dateTime(meeting.startAt)}${clashes.has(meeting.id) ? " · clashes with another meeting" : ""}`}
                    onClick={() => onPick(meeting)}
                  >
                    {meeting.title}
                  </button>
                ))}
                {items.length === 0 && (
                  <button
                    type="button"
                    className="cm-slot-add"
                    aria-label={`Create an event on ${context.date(day, { weekday: "long", day: "numeric", month: "long" })} at ${String(hour).padStart(2, "0")}:00`}
                    onClick={() => onCreateAt(day, `${String(hour).padStart(2, "0")}:00`)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function timeOf(context: ScreenContext, iso?: string): string {
  return context.date(iso, { hour: "2-digit", minute: "2-digit" }).split(", ").pop() ?? "";
}

function MeetingCard({ context, meeting, clash, onPick, onEdit }: {
  context: ScreenContext; meeting: Rec; clash: boolean; onPick: (meeting: Rec) => void; onEdit?: (meeting: Rec) => void;
}) {
  return (
    <div className="cm-day-card">
      <button type="button" className="ds-record-card" onClick={() => onPick(meeting)}>
        <Row gap={2}>
          <strong className="ds-grow" style={{ textAlign: "start" }}>{meeting.title}</strong>
          {clash && <Pill tone="danger" dot>Clash</Pill>}
          <Pill tone={meeting.status === "tentative" ? "warning" : meeting.status === "finished" ? "neutral" : "info"} dot>{meeting.status}</Pill>
        </Row>
        <span className="ds-subtle">
          {timeOf(context, meeting.startAt)}–{timeOf(context, meeting.endAt)} · {String(meeting.fields.where ?? "")} · {people(meeting.fields.attendees).includes("Everyone") ? "everyone invited" : `${people(meeting.fields.attendees).length} attendees`}
        </span>
      </button>
      {onEdit && meeting.status !== "finished" && (
        <Button size="sm" variant="ghost" aria-label={`Edit ${meeting.title}`} onClick={() => onEdit(meeting)}>Edit</Button>
      )}
    </div>
  );
}

export function DayView({ context, meetings, day, onPick, onCreateAt, onEdit }: {
  context: ScreenContext; meetings: Rec[]; day: Date; onPick: (meeting: Rec) => void;
  onCreateAt: (day: Date, time?: string) => void; onEdit?: (meeting: Rec) => void;
}) {
  const items = eventsOn(meetings, day);
  const clashes = clashingIds(meetings);
  const hours = Array.from({ length: 12 }, (_, index) => index + 7);
  const hourOf = (meeting: Rec) => new Date(meeting.startAt ?? "").getHours();
  const outside = items.filter((meeting) => hourOf(meeting) < 7 || hourOf(meeting) > 18);
  const label = context.date(day, { weekday: "long", day: "numeric", month: "long" });
  return (
    <Stack gap={2}>
      {items.length === 0 && (
        <p className="ds-subtle">Nothing is recorded on {label}. Choose an hour to add an event.</p>
      )}
      <div className="cm-day-list" role="list" aria-label={`Timeline for ${label}`}>
        {hours.map((hour) => {
          const rows = items.filter((meeting) => hourOf(meeting) === hour);
          const time = `${String(hour).padStart(2, "0")}:00`;
          return (
            <div key={hour} className="cm-day-row" role="listitem" data-now={sameDay(day, context.now) && context.now.getHours() === hour ? "true" : undefined}>
              <strong className="ds-num">{time}</strong>
              {rows.length > 0 ? (
                <Stack gap={2}>
                  {rows.map((meeting) => <MeetingCard key={meeting.id} context={context} meeting={meeting} clash={clashes.has(meeting.id)} onPick={onPick} onEdit={onEdit} />)}
                </Stack>
              ) : (
                <button type="button" className="cm-day-free" onClick={() => onCreateAt(day, time)} aria-label={`Create an event on ${label} at ${time}`}>
                  <span aria-hidden="true">+</span> Add at {time}
                </button>
              )}
            </div>
          );
        })}
        {outside.map((meeting) => (
          <div key={meeting.id} className="cm-day-row" role="listitem">
            <strong className="ds-num">{timeOf(context, meeting.startAt)}</strong>
            <MeetingCard context={context} meeting={meeting} clash={clashes.has(meeting.id)} onPick={onPick} onEdit={onEdit} />
          </div>
        ))}
      </div>
    </Stack>
  );
}

export function AgendaView({ context, meetings, onPick, onEdit }: {
  context: ScreenContext; meetings: Rec[]; onPick: (meeting: Rec) => void; onEdit?: (meeting: Rec) => void;
}) {
  const days = upcomingByDay(meetings, context.now, 21);
  const clashes = clashingIds(meetings);
  if (days.length === 0) {
    return <Empty title="Nothing in the next three weeks" icon={<CalendarDays size={20} />}>Events you create or are invited to appear here in date order.</Empty>;
  }
  return (
    <Stack gap={4}>
      {days.map((group) => {
        const heading = context.date(`${group.day}T12:00:00.000Z`, { weekday: "long", day: "numeric", month: "long" });
        return (
          <section key={group.day} className="cm-agenda-day" aria-label={heading}>
            <Row gap={2}>
              <h3 className="ds-grow" style={{ margin: 0, fontSize: "var(--text-md)" }}>{heading}</h3>
              <span className="ds-subtle">{group.meetings.length} {group.meetings.length === 1 ? "event" : "events"}</span>
            </Row>
            <div className="cm-day-list">
              {group.meetings.map((meeting) => (
                <div key={meeting.id} className="cm-day-row">
                  <strong className="ds-num">{timeOf(context, meeting.startAt)}</strong>
                  <MeetingCard context={context} meeting={meeting} clash={clashes.has(meeting.id)} onPick={onPick} onEdit={onEdit} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </Stack>
  );
}

export function CalendarSurface({
  context, meetings, view, onPick, onCreateAt, onEdit,
}: {
  context: ScreenContext; meetings: Rec[]; view: CalendarView;
  onPick: (meeting: Rec) => void; onCreateAt: (day: Date, time?: string) => void; onEdit?: (meeting: Rec) => void;
}) {
  const [offset, setOffset] = useState(0);

  const anchor = useMemo(() => {
    if (view === "Month") return new Date(context.now.getFullYear(), context.now.getMonth() + offset, 1);
    if (view === "Week") return addDays(startOfWeek(context.now), offset * 7);
    return addDays(startOfDay(context.now), offset);
  }, [context.now, offset, view]);

  const label = view === "Month"
    ? context.date(anchor, { month: "long", year: "numeric" })
    : view === "Week"
      ? `${context.date(anchor, { day: "numeric", month: "short" })} – ${context.date(addDays(anchor, 6), { day: "numeric", month: "short" })}`
      : context.date(anchor, { weekday: "long", day: "numeric", month: "long" });

  const step = view === "Month" ? "month" : view === "Week" ? "week" : "day";

  const notice = (
    <Notice tone="warning" title="Invite status is what this workspace recorded">
      An attendee is shown as invited unless somebody recorded their answer here. No calendar provider is connected, so an
      acceptance elsewhere is not known to this screen and is never assumed.
    </Notice>
  );

  if (view === "Agenda") {
    return (
      <Stack gap={4}>
        <AgendaView context={context} meetings={meetings} onPick={onPick} onEdit={onEdit} />
        {notice}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => setOffset((value) => value - 1)}>Previous {step}</Button>
        <strong className="ds-grow" style={{ fontSize: "var(--text-lg)" }}>{label}</strong>
        <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Today</Button>
        <Button size="sm" variant="secondary" onClick={() => setOffset((value) => value + 1)}>Next {step}</Button>
      </Row>

      {view === "Month" && <MonthView context={context} meetings={meetings} month={anchor} onPick={onPick} onPickDay={onCreateAt} />}
      {view === "Week" && <WeekView context={context} meetings={meetings} weekStart={anchor} onPick={onPick} onCreateAt={onCreateAt} />}
      {view === "Day" && <DayView context={context} meetings={meetings} day={anchor} onPick={onPick} onCreateAt={onCreateAt} onEdit={onEdit} />}

      {notice}
    </Stack>
  );
}
