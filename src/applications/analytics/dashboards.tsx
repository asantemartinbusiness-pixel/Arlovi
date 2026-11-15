import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, GripVertical, LayoutDashboard, Maximize2, Minimize2, Pin, Plus, Share2,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row,
  Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  DIMENSIONS, dimensionById, measureById, runQuery, type QueryFilter,
} from "./metrics";
import {
  DimensionPicker, FilterRows, MeasurePicker, MeasureSummaryGrid, MeasureView, useAnalytics,
  VIZ_LABELS, type Viz,
} from "./panels";

export interface Tile {
  id: string;
  title: string;
  measureId: string;
  dimensionId?: string;
  viz: Viz;
  w: 3 | 4 | 6 | 8 | 12;
  h: 1 | 2 | 3;
  order: number;
}

export interface DashboardBody {
  tiles: Tile[];
  filters: QueryFilter[];
}

export function readDashboard(record: Rec | undefined): DashboardBody {
  const body = record?.body as Partial<DashboardBody> | undefined;
  return {
    tiles: (Array.isArray(body?.tiles) ? body!.tiles : []).map((tile, index) => ({
      id: tile.id ?? `t${index}`,
      title: tile.title ?? measureById(tile.measureId)?.name ?? "Tile",
      measureId: tile.measureId ?? "revenue.paid",
      dimensionId: tile.dimensionId,
      viz: (tile.viz ?? "stat") as Viz,
      w: (tile.w ?? 4) as Tile["w"],
      h: (tile.h ?? 1) as Tile["h"],
      order: typeof tile.order === "number" ? tile.order : index,
    })).sort((left, right) => left.order - right.order),
    filters: Array.isArray(body?.filters) ? body!.filters : [],
  };
}

const TEMPLATES: { id: string; name: string; description: string; tiles: Omit<Tile, "id" | "order">[] }[] = [
  {
    id: "trading",
    name: "Trading overview",
    description: "Revenue, receivable, overdue and the open pipeline, with revenue by month.",
    tiles: [
      { title: "Revenue recognised", measureId: "revenue.paid", viz: "stat", w: 3, h: 1 },
      { title: "Receivable", measureId: "receivable.open", viz: "stat", w: 3, h: 1 },
      { title: "Overdue", measureId: "receivable.overdue", viz: "stat", w: 3, h: 1 },
      { title: "Open pipeline", measureId: "pipeline.open", viz: "stat", w: 3, h: 1 },
      { title: "Revenue by month", measureId: "revenue.paid", viz: "line", w: 12, h: 2 },
    ],
  },
  {
    id: "sales",
    name: "Commercial",
    description: "Pipeline by owner and stage, win rate and quoted value.",
    tiles: [
      { title: "Weighted pipeline", measureId: "pipeline.weighted", viz: "stat", w: 4, h: 1 },
      { title: "Win rate", measureId: "deals.winrate", viz: "stat", w: 4, h: 1 },
      { title: "Quoted value", measureId: "quote.value", viz: "stat", w: 4, h: 1 },
      { title: "Pipeline by stage", measureId: "pipeline.open", dimensionId: "stage", viz: "bar", w: 8, h: 2 },
      { title: "Pipeline by owner", measureId: "pipeline.open", dimensionId: "owner", viz: "donut", w: 4, h: 2 },
    ],
  },
  {
    id: "support",
    name: "Workshop and support",
    description: "Open tickets and work items, broken down by priority.",
    tiles: [
      { title: "Open tickets", measureId: "tickets.open", viz: "stat", w: 6, h: 1 },
      { title: "Open work items", measureId: "tasks.open", viz: "stat", w: 6, h: 1 },
      { title: "Tickets by priority", measureId: "tickets.open", dimensionId: "priority", viz: "bar", w: 12, h: 2 },
    ],
  },
];

/* ====================================================================== *
 * ARL-ANALYTICS-002 — Dashboard directory
 * ====================================================================== */

function Thumbnail({ tiles, masked }: { tiles: Tile[]; masked: boolean }) {
  return (
    <div className="an-thumb" data-masked={masked ? "true" : undefined} aria-hidden="true">
      {tiles.slice(0, 6).map((tile) => <span key={tile.id} data-wide={tile.w >= 8 ? "true" : undefined} />)}
      {tiles.length === 0 && <span />}
    </div>
  );
}

