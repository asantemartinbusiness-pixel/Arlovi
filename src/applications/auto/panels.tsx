import { AlertTriangle, CheckCircle2, CircleSlash, Clock, PauseCircle, XCircle } from "lucide-react";
import { Button, Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import {
  RUN_STATUS_LABELS, runStatusTone, stepStatusTone,
  type GraphIssue, type RunResult, type StepResult, type StoredRun,
} from "./engine";

export function readRun(record: Rec | undefined): StoredRun | undefined {
  const body = record?.body as Partial<StoredRun> | undefined;
  if (!body || !body.result || !Array.isArray(body.result.steps)) return undefined;
  return body as StoredRun;
}

export function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="ds-subtle" style={{ fontSize: "var(--text-xs)", marginBlockEnd: 4 }}>{label}</figcaption>
      <pre className="auto-code">{jsonText(value)}</pre>
    </figure>
  );
}

function stepIcon(status: StepResult["status"]) {
  if (status === "ok") return <CheckCircle2 size={12} />;
  if (status === "failed") return <XCircle size={12} />;
  if (status === "blocked") return <CircleSlash size={12} />;
  if (status === "waiting") return <PauseCircle size={12} />;
  return <Clock size={12} />;
}

export function RunHeadline({ run, context }: { run: RunResult; context: ScreenContext }) {
  const blocked = run.steps.filter((step) => step.status === "blocked").length;
  const failed = run.steps.filter((step) => step.status === "failed").length;
  return (
    <Notice
      tone={run.status === "completed" ? (blocked ? "warning" : "success") : run.status === "failed" ? "danger" : "warning"}
      title={`${RUN_STATUS_LABELS[run.status]} · ${run.steps.length} step${run.steps.length === 1 ? "" : "s"} in ${run.durationMs} ms`}
    >
      {run.message}
      {blocked > 0 && ` ${blocked} step${blocked === 1 ? "" : "s"} stopped at a provider boundary and did not run.`}
      {failed > 0 && ` ${failed} step${failed === 1 ? "" : "s"} failed.`}
      {run.mode === "dry" && " This was a dry run: no record was written."}
      {` Step budget used ${run.budget.used} of ${run.budget.max}. Started ${context.dateTime(run.startedAt)}.`}
    </Notice>
  );
}

