import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Knowledge workspace model — pure logic, no React and no database.
 *
 * A knowledge record is a piece of written company knowledge (a procedure,
 * a policy explanation, an answer customers get) with a review status, a
 * provenance, the sources it rests on and the records it relates to.
 *
 * Rules that keep it honest:
 *  - Only a person verifies. A record drafted by a model, or imported from
 *    elsewhere, cannot be verified until it cites at least one source.
 *  - Changing the substance of a verified record returns it to review: an
 *    edit is never silently covered by an earlier verification.
 *  - Freshness is computed from recorded dates. A record with no review date
 *    is "never reviewed", not "fresh".
 * ====================================================================== */

export const KNOWLEDGE = "knowledge";
export const KNOWLEDGE_COLLECTIONS = "knowledgeCollections";

export type KnowledgeStatus = "draft" | "needs_review" | "verified" | "archived";
export type KnowledgeProvenance = "human" | "model_generated" | "imported";
export type ReviewTiming = "fresh" | "review_due" | "overdue" | "stale" | "unreviewed" | "archived";

export const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  verified: "Verified",
  archived: "Archived",
};

export const PROVENANCE_LABEL: Record<KnowledgeProvenance, string> = {
  human: "Written by a person",
  model_generated: "Model-generated",
  imported: "Imported",
};

export const TIMING_LABEL: Record<ReviewTiming, string> = {
  fresh: "Fresh",
  review_due: "Review due soon",
  overdue: "Review overdue",
  stale: "Stale",
  unreviewed: "Never reviewed",
  archived: "Archived",
};

export interface SourceRef {
  id: string;
  /** A Company Brain source record, when the reference is to one. */
  sourceId?: string;
  label: string;
  /** Page, section or URL fragment inside the source. */
  locator?: string;
}

export type ReviewAction = "created" | "edited" | "requested" | "approved" | "changes_requested" | "archived" | "restored" | "returned";

export interface ReviewEvent {
  id: string;
  at: string;
  by: string;
  action: ReviewAction;
  note: string;
  reviewer?: string;
  dueAt?: string;
}

export interface KnowledgeBody {
  content: string;
  sources: SourceRef[];
  /** Ids of related records: other knowledge records, facts, decisions or sources. */
  related: string[];
  reviews: ReviewEvent[];
}

export const DEFAULT_REVIEW_INTERVAL_DAYS = 90;
/** A verified record is "due soon" this many days before its next review. */
export const DUE_SOON_DAYS = 14;
const DAY = 86_400_000;

export function knowledgeBody(record: Pick<Rec, "body"> | undefined): KnowledgeBody {
  const body = (record?.body ?? {}) as Partial<KnowledgeBody>;
  return {
    content: typeof body.content === "string" ? body.content : "",
    sources: Array.isArray(body.sources) ? body.sources.filter((item): item is SourceRef => Boolean(item && typeof item.label === "string")) : [],
    related: Array.isArray(body.related) ? body.related.filter((item): item is string => typeof item === "string") : [],
    reviews: Array.isArray(body.reviews) ? body.reviews : [],
  };
}

export function statusOf(record: Pick<Rec, "status">): KnowledgeStatus {
  return (["draft", "needs_review", "verified", "archived"] as const).find((status) => status === record.status) ?? "draft";
}

export function provenanceOf(record: Pick<Rec, "fields">): KnowledgeProvenance {
  const value = String(record.fields.provenance ?? "human");
  return value === "model_generated" || value === "imported" ? value : "human";
}

export function reviewIntervalOf(record: Pick<Rec, "fields">, collection?: Pick<Rec, "fields">): number {
  const own = Number(record.fields.reviewIntervalDays);
  if (Number.isFinite(own) && own > 0) return Math.round(own);
  const inherited = Number(collection?.fields.reviewIntervalDays);
  if (Number.isFinite(inherited) && inherited > 0) return Math.round(inherited);
  return DEFAULT_REVIEW_INTERVAL_DAYS;
}

