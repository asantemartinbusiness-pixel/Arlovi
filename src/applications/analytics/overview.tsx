import { useMemo, useState } from "react";
import { Activity, Brain, LineChart as LineIcon, Search, Sparkles, TrendingUp } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, Empty, Field, Grid, LineChart, Meter, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, ModalActions, OverlayActions,
} from "@/design-system";
import { CAPABILITY_LABELS, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import {
  allMeasures, anomalies, forecast, formatMeasure, measureById, monthlySeries, provenanceFor,
  runQuery, type MeasureDef,
} from "./metrics";
import {
  Figure, MeasureSummaryGrid, MeasureView, MetricLineage, UnavailableList, useAnalytics,
} from "./panels";

const LENS_MEASURES: Record<string, string[]> = {
  Executive: ["revenue.paid", "receivable.open", "pipeline.weighted", "deals.winrate"],
  Financial: ["revenue.paid", "receivable.overdue", "payable.open", "expenses.total"],
  Customers: ["pipeline.open", "deals.won", "tickets.open", "lead.value"],
  Operations: ["tasks.open", "tickets.open", "stock.value", "orders.value"],
};

/* ====================================================================== *
 * ARL-ANALYTICS-001 — Insights overview
 * ====================================================================== */

export function InsightsOverview({ context, lens }: { context: ScreenContext; lens: string }) {
  const { context: queryContext } = useAnalytics();
  const { now } = useWorkspace();
  const model = capabilityById("model.inference")!;

  const found = useMemo(
    () => anomalies(["revenue.paid", "expenses.total", "orders.value"], 6, queryContext),
    [queryContext],
  );

  if (lens === "AI") {
    return (
      <Grid>
        <Card span={7} eyebrow="QUESTION" title="Ask the workspace" subtitle="Answered by matching your words to the metric catalogue, then computing from records" prov="human">
          <QuestionComposer context={context} />
        </Card>
        <Card span={5} eyebrow="MODEL" title={`${model.label} — ${CAPABILITY_LABELS[model.state]}`} prov="unknown">
          <Stack gap={3}>
            <Notice tone="warning" title="No model is called on this screen">
              {model.note} {model.localEquivalent}
            </Notice>
            <p className="ds-subtle">
              What this screen does instead: it matches the words you type against the names, descriptions and collections in the metric catalogue, computes the
              best matches from the records in {context.org.name}, and shows you which records produced each figure. Nothing is inferred beyond the arithmetic.
            </p>
            <Properties rows={[
              { label: "Hypothesis", value: "Never offered — the screen states only what it computed" },
              { label: "Reconciled figures", value: "Every answer names its measure, its formula and its record count" },
            ]} />
          </Stack>
        </Card>
      </Grid>
    );
  }

  const measures = LENS_MEASURES[lens] ?? LENS_MEASURES.Executive;
  const trendMeasure = lens === "Financial" ? "expenses.total" : lens === "Customers" ? "pipeline.open" : lens === "Operations" ? "orders.value" : "revenue.paid";
  const revenue = monthlySeries("revenue.paid", 6, queryContext);
  const expenses = monthlySeries("expenses.total", 6, queryContext);

  return (
    <Stack gap={5}>
      <StatRow>
        <MeasureSummaryGrid
          measureIds={measures}
          context={context}
          onInspect={(id) => context.openOverlay("Metric inspector", { measureId: id })}
        />
      </StatRow>

      <Grid>
        <Card
          span={lens === "Financial" ? 12 : 8}
          eyebrow="TREND"
          title={lens === "Financial" ? "Revenue against expenses, by month" : `${measureById(trendMeasure)?.name} by month`}
          subtitle="Computed from the records dated in each month"
          prov="posted"
        >
          {lens === "Financial" ? (
            revenue.every((point) => point.value === 0) && expenses.every((point) => point.value === 0) ? (
              <Notice tone="warning" title="No month in range has a figure">Neither invoices nor expenses carry a date inside the last six months.</Notice>
            ) : (
              <BarChart
                title="Revenue against expenses by month"
                height={220}
                format={(value) => context.money(value)}
                series={[
                  { name: "Revenue recognised", points: revenue.map((point) => ({ label: point.label, value: point.value })) },
                  { name: "Expenses recorded", points: expenses.map((point) => ({ label: point.label, value: point.value })) },
                ]}
                footer="Revenue is the value of paid invoices dated in the month; expenses are expense records dated in the month. Neither is a bank figure."
              />
            )
          ) : (
            <MeasureView
              spec={{ measureIds: [trendMeasure], filters: [] }}
              viz="line"
              context={context}
              title={`${measureById(trendMeasure)?.name} by month`}
              onInspect={(id) => context.openOverlay("Metric inspector", { measureId: id })}
            />
          )}
        </Card>

        {lens !== "Financial" && (
          <Card span={4} eyebrow="ANOMALIES" title="Points worth a look" subtitle="Two standard deviations from the mean" prov="posted">
            {found.found.length === 0 ? (
              <Stack gap={2}>
                <Empty title="Nothing stands out" icon={<Activity size={20} />}>
                  No month is more than two standard deviations from the mean of the others.
                </Empty>
                {found.tooFewPoints.length > 0 && (
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                    {found.tooFewPoints.join(", ")} {found.tooFewPoints.length === 1 ? "has" : "have"} fewer than four months with a value, so nothing is claimed about {found.tooFewPoints.length === 1 ? "it" : "them"}.
                  </p>
                )}
              </Stack>
            ) : (
              <Stack gap={2}>
                {found.found.map((anomaly) => (
                  <button
                    key={`${anomaly.measureId}-${anomaly.point.key}`}
                    type="button"
                    className="ds-panel"
                    style={{ padding: "var(--space-3)", textAlign: "start", cursor: "pointer", width: "100%" }}
                    onClick={() => context.openOverlay("insight detail", { measureId: anomaly.measureId, monthKey: anomaly.point.key })}
                  >
                    <Row gap={2}>
                      <strong className="ds-grow">{anomaly.measureName}, {anomaly.point.label}</strong>
                      <Pill tone={anomaly.direction === "above" ? "success" : "warning"} dot>{anomaly.direction}</Pill>
                    </Row>
                    <span className="ds-num">{context.money(anomaly.point.value)}</span>
                    <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{anomaly.explanation}</p>
                  </button>
                ))}
              </Stack>
            )}
          </Card>
        )}

        <Card span={6} eyebrow="OPPORTUNITIES" title="What the records suggest" subtitle="Derived, never invented" prov="human">
          <Opportunities context={context} lens={lens} />
        </Card>

        <Card span={6} eyebrow="MISSING" title="Figures this workspace cannot give you" subtitle="With what would make each one resolve" prov="unknown">
          <UnavailableList context={context} />
        </Card>
      </Grid>

      <Card eyebrow="FRESHNESS" title="How current the figures are" prov="posted">
        <FreshnessTable context={context} measureIds={measures} />
      </Card>

      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        Every figure on this page was recomputed from records in {context.org.name} at {context.dateTime(now)}.
      </p>
    </Stack>
  );
}

function FreshnessTable({ context, measureIds }: { context: ScreenContext; measureIds: string[] }) {
  const { context: queryContext } = useAnalytics();
  const rows = measureIds.map((id) => {
    const measure = measureById(id);
    const result = runQuery({ measureIds: [id], filters: [] }, queryContext);
    const age = freshness(result.asOf, context.now, 14);
    return {
      id,
      measure,
      value: result.totals[0] ?? null,
      records: result.recordCount,
      asOf: result.asOf,
      age,
      prov: provenanceFor(measure, result.totals[0], result.asOf, context.now),
    };
  });
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Figure freshness"
      filterable={false}
      rowTone={(row) => (row.prov === "unknown" ? "warning" : undefined)}
      columns={[
        { key: "name", header: "Figure", primary: true, cell: (row) => row.measure?.name ?? row.id },
        { key: "value", header: "Now", align: "end", cell: (row) => (row.prov === "unknown" ? <Pill tone="warning">unavailable</Pill> : <span className="ds-num">{formatMeasure(row.measure, row.value, context.money)}</span>) },
        { key: "source", header: "From", cell: (row) => row.measure?.collection ?? "—" },
        { key: "records", header: "Records", align: "end", cell: (row) => <span className="ds-num">{row.records}</span> },
        { key: "age", header: "Newest record", align: "end", cell: (row) => (row.age.known ? `${context.date(row.asOf)} · ${row.age.days}d` : "Unknown") },
        { key: "prov", header: "Provenance", cell: (row) => <Pill tone={row.prov === "posted" ? "success" : row.prov === "unknown" ? "warning" : "info"} dot>{row.prov}</Pill> },
      ]}
    />
  );
}

