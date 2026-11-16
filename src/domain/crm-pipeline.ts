import type { Rec } from "./types";

/* ------------------------------------------------------------------ *
 * Pipeline model for CRM.
 *
 * A stage is a named step with a default probability. A weighted forecast is
 * the sum of amount × probability over open deals only — a closed-won deal is
 * revenue in the ledger, not forecast, and a closed-lost deal is neither.
 * ------------------------------------------------------------------ */

export interface Stage {
  id: string;
  label: string;
  /** Default probability in percent for a deal entering this stage. */
  probability: number;
  kind: "open" | "won" | "lost";
  /** What must be true before a deal may leave this stage. */
  requires?: { field: string; label: string }[];
}

export const STAGES: Stage[] = [
  { id: "discovery", label: "Discovery", probability: 20, kind: "open", requires: [{ field: "contactId", label: "a named contact" }] },
  { id: "qualified", label: "Qualified", probability: 40, kind: "open", requires: [{ field: "budgetConfirmed", label: "a confirmed budget" }] },
  { id: "proposal", label: "Proposal", probability: 60, kind: "open", requires: [{ field: "quoteId", label: "a linked quote" }] },
  { id: "negotiation", label: "Negotiation", probability: 80, kind: "open", requires: [{ field: "closeDate", label: "an expected close date" }] },
  { id: "won", label: "Closed won", probability: 100, kind: "won" },
  { id: "lost", label: "Closed lost", probability: 0, kind: "lost" },
];

export const OPEN_STAGES = STAGES.filter((stage) => stage.kind === "open");

export function stageById(id: string): Stage | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function stageOf(deal: Rec): Stage {
  const value = String(deal.fields.stage ?? deal.status ?? "discovery");
  return stageById(value) ?? STAGES[0];
}

export function stageIndex(id: string): number {
  const index = STAGES.findIndex((stage) => stage.id === id);
  return index < 0 ? 0 : index;
}

export function probabilityOf(deal: Rec): number {
  const recorded = Number(deal.fields.probability);
  if (Number.isFinite(recorded) && recorded >= 0 && recorded <= 100) return recorded;
  return stageOf(deal).probability;
}

export function isOpen(deal: Rec): boolean {
  return stageOf(deal).kind === "open";
}

export interface Forecast {
  openCount: number;
  pipelineMinor: number;
  weightedMinor: number;
  wonMinor: number;
  lostMinor: number;
  byStage: { stage: Stage; count: number; amountMinor: number; weightedMinor: number }[];
  /** Deals with no amount recorded; excluded from every figure above. */
  withoutAmountIds: string[];
}

export function forecast(deals: Rec[]): Forecast {
  const byStage = STAGES.map((stage) => ({ stage, count: 0, amountMinor: 0, weightedMinor: 0 }));
  const without: string[] = [];
  let pipeline = 0;
  let weighted = 0;
  let won = 0;
  let lost = 0;
  let openCount = 0;

  for (const deal of deals) {
    const stage = stageOf(deal);
    const bucket = byStage.find((entry) => entry.stage.id === stage.id)!;
    const amount = Number(deal.amountMinor ?? 0);
    bucket.count += 1;
    if (!amount) { without.push(deal.id); continue; }
    bucket.amountMinor += amount;
    const weight = Math.round((amount * probabilityOf(deal)) / 100);
    bucket.weightedMinor += weight;
    if (stage.kind === "won") { won += amount; continue; }
    if (stage.kind === "lost") { lost += amount; continue; }
    openCount += 1;
    pipeline += amount;
    weighted += weight;
  }

  return { openCount, pipelineMinor: pipeline, weightedMinor: weighted, wonMinor: won, lostMinor: lost, byStage, withoutAmountIds: without };
}

/** Why a deal cannot leave its stage yet, or undefined when it may move. */
export function stageGuard(deal: Rec, target: Stage): string | undefined {
  const from = stageOf(deal);
  if (from.id === target.id) return "The deal is already in this stage.";
  if (from.kind === "won") return "A closed-won deal is reopened by creating a new deal, not by moving this card.";
  const forward = stageIndex(target.id) > stageIndex(from.id);
  if (!forward) return undefined;
  const missing = (from.requires ?? []).filter((requirement) => {
    const value = deal.fields[requirement.field];
    return value === undefined || value === "" || value === false;
  });
  if (missing.length > 0) return `${from.label} needs ${missing.map((item) => item.label).join(" and ")} before the deal advances.`;
  if (target.kind === "won" && !deal.fields.quoteId && !deal.fields.invoiceId) {
    return "Closing a deal as won needs a linked quote or invoice so the amount has a document behind it.";
  }
  return undefined;
}

