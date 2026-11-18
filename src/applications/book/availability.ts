import { overlaps } from "@/domain/ops";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * BOOK availability rules — capacity per resource, slot validation and the
 * reasons recorded on a cancellation or a move. Pure functions only.
 * ====================================================================== */

/** How many bookings (seats) a resource can hold at the same time. Never less than one. */
export function resourceCapacity(resource: Rec | undefined): number {
  const value = Math.floor(Number(resource?.fields.capacity ?? 1));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/** Seats a booking takes on its resource. Never less than one. */
export function seatsOf(booking: Rec | { fields: Rec["fields"] }): number {
  const value = Math.floor(Number(booking.fields.seats ?? 1));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/** Bookings that occupy a resource during a window (cancelled ones release their slot). */
export function overlappingOn(bookings: Rec[], orgId: string, resourceId: string, startAt: string, endAt: string, ignoreId?: string): Rec[] {
  return bookings.filter((booking) => booking.organizationId === orgId
    && booking.collection === "bookings"
    && booking.id !== ignoreId
    && booking.status !== "cancelled"
    && String(booking.fields.resourceId) === resourceId
    && Boolean(booking.startAt && booking.endAt)
    && overlaps(startAt, endAt, booking.startAt!, booking.endAt!));
}

/**
 * The booking that would be over capacity if `seats` more were added, or
 * undefined if there is room. With capacity one this is exactly a double booking.
 * The peak is measured at each start inside the window, so two bookings that
 * do not overlap each other are not summed.
 */
export function capacityConflict(
  bookings: Rec[], orgId: string, resource: Rec | undefined, resourceId: string, startAt: string, endAt: string, ignoreId?: string, seats = 1,
): Rec | undefined {
  const capacity = resourceCapacity(resource);
  const here = overlappingOn(bookings, orgId, resourceId, startAt, endAt, ignoreId);
  if (here.length === 0) return undefined;
  const instants = [startAt, ...here.map((booking) => booking.startAt!).filter((at) => at > startAt && at < endAt)];
  for (const instant of instants) {
    const active = here.filter((booking) => booking.startAt! <= instant && booking.endAt! > instant);
    const used = active.reduce((sum, booking) => sum + seatsOf(booking), 0);
    if (used + seats > capacity) return active[0] ?? here[0];
  }
  return undefined;
}

export interface SlotProblem { kind: "past" | "order" | "blackout" | "hours" | "capacity"; blocking: boolean; message: string }

export interface SlotCheckInput {
  startAt: Date;
  endAt: Date;
  now: Date;
  hours: { startHour: number; endHour: number; days: number[] };
  blackout?: { reason: string };
  seats: number;
  capacity: number;
}

/** Every reason a slot may not be booked, blocking ones first. */
export function slotProblems(input: SlotCheckInput): SlotProblem[] {
  const problems: SlotProblem[] = [];
  const { startAt, endAt, now, hours } = input;
  if (Number.isNaN(startAt.getTime())) return [{ kind: "order", blocking: true, message: "Choose a valid start time." }];
  if (endAt <= startAt) problems.push({ kind: "order", blocking: true, message: "The end must be after the start." });
  if (startAt < now) problems.push({ kind: "past", blocking: true, message: "That time has already passed." });
  if (input.blackout) problems.push({ kind: "blackout", blocking: true, message: `The resource is unavailable then: ${input.blackout.reason}.` });
  if (input.seats > input.capacity) problems.push({ kind: "capacity", blocking: true, message: `The resource holds ${input.capacity} at a time; ${input.seats} were asked for.` });
  const endMinutes = endAt.getHours() * 60 + endAt.getMinutes();
  const sameDay = endAt.toDateString() === startAt.toDateString();
  if (!hours.days.includes(startAt.getDay()) || startAt.getHours() < hours.startHour || !sameDay || endMinutes > hours.endHour * 60) {
    problems.push({ kind: "hours", blocking: false, message: "Outside the resource's recorded working hours." });
  }
  return problems.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/* ---------------- Reasons ---------------- */

export const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: "customer_request", label: "Customer asked to cancel" },
  { value: "customer_no_reply", label: "Customer did not confirm" },
  { value: "staff_unavailable", label: "Staff member unavailable" },
  { value: "resource_unavailable", label: "Room or equipment unavailable" },
  { value: "duplicate", label: "Duplicate booking" },
  { value: "other", label: "Other" },
];

export const RESCHEDULE_REASONS: { value: string; label: string }[] = [
  { value: "customer_request", label: "Customer asked to move" },
  { value: "staff_change", label: "Staff availability changed" },
  { value: "resource_change", label: "Room or equipment changed" },
  { value: "clash", label: "Resolving a clash" },
  { value: "other", label: "Other" },
];

export function reasonLabel(list: { value: string; label: string }[], value: string): string {
  return list.find((item) => item.value === value)?.label ?? value;
}

/** A reason is complete when one is chosen, and "Other" always carries a note. */
export function reasonError(value: string, note: string): string | undefined {
  if (!value) return "Choose a reason";
  if (value === "other" && note.trim().length < 3) return "Describe the reason";
  return undefined;
}

export function cancellationFee(input: { startAt?: string; now: Date; noticeHours: number; feeBp: number; priceMinor: number }): { insideNotice: boolean; hoursAway: number; feeMinor: number } {
  const hoursAway = input.startAt ? (new Date(input.startAt).getTime() - input.now.getTime()) / 3_600_000 : 0;
  const insideNotice = hoursAway < input.noticeHours;
  return { insideNotice, hoursAway, feeMinor: insideNotice ? Math.round((input.priceMinor * input.feeBp) / 10_000) : 0 };
}