function parse(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export interface TimingResult {
  state: ReviewTiming;
  /** When the next review falls (verified) or is due (in review). */
  dueAt?: string;
  /** Whole days until the due date; negative when it has passed. */
  days?: number;
  label: string;
}

/** Review timing computed from recorded dates only. */
export function reviewTiming(record: Pick<Rec, "status" | "fields" | "dueAt">, now: Date, intervalDays: number): TimingResult {
  const status = statusOf(record);
  const nowMs = now.getTime();
  if (status === "archived") return { state: "archived", label: TIMING_LABEL.archived };
  if (status === "draft") return { state: "unreviewed", label: TIMING_LABEL.unreviewed };
  if (status === "needs_review") {
    const due = parse(record.dueAt);
    if (due === undefined) return { state: "review_due", label: "Review requested, no due date" };
    const days = Math.floor((due - nowMs) / DAY);
    if (due < nowMs) return { state: "overdue", dueAt: new Date(due).toISOString(), days, label: `${TIMING_LABEL.overdue} by ${Math.max(1, -days)} day${-days === 1 ? "" : "s"}` };
    return { state: "review_due", dueAt: new Date(due).toISOString(), days, label: days === 0 ? "Review due today" : `Review due in ${days} day${days === 1 ? "" : "s"}` };
  }
  const reviewed = parse(record.fields.lastReviewedAt);
  if (reviewed === undefined) return { state: "unreviewed", label: "Verified, but no review date is recorded" };
  const next = reviewed + intervalDays * DAY;
  const days = Math.floor((next - nowMs) / DAY);
  if (next < nowMs) return { state: "stale", dueAt: new Date(next).toISOString(), days, label: `Stale: re-review was due ${Math.max(1, -days)} day${-days === 1 ? "" : "s"} ago` };
  if (days <= DUE_SOON_DAYS) return { state: "review_due", dueAt: new Date(next).toISOString(), days, label: `Re-review in ${days} day${days === 1 ? "" : "s"}` };
  return { state: "fresh", dueAt: new Date(next).toISOString(), days, label: `Fresh · next review in ${days} days` };
}

/** Why a record cannot be verified right now; empty when it can. */
export function verificationBlockers(record: Pick<Rec, "status" | "fields" | "body" | "title">, reviewer: string, canVerify: boolean): string[] {
  const problems: string[] = [];
  const body = knowledgeBody(record);
  const provenance = provenanceOf(record);
  if (!canVerify) problems.push("Your role cannot verify knowledge. Ask an owner to review it.");
  if (statusOf(record) !== "needs_review") problems.push("Only a record that is in review can be verified. Request a review first.");
  if (!record.title.trim()) problems.push("The record has no title.");
  if (!body.content.trim()) problems.push("The record has no content to verify.");
  if (!reviewer.trim()) problems.push("A named person must verify it.");
  if (provenance !== "human" && body.sources.length === 0) {
    problems.push(provenance === "model_generated"
      ? "Model-generated text cannot be verified until it cites at least one source a person can check."
      : "Imported text cannot be verified until it cites the source it was imported from.");
  }
  return problems;
}

export interface ReviewRequest { reviewer: string; dueAt: string; note: string }

export function reviewRequestProblems(request: ReviewRequest, now: Date): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!request.reviewer.trim()) problems.reviewer = "Choose who will review it.";
  const due = parse(request.dueAt);
  if (due === undefined) problems.dueAt = "Set a due date.";
  else if (due < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) problems.dueAt = "The due date is in the past.";
  return problems;
}

export interface KnowledgeDraft {
  title: string;
  summary: string;
  content: string;
  collectionId: string;
  provenance: KnowledgeProvenance;
  tags: string[];
  sources: SourceRef[];
  related: string[];
  reviewIntervalDays: number | "";
}

export function draftProblems(draft: KnowledgeDraft): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!draft.title.trim()) problems.title = "Give the record a title.";
  else if (draft.title.trim().length > 140) problems.title = "Keep the title under 140 characters.";
  if (!draft.collectionId) problems.collectionId = "Choose a collection.";
  if (draft.reviewIntervalDays !== "" && (!Number.isFinite(draft.reviewIntervalDays) || draft.reviewIntervalDays < 1 || draft.reviewIntervalDays > 730)) {
    problems.reviewIntervalDays = "Use between 1 and 730 days, or leave blank to use the collection's interval.";
  }
  draft.sources.forEach((source, index) => {
    if (!source.label.trim() && !source.sourceId) problems[`source-${index}`] = "Name the source or choose one from the library.";
  });
  return problems;
}

