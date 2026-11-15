import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button, Empty, Notice, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { addDays, sameDay, startOfDay, startOfMonth, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";

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

export function WeekView({ context, meetings, weekStart, onPick }: {
  context: ScreenContext; meetings: Rec[]; weekStart: Date; onPick: (meeting: Rec) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const hours = Array.from({ length: 12 }, (_, index) => index + 7);
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
                  <button key={meeting.id} type="button" className="cm-event" data-state={meeting.status} onClick={() => onPick(meeting)}>
                    {meeting.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DayView({ context, meetings, day, onPick }: {
  context: ScreenContext; meetings: Rec[]; day: Date; onPick: (meeting: Rec) => void;
}) {
  const items = eventsOn(meetings, day);
  if (items.length === 0) {
    return <Empty title={`Nothing on ${context.date(day, { weekday: "long", day: "numeric", month: "long" })}`} icon={<CalendarDays size={20} />}>An empty day is shown as empty rather than filled with suggestions.</Empty>;
  }
  return (
    <div className="cm-day-list">
      {items.map((meeting) => (
        <div key={meeting.id} className="cm-day-row">
          <strong className="ds-num">{context.date(meeting.startAt, { hour: "2-digit", minute: "2-digit" }).split(", ").pop()}</strong>
          <button
            type="button"
            className="ds-record-card"
            onClick={() => onPick(meeting)}
          >
            <Row gap={2}>
              <strong className="ds-grow" style={{ textAlign: "start" }}>{meeting.title}</strong>
              <Pill tone={meeting.status === "tentative" ? "warning" : meeting.status === "finished" ? "neutral" : "info"} dot>{meeting.status}</Pill>
            </Row>
            <span className="ds-subtle">{String(meeting.fields.where ?? "")} · {String(meeting.fields.minutes ?? 0)} minutes · {String(meeting.fields.attendees ?? "").split(",").length} attendees</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function CalendarSurface({
  context, meetings, view, onPick, onCreateAt,
}: {
  context: ScreenContext; meetings: Rec[]; view: CalendarView;
  onPick: (meeting: Rec) => void; onCreateAt: (day: Date) => void;
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

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => setOffset((value) => value - 1)}>Previous {step}</Button>
        <strong className="ds-grow" style={{ fontSize: "var(--text-lg)" }}>{label}</strong>
        <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Today</Button>
        <Button size="sm" variant="secondary" onClick={() => setOffset((value) => value + 1)}>Next {step}</Button>
      </Row>

      {view === "Month" && <MonthView context={context} meetings={meetings} month={anchor} onPick={onPick} onPickDay={onCreateAt} />}
      {view === "Week" && <WeekView context={context} meetings={meetings} weekStart={anchor} onPick={onPick} />}
      {(view === "Day" || view === "Agenda") && <DayView context={context} meetings={meetings} day={anchor} onPick={onPick} />}

      <Notice tone="warning" title="Invite status is what this workspace recorded">
        An attendee is shown as invited unless somebody recorded their answer here. No calendar provider is connected, so an
        acceptance elsewhere is not known to this screen and is never assumed.
      </Notice>
    </Stack>
  );
}
