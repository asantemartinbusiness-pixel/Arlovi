import { useState } from "react";
import { Button, Card, Field, Notice, Pill, Row, Select, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  STATE_LABELS, STATE_MEANING, STATE_TONE, TARGET_FIELDS, TRANSFORMS, TRANSFORM_LABELS, connectionState, mappingIssues,
  previewMapping, readMapping, schemaFor, type ConnectionState, type Mapping, type TargetField, type Transform,
} from "./mapping";

export function capabilityIdOf(record: Rec, entryId?: string): string {
  return entryId ?? (String(record.fields.capabilityId ?? "") || "custom");
}

export function ConnectionStatePill({ state }: { state: ConnectionState }) {
  return <Pill tone={STATE_TONE[state]} dot>{STATE_LABELS[state]}</Pill>;
}

export function ConnectionStateLegend({ current }: { current?: ConnectionState }) {
  const order: ConnectionState[] = ["pending", "configured", "simulated", "connected", "disconnected"];
  return (
    <ul className="connect-state-legend" aria-label="Connection states">
      {order.map((state) => (
        <li key={state} aria-current={state === current ? "true" : undefined}>
          <ConnectionStatePill state={state} />
          <span>{STATE_MEANING[state]}</span>
        </li>
      ))}
    </ul>
  );
}

function sameRows(a: Mapping, b: Mapping): boolean {
  return a.collection === b.collection && a.rows.every((row, index) => row.target === b.rows[index]?.target && row.transform === b.rows[index]?.transform);
}

export function MappingPanel({ context, record, capabilityId, capabilityState }: { context: ScreenContext; record: Rec; capabilityId: string; capabilityState: string }) {
  const saved = readMapping(record, capabilityId);
  const [draft, setDraft] = useState<Mapping>(saved);
  const schema = schemaFor(capabilityId);
  const issues = mappingIssues(draft, capabilityId);
  const blocking = issues.filter((issue) => issue.level === "fail");
  const dirty = !sameRows(draft, saved);
  const state = connectionState(record, capabilityState, capabilityId);
  const preview = previewMapping(draft, capabilityId);
  const disabled = state === "disconnected";

  function setRow(index: number, patch: { target?: TargetField; transform?: Transform }) {
    setDraft({ ...draft, rows: draft.rows.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
  }

  /** Resolves to whether the write landed; a revision conflict has already been reported. */
  async function write(next: Mapping, event: string): Promise<boolean> {
    const body = record.body && typeof record.body === "object" ? record.body as Record<string, unknown> : {};
    const written = await context.mutate.patch(record.id, { body: { ...body, mapping: next } }, { expectRevision: record.revision, event });
    return written !== null;
  }

  return (
    <Stack gap={4}>
      <Card eyebrow="STATE" prov="posted" title="Where this connection stands" actions={<ConnectionStatePill state={state} />}>
        <ConnectionStateLegend current={state} />
      </Card>

      <Card eyebrow="DATA MAPPING" prov="human" title="Source field → Arlovi field"
        subtitle={saved.savedAt ? `Saved ${context.dateTime(saved.savedAt)} by ${saved.savedBy}` : "Not saved yet"}>
        <Stack gap={3}>
          <Field label="Records land in collection" hint="The workspace collection each incoming record is written to.">
            <TextInput value={draft.collection} disabled={disabled} onChange={(event) => setDraft({ ...draft, collection: event.target.value.trim() })} />
          </Field>
          <div className="t6-matrix-wrap">
            <table className="t6-matrix connect-mapping-table">
              <caption className="ds-sr-only">Field mapping for {record.title}</caption>
              <thead><tr><th scope="col">Source field</th><th scope="col">Sample value</th><th scope="col">Arlovi field</th><th scope="col">Transform</th></tr></thead>
              <tbody>
                {draft.rows.map((row, index) => {
                  const field = schema.fields.find((item) => item.name === row.source);
                  return (
                    <tr key={row.source}>
                      <th scope="row"><code>{row.source}</code><div className="ds-subtle">{field?.type}</div></th>
                      <td><span className="ds-subtle">{field?.sample}</span></td>
                      <td>
                        <Select aria-label={`Arlovi field for ${row.source}`} value={row.target} disabled={disabled} onChange={(event) => setRow(index, { target: event.target.value as TargetField })}>
                          <option value="">Not mapped</option>
                          {TARGET_FIELDS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                        </Select>
                      </td>
                      <td>
                        <Select aria-label={`Transform for ${row.source}`} value={row.transform} disabled={disabled || !row.target} onChange={(event) => setRow(index, { transform: event.target.value as Transform })}>
                          {TRANSFORMS.map((transform) => <option key={transform} value={transform}>{TRANSFORM_LABELS[transform]}</option>)}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {issues.length > 0 && (
            <Notice tone={blocking.length ? "warning" : "info"} title={blocking.length ? "The mapping cannot be used yet" : "Worth checking"}>
              <ul className="connect-issues">{issues.map((issue) => <li key={issue.message}>{issue.level === "fail" ? "Required: " : ""}{issue.message}</li>)}</ul>
            </Notice>
          )}
          <Row gap={2} wrap>
            <Button variant="primary" disabled={disabled || !dirty} onClick={() => void write(
              { ...draft, savedAt: clockIso(), savedBy: context.actor, simulatedAt: "" },
              `Data mapping for ${record.title} saved: ${draft.rows.filter((row) => row.target).length} fields into ${draft.collection}${blocking.length ? " (incomplete)" : ""}`,
            ).then((ok) => ok && context.toast("Mapping saved", blocking.length ? "Saved, but setup stays pending until the required fields are mapped." : "The connection is configured. Nothing was read from the provider."))}>Save mapping</Button>
            <Button variant="secondary" disabled={disabled || dirty || !saved.savedAt || blocking.length > 0}
              title={dirty ? "Save the mapping first" : blocking.length ? "Fix the required items first" : undefined}
              onClick={() => void write({ ...saved, simulatedAt: clockIso() }, `Simulated run of the ${record.title} mapping against the documented sample row; no provider data read`)
                .then((ok) => ok && context.toast("Simulation recorded", "The sample row was mapped locally. No provider was contacted."))}>Simulate with the sample row</Button>
            {dirty && <Button variant="ghost" onClick={() => setDraft(saved)}>Discard changes</Button>}
          </Row>
        </Stack>
      </Card>

      <Card eyebrow="SIMULATION" prov="unknown" title="What the sample row would become" subtitle="Sample values from the provider's documented contract, not data read from an account">
        {preview.length === 0 ? <p className="ds-subtle">Map a field to see the result.</p> : (
          <div className="t6-matrix-wrap">
            <table className="t6-matrix connect-mapping-table">
              <caption className="ds-sr-only">Simulated record</caption>
              <thead><tr><th scope="col">Arlovi field</th><th scope="col">From</th><th scope="col">Value</th></tr></thead>
              <tbody>{preview.map((row) => <tr key={`${row.target}-${row.source}`}><th scope="row"><code>{row.target}</code></th><td><code>{row.source}</code></td><td>{row.value}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </Stack>
  );
}
