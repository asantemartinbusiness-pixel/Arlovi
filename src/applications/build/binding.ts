/* ====================================================================== *
 * Data binding and interaction rules for designed screen components.
 *
 * A data component reads one entity. Its binding narrows the records it
 * shows (filters, joined with AND), orders them (one sort) and caps them
 * (a limit). An interaction says what choosing a row, or saving a form,
 * does: nothing, open another screen, or open another screen focused on
 * the chosen record. The preview and the generated code both read these
 * same values, so the designer, the preview and the output cannot disagree.
 * ====================================================================== */

export const FILTER_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "is_empty", "not_empty"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const FILTER_LABELS: Record<FilterOperator, string> = {
  equals: "is", not_equals: "is not", contains: "contains", greater_than: "is more than",
  less_than: "is less than", is_empty: "is empty", not_empty: "is not empty",
};

export interface QueryFilter { id: string; fieldId: string; operator: FilterOperator; value: string }
export interface QuerySort { fieldId: string; direction: "asc" | "desc" }

export const INTERACTION_KINDS = ["none", "open_screen", "open_record"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export interface Interaction { kind: InteractionKind; screenId: string }

export const NO_INTERACTION: Interaction = { kind: "none", screenId: "" };

/** Components whose rows can be chosen, and forms, which act after a save. */
export const INTERACTIVE_KINDS = ["table", "list", "form"] as const;
/** Components that show more than one record and can be filtered. */
export const QUERY_KINDS = ["table", "list", "stat", "chart", "detail"] as const;

export function needsValue(operator: FilterOperator): boolean {
  return operator !== "is_empty" && operator !== "not_empty";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readFilters(raw: unknown): QueryFilter[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = asObject(item);
    const operator = String(row.operator ?? "");
    return {
      id: typeof row.id === "string" && row.id ? row.id : `f${index + 1}`,
      fieldId: typeof row.fieldId === "string" ? row.fieldId : "",
      operator: (FILTER_OPERATORS as readonly string[]).includes(operator) ? operator as FilterOperator : "equals",
      value: typeof row.value === "string" ? row.value : String(row.value ?? ""),
    };
  });
}

export function readSort(raw: unknown): QuerySort | null {
  const row = asObject(raw);
  if (typeof row.fieldId !== "string" || !row.fieldId) return null;
  return { fieldId: row.fieldId, direction: row.direction === "desc" ? "desc" : "asc" };
}

export function readLimit(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(500, Math.floor(value)) : 0;
}

export function readInteraction(raw: unknown): Interaction {
  const row = asObject(raw);
  const kind = String(row.kind ?? "");
  const screenId = typeof row.screenId === "string" ? row.screenId : "";
  if (!(INTERACTION_KINDS as readonly string[]).includes(kind) || kind === "none") return NO_INTERACTION;
  return { kind: kind as InteractionKind, screenId };
}

