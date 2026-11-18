import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * ANALYTICS — the explore query behind a saved query report.
 *
 * A person picks one collection, an aggregation over one of its fields, a
 * grouping, a date range and filters. This module is pure: it infers the
 * collection's fields from the records actually present, runs the query
 * against those records and returns every intermediate count, so the screen
 * can say exactly how a figure was produced and which records produced it.
 * Nothing here is sampled, estimated or filled in.
 * ====================================================================== */

export type FieldType = "number" | "money" | "date" | "text";

export interface FieldInfo {
  key: string;
  label: string;
  type: FieldType;
  /** Records in the collection that carry a value for this field. */
  present: number;
  total: number;
  /** Up to 12 distinct values, for text fields, most common first. */
  values: string[];
}

export type Agg = "count" | "sum" | "avg" | "min" | "max";
export const AGG_LABELS: Record<Agg, string> = {
  count: "Count of records",
  sum: "Sum of",
  avg: "Average of",
  min: "Minimum of",
  max: "Maximum of",
};

export type ExploreOp = "is" | "is not" | "contains" | "greater than" | "less than" | "is empty" | "is not empty";
export const OPS_BY_TYPE: Record<FieldType, ExploreOp[]> = {
  text: ["is", "is not", "contains", "is empty", "is not empty"],
  number: ["greater than", "less than", "is", "is empty", "is not empty"],
  money: ["greater than", "less than", "is", "is empty", "is not empty"],
  date: ["greater than", "less than", "is empty", "is not empty"],
};
export const NO_VALUE_OPS: ExploreOp[] = ["is empty", "is not empty"];

export interface ExploreFilter {
  id: string;
  field: string;
  op: ExploreOp;
  value: string;
}

export type RangePreset = "all" | "30d" | "90d" | "12m" | "ytd" | "custom";
export const RANGE_LABELS: Record<RangePreset, string> = {
  all: "All dates",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
  ytd: "This year to date",
  custom: "Between two dates",
};

export type ExploreViz = "bar" | "line" | "table";

export interface ExploreSpec {
  collection: string;
  agg: Agg;
  /** The field aggregated. Ignored for a count. */
  field?: string;
  /** "none", "month", "week" or a field key. */
  groupBy: string;
  dateField: string;
  range: { preset: RangePreset; from?: string; to?: string };
  filters: ExploreFilter[];
  viz: ExploreViz;
  sort: "value" | "label";
  limit: number;
}

export interface ExploreRow {
  key: string;
  value: number | null;
  count: number;
  recordIds: string[];
}

export interface ExploreResult {
  spec: ExploreSpec;
  rows: ExploreRow[];
  /** The figure over every record that passed range and filters. */
  total: number | null;
  unit: "money" | "number" | "count";
  inCollection: number;
  withoutDate: number;
  outsideRange: number;
  removedByFilters: number;
  /** Records counted toward the figure (after range and filters). */
  included: number;
  /** Of the included records, those with no value for the aggregated field. */
  missingValue: number;
  /** Groups beyond the row limit, folded into nothing (reported, not hidden). */
  hiddenGroups: number;
  currencies: string[];
  includedIds: string[];
  formula: string;
  steps: string[];
  window: { from?: string; to?: string };
  problems: string[];
}

