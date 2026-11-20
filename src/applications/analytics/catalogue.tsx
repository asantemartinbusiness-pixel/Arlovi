import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Database, GitMerge, Ruler, Table2,
} from "lucide-react";
import {
  Button, Card, DataGrid, Empty, FactGrid, OverlaySummary, Field, Grid, KeyValueList, Meter, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, ModalActions, OverlayActions,
} from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, PROVIDER_CAPABILITIES } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useWorkspace } from "@/platform/workspace";
import { clockIso, freshness, wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  ANALYTICS_COLLECTIONS, DIMENSIONS, allMeasures, formatMeasure, joinCheck,
  measureById, provenanceFor, qualityChecks, runQuery, type MeasureDef,
} from "./metrics";
import { MetricLineage, UnavailableList, useAnalytics, useAnalyticsReady } from "./panels";
import { readDashboard } from "./dashboards";
import { readReport } from "./reports";

/* ====================================================================== *
 * ARL-ANALYTICS-005 — Dataset catalogue
 * ====================================================================== */

export interface DatasetRow {
  collection: string;
  records: Rec[];
  owner: string;
  asOf?: string;
  ageDays: number;
  known: boolean;
  stale: boolean;
  failing: number;
  measures: MeasureDef[];
  documented?: Rec;
  retired: boolean;
}

export function useDatasets(): DatasetRow[] {
  const { records } = useAnalytics();
  const documents = useCollection("datasets");
  const { now } = useWorkspace();
  return useMemo(() => ANALYTICS_COLLECTIONS.map((collection) => {
    const rows = records.filter((record) => record.collection === collection);
    const owners = new Map<string, number>();
    for (const row of rows) owners.set(row.ownerName, (owners.get(row.ownerName) ?? 0) + 1);
    const owner = [...owners.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Unassigned";
    const asOf = rows.map((row) => row.updatedAt ?? row.at ?? row.createdAt).filter(Boolean).sort().at(-1);
    const age = freshness(asOf, now, 14);
    const checks = qualityChecks(collection, records, now);
    const documented = documents.find((record) => record.fields.collection === collection);
    return {
      collection,
      records: rows,
      owner,
      asOf,
      ageDays: age.days,
      known: age.known,
      stale: age.stale,
      failing: checks.reduce((total, check) => total + check.failing.length, 0),
      measures: allMeasures().filter((measure) => measure.collection === collection),
      documented,
      retired: documented?.status === "retired",
    };
  }), [records, documents, now]);
}

export function DatasetCatalogue({ context, tab }: { context: ScreenContext; tab: string }) {
  const datasets = useDatasets();

  if (tab === "Connected") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="No external dataset is connected">
          A connected dataset would be a table this workspace reads from somewhere else. Nothing leaves this browser, so every capability below is what would be needed, with its current state.
        </Notice>
        <Grid>
          {PROVIDER_CAPABILITIES.map((capability) => (
            <Card
              key={capability.id}
              span={6}
              eyebrow="WOULD CONNECT"
              title={capability.label}
              subtitle={capability.provider}
              prov="unknown"
              actions={<Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>}
            >
              <Stack gap={2}>
                <p className="ds-subtle">{capability.note}</p>
                <Properties rows={[
                  { label: "Instead, locally", value: capability.localEquivalent },
                  { label: "Rows available", value: <span className="ds-num">0</span> },
                  { label: "Last refresh", value: "Never — no connection has been made" },
                ]} />
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  if (tab === "Issues") {
    const problems = datasets.filter((dataset) => dataset.failing > 0 || dataset.stale || dataset.records.length === 0);
    const unavailable = allMeasures().filter((measure) => measure.unavailable);
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Datasets with a problem" value={String(problems.length)} prov="human" meta={`of ${datasets.length} native datasets`} />
          <Stat label="Failing quality checks" value={String(datasets.reduce((total, dataset) => total + dataset.failing, 0))} prov="human" meta="Counted across every record" />
          <Stat label="Measures without a source" value={String(unavailable.length)} prov="unknown" unavailable={unavailable.length > 0} meta="Each one says what is missing" />
          <Stat label="Empty datasets" value={String(datasets.filter((dataset) => dataset.records.length === 0).length)} prov="human" meta="No record in this company yet" />
        </StatRow>

        <Card eyebrow="QUALITY" title="Datasets that need attention" prov="human" flush>
          {problems.length === 0 ? (
            <Empty title="Every dataset passes" icon={<CheckCircle2 size={20} />}>No record is missing an owner or an amount, no link dangles and no date is in the future.</Empty>
          ) : (
            <DataGrid
              rows={problems}
              rowId={(row) => row.collection}
              label="Datasets with issues"
              rowTone={(row) => (row.failing > 0 ? "warning" : undefined)}
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              onOpen={() => context.openOverlay("quality")}
              columns={[
                { key: "name", header: "Dataset", primary: true, cell: (row) => row.collection, filterValue: (row) => row.collection },
                { key: "rows", header: "Records", align: "end", cell: (row) => String(row.records.length) },
                { key: "failing", header: "Failing checks", align: "end", cell: (row) => (row.failing ? <Pill tone="warning">{row.failing}</Pill> : <Pill tone="success">0</Pill>) },
                { key: "age", header: "Age", align: "end", cell: (row) => (row.known ? `${row.ageDays} day${row.ageDays === 1 ? "" : "s"}` : "Unknown") },
              ]}
            />
          )}
        </Card>

        <Card eyebrow="UNAVAILABLE" title="Measures that cannot be computed here" prov="unknown">
          <UnavailableList context={context} />
        </Card>
      </Stack>
    );
  }

  const rows = tab === "Native" ? datasets.filter((dataset) => !dataset.retired) : datasets;

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Native datasets" value={String(datasets.length)} prov="human" meta="Collections in this company" />
        <Stat label="Records" value={String(datasets.reduce((total, dataset) => total + dataset.records.length, 0))} prov="human" meta="Everything the measures can read" />
        <Stat label="Connected datasets" value="0" prov="unknown" unavailable meta="No provider is connected" />
        <Stat label="Documented" value={String(datasets.filter((dataset) => dataset.documented).length)} prov="human" meta="Has a written description" />
      </StatRow>

      <Card eyebrow="CATALOGUE" title={tab === "Native" ? "Datasets held in this browser" : "Every dataset"} subtitle={`${rows.length} shown`} prov="posted" flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.collection}
          label="Datasets"
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={() => context.openOverlay("Dataset details")}
          rowTone={(row) => (row.retired ? "warning" : row.failing > 0 ? "warning" : undefined)}
          columns={[
            {
              key: "name", header: "Dataset", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.collection}</strong>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{row.documented?.summary ?? "Not documented yet"}</p>
                </div>
              ),
              filterValue: (row) => `${row.collection} ${row.documented?.summary ?? ""}`,
              sortValue: (row) => row.collection,
            },
            { key: "rows", header: "Records", align: "end", cell: (row) => <span className="ds-num">{row.records.length}</span>, sortValue: (row) => row.records.length },
            { key: "owner", header: "Owner", cell: (row) => row.owner, hideBelow: 900 },
            { key: "measures", header: "Measures", align: "end", cell: (row) => String(row.measures.length), hideBelow: 1100 },
            {
              key: "fresh", header: "Freshness", align: "end",
              cell: (row) => (row.known
                ? <span>{context.relative(row.asOf)}{row.stale ? <> · <Pill tone="warning">stale</Pill></> : null}</span>
                : <Pill tone="warning">unknown</Pill>),
              sortValue: (row) => row.asOf ?? "",
            },
            { key: "quality", header: "Quality", align: "end", cell: (row) => (row.failing ? <Pill tone="warning">{row.failing} failing</Pill> : <Pill tone="success">clean</Pill>) },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.retired ? "neutral" : "success"} dot>{row.retired ? "retired" : "live"}</Pill> },
          ]}
        />
      </Card>
    </Stack>
  );
}

