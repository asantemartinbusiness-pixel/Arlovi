import { useMemo } from "react";
import { BarChart, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextInput } from "@/design-system";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import type { AppModel, AppScreen, Entity } from "./model";

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

export function ScreenPreview({
  model, screen, role,
}: { model: AppModel; screen: AppScreen | undefined; role: string }) {
  const collections = useMemo(
    () => [...new Set(model.entities.map((entity) => entity.collection).filter(Boolean))],
    [model.entities],
  );
  const data = useCollections(collections.length ? collections : ["tasks"]);
  const { money } = useWorkspace();
  const activeRole = model.roles.find((item) => item.id === role);

  if (!screen) return <Empty title="No screen designed yet" >Add a screen in the designer and the preview runs it here.</Empty>;

  function rowsFor(entity: Entity | undefined): Rec[] {
    if (!entity || !entity.collection) return [];
    return data[entity.collection] ?? [];
  }

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
      <Grid>
        {screen.components.length === 0 && (
          <Card span={12}><Empty title="This screen has no components" >Add one from the palette and it appears here immediately.</Empty></Card>
        )}
        {screen.components.map((component) => {
          const entity = model.entities.find((item) => item.id === component.entityId);
          const rows = rowsFor(entity);
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
                    meta={`${component.aggregate === "sum" ? "Sum" : "Count"} over ${rows.length} ${entity.collection} records`}
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
              <Card key={component.id} span={component.span} title={component.title} subtitle={`Grouped by ${field.name}`}>
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
              <Card key={component.id} span={component.span} title={component.title} subtitle={`${rows.length} ${entity.collection}`}>
                {rows.length === 0 ? <Empty title="No records" /> : (
                  <Stack gap={1}>
                    {rows.slice(0, 8).map((row) => <Row key={row.id} gap={2}><span className="ds-grow ds-truncate">{valueOf(row, field.name) || row.title}</span><Pill tone="neutral">{row.status}</Pill></Row>)}
                  </Stack>
                )}
              </Card>
            );
          }

          if (component.kind === "detail") {
            const first = rows[0];
            return (
              <Card key={component.id} span={component.span} title={component.title} subtitle={first ? first.title : undefined}>
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
                  {fields.map((field) => (
                    <Field key={field.id} label={field.name} required={field.required}>
                      {field.kind === "choice"
                        ? <Select disabled={!writable} defaultValue="">{["", ...field.options].map((option) => <option key={option || "none"} value={option}>{option || "Choose"}</option>)}</Select>
                        : <TextInput disabled={!writable} type={field.kind === "number" || field.kind === "money" ? "number" : field.kind === "date" ? "date" : "text"} />}
                    </Field>
                  ))}
                  {!writable && <Notice tone="warning" title={`${activeRole?.name} has read access only`}>The fields are disabled in this role view.</Notice>}
                  <Notice tone="info" title="The preview does not write">A form in the preview shows the generated validation. Creating records is a decision for the built app, not for a design preview.</Notice>
                </Stack>
              </Card>
            );
          }

          return (
            <Card key={component.id} span={component.span} title={component.title} subtitle={`${rows.length} records from ${entity.collection}`} flush>
              {rows.length === 0 ? <Empty title={`No ${entity.collection} records in this organisation`} /> : (
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
                />
              )}
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}
