import { useState } from "react";
import { Button, Notice, Pill, Row } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { clockIso } from "@/platform/clock";
import type { FormModel } from "./model";
import { STRUCTURAL } from "./model";
import { answeredCount, readPreviewRuns, staleLabels, withPreviewRun, type PreviewRun } from "./previewRuns";

function bodyOf(record: Rec): Record<string, unknown> {
  return record.body && typeof record.body === "object" && !Array.isArray(record.body) ? record.body as Record<string, unknown> : {};
}

/** Keep a finished preview on the form record. It is never written to the submissions collection. */
export async function keepPreviewRun(
  context: ScreenContext, record: Rec, model: FormModel, device: "mobile" | "desktop",
  run: { answers: [string, string][]; hidden: number },
): Promise<boolean> {
  const entry: PreviewRun = {
    id: `pr${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    at: clockIso(),
    by: context.actor,
    version: model.settings.version,
    device,
    answers: run.answers,
    hidden: run.hidden,
  };
  const previewRuns = withPreviewRun(readPreviewRuns(record), entry);
  const saved = await context.mutate.patch(record.id, { body: { ...bodyOf(record), previewRuns } }, {
    expectRevision: record.revision,
    event: `Preview run of ${record.title} (version ${model.settings.version}) kept on the form; not a response`,
  });
  return saved !== null;
}

export function PreviewRunsPanel({ context, record, model }: { context: ScreenContext; record: Rec; model: FormModel }) {
  const runs = readPreviewRuns(record);
  const [openId, setOpenId] = useState<string>("");
  const labels = model.fields.filter((field) => !STRUCTURAL.includes(field.type)).map((field) => field.label);
  const open = runs.find((run) => run.id === openId) ?? runs[0];

  return (
    <section className="forms-preview-runs" aria-label="Preview runs">
      <Row gap={2} wrap>
        <div className="ds-grow">
          <h3>Preview runs</h3>
          <p className="ds-subtle">Each finished preview is kept here to check answers and logic. Runs are never responses: the inbox, analytics, retention and exports do not count them.</p>
        </div>
        {runs.length > 0 && (
          <Button size="sm" variant="ghost" onClick={async () => {
            const saved = await context.mutate.patch(record.id, { body: { ...bodyOf(record), previewRuns: [] } }, { expectRevision: record.revision, event: `Preview runs of ${record.title} cleared` });
            if (saved) setOpenId("");
          }}>Clear preview runs</Button>
        )}
      </Row>
      {runs.length === 0 ? (
        <p className="ds-subtle" role="status">No preview runs yet. Answer the form above and choose “Check the answers”.</p>
      ) : (
        <div className="forms-preview-runs-body">
          <ol className="forms-preview-run-list" aria-label="Kept preview runs">
            {runs.map((run) => (
              <li key={run.id}>
                <button type="button" aria-pressed={open?.id === run.id} onClick={() => setOpenId(run.id)}>
                  <strong>{context.dateTime(run.at)}</strong>
                  <span>v{run.version} · {run.device} · {answeredCount(run)} of {run.answers.length} answered{run.hidden ? ` · ${run.hidden} hidden by logic` : ""}</span>
                </button>
              </li>
            ))}
          </ol>
          {open && (
            <div className="forms-preview-run-detail" aria-label="Preview run answers">
              <Row gap={2} wrap>
                <span className="ds-subtle">Run by {open.by || "unknown"}</span>
                {open.version !== model.settings.version && <Pill tone="warning">answered version {open.version}; the form is now version {model.settings.version}</Pill>}
              </Row>
              {staleLabels(open, labels).length > 0 && (
                <Notice tone="warning" title="Questions changed since this run">
                  {staleLabels(open, labels).join(", ")} {staleLabels(open, labels).length === 1 ? "is" : "are"} no longer on the form.
                </Notice>
              )}
              <dl>
                {open.answers.map(([label, value], index) => (
                  <div key={`${label}-${index}`}>
                    <dt>{label}</dt>
                    <dd>{value.trim() ? value : <span className="ds-subtle">Skipped</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
