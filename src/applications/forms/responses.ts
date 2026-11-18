import type { Rec } from "@/domain/types";
import { STRUCTURAL, type FormField, type FormModel } from "./model";

/* ====================================================================== *
 * Response summaries. A submission stores each visible answer under the
 * question's label (see runtime.tsx), with multi-select answers joined by
 * ", ". Everything here reads those records and counts; nothing estimates.
 * ====================================================================== */

export interface OptionCount { label: string; count: number }

export type QuestionSummary =
  | { kind: "choice"; field: FormField; answered: number; skipped: number; options: OptionCount[]; other: number }
  | { kind: "number"; field: FormField; answered: number; skipped: number; min: number; max: number; mean: number; median: number; invalid: number }
  | { kind: "boolean"; field: FormField; answered: number; skipped: number; yes: number; no: number }
  | { kind: "text"; field: FormField; answered: number; skipped: number; recent: string[]; distinct: number };

export function answerableFields(model: FormModel): FormField[] {
  return model.fields.filter((field) => !STRUCTURAL.includes(field.type));
}

/** The raw answer a submission holds for a question, as text. Empty when the question was skipped or hidden. */
export function answerFor(submission: Rec, field: FormField): string {
  const value = submission.fields[field.label];
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value).trim();
}

/**
 * The picks in a stored multi-select answer. Answers are stored joined by
 * ", ", and an option label may itself contain a comma, so known labels are
 * matched first (longest first) and only unmatched text is split on commas.
 * An answer stored as an array is read as-is.
 */
export function multiselectPicks(value: unknown, options: string[]): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = value === undefined || value === null ? "" : String(value).trim();
  const known = [...new Set(options.map((option) => option.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const picks: string[] = [];
  let at = 0;
  while (at < text.length) {
    while (at < text.length && (text[at] === "," || text[at] === " ")) at += 1;
    if (at >= text.length) break;
    const rest = text.slice(at);
    const match = known.find((option) => rest.startsWith(option) && /^\s*(,|$)/.test(rest.slice(option.length)));
    if (match) { picks.push(match); at += match.length; continue; }
    const comma = text.indexOf(",", at);
    const end = comma === -1 ? text.length : comma;
    const unknown = text.slice(at, end).trim();
    if (unknown) picks.push(unknown);
    at = end;
  }
  return picks;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Newest first, so "recent answers" mean what they say. */
function byNewest(submissions: Rec[]): Rec[] {
  return [...submissions].sort((a, b) => (b.at ?? b.createdAt).localeCompare(a.at ?? a.createdAt));
}

export function summariseQuestion(field: FormField, submissions: Rec[]): QuestionSummary {
  const answers = byNewest(submissions).map((row) => answerFor(row, field));
  const given = answers.filter((text) => text.length > 0);
  const answered = given.length;
  const skipped = submissions.length - answered;

  if (field.type === "select" || field.type === "multiselect") {
    const counts = new Map(field.options.map((option) => [option, 0]));
    let other = 0;
    const rows = submissions.filter((row) => answerFor(row, field).length > 0);
    for (const row of rows) {
      const text = answerFor(row, field);
      const picks = field.type === "multiselect" ? multiselectPicks(row.fields[field.label], field.options) : [text];
      for (const pick of picks) {
        if (counts.has(pick)) counts.set(pick, (counts.get(pick) ?? 0) + 1);
        else other += 1;
      }
    }
    return { kind: "choice", field, answered, skipped, other, options: [...counts].map(([label, count]) => ({ label, count })) };
  }

  if (field.type === "number" || field.type === "rating") {
    const numbers = given.map(Number).filter((value) => Number.isFinite(value));
    return {
      kind: "number", field, answered, skipped,
      invalid: answered - numbers.length,
      min: numbers.length ? Math.min(...numbers) : 0,
      max: numbers.length ? Math.max(...numbers) : 0,
      mean: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0,
      median: numbers.length ? median(numbers) : 0,
    };
  }

  if (field.type === "checkbox") {
    const yes = given.filter((text) => ["yes", "true"].includes(text.toLowerCase())).length;
    return { kind: "boolean", field, answered, skipped, yes, no: answered - yes };
  }

  return {
    kind: "text", field, answered, skipped,
    recent: given.slice(0, 5),
    distinct: new Set(given.map((text) => text.toLowerCase())).size,
  };
}

export function summariseForm(model: FormModel, submissions: Rec[]): QuestionSummary[] {
  return answerableFields(model).map((field) => summariseQuestion(field, submissions));
}

export interface ResultsTable {
  header: string[];
  rows: string[][];
}

/**
 * One row per submission, one column per question. Sensitive answers are
 * replaced with "[redacted]" unless the caller explicitly reveals them; the
 * export always passes `reveal: false`.
 */
export function resultsTable(model: FormModel, submissions: Rec[], options: { reveal?: boolean } = {}): ResultsTable {
  const fields = answerableFields(model);
  return {
    header: ["Received", "From", "Version", "State", ...fields.map((field) => field.label)],
    rows: byNewest(submissions).map((row) => [
      row.at ?? row.createdAt,
      row.title,
      String(row.fields.formVersion ?? ""),
      row.status,
      ...fields.map((field) => {
        const text = answerFor(row, field);
        if (!text) return "";
        return field.sensitive && !options.reveal ? "[redacted]" : text;
      }),
    ]),
  };
}

/** RFC 4180 quoting, with a guard against spreadsheet formula injection. */
export function csvCell(value: string): string {
  const numeric = /^-?\d+(\.\d+)?$/.test(value);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function resultsCsv(table: ResultsTable): string {
  return [table.header, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
