import { useState, type CSSProperties } from "react";
import { Button, Checkbox, Field, Notice, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import {
  STRUCTURAL, answerText, evaluate, pages, validate,
  type Answers, type FieldError, type FormField, type FormModel,
} from "./model";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * The form as a person meets it. The same component renders the builder
 * preview, the embed test and the public form, so what is previewed is
 * what is answered, and a submission writes a real record.
 * ====================================================================== */

function skin(model: FormModel): CSSProperties {
  return {
    background: model.theme.paper,
    color: model.theme.ink,
    borderRadius: model.theme.radius,
    maxWidth: model.theme.width === "narrow" ? 520 : 760,
    fontFamily: model.theme.font === "Source Serif" ? "Georgia, serif" : "Inter, sans-serif",
  };
}

export function FieldControl({
  field, value, onChange, invalid, idPrefix,
}: { field: FormField; value: Answers[string] | undefined; onChange: (next: Answers[string]) => void; invalid: boolean; idPrefix: string }) {
  const id = `${idPrefix}-${field.id}`;
  if (field.type === "longtext") {
    return <TextArea id={id} rows={4} invalid={invalid} placeholder={field.placeholder} value={answerText(value)} maxLength={field.maxLength || undefined} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === "select") {
    return (
      <Select id={id} value={answerText(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose one</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
    );
  }
  if (field.type === "multiselect") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <Stack gap={1}>
        {field.options.map((option) => (
          <Checkbox
            key={option}
            label={option}
            checked={chosen.includes(option)}
            onChange={(event) => onChange(event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))}
          />
        ))}
      </Stack>
    );
  }
  if (field.type === "checkbox") {
    return <Checkbox label={field.placeholder || "Yes"} checked={value === true} onChange={(event) => onChange(event.target.checked)} />;
  }
  if (field.type === "rating") {
    const current = Number(answerText(value)) || 0;
    return (
      <div role="radiogroup" aria-label={field.label} className="ds-row ds-gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={current === score}
            aria-label={`${score} out of 5`}
            onClick={() => onChange(String(score))}
            style={{
              width: 38, height: 38, borderRadius: 8, cursor: "pointer",
              border: `1px solid ${current === score ? "currentColor" : "rgba(0,0,0,.25)"}`,
              background: current >= score ? "currentColor" : "transparent",
              color: "inherit", font: "inherit",
            }}
          >
            <span style={{ color: current >= score ? "#fff" : "inherit", mixBlendMode: current >= score ? "difference" : undefined }}>{score}</span>
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "fileref") {
    return <TextInput id={id} invalid={invalid} placeholder={field.placeholder || "drawing-rev-c.pdf"} value={answerText(value)} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <TextInput
      id={id}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
      invalid={invalid}
      placeholder={field.placeholder}
      value={answerText(value)}
      min={field.type === "number" && field.min !== 0 ? field.min : undefined}
      max={field.type === "number" && field.max !== 0 ? field.max : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function FormRuntime({
  model, record, context, mode, onSubmitted,
}: {
  model: FormModel;
  record: Rec;
  context: ScreenContext;
  /** "live" writes a submission record; "preview" validates without writing. */
  mode: "live" | "preview";
  onSubmitted?: (id: string) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { visible, required } = evaluate(model, answers);
  const pageList = pages(model);
  const current = pageList[Math.min(page, pageList.length - 1)] ?? [];
  const last = page >= pageList.length - 1;

  if (model.settings.closed) {
    return <Notice tone="warning" title="This form is closed">{model.settings.closeMessage}</Notice>;
  }

  if (done) {
    return (
      <div className="t6-formskin" style={skin(model)}>
        <Stack gap={3}>
          <h2>{record.title}</h2>
          <Notice tone="success" title="Recorded">{model.settings.confirmation}</Notice>
          <p className="ds-subtle">
            {mode === "live"
              ? `A submission record was created against ${record.title}, answering version ${model.settings.version}.`
              : "Nothing was written: this is the preview, and it stops before the record."}
          </p>
          {model.settings.notifyEnabled && mode === "live" && (
            <Notice tone="warning" title="The notification was not sent">
              No mail provider is connected, so the notification to {model.settings.notifyTo || "the studio"} stays as an intention recorded on the submission.
            </Notice>
          )}
          <Button variant="secondary" onClick={() => { setDone(null); setAnswers({}); setPage(0); }}>Answer it again</Button>
        </Stack>
      </div>
    );
  }

  const errorFor = (fieldId: string) => errors.find((error) => error.fieldId === fieldId)?.message;

  return (
    <form
      className="t6-formskin"
      style={skin(model)}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const found = validate(model, answers);
        setErrors(found);
        if (found.length > 0) return;
        if (!last) { setPage((value) => value + 1); return; }
        if (mode === "preview") { setDone("preview"); return; }
        setBusy(true);
        try {
          const answered = model.fields
            .filter((field) => !STRUCTURAL.includes(field.type) && visible.has(field.id))
            .map((field) => [field.label, answerText(answers[field.id])] as const);
          const name = answered.find(([label]) => /name/i.test(label))?.[1];
          const created = await context.mutate.create({
            collection: "submissions",
            title: name || `Response ${clockIso().slice(0, 10)}`,
            status: "new",
            summary: `Answered version ${model.settings.version} of ${record.title}.`,
            parentId: record.id,
            at: clockIso(),
            fields: {
              ...Object.fromEntries(answered),
              formVersion: model.settings.version,
              notificationState: model.settings.notifyEnabled ? "not_sent_no_mail_provider" : "not_requested",
            },
          }, `Submission received for ${record.title} (version ${model.settings.version})`);
          onSubmitted?.(created.id);
          setDone(created.id);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Stack gap={4}>
        <div>
          <h2>{record.title}</h2>
          {record.summary && <p className="ds-subtle">{record.summary}</p>}
          {pageList.length > 1 && <p className="ds-subtle">Page {page + 1} of {pageList.length}</p>}
        </div>

        {current.length === 0 && <Notice tone="neutral" title="No questions on this page">Add a field in the builder.</Notice>}

        {current.map((field) => {
          if (!visible.has(field.id)) return null;
          if (field.type === "section") return <h3 key={field.id} style={{ marginBlockEnd: 0 }}>{field.label}</h3>;
          return (
            <Field
              key={field.id}
              label={field.label}
              required={required.has(field.id)}
              hint={field.help || undefined}
              error={errorFor(field.id)}
              htmlFor={`${mode}-${field.id}`}
            >
              <FieldControl
                field={field}
                value={answers[field.id]}
                invalid={Boolean(errorFor(field.id))}
                idPrefix={mode}
                onChange={(next) => setAnswers((current2) => ({ ...current2, [field.id]: next }))}
              />
            </Field>
          );
        })}

        {errors.length > 0 && (
          <Notice tone="danger" title={`${errors.length} ${errors.length === 1 ? "answer needs" : "answers need"} attention`}>
            <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
              {errors.map((error) => <li key={error.fieldId}>{error.message}</li>)}
            </ul>
          </Notice>
        )}

        <div className="ds-row ds-gap-2">
          {page > 0 && <Button variant="ghost" onClick={() => setPage((value) => value - 1)}>Back</Button>}
          <Button type="submit" variant="primary" busy={busy}>
            {last ? (mode === "live" ? "Submit" : "Check the answers") : "Next"}
          </Button>
        </div>
        {mode === "preview" && <p className="ds-subtle">The preview runs the same validation and the same rules as the public form, and stops before writing a record.</p>}
      </Stack>
    </form>
  );
}
