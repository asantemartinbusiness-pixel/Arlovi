import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Plus, Save, X } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, Empty, Field, Grid, LineChart, Notice, Pill, Properties, Row,
  Segmented, Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { Rec } from "@/domain/types";
import { routeForRecord } from "@/platform/attention";
import type { ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import {
  AGG_LABELS, NO_VALUE_OPS, displayKey, OPS_BY_TYPE, RANGE_LABELS, exploreCsv, fieldValue, groupKey, inferSchema,
  numericFields, readExplore, runExplore,
  type Agg, type ExploreFilter, type ExploreOp, type ExploreResult, type ExploreSpec, type ExploreViz, type FieldInfo, type RangePreset,
} from "./explore";
import { ANALYTICS_COLLECTIONS } from "./metrics";

/* ====================================================================== *
 * ARL-ANALYTICS-004 — a saved query report.
 *
 * Collection, measure, grouping, date range and filters are chosen here and
 * recomputed live from this workspace's records. Every figure states how it
 * was computed and opens the records behind it.
 * ====================================================================== */

export const EXPLORE_SOURCE_LABEL = "This workspace's records";

export function isQueryReport(record: Rec | undefined): boolean {
  return Boolean(record && record.collection === "reports" && readExplore((record.body as { explore?: unknown } | undefined)?.explore));
}

function specOf(record: Rec): ExploreSpec {
  return readExplore((record.body as { explore?: unknown } | undefined)?.explore)!;
}

/** Formats a figure in the unit the query produced. */
export function formatExplore(value: number | null, unit: ExploreResult["unit"], money: (minor: number | undefined) => string): string {
  if (value === null || Number.isNaN(value)) return "No value";
  if (unit === "money") return money(Math.round(value));
  if (unit === "count") return value.toLocaleString("en-GB");
  return Number.isInteger(value) ? value.toLocaleString("en-GB") : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function useExploreDraft(record: Rec) {
  const stored = specOf(record);
  const [draft, setDraft] = useState<ExploreSpec>(stored);
  const [dirty, setDirty] = useState(false);
  const [base, setBase] = useState(record.revision);
  useEffect(() => {
    if (!dirty && base !== record.revision) {
      setDraft(specOf(record));
      setBase(record.revision);
    }
  }, [record, dirty, base]);
  return {
    draft,
    dirty,
    change(patch: Partial<ExploreSpec>) { setDraft((current) => ({ ...current, ...patch })); setDirty(true); },
    reset() { setDraft(specOf(record)); setDirty(false); },
    saved(revision: number) { setDirty(false); setBase(revision); },
  };
}

export function ExploreReport({ context, record }: { context: ScreenContext; record: Rec }) {
  const state = useExploreDraft(record);
  const spec = state.draft;
  const records = useCollection(spec.collection);
  const schema = useMemo(() => inferSchema(records, spec.collection), [records, spec.collection]);
  const result = useMemo(() => runExplore(spec, records, context.now), [spec, records, context.now]);
  const [drill, setDrill] = useState<string | null>(null);
  const format = (value: number | null) => formatExplore(value, result.unit, context.money);

  async function save() {
    const body = (record.body ?? {}) as Record<string, unknown>;
    const updated = await context.mutate.patch(record.id, {
      body: { ...body, blocks: Array.isArray(body.blocks) ? body.blocks : [], explore: spec },
      fields: { ...record.fields, kind: "query", queryCollection: spec.collection },
      summary: `${result.formula}. ${EXPLORE_SOURCE_LABEL}.`,
    }, { expectRevision: record.revision, event: `Query report saved: ${result.formula}` });
    if (updated) {
      state.saved(updated.revision);
      context.toast("Report saved", `${record.title} now stores ${result.formula}. It is recomputed each time it opens.`);
    }
  }

  function exportCsv() {
    const text = exploreCsv(spec, records, context.now, format);
    download(`${record.title.replace(/\s+/g, "-").toLowerCase()}.csv`, text);
    context.toast("Exported", "The CSV was written by this browser from this workspace's records. Nothing was uploaded.");
  }

  const header = (
    <Row gap={2} wrap>
      <Pill tone="info" dot>Source: {EXPLORE_SOURCE_LABEL}</Pill>
      <Pill tone={record.status === "published" ? "success" : "neutral"} dot>{record.status}</Pill>
      {state.dirty ? <Pill tone="warning" dot>Unsaved changes</Pill> : <Pill tone="success" dot>Saved</Pill>}
      <span className="ds-grow" />
      {state.dirty && <Button variant="ghost" onClick={() => state.reset()}>Discard changes</Button>}
      <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv} disabled={!context.can("export_data")} title={context.can("export_data") ? undefined : "This role view cannot export data"}>Export CSV</Button>
      <Button variant="primary" icon={<Save size={15} />} disabled={!state.dirty} onClick={() => void save()}>Save report</Button>
    </Row>
  );

  if (context.tab === "Data") {
    const included = new Set(result.includedIds);
    const rows = records.filter((item) => included.has(item.id));
    return (
      <Stack gap={4} className="an-explore-page">
        {header}
        <RecordsCard context={context} title="Every record behind this report" subtitle={`${rows.length} of ${result.inCollection} ${spec.collection} records pass the range and filters`} rows={rows} spec={spec} result={result} />
      </Stack>
    );
  }

  if (context.tab === "Layout") {
    return (
      <Stack gap={4} className="an-explore-page">
        {header}
        <Grid>
          <Card span={6} eyebrow="PRESENTATION" title="How the result is shown" prov="human">
            <Stack gap={3}>
              <Field label="Chart">
                <Select aria-label="Chart" value={spec.viz} onChange={(event) => state.change({ viz: event.target.value as ExploreViz })}>
                  <option value="bar">Bar chart</option>
                  <option value="line">Line chart</option>
                  <option value="table">Table only</option>
                </Select>
              </Field>
              <Field label="Order groups by">
                <Select aria-label="Order groups by" value={spec.sort} onChange={(event) => state.change({ sort: event.target.value as ExploreSpec["sort"] })}>
                  <option value="value">Value, largest first</option>
                  <option value="label">Label</option>
                </Select>
              </Field>
              <Field label="Groups shown" hint="Groups beyond this are still in the CSV and the total; the page says how many were left out.">
                <TextInput aria-label="Groups shown" type="number" min={1} max={100} value={String(spec.limit)} onChange={(event) => state.change({ limit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} />
              </Field>
            </Stack>
          </Card>
          <Card span={6} eyebrow="PREVIEW" title="Result" prov="posted">
            <ResultChart result={result} format={format} title={record.title} />
          </Card>
        </Grid>
      </Stack>
    );
  }

  /* Content */
  const drillRows = drill ? records.filter((item) => result.includedIds.includes(item.id) && groupKey(item, spec) === drill) : [];
  return (
    <Stack gap={4} className="an-explore-page">
      {header}
      <div className="an-explore">
        <Card eyebrow="QUERY" title="Build the report" subtitle="Each change recomputes the result below" prov="human" className="an-explore-controls">
          <QueryControls spec={spec} schema={schema} onChange={(patch) => { state.change(patch); setDrill(null); }} />
        </Card>

        <Stack gap={4} className="an-explore-result">
          {result.problems.length > 0 && (
            <Notice tone="warning" title="Check the query">{result.problems.join(" ")}</Notice>
          )}
          <StatRow>
            <Stat prov="posted" label={spec.agg === "count" ? "Records" : `${AGG_LABELS[spec.agg]} ${schema.find((field) => field.key === spec.field)?.label.toLowerCase() ?? ""}`.trim()} value={format(result.total)} meta={`${result.included} record${result.included === 1 ? "" : "s"} included`} />
            <Stat prov="posted" label="In the collection" value={String(result.inCollection)} meta={spec.collection} />
            <Stat prov="posted" label="Excluded" value={String(result.inCollection - result.included)} meta={`${result.outsideRange + result.withoutDate} by date, ${result.removedByFilters} by filters`} />
          </StatRow>

          <Card eyebrow="RESULT" title={result.formula} subtitle={`${RANGE_LABELS[spec.range.preset]} · ${EXPLORE_SOURCE_LABEL}`} prov="posted"
            actions={<Segmented label="Chart type" value={spec.viz} onChange={(value) => state.change({ viz: value })} options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "table", label: "Table" }]} />}
          >
            {result.included === 0 ? (
              <Empty title="No record matches">
                {result.inCollection === 0 ? `There are no ${spec.collection} records in this workspace yet.` : "Widen the date range or remove a filter. The counts above say where the records were excluded."}
              </Empty>
            ) : (
              <Stack gap={4}>
                <ResultChart result={result} format={format} title={result.formula} />
                <ResultTable result={result} format={format} drill={drill} onDrill={setDrill} />
              </Stack>
            )}
          </Card>

          {drill && (
            <RecordsCard
              context={context}
              title={`Records in “${displayKey(drill, spec)}”`}
              subtitle={`${drillRows.length} record${drillRows.length === 1 ? "" : "s"} produce ${format(result.rows.find((row) => row.key === drill)?.value ?? null)}`}
              rows={drillRows}
              spec={spec}
              result={result}
              onClose={() => setDrill(null)}
            />
          )}

          <Card eyebrow="CALCULATION" title="How this is computed" prov="posted" className="an-explore-how">
            <Stack gap={3}>
              <Properties rows={[
                { label: "Formula", value: <code>{result.formula}</code> },
                { label: "Source", value: `${EXPLORE_SOURCE_LABEL} (${spec.collection}), read in this browser` },
                { label: "Records included", value: `${result.included} of ${result.inCollection}` },
                ...(result.window.from || result.window.to ? [{ label: "Window", value: `${result.window.from ? context.date(result.window.from) : "start"} to ${result.window.to ? context.date(result.window.to) : "now"}` }] : []),
                ...(spec.agg !== "count" ? [{ label: "Without a value", value: `${result.missingValue} left out, not treated as zero` }] : []),
              ]} />
              <ol className="an-explore-steps">
                {result.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <p className="an-cite">Recomputed {context.dateTime(context.now)}. These are the records held in this workspace, not a live feed from another system.</p>
            </Stack>
          </Card>
        </Stack>
      </div>
    </Stack>
  );
}

/* ------------------------------ controls ------------------------------ */

export function QueryControls({ spec, schema, onChange }: { spec: ExploreSpec; schema: FieldInfo[]; onChange: (patch: Partial<ExploreSpec>) => void }) {
  const numeric = numericFields(schema);
  const dates = schema.filter((field) => field.type === "date");
  const groupable = schema.filter((field) => field.type === "text" && field.key !== "title");
  return (
    <Stack gap={3}>
      <Field label="Collection" hint={`${schema.find((field) => field.key === "status")?.total ?? 0} records; fields are read from them`}>
        <Select aria-label="Collection" value={spec.collection} onChange={(event) => onChange({ collection: event.target.value, field: undefined, agg: "count", groupBy: "status", filters: [] })}>
          {ANALYTICS_COLLECTIONS.filter((name) => name !== "accounts").map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Row gap={2} wrap className="an-explore-pair">
        <Field label="Measure">
          <Select aria-label="Measure" value={spec.agg} onChange={(event) => {
            const agg = event.target.value as Agg;
            onChange({ agg, field: agg === "count" ? undefined : spec.field ?? numeric[0]?.key });
          }}>
            {(Object.keys(AGG_LABELS) as Agg[]).map((agg) => <option key={agg} value={agg} disabled={agg !== "count" && numeric.length === 0}>{AGG_LABELS[agg]}</option>)}
          </Select>
        </Field>
        {spec.agg !== "count" && (
          <Field label="Field">
            <Select aria-label="Measure field" value={spec.field ?? ""} onChange={(event) => onChange({ field: event.target.value })}>
              {numeric.length === 0 && <option value="">No number field</option>}
              {numeric.map((field) => <option key={field.key} value={field.key}>{field.label}{field.present < field.total ? ` (${field.present}/${field.total})` : ""}</option>)}
            </Select>
          </Field>
        )}
      </Row>
      <Field label="Group by">
        <Select aria-label="Group by" value={spec.groupBy} onChange={(event) => onChange({ groupBy: event.target.value })}>
          <option value="none">No grouping (one figure)</option>
          <option value="month">Month</option>
          <option value="week">Week</option>
          {groupable.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
        </Select>
      </Field>
      <Row gap={2} wrap className="an-explore-pair">
        <Field label="Date field">
          <Select aria-label="Date field" value={spec.dateField} onChange={(event) => onChange({ dateField: event.target.value })}>
            {dates.length === 0 && <option value="at">Record date</option>}
            {dates.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </Select>
        </Field>
        <Field label="Date range">
          <Select aria-label="Date range" value={spec.range.preset} onChange={(event) => onChange({ range: { ...spec.range, preset: event.target.value as RangePreset } })}>
            {(Object.keys(RANGE_LABELS) as RangePreset[]).map((preset) => <option key={preset} value={preset}>{RANGE_LABELS[preset]}</option>)}
          </Select>
        </Field>
      </Row>
      {spec.range.preset === "custom" && (
        <Row gap={2} wrap className="an-explore-pair">
          <Field label="From"><TextInput aria-label="From" type="date" value={spec.range.from ?? ""} onChange={(event) => onChange({ range: { ...spec.range, from: event.target.value } })} /></Field>
          <Field label="To"><TextInput aria-label="To" type="date" value={spec.range.to ?? ""} onChange={(event) => onChange({ range: { ...spec.range, to: event.target.value } })} /></Field>
        </Row>
      )}
      <FilterEditor filters={spec.filters} schema={schema} onChange={(filters) => onChange({ filters })} />
    </Stack>
  );
}

function FilterEditor({ filters, schema, onChange }: { filters: ExploreFilter[]; schema: FieldInfo[]; onChange: (next: ExploreFilter[]) => void }) {
  const typeOf = (key: string) => schema.find((field) => field.key === key)?.type ?? "text";
  const patch = (id: string, change: Partial<ExploreFilter>) => onChange(filters.map((filter) => (filter.id === id ? { ...filter, ...change } : filter)));
  return (
    <fieldset className="an-explore-filters">
      <legend className="ds-field-label">Filters</legend>
      <Stack gap={2}>
        {filters.length === 0 && <p className="ds-subtle" style={{ margin: 0 }}>No filter. Every record in the range is included.</p>}
        {filters.map((filter, index) => {
          const field = schema.find((item) => item.key === filter.field);
          const type = typeOf(filter.field);
          const listId = `an-filter-values-${filter.id}`;
          return (
            <div key={filter.id} className="an-explore-filter" role="group" aria-label={`Filter ${index + 1}`}>
              <Select aria-label={`Filter ${index + 1} field`} value={filter.field} onChange={(event) => patch(filter.id, { field: event.target.value, op: OPS_BY_TYPE[typeOf(event.target.value)][0], value: "" })}>
                {schema.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </Select>
              <Select aria-label={`Filter ${index + 1} test`} value={filter.op} onChange={(event) => patch(filter.id, { op: event.target.value as ExploreOp })}>
                {OPS_BY_TYPE[type].map((op) => <option key={op} value={op}>{op}</option>)}
              </Select>
              {!NO_VALUE_OPS.includes(filter.op) && (
                <>
                  <TextInput
                    aria-label={`Filter ${index + 1} value`}
                    type={type === "date" ? "date" : type === "text" ? "text" : "number"}
                    placeholder={type === "money" ? "Amount, e.g. 250" : undefined}
                    value={filter.value}
                    list={type === "text" ? listId : undefined}
                    onChange={(event) => patch(filter.id, { value: event.target.value })}
                  />
                  {type === "text" && field && (
                    <datalist id={listId}>{field.values.map((value) => <option key={value} value={value} />)}</datalist>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" iconOnly aria-label={`Remove filter ${index + 1}`} onClick={() => onChange(filters.filter((item) => item.id !== filter.id))}><X size={14} /></Button>
            </div>
          );
        })}
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          disabled={schema.length === 0}
          onClick={() => {
            const first = schema.find((item) => item.key === "status") ?? schema[0];
            onChange([...filters, { id: `f${Date.now().toString(36)}${filters.length}`, field: first.key, op: OPS_BY_TYPE[first.type][0], value: "" }]);
          }}
        >
          Add a filter
        </Button>
      </Stack>
    </fieldset>
  );
}

/* ------------------------------ result ------------------------------ */

function chartLabel(key: string): string {
  return key.length > 14 ? `${key.slice(0, 13)}…` : key;
}

function ResultChart({ result, format, title }: { result: ExploreResult; format: (value: number | null) => string; title: string }) {
  if (result.spec.viz === "table" || result.rows.length === 0) return null;
  const toChart = (value: number | null) => (result.unit === "money" ? Math.round((value ?? 0)) : value ?? 0);
  const series = [{ name: title, points: result.rows.map((row) => ({ label: chartLabel(displayKey(row.key, result.spec)), value: toChart(row.value) })) }];
  const axis = (value: number) => format(value);
  return result.spec.viz === "line" && result.rows.length > 1
    ? <LineChart series={series} title={title} format={axis} height={220} />
    : <BarChart series={series} title={title} format={axis} height={220} />;
}

function ResultTable({ result, format, drill, onDrill }: { result: ExploreResult; format: (value: number | null) => string; drill: string | null; onDrill: (key: string | null) => void }) {
  return (
    <div className="an-explore-table" role="region" aria-label="Result table" tabIndex={0}>
      <table className="ds-table">
        <thead>
          <tr><th scope="col">Group</th><th scope="col" style={{ textAlign: "end" }}>Value</th><th scope="col" style={{ textAlign: "end" }}>Records</th><th scope="col"><span className="ds-sr-only">Drill down</span></th></tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.key} data-selected={drill === row.key ? "true" : undefined}>
              <th scope="row">{displayKey(row.key, result.spec)}</th>
              <td style={{ textAlign: "end" }} className="ds-num">{format(row.value)}</td>
              <td style={{ textAlign: "end" }} className="ds-num">{row.count}</td>
              <td style={{ textAlign: "end" }}>
                <Button size="sm" variant="ghost" aria-pressed={drill === row.key} onClick={() => onDrill(drill === row.key ? null : row.key)}>
                  {drill === row.key ? "Hide records" : `Show ${row.count} record${row.count === 1 ? "" : "s"}`}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row">Total</th><td style={{ textAlign: "end" }} className="ds-num">{format(result.total)}</td><td style={{ textAlign: "end" }} className="ds-num">{result.included}</td><td /></tr>
        </tfoot>
      </table>
      {result.hiddenGroups > 0 && <p className="an-cite">{result.hiddenGroups} more group{result.hiddenGroups === 1 ? " is" : "s are"} included in the total and in the CSV, but not drawn.</p>}
    </div>
  );
}

function RecordsCard({ context, title, subtitle, rows, spec, result, onClose }: {
  context: ScreenContext; title: string; subtitle: string; rows: Rec[]; spec: ExploreSpec; result: ExploreResult; onClose?: () => void;
}) {
  const valueOf = (row: Rec) => {
    if (!spec.field || spec.agg === "count") return undefined;
    const raw = fieldValue(row, spec.field);
    return typeof raw === "number" ? raw : raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  };
  return (
    <Card eyebrow="DRILLDOWN" title={title} subtitle={subtitle} prov="posted" flush
      actions={onClose ? <Button variant="ghost" size="sm" onClick={onClose}>Close</Button> : undefined}
    >
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={title}
        empty={<Empty title="No record">Nothing passes the range and filters.</Empty>}
        columns={[
          { key: "title", header: "Record", primary: true, cell: (row) => {
            const to = routeForRecord(row, context.org.slug);
            return to
              ? <a href={to} onClick={(event) => { event.preventDefault(); context.navigate(to); }} className="an-explore-link">{row.title}<ExternalLink size={12} aria-hidden="true" /></a>
              : <span title="No screen in this workspace opens this record type">{row.title}</span>;
          }, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.status} ${row.ownerName}` },
          { key: "group", header: "Group", cell: (row) => displayKey(groupKey(row, spec), spec), sortValue: (row) => groupKey(row, spec) },
          { key: "status", header: "Status", cell: (row) => <Pill dot>{row.status}</Pill>, sortValue: (row) => row.status, hideBelow: 700 },
          ...(spec.agg !== "count" && spec.field ? [{
            key: "value", header: "Value", align: "end" as const,
            cell: (row: Rec) => { const value = valueOf(row); return value === undefined ? <span className="ds-subtle">no value</span> : formatExplore(value, result.unit, context.money); },
            sortValue: (row: Rec) => valueOf(row) ?? -Infinity,
          }] : []),
          { key: "date", header: "Date", align: "end", cell: (row) => { const raw = fieldValue(row, spec.dateField); return typeof raw === "string" ? context.date(raw) : "—"; }, sortValue: (row) => String(fieldValue(row, spec.dateField) ?? ""), hideBelow: 600 },
        ]}
      />
    </Card>
  );
}

/* ------------------------------ create ------------------------------ */

export function newQueryBody(collection: string, records: Rec[]): { explore: ExploreSpec; blocks: [] } {
  const schema = inferSchema(records, collection);
  const hasAmount = schema.some((field) => field.key === "amountMinor");
  return {
    blocks: [],
    explore: {
      collection,
      agg: hasAmount ? "sum" : "count",
      field: hasAmount ? "amountMinor" : undefined,
      groupBy: schema.some((field) => field.key === "status") ? "status" : "none",
      dateField: schema.some((field) => field.key === "at") ? "at" : "createdAt",
      range: { preset: "all" },
      filters: [],
      viz: "bar",
      sort: "value",
      limit: 12,
    },
  };
}