const BASE_FIELDS: { key: string; label: string; type: FieldType }[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "status", label: "Status", type: "text" },
  { key: "ownerName", label: "Owner", type: "text" },
  { key: "amountMinor", label: "Amount", type: "money" },
  { key: "at", label: "Record date", type: "date" },
  { key: "dueAt", label: "Due date", type: "date" },
  { key: "createdAt", label: "Created", type: "date" },
  { key: "updatedAt", label: "Last updated", type: "date" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export function fieldValue(record: Rec, key: string): string | number | boolean | undefined {
  if (key.startsWith("fields.")) return record.fields[key.slice(7)];
  const value = (record as unknown as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function humanise(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** The fields this collection really carries in this workspace, typed by their values. */
export function inferSchema(records: Rec[], collection: string): FieldInfo[] {
  const rows = records.filter((record) => record.collection === collection);
  const total = rows.length;
  const out: FieldInfo[] = [];
  const describe = (key: string, label: string, declared?: FieldType) => {
    const values = rows.map((record) => fieldValue(record, key)).filter(isPresent);
    if (values.length === 0) return;
    let type: FieldType = declared ?? "text";
    if (!declared) {
      if (values.every((value) => typeof value === "number")) type = /minor$/i.test(key) ? "money" : "number";
      else if (values.every((value) => typeof value === "string" && ISO_DATE.test(value))) type = "date";
    }
    const counts = new Map<string, number>();
    if (type === "text") for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
    out.push({
      key,
      label,
      type,
      present: values.length,
      total,
      values: [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([value]) => value),
    });
  };
  for (const base of BASE_FIELDS) describe(base.key, base.label, base.type);
  const extra = new Set<string>();
  for (const record of rows) for (const key of Object.keys(record.fields ?? {})) extra.add(key);
  for (const key of [...extra].sort()) describe(`fields.${key}`, humanise(key));
  return out;
}

export function numericFields(schema: FieldInfo[]): FieldInfo[] {
  return schema.filter((field) => field.type === "number" || field.type === "money");
}

export function defaultExploreSpec(collection: string, schema: FieldInfo[] = []): ExploreSpec {
  const hasAmount = schema.some((field) => field.key === "amountMinor");
  return {
    collection,
    agg: hasAmount ? "sum" : "count",
    field: hasAmount ? "amountMinor" : undefined,
    groupBy: "status",
    dateField: "at",
    range: { preset: "all" },
    filters: [],
    viz: "bar",
    sort: "value",
    limit: 12,
  };
}

/** Reads a stored spec defensively: anything missing falls back to a safe default. */
export function readExplore(raw: unknown): ExploreSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ExploreSpec>;
  if (!value.collection) return undefined;
  const base = defaultExploreSpec(value.collection);
  return {
    ...base,
    ...value,
    agg: (["count", "sum", "avg", "min", "max"] as Agg[]).includes(value.agg as Agg) ? (value.agg as Agg) : "count",
    range: value.range && typeof value.range === "object" ? { preset: value.range.preset ?? "all", from: value.range.from, to: value.range.to } : base.range,
    filters: Array.isArray(value.filters) ? value.filters : [],
    limit: Number.isFinite(value.limit) && Number(value.limit) > 0 ? Number(value.limit) : base.limit,
  };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The inclusive window a preset covers, as ISO dates. */
export function rangeWindow(range: ExploreSpec["range"], now: Date): { from?: string; to?: string } {
  const day = 86_400_000;
  const today = startOfDay(now);
  const end = new Date(today.getTime() + day - 1).toISOString();
  switch (range.preset) {
    case "30d": return { from: new Date(today.getTime() - 29 * day).toISOString(), to: end };
    case "90d": return { from: new Date(today.getTime() - 89 * day).toISOString(), to: end };
    case "12m": return { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1)).toISOString(), to: end };
    case "ytd": return { from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)).toISOString(), to: end };
    case "custom": return {
      from: range.from ? new Date(`${range.from}T00:00:00Z`).toISOString() : undefined,
      to: range.to ? new Date(`${range.to}T23:59:59.999Z`).toISOString() : undefined,
    };
    default: return {};
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function matchesFilter(record: Rec, filter: ExploreFilter, type: FieldType): boolean {
  const actual = fieldValue(record, filter.field);
  if (filter.op === "is empty") return !isPresent(actual);
  if (filter.op === "is not empty") return isPresent(actual);
  if (!isPresent(actual)) return false;
  const text = String(actual).toLowerCase();
  const expected = filter.value.trim().toLowerCase();
  if (type === "date") {
    const at = new Date(String(actual)).getTime();
    const bound = new Date(filter.value).getTime();
    if (Number.isNaN(at) || Number.isNaN(bound)) return false;
    return filter.op === "greater than" ? at > bound : filter.op === "less than" ? at < bound : false;
  }
  if (type === "number" || type === "money") {
    const left = asNumber(actual);
    const raw = asNumber(filter.value);
    if (left === undefined || raw === undefined) return false;
    /* A money filter is typed in major units by a person and compared in minor units. */
    const right = type === "money" ? Math.round(raw * 100) : raw;
    if (filter.op === "greater than") return left > right;
    if (filter.op === "less than") return left < right;
    return left === right;
  }
  if (filter.op === "is") return text === expected;
  if (filter.op === "is not") return text !== expected;
  if (filter.op === "contains") return text.includes(expected);
  return true;
}

function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function groupKey(record: Rec, spec: ExploreSpec): string {
  if (spec.groupBy === "none") return "All records";
  if (spec.groupBy === "month" || spec.groupBy === "week") {
    const raw = fieldValue(record, spec.dateField);
    const date = typeof raw === "string" ? new Date(raw) : undefined;
    if (!date || Number.isNaN(date.getTime())) return "No date";
    return spec.groupBy === "month" ? date.toISOString().slice(0, 7) : isoWeek(date);
  }
  const value = fieldValue(record, spec.groupBy);
  if (!isPresent(value)) return "(blank)";
  if (typeof value === "string" && ISO_DATE.test(value)) return value.slice(0, 10);
  return String(value);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How a group key reads on screen; the key itself stays sortable. */
export function displayKey(key: string, spec: ExploreSpec): string {
  if (spec.groupBy === "month" && /^\d{4}-\d{2}$/.test(key)) return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return key;
}

function aggregate(agg: Agg, values: number[], count: number): number | null {
  if (agg === "count") return count;
  if (values.length === 0) return agg === "sum" ? 0 : null;
  if (agg === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (agg === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === "min") return Math.min(...values);
  return Math.max(...values);
}

export function describeFormula(spec: ExploreSpec, schema: FieldInfo[]): string {
  const field = schema.find((item) => item.key === spec.field);
  const subject = spec.agg === "count" ? `count(${spec.collection})` : `${spec.agg}(${spec.collection}.${field?.label.toLowerCase() ?? spec.field ?? "?"})`;
  const group = spec.groupBy === "none" ? "" : ` grouped by ${spec.groupBy === "month" || spec.groupBy === "week" ? `${spec.groupBy} of ${schema.find((item) => item.key === spec.dateField)?.label.toLowerCase() ?? spec.dateField}` : schema.find((item) => item.key === spec.groupBy)?.label.toLowerCase() ?? spec.groupBy}`;
  const where = spec.filters.length ? ` where ${spec.filters.map((filter) => `${schema.find((item) => item.key === filter.field)?.label.toLowerCase() ?? filter.field} ${filter.op}${NO_VALUE_OPS.includes(filter.op) ? "" : ` "${filter.value}"`}`).join(" and ")}` : "";
  return `${subject}${where}${group}`;
}

export function runExplore(spec: ExploreSpec, records: Rec[], now: Date): ExploreResult {
  const schema = inferSchema(records, spec.collection);
  const typeOf = (key: string) => schema.find((field) => field.key === key)?.type ?? "text";
  const problems: string[] = [];
  const pool = records.filter((record) => record.collection === spec.collection);
  const window = rangeWindow(spec.range, now);
  const limited = Boolean(window.from || window.to);

  let withoutDate = 0;
  let outsideRange = 0;
  const inRange = pool.filter((record) => {
    if (!limited) return true;
    const raw = fieldValue(record, spec.dateField);
    const time = typeof raw === "string" ? new Date(raw).getTime() : Number.NaN;
    if (Number.isNaN(time)) { withoutDate += 1; return false; }
    if (window.from && time < new Date(window.from).getTime()) { outsideRange += 1; return false; }
    if (window.to && time > new Date(window.to).getTime()) { outsideRange += 1; return false; }
    return true;
  });

  for (const filter of spec.filters) {
    if (!schema.some((field) => field.key === filter.field)) problems.push(`The filter on "${filter.field}" names a field no ${spec.collection} record carries, so it matches nothing.`);
    if (!NO_VALUE_OPS.includes(filter.op) && filter.value.trim() === "") problems.push(`The filter on ${schema.find((field) => field.key === filter.field)?.label ?? filter.field} has no value yet.`);
  }
  const included = inRange.filter((record) => spec.filters.every((filter) => matchesFilter(record, filter, typeOf(filter.field))));
  const removedByFilters = inRange.length - included.length;

  const aggField = spec.agg === "count" ? undefined : spec.field;
  if (spec.agg !== "count" && !aggField) problems.push("Choose the field to aggregate.");
  const aggType = aggField ? typeOf(aggField) : undefined;
  if (aggField && aggType !== "number" && aggType !== "money") problems.push(`${schema.find((field) => field.key === aggField)?.label ?? aggField} is not a number in these records, so it cannot be summed or averaged.`);
  const numberOf = (record: Rec) => (aggField ? asNumber(fieldValue(record, aggField)) : undefined);
  const missingValue = aggField ? included.filter((record) => numberOf(record) === undefined).length : 0;

  const groups = new Map<string, Rec[]>();
  for (const record of included) {
    const key = groupKey(record, spec);
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  let rows: ExploreRow[] = [...groups.entries()].map(([key, group]) => {
    const values = group.map(numberOf).filter((value): value is number => value !== undefined);
    return { key, value: aggregate(spec.agg, values, group.length), count: group.length, recordIds: group.map((record) => record.id) };
  });
  const chronological = spec.groupBy === "month" || spec.groupBy === "week" || typeOf(spec.groupBy) === "date";
  rows.sort((left, right) => (spec.sort === "label" || chronological
    ? left.key.localeCompare(right.key)
    : (right.value ?? -Infinity) - (left.value ?? -Infinity) || left.key.localeCompare(right.key)));
  const hiddenGroups = Math.max(0, rows.length - spec.limit);
  // A time dimension keeps its most recent groups (still oldest first); any
  // other grouping keeps the first by its sort.
  if (hiddenGroups > 0) rows = chronological ? rows.slice(-spec.limit) : rows.slice(0, spec.limit);

  const allValues = included.map(numberOf).filter((value): value is number => value !== undefined);
  const total = aggregate(spec.agg, allValues, included.length);
  const unit: ExploreResult["unit"] = spec.agg === "count" ? "count" : aggType === "money" ? "money" : "number";
  const currencies = unit === "money" ? [...new Set(included.map((record) => record.currency).filter(Boolean))].sort() : [];
  if (currencies.length > 1) problems.push(`The included records are in ${currencies.join(" and ")}. Amounts are added as recorded, without conversion; filter to one currency for a comparable figure.`);

  const formula = describeFormula(spec, schema);
  const steps = [
    `${pool.length} ${spec.collection} record${pool.length === 1 ? "" : "s"} in this workspace.`,
    limited
      ? `${RANGE_LABELS[spec.range.preset]} on ${schema.find((field) => field.key === spec.dateField)?.label.toLowerCase() ?? spec.dateField}: ${inRange.length} kept, ${outsideRange} outside the range, ${withoutDate} with no date.`
      : "No date range applied.",
    spec.filters.length ? `${spec.filters.length} filter${spec.filters.length === 1 ? "" : "s"}: ${included.length} kept, ${removedByFilters} removed.` : "No filters applied.",
    spec.agg === "count"
      ? `Counted ${included.length} record${included.length === 1 ? "" : "s"}.`
      : `${AGG_LABELS[spec.agg]} ${schema.find((field) => field.key === aggField)?.label.toLowerCase() ?? aggField} over ${included.length - missingValue} record${included.length - missingValue === 1 ? "" : "s"}${missingValue ? `; ${missingValue} had no value and were left out, not counted as zero` : ""}.`,
    spec.groupBy === "none" ? "Not grouped." : `Grouped into ${groups.size} group${groups.size === 1 ? "" : "s"}${hiddenGroups ? `; the ${spec.limit} shown are ${chronological ? "the most recent" : `the first by ${spec.sort === "label" ? "label" : "value"}`}, ${hiddenGroups} more are in the CSV` : ""}.`,
  ];

  return {
    spec, rows, total, unit,
    inCollection: pool.length,
    withoutDate, outsideRange, removedByFilters,
    included: included.length,
    missingValue, hiddenGroups, currencies,
    includedIds: included.map((record) => record.id),
    formula, steps, window, problems,
  };
}

/**
 * One quoted CSV cell. Text that a spreadsheet would read as a formula (it
 * starts with = + - @, a tab or a carriage return) is prefixed with an
 * apostrophe; plain numbers pass through untouched.
 */
export function exploreCsvCell(cell: string | number): string {
  const text = String(cell);
  const numeric = typeof cell === "number" || /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Every group (not only the shown ones) as CSV, with the formula on top. */
export function exploreCsv(spec: ExploreSpec, records: Rec[], now: Date, format: (value: number | null) => string): string {
  const full = runExplore({ ...spec, limit: Number.MAX_SAFE_INTEGER }, records, now);
  const escape = exploreCsvCell;
  const lines = [
    [escape("Formula"), escape(full.formula)].join(","),
    [escape("Source"), escape("This workspace's records")].join(","),
    [escape("Records included"), escape(full.included)].join(","),
    "",
    ["Group", "Value", "Records"].map(escape).join(","),
    ...full.rows.map((row) => [escape(displayKey(row.key, spec)), escape(format(row.value)), escape(row.count)].join(",")),
    [escape("Total"), escape(format(full.total)), escape(full.included)].join(","),
  ];
  return lines.join("\n");
}
