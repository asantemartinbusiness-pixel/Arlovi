import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * ANALYTICS — measures, dimensions and the query that recomputes them.
 *
 * Every figure on an Analytics screen comes from this module, and this module
 * only reads records that are in the workspace. A measure that has no source
 * here is declared unavailable with the reason; it is never filled with a
 * plausible number.
 * ====================================================================== */

export const ANALYTICS_COLLECTIONS = [
  "invoices", "bills", "expenses", "deals", "leads", "quotes", "orders", "products",
  "contacts", "companies", "tasks", "tickets", "projects", "campaigns", "bookings", "journals",
];

export type Unit = "money" | "count" | "percent" | "days";

export interface QueryContext {
  records: Rec[];
  byId: Map<string, Rec>;
  now: Date;
  locale: string;
}

export interface MeasureDef {
  id: string;
  name: string;
  unit: Unit;
  /** The collection the figure is computed from — this is its lineage. */
  collection: string;
  owner: string;
  version: number;
  /** Written so a person can check the arithmetic against the records. */
  formula: string;
  description: string;
  sensitive?: boolean;
  /** Set when this workspace holds no source for the figure. */
  unavailable?: string;
  filter?: (record: Rec, context: QueryContext) => boolean;
  value?: (record: Rec, context: QueryContext) => number;
  agg?: "sum" | "count" | "avg" | "max";
  /** Overrides the generic path for ratios and other derived figures. */
  compute?: (records: Rec[], context: QueryContext) => number | null;
}

const openInvoice = (record: Rec) => !["paid", "void", "draft"].includes(record.status);
const openDeal = (record: Rec) => !["won", "lost"].includes(record.status);
const amount = (record: Rec) => record.amountMinor ?? 0;

