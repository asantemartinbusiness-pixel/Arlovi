import { useMemo, useState } from "react";
import { BarChart, Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextInput } from "@/design-system";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import type { AppModel, AppScreen, Entity, ScreenComponent } from "./model";
import { applyQuery, describeQuery } from "./binding";

/* ====================================================================== *
 * The preview runs a designed screen against records that are really in
 * this workspace. A component bound to an entity whose collection is set
 * reads that collection; one that is not bound says so instead of
 * rendering invented rows.
 * ====================================================================== */

function valueOf(record: Rec, fieldName: string): string {
  const key = fieldName.toLowerCase();
  if (key === "title" || key === "name") return record.title;
  if (key === "status" || key === "state") return record.status;
  if (key === "summary" || key === "description") return record.summary;
  if (key === "owner") return record.ownerName;
  if (key === "amount" || key === "total" || key === "value") return record.amountMinor === undefined ? "" : String(record.amountMinor);
  if (key === "due" || key === "due date") return record.dueAt ?? "";
  if (key === "date" || key === "created") return record.at ?? record.createdAt;
  const direct = record.fields[fieldName] ?? record.fields[key];
  return direct === undefined ? "" : String(direct);
}

interface PreviewStep { screenId: string; recordId: string; via: string }

export function ScreenPreview({
  model, screen: designed, role,
}: { model: AppModel; screen: AppScreen | undefined; role: string }) {
  /* Interactions move the preview between screens without touching the
     designer's selection. The trail resets when another screen is designed. */
  const [trail, setTrail] = useState<PreviewStep[]>([]);
  const [baseId, setBaseId] = useState(designed?.id);
  if (designed?.id !== baseId) { setBaseId(designed?.id); setTrail([]); }
  const step = trail[trail.length - 1];
  const screen = (step && model.screens.find((item) => item.id === step.screenId)) || designed;
  const focusId = step?.recordId ?? "";
  const collections = useMemo(
    () => [...new Set(model.entities.map((entity) => entity.collection).filter(Boolean))],
    [model.entities],
  );
  const data = useCollections(collections.length ? collections : ["tasks"]);
  const { money } = useWorkspace();
  const activeRole = model.roles.find((item) => item.id === role);

  if (!screen) return <Empty title="No screen designed yet" >Add a screen in the designer and the preview runs it here.</Empty>;

  function allRows(entity: Entity | undefined): Rec[] {
    if (!entity || !entity.collection) return [];
    return data[entity.collection] ?? [];
  }

  function queried(entity: Entity | undefined, component: ScreenComponent) {
    const rows = allRows(entity);
    const read = (row: Rec, fieldId: string) => valueOf(row, entity?.fields.find((field) => field.id === fieldId)?.name ?? "");
    return applyQuery(rows, component, read, entity?.fields.map((field) => field.id) ?? []);
  }

  function choose(component: ScreenComponent, row?: Rec) {
    const { kind, screenId } = component.interaction;
    if (kind === "none" || !model.screens.some((item) => item.id === screenId)) return;
    setTrail((current) => [...current, { screenId, recordId: kind === "open_record" && row ? row.id : "", via: `${component.title}${row ? `: ${row.title}` : ""}` }]);
  }

  const target = (component: ScreenComponent) => model.screens.find((item) => item.id === component.interaction.screenId);

  function denied(entity: Entity | undefined): boolean {
    if (!activeRole || !entity) return false;
    return (activeRole.grants[entity.id] ?? "none") === "none";
  }

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Pill tone="info">{screen.name}</Pill>
        <code className="ds-subtle">{screen.route}</code>
        {activeRole && <Pill tone="accent">as {activeRole.name}</Pill>}
      </Row>
      {step && (
        <div className="t6-build-preview-trail" aria-label="Preview path">
          <span className="ds-subtle">Opened from {step.via}</span>
          <Button size="sm" variant="secondary" onClick={() => setTrail((current) => current.slice(0, -1))}>
            Back to {(trail.length > 1 ? model.screens.find((item) => item.id === trail[trail.length - 2].screenId) : designed)?.name ?? "the previous screen"}
          </Button>
          {trail.length > 1 && <Button size="sm" variant="ghost" onClick={() => setTrail([])}>Back to {designed?.name}</Button>}
        </div>
      )}
      <Grid>
        {screen.components.length === 0 && (
          <Card span={12}><Empty title="This screen has no components" >Add one from the palette and it appears here immediately.</Empty></Card>
        )}
        {screen.components.map((component) => {
          const entity = model.entities.find((item) => item.id === component.entityId);
          const result = queried(entity, component);
          const rows = result.rows;
          const fieldName = (id: string) => entity?.fields.find((field) => field.id === id)?.name;
          const scope = `${describeQuery(component, fieldName)} · ${result.matched === result.total ? result.total : `${result.matched} of ${result.total}`} ${entity?.collection ?? ""} records`;
          const focused = focusId ? allRows(entity).find((row) => row.id === focusId) : undefined;
          const fields = component.fieldIds.length
            ? component.fieldIds.map((id) => entity?.fields.find((field) => field.id === id)).filter((field): field is NonNullable<typeof field> => Boolean(field))
            : entity?.fields.slice(0, 4) ?? [];

          if (component.kind === "text") {
            return <Card key={component.id} span={component.span} title={component.title}><p className="ds-prose">{component.text}</p></Card>;
          }
          if (!entity) {
            return (
              <Card key={component.id} span={component.span} title={component.title}>
                <Notice tone="warning" title="Not bound to an entity">A data component with no entity has nothing to read. Bind it in the designer.</Notice>
              </Card>
            );
          }
          if (denied(entity)) {
            return (
              <Card key={component.id} span={component.span} title={component.title}>
                <Notice tone="warning" title={`${activeRole?.name} cannot read ${entity.name}`}>
                  The role view hides this component. That shapes the interface; it is not an account security boundary.
                </Notice>
              </Card>
            );
          }
          if (!entity.collection) {
            return (
              <Card key={component.id} span={component.span} title={component.title}>
                <Notice tone="warning" title={`${entity.name} is not bound to a collection`}>
                  Choose a workspace collection on the entity and the preview reads real records. Nothing is invented to fill the gap.
                </Notice>
              </Card>
            );
          }

          if (component.kind === "stat") {
            const field = fields[0];
            const total = component.aggregate === "sum" && field
              ? rows.reduce((sum, row) => sum + (Number(valueOf(row, field.name)) || 0), 0)
              : rows.length;
            const isMoney = component.aggregate === "sum" && field?.kind === "money";
            return (
              <Card key={component.id} span={component.span}>
                <StatRow>
                  <Stat
                    label={component.title}
                    value={isMoney ? money(total) : String(total)}
                    meta={`${component.aggregate === "sum" ? "Sum" : "Count"} over ${rows.length} ${entity.collection} records · ${describeQuery(component, fieldName)}`}
                  />
                </StatRow>
              </Card>
            );
          }

          if (component.kind === "chart") {
            const field = fields[0] ?? entity.fields[0];
            const buckets = rows.reduce<Record<string, number>>((map, row) => {
              const key = valueOf(row, field.name) || "not set";
              map[key] = (map[key] ?? 0) + 1;
              return map;
            }, {});
            return (
              <Card key={component.id} span={component.span} title={component.title} subtitle={`Grouped by ${field.name} · ${scope}`}>
                {rows.length === 0
                  ? <Empty title={`No ${entity.collection} records`} />
                  : <BarChart
                    title={`${entity.name} by ${field.name}`}
                    height={200}
                    format={(value) => String(Math.round(value))}
                    series={[{ name: field.name, points: Object.entries(buckets).map(([label, value]) => ({ label, value })) }]}
                  />}
              </Card>
            );
          }

          if (component.kind === "list") {
            const field = fields[0] ?? entity.fields[0];
            return (
              <Card key={component.id} span={component.span} title={component.title} subtitle={scope}>
                {rows.length === 0 ? <Empty title={result.total ? "No records match the filters" : "No records"} /> : (
                  <Stack gap={1}>
                    {rows.slice(0, component.limit || 8).map((row) => component.interaction.kind !== "none" && target(component)
                      ? <button key={row.id} type="button" className="ds-record-card t6-build-row-action" aria-label={`${valueOf(row, field.name) || row.title}: open ${target(component)?.name}`} onClick={() => choose(component, row)}>
                        <Row gap={2}><span className="ds-grow ds-truncate" style={{ textAlign: "start" }}>{valueOf(row, field.name) || row.title}</span><Pill tone="neutral">{row.status}</Pill></Row>
                      </button>
                      : <Row key={row.id} gap={2}><span className="ds-grow ds-truncate">{valueOf(row, field.name) || row.title}</span><Pill tone="neutral">{row.status}</Pill></Row>)}
                  </Stack>
                )}
              </Card>
            );
          }

          if (component.kind === "detail") {
            const first = focused ?? rows[0];
            return (
              <Card key={component.id} span={component.span} title={component.title} subtitle={first ? `${first.title}${focused ? " · the chosen record" : ""}` : undefined}>
                {first
                  ? <Properties rows={fields.map((field) => ({ label: field.name, value: valueOf(first, field.name) || <span className="ds-subtle">Empty</span> }))} />
                  : <Empty title={`No ${entity.collection} record to show`} />}
              </Card>
            );
          }

          if (component.kind === "form") {
            const writable = !activeRole || (activeRole.grants[entity.id] ?? "none") === "write";
            return (
              <Card key={component.id} span={component.span} title={component.title} subtitle={`${fields.length} fields from ${entity.name}`}>
                <Stack gap={3}>
                  {focused && <Pill tone="info">Editing {focused.title}</Pill>}
                  {fields.map((field) => (
                    <Field key={`${field.id}-${focused?.id ?? "new"}`} label={field.name} required={field.required}>
                      {field.kind === "choice"
                        ? <Select disabled={!writable} defaultValue={focused ? valueOf(focused, field.name) : ""}>{[...new Set(["", ...field.options, ...(focused ? [valueOf(focused, field.name)] : [])])].map((option) => <option key={option || "none"} value={option}>{option || "Choose"}</option>)}</Select>
                        : <TextInput disabled={!writable} defaultValue={focused ? valueOf(focused, field.name) : undefined} type={field.kind === "number" || field.kind === "money" ? "number" : field.kind === "date" ? "date" : "text"} />}
                    </Field>
                  ))}
                  {component.interaction.kind !== "none" && target(component) && (
                    <Row gap={2} wrap>
                      <Button size="sm" variant="secondary" onClick={() => choose(component)}>Continue to {target(component)?.name} (nothing is saved)</Button>
                    </Row>
                  )}
                  {!writable && <Notice tone="warning" title={`${activeRole?.name} has read access only`}>The fields are disabled in this role view.</Notice>}
                  <Notice tone="info" title="The preview does not write">A form in the preview shows the generated validation. Creating records is a decision for the built app, not for a design preview.</Notice>
                </Stack>
              </Card>
            );
          }

          return (
            <Card key={component.id} span={component.span} title={component.title} subtitle={scope} flush>
              {rows.length === 0 ? <Empty title={result.total ? "No records match the filters" : `No ${entity.collection} records in this organisation`} /> : (
                <DataGrid
                  rows={rows}
                  rowId={(row) => row.id}
                  label={component.title}
                  filterable={rows.length > 8}
                  columns={fields.map((field, index) => ({
                    key: field.id,
                    header: field.name,
                    primary: index === 0,
                    cell: (row: Rec) => (field.kind === "money" ? money(Number(valueOf(row, field.name)) || 0) : valueOf(row, field.name) || "—"),
                    sortValue: (row: Rec) => valueOf(row, field.name),
                    filterValue: (row: Rec) => valueOf(row, field.name),
                  }))}
                  onOpen={component.interaction.kind !== "none" && target(component) ? (id) => choose(component, rows.find((row) => row.id === id)) : undefined}
                />
              )}
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}
