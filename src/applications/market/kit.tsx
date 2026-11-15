import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, Notice, Pill, Properties, Row, Stack, type Tone } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import { addDays, sameDay, startOfMonth, startOfWeek } from "@/platform/clock";
import type { InvoiceTotals, TaxCategory } from "@/platform/money";
import type { OverlayDef } from "@/platform/registry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Shared kit for the commerce and growth workstream, kept in MARKET because
 * the calendar and the provider boundary originate here. COMMERCE, BOOK,
 * PROC and PORTAL import from this one module rather than each keeping a
 * copy. Anything specific to a single application stays in that
 * application's folder so each app keeps its own information architecture.
 * ====================================================================== */

/** Standard modal footer for a form rendered inside an overlay. */
export const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

/**
 * The honest provider boundary. Never claims a remote action happened: it
 * names the provider, the capability state and what was kept locally instead.
 */
export function ProviderBoundary({ id, title, children }: { id: string; title?: string; children?: ReactNode }) {
  const capability = capabilityById(id);
  if (!capability) {
    return <Notice tone="warning" title={title ?? "No provider is connected"}>{children}</Notice>;
  }
  return (
    <Notice
      tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : CAPABILITY_TONE[capability.state]}
      title={title ?? `${capability.label} · ${capability.provider} ${CAPABILITY_LABELS[capability.state].toLowerCase()}`}
      actions={<Pill tone={CAPABILITY_TONE[capability.state]}>{CAPABILITY_LABELS[capability.state]}</Pill>}
    >
      <Stack gap={1}>
        <span>{capability.note}</span>
        <span><strong>Kept locally:</strong> {capability.localEquivalent}</span>
        {children}
      </Stack>
    </Notice>
  );
}

/** Where a figure came from, so a number is never shown without a source. */
export function SourceNote({ rows, children }: { rows: { label: string; value: ReactNode }[]; children?: ReactNode }) {
  return (
    <Stack gap={3}>
      <Properties rows={rows} />
      {children}
    </Stack>
  );
}

export const TAX_CATEGORIES: { value: TaxCategory; label: string }[] = [
  { value: "standard", label: "Standard rated" },
  { value: "reduced", label: "Reduced rate" },
  { value: "zero_rated", label: "Zero rated" },
  { value: "exempt", label: "Exempt" },
  { value: "outside_scope", label: "Outside the scope" },
  { value: "reverse_charge", label: "Reverse charge" },
];

export function taxCategoryOf(record: Rec | undefined, fallback: TaxCategory = "standard"): TaxCategory {
  const value = record?.fields.taxCategory ?? record?.fields.vat;
  const allowed = TAX_CATEGORIES.map((item) => item.value) as string[];
  return typeof value === "string" && allowed.includes(value) ? (value as TaxCategory) : fallback;
}