export const MEASURES: MeasureDef[] = [
  {
    id: "revenue.paid", name: "Revenue recognised", unit: "money", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "sum(invoices.amountMinor) where status = paid",
    description: "Gross invoice value for invoices marked paid in this workspace. There is no bank feed, so this is what the ledger says, not what a bank confirmed.",
    filter: (record) => record.collection === "invoices" && record.status === "paid",
    value: amount, agg: "sum",
  },
  {
    id: "revenue.net", name: "Net revenue", unit: "money", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "sum(invoices.fields.netMinor) where status = paid",
    description: "Invoice value before tax, taken from the net figure stored on each paid invoice.",
    filter: (record) => record.collection === "invoices" && record.status === "paid",
    value: (record) => Number(record.fields.netMinor ?? 0), agg: "sum",
  },
  {
    id: "receivable.open", name: "Receivable", unit: "money", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "sum(invoices.amountMinor) where status not in (paid, void, draft)",
    description: "Invoice value issued and not yet settled in the local ledger.",
    filter: (record) => record.collection === "invoices" && openInvoice(record),
    value: amount, agg: "sum",
  },
  {
    id: "receivable.overdue", name: "Overdue receivable", unit: "money", collection: "invoices",
    owner: "Jonah Adeyemi", version: 2,
    formula: "sum(invoices.amountMinor) where dueAt < now and status ≠ paid",
    description: "Open invoice value past its due date, measured against the workspace clock.",
    filter: (record, context) => record.collection === "invoices" && openInvoice(record) && Boolean(record.dueAt) && new Date(record.dueAt!) < context.now,
    value: amount, agg: "sum",
  },
  {
    id: "invoice.count", name: "Invoices issued", unit: "count", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "count(invoices) where status ≠ draft",
    description: "Invoices that exist beyond draft in this workspace.",
    filter: (record) => record.collection === "invoices" && record.status !== "draft",
    value: () => 1, agg: "count",
  },
  {
    id: "invoice.average", name: "Average invoice", unit: "money", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "avg(invoices.amountMinor) where status ≠ draft",
    description: "Mean invoice value, excluding drafts.",
    filter: (record) => record.collection === "invoices" && record.status !== "draft",
    value: amount, agg: "avg",
  },
  {
    id: "pipeline.open", name: "Open pipeline", unit: "money", collection: "deals",
    owner: "Priya Shah", version: 1,
    formula: "sum(deals.amountMinor) where status not in (won, lost)",
    description: "Value of deals still in play.",
    filter: (record) => record.collection === "deals" && openDeal(record),
    value: amount, agg: "sum",
  },
  {
    id: "pipeline.weighted", name: "Weighted pipeline", unit: "money", collection: "deals",
    owner: "Priya Shah", version: 2,
    formula: "sum(deals.amountMinor × deals.fields.probability ÷ 100) where status not in (won, lost)",
    description: "Open pipeline weighted by the probability recorded on each deal. A deal with no probability contributes nothing rather than a guess.",
    filter: (record) => record.collection === "deals" && openDeal(record),
    value: (record) => Math.round(amount(record) * (Number(record.fields.probability ?? 0) / 100)), agg: "sum",
  },
  {
    id: "deals.won", name: "Deals won", unit: "count", collection: "deals",
    owner: "Priya Shah", version: 1,
    formula: "count(deals) where status = won",
    description: "Deals marked won.",
    filter: (record) => record.collection === "deals" && record.status === "won",
    value: () => 1, agg: "count",
  },
  {
    id: "deals.winrate", name: "Win rate", unit: "percent", collection: "deals",
    owner: "Priya Shah", version: 1,
    formula: "count(won) ÷ (count(won) + count(lost)) × 100",
    description: "Share of decided deals that were won. Undecided deals are excluded, so the figure is unavailable until at least one deal is decided.",
    compute: (records) => {
      const decided = records.filter((record) => record.collection === "deals" && ["won", "lost"].includes(record.status));
      if (decided.length === 0) return null;
      return (decided.filter((record) => record.status === "won").length / decided.length) * 100;
    },
  },
  {
    id: "quote.value", name: "Quoted value", unit: "money", collection: "quotes",
    owner: "Priya Shah", version: 1,
    formula: "sum(quotes.amountMinor)",
    description: "Value of quotes recorded, whatever their state.",
    filter: (record) => record.collection === "quotes",
    value: amount, agg: "sum",
  },
  {
    id: "payable.open", name: "Payable", unit: "money", collection: "bills",
    owner: "Jonah Adeyemi", version: 1,
    formula: "sum(bills.amountMinor) where status ≠ paid",
    description: "Supplier bills not yet paid in the local ledger.",
    filter: (record) => record.collection === "bills" && record.status !== "paid",
    value: amount, agg: "sum",
  },
  {
    id: "expenses.total", name: "Expenses recorded", unit: "money", collection: "expenses",
    owner: "Jonah Adeyemi", version: 1,
    formula: "sum(expenses.amountMinor)",
    description: "Expense receipts in this workspace, posted or not.",
    filter: (record) => record.collection === "expenses",
    value: amount, agg: "sum",
  },
  {
    id: "orders.value", name: "Order value", unit: "money", collection: "orders",
    owner: "Priya Shah", version: 1,
    formula: "sum(orders.amountMinor)",
    description: "Value of orders recorded. Card capture is not connected, so an order can be held awaiting payment.",
    filter: (record) => record.collection === "orders",
    value: amount, agg: "sum",
  },
  {
    id: "stock.value", name: "Stock at list price", unit: "money", collection: "products",
    owner: "Maya Chen", version: 1,
    formula: "sum(products.amountMinor × products.fields.onHand)",
    description: "Units on hand valued at the local catalogue price. This is not a cost valuation, because no unit cost is recorded.",
    filter: (record) => record.collection === "products",
    value: (record) => amount(record) * Number(record.fields.onHand ?? 0), agg: "sum",
  },
  {
    id: "tickets.open", name: "Open tickets", unit: "count", collection: "tickets",
    owner: "Priya Shah", version: 1,
    formula: "count(tickets) where status in (open, waiting)",
    description: "Customer tickets that still need a reply.",
    filter: (record) => record.collection === "tickets" && ["open", "waiting"].includes(record.status),
    value: () => 1, agg: "count",
  },
  {
    id: "tasks.open", name: "Open work items", unit: "count", collection: "tasks",
    owner: "Maya Chen", version: 1,
    formula: "count(tasks) where status ≠ done",
    description: "Tasks not finished.",
    filter: (record) => record.collection === "tasks" && record.status !== "done",
    value: () => 1, agg: "count",
  },
  {
    id: "lead.value", name: "Lead value", unit: "money", collection: "leads",
    owner: "Priya Shah", version: 1,
    formula: "sum(leads.amountMinor)",
    description: "Estimated value on enquiries recorded in this workspace.",
    filter: (record) => record.collection === "leads",
    value: amount, agg: "sum",
  },
  {
    id: "dso.days", name: "Days sales outstanding", unit: "days", collection: "invoices",
    owner: "Jonah Adeyemi", version: 1,
    formula: "avg(now − invoices.at) over open invoices, in days",
    description: "Average age of unsettled invoices against the workspace clock.",
    compute: (records, context) => {
      const open = records.filter((record) => record.collection === "invoices" && openInvoice(record) && record.at);
      if (open.length === 0) return null;
      const total = open.reduce((sum, record) => sum + Math.max(0, (context.now.getTime() - new Date(record.at!).getTime()) / 86_400_000), 0);
      return total / open.length;
    },
  },
  {
    id: "gross.margin", name: "Gross margin", unit: "percent", collection: "products",
    owner: "Jonah Adeyemi", version: 1,
    formula: "(revenue − cost of goods) ÷ revenue",
    description: "Cannot be computed here.",
    unavailable: "No unit cost is recorded on any product, so cost of goods has no source in this workspace. Record a cost on products, or connect a purchasing feed, and this measure resolves.",
  },
  {
    id: "marketing.spend", name: "Marketing spend", unit: "money", collection: "campaigns",
    owner: "Priya Shah", version: 1,
    formula: "sum(campaigns.fields.spendMinor)",
    description: "Cannot be computed here.",
    unavailable: "No campaign carries a spend figure, and no advertising account is connected, so there is nothing to add up.",
  },
  {
    id: "web.sessions", name: "Website sessions", unit: "count", collection: "sites",
    owner: "Priya Shah", version: 1,
    formula: "sum(sessions) from a web analytics source",
    description: "Cannot be computed here.",
    unavailable: "No web analytics provider is connected and this browser records no page views, so there is no session count to report.",
  },
  {
    id: "nps.score", name: "Net promoter score", unit: "count", collection: "reviews",
    owner: "Priya Shah", version: 1,
    formula: "promoters% − detractors% from survey responses",
    description: "Cannot be computed here.",
    unavailable: "No survey responses are recorded in this workspace, so there are no promoters or detractors to count.",
  },
];

