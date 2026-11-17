import type { Rec } from "@/domain/types";

/** Calendar-day keys are derived in the organisation's location time zone.
 * Dates passed to rosterWeekDays are stable calendar markers (not shift instants).
 * This deliberately avoids grouping by browser-local or UTC midnight. */
export function localDayKey(value: Date | string, timezone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid roster date");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function rosterWeekDays(now: Date, timezone: string, weekOffset = 0): string[] {
  const today = localDayKey(now, timezone);
  const monday = new Date(today + "T12:00:00.000Z");
  const back = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - back + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export function rosterDateLabel(key: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", ...options,
  }).format(new Date(key + "T12:00:00.000Z"));
}

export function shiftDays(shift: Rec, timezone: string): { startKey: string; endKey: string } | null {
  if (shift.collection !== "shifts" || shift.fields.kind !== "shift"
    || ["archived", "cancelled", "deleted"].includes(shift.status)
    || !shift.startAt || !shift.endAt) return null;
  const start = Date.parse(shift.startAt), end = Date.parse(shift.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    startKey: localDayKey(new Date(start), timezone),
    // The end is exclusive: a shift ending at 00:00 is not shown as
    // occupying a slot on the following calendar day.
    endKey: localDayKey(new Date(end - 1), timezone),
  };
}

export function rosterShiftsForDay(
  rows: Rec[], employeeId: string, dayKey: string, timezone: string,
): Rec[] {
  return rows.filter((row) => {
    if (row.fields.employeeId !== employeeId) return false;
    const days = shiftDays(row, timezone);
    return days !== null && dayKey >= days.startKey && dayKey <= days.endKey;
  }).sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
}

export function employeeOnLeave(leave: Rec[], employeeId: string, dayKey: string, timezone: string): boolean {
  return leave.some((row) => {
    if (row.collection !== "leaveRequests" || row.status !== "approved"
      || row.fields.employeeId !== employeeId || !row.startAt || !row.endAt) return false;
    const from = Date.parse(row.startAt), to = Date.parse(row.endAt);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    const startKey = localDayKey(new Date(from), timezone);
    const endKey = localDayKey(new Date(to), timezone);
    return dayKey >= startKey && dayKey <= endKey;
  });
}

export function dailyCoverage(roster: Rec[], employees: Rec[], dayKey: string, timezone: string) {
  const people = employees.filter((employee) => rosterShiftsForDay(roster, employee.id, dayKey, timezone).length > 0);
  return {
    people: people.length,
    shifts: people.reduce((sum, employee) => sum + rosterShiftsForDay(roster, employee.id, dayKey, timezone).length, 0),
  };
}
