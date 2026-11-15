import { useMemo, useState } from "react";
import { Database, Info, Layers, Table2 } from "lucide-react";
import {
  BarChart, Button, DataGrid, DonutChart, Empty, Field, LineChart, Notice, Pill,
  Properties, Row, Select, Stack, Stat, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  ANALYTICS_COLLECTIONS, DIMENSIONS, FILTER_OPS_BY_TYPE, MEASURES, dimensionById,
  formatMeasure, lineage, measureById, monthlySeries, runQuery,
  type FilterOp, type MeasureDef, type QueryContext, type QueryFilter, type QueryResult, type QuerySpec,
} from "./metrics";

export type Viz = "stat" | "bar" | "line" | "donut" | "table";

export const VIZ_LABELS: Record<Viz, string> = {
  stat: "Single figure",
  bar: "Bars by dimension",
  line: "Monthly line",
  donut: "Share by dimension",
  table: "Table by dimension",
};

/** All the collections the measures can read, each one an indexed query. */
export function useAnalytics(): { records: Rec[]; context: QueryContext } {
  const data = useCollections(ANALYTICS_COLLECTIONS);
  const { now, org } = useWorkspace();
  return useMemo(() => {
    const records = ANALYTICS_COLLECTIONS.flatMap((name) => data[name] ?? []);
    const byId = new Map(records.map((record) => [record.id, record]));
    return { records, context: { records, byId, now, locale: org.locale } };
  }, [data, now, org.locale]);
}

export function useQuery(spec: QuerySpec): QueryResult {
  const { context } = useAnalytics();
  return useMemo(() => runQuery(spec, context), [spec, context]);
}

/* ------------------------------ figures ------------------------------ */

export function Figure({
  measure, value, context, onInspect,
}: {
  measure: MeasureDef | undefined;
  value: number | null;
  context: ScreenContext;
  onInspect?: () => void;
}) {
  if (!measure) return <span className="ds-subtle">Unknown measure</span>;
  const unavailable = measure.unavailable !== undefined || value === null;
  return (
    <div>
      <span className="an-figure" data-unavailable={unavailable ? "true" : undefined}>
        {unavailable ? "Unavailable" : formatMeasure(measure, value, context.money)}
      </span>
      {unavailable && (
        <p className="ds-subtle" style={{ fontSize: "var(--text-xs)", marginBlock: 4 }}>
          {measure.unavailable ?? `No ${measure.collection} record contributes to this measure in ${context.org.shortName}.`}
        </p>
      )}
      {onInspect && (
        <Button size="sm" variant="ghost" onClick={onInspect}>Where this comes from</Button>
      )}
    </div>
  );
}

export function FreshnessLine({ result, context }: { result: QueryResult; context: ScreenContext }) {
  const age = freshness(result.asOf, context.now, 7);
  return (
    <p className="an-tile-source">
      {result.recordCount} record{result.recordCount === 1 ? "" : "s"} from {result.sources.length ? result.sources.join(", ") : "no collection"}
      {" · "}
      {age.known ? `newest ${context.relative(result.asOf)} (${age.days} day${age.days === 1 ? "" : "s"} old)` : "age unknown"}
      {age.stale && age.known ? " · stale" : ""}
    </p>
  );
}

/* ------------------------------ one tile ------------------------------ */