function numeric(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** Compare two stored values: numbers numerically, ISO dates and text as text, ignoring case. */
export function compareValues(a: string, b: string): number {
  const x = numeric(a);
  const y = numeric(b);
  if (x !== undefined && y !== undefined) return x - y;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function matches(value: string, filter: QueryFilter): boolean {
  const actual = value.trim();
  const wanted = filter.value.trim();
  switch (filter.operator) {
    case "is_empty": return actual === "";
    case "not_empty": return actual !== "";
    case "equals": return actual.toLowerCase() === wanted.toLowerCase();
    case "not_equals": return actual.toLowerCase() !== wanted.toLowerCase();
    case "contains": return actual.toLowerCase().includes(wanted.toLowerCase());
    case "greater_than": return actual !== "" && compareValues(actual, wanted) > 0;
    case "less_than": return actual !== "" && compareValues(actual, wanted) < 0;
  }
}

export interface Query { filters: QueryFilter[]; sort: QuerySort | null; limit: number }

/**
 * Apply a binding to rows. `read(row, fieldId)` returns the stored value of
 * a field. Filters naming a field that no longer exists are skipped (and
 * reported by bindingProblems) rather than silently hiding every record.
 */
export function applyQuery<T>(rows: T[], query: Query, read: (row: T, fieldId: string) => string, knownFieldIds: string[]): { rows: T[]; matched: number; total: number } {
  const known = new Set(knownFieldIds);
  const active = query.filters.filter((filter) => known.has(filter.fieldId) && (!needsValue(filter.operator) || filter.value.trim() !== ""));
  const kept = rows.filter((row) => active.every((filter) => matches(read(row, filter.fieldId), filter)));
  const sort = query.sort && known.has(query.sort.fieldId) ? query.sort : null;
  const ordered = sort
    ? [...kept].sort((a, b) => {
      const x = read(a, sort.fieldId);
      const y = read(b, sort.fieldId);
      // Empty values sort last in both directions.
      if (!x && y) return 1;
      if (x && !y) return -1;
      const order = compareValues(x, y);
      return sort.direction === "asc" ? order : -order;
    })
    : kept;
  return { rows: query.limit > 0 ? ordered.slice(0, query.limit) : ordered, matched: kept.length, total: rows.length };
}

/** One sentence describing the binding, for the canvas and the generated code comments. */
export function describeQuery(query: Query, fieldName: (fieldId: string) => string | undefined): string {
  const parts: string[] = [];
  const filters = query.filters.filter((filter) => fieldName(filter.fieldId));
  if (filters.length) {
    parts.push(`where ${filters.map((filter) => `${fieldName(filter.fieldId)} ${FILTER_LABELS[filter.operator]}${needsValue(filter.operator) ? ` "${filter.value}"` : ""}`).join(" and ")}`);
  }
  if (query.sort && fieldName(query.sort.fieldId)) parts.push(`sorted by ${fieldName(query.sort.fieldId)} ${query.sort.direction === "asc" ? "ascending" : "descending"}`);
  if (query.limit > 0) parts.push(`first ${query.limit}`);
  return parts.length ? parts.join(", ") : "all records";
}

export interface BindingProblem { level: "fail" | "warn"; title: string; detail: string }

/** Problems with one component's binding and interaction, given the entity's fields and the app's screens. */
export function bindingProblems(
  component: { title: string; kind: string; filters: QueryFilter[]; sort: QuerySort | null; interaction: Interaction },
  fieldIds: string[] | undefined,
  screens: { id: string; name: string }[],
  ownScreenId: string,
): BindingProblem[] {
  const problems: BindingProblem[] = [];
  const fields = new Set(fieldIds ?? []);
  if (fieldIds) {
    const stale = component.filters.filter((filter) => !fields.has(filter.fieldId));
    if (stale.length) problems.push({ level: "fail", title: `${component.title} filters on ${stale.length === 1 ? "a field" : `${stale.length} fields`} that no longer exist`, detail: "The filter is skipped until it names a field of the bound entity." });
    const blank = component.filters.filter((filter) => fields.has(filter.fieldId) && needsValue(filter.operator) && !filter.value.trim());
    if (blank.length) problems.push({ level: "warn", title: `${component.title} has ${blank.length === 1 ? "a filter" : `${blank.length} filters`} with no value`, detail: "An empty comparison is ignored rather than matching nothing." });
    if (component.sort && !fields.has(component.sort.fieldId)) problems.push({ level: "fail", title: `${component.title} sorts on a field that no longer exists`, detail: "The records keep their stored order until another field is chosen." });
  }
  if (component.interaction.kind !== "none") {
    const target = screens.find((screen) => screen.id === component.interaction.screenId);
    if (!target) problems.push({ level: "fail", title: `${component.title} opens a screen that does not exist`, detail: "Choose a target screen, or set the interaction to do nothing." });
    else if (target.id === ownScreenId && component.interaction.kind === "open_screen") problems.push({ level: "warn", title: `${component.title} opens its own screen`, detail: "Choosing a row would reload the same screen with nothing changed." });
  }
  return problems;
}
