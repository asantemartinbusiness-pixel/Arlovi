import { useCollections } from "@/platform/workspace";
import { findBookingConflict, overlaps } from "@/domain/ops";
import type { Rec } from "@/domain/types";

/* ---------------- Record body shapes used by BOOK ---------------- */

export interface BookingMessage { at: string; direction: string; body: string }
export interface BookingBody { messages?: BookingMessage[] }

export interface ServiceBody { resources?: string[]; description?: string; includes?: string[] }

export interface ResourceBody { blackouts?: { from: string; to: string; reason: string }[] }

export interface PublicPageField { id: string; label: string; type: string; required: boolean }
export interface PublicPageBody { intro?: string; services?: string[]; fields?: PublicPageField[] }

export function bodyOf<T>(record: Rec | undefined, fallback: T): T {
  return (record?.body as T | undefined) ?? fallback;
}

export function useBookData() {
  return useCollections(["bookings", "services", "resources", "contacts", "templates", "sites"]);
}

export const LIVE_BOOKING_STATES = ["confirmed", "hold", "completed", "no_show"];

export function isLive(booking: Rec): boolean {
  return LIVE_BOOKING_STATES.includes(booking.status);
}

/** Booking conflicts, reusing the shared domain rule in src/domain/ops.ts. */
export function conflictFor(
  bookings: Rec[],
  orgId: string,
  resourceId: string,
  startAt: string,
  endAt: string,
  ignoreId?: string,
): Rec | undefined {
  return findBookingConflict(bookings, orgId, resourceId, startAt, endAt, ignoreId);
}

/**
 * A resource may be linked to another (the survey kit travels with a fitter),
 * so a booking on one blocks the other. The shared rule is applied to each.
 */
export function conflictsWithLinks(
  bookings: Rec[],
  resources: Rec[],
  orgId: string,
  resourceId: string,
  startAt: string,
  endAt: string,
  ignoreId?: string,
): { resourceId: string; booking: Rec }[] {
  const linked = new Set<string>([resourceId]);
  const resource = resources.find((item) => item.id === resourceId);
  if (resource && String(resource.fields.linkedResourceId ?? "")) linked.add(String(resource.fields.linkedResourceId));
  for (const other of resources) {
    if (String(other.fields.linkedResourceId ?? "") === resourceId) linked.add(other.id);
  }
  const found: { resourceId: string; booking: Rec }[] = [];
  for (const candidate of linked) {
    const booking = conflictFor(bookings, orgId, candidate, startAt, endAt, ignoreId);
    if (booking) found.push({ resourceId: candidate, booking });
  }
  return found;
}

/** Minutes a resource is booked inside a window, for utilisation. */
export function bookedMinutes(bookings: Rec[], resourceId: string, from: Date, to: Date): number {
  return bookings
    .filter((booking) => String(booking.fields.resourceId) === resourceId && isLive(booking) && booking.startAt && booking.endAt)
    .filter((booking) => overlaps(booking.startAt!, booking.endAt!, from.toISOString(), to.toISOString()))
    .reduce((sum, booking) => sum + (new Date(booking.endAt!).getTime() - new Date(booking.startAt!).getTime()) / 60_000, 0);
}

export function blackoutFor(resource: Rec | undefined, startAt: string, endAt: string): { from: string; to: string; reason: string } | undefined {
  return bodyOf<ResourceBody>(resource, {}).blackouts?.find((window) => overlaps(startAt, endAt, window.from, window.to));
}

/** Working hours as hour numbers, read from the resource's recorded text. */
export function workingHours(resource: Rec | undefined): { startHour: number; endHour: number; days: number[] } {
  const text = String(resource?.fields.workingHours ?? "Mon–Sat 09:00–18:00");
  const times = text.match(/(\d{2}):(\d{2})\D+(\d{2}):(\d{2})/);
  const startHour = times ? Number(times[1]) : 9;
  const endHour = times ? Number(times[3]) : 18;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const range = text.match(/([A-Z][a-z]{2})[–-]([A-Z][a-z]{2})/);
  let days = [1, 2, 3, 4, 5, 6];
  if (range) {
    const from = dayNames.indexOf(range[1]);
    const to = dayNames.indexOf(range[2]);
    if (from >= 0 && to >= 0) {
      days = [];
      for (let day = from; ; day = (day + 1) % 7) {
        days.push(day);
        if (day === to) break;
      }
    }
  }
  return { startHour, endHour, days };
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "confirmed") return "success";
  if (status === "hold") return "warning";
  if (status === "cancelled" || status === "no_show") return "danger";
  if (status === "completed") return "info";
  return "neutral";
}

export const DEPOSIT_LABEL: Record<string, string> = {
  none: "No deposit for this service",
  not_requested: "Deposit not requested yet",
  awaiting_payment: "Deposit awaiting payment",
  paid_local: "Deposit recorded as received",
  waived: "Deposit waived",
};
