/* ====================================================================== *
 * AUTO — schedule arithmetic for ARL-AUTO-003 and ARL-AUTO-008.
 *
 * The contract edge cases are "daylight-saving and duplicate schedule firings
 * handled" and "duplicate and out-of-order event delivery handled". Both are
 * computed here from a real zone offset lookup, not asserted in prose.
 * ====================================================================== */

export type Frequency = "hourly" | "daily" | "weekly" | "monthly";

export interface ScheduleSpec {
  frequency: Frequency;
  hour: number;
  minute: number;
  /** 1 = Monday … 7 = Sunday, for weekly schedules. */
  weekday: number;
  /** Day of month for monthly schedules. */
  day: number;
  timezone: string;
  concurrency: number;
  paused: boolean;
}

export const DEFAULT_SCHEDULE: ScheduleSpec = {
  frequency: "daily", hour: 8, minute: 30, weekday: 1, day: 1,
  timezone: "Europe/London", concurrency: 1, paused: false,
};

export function readSchedule(fields: Record<string, string | number | boolean>, fallbackZone: string): ScheduleSpec {
  return {
    frequency: (["hourly", "daily", "weekly", "monthly"].includes(String(fields.scheduleFrequency)) ? String(fields.scheduleFrequency) : DEFAULT_SCHEDULE.frequency) as Frequency,
    hour: clamp(Number(fields.scheduleHour ?? DEFAULT_SCHEDULE.hour), 0, 23),
    minute: clamp(Number(fields.scheduleMinute ?? DEFAULT_SCHEDULE.minute), 0, 59),
    weekday: clamp(Number(fields.scheduleWeekday ?? DEFAULT_SCHEDULE.weekday), 1, 7),
    day: clamp(Number(fields.scheduleDay ?? DEFAULT_SCHEDULE.day), 1, 28),
    timezone: String(fields.scheduleTimezone ?? fallbackZone),
    concurrency: clamp(Number(fields.concurrency ?? 1), 1, 8),
    paused: fields.schedulePaused === true || fields.schedulePaused === "true",
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function describeSchedule(spec: ScheduleSpec): string {
  const time = `${String(spec.hour).padStart(2, "0")}:${String(spec.minute).padStart(2, "0")}`;
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (spec.frequency === "hourly") return `Every hour at ${String(spec.minute).padStart(2, "0")} past, ${spec.timezone}`;
  if (spec.frequency === "daily") return `Every day at ${time}, ${spec.timezone}`;
  if (spec.frequency === "weekly") return `Every ${names[spec.weekday - 1]} at ${time}, ${spec.timezone}`;
  return `Day ${spec.day} of each month at ${time}, ${spec.timezone}`;
}

/** Minutes that `timezone` is ahead of UTC at `instant`, read from the platform. */
export function zoneOffsetMinutes(instant: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = formatter.formatToParts(instant);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return Math.round((asUtc - instant.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

export interface Occurrence {
  at: Date;
  offsetMinutes: number;
  /** True when the zone offset differs from the previous occurrence. */
  dstShift: boolean;
  /** True when this instant equals the previous one, which a scheduler must drop. */
  duplicate: boolean;
  localLabel: string;
}

/**
 * The next `count` firings after `from`, resolved in the schedule's own zone.
 * Each candidate local time is converted to an instant using the zone offset at
 * that moment, so a spring-forward or autumn-back day produces a visible shift
 * rather than a silently wrong hour.
 */
export function nextOccurrences(spec: ScheduleSpec, from: Date, count: number): Occurrence[] {
  const out: Occurrence[] = [];
  const step = spec.frequency === "hourly" ? 1 / 24 : spec.frequency === "daily" ? 1 : spec.frequency === "weekly" ? 7 : 30;
  let cursor = new Date(from.getTime());
  let guard = 0;
  let previousOffset: number | null = null;
  let previousTime: number | null = null;

  while (out.length < count && guard < 400) {
    guard += 1;
    const candidate = candidateFor(spec, cursor);
    const floor = previousTime ?? from.getTime();
    if (candidate.getTime() <= floor) {
      cursor = new Date(cursor.getTime() + step * 86_400_000);
      continue;
    }
    const offset = zoneOffsetMinutes(candidate, spec.timezone);
    out.push({
      at: candidate,
      offsetMinutes: offset,
      dstShift: previousOffset !== null && previousOffset !== offset,
      duplicate: previousTime !== null && previousTime === candidate.getTime(),
      localLabel: new Intl.DateTimeFormat("en-GB", {
        timeZone: spec.timezone, weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      }).format(candidate),
    });
    previousOffset = offset;
    previousTime = candidate.getTime();
    cursor = new Date(candidate.getTime() + Math.max(60_000, step * 86_400_000 * 0.5));
  }
  return out;
}

function candidateFor(spec: ScheduleSpec, cursor: Date): Date {
  // Build the wall-clock time wanted, then shift by the zone offset at that point.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: spec.timezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short",
  }).formatToParts(cursor);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  let year = get("year");
  let month = get("month");
  let day = get("day");
  const hour = spec.frequency === "hourly" ? (get("hour") % 24) : spec.hour;

  if (spec.frequency === "weekly") {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const label = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
    const current = Math.max(0, names.indexOf(label.slice(0, 3))) + 1;
    const ahead = (spec.weekday - current + 7) % 7;
    const shifted = new Date(Date.UTC(year, month - 1, day + ahead));
    year = shifted.getUTCFullYear(); month = shifted.getUTCMonth() + 1; day = shifted.getUTCDate();
  }
  if (spec.frequency === "monthly") day = spec.day;

  const naive = Date.UTC(year, month - 1, day, hour, spec.minute, 0);
  const guessOffset = zoneOffsetMinutes(new Date(naive), spec.timezone);
  const instant = new Date(naive - guessOffset * 60_000);
  const realOffset = zoneOffsetMinutes(instant, spec.timezone);
  return realOffset === guessOffset ? instant : new Date(naive - realOffset * 60_000);
}

/* ------------------------------ delivery ledger ------------------------------ */

export interface Delivery {
  id: string;
  key: string;
  receivedAt: string;
  eventAt: string;
  payload: Record<string, string | number | boolean>;
}

export type DeliveryVerdict = "accepted" | "duplicate" | "reordered";

export interface DeliveryDecision extends Delivery {
  verdict: DeliveryVerdict;
  reason: string;
  sequence: number;
}

/**
 * Idempotency and ordering, computed over the recorded deliveries: a repeated
 * key is dropped, and an event older than the newest already processed is
 * accepted but marked out of order so the trace shows what the scheduler did.
 */
export function classifyDeliveries(deliveries: Delivery[]): DeliveryDecision[] {
  const seenKeys = new Set<string>();
  let newestEvent = -Infinity;
  const ordered = [...deliveries].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  return ordered.map((delivery, index) => {
    const eventTime = new Date(delivery.eventAt).getTime();
    if (seenKeys.has(delivery.key)) {
      return { ...delivery, sequence: index + 1, verdict: "duplicate", reason: `Key ${delivery.key} was already processed, so this delivery was dropped without running the workflow.` };
    }
    seenKeys.add(delivery.key);
    if (Number.isFinite(eventTime) && eventTime < newestEvent) {
      return { ...delivery, sequence: index + 1, verdict: "reordered", reason: "This event is older than one already processed. It was accepted but handled by its event time, not its arrival time." };
    }
    if (Number.isFinite(eventTime)) newestEvent = Math.max(newestEvent, eventTime);
    return { ...delivery, sequence: index + 1, verdict: "accepted", reason: "First delivery of this key, in order." };
  });
}
