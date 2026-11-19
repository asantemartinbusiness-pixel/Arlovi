import { useState } from "react";
import { Button, Card, Empty, Grid, KeyValueList, Meter, Pill, Row, Stack } from "@/design-system";
import { Inbox } from "lucide-react";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { downloadFile } from "@/applications/t6kit/kit";
import { FIELD_LABELS, type FormModel } from "./model";
import { resultsCsv, resultsTable, summariseForm, type QuestionSummary } from "./responses";

/* ====================================================================== *
 * Results table and per-question summary, both read straight from the
 * submission records of one form.
 * ====================================================================== */

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function exportResultsCsv(context: ScreenContext, record: Rec, model: FormModel, submissions: Rec[]): void {
  const table = resultsTable(model, submissions, { reveal: false });
  const sensitive = model.fields.filter((field) => field.sensitive).length;
  downloadFile(
    `${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-responses.csv`,
    resultsCsv(table),
    "text/csv",
  );
  void context.mutate.log(`${table.rows.length} responses exported to CSV${sensitive ? " with sensitive answers redacted" : ""}`, { entityId: record.id, type: "export" });
  context.toast("Exported", `${table.rows.length} responses written to CSV, one column per question${sensitive ? "; sensitive answers redacted" : ""}.`);
}

export function ResultsTableView({ context, record, model, submissions }: { context: ScreenContext; record: Rec; model: FormModel; submissions: Rec[] }) {
  const [reveal, setReveal] = useState(false);
  const table = resultsTable(model, submissions, { reveal });
  const sensitive = model.fields.filter((field) => field.sensitive).length;
  if (submissions.length === 0) {
    return <Empty title="No responses to tabulate" icon={<Inbox size={20} />}>Answer the form on its Design & publish screen and each response becomes a row here.</Empty>;
  }
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <span className="ds-grow ds-subtle">{table.rows.length} responses × {table.header.length - 4} questions. Blank cells were skipped or hidden by a rule.</span>
        {sensitive > 0 && (
          <Button size="sm" variant="ghost" aria-pressed={reveal} onClick={() => {
            setReveal(!reveal);
            void context.mutate.log(`${reveal ? "Hid" : "Revealed"} sensitive answers in the results table of ${record.title}`, { entityId: record.id, type: "privacy" });
          }}>{reveal ? "Hide sensitive answers" : "Reveal sensitive answers"}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => exportResultsCsv(context, record, model, submissions)}>Download results CSV</Button>
      </Row>
      <div className="forms-results-wrap" role="region" aria-label="Results table" tabIndex={0}>
        <table className="forms-results">
          <thead>
            <tr>{table.header.map((label, index) => <th key={`${label}-${index}`} scope="col">{label}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={index === 0 ? "ds-num" : undefined}>
                    {index === 0 ? context.dateTime(cell) : cell || <span className="ds-subtle">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ds-subtle">The CSV always carries <code>[redacted]</code> for sensitive questions; revealing them here is logged and does not change the export.</p>
    </Stack>
  );
}

function SummaryBody({ summary, total }: { summary: QuestionSummary; total: number }) {
  if (summary.answered === 0) return <p className="ds-subtle">No one has answered this yet.</p>;
  if (summary.kind === "choice") {
    const max = Math.max(1, ...summary.options.map((option) => option.count));
    return (
      <Stack gap={2}>
        {summary.options.map((option) => (
          <div key={option.label} className="forms-bar">
            <Row gap={2}><span className="ds-grow ds-truncate">{option.label}</span><span className="ds-num">{option.count}</span></Row>
            <Meter value={option.count} max={max} label={`${option.label}: ${option.count}`} />
          </div>
        ))}
        {summary.other > 0 && <p className="ds-subtle">{summary.other} answer{summary.other === 1 ? "" : "s"} no longer match a listed option (the options changed after they were given).</p>}
      </Stack>
    );
  }
  if (summary.kind === "number") {
    return (
      <KeyValueList items={[
        { label: "Average", value: <span className="ds-num">{formatNumber(summary.mean)}</span> },
        { label: "Median", value: <span className="ds-num">{formatNumber(summary.median)}</span> },
        { label: "Lowest – highest", value: <span className="ds-num">{`${formatNumber(summary.min)} – ${formatNumber(summary.max)}`}</span> },
        ...(summary.invalid ? [{ label: "Not a number", value: <span className="ds-num">{String(summary.invalid)}</span> }] : []),
      ]} />
    );
  }
  if (summary.kind === "boolean") {
    return (
      <Stack gap={2}>
        <Row gap={2}><span className="ds-grow">Yes</span><span className="ds-num">{summary.yes}</span></Row>
        <Meter value={summary.yes} max={Math.max(1, total)} tone="success" label={`Yes: ${summary.yes}`} />
        <Row gap={2}><span className="ds-grow">No</span><span className="ds-num">{summary.no}</span></Row>
      </Stack>
    );
  }
  return (
    <Stack gap={2}>
      <span className="ds-subtle">{summary.distinct} distinct answer{summary.distinct === 1 ? "" : "s"}. Most recent:</span>
      <ul className="forms-recent">
        {summary.recent.map((text, index) => <li key={index}>{text}</li>)}
      </ul>
    </Stack>
  );
}

export function QuestionSummaryView({ model, submissions }: { model: FormModel; submissions: Rec[] }) {
  const summaries = summariseForm(model, submissions);
  if (submissions.length === 0) {
    return <Empty title="Nothing to summarise yet" icon={<Inbox size={20} />}>Each question gets a summary once the form has been answered.</Empty>;
  }
  if (summaries.length === 0) return <Empty title="This form has no questions" icon={<Inbox size={20} />} />;
  return (
    <Grid>
      {summaries.map((summary) => {
        const sensitive = summary.field.sensitive;
        return (
          <Card key={summary.field.id} span={6} eyebrow={FIELD_LABELS[summary.field.type].toUpperCase()} prov="posted"
            title={summary.field.label}
            subtitle={`${summary.answered} answered · ${summary.skipped} skipped or hidden`}
            actions={summary.field.required ? <Pill tone="warning">required</Pill> : undefined}>
            {sensitive
              ? <p className="ds-subtle">Marked sensitive, so only counts are summarised: {summary.answered} answered.</p>
              : <SummaryBody summary={summary} total={submissions.length} />}
          </Card>
        );
      })}
    </Grid>
  );
}