export function MeasureView({
  spec, viz, context, title, onInspect, months = 6,
}: {
  spec: QuerySpec;
  viz: Viz;
  context: ScreenContext;
  title: string;
  onInspect?: (measureId: string) => void;
  months?: number;
}) {
  const { context: queryContext } = useAnalytics();
  const result = useMemo(() => runQuery(spec, queryContext), [spec, queryContext]);
  const measure = result.measures[0];
  const value = result.totals[0] ?? null;

  if (!measure) return <Empty title="No measure chosen">Pick a measure to compute.</Empty>;

  if (measure.unavailable) {
    return (
      <Stack gap={2}>
        <Figure measure={measure} value={null} context={context} onInspect={onInspect ? () => onInspect(measure.id) : undefined} />
        <Notice tone="warning" title="This figure has no source here">{measure.unavailable}</Notice>
      </Stack>
    );
  }

  if (viz === "stat") {
    return (
      <Stack gap={2}>
        <Figure measure={measure} value={value} context={context} onInspect={onInspect ? () => onInspect(measure.id) : undefined} />
        <FreshnessLine result={result} context={context} />
      </Stack>
    );
  }

  if (viz === "line") {
    const series = monthlySeries(measure.id, months, queryContext);
    if (series.every((point) => point.value === 0)) {
      return (
        <Stack gap={2}>
          <Notice tone="warning" title="No month in range has a value">
            {measure.name} is computed from {measure.collection}; no record in the last {months} months contributes, so there is no line to draw.
          </Notice>
          <FreshnessLine result={result} context={context} />
        </Stack>
      );
    }
    return (
      <Stack gap={2}>
        <LineChart
          title={title}
          height={200}
          series={[{ name: measure.name, points: series.map((point) => ({ label: point.label, value: point.value })) }]}
          format={(input) => formatMeasure(measure, input, context.money)}
          footer={`${measure.formula}. Computed from ${measure.collection} records in this workspace.`}
        />
        <FreshnessLine result={result} context={context} />
      </Stack>
    );
  }

  if (result.rows.length === 0) {
    return (
      <Stack gap={2}>
        <Empty title="No rows" icon={<Layers size={20} />}>
          No {measure.collection} record matches the filters, so there is nothing to group.
        </Empty>
        <FreshnessLine result={result} context={context} />
      </Stack>
    );
  }

  if (viz === "donut") {
    return (
      <Stack gap={2}>
        <DonutChart
          title={title}
          points={result.rows.map((row) => ({ label: row.key, value: row.values[0] ?? 0 }))}
          format={(input) => formatMeasure(measure, input, context.money)}
        />
        <FreshnessLine result={result} context={context} />
      </Stack>
    );
  }

  if (viz === "bar") {
    return (
      <Stack gap={2}>
        <BarChart
          title={title}
          height={200}
          series={[{ name: measure.name, points: result.rows.map((row) => ({ label: row.key, value: row.values[0] ?? 0 })) }]}
          format={(input) => formatMeasure(measure, input, context.money)}
          footer={`${measure.formula}, grouped by ${dimensionById(spec.dimensionId)?.name ?? "nothing"}.`}
        />
        <FreshnessLine result={result} context={context} />
      </Stack>
    );
  }

  return (
    <Stack gap={2}>
      <DataGrid
        rows={result.rows.map((row, index) => ({ ...row, id: `${row.key}-${index}` }))}
        rowId={(row) => row.id}
        label={title}
        filterable={false}
        columns={[
          { key: "key", header: dimensionById(spec.dimensionId)?.name ?? "Group", primary: true, cell: (row) => row.key, sortValue: (row) => row.key },
          ...result.measures.map((item, index) => ({
            key: item.id,
            header: item.name,
            align: "end" as const,
            cell: (row: { values: (number | null)[] }) => formatMeasure(item, row.values[index], context.money),
            sortValue: (row: { values: (number | null)[] }) => row.values[index] ?? -1,
          })),
          { key: "records", header: "Records", align: "end", cell: (row) => String(row.recordIds.length) },
        ]}
        summary={`${result.rows.length} groups · ${result.recordCount} records`}
      />
      <FreshnessLine result={result} context={context} />
    </Stack>
  );
}

/* ------------------------------ pickers ------------------------------ */

