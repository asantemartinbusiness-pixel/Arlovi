import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Contract register logic.
 *
 * Pure functions: renewal and notice dates, the alert a contract earns,
 * the register filter, review rounds and obligation completion. Nothing
 * here is legal advice; a notice date is arithmetic on the dates a
 * person typed in, and is labelled that way where it is shown.
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;

function dayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/** Whole days from `now` to `value`; negative once `value` has passed. */
export function daysFrom(now: Date, value: string | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((dayStart(date) - dayStart(now)) / DAY);
}

export type RenewalAlert = "notice_passed" | "notice_due" | "ending" | "ended" | "clear" | "no_end";

export interface RenewalInfo {
  endsInDays: number | null;
  /** The last day notice can be given, as ISO, or "" without an end date. */
  noticeBy: string;
  noticeInDays: number | null;
  noticeDays: number;
  autoRenews: boolean;
  alert: RenewalAlert;
  label: string;
  tone: "danger" | "warning" | "info" | "neutral" | "success";
}

const CLOSED = new Set(["archived", "expired"]);

/**
 * When notice must be given and how urgent that is. A contract whose
 * notice date has passed is the loudest alert: if it auto-renews, it has
 * effectively renewed for another term unless somebody already acted.
 */
export function renewalInfo(contract: Rec, now: Date, windowDays = 30): RenewalInfo {
  const noticeDays = Math.max(0, Number(contract.fields.noticeDays ?? 0) || 0);
  const autoRenews = contract.fields.autoRenew === true;
  const endsInDays = daysFrom(now, contract.endAt);
  if (endsInDays === null) {
    return { endsInDays, noticeBy: "", noticeInDays: null, noticeDays, autoRenews, alert: "no_end", label: "No end date", tone: "neutral" };
  }
  const end = new Date(contract.endAt as string);
  const noticeBy = new Date(end.getTime() - noticeDays * DAY).toISOString();
  const noticeInDays = endsInDays - noticeDays;
  const base = { endsInDays, noticeBy, noticeInDays, noticeDays, autoRenews };
  if (CLOSED.has(contract.status)) return { ...base, alert: "clear", label: "Closed", tone: "neutral" };
  if (endsInDays < 0) return { ...base, alert: "ended", label: `Ended ${Math.abs(endsInDays)}d ago`, tone: "danger" };
  if (contract.fields.renewalDecision) {
    return { ...base, alert: "clear", label: `Decided: ${String(contract.fields.renewalDecision)}`, tone: "success" };
  }
  if (noticeInDays < 0) {
    return { ...base, alert: "notice_passed", label: autoRenews ? `Notice date passed — renews` : `Notice date passed ${Math.abs(noticeInDays)}d ago`, tone: "danger" };
  }
  if (noticeInDays <= windowDays) return { ...base, alert: "notice_due", label: `Notice due in ${noticeInDays}d`, tone: "warning" };
  if (endsInDays <= 90) return { ...base, alert: "ending", label: `Ends in ${endsInDays}d`, tone: "info" };
  return { ...base, alert: "clear", label: `Notice in ${noticeInDays}d`, tone: "neutral" };
}

export type RenewalWindow = "" | "notice_30" | "notice_90" | "ends_90" | "passed";

export interface RegisterFilter {
  query: string;
  counterparty: string;
  status: string;
  window: RenewalWindow;
}

export const EMPTY_FILTER: RegisterFilter = { query: "", counterparty: "", status: "", window: "" };

