import {
  useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import { ChevronLeft, MoreHorizontal, PanelLeft, PanelRight } from "lucide-react";
import { Breadcrumbs, Button, Menu, Notice, Pill, Tabs } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { can as roleCan } from "@/platform/policy";
import { useMutations } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./visual.css";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * Editor chrome and document plumbing shared by the visual applications.
 * ====================================================================== */

export interface EditorFrameProps {
  context: ScreenContext;
  /** The screen's own action list, so the toolbar and the contract cannot drift. */
  actions?: ActionDef[];
  tabs?: { id: string; label?: string }[];
  title?: string;
  subtitle?: ReactNode;
  tools?: ReactNode;
  left?: ReactNode;
  leftLabel?: string;
  right?: ReactNode;
  rightLabel?: string;
  status?: ReactNode;
  children: ReactNode;
  /** Breadcrumb back to the application index. */
  backTo?: { label: string; to: string };
  /**
   * One slim row (title, status, tabs) instead of breadcrumbs + a second action
   * cluster. The page command bar already carries primary, secondary and overflow
   * actions, so only `toolbar`-placed actions (which it does not show) stay here.
   * Additive: omitted, the frame renders exactly as before.
   */
  lean?: boolean;
}

export function EditorFrame({
  context, actions = [], tabs, title, subtitle, tools,
  left, leftLabel = "Layers", right, rightLabel = "Properties",
  status, children, backTo, lean,
}: EditorFrameProps) {
  const [mobile, setMobile] = useState<"stage" | "left" | "right">("stage");
  const allowed = actions.filter((action) => !action.capability || roleCan(context.role, action.capability));
  const primary = allowed.filter((action) => action.placement === "primary");
  const secondary = allowed.filter((action) => action.placement === "secondary" || action.placement === "toolbar");
  const overflow = allowed.filter((action) => action.placement === "overflow");

  return (
    <div className="vx">
      <header className="vx-head" data-lean={lean || undefined}>
        {!lean && (
          <Breadcrumbs
            items={[
              { label: context.org.shortName, to: `/o/${context.org.slug}/hq/home` },
              ...(backTo ? [backTo] : []),
              { label: title ?? context.screen.title },
            ]}
          />
        )}
        <div className="vx-titlerow">
          <div className="vx-titleblock">
            {/* The page shell owns the level-1 heading; this names the workspace beneath it. */}
            <h2 className="vx-title">{title ?? context.screen.title}</h2>
            {subtitle && <div className="vx-sub">{subtitle}</div>}
          </div>
          {lean && tabs && tabs.length > 1 && (
            <Tabs
              label={`${title ?? context.screen.title} views`}
              value={context.tab}
              onChange={context.setTab}
              items={tabs.map((tab) => ({ id: tab.id, label: tab.label ?? tab.id }))}
            />
          )}
          <div className="vx-headactions">
            {left && (
              <Button variant="ghost" size="sm" iconOnly aria-label={`Show ${leftLabel}`} onClick={() => setMobile((m) => (m === "left" ? "stage" : "left"))} className="vx-only-mobile">
                <PanelLeft size={16} />
              </Button>
            )}
            {right && (
              <Button variant="ghost" size="sm" iconOnly aria-label={`Show ${rightLabel}`} onClick={() => setMobile((m) => (m === "right" ? "stage" : "right"))} className="vx-only-mobile">
                <PanelRight size={16} />
              </Button>
            )}
            {lean && allowed.filter((action) => action.placement === "toolbar").map((action) => <FrameAction key={action.id} action={action} context={context} variant="secondary" />)}
            {!lean && secondary.map((action) => <FrameAction key={action.id} action={action} context={context} variant="secondary" />)}
            {!lean && primary.map((action) => <FrameAction key={action.id} action={action} context={context} variant="primary" />)}
            {!lean && overflow.length > 0 && (
              <Menu
                label="More actions"
                trigger={<Button variant="ghost" size="sm" iconOnly aria-label="More actions"><MoreHorizontal size={16} /></Button>}
                items={overflow.map((action) => ({
                  label: action.label ?? action.id,
                  tone: action.tone,
                  disabled: Boolean(action.guard?.(context)),
                  onSelect: () => { void action.run(context); },
                }))}
              />
            )}
          </div>
        </div>
        {!lean && tabs && tabs.length > 1 && (
          <Tabs
            label={`${title ?? context.screen.title} views`}
            value={context.tab}
            onChange={context.setTab}
            items={tabs.map((tab) => ({ id: tab.id, label: tab.label ?? tab.id }))}
          />
        )}
      </header>

      <div className="vx-body" data-left={left ? undefined : "false"} data-right={right ? undefined : "false"} data-mobile={mobile}>
        {left && (
          <aside className="vx-panel" data-side="left" aria-label={leftLabel}>
            <div className="vx-panel-head">
              <span className="ds-grow">{leftLabel}</span>
              <button type="button" className="vx-node-btn vx-only-mobile" aria-label="Back to canvas" onClick={() => setMobile("stage")}><ChevronLeft size={14} /></button>
            </div>
            <div className="vx-panel-body">{left}</div>
          </aside>
        )}
        <main className="vx-stage" aria-label={`${title ?? context.screen.title} workspace`}>
          {tools && <div className="vx-stage-tools">{tools}</div>}
          <div className="vx-stage-canvas">{children}</div>
        </main>
        {right && (
          <aside className="vx-panel" data-side="right" aria-label={rightLabel}>
            <div className="vx-panel-head">
              <span className="ds-grow">{rightLabel}</span>
              <button type="button" className="vx-node-btn vx-only-mobile" aria-label="Back to canvas" onClick={() => setMobile("stage")}><ChevronLeft size={14} /></button>
            </div>
            <div className="vx-panel-body">{right}</div>
          </aside>
        )}
      </div>

      <footer className="vx-foot">{status}</footer>
    </div>
  );
}

function FrameAction({ action, context, variant }: { action: ActionDef; context: ScreenContext; variant: "primary" | "secondary" }) {
  const [busy, setBusy] = useState(false);
  const blocked = action.guard?.(context);
  return (
    <Button
      size="sm"
      variant={action.tone === "danger" ? "outline-danger" : variant}
      busy={busy}
      disabled={Boolean(blocked)}
      title={blocked ?? action.shortcut}
      onClick={async () => {
        setBusy(true);
        try { await action.run(context); } finally { setBusy(false); }
      }}
    >
      {action.label ?? action.id}
    </Button>
  );
}

/* ====================================================================== *
 * Document state: local editing with undo/redo, debounced persistence and
 * crash recovery of operations that had not yet been written.
 * ====================================================================== */

export interface DocHandle<T> {
  doc: T | null;
  /** Record an edit; pushes the previous value onto the undo stack. */
  edit: (next: T | ((current: T) => T), label?: string) => void;
  /** Change without an undo entry — for live drag frames. */
  live: (next: T | ((current: T) => T)) => void;
  /** End a live gesture: the value before it becomes the undo point. */
  beginGesture: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastLabel?: string;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
  recovered: boolean;
  dismissRecovery: () => void;
  historyLabels: string[];
}

const DRAFT_PREFIX = "arlovi:visual-draft:";

function readDraft<T>(id: string): { at: string; doc: T } | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + id);
    return raw ? (JSON.parse(raw) as { at: string; doc: T }) : null;
  } catch { return null; }
}

