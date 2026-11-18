import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * SLA clock.
 *
 * Counted in business hours from the workspace clock, not in wall-clock
 * hours: a case opened on Friday afternoon is not breached by Monday
 * morning simply because a weekend happened. A case waiting on the
 * customer stops its resolution clock, which is why `pauseWhileWaiting`
 * is read from the policy rather than assumed.
 * ------------------------------------------------------------------ */

export interface BusinessHours {
  startMinutes: number;
  endMinutes: number;
  workingDays: number[];
}

export const DEFAULT_HOURS: BusinessHours = {
  startMinutes: 9 * 60,
  endMinutes: 17 * 60 + 30,
  workingDays: [1, 2, 3, 4, 5],
};

export function parseBusinessHours(policy: Rec | undefined): BusinessHours {
  const text = String(policy?.fields.businessHours ?? "");
  const match = text.match(/(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/);
  if (!match) return DEFAULT_HOURS;
  return {
    startMinutes: Number(match[1]) * 60 + Number(match[2]),
    endMinutes: Number(match[3]) * 60 + Number(match[4]),
    workingDays: DEFAULT_HOURS.workingDays,
  };
}

/** Minutes of working time between two instants, weekends excluded. */
export function businessMinutesBetween(from: Date, to: Date, hours: BusinessHours = DEFAULT_HOURS): number {
  if (to <= from) return 0;
  let total = 0;
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  // Cap the walk so a very old record cannot spin the loop.
  for (let day = 0; day < 400 && cursor < to; day += 1) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);
    if (hours.workingDays.includes(dayStart.getDay())) {
      const open = new Date(dayStart.getTime() + hours.startMinutes * 60_000);
      const close = new Date(dayStart.getTime() + hours.endMinutes * 60_000);
      const start = cursor > open ? cursor : open;
      const end = to < close ? to : close;
      if (end > start) total += (end.getTime() - start.getTime()) / 60_000;
    }
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    cursor.setTime(nextDay.getTime());
  }
  return Math.round(total);
}

export type SlaStatus = "met" | "due" | "at_risk" | "breached" | "paused" | "unknown";

export interface SlaState {
  status: SlaStatus;
  label: string;
  /** Minutes of working time remaining; negative once the target is passed. */
  remainingMinutes: number;
  targetMinutes: number;
  usedMinutes: number;
  which: "first response" | "resolution";
}

export function formatMinutes(minutes: number): string {
  const absolute = Math.abs(Math.round(minutes));
  if (absolute < 60) return `${absolute}m`;
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  if (hours < 8) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 8);
  const restHours = hours % 8;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

/**
 * The live SLA state of a ticket against its policy. Returns `unknown` rather
 * than a guess when the ticket has no policy, because a made-up target is worse
 * than an honest gap.
 */
export function slaState(ticket: Rec, policy: Rec | undefined, now: Date): SlaState {
  if (!policy || !ticket.at) {
    return { status: "unknown", label: "No policy", remainingMinutes: 0, targetMinutes: 0, usedMinutes: 0, which: "first response" };
  }
  const hours = parseBusinessHours(policy);
  const opened = new Date(ticket.at);
  const firstResponseAt = String(ticket.fields.firstResponseAt ?? "");
  const resolvedAt = String(ticket.fields.resolvedAt ?? "");

  if (!firstResponseAt) {
    const target = Number(policy.fields.firstResponseHours ?? 0) * 60;
    const used = businessMinutesBetween(opened, now, hours);
    const remaining = target - used;
    // A reply recorded with no provider connected never reached the customer,
    // so it does not stop the first-response clock; the label says so.
    const recordedOnly = Boolean(ticket.fields.firstResponseRecordedAt);
    const prefix = recordedOnly ? "Reply recorded, not delivered — first response" : "First response";
    return {
      which: "first response",
      targetMinutes: target,
      usedMinutes: used,
      remainingMinutes: remaining,
      status: remaining < 0 ? "breached" : remaining < target * 0.25 ? "at_risk" : "due",
      label: remaining < 0 ? `${prefix} ${formatMinutes(remaining)} over` : `${prefix} in ${formatMinutes(remaining)}`,
    };
  }

  const target = Number(policy.fields.resolutionHours ?? 0) * 60;

  if (resolvedAt) {
    const used = businessMinutesBetween(opened, new Date(resolvedAt), hours);
    return {
      which: "resolution",
      targetMinutes: target,
      usedMinutes: used,
      remainingMinutes: target - used,
      status: used <= target ? "met" : "breached",
      label: used <= target ? `Resolved in ${formatMinutes(used)}` : `Resolved ${formatMinutes(used - target)} over`,
    };
  }

  if (ticket.status === "waiting" || ticket.status === "pending") {
    if (policy.fields.pauseWhileWaiting === true) {
      const used = businessMinutesBetween(opened, now, hours);
      return {
        which: "resolution",
        targetMinutes: target,
        usedMinutes: used,
        remainingMinutes: target - used,
        status: "paused",
        label: "Paused — waiting on the customer",
      };
    }
  }

  const used = businessMinutesBetween(opened, now, hours);
  const remaining = target - used;
  return {
    which: "resolution",
    targetMinutes: target,
    usedMinutes: used,
    remainingMinutes: remaining,
    status: remaining < 0 ? "breached" : remaining < target * 0.25 ? "at_risk" : "due",
    label: remaining < 0 ? `Resolution ${formatMinutes(remaining)} over` : `Resolution in ${formatMinutes(remaining)}`,
  };
}

export const SLA_TONE: Record<SlaStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  met: "success",
  due: "info",
  at_risk: "warning",
  breached: "danger",
  paused: "neutral",
  unknown: "neutral",
};