export function matchesRegister(contract: Rec, filter: RegisterFilter, now: Date): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query) {
    const haystack = `${contract.title} ${String(contract.fields.counterparty ?? "")} ${contract.summary} ${String(contract.fields.owner ?? "")} ${String(contract.fields.type ?? "")}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filter.counterparty && String(contract.fields.counterparty ?? "") !== filter.counterparty) return false;
  if (filter.status && contract.status !== filter.status) return false;
  if (filter.window) {
    const info = renewalInfo(contract, now);
    if (filter.window === "passed") return info.alert === "notice_passed" || info.alert === "ended";
    if (info.noticeInDays === null || CLOSED.has(contract.status)) return false;
    if (filter.window === "notice_30") return info.noticeInDays >= 0 && info.noticeInDays <= 30;
    if (filter.window === "notice_90") return info.noticeInDays >= 0 && info.noticeInDays <= 90;
    if (filter.window === "ends_90") return (info.endsInDays ?? 999) >= 0 && (info.endsInDays ?? 999) <= 90;
  }
  return true;
}

export function counterpartiesOf(contracts: Rec[]): string[] {
  return [...new Set(contracts.map((contract) => String(contract.fields.counterparty ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/* ---------------- review cycle ---------------- */

export type ReviewDecision = "approved" | "changes_requested" | "rejected";

export interface ReviewRound {
  id: string;
  round: number;
  reviewer: string;
  requestedBy: string;
  requestedAt: string;
  decision?: ReviewDecision;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export function reviewsOf(contract: Rec): ReviewRound[] {
  return (contract.body as { reviews?: ReviewRound[] } | undefined)?.reviews ?? [];
}

export function openRound(reviews: ReviewRound[]): ReviewRound | undefined {
  return [...reviews].reverse().find((round) => !round.decision);
}

/** The contract status a decision moves to, from the status it is in. */
export function statusAfterDecision(current: string, decision: ReviewDecision): string {
  if (decision === "approved") return current === "in_review" || current === "draft" ? "approved" : current;
  return "draft";
}

export function decideRound(reviews: ReviewRound[], decision: ReviewDecision, by: string, at: string, note: string): ReviewRound[] {
  const open = openRound(reviews);
  if (!open) return reviews;
  return reviews.map((round) => (round.id === open.id ? { ...round, decision, decidedBy: by, decidedAt: at, note } : round));
}

/**
 * Separation of duties on a review: whoever asked for the review cannot be the
 * one who approves it. They may still send it back (request changes or
 * reject), which is how a requester withdraws a contract from review.
 */
export function reviewDecisionBlocker(requestedBy: string, decision: ReviewDecision, actor: string): string | undefined {
  if (decision === "approved" && requestedBy.trim() && requestedBy === actor) {
    return "You requested this review, so you cannot approve it. The reviewer, or someone else, records the approval.";
  }
  return undefined;
}

export function startRound(reviews: ReviewRound[], reviewer: string, by: string, at: string, id: string): ReviewRound[] {
  const open = openRound(reviews);
  // Re-requesting while a round is open replaces its reviewer rather than stacking rounds.
  if (open) return reviews.map((round) => (round.id === open.id ? { ...round, reviewer, requestedBy: by, requestedAt: at } : round));
  return [...reviews, { id, round: reviews.length + 1, reviewer, requestedBy: by, requestedAt: at }];
}

export const DECISION_LABEL: Record<ReviewDecision, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

/* ---------------- obligations ---------------- */

export function obligationState(obligation: Rec, now: Date): { label: string; tone: "success" | "danger" | "warning" | "neutral" } {
  if (obligation.status === "done") return { label: "done", tone: "success" };
  const days = daysFrom(now, obligation.dueAt);
  if (days === null) return { label: "no date", tone: "neutral" };
  if (days < 0) return { label: `${Math.abs(days)}d late`, tone: "danger" };
  if (days <= 7) return { label: `due in ${days}d`, tone: "warning" };
  return { label: `in ${days}d`, tone: "neutral" };
}

/** A CRM company whose name looks like the counterparty, used only as a suggestion. */
export function suggestCompany(counterparty: string, companies: Rec[]): Rec | undefined {
  const clean = (value: string) => value.toLowerCase().replace(/\b(ltd|limited|llc|inc|sa|plc|gmbh|co)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const target = clean(counterparty);
  if (!target) return undefined;
  return companies.find((company) => clean(company.title) === target)
    ?? companies.find((company) => {
      const name = clean(company.title);
      return name.length > 3 && (target.startsWith(name) || name.startsWith(target));
    });
}