function writeDraft<T>(id: string, doc: T): void {
  try { window.localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ at: clockIso(), doc })); } catch { /* quota */ }
}

function clearDraft(id: string): void {
  try { window.localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* ignore */ }
}

/**
 * Open a record for editing. The document lives in React while a gesture is
 * in flight and is written to the record (and to a local draft) afterwards,
 * so dragging does not write to IndexedDB on every frame but nothing is lost.
 */
export function useDoc<T>(record: Rec | undefined, parse: (body: unknown) => T, screenId: string): DocHandle<T> {
  const mutate = useMutations(screenId);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  const [doc, setDoc] = useState<T | null>(null);
  const [past, setPast] = useState<{ doc: T; label: string }[]>([]);
  const [future, setFuture] = useState<{ doc: T; label: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const loaded = useRef<string | undefined>(undefined);
  const gesture = useRef<T | null>(null);
  const docRef = useRef<T | null>(null);
  docRef.current = doc;
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!record || loaded.current === record.id) return;
    loaded.current = record.id;
    revisionRef.current = record.revision;
    const fromRecord = parseRef.current(record.body);
    const draft = readDraft<T>(record.id);
    if (draft && draft.at > record.updatedAt) {
      setDoc(draft.doc);
      setRecovered(true);
      setDirty(true);
    } else {
      setDoc(fromRecord);
      setRecovered(false);
      setDirty(false);
    }
    setPast([]);
    setFuture([]);
  }, [record]);

  const commitLocal = useCallback((next: T, label: string | undefined, pushUndo: boolean) => {
    const before = docRef.current;
    if (pushUndo && before !== null) {
      setPast((stack) => [...stack.slice(-49), { doc: before, label: label ?? "Edit" }]);
      setFuture([]);
    }
    setDoc(next);
    setDirty(true);
    if (record) writeDraft(record.id, next);
  }, [record]);

  const edit = useCallback((next: T | ((current: T) => T), label?: string) => {
    const current = docRef.current;
    if (current === null) return;
    const value = typeof next === "function" ? (next as (c: T) => T)(current) : next;
    commitLocal(value, label, true);
  }, [commitLocal]);

  const live = useCallback((next: T | ((current: T) => T)) => {
    const current = docRef.current;
    if (current === null) return;
    const value = typeof next === "function" ? (next as (c: T) => T)(current) : next;
    if (gesture.current === null) gesture.current = current;
    commitLocal(value, undefined, false);
  }, [commitLocal]);

  const beginGesture = useCallback(() => {
    const start = gesture.current;
    gesture.current = null;
    if (start !== null && start !== docRef.current) {
      setPast((stack) => [...stack.slice(-49), { doc: start, label: "Direct edit" }]);
      setFuture([]);
    }
  }, []);

  const undo = useCallback(() => {
    setPast((stack) => {
      if (stack.length === 0) return stack;
      const entry = stack[stack.length - 1];
      const current = docRef.current;
      if (current !== null) setFuture((f) => [{ doc: current, label: entry.label }, ...f].slice(0, 50));
      setDoc(entry.doc);
      setDirty(true);
      if (record) writeDraft(record.id, entry.doc);
      return stack.slice(0, -1);
    });
  }, [record]);

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (stack.length === 0) return stack;
      const entry = stack[0];
      const current = docRef.current;
      if (current !== null) setPast((p) => [...p, { doc: current, label: entry.label }]);
      setDoc(entry.doc);
      setDirty(true);
      if (record) writeDraft(record.id, entry.doc);
      return stack.slice(1);
    });
  }, [record]);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!record || current === null) return;
    setSaving(true);
    try {
      const saved = await mutate.patch(record.id, { body: current }, {
        expectRevision: revisionRef.current,
        event: `Saved ${record.title}`,
      });
      if (saved) {
        revisionRef.current = saved.revision;
        setDirty(false);
        setRecovered(false);
        clearDraft(record.id);
      }
    } finally {
      setSaving(false);
    }
  }, [mutate, record]);

  /* Debounced autosave: a gesture ends, 900ms of quiet, then one write. */
  useEffect(() => {
    if (!dirty || !record || doc === null) return;
    const id = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(id);
  }, [dirty, doc, record, save]);

  /* Leaving the screen flushes anything still pending, so switching a tab
     or navigating away never drops the last gesture. */
  const flush = useRef<{ dirty: boolean; save: () => Promise<void> }>({ dirty: false, save: async () => {} });
  flush.current = { dirty, save };
  useEffect(() => () => { if (flush.current.dirty) void flush.current.save(); }, []);

  return {
    doc, edit, live, beginGesture, undo, redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    lastLabel: past[past.length - 1]?.label,
    dirty, saving, save,
    recovered,
    dismissRecovery: () => setRecovered(false),
    historyLabels: past.map((entry) => entry.label),
  };
}