export function MeasurePicker({
  value, onChange, label = "Measure", includeUnavailable = true,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  includeUnavailable?: boolean;
}) {
  const options = MEASURES.filter((measure) => includeUnavailable || !measure.unavailable);
  return (
    <Field label={label} hint="Every measure names the collection it is computed from.">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((measure) => (
          <option key={measure.id} value={measure.id}>
            {measure.name} ({measure.collection}){measure.unavailable ? " — unavailable here" : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function DimensionPicker({ value, onChange, label = "Grouped by", allowNone = true }: { value: string; onChange: (id: string) => void; label?: string; allowNone?: boolean }) {
  return (
    <Field label={label} hint="A dimension resolves from the record, so a record that cannot answer lands in a named catch-all.">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowNone && <option value="">Nothing — a single figure</option>}
        {DIMENSIONS.map((dimension) => <option key={dimension.id} value={dimension.id}>{dimension.name} ({dimension.type})</option>)}
      </Select>
    </Field>
  );
}

export function FilterRows({
  filters, onChange, context,
}: {
  filters: QueryFilter[];
  onChange: (next: QueryFilter[]) => void;
  context: ScreenContext;
}) {
  const { context: queryContext } = useAnalytics();
  const valuesFor = (dimensionId: string) => {
    const dimension = dimensionById(dimensionId);
    if (!dimension) return [];
    return [...new Set(queryContext.records.map((record) => dimension.of(record, queryContext)))].sort().slice(0, 40);
  };

  return (
    <Stack gap={3}>
      {filters.length === 0 && <p className="ds-subtle">No filter. Every record a measure selects is included.</p>}
      {filters.map((filter, index) => {
        const dimension = dimensionById(filter.dimensionId);
        const ops: FilterOp[] = dimension ? FILTER_OPS_BY_TYPE[dimension.type] : ["is"];
        return (
          <Row key={filter.id} gap={2} wrap className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Field label="Field">
              <Select
                value={filter.dimensionId}
                onChange={(event) => onChange(filters.map((item, position) => (position === index ? { ...item, dimensionId: event.target.value, value: "" } : item)))}
              >
                {DIMENSIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Test">
              <Select
                value={filter.op}
                onChange={(event) => onChange(filters.map((item, position) => (position === index ? { ...item, op: event.target.value as FilterOp } : item)))}
              >
                {ops.map((op) => <option key={op} value={op}>{op}</option>)}
              </Select>
            </Field>
            <Field label="Value">
              {dimension && dimension.type !== "time" ? (
                <Select
                  value={filter.value}
                  onChange={(event) => onChange(filters.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))}
                >
                  <option value="">Choose a value</option>
                  {valuesFor(filter.dimensionId).map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
                </Select>
              ) : (
                <TextInput
                  type="date"
                  value={filter.value}
                  onChange={(event) => onChange(filters.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))}
                />
              )}
            </Field>
            <Button variant="ghost" onClick={() => onChange(filters.filter((_item, position) => position !== index))}>Remove</Button>
          </Row>
        );
      })}
      <Row gap={2}>
        <Button
          variant="secondary"
          onClick={() => onChange([...filters, { id: `f${filters.length + 1}-${Date.now().toString(36)}`, dimensionId: "status", op: "is", value: "" }])}
        >
          Add a filter
        </Button>
        <span className="ds-subtle" style={{ fontSize: "var(--text-xs)", alignSelf: "center" }}>
          Filters apply to every measure in the view, in {context.org.shortName} only.
        </span>
      </Row>
    </Stack>
  );
}

/* ------------------------------ lineage ------------------------------ */

export function MetricLineage({ measureId, context }: { measureId: string; context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const { measure, records } = lineage(measureId, queryContext);
  const [limit, setLimit] = useState(8);
  if (!measure) return <Empty title="Unknown measure" />;

  const asOf = records.map((record) => record.updatedAt ?? record.at ?? record.createdAt).sort().at(-1);
  const age = freshness(asOf, context.now, 7);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Measure", value: measure.name },
        { label: "Version", value: `v${measure.version}` },
        { label: "Owner", value: measure.owner },
        { label: "Unit", value: measure.unit },
        { label: "Formula", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{measure.formula}</code> },
      ]} />
      <p>{measure.description}</p>

      {measure.unavailable ? (
        <Notice tone="warning" title="Nothing feeds this measure">{measure.unavailable}</Notice>
      ) : (
        <>
          <div className="an-lineage">
            <div className="an-lineage-rail" />
            <div className="an-lineage-step">
              <strong>Collection</strong>
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{measure.collection} in {context.org.name}, held in this browser.</p>
            </div>
            <div className="an-lineage-rail" />
            <div className="an-lineage-step">
              <strong>Selection</strong>
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{measure.formula}</p>
            </div>
            <div className="an-lineage-rail" />
            <div className="an-lineage-step">
              <strong>Figure</strong>
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                {records.length} record{records.length === 1 ? "" : "s"} contribute · {age.known ? `newest ${context.date(asOf)}, ${age.days} day${age.days === 1 ? "" : "s"} old` : "no date recorded"}
              </p>
            </div>
          </div>

          <Stack gap={2}>
            <strong>The records behind the figure</strong>
            {records.length === 0 ? (
              <Empty title="No record contributes" icon={<Database size={20} />}>
                The measure resolves to zero, not to a guess.
              </Empty>
            ) : (
              <>
                {records.slice(0, limit).map((record) => (
                  <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <span className="ds-grow ds-truncate">{record.title}</span>
                    <Pill tone="neutral">{record.status}</Pill>
                    {record.amountMinor !== undefined && <span className="ds-num">{context.money(record.amountMinor)}</span>}
                    <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{context.date(record.at ?? record.createdAt)}</span>
                  </Row>
                ))}
                {records.length > limit && (
                  <Button variant="ghost" onClick={() => setLimit(limit + 20)}>Show {Math.min(20, records.length - limit)} more of {records.length}</Button>
                )}
              </>
            )}
          </Stack>
        </>
      )}

      <Notice tone="info" title="No figure on this screen comes from anywhere else">
        Every number is recomputed from the records above when the page renders. Nothing is cached, pre-aggregated or imported.
      </Notice>
    </Stack>
  );
}

export function MeasureSummaryGrid({ measureIds, context, onInspect }: { measureIds: string[]; context: ScreenContext; onInspect?: (id: string) => void }) {
  const { context: queryContext } = useAnalytics();
  const result = useMemo(() => runQuery({ measureIds, filters: [] }, queryContext), [measureIds, queryContext]);
  return (
    <>
      {result.measures.map((measure, index) => (
        <Stat
          key={measure.id}
          label={measure.name}
          value={measure.unavailable || result.totals[index] === null ? "Unavailable" : formatMeasure(measure, result.totals[index], context.money)}
          unavailable={Boolean(measure.unavailable) || result.totals[index] === null}
          meta={measure.unavailable ? "No source in this workspace" : `${measure.collection} · ${result.asOf ? context.relative(result.asOf) : "age unknown"}`}
          onClick={onInspect ? () => onInspect(measure.id) : undefined}
        />
      ))}
    </>
  );
}

export function UnavailableList({ context }: { context: ScreenContext }) {
  const missing = MEASURES.filter((measure) => measure.unavailable);
  return (
    <Stack gap={2}>
      {missing.map((measure) => (
        <div key={measure.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}><strong className="ds-grow">{measure.name}</strong><Pill tone="warning" dot>unavailable</Pill></Row>
          <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{measure.unavailable}</p>
        </div>
      ))}
      <Notice tone="info" title="What to do about these">
        Each one names what is missing. Recording the field on the records, or connecting the source in {context.org.shortName}'s connections, makes the measure resolve — until then the screens say unavailable rather than showing a number.
      </Notice>
    </Stack>
  );
}

export function measureOptions(): MeasureDef[] {
  return MEASURES;
}

export { measureById, Info, Table2 };
