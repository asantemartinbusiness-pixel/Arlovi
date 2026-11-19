import { useMemo, useState } from "react";
import {
  Button, Checkbox, Empty, Field, FactGrid, ModalActions, Notice, OverlayActions, OverlayCancel, OverlaySection,
  OverlaySummary, Pill, Select, Stack,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { wallMs } from "@/platform/clock";
import { BoundaryNotice, CapabilityState, downloadFile } from "@/applications/t6kit/kit";
import { generatedFiles, issueTotals, readApp, validateApp, type AppModel, type Release } from "./model";
import { NoProject, useAppRecord } from "./builder";

/* ================================================================ *
 * Release boundary: inspect before deploy, and say what a rollback
 * actually changes before it changes it.
 * ================================================================ */

const envTone = (environment: string) => (environment === "production" ? "danger" : environment === "staging" ? "warning" : "neutral");

export function ReleaseSummary({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const payload = context.overlayPayload as { environment?: Release["environment"] } | undefined;
  if (!record) return null;
  const environment = payload?.environment ?? "production";
  const last = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  return (
    <OverlaySummary
      eyebrow="Project"
      title={record.title}
      status={<Pill tone={envTone(environment)} dot>{environment}</Pill>}
      meta={[`${model.entities.length} entities`, `${model.screens.length} screens`, last ? `Last attempt ${context.relative(last.at)}` : "No attempt yet"]}
    />
  );
}

export function ReleaseApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { environment?: Release["environment"] } | undefined;
  const environment = payload?.environment ?? "production";
  const [busy, setBusy] = useState(false);
  if (!record) return <NoProject />;
  const issues = validateApp(model);
  const totals = issueTotals(issues);
  const failing = issues.filter((issue) => issue.level === "fail");
  const paused = Boolean(record.fields.deploysPaused);
  const blockedBy = paused ? "Deployments are paused" : failing.length > 0 ? `${failing.length} failing ${failing.length === 1 ? "check" : "checks"}` : "";

  return (
    <Stack gap={4}>
      {paused && <Notice tone="warning" title="Deployments are paused">{`Promotion is refused until they are resumed: ${String(record.fields.pauseReason ?? "")}`}</Notice>}
      <OverlaySection title="What recording this does" tone="warning" hint="Nothing hosts this app, so nothing is deployed.">
        <p>One attempt is written to the release history as <strong>blocked</strong> at the runtime boundary. The model and the generated code are unchanged and stay available to take away.</p>
      </OverlaySection>
      <OverlaySection title="Gates, in order">
        <ul className="t6-steps">
          <li className="t6-step" data-state={totals.fail === 0 ? "done" : "blocked"}><span className="t6-step-n">1</span>Model checks · {totals.fail === 0 ? "clear" : `${totals.fail} failing`}</li>
          <li className="t6-step" data-state={model.screens.length ? "done" : "blocked"}><span className="t6-step-n">2</span>{model.screens.length} screens designed</li>
          <li className="t6-step" data-state="blocked"><span className="t6-step-n">3</span>Runtime · not connected</li>
          <li className="t6-step" data-state="current"><span className="t6-step-n">4</span>Record the attempt</li>
        </ul>
        {failing.length > 0 && (
          <Notice tone="danger" title={`${failing.length} failing ${failing.length === 1 ? "check" : "checks"} block promotion to ${environment}`}>
            <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{failing.slice(0, 5).map((issue) => <li key={issue.id}>{issue.title}</li>)}</ul>
          </Notice>
        )}
      </OverlaySection>
      <FactGrid columns={3} dense items={[
        { label: "Target", value: <Pill tone={envTone(environment)} dot>{environment}</Pill> },
        { label: "Runtime", value: <CapabilityState id="site.publish" /> },
        { label: "Passing checks", value: String(totals.pass), mono: true },
      ]} />
      <BoundaryNotice id="site.publish" action={`Promotion to ${environment}`} />
      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              busy={busy}
              disabled={failing.length > 0 || paused}
              title={blockedBy || undefined}
              onClick={async () => {
                setBusy(true);
                try {
                  const release: Release = {
                    id: `re-${wallMs().toString(36)}`,
                    environment,
                    at: now.toISOString(),
                    state: "blocked",
                    note: "Checks passed. Stopped at the runtime boundary: nothing hosts this app.",
                    actor: context.actor,
                  };
                  await context.mutate.patch(record.id, { body: { ...model, releases: [...model.releases, release] } }, { expectRevision: record.revision, event: `Promotion to ${environment} recorded as blocked at the runtime boundary` });
                  context.toast("Recorded as not promoted", "The attempt is in the release history as blocked. Nothing was deployed.", "blocked");
                  close();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Record a blocked attempt
            </Button>
          }
          secondary={
            <Button variant="secondary" onClick={() => {
              const files = generatedFiles(model);
              downloadFile("types.ts", files[0].content, "text/plain");
              context.toast("Types exported", "src/types.ts downloaded. The rest are on the code screen.");
            }}>Download generated types</Button>
          }
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

/* ------------------------------ Rollback ------------------------------ */

function stats(model: AppModel): { label: string; value: number }[] {
  return [
    { label: "Entities", value: model.entities.length },
    { label: "Fields", value: model.entities.reduce((n, entity) => n + entity.fields.length, 0) },
    { label: "Screens", value: model.screens.length },
    { label: "Components", value: model.screens.reduce((n, screen) => n + screen.components.length, 0) },
    { label: "Roles", value: model.roles.length },
    { label: "Endpoints", value: model.endpoints.length },
    { label: "Automations", value: model.automations.length },
  ];
}

export function RollbackSummary({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return null;
  const latest = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  return (
    <OverlaySummary
      eyebrow="Project"
      title={record.title}
      status={<Pill tone={envTone(model.settings.environment)} dot>{model.settings.environment}</Pill>}
      meta={[latest ? `Latest attempt ${latest.state.replace("_", " ")}` : "No release attempted", `${record.history.length} revisions kept`]}
    />
  );
}

export function RollbackImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  const [pick, setPick] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = record?.history[pick];
  const targetModel = useMemo(() => (record && target ? readApp({ ...record, body: target.body }) : undefined), [record, target]);
  if (!record) return <NoProject />;
  const releases = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const latest = releases[0];
  if (!latest || !target || !targetModel) {
    return (
      <Stack gap={3}>
        <Empty title="Nothing to roll back">{!latest ? "No release has been attempted for this project." : "No earlier revision of the model is kept."}</Empty>
        <ModalActions><OverlayActions end={<OverlayCancel>Close</OverlayCancel>} /></ModalActions>
      </Stack>
    );
  }
  const now = stats(model);
  const after = stats(targetModel);
  const names = (items: { name: string }[]) => items.map((item) => item.name);
  const removed = [...names(model.entities).filter((name) => !names(targetModel.entities).includes(name)).map((n) => `Entity ${n}`), ...names(model.screens).filter((name) => !names(targetModel.screens).includes(name)).map((n) => `Screen ${n}`)];
  const added = [...names(targetModel.entities).filter((name) => !names(model.entities).includes(name)).map((n) => `Entity ${n}`), ...names(targetModel.screens).filter((name) => !names(model.screens).includes(name)).map((n) => `Screen ${n}`)];
  const changed = now.some((row, index) => row.value !== after[index].value) || removed.length > 0 || added.length > 0;

  return (
    <Stack gap={4}>
      <Field label="Restore the model saved" htmlFor="rollback-revision">
        <Select id="rollback-revision" value={String(pick)} onChange={(event) => { setPick(Number(event.target.value)); setConfirmed(false); }}>
          {record.history.slice(0, 8).map((snapshot, index) => (
            <option key={`${snapshot.at}-${index}`} value={index}>{context.dateTime(snapshot.at)}{index === 0 ? " · the previous revision" : ""}</option>
          ))}
        </Select>
      </Field>

      <OverlaySection title="What changes in the model" tone={changed ? "warning" : "neutral"} hint={changed ? "Now compared with the revision you restore." : "This revision has the same shape as the current model."} flush>
        <table className="bb-impact">
          <caption className="ds-sr-only">Current model compared with the restored revision</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">Now</th><th scope="col">After</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {now.map((row, index) => {
              const delta = after[index].value - row.value;
              return (
                <tr key={row.label} data-changed={delta !== 0 || undefined}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                  <td>{after[index].value}</td>
                  <td>{delta === 0 ? "—" : delta > 0 ? `+${delta}` : String(delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(removed.length > 0 || added.length > 0) && (
          <ul className="bb-impact-names">
            {removed.map((name) => <li key={`r-${name}`}><Pill tone="danger">removed</Pill> {name}</li>)}
            {added.map((name) => <li key={`a-${name}`}><Pill tone="success">restored</Pill> {name}</li>)}
          </ul>
        )}
      </OverlaySection>

      <OverlaySection title="What does not change">
        <FactGrid columns={2} dense items={[
          { label: "Running app", value: "None. Nothing is deployed to revert.", tone: "success" },
          { label: "Workspace records", value: "Untouched; they are not part of the model." },
          { label: "Release history", value: "Kept. The latest attempt is marked rolled back." },
          { label: "This model", value: "Saved as a revision first, so you can return to it." },
        ]} />
      </OverlaySection>

      <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} label="Replace the current model with this revision" />

      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="danger"
              busy={busy}
              disabled={!confirmed}
              onClick={async () => {
                setBusy(true);
                try {
                  const restored: AppModel = {
                    ...targetModel,
                    releases: model.releases.map((release) => (release.id === latest.id ? { ...release, state: "rolled_back" as const, note: "Rolled back to an earlier model revision." } : release)),
                  };
                  await context.mutate.patch(record.id, { body: restored }, { expectRevision: record.revision, event: `Model rolled back to the revision saved ${target.at}` });
                  context.toast("Model rolled back", "The earlier revision is now the model and the latest release is marked rolled back. The previous model is in the revision list.");
                  close();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Roll back the model
            </Button>
          }
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}
