import { useMemo } from "react";
import { FlaskConical, Play, X } from "lucide-react";
import { Button, Card, Empty, Field, Notice, Pill, Properties, Row, Select, Stack } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { RUN_STATUS_LABELS, runStatusTone, stepStatusTone } from "./engine";
import { executeDry } from "./runner";
import { describePath, sampleOptions } from "./schema";
import { updateDraft, type BuilderDraft } from "./store";

/* ====================================================================== *
 * ARL-AUTO-002 — local test of the graph being edited.
 *
 * The interpreter walks the draft graph in dry-run mode with the record the
 * person chose, evaluates every condition against it and reports the path
 * taken step by step. Nothing is written, sent or called: a dry run never
 * applies its writes and stops every provider step at the boundary.
 * ====================================================================== */

export const LOCAL_TEST_LABEL = "Local test — no external actions performed";

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} values` : "(record)";
  return String(value);
}

export function LocalTestPanel({ context, record, draft, pool }: { context: ScreenContext; record: Rec; draft: BuilderDraft; pool: Rec[] }) {
  const graph = draft.graph;
  const samples = useMemo(() => sampleOptions(graph, pool, context.now), [graph, pool, context.now]);
  const approvals = graph.nodes.filter((node) => node.type === "approval");
  const run = draft.dryRun;
  const path = run ? describePath(graph, run) : undefined;
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  const sampleMissing = draft.sampleId && !samples.some((sample) => sample.id === draft.sampleId);

  function runTest() {
    const result = executeDry({ graph, pool, context, fixture: draft.fixture, sampleId: draft.sampleId || undefined, decisions: draft.testDecisions });
    updateDraft(record.id, { dryRun: result, dryRunAt: new Date(context.now).toISOString() });
    context.toast("Local test finished", `${result.steps.length} step${result.steps.length === 1 ? "" : "s"}, ${RUN_STATUS_LABELS[result.status].toLowerCase()}. Nothing was written, sent or called.`, result.status === "failed" ? "failed" : "info");
  }

  const variables = run ? Object.entries(run.variables).filter(([key]) => key !== "record" && key !== "trigger") : [];
  const bound = run?.variables.record as Record<string, unknown> | undefined;

  return (
    <Card
      eyebrow="LOCAL TEST"
      title="Test the path with a sample record"
      subtitle="Evaluated in this browser against the graph as it is now, saved or not"
      prov="agent"
      className="auto-localtest"
      aria-label="Local test"
      actions={run ? <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => updateDraft(record.id, { dryRun: undefined, dryRunAt: undefined })}>Clear result</Button> : undefined}
    >
      <Stack gap={4}>
        <Notice tone="info" title={LOCAL_TEST_LABEL}>
          The interpreter evaluates every condition against the chosen record. No record is written, no message is sent and no provider is called; a high-impact step is shown as not run.
        </Notice>
        <div className="auto-localtest-controls">
          <Field label="Sample record" hint={trigger?.config?.collection ? `${samples.length} ${trigger.config.collection} record${samples.length === 1 ? "" : "s"} in this workspace` : "Choose the trigger's collection first"}>
            <Select aria-label="Sample record" value={draft.sampleId ?? ""} onChange={(event) => updateDraft(record.id, { sampleId: event.target.value || undefined })} disabled={samples.length === 0}>
              <option value="">First record the trigger matches</option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>{sample.title}{sample.matches ? "" : " (does not match the trigger)"}</option>
              ))}
            </Select>
          </Field>
          {approvals.map((node) => (
            <Field key={node.id} label={`At “${node.label}”`}>
              <Select
                aria-label={`Decision assumed at ${node.label}`}
                value={draft.testDecisions?.[node.id] ?? ""}
                onChange={(event) => {
                  const next = { ...(draft.testDecisions ?? {}) };
                  if (event.target.value) next[node.id] = event.target.value as "approved" | "rejected";
                  else delete next[node.id];
                  updateDraft(record.id, { testDecisions: next });
                }}
              >
                <option value="">Stop and wait, as a real run would</option>
                <option value="approved">Assume it is approved</option>
                <option value="rejected">Assume it is rejected</option>
              </Select>
            </Field>
          ))}
          <div className="auto-localtest-run">
            <Button variant="primary" icon={<Play size={15} />} onClick={runTest} disabled={!trigger}>Run local test</Button>
          </div>
        </div>
        {sampleMissing && <Notice tone="warning" title="The chosen sample is gone">That record is no longer in the trigger's collection. The test will use the first match instead.</Notice>}

        {!run || !path ? (
          <Empty title="No local test yet" icon={<FlaskConical size={20} />}>
            Choose a sample record and run the test. The path it takes is listed here and highlighted on the canvas.
          </Empty>
        ) : (
          <Stack gap={3}>
            <Row gap={2} wrap>
              <Pill tone={runStatusTone(run.status)} dot>{RUN_STATUS_LABELS[run.status]}</Pill>
              <span className="ds-subtle">{run.message}</span>
              <span className="ds-grow" />
              {draft.dryRunAt && <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>Tested {context.dateTime(draft.dryRunAt)}{bound?.title ? ` with ${String(bound.title)}` : ""}</span>}
            </Row>
            <ol className="auto-path" aria-label="Path taken">
              {path.steps.map((step) => (
                <li key={`${step.index}-${step.nodeId}`} data-status={step.status}>
                  <button type="button" className="auto-path-node" onClick={() => updateDraft(record.id, { selectedNodeId: step.nodeId })}>
                    <span className="auto-path-index">{step.index + 1}</span>
                    <strong>{step.label}</strong>
                    <Pill tone={stepStatusTone(step.status)}>{step.status}</Pill>
                  </button>
                  <p>{step.decision}</p>
                  {step.next && <p className="ds-subtle auto-path-next">Next: {step.next}</p>}
                </li>
              ))}
            </ol>
            {path.notReached.length > 0 && (
              <p className="ds-subtle">Not reached on this path: {path.notReached.map((node) => node.label).join(", ")}.</p>
            )}
            {variables.length > 0 && (
              <Properties rows={variables.map(([key, value]) => ({ label: key, value: formatValue(value) }))} />
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