/** Does this edit change what a reviewer verified? Tags and the collection do not. */
export function isSubstantiveChange(before: KnowledgeDraft, after: KnowledgeDraft): boolean {
  const sources = (list: SourceRef[]) => JSON.stringify(list.map((item) => [item.sourceId ?? "", item.label.trim(), (item.locator ?? "").trim()]));
  return before.title.trim() !== after.title.trim()
    || before.summary.trim() !== after.summary.trim()
    || before.content.trim() !== after.content.trim()
    || before.provenance !== after.provenance
    || sources(before.sources) !== sources(after.sources);
}

/** Status after an edit: a verified record whose substance changed goes back to review. */
export function statusAfterEdit(status: KnowledgeStatus, substantive: boolean): KnowledgeStatus {
  return status === "verified" && substantive ? "needs_review" : status;
}

export function draftFromRecord(record: Rec): KnowledgeDraft {
  const body = knowledgeBody(record);
  const interval = Number(record.fields.reviewIntervalDays);
  return {
    title: record.title,
    summary: record.summary,
    content: body.content,
    collectionId: String(record.fields.collectionId ?? ""),
    provenance: provenanceOf(record),
    tags: [...record.tags],
    sources: body.sources.map((item) => ({ ...item })),
    related: [...body.related],
    reviewIntervalDays: Number.isFinite(interval) && interval > 0 ? interval : "",
  };
}