export function DatasetSummary({ context }: { context: ScreenContext }) {
  const datasets = useDatasets();
  const dataset = datasets.find((row) => row.collection === context.selectedId) ?? datasets[0];
  if (!dataset) return null;
  return (
    <OverlaySummary
      eyebrow="Dataset"
      title={dataset.collection}
      status={<Pill tone={dataset.retired ? "neutral" : dataset.stale ? "warning" : "success"} dot>{dataset.retired ? "retired" : dataset.stale ? "stale" : "current"}</Pill>}
      meta={[`${dataset.records.length} records`, dataset.owner, dataset.known ? `newest ${dataset.ageDays} day${dataset.ageDays === 1 ? "" : "s"} old` : "age unknown"]}
    />
  );
}

export function DatasetDetails({ context }: { context: ScreenContext }) {
  const datasets = useDatasets();
  const dataset = datasets.find((row) => row.collection === context.selectedId) ?? datasets[0];
  const { context: queryContext } = useAnalytics();
  if (!dataset) return <Empty title="Choose a dataset" />;
  const sample = dataset.records[0];

  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Newest record", value: dataset.known ? context.date(dataset.asOf) : "Unknown", mono: true, tone: dataset.stale ? "warning" : undefined },
        { label: "Visible to", value: `${context.role} view` },
        { label: "Measures reading it", value: dataset.measures.map((measure) => measure.name).join(", ") || "None" },
      ]} />
      {dataset.documented && <p>{dataset.documented.summary}</p>}
      <Stack gap={2}>
        <strong>Fields present on a record</strong>
        {sample ? (
          <Properties rows={[
            { label: "title", value: "text" },
            { label: "status", value: `text — ${[...new Set(dataset.records.map((record) => record.status))].slice(0, 6).join(", ")}` },
            { label: "amountMinor", value: dataset.records.some((record) => record.amountMinor !== undefined) ? "money in minor units" : "not used by this dataset" },
            ...Object.keys(sample.fields).slice(0, 10).map((key) => ({ label: `fields.${key}`, value: typeof sample.fields[key] })),
          ]} />
        ) : <span className="ds-subtle">No record yet, so no field can be listed.</span>}
      </Stack>
      <Stack gap={2}>
        <strong>What reads this dataset</strong>
        {dataset.measures.length === 0 ? <span className="ds-subtle">No measure reads it.</span> : dataset.measures.map((measure) => {
          const result = runQuery({ measureIds: [measure.id], filters: [] }, queryContext);
          return (
            <Row key={measure.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{measure.name}</span>
              <span className="ds-num">{formatMeasure(measure, result.totals[0], context.money)}</span>
            </Row>
          );
        })}
      </Stack>
      <Notice tone="info" title="Refreshing is not a thing here">
        Figures are recomputed from these records every time a screen renders, so there is no extract to refresh and no staleness beyond the age of the records themselves.
      </Notice>
    </Stack>
  );
}

export function QualityPanel({ context }: { context: ScreenContext }) {
  const { records } = useAnalytics();
  const { now } = useWorkspace();
  const [collection, setCollection] = useState(context.selectedId ?? "invoices");
  const checks = qualityChecks(collection, records, now);
  return (
    <Stack gap={4}>
      <Field label="Dataset">
        <Select aria-label="Dataset" value={collection} onChange={(event) => setCollection(event.target.value)}>
          {ANALYTICS_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      {checks.map((check) => (
        <div key={check.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}>
            <strong className="ds-grow">{check.label}</strong>
            <Pill tone={check.failing.length === 0 ? "success" : "warning"} dot>{check.failing.length === 0 ? "passes" : `${check.failing.length} failing`}</Pill>
          </Row>
          <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{check.detail}</p>
          {check.failing.slice(0, 5).map((record) => (
            <Row key={record.id} gap={2} style={{ marginBlockStart: 4 }}>
              <span className="ds-grow ds-truncate" style={{ fontSize: "var(--text-xs)" }}>{record.title}</span>
              <code className="ds-num" style={{ fontSize: "var(--text-2xs)" }}>{record.id}</code>
            </Row>
          ))}
        </div>
      ))}
    </Stack>
  );
}

export function GrantReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const datasets = useDatasets();
  const dataset = datasets.find((row) => row.collection === context.selectedId) ?? datasets[0];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Dataset", value: dataset?.collection ?? "—" },
        { label: "Role view", value: context.role },
        { label: "May export", value: <Pill tone={context.can("export_data") ? "success" : "warning"}>{context.can("export_data") ? "yes" : "no"}</Pill> },
        { label: "May manage connections", value: <Pill tone={context.can("manage_connectors") ? "success" : "warning"}>{context.can("manage_connectors") ? "yes" : "no"}</Pill> },
      ]} />
      <Notice tone="warning" title="A grant here shapes the interface">
        Every record is in this browser. A grant decides what this interface offers a role view; it cannot keep data from someone with the device. A future service would enforce it.
      </Notice>
      <Notice tone="info" title="Privacy constraints that are respected">
        A contact without a recorded consent cannot be added to a report audience, and a dashboard marked sensitive does not show its figures in a preview to anyone but its owner.
      </Notice>
      <ModalActions>
        <OverlayActions primary={<Button variant="primary" onClick={close}>Close</Button>} />
      </ModalActions>
    </Stack>
  );
}

