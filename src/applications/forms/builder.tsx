import { useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  AlignLeft, Calendar, CheckSquare, ChevronsUpDown, FileText, Hash, Heading, ListChecks,
  Mail, Minus, Paperclip, Star, Type,
} from "lucide-react";
import {
  Button, Card, Checkbox, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented,
  Select, Stack, Tabs, TextArea, TextInput, Toolbar, ToolbarSeparator,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { wallMs } from "@/platform/clock";
import { MiniField, PaletteChip, ReorderArea, SortableRow, move } from "@/applications/t6kit/kit";
import {
  FIELD_HINTS, FIELD_LABELS, FIELD_TYPES, OPERATOR_LABELS, STRUCTURAL, logicIssues, makeField, readForm,
  type FieldType, type FormField, type FormModel, type LogicRule, type Operator,
} from "./model";
import { FormRuntime } from "./runtime";
import { PreviewRunsPanel, keepPreviewRun } from "./previewRunsPanel";
import { saveForm, useFormsUi } from "./state";

const ICONS: Record<FieldType, React.ReactNode> = {
  text: <Type size={15} />, longtext: <AlignLeft size={15} />, number: <Hash size={15} />,
  date: <Calendar size={15} />, select: <ChevronsUpDown size={15} />, multiselect: <ListChecks size={15} />,
  checkbox: <CheckSquare size={15} />, fileref: <Paperclip size={15} />, rating: <Star size={15} />,
  section: <Heading size={15} />, pagebreak: <Minus size={15} />, email: <Mail size={15} />,
};

export function useFormRecord(context: ScreenContext): { forms: Rec[]; record?: Rec; model: FormModel } {
  const forms = useCollection("forms");
  const routed = useRecord(context.params.id);
  const record = context.params.id
    ? routed?.collection === "forms" ? routed : forms.find((item) => item.id === context.params.id)
    : forms.find((item) => item.status !== "archived") ?? forms[0];
  const model = useMemo(() => readForm(record), [record]);
  return { forms, record, model };
}

export function NoForm() {
  return <Empty title="No form in this workspace" icon={<FileText size={20} />}>Create one from the forms directory and it opens here.</Empty>;
}

/* ================================================================ *
 * ARL-FORMS-002 — Visual Form Builder (full chrome)
 * ================================================================ */

export function FormBuilder({ context }: { context: ScreenContext }) {
  const { forms, record, model } = useFormRecord(context);
  const ui = useFormsUi();
  if (!record) return <NoForm />;
  const selected = model.fields.find((field) => field.id === ui.selectedFieldId);
  const issues = logicIssues(model);
  const answerableCount = model.fields.filter((field) => !STRUCTURAL.includes(field.type)).length;
  const requiredCount = model.fields.filter((field) => !STRUCTURAL.includes(field.type) && field.required).length;
  const sensitiveCount = model.fields.filter((field) => field.sensitive).length;

  async function write(next: FormModel, label: string) {
    await saveForm(context, record!, next, label);
  }

  function setFields(fields: FormField[], label: string) {
    void write({ ...model, fields }, label);
  }

  function insert(type: FieldType, index?: number) {
    const field = makeField(type);
    const at = index ?? (selected ? model.fields.findIndex((item) => item.id === selected.id) + 1 : model.fields.length);
    const fields = [...model.fields];
    fields.splice(at, 0, field);
    ui.select(field.id);
    setFields(fields, `Added a ${FIELD_LABELS[type].toLowerCase()} field to ${record!.title}`);
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    const paletteType = (event.active.data.current as { palette?: string } | undefined)?.palette;
    if (paletteType) {
      const index = overId ? model.fields.findIndex((field) => field.id === overId) : model.fields.length;
      insert(paletteType as FieldType, index < 0 ? model.fields.length : index);
      return;
    }
    if (!overId || activeId === overId) return;
    const from = model.fields.findIndex((field) => field.id === activeId);
    const to = model.fields.findIndex((field) => field.id === overId);
    if (from < 0 || to < 0) return;
    setFields(move(model.fields, from, to), `Moved ${model.fields[from].label} to position ${to + 1}`);
  }

  const palette = (
    <div className="t6-pane" key="palette">
      <Stack gap={4}>
        <div>
          <h3 style={{ fontSize: "var(--text-md)" }}>Fields</h3>
          <p className="ds-subtle">Press to add after the selection, or drag onto a position.</p>
        </div>
        <div className="t6-palette">
          {FIELD_TYPES.map((type) => (
            <PaletteChip key={type} type={type} label={FIELD_LABELS[type]} hint={FIELD_HINTS[type]} icon={ICONS[type]} onInsert={() => insert(type)} />
          ))}
        </div>
        <Notice tone="info" title="Keyboard equivalent">
          Every field has <strong>Move up</strong> and <strong>Move down</strong> buttons, and the grip picks a field up with Space and moves it with the arrow keys. Nothing here needs a pointer.
        </Notice>
      </Stack>
    </div>
  );

  const canvas = (
    <div className="t6-pane" data-kind="canvas" key="canvas">
      <Stack gap={3}>
        <Row gap={2} wrap>
          <strong>{record.title}</strong>
          <Pill tone="neutral">{model.fields.filter((field) => !STRUCTURAL.includes(field.type)).length} questions</Pill>
          <Pill tone={issues.some((issue) => issue.level === "fail") ? "danger" : issues.length ? "warning" : "success"}>
            {issues.length === 0 ? "Logic clear" : `${issues.length} logic note${issues.length === 1 ? "" : "s"}`}
          </Pill>
          <Pill tone="info">Version {model.settings.version}</Pill>
        </Row>
        {model.fields.length === 0 ? (
          <Empty title="No fields yet" icon={<Type size={20} />}>Add one from the palette on the left.</Empty>
        ) : (
          <ReorderArea ids={model.fields.map((field) => field.id)} onDragEnd={onDragEnd} label={`${record.title} field order`}>
            {model.fields.map((field, index) => (
              <SortableRow
                key={field.id}
                id={field.id}
                name={field.label}
                index={index}
                count={model.fields.length}
                selected={field.id === ui.selectedFieldId}
                onSelect={() => ui.select(field.id)}
                onMove={(from, to) => setFields(move(model.fields, from, to), `Moved ${field.label} to position ${to + 1}`)}
              >
                {({ handle }) => (
                  <Row gap={2} style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
                    {handle}
                    <span aria-hidden="true" style={{ color: "var(--accent)", paddingTop: 2 }}>{ICONS[field.type]}</span>
                    <div className="ds-grow" style={{ minWidth: 0 }}>
                      <Row gap={2} wrap>
                        <strong>{field.label}</strong>
                        {field.required && <Pill tone="warning">required</Pill>}
                        {field.sensitive && <Pill tone="danger">sensitive</Pill>}
                        {model.logic.some((rule) => rule.targetId === field.id) && <Pill tone="info">conditional</Pill>}
                      </Row>
                      <span className="ds-subtle">{FIELD_LABELS[field.type]}{field.options.length ? ` · ${field.options.length} options` : ""}{field.help ? ` · ${field.help}` : ""}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { ui.select(field.id); context.openOverlay("Field inspector"); }}>Edit</Button>
                  </Row>
                )}
              </SortableRow>
            ))}
          </ReorderArea>
        )}
      </Stack>
    </div>
  );

  const inspector = (
    <div className="t6-pane" data-kind="inspector" key="inspector">
      {selected
        ? <FieldInspector field={selected} model={model} onEdit={(patch) => setFields(model.fields.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)), `Edited ${selected.label}`)} onRemove={() => { setFields(model.fields.filter((item) => item.id !== selected.id), `Removed ${selected.label}`); ui.select(""); }} onLogic={(logic, label) => void write({ ...model, logic }, label)} />
        : <Empty title="No field selected" icon={<Type size={18} />}>Select a field to change its label, help text and validation.</Empty>}
    </div>
  );

  const logicPane = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="logic">
      <Stack gap={4}>
        <Notice tone="info" title="Rules live on their own screen too">
          This summary is the same model the conditional logic screen edits. A hidden field is never validated, so a required question behind a rule cannot block a submission.
        </Notice>
        <Card eyebrow="LOGIC" prov="human" title="Rules" subtitle={`${model.logic.length} on this form`}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/logic`)}>Open the logic editor</Button>}>
          {model.logic.length === 0
            ? <Empty title="No rules" icon={<ListChecks size={20} />}>Every field is shown to everyone.</Empty>
            : <Stack gap={2}>{model.logic.map((rule) => (
              <Row key={rule.id} gap={2}>
                <Pill tone={rule.action === "hide" ? "warning" : rule.action === "require" ? "info" : "success"}>{rule.action}</Pill>
                <span className="ds-grow">{model.fields.find((field) => field.id === rule.targetId)?.label ?? "a missing field"}</span>
                <span className="ds-subtle">when {model.fields.find((field) => field.id === rule.whenFieldId)?.label ?? "a missing field"} {rule.operator.replace("_", " ")} {rule.value}</span>
              </Row>
            ))}</Stack>}
        </Card>
      </Stack>
    </div>
  );

  const design = (
    <div className="t6-pane" key="design">
      <FormThemeEditor model={model} onChange={(theme) => void write({ ...model, theme }, "Form theme changed")} />
    </div>
  );

  const preview = (
    <div className="t6-pane" data-kind="canvas" key="preview">
      <Stack gap={3}>
        <Row gap={3} wrap>
          <Segmented
            label="Device"
            value={ui.device}
            onChange={ui.setDevice}
            options={[{ value: "mobile" as const, label: "Mobile 390" }, { value: "desktop" as const, label: "Desktop" }]}
          />
          <span className="ds-subtle">The preview validates exactly as the public form does. A finished run is kept below as a preview run, never as a response.</span>
        </Row>
        <div style={{ width: ui.device === "mobile" ? 390 : "100%", maxWidth: "100%" }}>
          <FormRuntime model={model} record={record} context={context} mode="preview"
            onPreviewComplete={(run) => keepPreviewRun(context, record, model, ui.device, run)} />
        </div>
        <PreviewRunsPanel context={context} record={record} model={model} />
      </Stack>
    </div>
  );

  const settings = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="settings">
      <FormSettingsPanel context={context} record={record} model={model} />
    </div>
  );

  const panes = context.tab === "Build" ? [palette, canvas, inspector]
    : context.tab === "Logic" ? [logicPane]
      : context.tab === "Design" ? [design, preview]
        : context.tab === "Settings" ? [settings]
          : [preview];

  return (
    <div className="t6-shell">
      <section className="t6-editor-overview" aria-label="Form editor overview">
        <div className="t6-editor-overview-heading">
          <div><span className="ds-subtle">FORMS / BUILDER</span>
            <h2>{record.title}</h2>
            <p className="ds-subtle">Build the questions, validate branching, preview the response experience and review publication readiness.</p>
          </div>
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/logic`)}>Logic</Button>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/submissions`)}>Submissions</Button>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/analytics`)}>Analytics</Button>
          </Row>
        </div>
        <div className="t6-directory-metrics" aria-label="Form editor health">
          <div><span>Questions</span><strong>{answerableCount}</strong></div>
          <div><span>Required</span><strong>{requiredCount}</strong></div>
          <div><span>Logic rules</span><strong>{model.logic.length}</strong></div>
          <div><span>Review notes</span><strong>{issues.length + sensitiveCount}</strong></div>
        </div>
        {issues.some((issue) => issue.level === "fail") && <Notice tone="warning" title="Logic needs review">Resolve the failing branches before publishing. <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/logic`)}>Review logic</Button></Notice>}
      </section>
      <div className="t6-shell-bar">
        <Toolbar label="Form builder">
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms`)}>All forms</Button>
          <ToolbarSeparator />
          <MiniField label="Form">
            <Select value={record.id} onChange={(event) => context.navigate(`/o/${context.org.slug}/forms/forms/${event.target.value}`)} aria-label="Form being edited">
              {forms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </MiniField>
          <ToolbarSeparator />
          <Pill tone={record.status === "live" ? "success" : "neutral"} dot>{record.status}</Pill>
          <Pill tone="info">Version {model.settings.version}</Pill>
        </Toolbar>
        <span className="ds-grow" />
        <Row gap={2}>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("insert field")}>Insert field</Button>
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("move field")}>Reorder</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/publish`)}>Design and publish</Button>
          <Button size="sm" variant="primary" onClick={() => context.openOverlay("publish review")}>Publish</Button>
        </Row>
      </div>
      <div className="t6-shell-tabs">
        <Tabs
          label="Builder views"
          value={context.tab}
          onChange={context.setTab}
          items={["Build", "Logic", "Design", "Settings", "Preview"].map((id) => ({ id, label: id }))}
        />
      </div>
      <div className="t6-shell-body" data-panes={panes.length === 1 ? "1" : panes.length === 2 ? "2" : undefined}>
        {panes}
      </div>
    </div>
  );
}

/* ------------------------------ Inspector ------------------------------ */

let ruleCounter = 0;

/**
 * "Show this question only when…" — edits the show rules that govern one
 * field, reading only questions that come before it so the condition is
 * always answerable by the time the person reaches it.
 */
export function VisibilityEditor({ field, model, onLogic }: { field: FormField; model: FormModel; onLogic: (logic: LogicRule[], label: string) => void }) {
  const index = model.fields.findIndex((item) => item.id === field.id);
  const sources = model.fields.slice(0, Math.max(0, index)).filter((item) => !STRUCTURAL.includes(item.type));
  const rules = model.logic.filter((rule) => rule.targetId === field.id && rule.action === "show");
  const [sourceId, setSourceId] = useState("");
  const [operator, setOperator] = useState<Operator>("equals");
  const [value, setValue] = useState("");
  const source = sources.find((item) => item.id === sourceId) ?? sources[sources.length - 1];
  const needsValue = operator !== "answered" && operator !== "empty";
  const optionsForSource = source && (source.type === "select" || source.type === "multiselect") ? source.options
    : source?.type === "checkbox" ? ["yes", "no"] : [];
  const effectiveValue = needsValue ? (optionsForSource.length && !optionsForSource.includes(value) ? optionsForSource[0] : value) : "";
  const label = (id: string) => model.fields.find((item) => item.id === id)?.label ?? "a missing question";

  return (
    <section className="forms-condition" aria-label="Visibility condition">
      <strong>Show this question only when…</strong>
      {rules.length === 0
        ? <span className="ds-subtle">Always shown. Add a condition to show it only after a particular answer.</span>
        : (
          <Stack gap={2}>
            {rules.map((rule) => (
              <Row key={rule.id} gap={2} wrap>
                <span className="ds-grow">{label(rule.whenFieldId)} {OPERATOR_LABELS[rule.operator]}{rule.value ? ` "${rule.value}"` : ""}</span>
                <Button size="sm" variant="ghost" onClick={() => onLogic(model.logic.filter((item) => item.id !== rule.id), `Removed a visibility condition from ${field.label}`)}>Remove condition</Button>
              </Row>
            ))}
            {rules.length > 1 && <span className="ds-subtle">Shown when any one of these conditions matches.</span>}
          </Stack>
        )}
      {sources.length === 0 ? (
        <span className="ds-subtle">A condition reads an earlier question. Move this question below another one to add a condition.</span>
      ) : (
        <Stack gap={2}>
          <Field label="Question to read">
            <Select value={source?.id ?? ""} onChange={(event) => { setSourceId(event.target.value); setValue(""); }}>
              {sources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </Field>
          <Row gap={2} wrap>
            <Field label="Comparison">
              <Select value={operator} onChange={(event) => setOperator(event.target.value as Operator)}>
                {(Object.keys(OPERATOR_LABELS) as Operator[]).map((key) => <option key={key} value={key}>{OPERATOR_LABELS[key]}</option>)}
              </Select>
            </Field>
            {needsValue && (
              <Field label="Answer">
                {optionsForSource.length
                  ? <Select value={effectiveValue} onChange={(event) => setValue(event.target.value)}>{optionsForSource.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
                  : <TextInput value={value} onChange={(event) => setValue(event.target.value)} />}
              </Field>
            )}
          </Row>
          <Button size="sm" variant="secondary" disabled={!source || (needsValue && !effectiveValue.trim())} onClick={() => {
            if (!source) return;
            ruleCounter += 1;
            const rule: LogicRule = { id: `l${wallMs().toString(36)}${ruleCounter}`, targetId: field.id, action: "show", whenFieldId: source.id, operator, value: effectiveValue.trim() };
            onLogic([...model.logic, rule], `Added a condition: show ${field.label} when ${source.label} ${OPERATOR_LABELS[operator]} ${rule.value}`.trim());
            setValue("");
          }}>Add condition</Button>
        </Stack>
      )}
    </section>
  );
}

export function FieldInspector({
  field, model, onEdit, onRemove, onLogic,
}: { field: FormField; model: FormModel; onEdit: (patch: Partial<FormField>) => void; onRemove?: () => void; onLogic?: (logic: LogicRule[], label: string) => void }) {
  const governed = model.logic.filter((rule) => rule.targetId === field.id);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const confirmingRemoval = pendingRemovalId === field.id;
  return (
    <Stack gap={3}>
      <div className="t6-field-context" aria-label="Selected field context">
        <span className="ds-subtle">FORM BUILDER / FIELD SETTINGS</span>
        <Row gap={2} wrap><strong className="ds-grow">{field.label || "Untitled field"}</strong><Pill tone="neutral">{FIELD_LABELS[field.type]}</Pill></Row>
        <p className="ds-subtle">{STRUCTURAL.includes(field.type) ? "This element structures the form; it does not collect an answer." : `Question ${model.fields.findIndex((item) => item.id === field.id) + 1} of ${model.fields.length} · ${field.required ? "Required" : "Optional"} · ${governed.length} conditional rules`}</p>
      </div>
      <Field label={field.type === "section" ? "Heading" : "Question"} required>
        <TextInput value={field.label} onChange={(event) => onEdit({ label: event.target.value })} />
      </Field>
      {!STRUCTURAL.includes(field.type) && (
        <>
          <Field label="Help text" hint="Shown under the question."><TextInput value={field.help} onChange={(event) => onEdit({ help: event.target.value })} /></Field>
          <Checkbox label="Required" checked={field.required} onChange={(event) => onEdit({ required: event.target.checked })} />
          <Checkbox label="Treat the answer as sensitive" checked={field.sensitive} onChange={(event) => onEdit({ sensitive: event.target.checked })} />
          <Field label="Change the type" hint="Validation rules that do not apply to the new type are dropped.">
            <Select value={field.type} onChange={(event) => {
              const type = event.target.value as FieldType;
              const fresh = makeField(type);
              onEdit({ type, options: type === "select" || type === "multiselect" ? (field.options.length ? field.options : fresh.options) : [], pattern: fresh.pattern, min: fresh.min, max: fresh.max, maxLength: fresh.maxLength });
            }}>
              {FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_LABELS[type]}</option>)}
            </Select>
          </Field>
        </>
      )}
      {(field.type === "select" || field.type === "multiselect") && (
        <Field label="Options" hint="One per line. A rule that compares against a value not in this list is reported as unreachable.">
          <TextArea rows={4} value={field.options.join("\n")} onChange={(event) => onEdit({ options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} />
        </Field>
      )}
      {(field.type === "text" || field.type === "longtext" || field.type === "email" || field.type === "fileref") && (
        <>
          <Row gap={2}>
            <Field label="Least characters"><TextInput type="number" min={0} value={String(field.minLength)} onChange={(event) => onEdit({ minLength: Number(event.target.value) || 0 })} /></Field>
            <Field label="Most characters"><TextInput type="number" min={0} value={String(field.maxLength)} onChange={(event) => onEdit({ maxLength: Number(event.target.value) || 0 })} /></Field>
          </Row>
          <Field label="Pattern" hint="Checked when the answer is not empty.">
            <Select value={field.pattern} onChange={(event) => onEdit({ pattern: event.target.value as FormField["pattern"] })}>
              <option value="">No pattern</option>
              <option value="email">Email address</option>
              <option value="phone">Telephone number</option>
              <option value="postcode">Postal code</option>
              <option value="url">Web address</option>
            </Select>
          </Field>
        </>
      )}
      {(field.type === "number" || field.type === "rating" || field.type === "date") && (
        <Row gap={2}>
          <Field label={field.type === "date" ? "Earliest" : "Smallest"}>
            <TextInput type={field.type === "date" ? "date" : "number"} value={String(field.min)} onChange={(event) => onEdit({ min: Number(event.target.value) || 0 })} />
          </Field>
          <Field label={field.type === "date" ? "Latest" : "Largest"}>
            <TextInput type={field.type === "date" ? "date" : "number"} value={String(field.max)} onChange={(event) => onEdit({ max: Number(event.target.value) || 0 })} />
          </Field>
        </Row>
      )}
      {!STRUCTURAL.includes(field.type) && (
        <Field label="Placeholder"><TextInput value={field.placeholder} onChange={(event) => onEdit({ placeholder: event.target.value })} /></Field>
      )}
      {onLogic && !STRUCTURAL.includes(field.type) && <VisibilityEditor key={field.id} field={field} model={model} onLogic={onLogic} />}
      {governed.length > 0 && (
        <Notice tone="info" title={`${governed.length} rule${governed.length === 1 ? "" : "s"} governs this field`}>
          {governed.map((rule) => `${rule.action} when ${model.fields.find((item) => item.id === rule.whenFieldId)?.label ?? "a missing field"} ${rule.operator.replace("_", " ")} ${rule.value}`).join("; ")}
        </Notice>
      )}
      {onRemove && (confirmingRemoval ? (
        <Notice tone="warning" title="Remove this field?">
          This removes the question from the form. Check conditional rules that use it; those references may require repair.
          <Row gap={2} wrap>
            <Button size="sm" variant="outline-danger" onClick={() => { setPendingRemovalId(null); onRemove(); }}>Confirm removal</Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingRemovalId(null)}>Cancel</Button>
          </Row>
        </Notice>
      ) : <Button size="sm" variant="outline-danger" onClick={() => setPendingRemovalId(field.id)}>Remove this field</Button>)}
    </Stack>
  );
}

export function FormThemeEditor({ model, onChange }: { model: FormModel; onChange: (theme: FormModel["theme"]) => void }) {
  const theme = model.theme;
  return (
    <Stack gap={4}>
      <p className="ds-subtle">These values drive the preview beside this panel and the live form alike.</p>
      <Row gap={2} wrap>
        <Field label="Accent"><TextInput type="color" value={theme.accent} onChange={(event) => onChange({ ...theme, accent: event.target.value })} style={{ minWidth: 72 }} /></Field>
        <Field label="Ink"><TextInput type="color" value={theme.ink} onChange={(event) => onChange({ ...theme, ink: event.target.value })} style={{ minWidth: 72 }} /></Field>
        <Field label="Paper"><TextInput type="color" value={theme.paper} onChange={(event) => onChange({ ...theme, paper: event.target.value })} style={{ minWidth: 72 }} /></Field>
      </Row>
      <Field label="Typeface">
        <Select value={theme.font} onChange={(event) => onChange({ ...theme, font: event.target.value as FormModel["theme"]["font"] })}>
          <option value="Inter">Inter</option>
          <option value="Source Serif">Source Serif</option>
        </Select>
      </Field>
      <Field label={`Corner radius · ${theme.radius}px`}>
        <input type="range" min={0} max={24} value={theme.radius} aria-label="Corner radius" onChange={(event) => onChange({ ...theme, radius: Number(event.target.value) })} />
      </Field>
      <Field label="Column width">
        <Segmented
          label="Column width"
          value={theme.width}
          onChange={(width) => onChange({ ...theme, width })}
          options={[{ value: "narrow" as const, label: "Narrow" }, { value: "wide" as const, label: "Wide" }]}
        />
      </Field>
    </Stack>
  );
}

export function FormSettingsPanel({ context, record, model }: { context: ScreenContext; record: Rec; model: FormModel }) {
  return (
    <Grid>
      <Card span={7} eyebrow="SETTINGS" prov="human" title="Settings" subtitle="Applied to the public form and every submission">
        <form
          id="form-settings"
          className="ds-stack ds-gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await saveForm(context, record, {
              ...model,
              settings: {
                ...model.settings,
                notifyEnabled: data.get("notifyEnabled") === "on",
                notifyTo: String(data.get("notifyTo") ?? ""),
                confirmation: String(data.get("confirmation") ?? model.settings.confirmation),
                retentionDays: Number(data.get("retentionDays")) || model.settings.retentionDays,
                access: data.get("access") === "workspace" ? "workspace" : "link",
                closed: data.get("closed") === "on",
                closeMessage: String(data.get("closeMessage") ?? model.settings.closeMessage),
              },
            }, "Form settings saved");
            context.toast("Settings saved", "They apply to the next submission.");
          }}
        >
          <Field label="Confirmation message" hint="Shown after a submission is recorded.">
            <TextArea name="confirmation" rows={2} defaultValue={model.settings.confirmation} />
          </Field>
          <Checkbox name="notifyEnabled" label="Notify someone when a submission arrives" defaultChecked={model.settings.notifyEnabled} />
          <Field label="Notify" hint="Recorded on the submission as an intention. Nothing is sent.">
            <TextInput name="notifyTo" type="email" defaultValue={model.settings.notifyTo} placeholder="studio@northline.example" />
          </Field>
          <Row gap={2}>
            <Field label="Keep submissions for (days)" hint="Used by the retention check on the submissions screen.">
              <TextInput name="retentionDays" type="number" min={1} defaultValue={String(model.settings.retentionDays)} />
            </Field>
            <Field label="Who can answer">
              <Select name="access" defaultValue={model.settings.access}>
                <option value="link">Anyone with the link</option>
                <option value="workspace">People in this workspace</option>
              </Select>
            </Field>
          </Row>
          <Checkbox name="closed" label="Close the form" defaultChecked={model.settings.closed} />
          <Field label="Message when closed"><TextInput name="closeMessage" defaultValue={model.settings.closeMessage} /></Field>
          <Button type="submit" variant="primary">Save settings</Button>
        </form>
      </Card>
      <Card span={5} eyebrow="NOTIFICATION" prov="unknown" title="Notification" subtitle="Where this stops">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Mail provider", value: <Pill tone="warning" dot>Not connected</Pill> },
            { label: "On submission", value: model.settings.notifyEnabled ? "The intention is recorded on the submission" : "Nothing is attempted" },
            { label: "Recipient", value: model.settings.notifyTo || "Not set" },
          ]} />
          <Notice tone="warning" title="A notification cannot be sent from here">
            Each submission records <code>notificationState</code> so a later reader can see that a message was wanted and never sent, rather than assuming it arrived.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}