export function SaveState({ handle }: { handle: { dirty: boolean; saving: boolean; recovered: boolean } }) {
  if (handle.saving) return <Pill tone="info" dot>Saving</Pill>;
  if (handle.recovered) return <Pill tone="warning" dot>Recovered draft</Pill>;
  if (handle.dirty) return <Pill tone="warning" dot>Unsaved</Pill>;
  return <Pill tone="success" dot>Saved</Pill>;
}

export function RecoveryNotice({ handle }: { handle: DocHandle<unknown> }) {
  if (!handle.recovered) return null;
  return (
    <Notice
      tone="warning"
      title="Recovered unsaved operations"
      actions={<Button size="sm" variant="secondary" onClick={() => { void handle.save(); }}>Keep and save</Button>}
    >
      This browser held edits that had not been written to the record. They are loaded above. Saving writes them to the record; undo still works.
    </Notice>
  );
}

/* ====================================================================== *
 * Small inspector controls. The design system owns forms; these are the
 * dense numeric and colour controls an editor inspector needs.
 * ====================================================================== */

export function NumberBox({
  label, value, onChange, step = 1, min, max, suffix, disabled,
}: { label: string; value: number; onChange: (next: number) => void; step?: number; min?: number; max?: number; suffix?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="vx-label" htmlFor={id}>{label}{suffix ? ` (${suffix})` : ""}</label>
      <input
        id={id}
        className="vx-num"
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    </div>
  );
}