/**
 * Measures a person defined in this workspace, merged into the catalogue.
 * A custom measure is still computed the same way: a collection, an
 * aggregation, a field and an optional status list, all read from records.
 */
let CUSTOM: MeasureDef[] = [];

export function setCustomMeasures(defs: MeasureDef[]): void {
  CUSTOM = defs;
}

export function allMeasures(): MeasureDef[] {
  return [...MEASURES, ...CUSTOM];
}

export function measureById(id: string): MeasureDef | undefined {
  return allMeasures().find((measure) => measure.id === id);
}

export interface CustomMeasureInput {
  id: string;
  name: string;
  collection: string;
  agg: "sum" | "count" | "avg" | "max";
  field: string;
  statusIn: string[];
  unit: Unit;
  owner: string;
  version: number;
  description: string;
}

export function buildCustomMeasure(input: CustomMeasureInput): MeasureDef {
  const statuses = input.statusIn.filter(Boolean).map((status) => status.trim().toLowerCase());
  const formula = `${input.agg}(${input.collection}.${input.field})${statuses.length ? ` where status in (${statuses.join(", ")})` : ""}`;
  return {
    id: input.id,
    name: input.name,
    unit: input.unit,
    collection: input.collection,
    owner: input.owner,
    version: input.version,
    formula,
    description: input.description || `Defined in this workspace: ${formula}.`,
    agg: input.agg,
    filter: (record) => record.collection === input.collection && (statuses.length === 0 || statuses.includes(record.status.toLowerCase())),
    value: (record) => {
      if (input.field === "count") return 1;
      if (input.field === "amountMinor") return record.amountMinor ?? 0;
      const raw = record.fields[input.field];
      return typeof raw === "number" ? raw : Number(raw ?? 0);
    },
  };
}