export function DocumentDataset({ context, close }: { context: ScreenContext; close: () => void }) {
  const datasets = useDatasets();
  const [collection, setCollection] = useState(context.selectedId ?? datasets[0]?.collection ?? "invoices");
  const dataset = datasets.find((row) => row.collection === collection);
  const [text, setText] = useState(dataset?.documented?.summary ?? "");
  const [owner, setOwner] = useState(dataset?.documented?.ownerName ?? dataset?.owner ?? context.actor);

  return (
    <Stack gap={4}>
      <Field label="Dataset">
        <Select aria-label="Dataset" value={collection} onChange={(event) => { setCollection(event.target.value); setText(datasets.find((row) => row.collection === event.target.value)?.documented?.summary ?? ""); }}>
          {datasets.map((row) => <option key={row.collection} value={row.collection}>{row.collection} ({row.records.length} records)</option>)}
        </Select>
      </Field>
      <Field label="What this dataset holds" required>
        <TextArea aria-label="What this dataset holds" rows={4} value={text} onChange={(event) => setText(event.target.value)} required />
      </Field>
      <Field label="Owner"><TextInput aria-label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
      <ModalActions>
<OverlayActions primary={<Button
        variant="primary"
        disabled={text.trim() === ""}
        onClick={async () => {
          const existing = dataset?.documented;
          const saved = existing
            ? await context.mutate.patch(existing.id, { summary: text.trim(), ownerName: owner, status: "documented" }, { expectRevision: existing.revision, event: `Dataset ${collection} documented` })
            : await context.mutate.create({
              collection: "datasets",
              title: collection,
              status: "documented",
              summary: text.trim(),
              ownerName: owner,
              fields: { collection, kind: "native" },
            }, `Dataset ${collection} documented`);
          if (!saved) return;
          context.toast("Documented", `${collection} now carries a description and an owner on its catalogue record.`);
          close();
        }}
      >
        Save the documentation
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-ANALYTICS-006 — Metric definitions
 * ====================================================================== */

export function MetricDefinitions({ context, tab }: { context: ScreenContext; tab: string }) {
  const { context: queryContext } = useAnalytics();
  const definitions = useCollection("metricDefinitions");
  const dashboards = useCollection("dashboards");

  const computed = useMemo(() => allMeasures().map((measure) => {
    const result = runQuery({ measureIds: [measure.id], filters: [] }, queryContext);
    return {
      measure,
      value: result.totals[0] ?? null,
      records: result.recordCount,
      asOf: result.asOf,
      prov: provenanceFor(measure, result.totals[0], result.asOf, context.now),
    };
  }), [queryContext, context.now]);

  if (tab === "Dimensions") {
    return (
      <Grid>
        {DIMENSIONS.map((dimension) => {
          const values = [...new Set(queryContext.records.map((record) => dimension.of(record, queryContext)))].sort();
          return (
            <Card key={dimension.id} span={6} eyebrow={dimension.type.toUpperCase()} title={dimension.name} subtitle={`${values.length} distinct values today`} prov="human">
              <Stack gap={2}>
                <p className="ds-subtle">{dimension.description}</p>
                <Row gap={1} wrap>
                  {values.slice(0, 12).map((value) => <Pill key={value} tone="neutral">{value}</Pill>)}
                  {values.length > 12 && <span className="ds-subtle">and {values.length - 12} more</span>}
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (tab === "Versions") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Changing a metric changes what an old dashboard meant">
          A dashboard records the measure it uses, not the number it showed. When a definition changes, every surface that reads it recomputes under the new definition — so each change is versioned here and the dashboards that read it are named.
        </Notice>
        <Card eyebrow="VERSIONS" title="Definitions recorded in this workspace" subtitle={`${definitions.length} version record${definitions.length === 1 ? "" : "s"}`} prov="human" flush>
          {definitions.length === 0 ? (
            <Empty title="No definition has been changed here" icon={<Ruler size={20} />}>
              Every measure is at the version the product shipped. Defining or editing a measure records a version here.
            </Empty>
          ) : (
            <DataGrid
              rows={definitions}
              rowId={(row) => row.id}
              label="Metric versions"
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              columns={[
                { key: "title", header: "Measure", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
                { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)}</span> },
                { key: "formula", header: "Formula", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{String(row.fields.agg)}({String(row.fields.collection)}.{String(row.fields.field)})</code> },
                { key: "owner", header: "Owner", cell: (row) => row.ownerName },
                { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "approved" ? "success" : row.status === "retired" ? "neutral" : "warning"} dot>{row.status}</Pill> },
                { key: "when", header: "Recorded", align: "end", cell: (row) => context.dateTime(row.updatedAt), sortValue: (row) => row.updatedAt },
              ]}
            />
          )}
        </Card>
        <Card eyebrow="IMPACT" title="Dashboards reading a measure defined here" prov="human">
          <Stack gap={2}>
            {definitions.length === 0 && <span className="ds-subtle">Nothing to trace yet.</span>}
            {definitions.map((definition) => {
              const measureId = String(definition.fields.measureId ?? definition.id);
              const users = dashboards.filter((dashboard) => readDashboard(dashboard).tiles.some((tile) => tile.measureId === measureId));
              return (
                <Row key={definition.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <span className="ds-grow">{definition.title}</span>
                  <Pill tone={users.length ? "warning" : "neutral"}>{users.length} dashboard{users.length === 1 ? "" : "s"}</Pill>
                  <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{users.map((item) => item.title).join(", ")}</span>
                </Row>
              );
            })}
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (tab === "Validation") {
    const unavailable = computed.filter((row) => row.measure.unavailable);
    const zero = computed.filter((row) => !row.measure.unavailable && (row.value === 0 || row.value === null));
    const live = computed.filter((row) => !row.measure.unavailable && row.value !== null && row.value !== 0);
    /* An independent recomputation of one measure, to prove the figure, not assert it. */
    const invoices = queryContext.records.filter((record) => record.collection === "invoices" && record.status === "paid");
    const byLines = invoices.reduce((total, record) => {
      const lines = (record.body as { lines?: { netMinor?: number; taxMinor?: number }[] } | undefined)?.lines ?? [];
      return total + lines.reduce((sum, line) => sum + (line.netMinor ?? 0) + (line.taxMinor ?? 0), 0);
    }, 0);
    const byHeader = invoices.reduce((total, record) => total + (record.amountMinor ?? 0), 0);

    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Measures in the catalogue" value={String(computed.length)} prov="human" meta={`${live.length} resolve to a figure`} />
          <Stat label="Resolve to zero" value={String(zero.length)} prov="human" meta="A real zero, not a missing figure" />
          <Stat label="No source here" value={String(unavailable.length)} prov="unknown" unavailable={unavailable.length > 0} meta="Reported as unavailable everywhere" />
          <Stat
            label="Header vs line check"
            value={byHeader === byLines ? "Agrees" : "Differs"}
            prov={byHeader === byLines ? "posted" : "unknown"}
            unavailable={byHeader !== byLines}
            meta={`${context.money(byHeader)} from headers, ${context.money(byLines)} from lines`}
          />
        </StatRow>

        <Card eyebrow="QA" title="Two independent computations of paid invoice value" prov="posted">
          <Stack gap={2}>
            <p>
              The revenue measure adds the amount on each paid invoice. This check adds the net and tax of every line inside the same invoices instead. They
              should agree; if they do not, the invoice bodies and headers have drifted apart and the figure cannot be trusted.
            </p>
            <Properties rows={[
              { label: "From invoice headers", value: <span className="ds-num">{context.money(byHeader)}</span> },
              { label: "From invoice lines", value: <span className="ds-num">{context.money(byLines)}</span> },
              { label: "Difference", value: <span className="ds-num">{context.money(byHeader - byLines)}</span> },
              { label: "Invoices checked", value: String(invoices.length) },
            ]} />
            {byHeader !== byLines && (
              <Notice tone="warning" title="The two computations disagree">
                Some paid invoice has a header total that its lines do not add up to. Until that is fixed, the revenue figure reports the header value and this check says so.
              </Notice>
            )}
          </Stack>
        </Card>

        <Card eyebrow="CATALOGUE" title="Every measure, computed now" prov="posted" flush>
          <DataGrid
            rows={computed.map((row) => ({ ...row, id: row.measure.id }))}
            rowId={(row) => row.id}
            label="Measure validation"
            rowTone={(row) => (row.measure.unavailable ? "warning" : undefined)}
            columns={[
              { key: "name", header: "Measure", primary: true, cell: (row) => row.measure.name, filterValue: (row) => `${row.measure.name} ${row.measure.collection}` },
              { key: "collection", header: "Reads", cell: (row) => row.measure.collection },
              { key: "records", header: "Records", align: "end", cell: (row) => <span className="ds-num">{row.records}</span> },
              { key: "value", header: "Figure", align: "end", cell: (row) => (row.measure.unavailable ? <Pill tone="warning">unavailable</Pill> : <span className="ds-num">{formatMeasure(row.measure, row.value, context.money)}</span>) },
              { key: "prov", header: "Provenance", cell: (row) => <Pill tone={row.prov === "posted" ? "success" : row.prov === "unknown" ? "warning" : "info"} dot>{row.prov}</Pill> },
            ]}
          />
        </Card>
      </Stack>
    );
  }

  /* Metrics */
  const shown = computed.filter((row) => row.measure.id === context.selectedId);
  return (
    <Grid>
      <Card span={12} title="Metric catalogue" subtitle={`${computed.length} measures. Select one to read its definition and source.`} prov="posted" flush>
        <DataGrid
          rows={computed.map((row) => ({ ...row, id: row.measure.id }))}
          rowId={(row) => row.id}
          label="Metric catalogue"
          selectedId={context.selectedId ?? shown[0]?.measure.id}
          onSelect={(id) => context.select(id)}
          onOpen={() => context.openOverlay("metric QA")}
          rowTone={(row) => (row.measure.unavailable ? "warning" : undefined)}
          columns={[
            {
              key: "name", header: "Measure", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.measure.name}</strong>
                  <p className="ds-subtle an-clamp">{row.measure.description}</p>
                </div>
              ),
              filterValue: (row) => `${row.measure.name} ${row.measure.formula} ${row.measure.collection}`,
              sortValue: (row) => row.measure.name,
            },
            {
              key: "source", header: "Source",
              cell: (row) => {
                const age = freshness(row.asOf, context.now, 7);
                return (
                  <div>
                    <span>{row.measure.collection}</span>
                    <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                      {row.measure.unavailable ? "No source here" : `${row.records} record${row.records === 1 ? "" : "s"}${age.known ? `, ${age.days}d old${age.stale ? " (stale)" : ""}` : ", age unknown"}`}
                    </p>
                  </div>
                );
              },
              sortValue: (row) => row.measure.collection,
              filterValue: (row) => row.measure.collection,
            },
            { key: "unit", header: "Unit", cell: (row) => row.measure.unit, hideBelow: 900 },
            { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{row.measure.version}</span>, hideBelow: 900 },
            { key: "value", header: "Now", align: "end", cell: (row) => (row.measure.unavailable ? <Pill tone="warning">unavailable</Pill> : <span className="ds-num">{formatMeasure(row.measure, row.value, context.money)}</span>) },
          ]}
        />
      </Card>
    </Grid>
  );
}

/** The selected measure's definition and source: what it computes, what it reads and how current that is. */
export function MetricDefinitionInspector({ context }: { context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const dashboards = useCollection("dashboards");
  const reports = useCollection("reports");
  const measure = (context.selectedId ? measureById(context.selectedId) : undefined) ?? allMeasures()[0];
  const result = useMemo(() => (measure ? runQuery({ measureIds: [measure.id], filters: [] }, queryContext) : undefined), [measure, queryContext]);
  if (!measure || !result) {
    return <Empty title="No measure selected">Select a measure to read its formula, its source and what depends on it.</Empty>;
  }
  const age = freshness(result.asOf, context.now, 7);
  const users = dashboards.filter((dashboard) => readDashboard(dashboard).tiles.some((tile) => tile.measureId === measure.id));
  const cited = reports.filter((report) => readReport(report).blocks.some((block) => block.measureId === measure.id));
  return (
    <Stack gap={4}>
      <div>
        <Pill tone={measure.unavailable ? "warning" : "success"} dot>{measure.unavailable ? "No source here" : "Computed from records"}</Pill>
        <h4 style={{ margin: "var(--space-2) 0 0" }}>{measure.name}</h4>
        <p className="ds-subtle">{measure.description}</p>
      </div>
      <KeyValueList items={[
        { label: "Formula", value: measure.formula, mono: true },
        { label: "Reads", value: measure.collection },
        { label: "Figure now", value: measure.unavailable ? "Unavailable" : formatMeasure(measure, result.totals[0] ?? null, context.money), mono: true },
        { label: "Records", value: String(result.recordCount), mono: true },
        { label: "Newest record", value: age.known ? `${context.date(result.asOf)}, ${age.days} day${age.days === 1 ? "" : "s"} old` : "Unknown", tone: age.known && age.stale ? "warning" : undefined },
        { label: "Unit and version", value: `${measure.unit}, v${measure.version}`, mono: true },
        { label: "Owner", value: measure.owner },
        { label: "Used by", value: `${users.length} dashboard${users.length === 1 ? "" : "s"}, ${cited.length} report${cited.length === 1 ? "" : "s"}` },
      ]} />
      {measure.unavailable && <Notice tone="warning" title="Reported as unavailable everywhere">{measure.unavailable}</Notice>}
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onClick={() => context.openOverlay("metric QA")}>Read the lineage</Button>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("test measure")}>Test it</Button>
      </Row>
    </Stack>
  );
}

export function FormulaEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { context: queryContext } = useAnalytics();
  const [name, setName] = useState("");
  const [collection, setCollection] = useState("invoices");
  const [agg, setAgg] = useState<"sum" | "count" | "avg" | "max">("sum");
  const [field, setField] = useState("amountMinor");
  const [statusIn, setStatusIn] = useState("");
  const [unit, setUnit] = useState<"money" | "count" | "percent" | "days">("money");
  const [description, setDescription] = useState("");

  const statuses = useMemo(
    () => [...new Set(queryContext.records.filter((record) => record.collection === collection).map((record) => record.status))],
    [queryContext.records, collection],
  );
  const fields = useMemo(() => {
    const sample = queryContext.records.find((record) => record.collection === collection);
    return ["amountMinor", "count", ...Object.keys(sample?.fields ?? {}).filter((key) => typeof sample?.fields[key] === "number")];
  }, [queryContext.records, collection]);

  const preview = useMemo(() => {
    const selected = queryContext.records.filter((record) =>
      record.collection === collection
      && (statusIn.trim() === "" || statusIn.split(",").map((item) => item.trim()).includes(record.status)));
    const values = selected.map((record) => {
      if (field === "count") return 1;
      if (field === "amountMinor") return record.amountMinor ?? 0;
      return Number(record.fields[field] ?? 0);
    });
    if (values.length === 0) return { count: 0, value: null as number | null };
    if (agg === "count") return { count: values.length, value: values.length };
    if (agg === "avg") return { count: values.length, value: values.reduce((sum, value) => sum + value, 0) / values.length };
    if (agg === "max") return { count: values.length, value: Math.max(...values) };
    return { count: values.length, value: values.reduce((sum, value) => sum + value, 0) };
  }, [queryContext.records, collection, statusIn, field, agg]);

  return (
    <Stack gap={4}>
      <Field label="Measure name" required><TextInput aria-label="Measure name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Deposits taken" /></Field>
      <Row gap={2} wrap>
        <Field label="Collection">
          <Select aria-label="Collection" value={collection} onChange={(event) => { setCollection(event.target.value); setField("amountMinor"); setStatusIn(""); }}>
            {ANALYTICS_COLLECTIONS.map((name_) => <option key={name_} value={name_}>{name_}</option>)}
          </Select>
        </Field>
        <Field label="Aggregation">
          <Select aria-label="Aggregation" value={agg} onChange={(event) => setAgg(event.target.value as typeof agg)}>
            {["sum", "count", "avg", "max"].map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Field">
          <Select aria-label="Field" value={field} onChange={(event) => setField(event.target.value)}>
            {fields.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Unit">
          <Select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}>
            {["money", "count", "percent", "days"].map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
      </Row>
      <Field label="Only these statuses" hint={`Comma separated. Present in ${collection}: ${statuses.join(", ") || "none"}`}>
        <TextInput aria-label="Only these statuses" value={statusIn} onChange={(event) => setStatusIn(event.target.value)} placeholder={statuses.slice(0, 2).join(", ")} />
      </Field>
      <Field label="What it means"><TextArea aria-label="What it means" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>

      <Notice tone={preview.count ? "info" : "warning"} title="Tested against this company's records">
        {preview.count === 0
          ? `No ${collection} record matches, so this measure would read Unavailable rather than zero-with-no-explanation.`
          : `${preview.count} record${preview.count === 1 ? "" : "s"} match. The measure computes ${unit === "money" ? context.money(Math.round(preview.value ?? 0)) : String(Math.round((preview.value ?? 0) * 10) / 10)} right now.`}
      </Notice>

      <ModalActions>
<OverlayActions primary={<Button
        variant="primary"
        disabled={name.trim() === ""}
        onClick={async () => {
          const id = `custom.${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          const created = await context.mutate.create({
            collection: "metricDefinitions",
            title: name.trim(),
            status: "proposed",
            summary: description.trim() || `${agg}(${collection}.${field}) defined in this workspace.`,
            fields: { measureId: id, collection, agg, field, statusIn, unit, version: 1 },
          }, `Measure ${name.trim()} defined`);
          context.toast("Measure defined", `${created.title} is in the catalogue as version 1, proposed. It computes from ${collection} like every other measure.`);
          close();
        }}
      >
        Define the measure
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function ImpactReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const definitions = useCollection("metricDefinitions");
  const dashboards = useCollection("dashboards");
  const reports = useCollection("reports");
  const [chosen, setChosen] = useState<string>();
  const definition = definitions.find((record) => record.id === chosen)
    ?? definitions.find((record) => record.id === context.selectedId || String(record.fields.measureId ?? "") === context.selectedId)
    ?? definitions.find((record) => record.status !== "approved")
    ?? definitions[0];

  if (!definition) {
    return <Notice tone="info" title="No definition has been changed in this workspace">Every measure is at the version the product shipped, so no historical meaning has moved.</Notice>;
  }
  const measureId = String(definition.fields.measureId ?? definition.id);
  const affectedDashboards = dashboards.filter((dashboard) => readDashboard(dashboard).tiles.some((tile) => tile.measureId === measureId));
  const affectedReports = reports.filter((report) => readReport(report).blocks.some((block) => block.measureId === measureId));

  return (
    <Stack gap={4}>
      <Field label="Definition">
        <Select aria-label="Definition" value={definition.id} onChange={(event) => setChosen(event.target.value)}>
          {definitions.map((record) => <option key={record.id} value={record.id}>{record.title} · v{String(record.fields.version ?? 1)} · {record.status}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Measure", value: definition.title },
        { label: "Version", value: <span className="ds-num">v{String(definition.fields.version ?? 1)}</span> },
        { label: "Approved by", value: definition.fields.approvedBy ? `${String(definition.fields.approvedBy)} at v${String(definition.fields.approvedVersion ?? "")}` : "Not approved" },
        { label: "State", value: <Pill tone={definition.status === "approved" ? "success" : "warning"} dot>{definition.status}</Pill> },
        { label: "Dashboards reading it", value: String(affectedDashboards.length) },
        { label: "Reports reading it", value: String(affectedReports.length) },
      ]} />
      <Notice tone="warning" title="What changes if this definition changes">
        {affectedDashboards.length + affectedReports.length === 0
          ? "Nothing reads this measure yet, so a change has no historical effect."
          : `${[...affectedDashboards, ...affectedReports].map((item) => item.title).join(", ")} would recompute under the new definition. The figures they showed before were computed under v${String(definition.fields.version ?? 1)}; the version record keeps what that meant.`}
      </Notice>
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          disabled={definition.status === "approved" || !context.can("manage_policy")}
          title={!context.can("manage_policy") ? "Approving a definition needs the Owner view" : undefined}
          onClick={async () => {
            const saved = await context.mutate.patch(definition.id, {
              status: "approved",
              fields: { ...definition.fields, approvedBy: context.actor, approvedAt: clockIso(), approvedVersion: Number(definition.fields.version ?? 1) },
            }, { expectRevision: definition.revision, event: `Measure ${definition.title} approved at v${String(definition.fields.version ?? 1)} by ${context.actor}` });
            if (saved) context.toast("Approved", `${definition.title} is approved at version ${String(definition.fields.version ?? 1)} by ${context.actor}.`);
          }}
        >
          Approve this version
        </Button>} secondary={<Button
          variant="secondary"
          onClick={async () => {
            const next = Number(definition.fields.version ?? 1) + 1;
            const saved = await context.mutate.patch(definition.id, {
              status: "proposed",
              fields: { ...definition.fields, version: next },
            }, { expectRevision: definition.revision, event: `Measure ${definition.title} versioned to v${next}` });
            if (!saved) return;
            context.toast("Versioned", `${definition.title} is now v${next}, proposed. Everything reading it recomputes under the new definition.`);
          }}
        >
          Record a new version
        </Button>} end={<Button variant="ghost" onClick={close}>Close</Button>} />
</ModalActions>
    </Stack>
  );
}

export function MetricQA({ context }: { context: ScreenContext }) {
  const measure = measureById(context.selectedId ?? "revenue.paid") ?? allMeasures()[0];
  return <MetricLineage measureId={measure.id} context={context} />;
}

/* ====================================================================== *
 * ARL-ANALYTICS-007 — Data modelling
 * ====================================================================== */

export interface Relation {
  id: string;
  from: string;
  to: string;
  key: string;
  kind: "many-to-one" | "one-to-many";
}

const DEFAULT_RELATIONS: Relation[] = [
  { id: "r1", from: "invoices", to: "contacts", key: "contactId", kind: "many-to-one" },
  { id: "r2", from: "deals", to: "contacts", key: "contactId", kind: "many-to-one" },
  { id: "r3", from: "contacts", to: "companies", key: "companyId", kind: "many-to-one" },
  { id: "r4", from: "orders", to: "contacts", key: "contactId", kind: "many-to-one" },
  { id: "r5", from: "tickets", to: "contacts", key: "contactId", kind: "many-to-one" },
];

export function readRelations(record: Rec | undefined): Relation[] {
  const body = record?.body as { relations?: Relation[] } | undefined;
  return Array.isArray(body?.relations) && body!.relations.length ? body!.relations : DEFAULT_RELATIONS;
}

export function DataModelling({ context, tab }: { context: ScreenContext; tab: string }) {
  const models = useCollection("dataModels");
  const model = models[0];
  const relations = readRelations(model);
  const { records } = useAnalytics();
  const dashboards = useCollection("dashboards");
  const reports = useCollection("reports");

  const checks = useMemo(
    () => relations.map((relation) => ({ relation, check: joinCheck(relation.from, relation.to, relation.key, records) })),
    [relations, records],
  );

  if (tab === "Transformations") {
    const transforms = allMeasures().filter((measure) => !measure.unavailable && (measure.compute || measure.agg !== "sum" || measure.formula.includes("×")));
    const sampleDeal = records.find((record) => record.collection === "deals" && !["won", "lost"].includes(record.status));
    return (
      <Grid>
        <Card span={7} eyebrow="TRANSFORMS" title="Every calculation the metric layer performs" subtitle={`${transforms.length} derived figures`} prov="posted">
          <Stack gap={2}>
            {transforms.map((measure) => (
              <div key={measure.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}><strong className="ds-grow">{measure.name}</strong><Pill tone="neutral">{measure.unit}</Pill></Row>
                <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{measure.formula}</code>
                <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{measure.description}</p>
              </div>
            ))}
          </Stack>
        </Card>
        <Card span={5} eyebrow="WORKED EXAMPLE" title="The weighting, on one real deal" prov="posted">
          {sampleDeal ? (
            <Properties rows={[
              { label: "Deal", value: sampleDeal.title },
              { label: "Amount", value: <span className="ds-num">{context.money(sampleDeal.amountMinor)}</span> },
              { label: "Probability on the record", value: <span className="ds-num">{String(sampleDeal.fields.probability ?? 0)}%</span> },
              { label: "Weighted contribution", value: <span className="ds-num">{context.money(Math.round((sampleDeal.amountMinor ?? 0) * (Number(sampleDeal.fields.probability ?? 0) / 100)))}</span> },
            ]} />
          ) : <Empty title="No open deal to show the arithmetic on" />}
          <Notice tone="info" title="A deal with no probability contributes nothing">
            Rather than assume a default likelihood, the weighting treats a missing probability as zero, and the metric definition says so.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (tab === "Tests") {
    const fanOut = checks.filter((item) => item.check.fanOut);
    const unmatched = checks.filter((item) => item.check.unmatched > 0);
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Relations tested" value={String(checks.length)} prov="human" meta="Each one joined against the real records" />
          <Stat label="Fan-out detected" value={String(fanOut.length)} prov={fanOut.length ? "unknown" : "posted"} unavailable={fanOut.length > 0} meta="A join that would multiply rows" />
          <Stat label="Unmatched keys" value={String(checks.reduce((total, item) => total + item.check.unmatched, 0))} prov="human" meta="Rows whose link finds nothing" />
          <Stat label="Datasets joined" value={String(new Set(checks.flatMap((item) => [item.relation.from, item.relation.to])).size)} prov="human" meta="Collections in this company" />
        </StatRow>

        {fanOut.length > 0 && (
          <Notice tone="warning" title="A join here would inflate a total">
            {fanOut.map((item) => `${item.relation.from} → ${item.relation.to} reaches up to ${item.check.maxFanOut} rows for one ${item.relation.from} record`).join("; ")}.
            The figures below show what the inflation would be, so no screen can quietly report the larger number.
          </Notice>
        )}

        <Card eyebrow="JOIN TESTS" title="What each join does to a total" prov="posted" flush>
          <DataGrid
            rows={checks.map((item) => ({ ...item, id: item.relation.id }))}
            rowId={(row) => row.id}
            label="Join tests"
            rowTone={(row) => (row.check.fanOut ? "warning" : row.check.unmatched > 0 ? "warning" : undefined)}
            columns={[
              { key: "join", header: "Relation", primary: true, cell: (row) => `${row.relation.from} → ${row.relation.to}`, filterValue: (row) => `${row.relation.from} ${row.relation.to}` },
              { key: "key", header: "Key", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.relation.key}</code> },
              { key: "matched", header: "Matched", align: "end", cell: (row) => <span className="ds-num">{row.check.matched}</span> },
              { key: "unmatched", header: "Unmatched", align: "end", cell: (row) => (row.check.unmatched ? <Pill tone="warning">{row.check.unmatched}</Pill> : <Pill tone="success">0</Pill>) },
              { key: "fan", header: "Max rows per row", align: "end", cell: (row) => <span className="ds-num">{row.check.maxFanOut}</span> },
              {
                key: "sum", header: "Total before → after", align: "end",
                cell: (row) => (
                  <span className="ds-num">
                    {context.money(row.check.sumBefore)} → {context.money(row.check.sumAfter)}
                  </span>
                ),
              },
            ]}
          />
        </Card>

        {unmatched.length > 0 && (
          <Notice tone="warning" title="Some links find nothing">
            {unmatched.map((item) => `${item.check.unmatched} ${item.relation.from} record${item.check.unmatched === 1 ? "" : "s"} have no ${item.relation.to}`).join("; ")}.
            Those records group under a named catch-all rather than being dropped from a total.
          </Notice>
        )}
      </Stack>
    );
  }

  if (tab === "Lineage") {
    const measures = allMeasures().filter((measure) => !measure.unavailable);
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Every figure traces back to records in this browser">
          Collection, then the selection the measure applies, then the surfaces that read it. There is no stage in between.
        </Notice>
        <Grid>
          {[...new Set(measures.map((measure) => measure.collection))].map((collection) => {
            const owned = measures.filter((measure) => measure.collection === collection);
            return (
              <Card key={collection} span={6} eyebrow="COLLECTION" title={collection} subtitle={`${records.filter((record) => record.collection === collection).length} records`} prov="posted">
                <Stack gap={2}>
                  {owned.map((measure) => {
                    const onDashboards = dashboards.filter((dashboard) => readDashboard(dashboard).tiles.some((tile) => tile.measureId === measure.id));
                    const onReports = reports.filter((report) => readReport(report).blocks.some((block) => block.measureId === measure.id));
                    return (
                      <div key={measure.id} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <Row gap={2}><strong className="ds-grow">{measure.name}</strong><Pill tone="neutral">v{measure.version}</Pill></Row>
                        <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                          used by {onDashboards.length} dashboard{onDashboards.length === 1 ? "" : "s"} and {onReports.length} report{onReports.length === 1 ? "" : "s"}
                          {onDashboards.length + onReports.length > 0 ? `: ${[...onDashboards, ...onReports].map((item) => item.title).join(", ")}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    );
  }

  /* Schema */
  return (
    <Stack gap={5}>
      <Card eyebrow="SCHEMA" title="Relationships between the collections" subtitle={`${relations.length} relations, each tested against real records`} prov="posted" flush>
        <DataGrid
          rows={checks.map((item) => ({ ...item, id: item.relation.id }))}
          rowId={(row) => row.id}
          label="Relations"
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={() => context.openOverlay("Join properties")}
          columns={[
            { key: "from", header: "From", primary: true, cell: (row) => row.relation.from, filterValue: (row) => `${row.relation.from} ${row.relation.to}` },
            { key: "to", header: "To", cell: (row) => row.relation.to },
            { key: "key", header: "Key", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.relation.key}</code> },
            { key: "kind", header: "Cardinality observed", cell: (row) => <Pill tone={row.check.fanOut ? "warning" : "success"} dot>{row.check.fanOut ? `one to ${row.check.maxFanOut}` : "many to one"}</Pill> },
            { key: "matched", header: "Matched", align: "end", cell: (row) => <span className="ds-num">{row.check.matched}/{row.check.matched + row.check.unmatched}</span> },
          ]}
        />
      </Card>
      <Grid>
        {ANALYTICS_COLLECTIONS.slice(0, 8).map((collection) => {
          const rows = records.filter((record) => record.collection === collection);
          return (
            <Card key={collection} span={3} eyebrow="TABLE" title={collection} prov="posted">
              <Stack gap={2}>
                <span className="an-figure ds-num">{rows.length}</span>
                <Meter value={rows.length} max={Math.max(1, ...ANALYTICS_COLLECTIONS.map((name) => records.filter((record) => record.collection === name).length))} label={`${collection} record count`} />
                <p className="an-tile-source">{relations.filter((relation) => relation.from === collection || relation.to === collection).length} relations</p>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

export function JoinProperties({ context }: { context: ScreenContext }) {
  const models = useCollection("dataModels");
  const relations = readRelations(models[0]);
  const { records } = useAnalytics();
  const ready = useAnalyticsReady();
  const relation = relations.find((item) => item.id === context.selectedId) ?? relations[0];
  if (!ready) return <Empty title="Reading the records">No verdict is shown until every collection the join uses has loaded.</Empty>;
  if (!relation) return <Empty title="No relation" />;
  const check = joinCheck(relation.from, relation.to, relation.key, records);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "From", value: relation.from },
        { label: "To", value: relation.to },
        { label: "Key", value: <code className="ds-num">{relation.key}</code> },
        { label: "Declared", value: relation.kind },
        { label: "Observed maximum", value: <span className="ds-num">{check.maxFanOut}</span> },
        { label: "Matched", value: `${check.matched} of ${check.matched + check.unmatched}` },
      ]} />
      {check.fanOut ? (
        <Notice tone="warning" title="This join fans out">
          One {relation.from} record reaches up to {check.maxFanOut} {relation.to} records. Summing across the join would report {context.money(check.sumAfter)} instead of
          the true {context.money(check.sumBefore)} — an inflation of {context.money(check.sumAfter - check.sumBefore)}. The measures therefore aggregate before joining, never after.
        </Notice>
      ) : (
        <Notice tone="success" title="This join cannot inflate a total">
          Every {relation.from} record reaches at most one {relation.to} record, so a sum across the join equals the sum before it: {context.money(check.sumBefore)}.
        </Notice>
      )}
      {check.unmatched > 0 && (
        <Notice tone="warning" title={`${check.unmatched} record${check.unmatched === 1 ? "" : "s"} find nothing`}>
          Those records still count towards a total; they group under a named catch-all in any dimension that walks this relation.
        </Notice>
      )}
    </Stack>
  );
}

export function TransformEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const models = useCollection("dataModels");
  const model = models[0];
  const relations = readRelations(model);
  const [from, setFrom] = useState("invoices");
  const [to, setTo] = useState("contacts");
  const [key, setKey] = useState("contactId");
  const { records } = useAnalytics();
  const preview = joinCheck(from, to, key, records);

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Field label="From">
          <Select aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)}>
            {ANALYTICS_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <Field label="To">
          <Select aria-label="To" value={to} onChange={(event) => setTo(event.target.value)}>
            {ANALYTICS_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Key field"><TextInput aria-label="Key field" value={key} onChange={(event) => setKey(event.target.value)} /></Field>
      </Row>
      <Notice tone={preview.fanOut ? "warning" : preview.matched === 0 ? "danger" : "success"} title={`${preview.matched} of ${preview.matched + preview.unmatched} ${from} records match`}>
        {preview.matched === 0
          ? `No ${from} record resolves a ${to} through ${key}. The relation would be inert.`
          : preview.fanOut
            ? `One ${from} reaches up to ${preview.maxFanOut} ${to} records, so a sum across the join would read ${context.money(preview.sumAfter)} instead of ${context.money(preview.sumBefore)}.`
            : `Each ${from} reaches at most one ${to}, so totals are safe across this join.`}
      </Notice>
      <ModalActions>
<OverlayActions primary={<Button
        variant="primary"
        disabled={preview.matched === 0}
        onClick={async () => {
          const relation: Relation = { id: `r${relations.length + 1}-${wallMs().toString(36)}`, from, to, key, kind: preview.fanOut ? "one-to-many" : "many-to-one" };
          const saved = model
            ? await context.mutate.patch(model.id, { body: { relations: [...relations, relation] } }, { expectRevision: model.revision, event: `Relation ${from} → ${to} added` })
            : await context.mutate.create({
              collection: "dataModels",
              title: "Northline data model",
              status: "active",
              summary: "Relationships between the collections, tested against the records.",
              body: { relations: [...relations, relation] },
            }, `Relation ${from} → ${to} added`);
          if (!saved) return;
          context.toast("Relation added", `${from} → ${to} is tested against the records every time this screen renders.`);
          close();
        }}
      >
        Add the relation
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function ModelTest({ context: _context }: { context: ScreenContext }) {
  const models = useCollection("dataModels");
  const relations = readRelations(models[0]);
  const { records } = useAnalytics();
  const ready = useAnalyticsReady();
  const { now } = useWorkspace();
  if (!ready) return <Empty title="Reading the records">No verdict is shown until every collection the joins use has loaded.</Empty>;
  const results = relations.map((relation) => ({ relation, check: joinCheck(relation.from, relation.to, relation.key, records) }));
  const quality = ANALYTICS_COLLECTIONS.flatMap((collection) => qualityChecks(collection, records, now).filter((check) => check.failing.length > 0).map((check) => ({ collection, check })));

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Relations", value: String(results.length) },
        { label: "Passing", value: String(results.filter((item) => !item.check.fanOut && item.check.unmatched === 0).length) },
        { label: "Fan-out", value: String(results.filter((item) => item.check.fanOut).length) },
        { label: "Quality failures", value: String(quality.reduce((total, item) => total + item.check.failing.length, 0)) },
      ]} />
      {results.map((item) => (
        <Row key={item.relation.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <Pill tone={item.check.fanOut ? "warning" : item.check.unmatched ? "warning" : "success"} dot>
            {item.check.fanOut ? "fan-out" : item.check.unmatched ? "unmatched" : "passes"}
          </Pill>
          <span className="ds-grow">{item.relation.from} → {item.relation.to}</span>
          <span className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{item.check.matched}/{item.check.matched + item.check.unmatched}</span>
        </Row>
      ))}
      {quality.length > 0 && (
        <Notice tone="warning" title={`${quality.length} quality check${quality.length === 1 ? "" : "s"} failing`}>
          {quality.slice(0, 4).map((item) => `${item.collection}: ${item.check.label} (${item.check.failing.length})`).join("; ")}.
        </Notice>
      )}
      <Notice tone="info" title="Deploying a model changes nothing downstream">
        The relations are read when a screen renders. There is no materialised table to rebuild, so a model change takes effect immediately and no figure can be left behind at an old shape.
      </Notice>
    </Stack>
  );
}

export { Database, GitMerge, Table2, AlertTriangle };