export function RunTimeline({
  run, context, onInspect, redact,
}: {
  run: RunResult;
  context: ScreenContext;
  onInspect?: (step: StepResult) => void;
  redact?: boolean;
}) {
  if (run.steps.length === 0) return <Empty title="No step ran" icon={<AlertTriangle size={20} />}>The run stopped before the first node.</Empty>;
  return (
    <ol className="auto-timeline">
      {run.steps.map((step) => {
        const hidden = Boolean(redact && step.sensitive);
        return (
          <li key={`${step.nodeId}-${step.index}`}>
            <span className="auto-timeline-dot" data-tone={stepStatusTone(step.status)} aria-hidden="true">{stepIcon(step.status)}</span>
            <div>
              <Row gap={2} wrap>
                <strong className="ds-grow">{step.index + 1}. {step.label}</strong>
                <Pill tone={stepStatusTone(step.status)} dot>{step.status}</Pill>
                <span className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)" }}>{step.durationMs} ms</span>
              </Row>
              <p className="ds-subtle" style={{ marginBlock: 4 }}>{step.message}</p>
              <Row gap={2} wrap style={{ fontSize: "var(--text-xs)" }}>
                <span className="ds-subtle">{step.nodeType}</span>
                <span className="ds-subtle">·</span>
                <span className="ds-subtle">{step.attempts.length} attempt{step.attempts.length === 1 ? "" : "s"}</span>
                {step.branch && <><span className="ds-subtle">·</span><Pill tone={step.branch === "then" || step.branch === "approved" ? "success" : "warning"}>{step.branch}</Pill></>}
                <span className="ds-subtle">·</span>
                <code className="ds-num">{step.receipt}</code>
                {step.writes.length > 0 && <><span className="ds-subtle">·</span><Pill tone="info">{step.writes.length} write{step.writes.length === 1 ? "" : "s"}</Pill></>}
              </Row>
              {step.capability && (
                <div style={{ marginBlockStart: "var(--space-2)" }}>
                  <Pill tone={CAPABILITY_TONE[step.capability.state]} dot>{step.capability.label}: {CAPABILITY_LABELS[step.capability.state]}</Pill>
                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)", marginBlock: 4 }}>{step.capability.localEquivalent}</p>
                </div>
              )}
              {hidden ? (
                <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
                  Payload hidden from the {context.role} view. The role view shapes what this screen offers; it is not an account security boundary.
                </p>
              ) : onInspect ? (
                <Button size="sm" variant="ghost" onClick={() => onInspect(step)}>Inspect node trace</Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StepTrace({ step, context, redact }: { step: StepResult; context: ScreenContext; redact?: boolean }) {
  const hidden = Boolean(redact && step.sensitive);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Node", value: `${step.label} (${step.nodeId})` },
        { label: "Kind", value: step.nodeType },
        { label: "Outcome", value: <Pill tone={stepStatusTone(step.status)} dot>{step.status}</Pill> },
        { label: "Started", value: context.dateTime(step.startedAt) },
        { label: "Duration", value: `${step.durationMs} ms` },
        { label: "Receipt", value: <code className="ds-num">{step.receipt}</code> },
        { label: "Branch taken", value: step.branch ?? "—" },
      ]} />
      <p>{step.message}</p>
      {hidden ? (
        <Notice tone="warning" title="Payload redacted for this role view">
          This step is marked sensitive. Its input and output are not shown to the {context.role} view. Change the role view from the account menu if you hold that desk. This is interface shaping, not server-side enforcement.
        </Notice>
      ) : (
        <>
          <JsonBlock label="Input the step saw" value={step.input} />
          <JsonBlock label="Output the step produced" value={step.output} />
        </>
      )}
      {step.attempts.length > 0 && (
        <Stack gap={2}>
          <strong>Attempts</strong>
          {step.attempts.map((attempt) => (
            <Row key={attempt.n} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <Pill tone={attempt.outcome === "ok" ? "success" : attempt.outcome === "blocked" ? "warning" : "danger"}>#{attempt.n}</Pill>
              <span className="ds-grow" style={{ fontSize: "var(--text-xs)" }}>{attempt.message}</span>
              <span className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)" }}>backoff {attempt.backoffSeconds}s</span>
            </Row>
          ))}
        </Stack>
      )}
      {step.writes.length > 0 && <JsonBlock label="Record changes this step asked for" value={step.writes} />}
    </Stack>
  );
}

export function RunBindings({ run }: { run: RunResult }) {
  const entries = Object.entries(run.variables);
  if (entries.length === 0) return <Empty title="No variables were bound" >A trigger or a variable node binds values the later steps read.</Empty>;
  return (
    <Properties rows={entries.map(([key, value]) => ({
      label: key,
      value: typeof value === "object" && value !== null ? <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{Object.keys(value as object).length} fields</code> : String(value),
    }))} />
  );
}

export function ValidationPanel({ issues, onSelect }: { issues: GraphIssue[]; onSelect?: (nodeId: string) => void }) {
  if (issues.length === 0) {
    return <Notice tone="success" title="The graph passes every check">A trigger starts it, every node is reachable, each condition has a true branch and each action knows what it does.</Notice>;
  }
  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <Stack gap={2}>
      <Notice tone={errors.length ? "danger" : "warning"} title={`${errors.length} error${errors.length === 1 ? "" : "s"} and ${issues.length - errors.length} warning${issues.length - errors.length === 1 ? "" : "s"}`}>
        {errors.length ? "A workflow cannot be activated while an error remains." : "Warnings do not block activation but change what the run will do."}
      </Notice>
      {issues.map((issue) => (
        <Row key={issue.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
          <Pill tone={issue.severity === "error" ? "danger" : "warning"} dot>{issue.severity}</Pill>
          <div className="ds-grow">
            <strong>{issue.title}</strong>
            <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{issue.detail}</p>
          </div>
          {issue.nodeId && onSelect && <Button size="sm" variant="ghost" onClick={() => onSelect(issue.nodeId!)}>Open node</Button>}
        </Row>
      ))}
    </Stack>
  );
}

export function CapabilityNotice({ id }: { id: string }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return (
    <Notice tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : "warning"} title={`${capability.label} — ${CAPABILITY_LABELS[capability.state]}`}>
      {capability.note} {capability.localEquivalent}
    </Notice>
  );
}

export function RunStatusPill({ status }: { status: RunResult["status"] }) {
  return <Pill tone={runStatusTone(status)} dot>{RUN_STATUS_LABELS[status]}</Pill>;
}