export const LOST_REASONS = [
  "Price",
  "Timing",
  "Lost to a competitor",
  "No budget",
  "No decision",
  "Requirement we do not meet",
];

/* --------------------------- Activities -------------------------- */

export const ACTIVITY_KINDS = ["call", "meeting", "email", "task", "note"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function activityKind(record: Rec): ActivityKind {
  const value = String(record.fields.kind ?? "task");
  return (ACTIVITY_KINDS as readonly string[]).includes(value) ? (value as ActivityKind) : "task";
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  task: "Task",
  note: "Note",
};

/** Activities, newest first, touching a record directly or by field link. */
export function activitiesFor(activities: Rec[], id: string | undefined): Rec[] {
  if (!id) return [];
  return activities
    .filter((activity) =>
      activity.parentId === id
      || String(activity.fields.dealId ?? "") === id
      || String(activity.fields.contactId ?? "") === id
      || String(activity.fields.companyId ?? "") === id)
    .sort((a, b) => (b.startAt ?? b.at ?? b.updatedAt).localeCompare(a.startAt ?? a.at ?? a.updatedAt));
}

/* ------------------------- Lead scoring -------------------------- */

export interface ScoreFactor {
  label: string;
  points: number;
  detail: string;
}

export interface LeadScore {
  total: number;
  factors: ScoreFactor[];
  band: "hot" | "warm" | "cold";
}

/**
 * A transparent additive score. Every point is attributed to a record field so
 * the number can be argued with; nothing is inferred from a model.
 */
export function scoreLead(lead: Rec, options: { contact?: Rec; company?: Rec; activities: Rec[]; now: Date }): LeadScore {
  const factors: ScoreFactor[] = [];
  const amount = Number(lead.amountMinor ?? 0);
  if (amount >= 200_000) factors.push({ label: "Deal size", points: 25, detail: "Recorded value at or above 2,000." });
  else if (amount >= 50_000) factors.push({ label: "Deal size", points: 15, detail: "Recorded value at or above 500." });
  else if (amount > 0) factors.push({ label: "Deal size", points: 5, detail: "A value is recorded." });
  else factors.push({ label: "Deal size", points: 0, detail: "No value recorded on the lead." });

  const source = String(lead.fields.source ?? "");
  if (source === "referral") factors.push({ label: "Source", points: 20, detail: "Referral." });
  else if (source === "showroom") factors.push({ label: "Source", points: 15, detail: "Walked into the showroom." });
  else if (source === "website") factors.push({ label: "Source", points: 10, detail: "Website enquiry." });
  else factors.push({ label: "Source", points: 2, detail: source ? `Source recorded as ${source}.` : "No source recorded." });

  if (options.contact?.fields.consent) factors.push({ label: "Consent", points: 10, detail: `Consent recorded ${String(options.contact.fields.consent)}.` });
  else factors.push({ label: "Consent", points: 0, detail: "No contact consent on file, so outreach stays manual." });

  if (options.company) factors.push({ label: "Account", points: 10, detail: `Linked to ${options.company.title}.` });
  else factors.push({ label: "Account", points: 0, detail: "No company record linked." });

  const touches = options.activities.length;
  factors.push({
    label: "Engagement",
    points: Math.min(20, touches * 5),
    detail: touches === 0 ? "No logged activity yet." : `${touches} logged ${touches === 1 ? "activity" : "activities"}.`,
  });

  const created = new Date(lead.createdAt).getTime();
  const days = Math.floor((options.now.getTime() - created) / 86_400_000);
  if (days <= 2) factors.push({ label: "Recency", points: 15, detail: "Arrived in the last two days." });
  else if (days <= 14) factors.push({ label: "Recency", points: 8, detail: `${days} days old.` });
  else factors.push({ label: "Recency", points: 0, detail: `${days} days old and not yet qualified.` });

  const total = factors.reduce((sum, factor) => sum + factor.points, 0);
  return { total, factors, band: total >= 65 ? "hot" : total >= 40 ? "warm" : "cold" };
}
