import { useState } from "react";
import { Button, Field, Notice, Pill, Row, Select, Stack, TextInput } from "@/design-system";
import { wallMs } from "@/platform/clock";
import {
  FILTER_LABELS, FILTER_OPERATORS, INTERACTIVE_KINDS, NO_INTERACTION, QUERY_KINDS, bindingProblems, describeQuery, needsValue,
  type FilterOperator, type InteractionKind, type QueryFilter,
} from "./binding";
import type { AppModel, Entity, ScreenComponent } from "./model";
import type { ComponentPatch } from "./state";

/* ====================================================================== *
 * Inspector sections for a component's data binding (which records, in
 * what order, how many) and its interaction (what choosing a row or saving
 * the form does). Changes save through the inspector's onEdit, like every
 * other component setting.
 * ====================================================================== */

/** A typed comparison value is saved when the field loses focus or Enter is pressed, not on every keystroke. */
function FilterValueInput({ label, value, type, onCommit }: { label: string; value: string; type: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <TextInput aria-label={label} value={draft} type={type}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />
  );
}

export function BindingEditor({ component, entity, model, screenId, onEdit }: {
  component: ScreenComponent; entity: Entity; model: AppModel; screenId: string;
  onEdit: (patch: ComponentPatch) => void;
}) {
  const queryable = (QUERY_KINDS as readonly string[]).includes(component.kind);
  const interactive = (INTERACTIVE_KINDS as readonly string[]).includes(component.kind);
  const fieldName = (id: string) => entity.fields.find((field) => field.id === id)?.name;
  const problems = bindingProblems(component, entity.fields.map((field) => field.id), model.screens, screenId);

  function setFilter(id: string, patch: Partial<QueryFilter>) {
    onEdit((current) => ({ filters: current.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)) }));
  }

  return (
    <Stack gap={3}>
      {queryable && (
        <section className="t6-build-binding" aria-label="Records shown">
          <Row gap={2} wrap>
            <strong className="ds-grow">Records shown</strong>
            <Pill tone="neutral">{describeQuery(component, fieldName)}</Pill>
          </Row>
          {component.filters.length === 0 && <p className="ds-subtle">Every {entity.name} record is shown. Add a filter to narrow it.</p>}
          {component.filters.map((filter, index) => (
            <div key={filter.id} className="t6-build-filter" role="group" aria-label={`Filter ${index + 1}`}>
              <span className="ds-subtle">{index === 0 ? "Where" : "and"}</span>
              <Select aria-label={`Filter ${index + 1} field`} value={filter.fieldId} onChange={(event) => setFilter(filter.id, { fieldId: event.target.value })}>
                {!fieldName(filter.fieldId) && <option value={filter.fieldId}>Missing field</option>}
                {entity.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
              </Select>
              <Select aria-label={`Filter ${index + 1} comparison`} value={filter.operator} onChange={(event) => setFilter(filter.id, { operator: event.target.value as FilterOperator })}>
                {FILTER_OPERATORS.map((operator) => <option key={operator} value={operator}>{FILTER_LABELS[operator]}</option>)}
              </Select>
              {needsValue(filter.operator) && (() => {
                const field = entity.fields.find((item) => item.id === filter.fieldId);
                return field?.kind === "choice" && field.options.length
                  ? <Select aria-label={`Filter ${index + 1} value`} value={filter.value} onChange={(event) => setFilter(filter.id, { value: event.target.value })}>
                    <option value="">Choose</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                  : <FilterValueInput key={`${filter.id}-${filter.value}`} label={`Filter ${index + 1} value`} value={filter.value} type={field?.kind === "date" ? "date" : "text"} onCommit={(value) => setFilter(filter.id, { value })} />;
              })()}
              <Button size="sm" variant="ghost" aria-label={`Remove filter ${index + 1}`} onClick={() => onEdit((current) => ({ filters: current.filters.filter((item) => item.id !== filter.id) }))}>Remove</Button>
            </div>
          ))}
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" disabled={entity.fields.length === 0}
              onClick={() => { const id = `f${wallMs().toString(36)}`; onEdit((current) => ({ filters: [...current.filters, { id, fieldId: entity.fields[0]?.id ?? "", operator: "equals", value: "" }] })); }}>Add a filter</Button>
          </Row>
          {component.kind !== "stat" && component.kind !== "chart" && (
            <div className="t6-build-filter" role="group" aria-label="Order and limit">
              <span className="ds-subtle">Sort by</span>
              <Select aria-label="Sort field" value={component.sort?.fieldId ?? ""} onChange={(event) => { const fieldId = event.target.value; onEdit((current) => ({ sort: fieldId ? { fieldId, direction: current.sort?.direction ?? "asc" } : null })); }}>
                <option value="">Stored order</option>
                {entity.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
              </Select>
              {component.sort && (
                <Select aria-label="Sort direction" value={component.sort.direction} onChange={(event) => { const direction = event.target.value === "desc" ? "desc" : "asc"; onEdit((current) => ({ sort: current.sort ? { ...current.sort, direction } : null })); }}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </Select>
              )}
              <span className="ds-subtle">Show</span>
              <Select aria-label="Record limit" value={String(component.limit)} onChange={(event) => onEdit({ limit: Number(event.target.value) })}>
                {[0, 5, 10, 25, 50, 100].map((limit) => <option key={limit} value={limit}>{limit === 0 ? "All" : `First ${limit}`}</option>)}
              </Select>
            </div>
          )}
        </section>
      )}
      {interactive && (
        <section className="t6-build-binding" aria-label="Interaction">
          <strong>{component.kind === "form" ? "After the form is saved" : "When a row is chosen"}</strong>
          <Field label="Action" htmlFor={`interaction-${component.id}`}>
            <Select id={`interaction-${component.id}`} value={component.interaction.kind}
              onChange={(event) => {
                const kind = event.target.value as InteractionKind;
                const fallback = model.screens.find((item) => item.id !== screenId)?.id ?? "";
                onEdit({ interaction: kind === "none" ? NO_INTERACTION : { kind, screenId: component.interaction.screenId || fallback } });
              }}>
              <option value="none">Nothing</option>
              <option value="open_screen">Open a screen</option>
              {component.kind !== "form" && <option value="open_record">Open a screen showing the chosen record</option>}
            </Select>
          </Field>
          {component.interaction.kind !== "none" && (
            <Field label="Screen" htmlFor={`interaction-screen-${component.id}`}>
              <Select id={`interaction-screen-${component.id}`} value={component.interaction.screenId} onChange={(event) => { const screenId = event.target.value; onEdit((current) => ({ interaction: { ...current.interaction, screenId } })); }}>
                <option value="">Choose a screen</option>
                {model.screens.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.route}</option>)}
              </Select>
            </Field>
          )}
          {component.interaction.kind === "open_record" && (
            <p className="ds-subtle">Detail and form components on that screen bound to {entity.name} show the chosen record. Try it on the Preview tab.</p>
          )}
        </section>
      )}
      {problems.length > 0 && (
        <Notice tone={problems.some((problem) => problem.level === "fail") ? "danger" : "warning"} title="Binding needs attention">
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{problems.map((problem) => <li key={problem.title}>{problem.title}. {problem.detail}</li>)}</ul>
        </Notice>
      )}
    </Stack>
  );
}
