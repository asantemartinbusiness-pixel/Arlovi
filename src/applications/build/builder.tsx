import { useMemo } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  BarChart3, Boxes, FileText, LayoutList, Rows3, SquareStack, Table2, TextCursorInput, Type,
} from "lucide-react";
import {
  Button, Card, Checkbox, Empty, Field, Grid, Notice, Pill, Row, Select, Stack,
  Tabs, TextArea, TextInput, Toolbar, ToolbarSeparator,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { MiniField, PaletteChip, ReorderArea, SortableRow, move } from "@/applications/t6kit/kit";
import {
  BINDABLE_COLLECTIONS, COMPONENT_HINTS, COMPONENT_LABELS, FIELD_KINDS, FIELD_KIND_LABELS,
  generateTypes, issueTotals, makeComponent, makeEntity, makeField, readApp, validateApp,
  type AppModel, type ComponentKind, type Entity, type EntityField, type ScreenComponent,
} from "./model";
import { ScreenPreview } from "./preview";
import { saveApp, useBuildUi } from "./state";

const COMPONENT_ICONS: Record<ComponentKind, React.ReactNode> = {
  table: <Table2 size={15} />, detail: <LayoutList size={15} />, stat: <SquareStack size={15} />,
  list: <Rows3 size={15} />, form: <TextCursorInput size={15} />, text: <Type size={15} />,
  chart: <BarChart3 size={15} />,
};

export function useAppRecord(context: ScreenContext): { projects: Rec[]; record?: Rec; model: AppModel } {
  const projects = useCollection("appProjects");
  const routed = useRecord(context.params.id);
  const record = routed?.collection === "appProjects" ? routed : projects[0];
  const model = useMemo(() => readApp(record), [record]);
  return { projects, record, model };
}

export function NoProject() {
  return <Empty title="No app project in this workspace" icon={<Boxes size={20} />}>Create one in the project library and it opens here.</Empty>;
}

/* ================================================================ *
 * ARL-BUILD-003 — Visual App Builder (full chrome)
 * ================================================================ */

export function AppBuilder({ context }: { context: ScreenContext }) {
  const { projects, record, model } = useAppRecord(context);
  const ui = useBuildUi();
  if (!record) return <NoProject />;
  const screen = model.screens.find((item) => item.id === ui.screenId) ?? model.screens[0];
  const component = screen?.components.find((item) => item.id === ui.componentId);
  const issues = validateApp(model);
  const totals = issueTotals(issues);

  async function write(next: AppModel, label: string) {
    await saveApp(context, record!, next, label);
  }

  function setComponents(components: ScreenComponent[], label: string) {
    if (!screen) return;
    void write({ ...model, screens: model.screens.map((item) => (item.id === screen.id ? { ...item, components } : item)) }, label);
  }

  function insert(kind: ComponentKind, index?: number) {
    if (!screen) return;
    const next = makeComponent(kind);
    next.entityId = model.entities[0]?.id ?? "";
    next.fieldIds = model.entities[0]?.fields.slice(0, 3).map((field) => field.id) ?? [];
    const at = index ?? (component ? screen.components.findIndex((item) => item.id === component.id) + 1 : screen.components.length);
    const components = [...screen.components];
    components.splice(at, 0, next);
    ui.selectComponent(next.id);
    setComponents(components, `Added a ${COMPONENT_LABELS[kind].toLowerCase()} to ${screen.name}`);
  }

  function onDragEnd(event: DragEndEvent) {
    if (!screen) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    const paletteKind = (event.active.data.current as { palette?: string } | undefined)?.palette;
    if (paletteKind) {
      const index = overId ? screen.components.findIndex((item) => item.id === overId) : screen.components.length;
      insert(paletteKind as ComponentKind, index < 0 ? screen.components.length : index);
      return;
    }
    if (!overId || activeId === overId) return;
    const from = screen.components.findIndex((item) => item.id === activeId);
    const to = screen.components.findIndex((item) => item.id === overId);
    if (from < 0 || to < 0) return;
    setComponents(move(screen.components, from, to), `Moved ${screen.components[from].title} to position ${to + 1}`);
  }

  const palette = (
    <div className="t6-pane" key="palette">
      <Stack gap={4}>
        <div>
          <h3 style={{ fontSize: "var(--text-md)" }}>Components</h3>
          <p className="ds-subtle">Press to add after the selection, or drag onto a position. New components bind to {model.entities[0]?.name ?? "the first entity"}.</p>
        </div>
        <div className="t6-palette">
          {(Object.keys(COMPONENT_LABELS) as ComponentKind[]).map((kind) => (
            <PaletteChip key={kind} type={kind} label={COMPONENT_LABELS[kind]} hint={COMPONENT_HINTS[kind]} icon={COMPONENT_ICONS[kind]} onInsert={() => insert(kind)} />
          ))}
        </div>
        <Notice tone="info" title="Keyboard equivalent">
          Each component has Move up and Move down buttons, and the grip picks it up with Space.
        </Notice>
      </Stack>
    </div>
  );

  const canvas = (
    <div className="t6-pane" data-kind="canvas" key="canvas">
      {!screen ? (
        <Empty title="No screen yet" icon={<FileText size={20} />}
          action={<Button variant="primary" onClick={() => context.openOverlay("Component inspector", { newScreen: true })}>Add a screen</Button>}>
          A screen is a route and a stack of components bound to the data model.
        </Empty>
      ) : (
        <Stack gap={3}>
          <Row gap={2} wrap>
            <strong>{screen.name}</strong>
            <code className="ds-subtle">{screen.route}</code>
            <Pill tone={totals.fail ? "danger" : totals.warn ? "warning" : "success"}>{totals.fail ? `${totals.fail} failing` : totals.warn ? `${totals.warn} to review` : "Model valid"}</Pill>
          </Row>
          <ReorderArea ids={screen.components.map((item) => item.id)} onDragEnd={onDragEnd} label={`${screen.name} component order`}>
            {screen.components.map((item, index) => {
              const entity = model.entities.find((candidate) => candidate.id === item.entityId);
              return (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  name={item.title}
                  index={index}
                  count={screen.components.length}
                  selected={item.id === ui.componentId}
                  onSelect={() => ui.selectComponent(item.id)}
                  onMove={(from, to) => setComponents(move(screen.components, from, to), `Moved ${item.title} to position ${to + 1}`)}
                >
                  {({ handle }) => (
                    <Row gap={2} style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                      {handle}
                      <span aria-hidden="true" style={{ color: "var(--accent)", paddingTop: 2 }}>{COMPONENT_ICONS[item.kind]}</span>
                      <div className="ds-grow" style={{ minWidth: 0 }}>
                        <Row gap={2} wrap>
                          <strong>{item.title}</strong>
                          <Pill tone="neutral">{COMPONENT_LABELS[item.kind]}</Pill>
                          <Pill tone={entity ? "success" : "danger"}>{entity ? entity.name : "not bound"}</Pill>
                          {entity && !entity.collection && <Pill tone="warning">no collection</Pill>}
                        </Row>
                        <span className="ds-subtle">
                          {item.kind === "text" ? item.text.slice(0, 70) : item.fieldIds.length ? item.fieldIds.map((id) => entity?.fields.find((field) => field.id === id)?.name ?? "missing").join(", ") : "all fields"}
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { ui.selectComponent(item.id); context.openOverlay("Component inspector"); }}>Bind</Button>
                    </Row>
                  )}
                </SortableRow>
              );
            })}
          </ReorderArea>
          {screen.components.length === 0 && <Empty title="No components on this screen" icon={<LayoutList size={20} />}>Add one from the palette.</Empty>}
        </Stack>
      )}
    </div>
  );

  const inspector = (
    <div className="t6-pane" data-kind="inspector" key="inspector">
      {component
        ? <ComponentInspector component={component} model={model} onEdit={(patch) => setComponents(screen!.components.map((item) => (item.id === component.id ? { ...item, ...patch } : item)), `Edited ${component.title}`)} onRemove={() => { setComponents(screen!.components.filter((item) => item.id !== component.id), `Removed ${component.title}`); ui.selectComponent(""); }} />
        : <Empty title="No component selected" icon={<LayoutList size={18} />}>Select one on the canvas to bind it to an entity and choose its fields.</Empty>}
    </div>
  );

  const dataPane = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="data">
      <EntityDesigner context={context} record={record} model={model} />
    </div>
  );

  const logicPane = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="logic">
      <Grid>
        <Card span={7} title="Automations" subtitle={`${model.automations.length} defined`}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/api`)}>Open API and functions</Button>}>
          {model.automations.length === 0
            ? <Empty title="No automation yet" icon={<FileText size={20} />}>An automation watches an entity and runs steps when a condition matches.</Empty>
            : <Stack gap={3}>{model.automations.map((automation) => {
              const entity = model.entities.find((item) => item.id === automation.entityId);
              const field = entity?.fields.find((item) => item.id === automation.condition.fieldId);
              return (
                <div key={automation.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2} wrap>
                    <strong className="ds-grow">{automation.name}</strong>
                    <Pill tone={automation.enabled ? "success" : "neutral"} dot>{automation.enabled ? "enabled" : "paused"}</Pill>
                  </Row>
                  <p className="ds-subtle">
                    When a {entity?.name ?? "missing entity"} is {automation.trigger.replace("_", " ")}
                    {field ? ` and ${field.name} ${automation.condition.operator.replace("_", " ")} ${automation.condition.value}` : ""}
                    , then {automation.steps.map((step) => step.kind.replace("_", " ")).join(", ") || "nothing"}.
                  </p>
                  <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("expression editor", { id: automation.id })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => void write({ ...model, automations: model.automations.map((item) => (item.id === automation.id ? { ...item, enabled: !item.enabled } : item)) }, `${automation.name} ${automation.enabled ? "paused" : "enabled"}`)}>
                      {automation.enabled ? "Pause" : "Enable"}
                    </Button>
                  </Row>
                </div>
              );
            })}</Stack>}
        </Card>
        <Card span={5} title="What the model says" subtitle={`${issues.filter((issue) => issue.area === "Logic").length} checks`}>
          <Stack gap={2}>
            {issues.filter((issue) => issue.area === "Logic").map((issue) => (
              <div key={issue.id} className="t6-check" data-state={issue.level}>
                <span className="t6-check-dot" aria-hidden="true" />
                <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
                <Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level}</Pill>
              </div>
            ))}
            {issues.filter((issue) => issue.area === "Logic").length === 0 && <span className="ds-subtle">No automation to check yet.</span>}
          </Stack>
          <Row gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
            <Button size="sm" variant="primary" onClick={() => context.openOverlay("expression editor")}>New automation</Button>
          </Row>
        </Card>
      </Grid>
    </div>
  );

  const responsive = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="responsive">
      <Stack gap={4}>
        <Notice tone="info" title="The generated layout uses the same twelve-column grid as this workspace">
          Each component declares a span. The grid collapses to one column under 900px, so what you see below is what the built screen does.
        </Notice>
        <Grid>
          {(screen?.components ?? []).map((item) => (
            <Card key={item.id} span={item.span} title={item.title} subtitle={`span ${item.span} of 12`}>
              <Field label="Width">
                <Select value={String(item.span)} onChange={(event) => setComponents(screen!.components.map((entry) => (entry.id === item.id ? { ...entry, span: Number(event.target.value) as ScreenComponent["span"] } : entry)), `${item.title} width changed`)}>
                  {[4, 6, 8, 12].map((span) => <option key={span} value={span}>{span} of 12</option>)}
                </Select>
              </Field>
            </Card>
          ))}
          {(screen?.components.length ?? 0) === 0 && <Card span={12}><Empty title="Nothing to lay out yet" /></Card>}
        </Grid>
      </Stack>
    </div>
  );

  const preview = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="preview">
      <Stack gap={4}>
        <Row gap={3} wrap>
          <MiniField label="Role view">
            <Select value={ui.previewRole} onChange={(event) => ui.setPreviewRole(event.target.value)} aria-label="Preview as role">
              <option value="">Everything</option>
              {model.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
          </MiniField>
          <span className="ds-subtle">The preview reads the collections bound to each entity, in {context.org.name}.</span>
        </Row>
        <ScreenPreview model={model} screen={screen} role={ui.previewRole} />
      </Stack>
    </div>
  );

  const panes = context.tab === "Design" ? [palette, canvas, inspector]
    : context.tab === "Data" ? [dataPane]
      : context.tab === "Logic" ? [logicPane]
        : context.tab === "Responsive" ? [responsive]
          : [preview];

  return (
    <div className="t6-shell">
      <div className="t6-shell-bar">
        <Toolbar label="App builder">
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}`)}>Project</Button>
          <ToolbarSeparator />
          <MiniField label="Project">
            <Select value={record.id} onChange={(event) => context.navigate(`/o/${context.org.slug}/build/projects/${event.target.value}/builder`)} aria-label="Project being edited">
              {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </MiniField>
          <MiniField label="Screen">
            <Select value={screen?.id ?? ""} onChange={(event) => ui.setScreen(event.target.value)} aria-label="Screen being designed">
              {model.screens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              {model.screens.length === 0 && <option value="">No screens yet</option>}
            </Select>
          </MiniField>
          <ToolbarSeparator />
          <Pill tone={model.settings.environment === "production" ? "danger" : model.settings.environment === "staging" ? "warning" : "neutral"} dot>{model.settings.environment}</Pill>
        </Toolbar>
        <span className="ds-grow" />
        <Row gap={2}>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/code`)}>Code</Button>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("binding test")}>Test bindings</Button>
          <Button size="sm" variant="primary" onClick={async () => {
            const name = `Screen ${model.screens.length + 1}`;
            await write({
              ...model,
              screens: [...model.screens, { id: `sc-${Date.now().toString(36)}`, name, route: `/screen-${model.screens.length + 1}`, components: [] }],
            }, `Screen ${name} added`);
            context.toast("Screen added", `${name} is in the screen list.`);
          }}>New screen</Button>
        </Row>
      </div>
      <div className="t6-shell-tabs">
        <Tabs
          label="Builder views"
          value={context.tab}
          onChange={context.setTab}
          items={["Design", "Logic", "Data", "Responsive", "Preview"].map((id) => ({ id, label: id }))}
        />
      </div>
      <div className="t6-shell-body" data-panes={panes.length === 1 ? "1" : panes.length === 2 ? "2" : undefined}>
        {panes}
      </div>
    </div>
  );
}

/* ------------------------------ Component inspector ------------------------------ */

export function ComponentInspector({
  component, model, onEdit, onRemove,
}: { component: ScreenComponent; model: AppModel; onEdit: (patch: Partial<ScreenComponent>) => void; onRemove?: () => void }) {
  const entity = model.entities.find((item) => item.id === component.entityId);
  return (
    <Stack gap={3}>
      <Row gap={2}><strong className="ds-grow">{COMPONENT_LABELS[component.kind]}</strong><Pill tone="neutral">{component.id}</Pill></Row>
      <Field label="Title"><TextInput value={component.title} onChange={(event) => onEdit({ title: event.target.value })} /></Field>
      {component.kind === "text" ? (
        <Field label="Copy"><TextArea rows={4} value={component.text} onChange={(event) => onEdit({ text: event.target.value })} /></Field>
      ) : (
        <>
          <Field label="Entity" required hint="The preview reads the collection bound to this entity.">
            <Select value={component.entityId} onChange={(event) => onEdit({ entityId: event.target.value, fieldIds: [] })}>
              <option value="">Not bound</option>
              {model.entities.map((item) => <option key={item.id} value={item.id}>{item.name}{item.collection ? ` → ${item.collection}` : " (no collection)"}</option>)}
            </Select>
          </Field>
          {entity && (
            <Field label={component.kind === "stat" || component.kind === "chart" || component.kind === "list" ? "Field" : "Fields"} hint="Leave empty to use the first four fields.">
              <Stack gap={1}>
                {entity.fields.map((field) => (
                  <Checkbox
                    key={field.id}
                    label={`${field.name} · ${FIELD_KIND_LABELS[field.kind]}`}
                    checked={component.fieldIds.includes(field.id)}
                    onChange={(event) => {
                      const single = component.kind === "stat" || component.kind === "chart" || component.kind === "list";
                      if (event.target.checked) onEdit({ fieldIds: single ? [field.id] : [...component.fieldIds, field.id] });
                      else onEdit({ fieldIds: component.fieldIds.filter((id) => id !== field.id) });
                    }}
                  />
                ))}
              </Stack>
            </Field>
          )}
          {component.kind === "stat" && (
            <Field label="Aggregate">
              <Select value={component.aggregate} onChange={(event) => onEdit({ aggregate: event.target.value as ScreenComponent["aggregate"] })}>
                <option value="count">Count the records</option>
                <option value="sum">Add up the chosen field</option>
              </Select>
            </Field>
          )}
        </>
      )}
      <Field label="Width">
        <Select value={String(component.span)} onChange={(event) => onEdit({ span: Number(event.target.value) as ScreenComponent["span"] })}>
          {[4, 6, 8, 12].map((span) => <option key={span} value={span}>{span} of 12</option>)}
        </Select>
      </Field>
      {entity && !entity.collection && (
        <Notice tone="warning" title={`${entity.name} is not bound to a collection`}>
          The preview will say so rather than inventing rows. Bind it on the Data tab.
        </Notice>
      )}
      {onRemove && <Button size="sm" variant="outline-danger" onClick={onRemove}>Remove this component</Button>}
    </Stack>
  );
}

/* ------------------------------ Entity designer ------------------------------ */

export function EntityDesigner({ context, record, model }: { context: ScreenContext; record: Rec; model: AppModel }) {
  const ui = useBuildUi();
  const entity = model.entities.find((item) => item.id === ui.entityId) ?? model.entities[0];
  const issues = validateApp(model).filter((issue) => issue.area === "Data" && issue.level !== "pass");

  async function write(next: AppModel, label: string) {
    await saveApp(context, record, next, label);
  }

  function setEntity(next: Entity, label: string) {
    void write({ ...model, entities: model.entities.map((item) => (item.id === next.id ? next : item)) }, label);
  }

  return (
    <Grid>
      <Card span={4} title="Entities" subtitle={`${model.entities.length} in the model`}
        footer={<Button size="sm" variant="primary" onClick={async () => {
          const created = makeEntity(`Entity ${model.entities.length + 1}`);
          await write({ ...model, entities: [...model.entities, created] }, `Entity ${created.name} created`);
          ui.selectEntity(created.id);
        }}>New entity</Button>}>
        <Stack gap={1}>
          {model.entities.map((item) => (
            <button key={item.id} type="button" className="ds-record-card" aria-current={item.id === entity?.id ? "true" : undefined} onClick={() => ui.selectEntity(item.id)}>
              <Row gap={2}>
                <span className="ds-grow" style={{ textAlign: "start", fontWeight: 600 }}>{item.name}</span>
                <Pill tone="neutral">{item.fields.length}</Pill>
              </Row>
              <span className="ds-subtle">{item.collection ? `reads ${item.collection}` : "no collection bound"}</span>
            </button>
          ))}
          {model.entities.length === 0 && <span className="ds-subtle">Nothing defined yet.</span>}
        </Stack>
      </Card>

      <Card span={8} title={entity ? `${entity.name} fields` : "Fields"} subtitle={entity ? "Order is the order the generated code declares them" : undefined}>
        {!entity ? <Empty title="No entity selected" icon={<Boxes size={20} />} /> : (
          <Stack gap={4}>
            <Row gap={2} wrap>
              <Field label="Entity name" required>
                <TextInput value={entity.name} onChange={(event) => setEntity({ ...entity, name: event.target.value }, `Entity renamed to ${event.target.value}`)} />
              </Field>
              <Field label="Reads from" hint="A workspace collection, so the preview shows real records.">
                <Select value={entity.collection} onChange={(event) => setEntity({ ...entity, collection: event.target.value }, `${entity.name} bound to ${event.target.value || "no collection"}`)}>
                  <option value="">Not bound</option>
                  {BINDABLE_COLLECTIONS.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
                </Select>
              </Field>
            </Row>

            <ReorderArea
              label={`${entity.name} field order`}
              ids={entity.fields.map((field) => field.id)}
              onDragEnd={(event) => {
                const from = entity.fields.findIndex((field) => field.id === String(event.active.id));
                const to = entity.fields.findIndex((field) => field.id === String(event.over?.id ?? ""));
                if (from < 0 || to < 0 || from === to) return;
                setEntity({ ...entity, fields: move(entity.fields, from, to) }, `${entity.name} fields reordered`);
              }}
            >
              {entity.fields.map((field, index) => (
                <SortableRow key={field.id} id={field.id} name={field.name} index={index} count={entity.fields.length}
                  onMove={(from, to) => setEntity({ ...entity, fields: move(entity.fields, from, to) }, `${entity.name} fields reordered`)}>
                  {({ handle }) => (
                    <Row gap={2} wrap style={{ padding: "var(--space-2) var(--space-3)", alignItems: "center" }}>
                      {handle}
                      <TextInput aria-label={`Name of field ${index + 1}`} value={field.name} style={{ maxWidth: 180 }}
                        onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...item, name: event.target.value } : item)) }, `Field renamed in ${entity.name}`)} />
                      <Select aria-label={`Type of ${field.name}`} value={field.kind} style={{ maxWidth: 170 }}
                        onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...makeField(event.target.value as EntityField["kind"]), id: item.id, name: item.name, required: item.required, unique: item.unique } : item)) }, `${field.name} type changed`)}>
                        {FIELD_KINDS.map((kind) => <option key={kind} value={kind}>{FIELD_KIND_LABELS[kind]}</option>)}
                      </Select>
                      {field.kind === "reference" && (
                        <Select aria-label={`${field.name} references`} value={field.references} style={{ maxWidth: 160 }}
                          onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...item, references: event.target.value } : item)) }, `${field.name} reference changed`)}>
                          <option value="">Choose an entity</option>
                          {model.entities.filter((item) => item.id !== entity.id).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                        </Select>
                      )}
                      {field.kind === "choice" && (
                        <TextInput aria-label={`${field.name} options`} value={field.options.join(", ")} placeholder="Open, Closed" style={{ maxWidth: 200 }}
                          onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...item, options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) } : item)) }, `${field.name} options changed`)} />
                      )}
                      <Checkbox label="Required" checked={field.required}
                        onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...item, required: event.target.checked } : item)) }, `${field.name} required changed`)} />
                      <Checkbox label="Unique" checked={field.unique}
                        onChange={(event) => setEntity({ ...entity, fields: entity.fields.map((item) => (item.id === field.id ? { ...item, unique: event.target.checked } : item)) }, `${field.name} unique changed`)} />
                      <Button size="sm" variant="ghost" onClick={() => setEntity({ ...entity, fields: entity.fields.filter((item) => item.id !== field.id) }, `${field.name} removed from ${entity.name}`)}>Remove</Button>
                    </Row>
                  )}
                </SortableRow>
              ))}
            </ReorderArea>
            <Row gap={2}>
              <Button size="sm" variant="secondary" onClick={() => setEntity({ ...entity, fields: [...entity.fields, makeField("text")] }, `Field added to ${entity.name}`)}>Add a field</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Column editor", { entityId: entity.id })}>Field detail</Button>
            </Row>
          </Stack>
        )}
      </Card>

      <Card span={7} title="Validation" subtitle={`${issues.length} ${issues.length === 1 ? "problem" : "problems"} in the data model`}>
        {issues.length === 0
          ? <Notice tone="success" title="The model is consistent">Every reference resolves, every choice has options and no two fields share a name.</Notice>
          : <Stack gap={2}>{issues.map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
              <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.level}</Pill>
            </div>
          ))}</Stack>}
      </Card>

      <Card span={5} title="Generated interface" subtitle="Updates as you change the model"
        footer={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/code`)}>Open the code view</Button>}>
        <pre className="t6-code" style={{ maxHeight: 280 }}>{entity ? generateTypes({ ...model, entities: [entity] }) : "// No entity selected"}</pre>
      </Card>
    </Grid>
  );
}