export function DashboardDirectory({ context, tab }: { context: ScreenContext; tab: string }) {
  const dashboards = useCollection("dashboards");
  const { actor, now } = useWorkspace();
  const { context: queryContext } = useAnalytics();

  const rows = useMemo(() => dashboards.map((record) => {
    const body = readDashboard(record);
    const measureIds = [...new Set(body.tiles.map((tile) => tile.measureId))];
    const result = runQuery({ measureIds, filters: [] }, queryContext);
    const age = freshness(result.asOf, now, 7);
    return { record, body, result, age, unavailable: result.unavailable.length };
  }), [dashboards, queryContext, now]);

  const filtered = useMemo(() => {
    if (tab === "Mine") return rows.filter((row) => row.record.ownerName === actor);
    if (tab === "Shared") return rows.filter((row) => row.record.fields.shared === true);
    return rows.filter((row) => row.record.status !== "archived");
  }, [rows, tab, actor]);

  if (tab === "Templates") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A template is a starting layout, not a copy of someone's data">
          Creating from a template builds a new dashboard whose tiles recompute from {context.org.shortName}'s own records.
        </Notice>
        <Grid>
          {TEMPLATES.map((template) => (
            <Card key={template.id} span={4} eyebrow="TEMPLATE" title={template.name} subtitle={`${template.tiles.length} tiles`} prov="human">
              <Stack gap={3}>
                <Thumbnail tiles={template.tiles.map((tile, index) => ({ ...tile, id: `${template.id}-${index}`, order: index }))} masked={false} />
                <p className="ds-subtle">{template.description}</p>
                <Button
                  variant="secondary"
                  icon={<Plus size={15} />}
                  onClick={async () => {
                    const created = await context.mutate.create({
                      collection: "dashboards",
                      title: template.name,
                      status: "draft",
                      summary: template.description,
                      fields: { department: "Company", shared: false, pinned: false, sensitive: false, template: template.id },
                      body: { tiles: template.tiles.map((tile, index) => ({ ...tile, id: `t${index + 1}`, order: index })), filters: [] },
                    }, `Dashboard created from the ${template.name} template`);
                    context.toast("Dashboard created", `${created.title} is a draft. Its tiles recompute from this company's records.`);
                    context.navigate(`/o/${context.org.slug}/analytics/dashboards/${created.id}`);
                  }}
                >
                  Create from this template
                </Button>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  if (filtered.length === 0) {
    return (
      <Empty
        title={tab === "Mine" ? "You do not own a dashboard yet" : tab === "Shared" ? "Nothing is shared with the workspace" : "No dashboard yet"}
        icon={<LayoutDashboard size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Dashboard setup")}>New dashboard</Button>}
      >
        A dashboard is a set of tiles, each one recomputed from the records in this company when you open it.
      </Empty>
    );
  }

  return (
    <Grid>
      {filtered.map((row) => {
        const sensitive = row.record.fields.sensitive === true;
        const canSee = !sensitive || row.record.ownerName === actor || context.can("export_data");
        return (
          <Card
            key={row.record.id}
            span={4}
            eyebrow={String(row.record.fields.department ?? "DASHBOARD").toUpperCase()}
            title={row.record.title}
            subtitle={`${row.body.tiles.length} tiles · ${row.record.ownerName}`}
            prov={row.unavailable > 0 || !row.age.known ? "unknown" : "posted"}
            actions={row.record.fields.pinned === true ? <Pill tone="accent" dot>pinned</Pill> : undefined}
          >
            <Stack gap={3}>
              <Thumbnail tiles={row.body.tiles} masked={sensitive && !canSee} />
              {sensitive && !canSee ? (
                <Notice tone="warning" title="Preview hidden">
                  This dashboard is marked sensitive and you are not its owner, so the preview shows its shape only — no measure name and no figure.
                </Notice>
              ) : (
                <p className="ds-subtle">{row.record.summary}</p>
              )}
              <Properties rows={[
                { label: "Status", value: <Pill tone={row.record.status === "published" ? "success" : "neutral"} dot>{row.record.status}</Pill> },
                { label: "Access", value: row.record.fields.shared === true ? "Everyone in the workspace" : "Owner only" },
                { label: "Freshness", value: row.age.known ? `${row.age.days} day${row.age.days === 1 ? "" : "s"} old` : "Unknown" },
                { label: "Unavailable figures", value: row.unavailable > 0 ? <Pill tone="warning">{row.unavailable}</Pill> : "None" },
              ]} />
              <Row gap={2} wrap>
                <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/analytics/dashboards/${row.record.id}`)}>Open</Button>
                <Button size="sm" variant="ghost" icon={<Pin size={14} />} onClick={async () => {
                  await context.mutate.patch(row.record.id, { fields: { ...row.record.fields, pinned: row.record.fields.pinned !== true } }, { event: row.record.fields.pinned === true ? "Dashboard unpinned" : "Dashboard pinned" });
                  context.toast(row.record.fields.pinned === true ? "Unpinned" : "Pinned", `${row.record.title} was updated on the record.`);
                }}>{row.record.fields.pinned === true ? "Unpin" : "Pin"}</Button>
                <Button size="sm" variant="ghost" icon={<Share2 size={14} />} onClick={() => { context.select(row.record.id); context.openOverlay("sharing"); }}>Share</Button>
              </Row>
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ====================================================================== *
 * ARL-ANALYTICS-003 — Dashboard editor
 * ====================================================================== */

export function DashboardEditor({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (!record || record.collection !== "dashboards") {
    return (
      <Empty
        title="That address is not a dashboard in this company"
        icon={<LayoutDashboard size={20} />}
        action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/analytics/dashboards`)}>Open the dashboard directory</Button>}
      >
        {context.params.id ? `${context.params.id} is a ${record?.collection ?? "missing"} record, not a dashboard.` : "No dashboard id is in the address."}
      </Empty>
    );
  }

  const body = readDashboard(record);
  const selected = body.tiles.find((tile) => tile.id === context.selectedId) ?? body.tiles[0];

  async function write(next: DashboardBody, event: string) {
    await context.mutate.patch(record!.id, { body: next }, { event });
  }

  function patchTile(id: string, patch: Partial<Tile>, event: string) {
    void write({ ...body, tiles: body.tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile)) }, event);
  }

  function reorder(id: string, delta: number) {
    const ordered = [...body.tiles].sort((left, right) => left.order - right.order);
    const index = ordered.findIndex((tile) => tile.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const swapped = [...ordered];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    void write({ ...body, tiles: swapped.map((tile, position) => ({ ...tile, order: position })) }, `${ordered[index].title} moved`);
    setAnnouncement(`${ordered[index].title} moved to position ${target + 1} of ${ordered.length}.`);
  }

  function moveBefore(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ordered = [...body.tiles].sort((left, right) => left.order - right.order);
    const source = ordered.find((tile) => tile.id === sourceId);
    if (!source) return;
    const without = ordered.filter((tile) => tile.id !== sourceId);
    const at = without.findIndex((tile) => tile.id === targetId);
    without.splice(at < 0 ? without.length : at, 0, source);
    void write({ ...body, tiles: without.map((tile, position) => ({ ...tile, order: position })) }, `${source.title} moved`);
    setAnnouncement(`${source.title} moved before ${ordered.find((tile) => tile.id === targetId)?.title}.`);
  }

  const WIDTHS: Tile["w"][] = [3, 4, 6, 8, 12];

  function resize(id: string, direction: 1 | -1) {
    const tile = body.tiles.find((item) => item.id === id);
    if (!tile) return;
    const index = WIDTHS.indexOf(tile.w);
    const next = WIDTHS[Math.min(WIDTHS.length - 1, Math.max(0, index + direction))];
    patchTile(id, { w: next }, `${tile.title} resized to ${next} of 12 columns`);
    setAnnouncement(`${tile.title} is ${next} of 12 columns wide.`);
  }

  function resizeHeight(id: string, direction: 1 | -1) {
    const tile = body.tiles.find((item) => item.id === id);
    if (!tile) return;
    const next = Math.min(3, Math.max(1, tile.h + direction)) as Tile["h"];
    patchTile(id, { h: next }, `${tile.title} height changed`);
    setAnnouncement(`${tile.title} is ${next} rows tall.`);
  }

  /* ---------------- Data ---------------- */
  if (context.tab === "Data") {
    return (
      <Grid>
        <Card span={7} eyebrow="QUERY" title={selected ? `Query for ${selected.title}` : "No tile"} subtitle="Changing a picker recomputes the figure from this company's records" prov="human">
          {!selected ? <Empty title="Add a tile first" /> : (
            <Stack gap={4}>
              <Field label="Tile">
                <Select aria-label="Tile" value={selected.id} onChange={(event) => context.select(event.target.value)}>
                  {body.tiles.map((tile) => <option key={tile.id} value={tile.id}>{tile.title}</option>)}
                </Select>
              </Field>
              <MeasurePicker value={selected.measureId} onChange={(id) => patchTile(selected.id, { measureId: id, title: measureById(id)?.name ?? selected.title }, "Tile measure changed")} />
              <DimensionPicker value={selected.dimensionId ?? ""} onChange={(id) => patchTile(selected.id, { dimensionId: id || undefined, viz: id ? (selected.viz === "stat" ? "bar" : selected.viz) : "stat" }, "Tile dimension changed")} />
              <Field label="Visualisation">
                <Select aria-label="Visualisation" value={selected.viz} onChange={(event) => patchTile(selected.id, { viz: event.target.value as Viz }, "Tile chart changed")}>
                  {(Object.keys(VIZ_LABELS) as Viz[]).map((viz) => <option key={viz} value={viz}>{VIZ_LABELS[viz]}</option>)}
                </Select>
              </Field>
              <Card eyebrow="PREVIEW" title={selected.title} prov="posted">
                <MeasureView
                  spec={{ measureIds: [selected.measureId], dimensionId: selected.dimensionId, filters: body.filters }}
                  viz={selected.viz}
                  context={context}
                  title={selected.title}
                  onInspect={(id) => { context.select(selected.id); context.openOverlay("query editor", { measureId: id }); }}
                />
              </Card>
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="FILTERS" title="Dashboard filters" subtitle="Applied to every tile" prov="human">
          <Stack gap={4}>
            <FilterRows filters={body.filters} onChange={(next) => void write({ ...body, filters: next }, "Dashboard filters changed")} context={context} />
            <CrossWidgetCheck body={body} />
          </Stack>
        </Card>
      </Grid>
    );
  }

  /* ---------------- Style ---------------- */
  if (context.tab === "Style") {
    return (
      <Grid>
        <Card span={12} eyebrow="STYLE" title="Tiles" subtitle="Name, chart and size for each tile" prov="human" flush>
          <DataGrid
            rows={[...body.tiles].sort((left, right) => left.order - right.order)}
            rowId={(row) => row.id}
            label="Tile styles"
            filterable={false}
            selectedId={context.selectedId}
            onSelect={(id) => context.select(id)}
            columns={[
              {
                key: "title", header: "Title", primary: true,
                cell: (row) => (
                  <TextInput
                    value={row.title}
                    aria-label={`Title for ${row.title}`}
                    onChange={(event) => patchTile(row.id, { title: event.target.value }, "Tile renamed")}
                  />
                ),
              },
              { key: "measure", header: "Measure", cell: (row) => measureById(row.measureId)?.name ?? row.measureId },
              {
                key: "viz", header: "Chart",
                cell: (row) => (
                  <Select value={row.viz} aria-label={`Chart for ${row.title}`} onChange={(event) => patchTile(row.id, { viz: event.target.value as Viz }, "Tile chart changed")}>
                    {(Object.keys(VIZ_LABELS) as Viz[]).map((viz) => <option key={viz} value={viz}>{VIZ_LABELS[viz]}</option>)}
                  </Select>
                ),
              },
              {
                key: "width", header: "Width", align: "end",
                cell: (row) => (
                  <Select value={String(row.w)} aria-label={`Width of ${row.title}`} onChange={(event) => patchTile(row.id, { w: Number(event.target.value) as Tile["w"] }, "Tile width changed")}>
                    {WIDTHS.map((width) => <option key={width} value={width}>{width} of 12</option>)}
                  </Select>
                ),
              },
              {
                key: "height", header: "Height", align: "end",
                cell: (row) => (
                  <Select value={String(row.h)} aria-label={`Height of ${row.title}`} onChange={(event) => patchTile(row.id, { h: Number(event.target.value) as Tile["h"] }, "Tile height changed")}>
                    {[1, 2, 3].map((height) => <option key={height} value={height}>{height} row{height === 1 ? "" : "s"}</option>)}
                  </Select>
                ),
              },
            ]}
          />
        </Card>
        <Card span={12} eyebrow="COLOUR" title="Series colour" prov="human">
          <Notice tone="info" title="Series colours come from the design system">
            Chart series use the shared series tokens in order, so the same series keeps the same colour across every dashboard. Status is never carried by a series colour; it is carried by the status pill and the row tone.
          </Notice>
        </Card>
      </Grid>
    );
  }

  /* ---------------- Access ---------------- */
  if (context.tab === "Access") {
    return (
      <Grid>
        <Card span={6} eyebrow="ACCESS" title="Who can open this dashboard" prov="human">
          <Stack gap={4}>
            <Checkbox
              label="Share with everyone in the workspace"
              checked={record.fields.shared === true}
              onChange={(event) => void context.mutate.patch(record.id, { fields: { ...record.fields, shared: event.target.checked } }, { event: event.target.checked ? "Dashboard shared with the workspace" : "Dashboard restricted to its owner" })}
            />
            <Checkbox
              label="Mark the figures sensitive"
              checked={record.fields.sensitive === true}
              onChange={(event) => void context.mutate.patch(record.id, { fields: { ...record.fields, sensitive: event.target.checked } }, { event: event.target.checked ? "Dashboard marked sensitive" : "Sensitive mark removed" })}
            />
            <Properties rows={[
              { label: "Owner", value: record.ownerName },
              { label: "Department", value: String(record.fields.department ?? "Company") },
              { label: "Status", value: record.status },
              { label: "Role view reading it", value: context.role },
            ]} />
            <Notice tone="warning" title="Role views are not an account security boundary">
              A sensitive dashboard hides its preview and its figures from a role view that does not hold it. The whole workspace is in this browser, so this shapes the interface; it is not server-side enforcement.
            </Notice>
          </Stack>
        </Card>
        <Card span={6} eyebrow="SOURCES" title="What this dashboard depends on" prov="posted">
          <SourceDependency body={body} context={context} />
        </Card>
      </Grid>
    );
  }

  /* ---------------- Layout ---------------- */
  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("Widget chooser")}>Add a tile</Button>
        <Button variant="secondary" onClick={() => context.setTab("Data")}>Edit the query</Button>
        <span className="ds-grow" />
        <Pill tone={record.status === "published" ? "success" : "neutral"} dot>{record.status}</Pill>
      </Row>

      {body.tiles.length === 0 ? (
        <Empty title="No tile yet" icon={<LayoutDashboard size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Widget chooser")}>Add the first tile</Button>}>
          A tile names a measure and, optionally, a dimension to group it by. Every tile recomputes when the page renders.
        </Empty>
      ) : (
        <div className="an-grid">
          {[...body.tiles].sort((left, right) => left.order - right.order).map((tile, index, all) => (
            <Card
              key={tile.id}
              className={`an-span-${tile.w} an-h-${tile.h} an-tile`}
              eyebrow={(dimensionById(tile.dimensionId)?.name ?? measureById(tile.measureId)?.collection ?? "TILE").toUpperCase()}
              title={tile.title}
              prov={measureById(tile.measureId)?.unavailable ? "unknown" : "posted"}
              data-selected={context.selectedId === tile.id ? "true" : undefined}
              data-dragover={dragOver === tile.id ? "true" : undefined}
              actions={<span className="ds-eyebrow ds-num">{tile.w}/12</span>}
              footer={
                <Row gap={1} wrap>
                  <Button
                    size="sm" variant="ghost" iconOnly aria-label={`Move ${tile.title} earlier`}
                    disabled={index === 0} onClick={() => reorder(tile.id, -1)}
                  ><ChevronUp size={14} /></Button>
                  <Button
                    size="sm" variant="ghost" iconOnly aria-label={`Move ${tile.title} later`}
                    disabled={index === all.length - 1} onClick={() => reorder(tile.id, 1)}
                  ><ChevronDown size={14} /></Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Make ${tile.title} narrower`} disabled={tile.w === 3} onClick={() => resize(tile.id, -1)}><Minimize2 size={14} /></Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Make ${tile.title} wider`} disabled={tile.w === 12} onClick={() => resize(tile.id, 1)}><Maximize2 size={14} /></Button>
                  <span className="ds-grow" />
                  <span
                    className="an-tile-grip"
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder ${tile.title} by dragging, or use the arrow buttons`}
                    onDragStart={() => setDrag(tile.id)}
                    onDragEnd={() => { setDrag(null); setDragOver(null); }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); reorder(tile.id, -1); }
                      if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); reorder(tile.id, 1); }
                    }}
                  >
                    <GripVertical size={14} />
                  </span>
                </Row>
              }
              onDragOver={(event) => { if (drag && drag !== tile.id) { event.preventDefault(); setDragOver(tile.id); } }}
              onDragLeave={() => setDragOver((current) => (current === tile.id ? null : current))}
              onDrop={(event) => { event.preventDefault(); if (drag) moveBefore(drag, tile.id); setDrag(null); setDragOver(null); }}
              onClick={() => context.select(tile.id)}
            >
              <MeasureView
                spec={{ measureIds: [tile.measureId], dimensionId: tile.dimensionId, filters: body.filters }}
                viz={tile.viz}
                context={context}
                title={tile.title}
                onInspect={(id) => { context.select(tile.id); context.openOverlay("query editor", { measureId: id }); }}
              />
              <button
                type="button"
                className="an-tile-handle"
                aria-label={`Resize ${tile.title}. Currently ${tile.w} of 12 columns and ${tile.h} rows. Use the arrow keys.`}
                onPointerDown={(event) => { setResizing(tile.id); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }}
                onPointerMove={(event) => {
                  if (resizing !== tile.id) return;
                  const card = (event.currentTarget as HTMLElement).parentElement;
                  const grid = card?.parentElement;
                  if (!card || !grid) return;
                  const column = grid.getBoundingClientRect().width / 12;
                  const wanted = Math.round((event.clientX - card.getBoundingClientRect().left) / column);
                  const nearest = WIDTHS.reduce((best, width) => (Math.abs(width - wanted) < Math.abs(best - wanted) ? width : best), WIDTHS[0]);
                  if (nearest !== tile.w) patchTile(tile.id, { w: nearest }, `${tile.title} resized to ${nearest} of 12 columns`);
                }}
                onPointerUp={(event) => { setResizing(null); try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* already released */ } }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") { event.preventDefault(); resize(tile.id, 1); }
                  if (event.key === "ArrowLeft") { event.preventDefault(); resize(tile.id, -1); }
                  if (event.key === "ArrowDown") { event.preventDefault(); resizeHeight(tile.id, 1); }
                  if (event.key === "ArrowUp") { event.preventDefault(); resizeHeight(tile.id, -1); }
                }}
              >
                <GripVertical size={12} />
              </button>
            </Card>
          ))}
        </div>
      )}
      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        Drag the grip to reorder a tile and the corner to resize it. The arrow buttons on each tile do the same from the keyboard, and the resize handle takes the arrow keys when focused.
      </p>
      <p className="ds-sr-only" role="status" aria-live="polite">{announcement}</p>
    </Stack>
  );
}

export function CrossWidgetCheck({ body }: { body: DashboardBody }) {
  const mismatches = body.filters.flatMap((filter) => {
    const dimension = dimensionById(filter.dimensionId);
    if (!dimension) return [];
    return body.tiles
      .filter((tile) => {
        const measure = measureById(tile.measureId);
        if (!measure || measure.unavailable) return false;
        if (dimension.type === "time") return false;
        if (dimension.id === "priority") return !["tickets", "tasks"].includes(measure.collection);
        if (dimension.id === "stage") return !["deals", "leads", "tasks"].includes(measure.collection);
        if (dimension.id === "source") return !["leads"].includes(measure.collection);
        return false;
      })
      .map((tile) => ({ tile, dimension }));
  });

  if (body.filters.length === 0) {
    return <Notice tone="info" title="No cross-tile filter">Each tile shows everything its measure selects.</Notice>;
  }
  if (mismatches.length === 0) {
    return <Notice tone="success" title="Every filter applies to every tile">The filter fields exist on the collections these tiles read, so the same filter means the same thing everywhere.</Notice>;
  }
  return (
    <Notice tone="warning" title={`${mismatches.length} tile${mismatches.length === 1 ? "" : "s"} cannot answer a filter`}>
      {mismatches.map((item) => `${item.tile.title} reads ${measureById(item.tile.measureId)?.collection}, which carries no ${item.dimension.name.toLowerCase()}`).join("; ")}.
      Those tiles are left unfiltered and this notice says so, rather than quietly dropping the filter or emptying the tile.
    </Notice>
  );
}

function SourceDependency({ body, context }: { body: DashboardBody; context: ScreenContext }) {
  const { context: queryContext } = useAnalytics();
  const measureIds = [...new Set(body.tiles.map((tile) => tile.measureId))];
  const result = runQuery({ measureIds, filters: body.filters }, queryContext);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Collections read", value: result.sources.join(", ") || "none" },
        { label: "Records contributing", value: String(result.recordCount) },
        { label: "Newest record", value: result.asOf ? `${context.date(result.asOf)} (${result.ageDays} day${result.ageDays === 1 ? "" : "s"} old)` : "Unknown" },
        { label: "Measures without a source", value: String(result.unavailable.length) },
      ]} />
      {result.unavailable.length > 0 && (
        <Notice tone="warning" title="Some tiles cannot be computed">
          {result.unavailable.map((item) => `${item.name}: ${item.reason}`).join(" ")}
        </Notice>
      )}
      <Notice tone="info" title="No external source">
        Every tile reads records in this browser. No warehouse, no extract and no scheduled refresh is involved, so a figure is never older than the records it names.
      </Notice>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function WidgetChooser({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const [measureId, setMeasureId] = useState("revenue.paid");
  const [dimensionId, setDimensionId] = useState("");
  const [viz, setViz] = useState<Viz>("stat");
  if (!record) return <Empty title="Open a dashboard first" />;
  const body = readDashboard(record);
  const measure = measureById(measureId);

  return (
    <Stack gap={4}>
      <MeasurePicker value={measureId} onChange={(id) => { setMeasureId(id); }} />
      <DimensionPicker value={dimensionId} onChange={(id) => { setDimensionId(id); setViz(id ? "bar" : "stat"); }} />
      <Field label="Visualisation">
        <Select aria-label="Visualisation" value={viz} onChange={(event) => setViz(event.target.value as Viz)}>
          {(Object.keys(VIZ_LABELS) as Viz[]).map((item) => <option key={item} value={item}>{VIZ_LABELS[item]}</option>)}
        </Select>
      </Field>
      {measure?.unavailable && (
        <Notice tone="warning" title="This measure has no source here">
          {measure.unavailable} The tile can still be added; it will read Unavailable rather than show a number.
        </Notice>
      )}
      <Card eyebrow="PREVIEW" title={measure?.name ?? "Tile"} prov={measure?.unavailable ? "unknown" : "posted"}>
        <MeasureView
          spec={{ measureIds: [measureId], dimensionId: dimensionId || undefined, filters: body.filters }}
          viz={viz}
          context={context}
          title={measure?.name ?? "Tile"}
        />
      </Card>
      <Button
        variant="primary"
        onClick={async () => {
          const tile: Tile = {
            id: `t${body.tiles.length + 1}-${Date.now().toString(36)}`,
            title: measure?.name ?? "Tile",
            measureId,
            dimensionId: dimensionId || undefined,
            viz,
            w: viz === "stat" ? 3 : viz === "line" || viz === "bar" ? 8 : 4,
            h: viz === "stat" ? 1 : 2,
            order: body.tiles.length,
          };
          await context.mutate.patch(record.id, { body: { ...body, tiles: [...body.tiles, tile] } }, { event: `Tile added: ${tile.title}` });
          context.toast("Tile added", `${tile.title} is on the dashboard and recomputes from ${measure?.collection ?? "the workspace"}.`);
          close();
        }}
      >
        Add the tile
      </Button>
    </Stack>
  );
}

export function QueryEditor({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { measureId?: string } | undefined;
  const record = useRecord(context.params.id);
  const body = readDashboard(record);
  const tile = body.tiles.find((item) => item.id === context.selectedId);
  const measureId = payload?.measureId ?? tile?.measureId ?? "revenue.paid";
  const measure = measureById(measureId);
  const { context: queryContext } = useAnalytics();
  const result = runQuery({ measureIds: [measureId], dimensionId: tile?.dimensionId, filters: body.filters }, queryContext);

  if (!measure) return <Empty title="Unknown measure" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Measure", value: measure.name },
        { label: "Formula", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{measure.formula}</code> },
        { label: "Collection", value: measure.collection },
        { label: "Grouped by", value: dimensionById(tile?.dimensionId)?.name ?? "nothing" },
        { label: "Filters applied", value: String(body.filters.length) },
        { label: "Records contributing", value: String(result.recordCount) },
        { label: "Newest record", value: result.asOf ? `${context.date(result.asOf)} (${result.ageDays} days old)` : "Unknown" },
      ]} />
      <p>{measure.description}</p>
      {result.inapplicableFilters.length > 0 && (
        <Notice tone="warning" title="A filter does not apply to this measure">
          {result.inapplicableFilters.map((item) => item.reason).join(" ")}
        </Notice>
      )}
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/analytics/metrics`)}>Open the metric definition</Button>
    </Stack>
  );
}

export function DashboardSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [department, setDepartment] = useState("Company");
  const [template, setTemplate] = useState(TEMPLATES[0].id);

  return (
    <form
      id="dashboard-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const chosen = TEMPLATES.find((item) => item.id === template) ?? TEMPLATES[0];
        const created = await context.mutate.create({
          collection: "dashboards",
          title: title.trim() || chosen.name,
          status: "draft",
          summary: summary.trim() || chosen.description,
          fields: { department, shared: false, pinned: false, sensitive: false, template: chosen.id },
          body: { tiles: chosen.tiles.map((tile, index) => ({ ...tile, id: `t${index + 1}`, order: index })), filters: [] },
        }, "Dashboard created");
        context.toast("Dashboard created", `${created.title} is a draft with ${chosen.tiles.length} tiles that recompute from this company's records.`);
        context.navigate(`/o/${context.org.slug}/analytics/dashboards/${created.id}`);
        close();
      }}
    >
      <Field label="Name" required><TextInput aria-label="Name" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Monday trading review" /></Field>
      <Field label="What it answers"><TextArea aria-label="What it answers" rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Field label="Department">
        <Select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}>
          {["Company", "Finance", "Commercial", "Operations", "Studio"].map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Starting layout">
        <Select aria-label="Starting layout" value={template} onChange={(event) => setTemplate(event.target.value)}>
          {TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="Created as a draft">Nothing is shared until you share it on the Access tab.</Notice>
    </form>
  );
}

export function SharingPanel({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.selectedId ?? context.params.id);
  const members = useCollection("members");
  const [shared, setShared] = useState<boolean | null>(null);
  if (!record) return <Empty title="Choose a dashboard first" />;
  const value = shared ?? record.fields.shared === true;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Dashboard", value: record.title },
        { label: "Owner", value: record.ownerName },
        { label: "Sensitive", value: record.fields.sensitive === true ? "yes" : "no" },
      ]} />
      <Checkbox label="Everyone in this workspace can open it" checked={value} onChange={(event) => setShared(event.target.checked)} />
      <Stack gap={2}>
        <strong>Who that is, today</strong>
        {members.length === 0 ? <span className="ds-subtle">No members are recorded.</span> : members.map((member) => (
          <Row key={member.id} gap={2}>
            <span className="ds-grow ds-truncate">{member.title}</span>
            <Pill tone={member.fields.kind === "ai" ? "accent" : "neutral"}>{member.fields.kind === "ai" ? "AI employee" : "person"}</Pill>
          </Row>
        ))}
      </Stack>
      <Notice tone="warning" title="Sharing is local">
        There is no link to send and no email to invite with. Sharing changes who this browser offers the dashboard to; it is not an account permission.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(record.id, { fields: { ...record.fields, shared: value } }, { expectRevision: record.revision, event: value ? "Dashboard shared with the workspace" : "Dashboard restricted to its owner" });
          context.toast("Access changed", value ? "Everyone in the workspace sees it in the directory." : "Only the owner sees it.");
          close();
        }}
      >
        Save access
      </Button>
    </Stack>
  );
}

export function DashboardStats({ context }: { context: ScreenContext }) {
  const dashboards = useCollection("dashboards");
  return (
    <StatRow>
      <MeasureSummaryGrid measureIds={["revenue.paid", "receivable.open", "pipeline.open"]} context={context} onInspect={(id) => context.openOverlay("Metric inspector", { measureId: id })} />
      <Stat label="Dashboards" value={String(dashboards.length)} prov="human" meta={`${dashboards.filter((item) => item.fields.shared === true).length} shared`} />
    </StatRow>
  );
}

export { DIMENSIONS };

export function SourceDependencyOverlay({ context }: { context: ScreenContext }) {
  const record = useRecord(context.selectedId ?? context.params.id);
  if (!record || record.collection !== "dashboards") {
    return <Empty title="Choose a dashboard">Select a dashboard to see which collections its tiles read.</Empty>;
  }
  return (
    <Stack gap={4}>
      <Properties rows={[{ label: "Dashboard", value: record.title }, { label: "Tiles", value: String(readDashboard(record).tiles.length) }]} />
      <SourceDependency body={readDashboard(record)} context={context} />
    </Stack>
  );
}