export function emptyDraft(collectionId: string): KnowledgeDraft {
  return { title: "", summary: "", content: "", collectionId, provenance: "human", tags: [], sources: [], related: [], reviewIntervalDays: "" };
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

/* ------------------------------ Search ------------------------------ */

export interface KnowledgeFilters {
  query: string;
  collectionId: string; // "" = all
  status: KnowledgeStatus | "" | "active"; // "active" = everything except archived
  provenance: KnowledgeProvenance | "";
  timing: ReviewTiming | "attention" | "";
  reviewer: string;
}

export const DEFAULT_FILTERS: KnowledgeFilters = { query: "", collectionId: "", status: "active", provenance: "", timing: "", reviewer: "" };

function tokens(value: string): string[] {
  return value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/**
 * Score a record against a query. Every query term must appear somewhere;
 * title matches outrank tag matches, which outrank body matches.
 * Returns 0 when the record does not match.
 */
export function matchScore(record: Rec, query: string, collectionName = ""): number {
  const terms = tokens(query);
  if (terms.length === 0) return 1;
  const body = knowledgeBody(record);
  const title = tokens(record.title).join(" ");
  const tags = record.tags.join(" ").toLowerCase();
  const rest = [record.summary, body.content, collectionName, ...body.sources.map((item) => `${item.label} ${item.locator ?? ""}`)].join(" ").toLowerCase();
  let score = 0;
  for (const raw of terms) {
    // Light plural folding so "shades" finds "shade" and the reverse.
    const term = raw.length > 3 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    if (title.includes(term)) score += title.split(" ").some((word) => word === term || word === raw) ? 6 : 4;
    else if (tags.includes(term)) score += 3;
    else if (rest.includes(term)) score += 1;
    else return 0;
  }
  return score;
}

export interface FilterContext { now: Date; collections: Rec[] }

export function intervalFor(record: Rec, collections: Rec[]): number {
  return reviewIntervalOf(record, collections.find((item) => item.id === record.fields.collectionId));
}

export function filterKnowledge(records: Rec[], filters: KnowledgeFilters, context: FilterContext): Rec[] {
  const names = new Map(context.collections.map((item) => [item.id, item.title]));
  const scored: { record: Rec; score: number }[] = [];
  for (const record of records) {
    const status = statusOf(record);
    if (filters.collectionId && record.fields.collectionId !== filters.collectionId) continue;
    if (filters.status === "active" ? status === "archived" : filters.status && status !== filters.status) continue;
    if (filters.provenance && provenanceOf(record) !== filters.provenance) continue;
    if (filters.reviewer && String(record.fields.reviewer ?? "") !== filters.reviewer) continue;
    if (filters.timing) {
      const timing = reviewTiming(record, context.now, intervalFor(record, context.collections)).state;
      if (filters.timing === "attention" ? !["overdue", "stale", "review_due"].includes(timing) : timing !== filters.timing) continue;
    }
    const score = matchScore(record, filters.query, names.get(String(record.fields.collectionId ?? "")) ?? "");
    if (score > 0) scored.push({ record, score });
  }
  const hasQuery = tokens(filters.query).length > 0;
  return scored
    .sort((a, b) => (hasQuery ? b.score - a.score : 0) || b.record.updatedAt.localeCompare(a.record.updatedAt))
    .map((item) => item.record);
}

export type KnowledgeSort = "relevance" | "updated" | "due" | "title";

export function sortKnowledge(records: Rec[], sort: KnowledgeSort, context: FilterContext): Rec[] {
  if (sort === "relevance") return records;
  const copy = [...records];
  if (sort === "title") return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "updated") return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const dueKey = (record: Rec) => {
    const timing = reviewTiming(record, context.now, intervalFor(record, context.collections));
    return timing.dueAt ? Date.parse(timing.dueAt) : Number.MAX_SAFE_INTEGER;
  };
  return copy.sort((a, b) => dueKey(a) - dueKey(b));
}

/* ------------------------------ Summary ----------------------------- */

export interface KnowledgeSummary {
  total: number;
  verified: number;
  inReview: number;
  drafts: number;
  overdue: number;
  stale: number;
  modelUnverified: number;
  unsourced: number;
}

export function summarize(records: Rec[], context: FilterContext): KnowledgeSummary {
  const live = records.filter((record) => statusOf(record) !== "archived");
  const timing = live.map((record) => reviewTiming(record, context.now, intervalFor(record, context.collections)).state);
  return {
    total: live.length,
    verified: live.filter((record) => statusOf(record) === "verified").length,
    inReview: live.filter((record) => statusOf(record) === "needs_review").length,
    drafts: live.filter((record) => statusOf(record) === "draft").length,
    overdue: timing.filter((state) => state === "overdue").length,
    stale: timing.filter((state) => state === "stale").length,
    modelUnverified: live.filter((record) => provenanceOf(record) === "model_generated" && statusOf(record) !== "verified").length,
    unsourced: live.filter((record) => knowledgeBody(record).sources.length === 0).length,
  };
}

/** Records that link to `id` from their related list (the reverse direction of a link). */
export function backlinks(records: Rec[], id: string): Rec[] {
  return records.filter((record) => record.id !== id && knowledgeBody(record).related.includes(id));
}

export function reviewEvent(input: Omit<ReviewEvent, "id">, seed: number): ReviewEvent {
  return { id: `rv-${seed.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, ...input };
}

/* ------------------------- Loose retrieval for questions ------------------------- */

const STOPWORDS = new Set(("a an and are as at be by can do does for from how i in is it me my of on or our should the their them there this to us we what when where which who why will with you your "
  + "tell know about give show please").split(" "));

/**
 * Rank knowledge records for a natural-language question. Deterministic:
 * counts question words found in the title, tags, summary and content.
 * Archived records are never returned. This is retrieval, not generation.
 */
export function rankKnowledge(records: Rec[], question: string, limit = 3): { record: Rec; score: number; matched: string[] }[] {
  const terms = [...new Set(tokens(question).filter((term) => term.length > 2 && !STOPWORDS.has(term))
    .map((term) => (term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term)))];
  if (terms.length === 0) return [];
  const ranked: { record: Rec; score: number; matched: string[] }[] = [];
  for (const record of records) {
    if (record.collection !== KNOWLEDGE || statusOf(record) === "archived") continue;
    const body = knowledgeBody(record);
    const title = record.title.toLowerCase();
    const tags = record.tags.join(" ").toLowerCase();
    const text = `${record.summary} ${body.content}`.toLowerCase();
    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      const hit = title.includes(term) ? 3 : tags.includes(term) ? 2 : text.includes(term) ? 1 : 0;
      if (hit) { score += hit; matched.push(term); }
    }
    if (score >= 2) ranked.push({ record, score: score + (statusOf(record) === "verified" ? 1 : 0), matched });
  }
  return ranked.sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title)).slice(0, limit);
}
