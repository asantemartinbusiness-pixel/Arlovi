import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Preview runs. A completed run through the builder preview is kept on the
 * form record (`body.previewRuns`), never as a submission: it is the form
 * author checking the form, so it must not reach the responses inbox,
 * analytics, retention or exports. Each run records the version answered,
 * who ran it, the answers shown and how many questions logic hid.
 * ====================================================================== */

export interface PreviewRun {
  id: string;
  at: string;
  by: string;
  version: number;
  device: "mobile" | "desktop";
  /** Visible answerable questions with the answer given, in form order. Blank means skipped. */
  answers: [string, string][];
  /** Answerable questions the logic rules hid on this run. */
  hidden: number;
}

export const PREVIEW_RUN_LIMIT = 10;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Runs stored on a form, newest first. Malformed entries are dropped, never thrown on. */
export function readPreviewRuns(record: Rec | undefined): PreviewRun[] {
  const raw = asObject(record?.body).previewRuns;
  if (!Array.isArray(raw)) return [];
  const runs: PreviewRun[] = [];
  for (const item of raw) {
    const row = asObject(item);
    const id = typeof row.id === "string" ? row.id : "";
    const at = typeof row.at === "string" ? row.at : "";
    if (!id || !at) continue;
    const answers = (Array.isArray(row.answers) ? row.answers : [])
      .filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length === 2)
      .map(([label, value]) => [String(label), String(value ?? "")] as [string, string]);
    runs.push({
      id, at,
      by: typeof row.by === "string" ? row.by : "",
      version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : 1,
      device: row.device === "mobile" ? "mobile" : "desktop",
      answers,
      hidden: typeof row.hidden === "number" && row.hidden > 0 ? Math.floor(row.hidden) : 0,
    });
  }
  return runs.sort((a, b) => b.at.localeCompare(a.at));
}

/** The runs to store after adding one: newest first, capped, no duplicate id. */
export function withPreviewRun(runs: PreviewRun[], run: PreviewRun, limit = PREVIEW_RUN_LIMIT): PreviewRun[] {
  return [run, ...runs.filter((item) => item.id !== run.id)]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.max(1, limit));
}

/** How many questions on a run were answered rather than skipped. */
export function answeredCount(run: PreviewRun): number {
  return run.answers.filter(([, value]) => value.trim() !== "").length;
}

/** Labels answered on the newest run that no longer exist on the form, so a stale run is visibly stale. */
export function staleLabels(run: PreviewRun, currentLabels: string[]): string[] {
  const current = new Set(currentLabels);
  return run.answers.map(([label]) => label).filter((label) => !current.has(label));
}