/** Net / tax / gross with the resolved tax code per group. Never a flat rate. */
export function TotalsBlock({
  totals, money, label = "Totals", extraRows,
}: { totals: InvoiceTotals; money: (minor: number | undefined) => string; label?: string; extraRows?: { label: string; value: ReactNode }[] }) {
  return (
    <Stack gap={3}>
      <Properties
        rows={[
          { label: "Net", value: <span className="ds-num">{money(totals.netMinor)}</span> },
          ...totals.byCode.map((group) => ({
            label: `${group.code.label} (${group.code.code})`,
            value: <span className="ds-num">{money(group.taxMinor)}</span>,
          })),
          { label: "Tax", value: <span className="ds-num">{money(totals.taxMinor)}</span> },
          ...(extraRows ?? []),
          { label: `${label} due`, value: <strong className="ds-num">{money(totals.grossMinor)}</strong> },
        ]}
      />
      {totals.hasUnknownRate && (
        <Notice tone="danger" title="A line has no approved tax rate">
          One or more lines resolved to <code>UNKNOWN</code> for this jurisdiction, category, customer status and date.
          The figure is shown without tax and must be reviewed before the document is issued.
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ScheduleCalendar — month and week grid with drag reschedule and a
 * full keyboard equivalent (Enter picks the item up, arrows move it,
 * Enter commits, Escape cancels). Used by the MARKET campaign calendar
 * and the MARKET content calendar.
 * ------------------------------------------------------------------ */

export interface CalendarItem {
  id: string;
  title: string;
  at: string;
  tone?: Tone;
  meta?: string;
  locked?: string;
}

export function ScheduleCalendar({
  mode, anchor, now, items, onMove, onOpen, label, weekStartsOn = 1,
}: {
  mode: "month" | "week";
  anchor: Date;
  now: Date;
  items: CalendarItem[];
  onMove: (id: string, nextIso: string) => void | Promise<void>;
  onOpen?: (id: string) => void;
  label: string;
  weekStartsOn?: number;
}) {
  const liveId = useId();
  const [grabbed, setGrabbed] = useState<{ id: string; offset: number } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor, weekStartsOn);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const first = startOfMonth(anchor);
    const start = startOfWeek(first, weekStartsOn);
    const cells: Date[] = [];
    for (let index = 0; index < 42; index += 1) cells.push(addDays(start, index));
    while (cells.length > 35 && cells[35].getMonth() !== first.getMonth() && cells[34].getMonth() !== first.getMonth()) cells.pop();
    return cells;
  }, [mode, anchor, weekStartsOn]);

  const commit = useCallback(async (id: string, target: Date) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    if (item.locked) {
      setMessage(`${item.title} cannot be moved: ${item.locked}`);
      return;
    }
    const original = new Date(item.at);
    const next = new Date(target);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);
    await onMove(id, next.toISOString());
    setMessage(`${item.title} moved to ${next.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}.`);
  }, [items, onMove]);

  function onItemKeyDown(event: KeyboardEvent<HTMLButtonElement>, item: CalendarItem) {
    const step = mode === "week" ? 1 : 7;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!grabbed || grabbed.id !== item.id) {
        if (item.locked) { setMessage(`${item.title} cannot be moved: ${item.locked}`); return; }
        setGrabbed({ id: item.id, offset: 0 });
        setMessage(`${item.title} picked up. Arrow keys move it, Enter drops it, Escape cancels.`);
        return;
      }
      const target = addDays(new Date(item.at), grabbed.offset);
      setGrabbed(null);
      if (grabbed.offset === 0) {
        setMessage(`${item.title} put back where it was.`);
        onOpen?.(item.id);
        return;
      }
      void commit(item.id, target);
      return;
    }
    if (event.key === "Escape" && grabbed?.id === item.id) {
      event.preventDefault();
      setGrabbed(null);
      setMessage("Move cancelled. Nothing changed.");
      return;
    }
    if (!grabbed || grabbed.id !== item.id) return;
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    const offset = grabbed.offset + delta;
    setGrabbed({ id: item.id, offset });
    const preview = addDays(new Date(item.at), offset);
    setMessage(`${item.title} would move to ${preview.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}. Enter to drop.`);
  }

  return (
    <div className="t4-cal" ref={gridRef}>
      <div className="t4-cal-head" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor, weekStartsOn), index)).map((day) => (
          <span key={day.toISOString()}>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
        ))}
      </div>
      <div className="t4-cal-grid" data-mode={mode} role="grid" aria-label={label}>
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayItems = items.filter((item) => sameDay(new Date(item.at), day));
          const ghost = grabbed
            ? items.find((item) => item.id === grabbed.id && sameDay(addDays(new Date(item.at), grabbed.offset), day))
            : undefined;
          return (
            <div
              key={key}
              role="gridcell"
              aria-label={day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              className="t4-cal-cell"
              data-today={sameDay(day, now) ? "true" : undefined}
              data-outside={mode === "month" && day.getMonth() !== anchor.getMonth() ? "true" : undefined}
              data-over={dragOver === key || ghost ? "true" : undefined}
              onDragOver={(event) => { event.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver((current) => (current === key ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(null);
                const id = event.dataTransfer.getData("text/plain");
                if (id) void commit(id, day);
              }}
            >
              <span className="t4-cal-date">{day.getDate()}{day.getDate() === 1 ? ` ${day.toLocaleDateString(undefined, { month: "short" })}` : ""}</span>
              {dayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="t4-cal-item"
                  data-tone={item.tone}
                  data-grabbed={grabbed?.id === item.id ? "true" : undefined}
                  draggable={!item.locked}
                  aria-grabbed={grabbed?.id === item.id || undefined}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                  onKeyDown={(event) => onItemKeyDown(event, item)}
                  onClick={() => onOpen?.(item.id)}
                  title={item.locked ? `${item.title} — ${item.locked}` : item.title}
                >
                  <strong>{item.title}</strong>
                  {item.meta && <span>{item.meta}</span>}
                </button>
              ))}
              {ghost && <span className="t4-cal-ghost">{ghost.title} lands here</span>}
            </div>
          );
        })}
      </div>
      <p aria-live="polite" id={liveId} className="ds-subtle" style={{ minHeight: "1.4em" }}>
        {message || "Drag an item to another day, or focus one and press Enter to move it with the arrow keys."}
      </p>
    </div>
  );
}