/* ------------------------------ dimensions ------------------------------ */

export interface DimensionDef {
  id: string;
  name: string;
  /** The semantic type, so a filter and a tile cannot be mismatched. */
  type: "status" | "person" | "time" | "entity" | "category" | "money";
  description: string;
  of: (record: Rec, context: QueryContext) => string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DIMENSIONS: DimensionDef[] = [
  { id: "status", name: "Status", type: "status", description: "The record's status field.", of: (record) => record.status },
  { id: "owner", name: "Owner", type: "person", description: "The person the record is recorded against.", of: (record) => record.ownerName },
  {
    id: "month", name: "Month", type: "time", description: "Calendar month of the record's own date, or its creation date if it has none.",
    of: (record) => {
      const raw = record.at ?? record.createdAt;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "Unknown";
      return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    },
  },
  {
    id: "company", name: "Company", type: "entity", description: "Resolved through the contact on the record, then the company on that contact.",
    of: (record, context) => {
      const contactId = String(record.fields.contactId ?? record.parentId ?? "");
      const contact = context.byId.get(contactId);
      const companyId = String(contact?.fields.companyId ?? record.fields.companyId ?? "");
      return context.byId.get(companyId)?.title ?? contact?.title ?? "Unattributed";
    },
  },
  { id: "stage", name: "Stage", type: "category", description: "The stage field, used by deals, leads and tasks.", of: (record) => String(record.fields.stage ?? record.status) },
  { id: "priority", name: "Priority", type: "category", description: "The priority field, used by tickets and tasks.", of: (record) => String(record.fields.priority ?? "unset") },
  { id: "source", name: "Source", type: "category", description: "Where an enquiry came from.", of: (record) => String(record.fields.source ?? "unrecorded") },
  { id: "collection", name: "Record type", type: "category", description: "Which collection the record is in.", of: (record) => record.collection },
  { id: "industry", name: "Industry", type: "category", description: "The industry on the company the record resolves to.", of: (record, context) => {
    const contactId = String(record.fields.contactId ?? record.parentId ?? "");
    const contact = context.byId.get(contactId);
    const company = context.byId.get(String(contact?.fields.companyId ?? record.fields.companyId ?? ""));
    return String(company?.fields.industry ?? "Unrecorded");
  } },
];

export function dimensionById(id: string | undefined): DimensionDef | undefined {
  return DIMENSIONS.find((dimension) => dimension.id === id);
}

/* ------------------------------ filters ------------------------------ */

export type FilterOp = "is" | "is not" | "contains" | "greater than" | "less than" | "before" | "after";

export interface QueryFilter {
  id: string;
  dimensionId: string;
  op: FilterOp;
  value: string;
}

export const FILTER_OPS_BY_TYPE: Record<DimensionDef["type"], FilterOp[]> = {
  status: ["is", "is not"],
  person: ["is", "is not"],
  time: ["is", "before", "after"],
  entity: ["is", "is not", "contains"],
  category: ["is", "is not", "contains"],
  money: ["greater than", "less than"],
};

/** A filter whose dimension cannot be resolved for a record is reported, not ignored. */
export function applyFilter(record: Rec, filter: QueryFilter, context: QueryContext): boolean {
  const dimension = dimensionById(filter.dimensionId);
  if (!dimension) return true;
  const actual = dimension.of(record, context);
  const expected = filter.value;
  switch (filter.op) {
    case "is": return actual.toLowerCase() === expected.toLowerCase();
    case "is not": return actual.toLowerCase() !== expected.toLowerCase();
    case "contains": return actual.toLowerCase().includes(expected.toLowerCase());
    case "greater than": return Number(actual) > Number(expected);
    case "less than": return Number(actual) < Number(expected);
    case "before": return new Date(record.at ?? record.createdAt) < new Date(expected);
    case "after": return new Date(record.at ?? record.createdAt) > new Date(expected);
    default: return true;
  }
}

/* ------------------------------ the query ------------------------------ */

export interface QuerySpec {
  measureIds: string[];
  dimensionId?: string;
  filters: QueryFilter[];
  limit?: number;
  sort?: "value" | "label";
}

export interface QueryRow {
  key: string;
  values: (number | null)[];
  recordIds: string[];
}

export interface QueryResult {
  spec: QuerySpec;
  measures: MeasureDef[];
  rows: QueryRow[];
  totals: (number | null)[];
  /** Collections the figures were computed from. */
  sources: string[];
  /** Newest timestamp among the contributing records. */
  asOf?: string;
  ageDays?: number;
  recordCount: number;
  unavailable: { id: string; name: string; reason: string }[];
  /** Filters whose dimension does not apply to a measure's collection. */
  inapplicableFilters: { filterId: string; measureId: string; reason: string }[];
}

function aggregate(measure: MeasureDef, records: Rec[], context: QueryContext): number | null {
  if (measure.unavailable) return null;
  if (measure.compute) return measure.compute(records, context);
  const matching = records.filter((record) => (measure.filter ? measure.filter(record, context) : record.collection === measure.collection));
  if (matching.length === 0) return measure.agg === "count" || measure.agg === "sum" ? 0 : null;
  const values = matching.map((record) => (measure.value ? measure.value(record, context) : 0));
  if (measure.agg === "count") return values.length;
  if (measure.agg === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (measure.agg === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function contributing(measure: MeasureDef, records: Rec[], context: QueryContext): Rec[] {
  if (measure.unavailable) return [];
  if (measure.compute) return records.filter((record) => record.collection === measure.collection);
  return records.filter((record) => (measure.filter ? measure.filter(record, context) : record.collection === measure.collection));
}

export function runQuery(spec: QuerySpec, context: QueryContext): QueryResult {
  const measures = spec.measureIds.map(measureById).filter((measure): measure is MeasureDef => Boolean(measure));
  const unavailable = measures.filter((measure) => measure.unavailable).map((measure) => ({ id: measure.id, name: measure.name, reason: measure.unavailable! }));
  const dimension = dimensionById(spec.dimensionId);

  const inapplicableFilters: QueryResult["inapplicableFilters"] = [];
  for (const filter of spec.filters) {
    const filterDimension = dimensionById(filter.dimensionId);
    if (!filterDimension) continue;
    for (const measure of measures) {
      if (measure.unavailable) continue;
      const sample = context.records.find((record) => record.collection === measure.collection);
      if (!sample) continue;
      const resolved = filterDimension.of(sample, context);
      if (resolved === "Unattributed" || resolved === "unset" || resolved === "unrecorded" || resolved === "Unrecorded") {
        inapplicableFilters.push({
          filterId: filter.id,
          measureId: measure.id,
          reason: `${measure.collection} records carry no ${filterDimension.name.toLowerCase()}, so this filter cannot narrow ${measure.name}. It is reported rather than silently ignored.`,
        });
      }
    }
  }

  const filtered = context.records.filter((record) => spec.filters.every((filter) => applyFilter(record, filter, context)));
  const scopedContext: QueryContext = { ...context, records: filtered };

  const totals = measures.map((measure) => aggregate(measure, filtered, scopedContext));
  const allContributing = measures.flatMap((measure) => contributing(measure, filtered, scopedContext));
  /* The record's own date, not the moment it was last touched: a figure's age
     is the age of the newest business event behind it. */
  const timestamps = allContributing.map((record) => record.at ?? record.updatedAt ?? record.createdAt).filter(Boolean).sort();
  const asOf = timestamps.at(-1);
  const ageDays = asOf ? Math.max(0, Math.floor((context.now.getTime() - new Date(asOf).getTime()) / 86_400_000)) : undefined;

  let rows: QueryRow[] = [];
  if (dimension) {
    const groups = new Map<string, Rec[]>();
    for (const record of filtered) {
      if (!measures.some((measure) => (measure.unavailable ? false : measure.collection === record.collection))) continue;
      const key = dimension.of(record, scopedContext);
      const list = groups.get(key) ?? [];
      list.push(record);
      groups.set(key, list);
    }
    rows = [...groups.entries()].map(([key, group]) => ({
      key,
      values: measures.map((measure) => aggregate(measure, group, { ...scopedContext, records: group })),
      recordIds: group.map((record) => record.id),
    }));
    rows.sort((left, right) => (spec.sort === "label"
      ? left.key.localeCompare(right.key)
      : (right.values[0] ?? 0) - (left.values[0] ?? 0)));
    if (spec.limit) rows = rows.slice(0, spec.limit);
  }

  return {
    spec,
    measures,
    rows,
    totals,
    sources: [...new Set(measures.filter((measure) => !measure.unavailable).map((measure) => measure.collection))],
    asOf,
    ageDays,
    recordCount: new Set(allContributing.map((record) => record.id)).size,
    unavailable,
    inapplicableFilters,
  };
}

/** Records that produced a figure, for the lineage panels. */
export function lineage(measureId: string, context: QueryContext): { measure?: MeasureDef; records: Rec[] } {
  const measure = measureById(measureId);
  if (!measure) return { records: [] };
  return { measure, records: contributing(measure, context.records, context) };
}

/* ------------------------------ formatting ------------------------------ */

export function formatMeasure(
  measure: MeasureDef | undefined,
  value: number | null | undefined,
  money: (minor: number | undefined) => string,
): string {
  if (!measure) return "—";
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  if (measure.unit === "money") return money(Math.round(value));
  if (measure.unit === "percent") return `${value.toFixed(1)}%`;
  if (measure.unit === "days") return `${value.toFixed(1)} days`;
  return String(Math.round(value));
}

/* ------------------------------ time series ------------------------------ */

export interface SeriesPoint { label: string; value: number; key: string }

/** Monthly series for one measure, oldest first, computed from the records. */
export function monthlySeries(measureId: string, months: number, context: QueryContext): SeriesPoint[] {
  const measure = measureById(measureId);
  if (!measure || measure.unavailable) return [];
  const out: SeriesPoint[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const start = new Date(context.now.getFullYear(), context.now.getMonth() - back, 1);
    const end = new Date(context.now.getFullYear(), context.now.getMonth() - back + 1, 1);
    const inMonth = context.records.filter((record) => {
      const raw = record.at ?? record.createdAt;
      const date = new Date(raw);
      return !Number.isNaN(date.getTime()) && date >= start && date < end;
    });
    const value = aggregate(measure, inMonth, { ...context, records: inMonth });
    out.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS[start.getMonth()]}`,
      value: value ?? 0,
    });
  }
  return out;
}

/* ------------------------------ anomalies ------------------------------ */

export interface Anomaly {
  measureId: string;
  measureName: string;
  point: SeriesPoint;
  mean: number;
  deviation: number;
  direction: "above" | "below";
  explanation: string;
}

/**
 * A point is reported when it is more than two standard deviations from the
 * mean of the other points and there are at least four points to compare. With
 * fewer points nothing is claimed, because nothing can be.
 */
export function anomalies(measureIds: string[], months: number, context: QueryContext): { found: Anomaly[]; tooFewPoints: string[] } {
  const found: Anomaly[] = [];
  const tooFewPoints: string[] = [];
  for (const id of measureIds) {
    const measure = measureById(id);
    if (!measure || measure.unavailable) continue;
    const series = monthlySeries(id, months, context);
    const nonZero = series.filter((point) => point.value !== 0);
    if (nonZero.length < 4) {
      tooFewPoints.push(measure.name);
      continue;
    }
    const values = series.map((point) => point.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) continue;
    for (const point of series) {
      const deviation = (point.value - mean) / sd;
      if (Math.abs(deviation) > 2) {
        found.push({
          measureId: id,
          measureName: measure.name,
          point,
          mean,
          deviation,
          direction: deviation > 0 ? "above" : "below",
          explanation: `${point.label} is ${Math.abs(deviation).toFixed(1)} standard deviations ${deviation > 0 ? "above" : "below"} the ${months}-month mean. This is an arithmetic observation on ${measure.collection} records, not a cause.`,
        });
      }
    }
  }
  return { found, tooFewPoints };
}

/* ------------------------------ forecast ------------------------------ */

export interface Forecast {
  measureId: string;
  history: SeriesPoint[];
  projection: { label: string; value: number; low: number; high: number }[];
  slopePerMonth: number;
  intercept: number;
  residualSd: number;
  /** Mean absolute percentage error of a backtest on the history. */
  mape: number | null;
  usable: boolean;
  reason?: string;
}

export function forecast(measureId: string, historyMonths: number, aheadMonths: number, context: QueryContext, adjustmentPercent = 0): Forecast {
  const history = monthlySeries(measureId, historyMonths, context);
  const points = history.map((point, index) => ({ x: index, y: point.value }));
  const usable = points.filter((point) => point.y !== 0).length >= 3;
  if (!usable) {
    return {
      measureId, history, projection: [], slopePerMonth: 0, intercept: 0, residualSd: 0, mape: null, usable: false,
      reason: `Only ${points.filter((point) => point.y !== 0).length} month${points.filter((point) => point.y !== 0).length === 1 ? "" : "s"} of this measure have any value in the workspace. A trend needs at least three, so no projection is drawn rather than a line through one point.`,
    };
  }
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) || 1;
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((point) => point.y - (intercept + slope * point.x));
  const residualSd = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / n);

  const adjusted = slope * (1 + adjustmentPercent / 100);
  const projection: Forecast["projection"] = [];
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let ahead = 1; ahead <= aheadMonths; ahead += 1) {
    const x = n - 1 + ahead;
    const centre = Math.max(0, intercept + adjusted * x);
    const widening = residualSd * (1 + ahead * 0.25);
    projection.push({
      label: MONTH_LABELS[new Date(context.now.getFullYear(), context.now.getMonth() + ahead, 1).getMonth()],
      value: centre,
      low: Math.max(0, centre - widening),
      high: centre + widening,
    });
  }

  let mape: number | null = null;
  if (n >= 5) {
    const trainCount = n - 2;
    const train = points.slice(0, trainCount);
    const trainMeanX = train.reduce((sum, point) => sum + point.x, 0) / train.length;
    const trainMeanY = train.reduce((sum, point) => sum + point.y, 0) / train.length;
    const trainDenominator = train.reduce((sum, point) => sum + (point.x - trainMeanX) ** 2, 0) || 1;
    const trainSlope = train.reduce((sum, point) => sum + (point.x - trainMeanX) * (point.y - trainMeanY), 0) / trainDenominator;
    const trainIntercept = trainMeanY - trainSlope * trainMeanX;
    const tested = points.slice(trainCount).filter((point) => point.y !== 0);
    if (tested.length > 0) {
      mape = (tested.reduce((sum, point) => sum + Math.abs((point.y - (trainIntercept + trainSlope * point.x)) / point.y), 0) / tested.length) * 100;
    }
  }

  return { measureId, history, projection, slopePerMonth: adjusted, intercept, residualSd, mape, usable: true };
}

/* ------------------------------ data quality ------------------------------ */

export interface QualityCheck {
  id: string;
  label: string;
  failing: Rec[];
  detail: string;
}

export function qualityChecks(collection: string, records: Rec[], now: Date): QualityCheck[] {
  const rows = records.filter((record) => record.collection === collection);
  const byId = new Set(records.map((record) => record.id));
  return [
    {
      id: "owner", label: "Every record has an owner",
      failing: rows.filter((record) => !record.ownerName.trim()),
      detail: "A measure grouped by owner attributes an ownerless record to a blank row.",
    },
    {
      id: "amount", label: "Money records carry an amount",
      failing: rows.filter((record) => ["invoices", "bills", "quotes", "orders", "deals", "expenses"].includes(collection) && record.amountMinor === undefined),
      detail: "A record with no amount contributes nothing to a sum, which silently understates the total.",
    },
    {
      id: "parent", label: "Links point at a record that exists",
      failing: rows.filter((record) => record.parentId && !byId.has(record.parentId)),
      detail: "A dangling link makes a dimension resolve to Unattributed.",
    },
    {
      id: "future", label: "Dates are not in the future",
      failing: rows.filter((record) => record.at && new Date(record.at) > now),
      detail: "A future-dated record lands in a month that has not happened, which distorts a trend.",
    },
  ];
}

/* ------------------------------ joins ------------------------------ */

export interface JoinCheck {
  from: string;
  to: string;
  key: string;
  matched: number;
  unmatched: number;
  /** Highest number of right-hand rows for one left-hand row. */
  maxFanOut: number;
  fanOut: boolean;
  /** Sum before and after the join, to show the inflation a fan-out causes. */
  sumBefore: number;
  sumAfter: number;
}

export function joinCheck(fromCollection: string, toCollection: string, key: string, records: Rec[]): JoinCheck {
  const left = records.filter((record) => record.collection === fromCollection);
  const right = records.filter((record) => record.collection === toCollection);
  let matched = 0;
  let maxFanOut = 0;
  let sumAfter = 0;
  for (const row of left) {
    const needle = String(row.fields[key] ?? row.parentId ?? "");
    const hits = right.filter((candidate) => candidate.id === needle || String(candidate.fields[key] ?? "") === row.id || candidate.parentId === row.id);
    if (hits.length > 0) matched += 1;
    maxFanOut = Math.max(maxFanOut, hits.length);
    sumAfter += (row.amountMinor ?? 0) * Math.max(1, hits.length);
  }
  const sumBefore = left.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
  return {
    from: fromCollection, to: toCollection, key,
    matched, unmatched: left.length - matched,
    maxFanOut, fanOut: maxFanOut > 1,
    sumBefore, sumAfter,
  };
}

/* ------------------------------ provenance ------------------------------ */

export type Provenance = "posted" | "human" | "agent" | "unknown";

const POSTED_COLLECTIONS = ["invoices", "journals", "bills", "expenses", "orders", "payrollRuns"];

/**
 * Where a figure came from, decided from the records that produced it:
 * a money record already in the books is posted, anything else a person in the
 * workspace entered is human, and a figure with no source or one too old to
 * trust is unknown. Provenance never carries status.
 */
export function provenanceFor(
  measure: MeasureDef | undefined,
  total: number | null | undefined,
  asOf: string | undefined,
  now: Date,
  staleAfterDays = 45,
): Provenance {
  if (!measure || measure.unavailable || total === null || total === undefined) return "unknown";
  if (!asOf) return "unknown";
  const age = (now.getTime() - new Date(asOf).getTime()) / 86_400_000;
  if (!Number.isFinite(age) || age > staleAfterDays) return "unknown";
  return POSTED_COLLECTIONS.includes(measure.collection) ? "posted" : "human";
}
