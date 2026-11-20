import { useMemo, useState } from "react";
import {
  Button, DataGrid, Empty, Field, ModalActions, Notice, OverlayActions, Pill, Properties, Row, Select, Stack, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso, freshness } from "@/platform/clock";
import { ROLE_LABELS } from "@/platform/policy";
import type { Rec, Role } from "@/domain/types";
import {
  ANALYTICS_COLLECTIONS, allMeasures, forecast, formatMeasure, joinCheck, measureById, provenanceFor, qualityChecks, runQuery,
  type QueryFilter,
} from "./metrics";
import { FilterRows, useAnalytics } from "./panels";
import { CrossWidgetCheck, readDashboard, type DashboardBody, type Tile } from "./dashboards";
import { checkBlocks, readReport } from "./reports";
import { readRelations } from "./catalogue";

/* ====================================================================== *
 * Analytics contract actions that perform the named operation on a record.
 * ====================================================================== */

const WIDTHS: Tile["w"][] = [3, 4, 6, 8, 12];

/* ------------------------------ 003 ------------------------------ */

export function ResizeTile({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const body = readDashboard(record);
  const initial = body.tiles.find((tile) => tile.id === context.selectedId) ?? body.tiles[0];
  const [tileIdPicked, setTileId] = useState<string>();
  const tileId = tileIdPicked ?? (initial?.id ?? "");
  const tile = body.tiles.find((item) => item.id === tileId);
  const [wPicked, setW] = useState<Tile["w"]>();
  const [hPicked, setH] = useState<Tile["h"]>();
  const w = wPicked ?? tile?.w ?? 4;
  const h = hPicked ?? tile?.h ?? 1;
  const [busy, setBusy] = useState(false);
  if (!record || record.collection !== "dashboards") return <Empty title="Open a dashboard first" />;
  if (!tile) return <Empty title="This dashboard has no tile to resize" />;
  return (
    <Stack gap={4}>
      <Field label="Tile">
        <Select aria-label="Tile" value={tileId} onChange={(event) => {
          const next = body.tiles.find((item) => item.id === event.target.value);
          setTileId(event.target.value); if (next) { setW(next.w); setH(next.h); }
        }}>
          {body.tiles.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.w}×{item.h}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Width">
          <Select aria-label="Width" value={String(w)} onChange={(event) => setW(Number(event.target.value) as Tile["w"])}>
            {WIDTHS.map((width) => <option key={width} value={width}>{width} of 12 columns</option>)}
          </Select>
        </Field>
        <Field label="Height">
          <Select aria-label="Height" value={String(h)} onChange={(event) => setH(Number(event.target.value) as Tile["h"])}>
            {[1, 2, 3].map((height) => <option key={height} value={height}>{height} row{height === 1 ? "" : "s"}</option>)}
          </Select>
        </Field>
      </Row>
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={w === tile.w && h === tile.h}
          onClick={async () => {
            setBusy(true);
            const next: DashboardBody = { ...body, tiles: body.tiles.map((item) => (item.id === tile.id ? { ...item, w, h } : item)) };
            const saved = await context.mutate.patch(record.id, { body: next }, { expectRevision: record.revision, event: `${tile.title} resized to ${w}×${h}` });
            if (saved) context.toast("Tile resized", `${tile.title} is ${w} of 12 columns wide and ${h} row${h === 1 ? "" : "s"} tall.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Resize
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function SetFilter({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const body = readDashboard(record);
  const [filters, setFilters] = useState<QueryFilter[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  if (!record || record.collection !== "dashboards") return <Empty title="Open a dashboard first" />;
  const working = filters ?? body.filters;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A dashboard filter applies to every tile">
        A filter on a field a tile's collection does not carry is reported below rather than silently dropped.
      </Notice>
      <FilterRows filters={working} onChange={setFilters} context={context} />
      <CrossWidgetCheck body={{ ...body, filters: working }} />
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!filters}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(record.id, { body: { ...body, filters: working } }, { expectRevision: record.revision, event: `Dashboard filters set (${working.length})` });
            if (saved) context.toast("Filters applied", `${working.length} filter${working.length === 1 ? "" : "s"} now apply to every tile.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Apply the filters
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

/* ------------------------------ 004 ------------------------------ */

/** Writes a citation for every figure block, or refuses the stale and dropped ones. */
export function CiteFigures({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const { context: queryContext } = useAnalytics();
  const [busy, setBusy] = useState(false);
  if (!record || record.collection !== "reports") return <Empty title="Open a report first" />;
  const body = readReport(record);
  const checks = checkBlocks(body, context, queryContext);
  const citable = checks.filter((check) => check.ok);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A citation freezes where a figure came from">
        Each citable figure gets its formula, its collection, the newest record date and the value at the moment of citing. A stale or sourceless figure is not cited and keeps the report from publishing.
      </Notice>
      <DataGrid
        rows={checks}
        rowId={(row) => row.block.id}
        label="Figures to cite"
        filterable={false}
        empty={<Empty title="No figure in the report" />}
        rowTone={(row) => (row.ok ? undefined : "warning")}
        columns={[
          { key: "figure", header: "Figure", primary: true, cell: (row) => row.block.text || measureById(row.block.measureId ?? "")?.name || "Block" },
          { key: "state", header: "State", cell: (row) => <Pill tone={row.ok ? "success" : "warning"} dot>{row.ok ? "citable" : "refused"}</Pill> },
          { key: "why", header: "Source", cell: (row) => <span className="ds-subtle">{row.reason}</span> },
        ]}
      />
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={citable.length === 0}
          onClick={async () => {
            setBusy(true);
            const at = clockIso();
            const citations = checks.map((check) => {
              const measure = check.block.measureId ? measureById(check.block.measureId) : undefined;
              return {
                blockId: check.block.id, ok: check.ok, reason: check.reason, measureId: check.block.measureId ?? "",
                formula: measure?.formula ?? "", collection: measure?.collection ?? "", asOf: check.asOf ?? "",
                value: check.value ?? null, citedAt: at, citedBy: context.actor,
              };
            });
            const saved = await context.mutate.patch(record.id, {
              body: { ...(record.body as object ?? {}), citations },
              fields: { ...record.fields, citedAt: at, citedBy: context.actor, citedFigures: citable.length, uncitedFigures: checks.length - citable.length },
            }, { expectRevision: record.revision, event: `${citable.length} of ${checks.length} figures cited by ${context.actor}` });
            if (saved) context.toast("Citations recorded", `${citable.length} of ${checks.length} figures are cited.${checks.length > citable.length ? " The rest are refused and block publishing." : ""}`, checks.length > citable.length ? "blocked" : "ok");
            setBusy(false);
            if (saved) close();
          }}
        >
          Cite {citable.length} figure{citable.length === 1 ? "" : "s"}
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

/* ------------------------------ 005 ------------------------------ */

const ROLES: Role[] = ["owner", "finance", "sales", "people", "member"];

export function GrantDataset({ context, close }: { context: ScreenContext; close: () => void }) {
  const documents = useCollection("datasets");
  const [collection, setCollection] = useState(context.selectedId && ANALYTICS_COLLECTIONS.includes(context.selectedId) ? context.selectedId : ANALYTICS_COLLECTIONS[0]);
  const [role, setRole] = useState<Role>("member");
  const [access, setAccess] = useState<"read" | "export">("read");
  const [busy, setBusy] = useState(false);
  const existing = documents.find((record) => record.fields.collection === collection);
  const grants = ((existing?.body as { grants?: { role: Role; access: string; by: string; at: string }[] })?.grants) ?? [];
  const sensitive = allMeasures().some((measure) => measure.collection === collection && measure.sensitive);
  const blocked = existing?.status === "retired" ? "A retired dataset takes no new grants."
    : sensitive && access === "export" && role !== "owner" && role !== "finance" ? "This dataset carries sensitive measures, so only Owner or Finance may export it."
      : grants.some((grant) => grant.role === role && grant.access === access) ? `${ROLE_LABELS[role]} already holds ${access}.` : undefined;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A grant shapes the interface">
        Every record is in this browser, so a grant decides what this interface offers a role view. It is not server-side enforcement.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Dataset">
          <Select aria-label="Dataset" value={collection} onChange={(event) => setCollection(event.target.value)}>
            {ANALYTICS_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Role view">
          <Select aria-label="Role view" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
          </Select>
        </Field>
        <Field label="Access">
          <Select aria-label="Access" value={access} onChange={(event) => setAccess(event.target.value as "read" | "export")}>
            <option value="read">Read</option><option value="export">Export</option>
          </Select>
        </Field>
      </Row>
      <Properties rows={[
        { label: "Owner", value: existing?.ownerName ?? "Not documented" },
        { label: "Current grants", value: grants.length ? grants.map((grant) => `${ROLE_LABELS[grant.role]} ${grant.access}`).join(", ") : "None recorded" },
      ]} />
      {blocked && <Notice tone="danger" title="This grant cannot be recorded">{blocked}</Notice>}
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("manage_policy")}
          title={!context.can("manage_policy") ? "Granting needs the Owner view" : blocked}
          onClick={async () => {
            setBusy(true);
            const next = [...grants, { role, access, by: context.actor, at: clockIso() }];
            const saved = existing
              ? await context.mutate.patch(existing.id, { body: { ...(existing.body as object ?? {}), grants: next } }, { expectRevision: existing.revision, event: `${ROLE_LABELS[role]} granted ${access} on ${collection}` })
              : await context.mutate.create({ collection: "datasets", title: collection, status: "documented", summary: `Access recorded for ${collection}.`, fields: { collection, kind: "native" }, body: { grants: next } }, `${ROLE_LABELS[role]} granted ${access} on ${collection}`);
            if (!saved) { setBusy(false); return; }
            context.toast("Grant recorded", `${ROLE_LABELS[role]} may ${access} ${collection}, granted by ${context.actor}.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Grant {access}
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function RefreshDataset({ context, close }: { context: ScreenContext; close: () => void }) {
  const { records } = useAnalytics();
  const documents = useCollection("datasets");
  const { now } = useWorkspace();
  const [collection, setCollection] = useState(context.selectedId && ANALYTICS_COLLECTIONS.includes(context.selectedId) ? context.selectedId : ANALYTICS_COLLECTIONS[0]);
  const [busy, setBusy] = useState(false);
  const rows = records.filter((record) => record.collection === collection);
  const asOf = rows.map((row) => row.updatedAt ?? row.at ?? row.createdAt).filter(Boolean).sort().at(-1);
  const age = freshness(asOf, now, 14);
  const failing = qualityChecks(collection, records, now).reduce((sum, check) => sum + check.failing.length, 0);
  const existing = documents.find((record) => record.fields.collection === collection);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Refreshing re-reads the records">
        There is no extract: the figures always come from the live records. A refresh re-reads them now and records the count, the newest record and the quality result on the dataset.
      </Notice>
      <Field label="Dataset">
        <Select aria-label="Dataset" value={collection} onChange={(event) => setCollection(event.target.value)}>
          {ANALYTICS_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Records", value: String(rows.length) },
        { label: "Newest", value: asOf ? `${context.date(asOf)} (${age.days} days)` : "No dated record" },
        { label: "Quality failures", value: String(failing) },
        { label: "Last refreshed", value: existing?.fields.refreshedAt ? context.dateTime(String(existing.fields.refreshedAt)) : "Never" },
      ]} />
      {age.stale && <Notice tone="warning" title="Stale source">The newest record is {age.days} days old. Figures built on it are marked stale.</Notice>}
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={existing?.status === "retired"}
          onClick={async () => {
            setBusy(true);
            const fields = { collection, kind: "native", refreshedAt: clockIso(), refreshedBy: context.actor, recordCount: rows.length, newestAt: asOf ?? "", failing };
            const saved = existing
              ? await context.mutate.patch(existing.id, { fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Dataset ${collection} refreshed: ${rows.length} records` })
              : await context.mutate.create({ collection: "datasets", title: collection, status: "documented", summary: `Catalogue entry for ${collection}.`, fields }, `Dataset ${collection} refreshed: ${rows.length} records`);
            if (!saved) { setBusy(false); return; }
            context.toast("Refreshed", `${collection}: ${rows.length} records re-read, ${failing} quality failure${failing === 1 ? "" : "s"}.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Refresh {collection}
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

/* ------------------------------ 006 ------------------------------ */

export function TestMeasure({ context, close }: { context: ScreenContext; close: () => void }) {
  const { context: queryContext } = useAnalytics();
  const [measureId, setMeasureId] = useState(measureById(context.selectedId ?? "")?.id ?? allMeasures()[0].id);
  const [busy, setBusy] = useState(false);
  const measure = measureById(measureId);
  const result = runQuery({ measureIds: [measureId], filters: [] }, queryContext);
  const value = result.totals[0] ?? null;
  const age = freshness(result.asOf, context.now, 45);
  const tests = measure ? [
    { label: "Has a source in this workspace", pass: !measure.unavailable, detail: measure.unavailable ?? measure.collection },
    { label: "Computes a value", pass: value !== null, detail: formatMeasure(measure, value, context.money) },
    { label: "Reads at least one record", pass: result.recordCount > 0, detail: `${result.recordCount} records` },
    { label: "Newest record is dated and recent", pass: age.known && !age.stale, detail: age.known ? `${age.days} days old` : "No date" },
    { label: "Not negative where it must not be", pass: !(measure.unit !== "percent" && value !== null && value < 0 && measure.agg === "count"), detail: String(value ?? "—") },
  ] : [];
  const passed = tests.filter((test) => test.pass).length;
  return (
    <Stack gap={4}>
      <Field label="Measure">
        <Select aria-label="Measure" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
          {allMeasures().map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      {tests.map((test) => (
        <Row key={test.label} gap={3} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <Pill tone={test.pass ? "success" : "warning"} dot>{test.pass ? "pass" : "fail"}</Pill>
          <span className="ds-grow">{test.label}</span>
          <span className="ds-subtle">{test.detail}</span>
        </Row>
      ))}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await context.mutate.log(`Measure ${measure?.name} tested by ${context.actor}: ${passed} of ${tests.length} checks pass`, { type: "analytics.test" });
            context.toast("Test recorded", `${passed} of ${tests.length} checks pass for ${measure?.name}. The result is in the audit trail.`, passed === tests.length ? "ok" : "blocked");
            setBusy(false);
            close();
          }}
        >
          Record the test result
        </Button>
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

export function CompareMeasures({ context }: { context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const measures = allMeasures();
  const [left, setLeft] = useState(measureById(context.selectedId ?? "")?.id ?? measures[0].id);
  const [right, setRight] = useState(measures.find((item) => item.id !== left)?.id ?? measures[0].id);
  const pair = [left, right].map((id) => {
    const measure = measureById(id);
    const result = runQuery({ measureIds: [id], filters: [] }, queryContext);
    return { measure, result, prov: measure ? provenanceFor(measure, result.totals[0], result.asOf, context.now) : "unknown" };
  });
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Left"><Select aria-label="Left" value={left} onChange={(event) => setLeft(event.target.value)}>{measures.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Right"><Select aria-label="Right" value={right} onChange={(event) => setRight(event.target.value)}>{measures.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      </Row>
      <div className="ds-grid-wrap"><div className="ds-grid-scroll">
        <table className="ds-table">
          <caption className="ds-sr-only">Two measures side by side</caption>
          <thead><tr><th>Property</th><th>{pair[0].measure?.name}</th><th>{pair[1].measure?.name}</th></tr></thead>
          <tbody>
            {[
              ["Value now", (entry: typeof pair[number]) => formatMeasure(entry.measure, entry.result.totals[0] ?? null, context.money)],
              ["Version", (entry: typeof pair[number]) => `v${entry.measure?.version ?? "?"}`],
              ["Unit", (entry: typeof pair[number]) => entry.measure?.unit ?? ""],
              ["Collection", (entry: typeof pair[number]) => entry.measure?.collection ?? ""],
              ["Formula", (entry: typeof pair[number]) => entry.measure?.formula ?? ""],
              ["Records", (entry: typeof pair[number]) => String(entry.result.recordCount)],
              ["Newest record", (entry: typeof pair[number]) => (entry.result.asOf ? context.date(entry.result.asOf) : "Unknown")],
              ["Source", (entry: typeof pair[number]) => entry.prov],
              ["Owner", (entry: typeof pair[number]) => entry.measure?.owner ?? ""],
            ].map(([label, read]) => (
              <tr key={label as string}>
                <th scope="row" style={{ textAlign: "start" }}>{label as string}</th>
                <td>{(read as (entry: typeof pair[number]) => string)(pair[0])}</td>
                <td>{(read as (entry: typeof pair[number]) => string)(pair[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      {pair[0].measure?.unit !== pair[1].measure?.unit && <Notice tone="warning" title="Different units">These measures are not comparable as numbers: one is {pair[0].measure?.unit}, the other {pair[1].measure?.unit}.</Notice>}
    </Stack>
  );
}

/* ------------------------------ 007 ------------------------------ */

function useModel() {
  const models = useCollection("dataModels");
  const model = models[0];
  const relations = readRelations(model);
  const { records } = useAnalytics();
  const results = useMemo(() => relations.map((relation) => ({ relation, check: joinCheck(relation.from, relation.to, relation.key, records) })), [relations, records]);
  return { model, relations, results };
}

export function ValidateModel({ context, close }: { context: ScreenContext; close: () => void }) {
  const { model, results } = useModel();
  const [busy, setBusy] = useState(false);
  const failing = results.filter((item) => item.check.matched === 0 || (item.check.fanOut && item.relation.kind !== "one-to-many"));
  return (
    <Stack gap={4}>
      <Notice tone={failing.length ? "warning" : "success"} title={failing.length ? `${failing.length} relation${failing.length === 1 ? " fails" : "s fail"}` : "Every relation passes"}>
        A relation fails when it matches nothing, or when it fans out while declared many-to-one, which would inflate a total.
      </Notice>
      {results.map((item) => (
        <Row key={item.relation.id} gap={3} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <Pill tone={failing.includes(item) ? "warning" : "success"} dot>{failing.includes(item) ? "fail" : "pass"}</Pill>
          <span className="ds-grow">{item.relation.from} → {item.relation.to} on {item.relation.key}</span>
          <span className="ds-num ds-subtle">{item.check.matched}/{item.check.matched + item.check.unmatched} · fan-out {item.check.maxFanOut}</span>
        </Row>
      ))}
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const fields = { lastValidatedAt: clockIso(), lastValidatedBy: context.actor, passing: results.length - failing.length, failing: failing.length };
            const saved = model
              ? await context.mutate.patch(model.id, { fields: { ...model.fields, ...fields } }, { expectRevision: model.revision, event: `Data model validated: ${fields.passing} pass, ${fields.failing} fail` })
              : await context.mutate.create({ collection: "dataModels", title: "Data model", status: "active", summary: "Relationships between the collections.", fields, body: { relations: results.map((item) => item.relation) } }, `Data model validated: ${fields.passing} pass, ${fields.failing} fail`);
            if (!saved) { setBusy(false); return; }
            context.toast("Validation recorded", `${fields.passing} pass, ${fields.failing} fail.`, failing.length ? "blocked" : "ok");
            setBusy(false);
            if (saved) close();
          }}
        >
          Record the validation
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function RefreshModel({ context, close }: { context: ScreenContext; close: () => void }) {
  const { model, results } = useModel();
  const [busy, setBusy] = useState(false);
  const changed = results.filter((item) => (item.check.fanOut ? "one-to-many" : "many-to-one") !== item.relation.kind);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Refreshing re-measures every join">
        Each relation is joined against today's records. Where the observed cardinality differs from the declared one, the declaration is updated so measures aggregate before they join.
      </Notice>
      <DataGrid
        rows={results}
        rowId={(row) => row.relation.id}
        label="Relations re-measured"
        filterable={false}
        columns={[
          { key: "rel", header: "Relation", primary: true, cell: (row) => `${row.relation.from} → ${row.relation.to}` },
          { key: "declared", header: "Declared", cell: (row) => row.relation.kind },
          { key: "observed", header: "Observed", cell: (row) => (row.check.fanOut ? "one-to-many" : "many-to-one") },
          { key: "fan", header: "Max fan-out", align: "end", cell: (row) => <span className="ds-num">{row.check.maxFanOut}</span> },
        ]}
      />
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            const relations = results.map((item) => ({ ...item.relation, kind: (item.check.fanOut ? "one-to-many" : "many-to-one") as "one-to-many" | "many-to-one" }));
            const fields = { refreshedAt: clockIso(), refreshedBy: context.actor };
            const saved = model
              ? await context.mutate.patch(model.id, { body: { ...(model.body as object ?? {}), relations }, fields: { ...model.fields, ...fields } }, { expectRevision: model.revision, event: `Data model refreshed: ${changed.length} declaration${changed.length === 1 ? "" : "s"} corrected` })
              : await context.mutate.create({ collection: "dataModels", title: "Data model", status: "active", summary: "Relationships between the collections.", fields, body: { relations } }, `Data model refreshed: ${changed.length} corrected`);
            if (!saved) { setBusy(false); return; }
            context.toast("Model refreshed", `${results.length} joins re-measured; ${changed.length} declaration${changed.length === 1 ? "" : "s"} corrected.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Refresh the model
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function DeployModel({ context, close }: { context: ScreenContext; close: () => void }) {
  const { model, relations, results } = useModel();
  const [busy, setBusy] = useState(false);
  const failing = results.filter((item) => item.check.matched === 0 || (item.check.fanOut && item.relation.kind !== "one-to-many"));
  const version = Number(model?.fields.deployedVersion ?? 0) + 1;
  return (
    <Stack gap={4}>
      <Notice tone={failing.length ? "danger" : "info"} title={failing.length ? "Deployment is blocked by failing tests" : `Deploy version ${version}`}>
        {failing.length
          ? `${failing.map((item) => `${item.relation.from} → ${item.relation.to}`).join(", ")} fail. Refresh or fix them first.`
          : "Deploying records this set of relations as the version every measure reads, with your name. The previous version is kept on the record."}
      </Notice>
      <Properties rows={[
        { label: "Relations", value: String(relations.length) },
        { label: "Currently deployed", value: model?.fields.deployedVersion ? `v${String(model.fields.deployedVersion)} by ${String(model.fields.deployedBy ?? "")}` : "Nothing deployed" },
      ]} />
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={failing.length > 0 || !model}
          title={!model ? "Add or refresh a relation first so the model exists as a record" : undefined}
          onClick={async () => {
            if (!model) return;
            setBusy(true);
            const body = model.body as { relations?: unknown[]; deployed?: unknown[] } | undefined;
            const saved = await context.mutate.patch(model.id, {
              status: "deployed",
              body: { ...(body ?? {}), relations, deployed: [...(body?.deployed ?? []), { version, relations, at: clockIso(), by: context.actor }] },
              fields: { ...model.fields, deployedVersion: version, deployedBy: context.actor, deployedAt: clockIso() },
            }, { expectRevision: model.revision, event: `Data model v${version} deployed by ${context.actor}` });
            if (saved) context.toast("Deployed", `Version ${version} is the model every measure reads.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Deploy v{version}
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

/* ------------------------------ 008 ------------------------------ */

export function AdjustInputs({ context, close }: { context: ScreenContext; close: () => void }) {
  const scenarios = useCollection("scenarios").filter((record) => record.fields.kind === "forecast");
  const { context: queryContext } = useAnalytics();
  const [idPicked, setId] = useState<string>();
  const id = idPicked ?? (scenarios.find((item) => item.id === context.selectedId)?.id ?? scenarios[0]?.id ?? "");
  const scenario = scenarios.find((item) => item.id === id);
  const [measureIdPicked, setMeasureId] = useState<string>();
  const measureId = measureIdPicked ?? (String(scenario?.fields.measureId ?? "revenue.paid"));
  const [adjustmentPicked, setAdjustment] = useState<number>();
  const adjustment = adjustmentPicked ?? (Number(scenario?.fields.adjustment ?? 0));
  const [busy, setBusy] = useState(false);
  const model = forecast(measureId, 6, 3, queryContext, adjustment);
  const last = model.projection[model.projection.length - 1];
  if (scenarios.length === 0) {
    return <Empty title="No scenario to adjust" action={<Button variant="primary" onClick={() => context.openOverlay("scenario editor")}>Save a scenario</Button>}>Inputs belong to a saved scenario, so the actuals can never be edited by mistake.</Empty>;
  }
  return (
    <Stack gap={4}>
      <Field label="Scenario">
        <Select aria-label="Scenario" value={id} onChange={(event) => {
          const next = scenarios.find((item) => item.id === event.target.value);
          setId(event.target.value); setMeasureId(String(next?.fields.measureId ?? "revenue.paid")); setAdjustment(Number(next?.fields.adjustment ?? 0));
        }}>
          {scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Measure">
          <Select aria-label="Measure" value={measureId} onChange={(event) => setMeasureId(event.target.value)}>
            {allMeasures().filter((item) => !item.unavailable).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Trend adjustment, %" hint="Applied to the fitted slope only">
          <TextInput aria-label="Trend adjustment" type="number" value={String(adjustment)} onChange={(event) => setAdjustment(Math.max(-100, Math.min(200, Number(event.target.value) || 0)))} />
        </Field>
      </Row>
      <Notice tone={model.usable ? "info" : "warning"} title={model.usable ? "The projection moves, the actuals do not" : "No projection can be drawn"}>
        {model.usable && last ? `Three months out: ${context.money(Math.round(last.value))}, band ${context.money(Math.round(last.low))} to ${context.money(Math.round(last.high))}.` : model.reason}
      </Notice>
      <ModalActions>
<OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!scenario || !model.usable}
          onClick={async () => {
            if (!scenario) return;
            setBusy(true);
            const history = ((scenario.body as { inputs?: unknown[] })?.inputs) ?? [];
            const saved = await context.mutate.patch(scenario.id, {
              status: "proposed",
              fields: { ...scenario.fields, measureId, adjustment, projected: Math.round(last?.value ?? 0), adjustedBy: context.actor },
              body: { ...(scenario.body as object ?? {}), inputs: [...history, { measureId: scenario.fields.measureId, adjustment: scenario.fields.adjustment, at: clockIso(), by: context.actor }] },
            }, { expectRevision: scenario.revision, event: `Scenario ${scenario.title} inputs adjusted to ${adjustment}%` });
            if (saved) context.toast("Inputs adjusted", `${scenario.title} now uses ${adjustment}% on the slope. It is back to proposed for review.`);
            setBusy(false);
            if (saved) close();
          }}
        >
          Save the inputs
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} />
</ModalActions>
    </Stack>
  );
}

export function CompareScenarios({ context }: { context: ScreenContext }) {
  const scenarios = useCollection("scenarios").filter((record) => record.fields.kind === "forecast");
  const { context: queryContext } = useAnalytics();
  const rows = scenarios.map((record: Rec) => {
    const model = forecast(String(record.fields.measureId ?? "revenue.paid"), 6, 3, queryContext, Number(record.fields.adjustment ?? 0));
    return { record, model, last: model.projection[model.projection.length - 1] };
  });
  const base = forecast("revenue.paid", 6, 3, queryContext, 0).projection.at(-1);
  if (rows.length === 0) return <Empty title="No scenario to compare">Save at least one scenario.</Empty>;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Every scenario is recomputed from the same actuals">Projections are predictions. None of them replaces a posted figure.</Notice>
      <DataGrid
        rows={rows}
        rowId={(row) => row.record.id}
        label="Scenarios compared"
        filterable={false}
        columns={[
          { key: "name", header: "Scenario", primary: true, cell: (row) => row.record.title },
          { key: "measure", header: "Measure", cell: (row) => measureById(String(row.record.fields.measureId ?? ""))?.name ?? "—" },
          { key: "adj", header: "Adjustment", align: "end", cell: (row) => <span className="ds-num">{String(row.record.fields.adjustment ?? 0)}%</span> },
          { key: "out", header: "Three months out", align: "end", cell: (row) => (row.last ? <span className="ds-num">{context.money(Math.round(row.last.value))}</span> : <Pill tone="warning">Unavailable</Pill>) },
          { key: "band", header: "Band", align: "end", cell: (row) => (row.last ? <span className="ds-num ds-subtle">{context.money(Math.round(row.last.low))}–{context.money(Math.round(row.last.high))}</span> : "—") },
          { key: "vs", header: "Against the fitted trend", align: "end", cell: (row) => (row.last && base && row.record.fields.measureId === "revenue.paid" ? <span className="ds-num">{context.money(Math.round(row.last.value - base.value))}</span> : "—") },
        ]}
      />
    </Stack>
  );
}