/** Month / week switch plus period stepper shared by the calendars. */
export function CalendarToolbar({
  mode, onMode, anchor, onAnchor, now, label,
}: {
  mode: "month" | "week";
  onMode?: (mode: "month" | "week") => void;
  anchor: Date;
  onAnchor: (date: Date) => void;
  now: Date;
  label: string;
}) {
  return (
    <Row gap={2} wrap>
      <Button size="sm" variant="secondary" onClick={() => onAnchor(mode === "week" ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} aria-label={`Previous ${mode}`}>←</Button>
      <strong style={{ minWidth: 190, textAlign: "center" }}>
        {mode === "week"
          ? `Week of ${startOfWeek(anchor, 1).toLocaleDateString(undefined, { day: "numeric", month: "long" })}`
          : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </strong>
      <Button size="sm" variant="secondary" onClick={() => onAnchor(mode === "week" ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} aria-label={`Next ${mode}`}>→</Button>
      <Button size="sm" variant="ghost" onClick={() => onAnchor(new Date(now))}>Today</Button>
      {onMode && (
        <div className="ds-btn-group" role="group" aria-label={`${label} range`}>
          <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "month"} onClick={() => onMode("month")}>Month</button>
          <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "week"} onClick={() => onMode("week")}>Week</button>
        </div>
      )}
      <span className="ds-grow" />
      <span className="ds-subtle">Dates resolve against the workspace clock ({now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}).</span>
    </Row>
  );
}

/** Tiny external store so a basket survives tab and overlay remounts. */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: T | ((current: T) => T)) => {
      state = typeof next === "function" ? (next as (current: T) => T)(state) : next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Confirmation for a consequential action. The action that opens it
 * reads the record first, so the modal states the consequence against
 * the revision the person actually saw, and the write passes that
 * revision as expectRevision. One principal button; the record changes
 * only when it is pressed.
 * ------------------------------------------------------------------ */

export interface ConfirmSpec {
  title: string;
  consequence: ReactNode;
  facts?: { label: string; value: ReactNode }[];
  confirmLabel: string;
  tone?: "danger";
  /** Capability id from src/platform/capability.ts when the action meets a provider boundary. */
  boundary?: string;
  boundaryTitle?: string;
  boundaryNote?: ReactNode;
  /** When set, the action cannot go ahead and the button is disabled with this reason. */
  blocked?: string;
  /** Performs the write. Returning a string keeps the modal open and shows it as the error. */
  run: () => Promise<string | void>;
}

export const CONFIRM_OVERLAY = "confirm";

function ConfirmAction({ spec, close }: { spec: ConfirmSpec | undefined; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!spec) return <Notice tone="warning" title="Nothing to confirm">Open this from an action on the screen.</Notice>;
  return (
    <Stack gap={4}>
      {spec.blocked
        ? <Notice tone="danger" title="This cannot go ahead">{spec.blocked}</Notice>
        : <Notice tone={spec.tone === "danger" ? "warning" : "info"} title="What this does">{spec.consequence}</Notice>}
      {spec.facts && spec.facts.length > 0 && <Properties rows={spec.facts.map((fact, index, all) => (all.findIndex((other) => other.label === fact.label) === index ? fact : { ...fact, label: `${fact.label} (${index + 1})` }))} />}
      {spec.boundary && <ProviderBoundary id={spec.boundary} title={spec.boundaryTitle}>{spec.boundaryNote}</ProviderBoundary>}
      {error && <Notice tone="danger" title="Nothing was saved">{error}</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant={spec.tone === "danger" ? "danger" : "primary"}
          busy={busy}
          disabled={Boolean(spec.blocked)}
          title={spec.blocked}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              const problem = await spec.run();
              if (typeof problem === "string") { setError(problem); setBusy(false); return; }
              close();
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : String(failure));
              setBusy(false);
            }
          }}
        >
          {spec.confirmLabel}
        </Button>
      </Row>
    </Stack>
  );
}

/** Add to a screen's overlays; actions open it with openOverlay("confirm", spec). */
export const confirmOverlay: OverlayDef = {
  id: CONFIRM_OVERLAY,
  kind: "modal",
  width: 580,
  title: (context) => (context.overlayPayload as ConfirmSpec | undefined)?.title ?? "Confirm",
  render: ({ close, overlayPayload }) => <ConfirmAction spec={overlayPayload as ConfirmSpec | undefined} close={close} />,
};

/** Message used when expectRevision catches a concurrent save. */
export const CHANGED_ELSEWHERE = "The record changed after this was opened. Close, check the latest version and try again.";

/** Build and download a CSV in the browser. Nothing is uploaded. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | boolean | undefined)[][]): number {
  const quote = (value: string | number | boolean | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const text = [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}
