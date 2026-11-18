import { useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, ChevronDown, ChevronUp, FileText, Mail, Plus, Quote, Send,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row,
  Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { CAPABILITY_LABELS, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness, wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { describeSchedule, nextOccurrences, readSchedule as readAutoSchedule } from "@/applications/auto/schedule";
import { dimensionById, formatMeasure, measureById, runQuery, type QueryFilter } from "./metrics";
import {
  DimensionPicker, FilterRows, MeasurePicker, MeasureView, useAnalytics, VIZ_LABELS, type Viz,
} from "./panels";
import { EXPLORE_SOURCE_LABEL, ExploreReport, isQueryReport, newQueryBody } from "./explorer";
import { ANALYTICS_COLLECTIONS } from "./metrics";

/**
 * A report's recurrence. A report that records only its period ("monthly",
 * "weekly") recurs at that period, never at the scheduler's daily default.
 */
function readSchedule(fields: Rec["fields"], fallbackZone: string): ReturnType<typeof readAutoSchedule> {
  if (fields.scheduleFrequency) return readAutoSchedule(fields, fallbackZone);
  const period = String(fields.period ?? "");
  const frequency = ["daily", "weekly", "monthly"].includes(period) ? period : "monthly";
  return readAutoSchedule({ ...fields, scheduleFrequency: frequency }, fallbackZone);
}

export type BlockKind = "heading" | "commentary" | "metric" | "chart" | "table";

export interface ReportBlock {
  id: string;
  kind: BlockKind;
  text?: string;
  measureId?: string;
  dimensionId?: string;
  viz?: Viz;
}

export interface ReportBody {
  blocks: ReportBlock[];
  filters?: QueryFilter[];
}

export function readReport(record: Rec | undefined): ReportBody {
  const body = record?.body as Partial<ReportBody> | undefined;
  return {
    blocks: (Array.isArray(body?.blocks) ? body!.blocks : []).map((block, index) => ({
      id: block.id ?? `b${index}`,
      kind: (block.kind ?? "commentary") as BlockKind,
      text: block.text,
      measureId: block.measureId,
      dimensionId: block.dimensionId,
      viz: block.viz as Viz | undefined,
    })),
    filters: Array.isArray(body?.filters) ? body!.filters : [],
  };
}

const STALE_AFTER_DAYS = 45;

export interface BlockCheck {
  block: ReportBlock;
  ok: boolean;
  reason: string;
  asOf?: string;
  ageDays?: number;
  value?: number | null;
}

export function checkBlocks(body: ReportBody, context: ScreenContext, queryContext: ReturnType<typeof useAnalytics>["context"]): BlockCheck[] {
  return body.blocks
    .filter((block) => block.kind === "metric" || block.kind === "chart" || block.kind === "table")
    .map((block) => {
      const measure = block.measureId ? measureById(block.measureId) : undefined;
      if (!measure) return { block, ok: false, reason: "The block names no measure, so there is nothing to cite." };
      if (measure.unavailable) return { block, ok: false, reason: `${measure.name} has no source in this workspace: ${measure.unavailable}` };
      const result = runQuery({ measureIds: [measure.id], dimensionId: block.dimensionId, filters: body.filters ?? [] }, queryContext);
      const age = freshness(result.asOf, context.now, STALE_AFTER_DAYS);
      if (!age.known) return { block, ok: false, reason: `${measure.name} has no dated record behind it, so its age cannot be shown.` };
      if (age.stale) return { block, ok: false, reason: `${measure.name} is computed from records whose newest is ${age.days} days old, past the ${STALE_AFTER_DAYS}-day threshold.`, asOf: result.asOf, ageDays: age.days };
      return { block, ok: true, reason: `${measure.formula}; ${result.recordCount} record${result.recordCount === 1 ? "" : "s"}, newest ${age.days} day${age.days === 1 ? "" : "s"} old.`, asOf: result.asOf, ageDays: age.days, value: result.totals[0] };
    });
}

/* ====================================================================== *
 * ARL-ANALYTICS-004 — Report builder (and the report library)
 * ====================================================================== */

export function ReportLibrary({ context, note }: { context: ScreenContext; note?: string }) {
  const reports = useCollection("reports");
  return (
    <Stack gap={4}>
      {note && <Notice tone="warning" title="That address is not a report">{note}</Notice>}
      <Card eyebrow="LIBRARY" title="Reports in this company" subtitle={`${reports.length} recorded · figures recomputed from ${EXPLORE_SOURCE_LABEL.toLowerCase()}`} prov="human" flush
        actions={<Button variant="secondary" icon={<Plus size={15} />} onClick={() => context.openOverlay("create report")}>New report</Button>}
      >
        {reports.length === 0 ? (
          <Empty title="No report yet" icon={<FileText size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("create report")}>New report</Button>}>
            A report is a set of blocks: headings and commentary written by a person, and figures recomputed from the records in this company.
          </Empty>
        ) : (
          <DataGrid
            rows={reports}
            rowId={(row) => row.id}
            label="Reports"
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/analytics/reports/${id}`)}
            columns={[
              { key: "title", header: "Report", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}`, sortValue: (row) => row.title },
              { key: "owner", header: "Owner", cell: (row) => row.ownerName },
              { key: "kind", header: "Kind", cell: (row) => (isQueryReport(row) ? <Pill tone="info">query · {String(row.fields.queryCollection ?? "")}</Pill> : <Pill>{readReport(row).blocks.length} blocks</Pill>), sortValue: (row) => (isQueryReport(row) ? "query" : "written") },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "published" ? "success" : "neutral"} dot>{row.status}</Pill> },
              { key: "updated", header: "Updated", align: "end", cell: (row) => context.dateTime(row.updatedAt), sortValue: (row) => row.updatedAt },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

export function ReportBuilder({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const { context: queryContext } = useAnalytics();
  const [editing, setEditing] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");

  if (record && isQueryReport(record)) return <ExploreReport context={context} record={record} />;

  if (!record || record.collection !== "reports") {
    return (
      <ReportLibrary
        context={context}
        note={context.params.id ? `${context.params.id} is a ${record?.collection ?? "missing"} record. Open a report from the library below, or create one.` : undefined}
      />
    );
  }

  const body = readReport(record);
  const checks = checkBlocks(body, context, queryContext);
  const blockers = checks.filter((check) => !check.ok);

  async function write(next: ReportBody, event: string) {
    await context.mutate.patch(record!.id, { body: next }, { event });
  }
  function patchBlock(id: string, patch: Partial<ReportBlock>, event: string) {
    void write({ ...body, blocks: body.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) }, event);
  }
  function move(id: string, delta: number) {
    const index = body.blocks.findIndex((block) => block.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= body.blocks.length) return;
    const next = [...body.blocks];
    [next[index], next[target]] = [next[target], next[index]];
    void write({ ...body, blocks: next }, "Report block moved");
  }

  if (context.tab === "Data") {
    return (
      <Grid>
        <Card span={7} eyebrow="QUERY" title="Blocks that carry a figure" subtitle="Each picker recomputes from this company's records" prov="posted">
          {checks.length === 0 ? (
            <Empty title="No figure in this report yet" icon={<FileText size={20} />}>Add a metric, chart or table block on the Content tab.</Empty>
          ) : (
            <Stack gap={4}>
              {body.blocks.filter((block) => ["metric", "chart", "table"].includes(block.kind)).map((block) => (
                <div key={block.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2}><strong className="ds-grow">{block.text || measureById(block.measureId ?? "")?.name || "Block"}</strong><Pill tone="neutral">{block.kind}</Pill></Row>
                  <MeasurePicker value={block.measureId ?? "revenue.paid"} onChange={(id) => patchBlock(block.id, { measureId: id }, "Block measure changed")} />
                  {block.kind !== "metric" && (
                    <DimensionPicker value={block.dimensionId ?? ""} onChange={(id) => patchBlock(block.id, { dimensionId: id || undefined }, "Block dimension changed")} />
                  )}
                  {block.kind === "chart" && (
                    <Field label="Chart">
                      <Select aria-label="Chart" value={block.viz ?? "bar"} onChange={(event) => patchBlock(block.id, { viz: event.target.value as Viz }, "Block chart changed")}>
                        {(["bar", "line", "donut"] as Viz[]).map((viz) => <option key={viz} value={viz}>{VIZ_LABELS[viz]}</option>)}
                      </Select>
                    </Field>
                  )}
                  <p className="an-cite">{checks.find((check) => check.block.id === block.id)?.reason}</p>
                </div>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={5} eyebrow="FILTERS" title="Report filters" subtitle="Applied to every figure in the report" prov="human">
          <FilterRows filters={body.filters ?? []} onChange={(next) => void write({ ...body, filters: next }, "Report filters changed")} context={context} />
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Layout") {
    return (
      <Card eyebrow="LAYOUT" title="Order and kind" subtitle={`${body.blocks.length} blocks`} prov="human" flush>
        {body.blocks.length === 0 ? <Empty title="No block yet">Add one on the Content tab.</Empty> : (
          <DataGrid
            rows={body.blocks.map((block, index) => ({ ...block, index }))}
            rowId={(row) => row.id}
            label="Report blocks"
            filterable={false}
            columns={[
              { key: "order", header: "#", cell: (row) => String(row.index + 1), sortValue: (row) => row.index },
              { key: "kind", header: "Kind", cell: (row) => (
                <Select value={row.kind} aria-label={`Kind of block ${row.index + 1}`} onChange={(event) => patchBlock(row.id, { kind: event.target.value as BlockKind }, "Block kind changed")}>
                  {(["heading", "commentary", "metric", "chart", "table"] as BlockKind[]).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </Select>
              ) },
              { key: "text", header: "Text", primary: true, cell: (row) => row.text ?? measureById(row.measureId ?? "")?.name ?? "—" },
              { key: "move", header: "Order", align: "end", cell: (row) => (
                <Row gap={1}>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move block ${row.index + 1} up`} disabled={row.index === 0} onClick={() => move(row.id, -1)}><ChevronUp size={14} /></Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move block ${row.index + 1} down`} disabled={row.index === body.blocks.length - 1} onClick={() => move(row.id, 1)}><ChevronDown size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void write({ ...body, blocks: body.blocks.filter((block) => block.id !== row.id) }, "Block removed")}>Remove</Button>
                </Row>
              ) },
            ]}
          />
        )}
      </Card>
    );
  }

  if (context.tab === "Distribution") {
    const schedule = readSchedule(record.fields, context.org.timezone);
    const next = nextOccurrences(schedule, context.now, 3);
    const capability = capabilityById("email.send")!;
    return (
      <Grid>
        <Card span={6} eyebrow="SCHEDULE" title="When this report would go out" subtitle={describeSchedule(schedule)} prov="human">
          <Stack gap={3}>
            <Properties rows={next.map((occurrence, index) => ({ label: `Run ${index + 1}`, value: occurrence.localLabel }))} />
            <Button variant="secondary" onClick={() => context.openOverlay("schedule")}>Change the schedule</Button>
          </Stack>
        </Card>
        <Card span={6} eyebrow="DELIVERY" title={`${capability.label} — ${CAPABILITY_LABELS[capability.state]}`} prov="unknown">
          <Stack gap={3}>
            <Notice tone="warning" title="This report cannot be sent from here">
              {capability.note} {capability.localEquivalent} A delivery is recorded as prepared locally, never as sent.
            </Notice>
            <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/analytics/distribution`)}>Open reports and distribution</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  /* Content */
  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("Report block")}>Add a block</Button>
        <Button variant="secondary" icon={<Quote size={15} />} onClick={() => context.openOverlay("source inspection")}>Check the citations</Button>
        <span className="ds-grow" />
        <Pill tone={record.status === "published" ? "success" : "neutral"} dot>{record.status}</Pill>
        {blockers.length > 0 && <Pill tone="warning" dot>{blockers.length} blocking</Pill>}
      </Row>

      {blockers.length > 0 && (
        <Notice tone="warning" title={`${blockers.length} figure${blockers.length === 1 ? "" : "s"} cannot be presented as final`}>
          {blockers.map((check) => check.reason).join(" ")} Publishing is blocked until each one has a live source.
        </Notice>
      )}

      <div className="an-report">
        <Stack gap={4}>
          <div>
            <p className="ds-eyebrow">{String(record.fields.period ?? "report").toUpperCase()}</p>
            <h2 style={{ marginBlock: 4 }}>{record.title}</h2>
            <p className="ds-subtle">{record.summary}</p>
            <p className="an-cite">
              Prepared by {record.ownerName} · figures recomputed {context.dateTime(context.now)} from records in {context.org.name}.
            </p>
          </div>

          {body.blocks.length === 0 && <Empty title="This report is empty" icon={<FileText size={20} />}>Add a heading, some commentary or a figure.</Empty>}

          {body.blocks.map((block) => {
            const check = checks.find((item) => item.block.id === block.id);
            const measure = block.measureId ? measureById(block.measureId) : undefined;
            return (
              <div
                key={block.id}
                className="an-report-block"
                data-selected={context.selectedId === block.id ? "true" : undefined}
                onClick={() => context.select(block.id)}
              >
                {block.kind === "heading" && (
                  editing === block.id ? (
                    <TextInput
                      autoFocus
                      value={buffer}
                      aria-label="Heading text"
                      onChange={(event) => setBuffer(event.target.value)}
                      onBlur={() => { patchBlock(block.id, { text: buffer }, "Heading changed"); setEditing(null); }}
                    />
                  ) : (
                    <h3 style={{ margin: 0 }} onDoubleClick={() => { setBuffer(block.text ?? ""); setEditing(block.id); }}>{block.text || "Untitled section"}</h3>
                  )
                )}

                {block.kind === "commentary" && (
                  editing === block.id ? (
                    <TextArea
                      autoFocus
                      rows={4}
                      value={buffer}
                      aria-label="Commentary"
                      onChange={(event) => setBuffer(event.target.value)}
                      onBlur={() => { patchBlock(block.id, { text: buffer }, "Commentary changed"); setEditing(null); }}
                    />
                  ) : (
                    <p onDoubleClick={() => { setBuffer(block.text ?? ""); setEditing(block.id); }}>{block.text || "Double-click to write the commentary."}</p>
                  )
                )}

                {(block.kind === "metric" || block.kind === "chart" || block.kind === "table") && measure && (
                  <Stack gap={2}>
                    {block.text && <strong>{block.text}</strong>}
                    <MeasureView
                      spec={{ measureIds: [measure.id], dimensionId: block.dimensionId, filters: body.filters ?? [] }}
                      viz={block.kind === "metric" ? "stat" : block.kind === "table" ? "table" : (block.viz ?? "bar")}
                      context={context}
                      title={block.text || measure.name}
                      onInspect={(id) => context.openOverlay("source inspection", { measureId: id })}
                    />
                    <p className="an-cite">
                      {check?.ok ? `Source: ${check.reason}` : `Not citable: ${check?.reason}`}
                    </p>
                  </Stack>
                )}

                {block.kind !== "heading" && block.kind !== "commentary" && !measure && (
                  <Notice tone="warning" title="This block names no measure">Choose one on the Data tab.</Notice>
                )}

                <Row gap={1} style={{ marginBlockStart: "var(--space-2)" }}>
                  <Button size="sm" variant="ghost" onClick={() => move(block.id, -1)}>Move up</Button>
                  <Button size="sm" variant="ghost" onClick={() => move(block.id, 1)}>Move down</Button>
                  {(block.kind === "heading" || block.kind === "commentary") && (
                    <Button size="sm" variant="ghost" onClick={() => { setBuffer(block.text ?? ""); setEditing(block.id); }}>Edit</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void write({ ...body, blocks: body.blocks.filter((item) => item.id !== block.id) }, "Block removed")}>Remove</Button>
                </Row>
              </div>
            );
          })}
        </Stack>
      </div>
    </Stack>
  );
}

/* ------------------------------ 004 overlays ------------------------------ */

export function ReportBlockOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const [kind, setKind] = useState<BlockKind>((context.overlayPayload as { kind?: BlockKind } | undefined)?.kind ?? "metric");
  const [text, setText] = useState("");
  const [measureId, setMeasureId] = useState("revenue.paid");
  const [dimensionId, setDimensionId] = useState("");
  const [viz, setViz] = useState<Viz>("bar");
  if (!record || record.collection !== "reports") return <Empty title="Open a report first" />;
  if (isQueryReport(record)) {
    return (
      <Stack gap={3}>
        <Notice tone="info" title="A query report has one figure">
          {record.title} is built from a collection, a measure, a grouping and filters on its Content tab. Headings, commentary and catalogue charts belong to a written report.
        </Notice>
        <Row gap={2}>
          <Button variant="primary" onClick={() => { close(); context.openOverlay("create report"); }}>Create a written report</Button>
          <Button variant="ghost" onClick={close}>Close</Button>
        </Row>
      </Stack>
    );
  }
  const body = readReport(record);

  return (
    <Stack gap={4}>
      <Field label="Block kind">
        <Select aria-label="Block kind" value={kind} onChange={(event) => setKind(event.target.value as BlockKind)}>
          <option value="heading">Heading</option>
          <option value="commentary">Commentary written by a person</option>
          <option value="metric">A single figure</option>
          <option value="chart">A chart</option>
          <option value="table">A table</option>
        </Select>
      </Field>
      <Field label={kind === "heading" ? "Heading" : "Label"}><TextInput value={text} onChange={(event) => setText(event.target.value)} /></Field>
      {kind !== "heading" && kind !== "commentary" && (
        <>
          <MeasurePicker value={measureId} onChange={setMeasureId} />
          {kind !== "metric" && <DimensionPicker value={dimensionId} onChange={setDimensionId} />}
          {kind === "chart" && (
            <Field label="Chart">
              <Select aria-label="Chart" value={viz} onChange={(event) => setViz(event.target.value as Viz)}>
                {(["bar", "line", "donut"] as Viz[]).map((item) => <option key={item} value={item}>{VIZ_LABELS[item]}</option>)}
              </Select>
            </Field>
          )}
        </>
      )}
      {kind === "commentary" && (
        <Notice tone="info" title="Commentary is written by a person">
          No model is connected, so nothing here writes prose for you. The report says who prepared it.
        </Notice>
      )}
      <Button
        variant="primary"
        onClick={async () => {
          const block: ReportBlock = {
            id: `b${body.blocks.length + 1}-${wallMs().toString(36)}`,
            kind,
            text: text.trim() || undefined,
            measureId: kind === "heading" || kind === "commentary" ? undefined : measureId,
            dimensionId: kind === "chart" || kind === "table" ? (dimensionId || undefined) : undefined,
            viz: kind === "chart" ? viz : undefined,
          };
          await context.mutate.patch(record.id, { body: { ...body, blocks: [...body.blocks, block] } }, { event: `Report block added (${kind})` });
          context.toast("Block added", kind === "heading" || kind === "commentary" ? "Double-click it in the report to write it." : "It recomputes from the records behind the measure.");
          close();
        }}
      >
        Add the block
      </Button>
    </Stack>
  );
}

export function SourceInspection({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const { context: queryContext } = useAnalytics();
  if (!record || record.collection !== "reports") return <Empty title="Open a report first" />;
  if (isQueryReport(record)) {
    return (
      <Stack gap={3}>
        <Notice tone="info" title="A query report has one figure">
          {record.title} is built from a collection, a measure, a grouping and filters on its Content tab. Headings, commentary and catalogue charts belong to a written report.
        </Notice>
        <Row gap={2}>
          <Button variant="primary" onClick={() => { close(); context.openOverlay("create report"); }}>Create a written report</Button>
          <Button variant="ghost" onClick={close}>Close</Button>
        </Row>
      </Stack>
    );
  }
  const body = readReport(record);
  const checks = checkBlocks(body, context, queryContext);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Report", value: record.title },
        { label: "Figures in the report", value: String(checks.length) },
        { label: "Citable", value: <Pill tone={checks.every((check) => check.ok) ? "success" : "warning"}>{checks.filter((check) => check.ok).length} of {checks.length}</Pill> },
      ]} />
      {checks.length === 0 && <Empty title="No figure to cite">Headings and commentary carry no source of their own.</Empty>}
      {checks.map((check) => {
        const measure = check.block.measureId ? measureById(check.block.measureId) : undefined;
        return (
          <div key={check.block.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}>
              <strong className="ds-grow">{check.block.text || measure?.name || "Block"}</strong>
              <Pill tone={check.ok ? "success" : "warning"} dot>{check.ok ? "citable" : "not citable"}</Pill>
            </Row>
            {measure && (
              <Properties rows={[
                { label: "Measure", value: measure.name },
                { label: "Formula", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{measure.formula}</code> },
                { label: "Collection", value: measure.collection },
                { label: "Grouped by", value: dimensionById(check.block.dimensionId)?.name ?? "nothing" },
                { label: "Newest record", value: check.asOf ? `${context.date(check.asOf)} (${check.ageDays} days old)` : "Unknown" },
                { label: "Figure now", value: check.value === undefined || check.value === null ? "Unavailable" : formatMeasure(measure, check.value, context.money) },
              ]} />
            )}
            <p className="an-cite">{check.reason}</p>
          </div>
        );
      })}
    </Stack>
  );
}

export function ScheduleOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.selectedId ?? context.params.id);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  if (!record) return <Empty title="Open a report first" />;
  const current = readSchedule(record.fields, context.org.timezone);
  const merged = { ...current, frequency: (frequency ?? current.frequency) as typeof current.frequency, hour: hour ?? current.hour };
  const preview = nextOccurrences(merged, context.now, 3);

  return (
    <Stack gap={4}>
      <Field label="Frequency">
        <Select aria-label="Frequency" value={merged.frequency} onChange={(event) => setFrequency(event.target.value)}>
          {["daily", "weekly", "monthly"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Hour (local)"><TextInput aria-label="Hour (local)" type="number" min={0} max={23} value={String(merged.hour)} onChange={(event) => setHour(Number(event.target.value))} /></Field>
      <Stack gap={1}>
        <strong>Next runs</strong>
        {preview.map((item, index) => <Row key={`${index}-${item.at.toISOString()}`} gap={2}><span className="ds-grow">{item.localLabel}</span>{item.dstShift && <Pill tone="warning">offset changed</Pill>}</Row>)}
      </Stack>
      <Notice tone="warning" title="A schedule here is a record, not a job">
        Nothing in this browser wakes up to build and send the report. The schedule says what should happen, and the distribution screen records each prepared delivery.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(record.id, {
            fields: { ...record.fields, scheduleFrequency: merged.frequency, scheduleHour: merged.hour, scheduleTimezone: merged.timezone },
          }, { expectRevision: record.revision, event: "Report schedule changed" });
          context.toast("Schedule recorded", describeSchedule(merged));
          close();
        }}
      >
        Save the schedule
      </Button>
    </Stack>
  );
}

export function CreateReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [audience, setAudience] = useState("Owners");
  const [kind, setKind] = useState<"query" | "written">("query");
  const [collection, setCollection] = useState("invoices");
  const pool = useCollection(collection);
  return (
    <form
      id="create-report"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const base = { period, audience, scheduleFrequency: period === "weekly" ? "weekly" : "monthly", scheduleHour: 8, scheduleTimezone: context.org.timezone };
        const created = kind === "query"
          ? await context.mutate.create({
            collection: "reports",
            title: title.trim() || `${collection.charAt(0).toUpperCase()}${collection.slice(1)} report`,
            status: "draft",
            summary: `A query over ${collection}. ${EXPLORE_SOURCE_LABEL}.`,
            fields: { ...base, kind: "query", queryCollection: collection },
            body: newQueryBody(collection, pool),
          }, "Query report created")
          : await context.mutate.create({
            collection: "reports",
            title: title.trim() || "Untitled report",
            status: "draft",
            summary: `A ${period} report for ${audience}.`,
            fields: base,
            body: {
              blocks: [
                { id: "b1", kind: "heading", text: "Summary" },
                { id: "b2", kind: "metric", measureId: "revenue.paid", text: "Revenue recognised" },
                { id: "b3", kind: "commentary", text: "" },
              ],
              filters: [],
            },
          }, "Report created");
        context.toast("Report created", kind === "query"
          ? `${created.title} reads ${collection} from this workspace. Choose the measure, grouping and filters.`
          : `${created.title} starts with one figure and an empty commentary block.`);
        context.navigate(`/o/${context.org.slug}/analytics/reports/${created.id}`);
        close();
      }}
    >
      <Field label="Report name" required><TextInput aria-label="Report name" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Monthly trading review" /></Field>
      <Field label="Kind of report">
        <Select aria-label="Kind of report" value={kind} onChange={(event) => setKind(event.target.value as "query" | "written")}>
          <option value="query">Query report: one collection, a measure, a grouping and filters</option>
          <option value="written">Written report: headings, commentary and catalogue figures</option>
        </Select>
      </Field>
      {kind === "query" && (
        <Field label="Records to report on" hint={`${pool.length} ${collection} record${pool.length === 1 ? "" : "s"} in this workspace`}>
          <Select aria-label="Records to report on" value={collection} onChange={(event) => setCollection(event.target.value)}>
            {ANALYTICS_COLLECTIONS.filter((name) => name !== "accounts").map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Period">
        <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {["weekly", "monthly", "quarterly"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Audience">
        <Select aria-label="Audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
          {["Owners", "Finance", "The whole workspace", "A client"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
    </form>
  );
}

/* ====================================================================== *
 * ARL-ANALYTICS-009 — Reports & distribution
 * ====================================================================== */

export interface DeliveryRow {
  record: Rec;
  reportTitle: string;
  recipient: string;
  periodKey: string;
  state: string;
  duplicate: boolean;
}

export function useDeliveries(): DeliveryRow[] {
  const deliveries = useCollection("reportDeliveries");
  const reports = useCollection("reports");
  return useMemo(() => {
    const seen = new Set<string>();
    return [...deliveries]
      .sort((left, right) => String(left.at ?? left.createdAt).localeCompare(String(right.at ?? right.createdAt)))
      .map((record) => {
        const key = `${record.fields.reportId}|${record.fields.periodKey}|${record.fields.recipient}`;
        const duplicate = seen.has(key);
        seen.add(key);
        return {
          record,
          reportTitle: reports.find((report) => report.id === record.fields.reportId)?.title ?? String(record.fields.reportId ?? "unknown report"),
          recipient: String(record.fields.recipient ?? "unknown"),
          periodKey: String(record.fields.periodKey ?? ""),
          state: record.status,
          duplicate,
        };
      })
      .reverse();
  }, [deliveries, reports]);
}

function recipientsOf(contacts: Rec[], members: Rec[]): { name: string; address: string; consent: string | null; kind: "contact" | "member" }[] {
  return [
    ...members.map((member) => ({
      name: member.title,
      address: String(member.fields.email ?? `${member.title.split(" ")[0].toLowerCase()}@northline.example`),
      consent: "internal",
      kind: "member" as const,
    })),
    ...contacts.map((contact) => ({
      name: contact.title,
      address: String(contact.fields.email ?? ""),
      consent: contact.fields.consent ? String(contact.fields.consent) : null,
      kind: "contact" as const,
    })),
  ];
}

export function Distribution({ context, tab }: { context: ScreenContext; tab: string }) {
  const reports = useCollection("reports");
  const contacts = useCollection("contacts");
  const members = useCollection("members");
  const deliveries = useDeliveries();
  const { now } = useWorkspace();
  const capability = capabilityById("email.send")!;

  if (tab === "Audiences") {
    const people = recipientsOf(contacts, members);
    const blocked = people.filter((person) => person.kind === "contact" && !person.consent);
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Possible recipients" value={String(people.length)} prov="human" meta={`${members.length} in the workspace, ${contacts.length} customers`} />
          <Stat label="With a recorded consent" value={String(people.filter((person) => person.consent).length)} prov="human" meta="Internal members count as internal" />
          <Stat label="Blocked" value={String(blocked.length)} prov="unknown" unavailable={blocked.length > 0} meta="No consent recorded against the contact" />
          <Stat label="Delivery channel" value="Not connected" unavailable prov="unknown" meta={capability.provider} />
        </StatRow>
        <Card eyebrow="AUDIENCE" title="Who a report may go to" subtitle="Consent is read from the contact record" prov="human" flush>
          <DataGrid
            rows={people.map((person, index) => ({ ...person, id: `${person.kind}-${index}-${person.name}` }))}
            rowId={(row) => row.id}
            label="Recipients"
            rowTone={(row) => (row.kind === "contact" && !row.consent ? "warning" : undefined)}
            columns={[
              { key: "name", header: "Recipient", primary: true, cell: (row) => row.name, filterValue: (row) => `${row.name} ${row.address}` },
              { key: "address", header: "Address", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.address || "not recorded"}</code> },
              { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "member" ? "neutral" : "info"}>{row.kind}</Pill> },
              { key: "consent", header: "Consent", cell: (row) => (row.consent ? <Pill tone="success" dot>{row.consent}</Pill> : <Pill tone="danger" dot>blocked — none recorded</Pill>) },
            ]}
          />
        </Card>
        {blocked.length > 0 && (
          <Notice tone="warning" title={`${blocked.length} recipient${blocked.length === 1 ? " is" : "s are"} blocked`}>
            {blocked.map((person) => person.name).join(", ")} have no consent recorded on their contact record, so they cannot be added to an audience here.
          </Notice>
        )}
      </Stack>
    );
  }

  if (tab === "Deliveries") {
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Deliveries prepared" value={String(deliveries.length)} prov="human" meta="Each one is a record in this workspace" />
          <Stat label="Sent" value="0" prov="unknown" unavailable meta={`${capability.label} is ${CAPABILITY_LABELS[capability.state].toLowerCase()}`} />
          <Stat label="Duplicates suppressed" value={String(deliveries.filter((row) => row.duplicate).length)} prov="human" meta="Same report, period and recipient" />
          <Stat label="Reports" value={String(reports.length)} prov="human" meta={`${reports.filter((report) => report.status === "published").length} published`} />
        </StatRow>
        <Card eyebrow="DELIVERIES" title="Every delivery this workspace has prepared" prov="human" flush>
          {deliveries.length === 0 ? (
            <Empty title="No delivery prepared" icon={<Send size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Recipient preview")}>Prepare one</Button>}>
              Preparing a delivery renders the report for one recipient and records it. Nothing is sent, because no mail provider is connected.
            </Empty>
          ) : (
            <DataGrid
              rows={deliveries.map((row) => ({ ...row, id: row.record.id }))}
              rowId={(row) => row.id}
              label="Deliveries"
              rowTone={(row) => (row.duplicate ? "warning" : undefined)}
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              columns={[
                { key: "report", header: "Report", primary: true, cell: (row) => row.reportTitle, filterValue: (row) => `${row.reportTitle} ${row.recipient}` },
                { key: "recipient", header: "Recipient", cell: (row) => row.recipient },
                { key: "period", header: "Period", cell: (row) => <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{row.periodKey}</code> },
                { key: "state", header: "State", cell: (row) => <Pill tone={row.state === "queued_local" ? "info" : row.state === "blocked" ? "warning" : "neutral"} dot>{row.state}</Pill> },
                { key: "dup", header: "Deduplication", cell: (row) => (row.duplicate ? <Pill tone="warning">duplicate suppressed</Pill> : <Pill tone="success">first for this period</Pill>) },
                { key: "when", header: "Prepared", align: "end", cell: (row) => context.dateTime(row.record.at ?? row.record.createdAt), sortValue: (row) => row.record.at ?? "" },
              ]}
            />
          )}
        </Card>
      </Stack>
    );
  }

  if (tab === "Failures") {
    const failures = deliveries.filter((row) => row.state === "blocked" || row.duplicate);
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Nothing has been delivered, and nothing claims to have been">
          {capability.note} {capability.localEquivalent} Every prepared delivery sits at the provider boundary; a delivery is recorded as blocked rather than failed, because no attempt was made.
        </Notice>
        {failures.length === 0 ? (
          <Empty title="No blocked or duplicated delivery" icon={<AlertTriangle size={20} />}>Prepared deliveries appear here when they stop at the boundary or repeat a period.</Empty>
        ) : (
          <Card eyebrow="BLOCKED" title="Deliveries that did not go out" prov="unknown" flush>
            <DataGrid
              rows={failures.map((row) => ({ ...row, id: row.record.id }))}
              rowId={(row) => row.id}
              label="Blocked deliveries"
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              onOpen={() => context.openOverlay("failure detail")}
              columns={[
                { key: "report", header: "Report", primary: true, cell: (row) => row.reportTitle },
                { key: "recipient", header: "Recipient", cell: (row) => row.recipient },
                { key: "why", header: "Why", cell: (row) => (row.duplicate ? "A delivery for this report, period and recipient already exists" : `${capability.label} is ${CAPABILITY_LABELS[capability.state].toLowerCase()}`) },
                { key: "when", header: "Prepared", align: "end", cell: (row) => context.relative(row.record.at ?? row.record.createdAt) },
              ]}
            />
          </Card>
        )}
      </Stack>
    );
  }

  /* Schedules */
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Reports" value={String(reports.length)} prov="human" meta={`${reports.filter((report) => report.status === "published").length} published`} />
        <Stat label="Scheduled" value={String(reports.filter((report) => report.fields.scheduleFrequency).length)} prov="human" meta="Recorded recurrences, not running jobs" />
        <Stat label="Next run" value={reports.length ? nextOccurrences(readSchedule(reports[0].fields, context.org.timezone), now, 1)[0]?.localLabel ?? "Unavailable" : "Unavailable"} unavailable={reports.length === 0} prov={reports.length ? "human" : "unknown"} meta={context.org.timezone} />
        <Stat label="Delivery channel" value="Not connected" unavailable prov="unknown" meta={capability.provider} />
      </StatRow>

      <Notice tone="warning" title="No scheduler runs in this browser">
        A schedule here records when a report should be built and to whom it should go. Building and sending need a server and a mail provider; neither exists, so nothing fires on its own.
      </Notice>

      <Card eyebrow="SCHEDULES" title="Scheduled reports" prov="human" flush>
        {reports.length === 0 ? (
          <Empty title="No report to schedule" icon={<CalendarClock size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("create report")}>Create a report</Button>}>
            Create a report first; its schedule then appears here.
          </Empty>
        ) : (
          <DataGrid
            rows={reports}
            rowId={(row) => row.id}
            label="Scheduled reports"
            selectedId={context.selectedId}
            onSelect={(id) => context.select(id)}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/analytics/reports/${id}`)}
            columns={[
              { key: "title", header: "Report", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "schedule", header: "Recurrence", cell: (row) => describeSchedule(readSchedule(row.fields, context.org.timezone)) },
              { key: "audience", header: "Audience", cell: (row) => String(row.fields.audience ?? "—") },
              { key: "paused", header: "State", cell: (row) => <Pill tone={row.fields.schedulePaused === true ? "warning" : "success"} dot>{row.fields.schedulePaused === true ? "paused" : "active"}</Pill> },
              {
                key: "next", header: "Next run", align: "end",
                cell: (row) => (row.fields.schedulePaused === true ? "—" : nextOccurrences(readSchedule(row.fields, context.org.timezone), now, 1)[0]?.localLabel ?? "—"),
              },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

/* ------------------------------ 009 overlays ------------------------------ */

export function RecipientPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const reports = useCollection("reports");
  const contacts = useCollection("contacts");
  const members = useCollection("members");
  const deliveries = useDeliveries();
  const { context: queryContext } = useAnalytics();
  /* The choice follows the loaded reports until a person picks one, so it is
     never fixed from the empty first read. */
  const [pickedReport, setReportId] = useState<string>();
  const reportId = pickedReport
    ?? (context.selectedId && reports.some((item) => item.id === context.selectedId) ? context.selectedId : reports[0]?.id ?? "");
  const [recipient, setRecipient] = useState("");
  const report = reports.find((item) => item.id === reportId);
  const people = recipientsOf(contacts, members);
  const chosen = people.find((person) => person.name === recipient);

  if (!report) return <Empty title="No report to prepare" >Create a report first.</Empty>;

  const body = readReport(report);
  const checks = checkBlocks(body, context, queryContext);
  const blockers = checks.filter((check) => !check.ok);
  const periodKey = `${context.now.getFullYear()}-${String(context.now.getMonth() + 1).padStart(2, "0")}`;
  const duplicate = deliveries.some((row) => row.record.fields.reportId === reportId && row.periodKey === periodKey && row.recipient === recipient);
  const unauthorised = chosen?.kind === "contact" && !chosen.consent;

  return (
    <Stack gap={4}>
      <Field label="Report">
        <Select aria-label="Report" value={reportId} onChange={(event) => setReportId(event.target.value)}>
          {reports.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Recipient">
        <Select aria-label="Recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)}>
          <option value="">Choose a recipient</option>
          {people.map((person, personIndex) => <option key={`${person.kind}-${person.name}-${personIndex}`} value={person.name}>{person.name} ({person.kind}{person.consent ? "" : ", no consent"})</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Period key", value: <code className="ds-num">{periodKey}</code> },
        { label: "Figures in the report", value: String(checks.length) },
        { label: "Citable figures", value: `${checks.filter((check) => check.ok).length} of ${checks.length}` },
      ]} />
      {unauthorised && <Notice tone="danger" title="This recipient is blocked">No consent is recorded on {chosen?.name}'s contact record, so a delivery cannot be prepared for them.</Notice>}
      {duplicate && <Notice tone="warning" title="A delivery already exists for this period">The same report, period and recipient has already been prepared. Preparing it again would duplicate the send once a provider exists.</Notice>}
      {blockers.length > 0 && <Notice tone="warning" title="The report has figures that cannot be cited">{blockers.map((check) => check.reason).join(" ")}</Notice>}
      <Button
        variant="primary"
        icon={<Mail size={15} />}
        disabled={!recipient || unauthorised || duplicate}
        onClick={async () => {
          await context.mutate.create({
            collection: "reportDeliveries",
            title: `${report.title} → ${recipient}`,
            status: "queued_local",
            summary: `Rendered locally for ${recipient}. No mail provider is connected, so nothing was sent.`,
            parentId: report.id,
            at: new Date(context.now).toISOString(),
            fields: {
              reportId: report.id,
              recipient,
              periodKey,
              channel: "email",
              capability: "email.send",
              citable: checks.filter((check) => check.ok).length,
              figures: checks.length,
            },
          }, `Delivery prepared for ${recipient}, not sent`);
          context.toast("Prepared, not sent", "The delivery is recorded as queued locally. No mail provider is connected, so nothing left this browser.", "blocked");
          close();
        }}
      >
        Prepare the delivery
      </Button>
    </Stack>
  );
}

export function DeliveryMethod({ context }: { context: ScreenContext }) {
  const capability = capabilityById("email.send")!;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Channel", value: "Email" },
        { label: "Provider", value: capability.provider },
        { label: "State", value: <Pill tone="warning" dot>{CAPABILITY_LABELS[capability.state]}</Pill> },
        { label: "Format", value: "The report as it renders here, with every figure recomputed at the moment of preparation" },
        { label: "Deduplication", value: "One delivery per report, period and recipient" },
      ]} />
      <Notice tone="warning" title="What happens when you prepare a delivery">
        {capability.localEquivalent} The delivery record keeps the recipient, the period and how many of the report's figures were citable at that moment.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/connections`)}>Open connections</Button>
    </Stack>
  );
}

export function FailureDetail({ context }: { context: ScreenContext }) {
  const record = useRecord(context.selectedId);
  const deliveries = useDeliveries();
  const row = deliveries.find((item) => item.record.id === context.selectedId);
  const capability = capabilityById("email.send")!;
  if (!record || !row) return <Empty title="Choose a delivery" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Report", value: row.reportTitle },
        { label: "Recipient", value: row.recipient },
        { label: "Period", value: row.periodKey },
        { label: "State", value: <Pill tone="warning" dot>{record.status}</Pill> },
        { label: "Prepared", value: context.dateTime(record.at ?? record.createdAt) },
        { label: "Citable figures at the time", value: `${record.fields.citable ?? 0} of ${record.fields.figures ?? 0}` },
      ]} />
      <Notice tone="warning" title={row.duplicate ? "Suppressed as a duplicate" : `${capability.label} is ${CAPABILITY_LABELS[capability.state].toLowerCase()}`}>
        {row.duplicate
          ? "A delivery for this report, period and recipient already existed. Sending both would deliver the same report twice."
          : `${capability.note} ${capability.localEquivalent}`}
      </Notice>
      <Checkbox label="Resending is safe: this period has not reached the recipient" disabled checked={false} onChange={() => undefined} />
      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        The box is fixed because nothing can confirm what reached anyone. Use Resend safely on the toolbar to record a delivery under a new period key instead.
      </p>
    </Stack>
  );
}