function Opportunities({ context, lens }: { context: ScreenContext; lens: string }) {
  const { context: queryContext } = useAnalytics();
  const items = useMemo(() => {
    const out: { id: string; title: string; body: string; to?: string }[] = [];
    const overdue = runQuery({ measureIds: ["receivable.overdue"], filters: [] }, queryContext);
    if ((overdue.totals[0] ?? 0) > 0) {
      out.push({
        id: "overdue",
        title: `${context.money(overdue.totals[0] ?? 0)} is past due`,
        body: `${overdue.recordCount} invoice${overdue.recordCount === 1 ? "" : "s"} are past their due date. Chasing is local; no mail provider is connected.`,
        to: `/o/${context.org.slug}/auto/workflows`,
      });
    }
    const weighted = runQuery({ measureIds: ["pipeline.weighted", "pipeline.open"], filters: [] }, queryContext);
    const open = weighted.totals[1] ?? 0;
    const weight = weighted.totals[0] ?? 0;
    if (open > 0 && weight / open < 0.5) {
      out.push({
        id: "pipeline",
        title: "The pipeline is weighted low",
        body: `${context.money(weight)} weighted against ${context.money(open)} open, so the probabilities recorded on the deals average under half.`,
        to: `/o/${context.org.slug}/crm/deals`,
      });
    }
    const tickets = runQuery({ measureIds: ["tickets.open"], filters: [] }, queryContext);
    if ((tickets.totals[0] ?? 0) > 1) {
      out.push({ id: "tickets", title: `${tickets.totals[0]} tickets are open`, body: "Support load is above one open ticket; the priority breakdown is on the Operations lens." });
    }
    const missing = allMeasures().filter((measure) => measure.unavailable).length;
    if (missing > 0) {
      out.push({ id: "missing", title: `${missing} figures have no source`, body: "Each one names the field or connection that would make it resolve. Until then the screens say unavailable." });
    }
    return out;
  }, [queryContext, context]);

  if (items.length === 0) {
    return <Empty title="Nothing stands out in the records" icon={<TrendingUp size={20} />}>Suggestions here are arithmetic on this company's records, so an empty list means the arithmetic found nothing.</Empty>;
  }
  return (
    <Stack gap={2}>
      {items.map((item) => (
        <div key={item.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <strong>{item.title}</strong>
          <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{item.body}</p>
          {item.to && <Button size="sm" variant="ghost" onClick={() => context.navigate(item.to!)}>Open</Button>}
        </div>
      ))}
      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Lens: {lens}. Every line above is computed, not written in advance.</p>
    </Stack>
  );
}

/* ------------------------------ question composer ------------------------------ */

export function scoreMeasures(question: string): { measure: MeasureDef; score: number }[] {
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  if (words.length === 0) return [];
  return allMeasures()
    .map((measure) => {
      const haystack = `${measure.name} ${measure.description} ${measure.collection} ${measure.formula}`.toLowerCase();
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
      return { measure, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export function QuestionComposer({ context }: { context: ScreenContext }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const { context: queryContext } = useAnalytics();
  const matches = useMemo(() => scoreMeasures(asked), [asked]);

  return (
    <Stack gap={4}>
      <Field label="Your question" hint="For example: how much revenue have we recognised, or what is overdue.">
        <TextArea aria-label="Your question" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button variant="primary" icon={<Search size={15} />} disabled={question.trim() === ""} onClick={() => setAsked(question)}>Answer from the records</Button>
        {asked && <Button variant="ghost" onClick={() => { setAsked(""); setQuestion(""); }}>Clear</Button>}
      </Row>

      {asked && matches.length === 0 && (
        <Notice tone="warning" title="No measure in the catalogue matches those words">
          Rather than guess, the screen says so. The metric catalogue lists every figure this workspace can compute and the collection each one reads.
        </Notice>
      )}

      {matches.map((match) => {
        const result = runQuery({ measureIds: [match.measure.id], filters: [] }, queryContext);
        const prov = provenanceFor(match.measure, result.totals[0], result.asOf, context.now);
        return (
          <Card key={match.measure.id} eyebrow="ANSWER" title={match.measure.name} prov={prov} subtitle={match.measure.formula}>
            <Stack gap={2}>
              <Figure measure={match.measure} value={result.totals[0] ?? null} context={context} onInspect={() => context.openOverlay("Metric inspector", { measureId: match.measure.id })} />
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                {match.measure.description} Computed from {result.recordCount} {match.measure.collection} record{result.recordCount === 1 ? "" : "s"}
                {result.asOf ? `, newest ${context.date(result.asOf)}` : ", no date recorded"}.
              </p>
            </Stack>
          </Card>
        );
      })}

      {asked && (
        <Notice tone="info" title="How this answer was produced">
          Your words were matched against the metric catalogue, and the matching measures were computed from records in {context.org.name}. No model was called and nothing was inferred.
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------------ 001 overlays ------------------------------ */

export function MetricInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { measureId?: string } | undefined;
  const [id, setId] = useState(payload?.measureId ?? "revenue.paid");
  return (
    <Stack gap={4}>
      <Field label="Measure">
        <Select aria-label="Measure" value={id} onChange={(event) => setId(event.target.value)}>
          {allMeasures().map((measure) => <option key={measure.id} value={measure.id}>{measure.name}</option>)}
        </Select>
      </Field>
      <MetricLineage measureId={id} context={context} />
    </Stack>
  );
}

export function InsightDetail({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { measureId?: string; monthKey?: string } | undefined;
  const { context: queryContext } = useAnalytics();
  const measure = measureById(payload?.measureId ?? "revenue.paid");
  if (!measure) return <Empty title="No insight selected" />;
  const series = monthlySeries(measure.id, 6, queryContext);
  const point = series.find((item) => item.key === payload?.monthKey) ?? series[series.length - 1];
  const mean = series.reduce((total, item) => total + item.value, 0) / Math.max(1, series.length);
  const contributing = queryContext.records.filter((record) => {
    if (record.collection !== measure.collection) return false;
    const date = new Date(record.at ?? record.createdAt);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === point?.key;
  });

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Measure", value: measure.name },
        { label: "Month", value: point?.label ?? "—" },
        { label: "Value", value: <span className="ds-num">{formatMeasure(measure, point?.value ?? null, context.money)}</span> },
        { label: "Six-month mean", value: <span className="ds-num">{formatMeasure(measure, mean, context.money)}</span> },
        { label: "Difference", value: <span className="ds-num">{formatMeasure(measure, (point?.value ?? 0) - mean, context.money)}</span> },
        { label: "Records in that month", value: String(contributing.length) },
      ]} />
      <Notice tone="info" title="This is an observation, not a cause">
        The screen can say that the month differs from the others and name the records that produced it. It cannot say why, and it does not guess.
      </Notice>
      <Stack gap={2}>
        <strong>The records in that month</strong>
        {contributing.length === 0 ? <span className="ds-subtle">None.</span> : contributing.map((record) => (
          <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <span className="ds-grow ds-truncate">{record.title}</span>
            <Pill tone="neutral">{record.status}</Pill>
            {record.amountMinor !== undefined && <span className="ds-num">{context.money(record.amountMinor)}</span>}
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

export function DataFreshness({ context }: { context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const rows = allMeasures().map((measure) => {
    const result = runQuery({ measureIds: [measure.id], filters: [] }, queryContext);
    return { measure, result, prov: provenanceFor(measure, result.totals[0], result.asOf, context.now) };
  });
  const connected = capabilityById("bank.feed")!;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No dataset is refreshed on a schedule">
        Figures are recomputed from records when a screen renders, so a figure is exactly as old as the records behind it. {connected.label} is {CAPABILITY_LABELS[connected.state].toLowerCase()}, so balances come from posted local journals rather than a feed.
      </Notice>
      <Properties rows={rows.filter((row) => !row.measure.unavailable).slice(0, 12).map((row) => ({
        label: row.measure.name,
        value: row.result.asOf ? `${context.relative(row.result.asOf)} · ${row.result.recordCount} records` : "No dated record",
      }))} />
      <Stack gap={2}>
        <strong>Datasets that are missing entirely</strong>
        <UnavailableList context={context} />
      </Stack>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-ANALYTICS-008 — Forecasts and scenarios
 * ====================================================================== */

export function ForecastScreen({ context, tab }: { context: ScreenContext; tab: string }) {
  const { context: queryContext } = useAnalytics();
  const scenarios = useCollection("scenarios");
  const [measureId, setMeasureId] = useState("revenue.paid");
  const [adjustment, setAdjustment] = useState(0);
  const measure = measureById(measureId);
  const model = useMemo(() => forecast(measureId, 6, 3, queryContext, adjustment), [measureId, queryContext, adjustment]);

  if (tab === "Scenarios") {
    const saved = scenarios.filter((record) => record.fields.kind === "forecast");
    return (
      <Stack gap={5}>
        <Card eyebrow="SCENARIOS" title="Saved scenarios" subtitle={`${saved.length} recorded`} prov="human" flush>
          {saved.length === 0 ? (
            <Empty title="No scenario saved" icon={<LineIcon size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("scenario editor")}>Create one</Button>}>
              A scenario records an adjustment to the trend and keeps it beside the actuals, so the projection can never be mistaken for a posted figure.
            </Empty>
          ) : (
            <DataGrid
              rows={saved}
              rowId={(row) => row.id}
              label="Scenarios"
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              columns={[
                { key: "title", header: "Scenario", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
                { key: "measure", header: "Measure", cell: (row) => measureById(String(row.fields.measureId ?? ""))?.name ?? String(row.fields.measureId ?? "—") },
                { key: "adjust", header: "Trend adjustment", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.adjustment ?? 0)}%</span> },
                { key: "owner", header: "Owner", cell: (row) => row.ownerName },
                { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "reviewed" ? "success" : "warning"} dot>{row.status}</Pill> },
                { key: "when", header: "Saved", align: "end", cell: (row) => context.dateTime(row.createdAt), sortValue: (row) => row.createdAt },
              ]}
            />
          )}
        </Card>

        {saved.length > 1 && (
          <Card eyebrow="COMPARE" title="Scenarios side by side" subtitle="Each one recomputed from the same actuals" prov="posted">
            <Stack gap={3}>
              {saved.map((record) => {
                const scenarioModel = forecast(String(record.fields.measureId ?? "revenue.paid"), 6, 3, queryContext, Number(record.fields.adjustment ?? 0));
                const last = scenarioModel.projection[scenarioModel.projection.length - 1];
                return (
                  <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <span className="ds-grow">{record.title}</span>
                    <Pill tone="neutral">{String(record.fields.adjustment ?? 0)}%</Pill>
                    <span className="ds-num">{last ? context.money(Math.round(last.value)) : "Unavailable"}</span>
                  </Row>
                );
              })}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  if (tab === "Inputs") {
    return (
      <Grid>
        <Card span={6} eyebrow="ASSUMPTIONS" title="What the projection is built from" prov="posted">
          <Stack gap={4}>
            <Field label="Measure">
              <Select aria-label="Measure" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
                {allMeasures().filter((item) => !item.unavailable).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Trend adjustment" hint="A percentage applied to the fitted slope, for a scenario. Zero is the fitted trend.">
              <TextInput aria-label="Trend adjustment" type="number" min={-100} max={200} value={String(adjustment)} onChange={(event) => setAdjustment(Number(event.target.value))} />
            </Field>
            <Properties rows={[
              { label: "History used", value: "6 months, from the records' own dates" },
              { label: "Method", value: "Least-squares straight line through the monthly values" },
              { label: "Band", value: "The residual spread of the fit, widening by a quarter each month ahead" },
              { label: "Fitted slope", value: <span className="ds-num">{context.money(Math.round(model.slopePerMonth))} per month</span> },
              { label: "Residual spread", value: <span className="ds-num">{context.money(Math.round(model.residualSd))}</span> },
            ]} />
          </Stack>
        </Card>
        <Card span={6} eyebrow="ACTUALS" title="The monthly values the fit used" subtitle="Posted figures, not projections" prov="posted">
          <DataGrid
            rows={model.history.map((point) => ({ ...point, id: point.key }))}
            rowId={(row) => row.id}
            label="Monthly actuals"
            filterable={false}
            columns={[
              { key: "month", header: "Month", primary: true, cell: (row) => row.label },
              { key: "key", header: "Period", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.key}</code> },
              { key: "value", header: "Actual", align: "end", cell: (row) => <span className="ds-num">{formatMeasure(measure, row.value, context.money)}</span> },
            ]}
          />
        </Card>
      </Grid>
    );
  }

  if (tab === "Accuracy") {
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat
            label="Backtest error"
            value={model.mape === null ? "Unavailable" : `${model.mape.toFixed(1)}%`}
            unavailable={model.mape === null}
            prov={model.mape === null ? "unknown" : "posted"}
            meta={model.mape === null ? "Fewer than five months of history" : "Mean absolute percentage error on the last two months"}
          />
          <Stat label="Months of history" value={String(model.history.filter((point) => point.value !== 0).length)} prov="posted" meta="Months with any value" />
          <Stat label="Residual spread" value={context.money(Math.round(model.residualSd))} prov="posted" meta="How far the actuals sit from the fitted line" />
          <Stat label="Projection replaces an actual" value="Never" prov="posted" meta="Actuals and projections are separate series" />
        </StatRow>
        <Card eyebrow="BACKTEST" title="How the method would have done" prov="posted">
          {model.mape === null ? (
            <Notice tone="warning" title="Not enough history to score the method">
              A backtest fits the line on the earlier months and scores it on the later ones. With fewer than five months there is nothing honest to score, so no accuracy figure is shown.
            </Notice>
          ) : (
            <Stack gap={3}>
              <p>
                The line was fitted on the first {model.history.length - 2} months and scored on the last two. Its mean absolute percentage error was {model.mape.toFixed(1)}%.
                A wider residual spread means the band on the forecast is wider, which is the only claim the screen makes about confidence.
              </p>
              <Meter value={Math.max(0, 100 - model.mape)} max={100} label="Backtest agreement" tone={model.mape < 20 ? "success" : model.mape < 50 ? "warning" : "danger"} />
            </Stack>
          )}
        </Card>
      </Stack>
    );
  }

  /* Forecast */
  const maxValue = Math.max(1, ...model.history.map((point) => point.value), ...model.projection.map((point) => point.high));
  return (
    <Stack gap={5}>
      <Row gap={2} wrap>
        <Field label="Measure">
          <Select aria-label="Measure" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
            {allMeasures().filter((item) => !item.unavailable).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Trend adjustment">
          <Select aria-label="Trend adjustment" value={String(adjustment)} onChange={(event) => setAdjustment(Number(event.target.value))}>
            {[-50, -25, -10, 0, 10, 25, 50].map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}%</option>)}
          </Select>
        </Field>
      </Row>

      {!model.usable ? (
        <Notice tone="warning" title="No projection is drawn">{model.reason}</Notice>
      ) : (
        <Grid>
          <Card span={8} eyebrow="ACTUALS" title={`${measure?.name} — what is posted`} subtitle="Only months that happened" prov="posted">
            <LineChart
              title={`${measure?.name} by month, actual`}
              height={220}
              series={[{ name: "Actual", points: model.history.map((point) => ({ label: point.label, value: point.value })) }]}
              format={(value) => formatMeasure(measure, value, context.money)}
              footer="These are posted figures computed from the records. No projected value appears in this series."
            />
          </Card>
          <Card span={4} eyebrow="PROJECTION" title="Three months ahead" subtitle="A separate series, with its band" prov="unknown">
            <Stack gap={3}>
              <div className="an-band" role="table" aria-label="Projection with uncertainty band">
                {model.history.slice(-2).map((point) => (
                  <div className="an-band-row" data-actual="true" key={point.key} role="row">
                    <span role="cell">{point.label}</span>
                    <span className="an-band-track" role="cell">
                      <span className="an-band-range" style={{ left: `${(point.value / maxValue) * 100 - 1}%`, width: "2%" }} />
                      <span className="an-band-point" style={{ left: `${(point.value / maxValue) * 100}%` }} />
                    </span>
                    <span className="ds-num" role="cell">{formatMeasure(measure, point.value, context.money)}</span>
                  </div>
                ))}
                {model.projection.map((point) => (
                  <div className="an-band-row" key={point.label} role="row">
                    <span role="cell">{point.label}</span>
                    <span className="an-band-track" role="cell">
                      <span className="an-band-range" style={{ left: `${(point.low / maxValue) * 100}%`, width: `${((point.high - point.low) / maxValue) * 100}%` }} />
                      <span className="an-band-point" style={{ left: `${(point.value / maxValue) * 100}%` }} />
                    </span>
                    <span className="ds-num" role="cell">{formatMeasure(measure, point.value, context.money)}</span>
                  </div>
                ))}
              </div>
              <Notice tone="warning" title="A projection is not an actual">
                The projected months are drawn apart from the actuals and marked. Nothing on this screen writes a projection into a record, and no posted figure is ever replaced by one.
              </Notice>
              <Button variant="secondary" onClick={() => context.openOverlay("confidence note")}>What the band means</Button>
            </Stack>
          </Card>
          <Card span={12} eyebrow="TABLE" title="Actual and projected, side by side" prov="posted" flush>
            <DataGrid
              rows={[
                ...model.history.map((point) => ({ id: point.key, period: point.label, kind: "actual" as const, value: point.value, low: point.value, high: point.value })),
                ...model.projection.map((point, index) => ({ id: `p${index}`, period: point.label, kind: "projected" as const, value: point.value, low: point.low, high: point.high })),
              ]}
              rowId={(row) => row.id}
              label="Actual and projected"
              filterable={false}
              rowTone={(row) => (row.kind === "projected" ? "warning" : undefined)}
              columns={[
                { key: "period", header: "Month", primary: true, cell: (row) => row.period },
                { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "actual" ? "success" : "warning"} dot>{row.kind}</Pill> },
                { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{formatMeasure(measure, row.value, context.money)}</span> },
                { key: "low", header: "Low", align: "end", cell: (row) => (row.kind === "actual" ? "—" : <span className="ds-num">{formatMeasure(measure, row.low, context.money)}</span>) },
                { key: "high", header: "High", align: "end", cell: (row) => (row.kind === "actual" ? "—" : <span className="ds-num">{formatMeasure(measure, row.high, context.money)}</span>) },
              ]}
            />
          </Card>
        </Grid>
      )}
    </Stack>
  );
}

export function AssumptionInspector({ context }: { context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const model = forecast("revenue.paid", 6, 3, queryContext, 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Method", value: "Least squares on the monthly values" },
        { label: "History", value: `${model.history.length} months` },
        { label: "Months with a value", value: String(model.history.filter((point) => point.value !== 0).length) },
        { label: "Slope", value: <span className="ds-num">{context.money(Math.round(model.slopePerMonth))} per month</span> },
        { label: "Intercept", value: <span className="ds-num">{context.money(Math.round(model.intercept))}</span> },
        { label: "Residual spread", value: <span className="ds-num">{context.money(Math.round(model.residualSd))}</span> },
      ]} />
      <Notice tone="info" title="Everything above is arithmetic on the records">
        No seasonality, no market assumption and no external input. If the straight line is the wrong shape for this business, the backtest on the Accuracy tab is where that shows.
      </Notice>
    </Stack>
  );
}

export function ScenarioEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { context: queryContext } = useAnalytics();
  const [title, setTitle] = useState("");
  const [measureId, setMeasureId] = useState("revenue.paid");
  const [adjustment, setAdjustment] = useState(0);
  const model = forecast(measureId, 6, 3, queryContext, adjustment);
  const last = model.projection[model.projection.length - 1];
  return (
    <Stack gap={4}>
      <Field label="Scenario name" required><TextInput aria-label="Scenario name" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="If the restaurant phase two lands" /></Field>
      <Field label="Measure">
        <Select aria-label="Measure" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
          {allMeasures().filter((item) => !item.unavailable).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Field label="Trend adjustment" hint="Applied to the fitted slope only. The actuals never move.">
        <TextInput aria-label="Trend adjustment" type="number" min={-100} max={200} value={String(adjustment)} onChange={(event) => setAdjustment(Number(event.target.value))} />
      </Field>
      <Notice tone={model.usable ? "info" : "warning"} title={model.usable ? "Where this scenario lands" : "No projection can be drawn"}>
        {model.usable && last
          ? `Three months out, this scenario projects ${context.money(Math.round(last.value))}, within a band of ${context.money(Math.round(last.low))} to ${context.money(Math.round(last.high))}.`
          : model.reason}
      </Notice>
      <ModalActions>
<OverlayActions primary={<Button
        variant="primary"
        disabled={title.trim() === "" || !model.usable}
        onClick={async () => {
          await context.mutate.create({
            collection: "scenarios",
            title: title.trim(),
            status: "proposed",
            summary: `${measureById(measureId)?.name} with the fitted slope adjusted by ${adjustment}%.`,
            fields: { kind: "forecast", measureId, adjustment, projected: Math.round(last?.value ?? 0) },
          }, `Scenario ${title.trim()} saved`);
          context.toast("Scenario saved", "It is a record beside the actuals, never a replacement for one.");
          close();
        }}
      >
        Save the scenario
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function ConfidenceNote({ context }: { context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const model = forecast("revenue.paid", 6, 3, queryContext, 0);
  return (
    <Stack gap={4}>
      <p>
        The band is the residual spread of the fitted line, widening by a quarter of that spread for each month further ahead. It is not a confidence interval in the
        statistical sense, and this screen does not call it one.
      </p>
      <Properties rows={[
        { label: "Residual spread", value: <span className="ds-num">{context.money(Math.round(model.residualSd))}</span> },
        { label: "Months behind the fit", value: String(model.history.length) },
        { label: "Backtest error", value: model.mape === null ? "Unavailable — fewer than five months" : `${model.mape.toFixed(1)}%` },
      ]} />
      <Notice tone="warning" title="What would make this better">
        More months of posted history, and a cost figure on products so margin could be projected rather than revenue alone. Both are recorded as unavailable on the metric catalogue.
      </Notice>
    </Stack>
  );
}

export function DelegateInvestigation({ context, close }: { context: ScreenContext; close: () => void }) {
  const [note, setNote] = useState("");
  const [measureId, setMeasureId] = useState("receivable.overdue");
  const { context: queryContext } = useAnalytics();
  const result = runQuery({ measureIds: [measureId], filters: [] }, queryContext);
  const measure = measureById(measureId);
  return (
    <Stack gap={4}>
      <Field label="Figure to investigate">
        <Select aria-label="Figure to investigate" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
          {allMeasures().map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Value now", value: measure?.unavailable ? "Unavailable" : <span className="ds-num">{formatMeasure(measure, result.totals[0], context.money)}</span> },
        { label: "From", value: `${result.recordCount} ${measure?.collection ?? ""} records` },
      ]} />
      <Field label="What should be looked at" required>
        <TextArea aria-label="What should be looked at" rows={3} value={note} onChange={(event) => setNote(event.target.value)} required />
      </Field>
      <Notice tone="warning" title="This creates a task, not an agent run">
        No model is connected, so nothing here investigates on its own. The task is assigned to a person with the figure and its source recorded on it.
      </Notice>
      <ModalActions>
<OverlayActions primary={<Button
        variant="primary"
        disabled={note.trim() === ""}
        onClick={async () => {
          await context.mutate.create({
            collection: "tasks",
            title: `Investigate ${measure?.name ?? measureId}`,
            status: "ready",
            summary: note.trim(),
            fields: {
              stage: "ready",
              assignee: context.actor,
              measureId,
              figure: measure?.unavailable ? "unavailable" : String(Math.round(result.totals[0] ?? 0)),
              records: result.recordCount,
            },
          }, `Investigation raised for ${measure?.name ?? measureId}`);
          context.toast("Task created", `It is assigned to ${context.actor} with the figure and its record count on it.`);
          close();
        }}
      >
        Create the task
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function SaveView({ context, close }: { context: ScreenContext; close: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      id="analytics-save-view"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: name.trim() || "Untitled view",
          status: "active",
          summary: `Saved from ${context.screen.title}, ${context.tab} lens.`,
          fields: { kind: "savedView", scope: context.screen.title, tab: context.tab, app: "ANALYTICS" },
        }, `Analytics view ${name.trim()} saved`);
        context.toast("View saved", "The lens is kept for this person in this browser.");
        close();
      }}
    >
      <Field label="View name" required><TextInput aria-label="View name" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Notice tone="info" title="Saved in this browser">A saved view keeps the lens you are on. It is not shared with anyone.</Notice>
    </form>
  );
}

export function SavedViews({ context }: { context: ScreenContext }) {
  const preferences = useCollection("preferences");
  const saved = preferences.filter((record) => record.fields.kind === "savedView" && record.fields.app === "ANALYTICS");
  const record = useRecord(context.selectedId);
  void record;
  if (saved.length === 0) return <Empty title="No saved view" icon={<Sparkles size={20} />}>Saving a view keeps the lens you are reading.</Empty>;
  return (
    <Stack gap={2}>
      {saved.map((item) => (
        <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <span className="ds-grow">{item.title}</span>
          <Button size="sm" variant="ghost" onClick={() => context.setTab(String(item.fields.tab ?? "Executive"))}>Open</Button>
        </Row>
      ))}
    </Stack>
  );
}

export { Brain };