export function SliderBox({
  label, value, onChange, min = 0, max = 100, step = 1, format,
}: { label: string; value: number; onChange: (next: number) => void; min?: number; max?: number; step?: number; format?: (value: number) => string }) {
  const id = useId();
  return (
    <div>
      <label className="vx-label" htmlFor={id}>
        {label} <span className="ds-num" style={{ float: "right", fontWeight: 400 }}>{format ? format(value) : Math.round(value * 100) / 100}</span>
      </label>
      <input
        id={id}
        className="vx-range"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
    </div>
  );
}

export function ColorBox({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const id = useId();
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div>
      <label className="vx-label" htmlFor={id}>{label}</label>
      <div className="ds-row ds-gap-2">
        <input id={id} type="color" value={hex} aria-label={`${label} colour`} onChange={(event) => onChange(event.target.value)} style={{ width: 32, height: 26, padding: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "none" }} />
        <input className="vx-num" aria-label={`${label} hex`} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  );
}

export function PanelGroup({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="ds-stack ds-gap-2">
      <div className="ds-row ds-gap-2">
        <h4 className="ds-grow" style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-subtle)", margin: 0 }}>{title}</h4>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ====================================================================== *
 * Pointer drag that works the same for mouse, pen and touch, and always
 * releases its listeners.
 * ====================================================================== */

export function dragPointer(
  event: ReactPointerEvent,
  handlers: {
    move: (point: { x: number; y: number }, modifiers: { shift: boolean; alt: boolean; meta: boolean }, start: { x: number; y: number }) => void;
    end?: (moved: boolean) => void;
  },
): void {
  const start = { x: event.clientX, y: event.clientY };
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - start.x) > 1 || Math.abs(ev.clientY - start.y) > 1) moved = true;
    handlers.move({ x: ev.clientX, y: ev.clientY }, { shift: ev.shiftKey, alt: ev.altKey, meta: ev.metaKey || ev.ctrlKey }, start);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    handlers.end?.(moved);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

/** Measure an element, re-measuring on resize — canvases need real pixels. */
export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /* The measured element can mount after the first render (a canvas shown
     once its data has loaded). Re-check the ref after every render and
     re-attach the observer when the element changes, instead of observing
     only whatever existed on mount. */
  const [element, setElement] = useState<T | null>(null);
  useEffect(() => {
    if (ref.current !== element) setElement(ref.current);
  });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: Math.round(box.width), height: Math.round(box.height) });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [element]);
  return [ref, size];
}

/** requestAnimationFrame playback loop driven by wall-clock time. */
export function usePlayback(duration: number, fps: number, options?: { loop?: boolean }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const loop = options?.loop ?? true;
  const frame = useRef(0);
  const origin = useRef(0);

  useEffect(() => {
    if (!playing) return;
    origin.current = performance.now() - time * 1000;
    const tick = (now: number) => {
      const elapsed = (now - origin.current) / 1000;
      if (elapsed >= duration) {
        if (loop) {
          origin.current = now;
          setTime(0);
        } else {
          setTime(duration);
          setPlaying(false);
          return;
        }
      } else {
        setTime(Math.round(elapsed * fps) / fps);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // time is intentionally omitted: it is the loop's output, not its input.
  }, [playing, duration, fps, loop]);

  return { time, setTime, playing, setPlaying };
}

/* ------------------------------ downloads ------------------------------ */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

/** Timecode at a frame rate, e.g. 00:00:04:12. */
export function timecode(seconds: number, fps: number): string {
  const total = Math.max(0, Math.round(seconds * fps));
  const frames = total % fps;
  const whole = Math.floor(total / fps);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}:${pad(frames)}`;
}

export function secondsLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}.${String(Math.round((seconds - whole) * 100)).padStart(2, "0")}`;
}

/** Keyboard list for the help overlay every editor carries. */
export function ShortcutTable({ rows }: { rows: { keys: string; does: string }[] }) {
  return (
    <table className="ds-table">
      <caption className="ds-subtle" style={{ captionSide: "top", textAlign: "start", paddingBottom: 6 }}>
        Every pointer gesture in this editor has the keyboard equivalent listed here.
      </caption>
      <thead><tr><th scope="col">Keys</th><th scope="col">Does</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.keys}><td><kbd className="ds-kbd">{row.keys}</kbd></td><td>{row.does}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/* ====================================================================== *
 * A tiny external store. Screen actions run outside React with only the
 * screen context, so tool state (active tool, selection, viewport) lives
 * here where both an action handler and a component can reach it.
 * ====================================================================== */

export interface Store<T> {
  get: () => T;
  set: (next: T | ((current: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      if (resolved === value) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => ((...args: A) => ref.current(...args)), []);
}
