import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Notice, Pill, Row, Stack } from "@/design-system";
import { addDays, sameDay, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { bodyOf, conflictsWithLinks, statusTone, workingHours, type ResourceBody } from "./data";
import "./book-calendar.css";
import { bookingLanes, resourceCapacity, seatsInUse, seatsOf, type BookingLane } from "./availability";

/* ====================================================================== *
 * Availability grid — a real day or week calendar over the working hours
 * recorded on each resource. A booking can be dragged to another slot, or
 * moved entirely from the keyboard, and every move is checked against
 * findBookingConflict before it is allowed.
 * ====================================================================== */

export interface SlotMove {
  bookingId: string;
  startAt: string;
  endAt: string;
  columnId: string;
}

export interface AvailabilityGridProps {
  bookings: Rec[];
  resources: Rec[];
  columns: { id: string; label: string }[];
  /** Day columns render one resource across days; resource columns one day. */
  mode: "day" | "week";
  anchor: Date;
  now: Date;
  orgId: string;
  slotMinutes?: number;
  onMove: (move: SlotMove) => void | Promise<void>;
  onOpen?: (bookingId: string) => void;
  /** Focusing a booking selects it for the screen's actions. */
  onSelect?: (bookingId: string) => void;
  selectedId?: string;
  onCreate?: (columnId: string, startAt: string) => void;
  /** Resource a week column belongs to, when columns are days. */
  resourceForColumn: (columnId: string) => string;
  label: string;
}

const HOUR_PX = 44;

export function AvailabilityGrid({
  bookings, resources, columns, mode, anchor, now, orgId, slotMinutes = 60,
  onMove, onOpen, onCreate, resourceForColumn, label, onSelect, selectedId,
}: AvailabilityGridProps) {
  const [grabbed, setGrabbed] = useState<{ id: string; offsetMinutes: number; columnIndex: number } | null>(null);
  const [message, setMessage] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor, 1);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    return [new Date(anchor)];
  }, [mode, anchor]);

  const hours = useMemo(() => {
    const windows = columns.map((column) => workingHours(resources.find((item) => item.id === resourceForColumn(column.id))));
    const startHour = Math.min(...windows.map((window) => window.startHour), 9);
    const endHour = Math.max(...windows.map((window) => window.endHour), 18);
    return Array.from({ length: Math.max(1, endHour - startHour) }, (_, index) => startHour + index);
  }, [columns, resources, resourceForColumn]);

  // Overlapping bookings on one resource and day are laid out side by side,
  // so a resource that holds several bookings at once never stacks them.
  const laneCache = new Map<string, Map<string, BookingLane>>();
  function lanesFor(resourceId: string, day: Date): Map<string, BookingLane> {
    const key = resourceId + "|" + day.toDateString();
    let lanes = laneCache.get(key);
    if (!lanes) {
      lanes = bookingLanes(bookings.filter((booking) => String(booking.fields.resourceId) === resourceId
        && booking.startAt && sameDay(new Date(booking.startAt), day)), slotMinutes);
      laneCache.set(key, lanes);
    }
    return lanes;
  }

  function slotStart(day: Date, hour: number): Date {
    const date = new Date(day);
    date.setHours(hour, 0, 0, 0);
    return date;
  }

  async function attempt(booking: Rec, nextStart: Date, columnId: string) {
    const duration = booking.startAt && booking.endAt
      ? new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()
      : slotMinutes * 60_000;
    const startAt = nextStart.toISOString();
    const endAt = new Date(nextStart.getTime() + duration).toISOString();
    const resourceId = resourceForColumn(columnId);
    const clashes = conflictsWithLinks(bookings, resources, orgId, resourceId, startAt, endAt, booking.id);
    if (clashes.length > 0) {
      const clash = clashes[0];
      const resourceName = resources.find((item) => item.id === clash.resourceId)?.title ?? clash.resourceId;
      setMessage(`Refused: ${clash.booking.title} already holds ${resourceName} between ${new Date(clash.booking.startAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} and ${new Date(clash.booking.endAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`);
      return;
    }
    await onMove({ bookingId: booking.id, startAt, endAt, columnId });
    setMessage(`${booking.title} moved to ${nextStart.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`);
  }

  function onBookingKey(event: KeyboardEvent<HTMLButtonElement>, booking: Rec, columnIndex: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!grabbed || grabbed.id !== booking.id) {
        if (booking.status === "cancelled") { setMessage("A cancelled booking is not moved; create a new one instead."); return; }
        setGrabbed({ id: booking.id, offsetMinutes: 0, columnIndex });
        setMessage(`${booking.title} picked up. Up and down move it by ${slotMinutes} minutes, left and right change ${mode === "week" ? "day" : "resource"}, Enter drops it, Escape cancels.`);
        return;
      }
      const target = new Date(new Date(booking.startAt!).getTime() + grabbed.offsetMinutes * 60_000);
      const column = columns[grabbed.columnIndex] ?? columns[columnIndex];
      const unchanged = grabbed.offsetMinutes === 0 && grabbed.columnIndex === columnIndex;
      setGrabbed(null);
      if (unchanged) { setMessage(`${booking.title} put back where it was.`); onOpen?.(booking.id); return; }
      void attempt(booking, target, column.id);
      return;
    }
    if (event.key === "Escape" && grabbed?.id === booking.id) {
      event.preventDefault();
      setGrabbed(null);
      setMessage("Move cancelled. Nothing changed.");
      return;
    }
    if (!grabbed || grabbed.id !== booking.id) return;
    let offset = grabbed.offsetMinutes;
    let columnIndexNext = grabbed.columnIndex;
    if (event.key === "ArrowDown") offset += slotMinutes;
    else if (event.key === "ArrowUp") offset -= slotMinutes;
    else if (event.key === "ArrowRight") columnIndexNext = Math.min(columns.length - 1, columnIndexNext + 1);
    else if (event.key === "ArrowLeft") columnIndexNext = Math.max(0, columnIndexNext - 1);
    else return;
    event.preventDefault();
    setGrabbed({ id: booking.id, offsetMinutes: offset, columnIndex: columnIndexNext });
    const preview = new Date(new Date(booking.startAt!).getTime() + offset * 60_000);
    setMessage(`${booking.title} would move to ${columns[columnIndexNext].label} at ${preview.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}. Enter to drop.`);
  }

  const columnList = mode === "week" ? days.map((day) => ({ id: day.toISOString(), label: day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) })) : columns;

  return (
    <div className="t4-cal" ref={gridRef}>
      <div className="t4-day" style={{ ["--t4-cols" as string]: String(columnList.length) }} role="grid" aria-label={label}>
        <span className="t4-day-colhead" aria-hidden="true" />
        {columnList.map((column) => {
          const isToday = mode === "week" ? sameDay(new Date(column.id), now) : sameDay(days[0], now);
          return (
            <div key={column.id} className="t4-day-colhead" role="columnheader" style={isToday ? { color: "var(--accent)" } : undefined}>
              {column.label}{isToday ? " · today" : ""}
            </div>
          );
        })}
        {hours.map((hour) => (
          <div key={hour} style={{ display: "contents" }}>
            <div className="t4-day-hour">{String(hour).padStart(2, "0")}:00</div>
            {columnList.map((column, columnIndex) => {
              const day = mode === "week" ? new Date(column.id) : days[0];
              const resourceId = mode === "week" ? resourceForColumn(columns[0]?.id ?? "") : resourceForColumn(column.id);
              const resource = resources.find((item) => item.id === resourceId);
              const window = workingHours(resource);
              const closed = hour < window.startHour || hour >= window.endHour || !window.days.includes(day.getDay());
              const slot = slotStart(day, hour);
              const slotEnd = new Date(slot.getTime() + slotMinutes * 60_000);
              const here = bookings.filter((booking) => {
                if (String(booking.fields.resourceId) !== resourceId || !booking.startAt) return false;
                const start = new Date(booking.startAt);
                return sameDay(start, day) && start.getHours() === hour;
              });
              const blackout = bodyOf<ResourceBody>(resource, {}).blackouts?.find((item) => slot.toISOString() < item.to && item.from < slotEnd.toISOString());
              const key = `${column.id}-${hour}`;
              const capacity = resourceCapacity(resource);
              const used = capacity > 1 ? seatsInUse(bookings, resourceId, slot.toISOString()) : 0;
              const roomLeft = capacity > 1 && here.length > 0 && used < capacity && !closed && !blackout;
              const lanes = lanesFor(resourceId, day);
              return (
                <div
                  key={key}
                  role="gridcell"
                  className="t4-day-slot"
                  data-closed={closed || blackout ? "true" : undefined}
                  data-over={over === key ? "true" : undefined}
                  onDragOver={(event) => { event.preventDefault(); setOver(key); }}
                  onDragLeave={() => setOver((current) => (current === key ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setOver(null);
                    const id = event.dataTransfer.getData("text/plain");
                    const booking = bookings.find((item) => item.id === id);
                    if (booking) void attempt(booking, slot, mode === "week" ? columns[0]?.id ?? column.id : column.id);
                  }}
                >
                  {here.length === 0 && !closed && !blackout && onCreate && (
                    <button type="button" className="t4-day-free" onClick={() => onCreate(mode === "week" ? columns[0]?.id ?? column.id : column.id, slot.toISOString())}>
                      Free
                    </button>
                  )}
                  {roomLeft && onCreate && (
                    <button type="button" className="t4-day-more" aria-label={`Add booking at ${String(hour).padStart(2, "0")}:00, ${capacity - used} of ${capacity} seats free`}
                      onClick={() => onCreate(mode === "week" ? columns[0]?.id ?? column.id : column.id, slot.toISOString())}>
                      +{capacity - used}
                    </button>
                  )}
                  {blackout && here.length === 0 && <span className="t4-day-free" style={{ borderStyle: "solid" }}>{blackout.reason}</span>}
                  {here.map((booking, index) => {
                    const minutes = booking.endAt ? (new Date(booking.endAt).getTime() - new Date(booking.startAt!).getTime()) / 60_000 : slotMinutes;
                    const top = (new Date(booking.startAt!).getMinutes() / 60) * HOUR_PX;
                    const lane = lanes.get(booking.id) ?? { lane: 0, lanes: 1 };
                    const laneWidth = `(100% - 4px - ${roomLeft ? "var(--t4-seat-reserve, 30px)" : "0px"}) / ${lane.lanes}`;
                    const clash = conflictsWithLinks(bookings, resources, orgId, resourceId, booking.startAt!, booking.endAt ?? booking.startAt!, booking.id).length > 0;
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        className="t4-booking"
                        data-status={clash ? "conflict" : booking.status === "hold" ? "hold" : booking.status === "cancelled" ? "cancelled" : undefined}
                        data-grabbed={grabbed?.id === booking.id ? "true" : undefined}
                        draggable={booking.status !== "cancelled"}
                        aria-grabbed={grabbed?.id === booking.id || undefined}
                        data-lanes={lane.lanes > 1 ? String(lane.lanes) : undefined}
                        style={{
                          top: top + (lane.lanes > 1 ? 0 : index * 4),
                          height: Math.max(20, (minutes / 60) * HOUR_PX - 3),
                          insetInlineStart: `calc(2px + ${laneWidth} * ${lane.lane})`,
                          insetInlineEnd: "auto",
                          width: `calc(${laneWidth} - 2px)`,
                        }}
                        onDragStart={(event) => event.dataTransfer.setData("text/plain", booking.id)}
                        onKeyDown={(event) => onBookingKey(event, booking, columnIndex)}
                        onClick={() => onOpen?.(booking.id)}
                        onFocus={() => onSelect?.(booking.id)}
                        data-selected={selectedId === booking.id ? "true" : undefined}
                        title={`${booking.title} · ${new Date(booking.startAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${capacity > 1 ? ` · ${seatsOf(booking)} of ${capacity} seats` : ""}`}
                      >
                        <strong>{booking.title}</strong>
                        <span className="ds-num">{new Date(booking.startAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {minutes}m{capacity > 1 ? ` · ${seatsOf(booking)}/${capacity} seats` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Row gap={2} wrap>
        <Pill tone="success" dot>Confirmed</Pill>
        <Pill tone="warning" dot>Held, not confirmed</Pill>
        <Pill tone="danger" dot>Conflicting</Pill>
        <span className="ds-subtle">Bookings that share a multi-seat resource sit side by side; +N marks seats still free. Shaded slots are outside the resource's recorded working hours or inside a blackout.</span>
      </Row>
      <p aria-live="assertive" className="ds-subtle" style={{ minHeight: "1.4em" }}>
        {message || "Drag a booking to another slot, or focus one and press Enter to move it with the arrow keys. Every move is checked for a conflict before it is applied."}
      </p>
    </div>
  );
}

export function ConflictNotice({ clashes, resources }: { clashes: { resourceId: string; booking: Rec }[]; resources: Rec[] }) {
  if (clashes.length === 0) return null;
  return (
    <Notice tone="danger" title="That slot is already taken">
      <Stack gap={2}>
        {clashes.map((clash) => (
          <span key={clash.booking.id}>
            <strong>{resources.find((item) => item.id === clash.resourceId)?.title ?? clash.resourceId}</strong> is held by {clash.booking.title} from{" "}
            <span className="ds-num">{new Date(clash.booking.startAt!).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{" "}
            to <span className="ds-num">{new Date(clash.booking.endAt!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>.
            <Pill tone={statusTone(clash.booking.status)}>{clash.booking.status}</Pill>
          </span>
        ))}
        <span>A slot that is not free is never offered as confirmed. Choose another time or release the held booking first.</span>
      </Stack>
    </Notice>
  );
}

export function SlotPicker({
  suggestions, onPick,
}: { suggestions: { startAt: string; endAt: string; label: string }[]; onPick: (startAt: string) => void }) {
  if (suggestions.length === 0) {
    return <Notice tone="warning" title="No free slot in this window">Every slot inside the resource's working hours is taken. Widen the window or choose another resource.</Notice>;
  }
  return (
    <Row gap={2} wrap>
      {suggestions.map((slot) => (
        <Button key={slot.startAt} size="sm" variant="secondary" onClick={() => onPick(slot.startAt)}>{slot.label}</Button>
      ))}
    </Row>
  );
}
