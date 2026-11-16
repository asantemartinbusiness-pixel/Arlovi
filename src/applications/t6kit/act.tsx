import { useEffect, useId, useState, type ComponentType, type ReactNode } from "react";
import { create } from "zustand";
import { Button, Checkbox, Empty, Field, Notice, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import { BoundaryNotice } from "./kit";

/* ====================================================================== *
 * Contract actions as real operations.
 *
 * An action spec names the record it acts on, states the consequence
 * before anything is written, collects the few values it needs and then
 * applies a real write (patch with expectRevision, create, or a logged
 * boundary attempt). One principal button, disabled with the reason when
 * the action cannot proceed. Used by the five platform applications.
 * ====================================================================== */

export interface ActField {
  name: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "date" | "number" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  initial?: string;
  checked?: boolean;
}

export interface ActInput {
  record?: Rec;
  context: ScreenContext;
  /** Every record of the spec's collection. */
  records: Rec[];
  /** People in the workspace directory (AI employees excluded). */
  people: Rec[];
  /** Whatever the spec's watch hook returned this render. */
  watched?: unknown;
}

export interface ActResult { title?: string; body: string; tone?: "ok" | "blocked" | "failed" | "info" }

export interface ActSpec {
  /** Overlay id. */
  id: string;
  title: string;
  kind?: "modal" | "drawer";
  tone?: "danger";
  width?: number;
  /** Collection the target record is chosen from. Omit for actions with no single target. */
  collection?: string;
  candidates?: (records: Rec[], context: ScreenContext) => Rec[];
  /** Name of one target, for the picker label and the guard message. */
  noun?: string;
  optionLabel?: (record: Rec) => string;
  consequenceTitle?: string | ((input: ActInput) => string);
  consequence: (input: ActInput) => ReactNode;
  Details?: ComponentType<ActInput>;
  fields?: (input: ActInput) => ActField[];
  boundary?: { id: string; action: string };
  /** Why the action cannot run for this target, if it cannot. */
  blocked?: (input: ActInput) => string | undefined;
  submit: string;
  apply: (input: ActInput & { values: Record<string, string> }) => Promise<string | ActResult | void>;
  /** A hook the body calls so it re-renders when outside state (a store) changes. */
  /** Called on every render of the overlay; may call hooks, so it is named as one. */
  useWatch?: () => unknown;
  /** Close after a successful apply (default true). */
  closeOnDone?: boolean;
}

interface ActUi {
  blocked: Record<string, string | undefined>;
  busy: Record<string, boolean>;
  setBlocked: (id: string, reason: string | undefined) => void;
  setBusy: (id: string, busy: boolean) => void;
}

const useActUi = create<ActUi>((set) => ({
  blocked: {},
  busy: {},
  setBlocked: (id, reason) => set((state) => (state.blocked[id] === reason ? state : { blocked: { ...state.blocked, [id]: reason } })),
  setBusy: (id, busy) => set((state) => ({ busy: { ...state.busy, [id]: busy } })),
}));

function formId(id: string): string {
  return `act-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** Ids a target may come from: the overlay payload, the grid selection, the route. */
export function targetIds(context: ScreenContext): (string | undefined)[] {
  const payload = context.overlayPayload as { id?: string } | undefined;
  return [payload?.id, context.selectedId, context.params.id];
}

function ActBody({ spec, context, close }: { spec: ActSpec; context: ScreenContext; close: () => void }) {
  const watched = spec.useWatch?.();
  const all = useCollection(spec.collection ?? "__no_collection__");
  const people = useCollection("members").filter((member) => String(member.fields.kind ?? "human") !== "ai");
  const candidates = spec.collection ? (spec.candidates ? spec.candidates(all, context) : all) : [];
  const preferred = targetIds(context).find((id) => id && candidates.some((row) => row.id === id));
  const [chosen, setChosen] = useState<string>("");
  const targetId = chosen || preferred || (candidates.length === 1 ? candidates[0].id : "");
  const record = candidates.find((row) => row.id === targetId);
  const input: ActInput = { record, context, records: all, people, watched };
  const noun = spec.noun ?? "record";
  const blocked = spec.collection && !record
    ? (candidates.length === 0 ? `There is no ${noun} this can apply to.` : `Choose the ${noun} first.`)
    : spec.blocked?.(input);
  const [error, setError] = useState("");
  const setBlocked = useActUi((state) => state.setBlocked);
  const setBusy = useActUi((state) => state.setBusy);
  const pickerId = useId();
  const baseId = useId();

  useEffect(() => { setBlocked(spec.id, blocked); }, [spec.id, blocked, setBlocked]);
  useEffect(() => () => setBlocked(spec.id, undefined), [spec.id, setBlocked]);

  const fields = spec.fields?.(input) ?? [];
  const consequenceTitle = typeof spec.consequenceTitle === "function" ? spec.consequenceTitle(input) : spec.consequenceTitle ?? "What this will do";
  const Details = spec.Details;

  return (
    <form
      id={formId(spec.id)}
      className="ds-stack ds-gap-4"
      noValidate={false}
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocked) { setError(blocked); return; }
        const data = new FormData(event.currentTarget);
        const values: Record<string, string> = {};
        for (const field of fields) {
          const raw = data.get(field.name);
          values[field.name] = field.kind === "checkbox" ? (raw === "on" ? "on" : "") : String(raw ?? "").trim();
          if (field.required && !values[field.name]) { setError(`${field.label} is required.`); return; }
        }
        setError("");
        setBusy(spec.id, true);
        try {
          const result = await spec.apply({ ...input, values });
          if (result) {
            const toast = typeof result === "string" ? { body: result } : result;
            context.toast(toast.title ?? spec.title, toast.body, toast.tone ?? "ok");
          }
          if (spec.closeOnDone !== false) close();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "The change could not be saved.");
        } finally {
          setBusy(spec.id, false);
        }
      }}
    >
      {spec.collection && (
        candidates.length === 0
          ? <Empty title={`No ${noun} to act on`}>Nothing in this workspace matches. The action stays unavailable rather than acting on something else.</Empty>
          : (
            <Field label={`Which ${noun}`} required htmlFor={pickerId}>
              <Select id={pickerId} value={targetId} onChange={(event) => { setChosen(event.target.value); setError(""); }}>
                <option value="">Choose…</option>
                {candidates.map((row) => <option key={row.id} value={row.id}>{spec.optionLabel ? spec.optionLabel(row) : row.title}</option>)}
              </Select>
            </Field>
          )
      )}

      <Notice tone={spec.tone === "danger" ? "danger" : "info"} title={consequenceTitle}>{spec.consequence(input)}</Notice>

      {Details && <Details {...input} />}

      <Stack gap={3} key={targetId || "none"}>
        {fields.map((field, index) => {
          const id = `${baseId}-${index}`;
          if (field.kind === "checkbox") {
            return <Checkbox key={field.name} name={field.name} label={field.label} defaultChecked={field.checked} />;
          }
          return (
            <Field key={field.name} label={field.label} hint={field.hint} required={field.required} htmlFor={id}>
              {field.kind === "select" ? (
                <Select id={id} name={field.name} defaultValue={field.initial ?? field.options?.[0]?.value ?? ""} required={field.required}>
                  {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              ) : field.kind === "textarea" ? (
                <TextArea id={id} name={field.name} rows={4} defaultValue={field.initial} placeholder={field.placeholder} required={field.required} />
              ) : (
                <TextInput id={id} name={field.name} type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"} defaultValue={field.initial} placeholder={field.placeholder} required={field.required} />
              )}
            </Field>
          );
        })}
      </Stack>

      {spec.boundary && <BoundaryNotice id={spec.boundary.id} action={spec.boundary.action} />}
      {blocked && (spec.collection ? Boolean(record) || candidates.length === 0 : true) && (
        <Notice tone="warning" title="Not available yet">{blocked}</Notice>
      )}
      {error && error !== blocked && <Notice tone="danger" title="Nothing was changed">{error}</Notice>}
    </form>
  );
}

function ActFooter({ spec, close }: { spec: ActSpec; close: () => void }) {
  const blocked = useActUi((state) => state.blocked[spec.id]);
  const busy = useActUi((state) => Boolean(state.busy[spec.id]));
  return (
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <span className="ds-grow" />
      <Button
        variant={spec.tone === "danger" ? "danger" : "primary"}
        type="submit"
        form={formId(spec.id)}
        disabled={Boolean(blocked)}
        title={blocked}
        busy={busy}
      >
        {spec.submit}
      </Button>
    </>
  );
}

export function actOverlay(spec: ActSpec): OverlayDef {
  return {
    id: spec.id,
    kind: spec.kind ?? "modal",
    title: spec.title,
    tone: spec.tone,
    width: spec.width ?? 560,
    render: ({ close, ...context }) => <ActBody spec={spec} context={context} close={close} />,
    footer: ({ close }) => <ActFooter spec={spec} close={close} />,
  };
}

/** Run an action by opening its overlay on the current selection or route record. */
export function openAct(id: string) {
  return (context: ScreenContext) => context.openOverlay(id, { id: context.selectedId ?? context.params.id });
}

/* ------------------------- Shared helpers ------------------------- */

export function peopleOptions(people: Rec[], current?: string): { value: string; label: string }[] {
  const names = [...new Set([...(current ? [current] : []), ...people.map((person) => person.title)])];
  return names.map((name) => ({ value: name, label: name }));
}

/** Plain-text copy of one record's fields, with values that look personal masked. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email redacted]")
    .replace(/\+?\d[\d\s()-]{7,}\d/g, "[number redacted]")
    .replace(/\b(sk|pk|tok|key|secret|token)[-_][A-Za-z0-9]{6,}\b/gi, "[credential redacted]");
}
