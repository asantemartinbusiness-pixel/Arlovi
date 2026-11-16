import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Clock {
  now: () => Date;
  timezone: string;
}

/** Deterministic clock for tests: ?clock=2026-11-14T09:30:00Z freezes time. */
function frozenFromLocation(): Date | null {
  if (typeof window === "undefined" || !window.location) return null;
  const raw = new URLSearchParams(window.location.search).get("clock");
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const ClockContext = createContext<Clock>({ now: () => new Date(), timezone: "UTC" });

/* ------------------------------------------------------------------ */
/* Ambient clock.
 *
 * Code that has no React context (model helpers, handlers that run after an
 * await) still has to agree with the workspace about what time it is, or a
 * frozen test clock stamps some records with real time. These three
 * functions are the only sanctioned way to read time in application code;
 * a lint rule rejects a bare `new Date()` or `Date.now()` anywhere else.
 */

let activeClock: Clock | null = null;
let lastStampMs = 0;
let persistArmed = false;

function stampFloor(): number {
  if (lastStampMs) return lastStampMs;
  try {
    lastStampMs = Number(window.sessionStorage.getItem("arlovi:last-stamp") ?? 0) || 0;
  } catch {
    lastStampMs = 0;
  }
  return lastStampMs;
}

/* Written once when the page goes away, not on every stamp: a reload under a
   frozen clock then continues the sequence instead of restarting it. */
function armPersistence(): void {
  if (persistArmed || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  persistArmed = true;
  window.addEventListener("pagehide", () => {
    try {
      window.sessionStorage.setItem("arlovi:last-stamp", String(lastStampMs));
    } catch {
      /* private window or blocked storage: ordering still holds within one page */
    }
  });
}

/** The workspace's current time: the provider's clock, or ?clock= before it mounts. */
export function clockNow(): Date {
  return activeClock ? activeClock.now() : (frozenFromLocation() ?? new Date());
}

/**
 * An ISO timestamp for a record or audit entry. Strictly increasing, even
 * under a frozen clock, so the order things happened in is never lost to a tie.
 */
export function clockIso(): string {
  let ms = clockNow().getTime();
  const floor = stampFloor();
  if (ms <= floor) ms = floor + 1;
  lastStampMs = ms;
  armPersistence();
  return new Date(ms).toISOString();
}

/**
 * Real elapsed time, never frozen: unique ids, undo windows, playback and
 * device diagnostics. Not for anything a person reads as "when".
 */
export function wallMs(): number {
  return Date.now();
}

export function ClockProvider({ children, timezone, fixed }: { children: ReactNode; timezone?: string; fixed?: Date }) {
  const frozen = fixed ?? frozenFromLocation();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(id);
  }, [frozen]);
  const value = useMemo<Clock>(() => {
    const clock: Clock = {
      now: () => (frozen ? new Date(frozen) : new Date()),
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    };
    activeClock = clock;
    return clock;
  }, [frozen, timezone]);
  useEffect(() => () => { activeClock = null; }, []);
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  return useContext(ClockContext);
}

export function useNow(): Date {
  return useClock().now();
}

/* ------------------------------------------------------------------ */
/* Date helpers — all take an explicit `now` so nothing hardcodes a date. */

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const copy = startOfDay(date);
  const diff = (copy.getDay() - weekStartsOn + 7) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

export function startOfMonth(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export type RangeKey = "today" | "week" | "month" | "quarter" | "year" | "all";

export function resolveRange(key: RangeKey, now: Date): { start: Date; end: Date; label: string } {
  switch (key) {
    case "today": return { start: startOfDay(now), end: addDays(startOfDay(now), 1), label: "Today" };
    case "week": { const start = startOfWeek(now); return { start, end: addDays(start, 7), label: "This week" }; }
    case "month": { const start = startOfMonth(now); return { start, end: addMonths(start, 1), label: "This month" }; }
    case "quarter": {
      const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { start, end: addMonths(start, 3), label: "This quarter" };
    }
    case "year": { const start = new Date(now.getFullYear(), 0, 1); return { start, end: addMonths(start, 12), label: "This year" }; }
    default: return { start: new Date(0), end: new Date(8.64e15), label: "All time" };
  }
}

export function formatDate(value: string | Date | undefined, locale: string, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | Date | undefined, locale: string): string {
  return formatDate(value, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(value: string | Date | undefined, now: Date, locale: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2629800, "week"], [31557600, "month"],
  ];
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(seconds, "second");
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 604800) return formatter.format(Math.round(seconds / 86400), "day");
  if (abs < 2629800) return formatter.format(Math.round(seconds / 604800), "week");
  void steps;
  return formatter.format(Math.round(seconds / 2629800), "month");
}

/** Age of a value in days with an explicit staleness threshold. */
export function freshness(at: string | undefined, now: Date, staleAfterDays = 3): { days: number; stale: boolean; known: boolean } {
  if (!at) return { days: 0, stale: true, known: false };
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return { days: 0, stale: true, known: false };
  const days = daysBetween(date, now);
  return { days, stale: days > staleAfterDays, known: true };
}
