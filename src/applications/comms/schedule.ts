import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * COMMS scheduling logic — pure functions behind the calendar and meetings.
 *
 * No calendar provider is connected. Clashes are computed only from meetings
 * recorded in this workspace, and an attendee's answer is only what a person
 * recorded here. Times are stored as ISO instants; the editor works in UTC to
 * match the seeded diary.
 * ====================================================================== */

export function people(value: unknown): string[] {
  return String(value ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}

export interface Slot { startAt: string; endAt: string; attendees: string[]; excludeId?: string }

export interface Clash { meeting: Rec; who: string[] }

/**
 * Meetings that overlap the slot and share at least one person with it. A
 * meeting for "Everyone" clashes with anyone. Finished and cancelled meetings
 * are not clashes.
 */
export function findClashes(meetings: Rec[], slot: Slot): Clash[] {
  const start = Date.parse(slot.startAt);
  const end = Date.parse(slot.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const wanted = new Set(slot.attendees.filter((name) => name !== "Everyone"));
  const everyoneInSlot = slot.attendees.includes("Everyone");
  const clashes: Clash[] = [];
  for (const meeting of meetings) {
    if (meeting.id === slot.excludeId || !meeting.startAt || !meeting.endAt) continue;
    if (["finished", "cancelled"].includes(meeting.status)) continue;
    const mStart = Date.parse(meeting.startAt);
    const mEnd = Date.parse(meeting.endAt);
    if (!(mStart < end && mEnd > start)) continue;
    const theirs = people(meeting.fields.attendees);
    const who = theirs.includes("Everyone") || everyoneInSlot
      ? [...wanted]
      : theirs.filter((name) => wanted.has(name));
    if (who.length > 0) clashes.push({ meeting, who });
  }
  return clashes.sort((a, b) => (a.meeting.startAt ?? "").localeCompare(b.meeting.startAt ?? ""));
}

/** An ISO instant from a date (yyyy-mm-dd) and a time (hh:mm), in UTC. */
export function instant(date: string, time: string): string {
  const parsed = new Date(`${date}T${time || "00:00"}:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? new Date(value + minutes * 60_000).toISOString() : "";
}

export function minutesBetween(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 0;
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
}

/* ---------------------------- Agenda items ---------------------------- */

export interface AgendaItem { title: string; owner: string; minutes: number; covered: boolean }

/**
 * One agenda item per line. "Glaze decision — Maya, 10" becomes a titled item
 * owned by Maya with ten minutes; an owner and a duration are optional.
 */
export function parseAgenda(text: string): AgendaItem[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^(.*?)(?:\s+[—–-]\s+(.*?))?(?:,\s*(\d+)\s*(?:min(?:utes)?)?)?$/.exec(line);
    const title = (match?.[1] ?? line).trim();
    const owner = (match?.[2] ?? "").trim();
    const minutes = Number(match?.[3] ?? 0) || 0;
    return { title, owner, minutes, covered: false };
  });
}

export function formatAgenda(items: AgendaItem[]): string {
  return items.map((item) => [item.title, item.owner ? ` — ${item.owner}` : "", item.minutes ? `, ${item.minutes}` : ""].join("")).join("\n");
}

/**
 * The agenda a meeting holds: the structured items when someone has edited
 * them here, else the seeded one-line agenda split on its commas and stops.
 */
export function agendaOf(meeting: Rec): AgendaItem[] {
  const stored = (meeting.body as { agendaItems?: AgendaItem[] } | undefined)?.agendaItems;
  if (Array.isArray(stored)) return stored;
  const line = String(meeting.fields.agenda ?? "").trim();
  if (!line) return [];
  return line.replace(/\.$/, "").split(/[,.]\s+/).map((title) => title.trim()).filter(Boolean)
    .map((title) => ({ title: title.charAt(0).toUpperCase() + title.slice(1), owner: "", minutes: 0, covered: false }));
}

export function agendaMinutes(items: AgendaItem[]): number {
  return items.reduce((total, item) => total + (item.minutes || 0), 0);
}

/* ------------------------------ Responses ----------------------------- */

export type Answer = "invited" | "accepted" | "tentative" | "declined";
export interface RecordedAnswer { answer: Answer; recordedBy: string; at: string }

export function responsesOf(meeting: Rec): Record<string, RecordedAnswer> {
  return (meeting.body as { responses?: Record<string, RecordedAnswer> } | undefined)?.responses ?? {};
}

export function answerOf(meeting: Rec, name: string): Answer {
  return responsesOf(meeting)[name]?.answer ?? "invited";
}

export function answerTally(meeting: Rec): Record<Answer, number> {
  const tally: Record<Answer, number> = { invited: 0, accepted: 0, tentative: 0, declined: 0 };
  for (const name of people(meeting.fields.attendees)) tally[answerOf(meeting, name)] += 1;
  return tally;
}

/* --------------------------- Agenda listing --------------------------- */

export interface AgendaDay { day: string; meetings: Rec[] }

/** Upcoming meetings for the next `days` days, grouped by UTC calendar day. */
export function upcomingByDay(meetings: Rec[], now: Date, days = 14): AgendaDay[] {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const to = from + days * 86_400_000;
  const groups = new Map<string, Rec[]>();
  for (const meeting of meetings) {
    if (!meeting.startAt || meeting.status === "cancelled") continue;
    const start = Date.parse(meeting.startAt);
    if (start < from || start >= to) continue;
    const day = meeting.startAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), meeting]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({ day, meetings: rows.sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? "")) }));
}

/** Meetings in a list that clash with another one in the same list for a shared person. */
export function clashingIds(meetings: Rec[]): Set<string> {
  const ids = new Set<string>();
  for (const meeting of meetings) {
    if (!meeting.startAt || !meeting.endAt) continue;
    const clashes = findClashes(meetings, { startAt: meeting.startAt, endAt: meeting.endAt, attendees: people(meeting.fields.attendees), excludeId: meeting.id });
    if (clashes.length && !["finished", "cancelled"].includes(meeting.status)) ids.add(meeting.id);
  }
  return ids;
}
