import { useEffect, useRef, useSyncExternalStore } from "react";
import { useDoc, type DocHandle } from "@/applications/visual/kit";
import type { Rec } from "@/domain/types";
import { getScreenDef, type ScreenContext } from "@/platform/registry";

/* ====================================================================== *
 * One editing session per open record.
 *
 * The visual editors (Design, Photo, Layout, Video) open a record with
 * `useDoc`, which keeps the document, its undo history and its debounced
 * save. Before this module, every panel, overlay and header action opened
 * its own copy: an action wrote straight to IndexedDB behind the editor's
 * back, so the edit was not undoable and the editor's next autosave raised
 * a revision conflict.
 *
 * `useSharedDoc` makes the first component that opens a record the owner of
 * its editing session; anything that opens the same record while it is
 * mounted borrows that session instead of loading another. `editShared`
 * lets a screen action apply an operation through the same session, so it
 * lands on the undo stack and is saved with the rest of the edits. When no
 * editor has the record open, the action writes the record directly with
 * `expectRevision`, so a concurrent save is still caught.
 * ====================================================================== */

interface Slot { handle: DocHandle<unknown> | null }

const SLOTS = new Map<string, Slot[]>();
const LISTENERS = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const listener of LISTENERS) listener();
}

function subscribe(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => { LISTENERS.delete(listener); };
}

function primarySlot(id: string | undefined): Slot | undefined {
  return id ? SLOTS.get(id)?.[0] : undefined;
}

export function useSharedDoc<T>(record: Rec | undefined, parse: (body: unknown) => T, screenId: string): DocHandle<T> {
  useSyncExternalStore(subscribe, () => version, () => version);
  const slot = useRef<Slot>({ handle: null });
  const id = record?.id;
  const primary = primarySlot(id);
  const borrowing = Boolean(primary && primary !== slot.current && primary.handle?.doc);
  /* A borrowing instance hands useDoc no record, so it never loads, never
     recovers a draft and never saves on its own. */
  const own = useDoc<T>(borrowing ? undefined : record, parse, screenId);

  useEffect(() => {
    if (!id) return undefined;
    const current = slot.current;
    SLOTS.set(id, [...(SLOTS.get(id) ?? []), current]);
    emit();
    return () => {
      const rest = (SLOTS.get(id) ?? []).filter((item) => item !== current);
      if (rest.length > 0) SLOTS.set(id, rest); else SLOTS.delete(id);
      emit();
    };
  }, [id]);

  const signature = useRef<unknown[]>([]);
  useEffect(() => {
    slot.current.handle = own as DocHandle<unknown>;
    const next = [own.doc, own.dirty, own.saving, own.canUndo, own.canRedo, own.recovered];
    if (next.some((value, index) => value !== signature.current[index])) {
      signature.current = next;
      if (primarySlot(id) === slot.current) emit();
    }
  });

  if (borrowing && primary?.handle) return primary.handle as DocHandle<T>;
  return own;
}

/** The editing session that currently owns a record, if one is open. */
export function sharedHandle<T>(id: string | undefined): DocHandle<T> | undefined {
  const handle = primarySlot(id)?.handle;
  return handle && handle.doc !== null ? (handle as DocHandle<T>) : undefined;
}

/** The document as the open editor holds it, or as it was last saved. */
export async function readShared<T>(context: ScreenContext, parse: (body: unknown) => T): Promise<T | undefined> {
  const id = context.params.id;
  if (!id) return undefined;
  const handle = sharedHandle<T>(id);
  if (handle?.doc) return handle.doc;
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  return record ? parse(record.body) : undefined;
}

/**
 * Apply an editing operation from a screen action. Through the open editor
 * it is one undoable step; without one it is a revision-checked write.
 * Returns the new document, or undefined when nothing changed.
 */
export async function editShared<T>(
  context: ScreenContext,
  parse: (body: unknown) => T,
  change: (doc: T) => T,
  label: string,
): Promise<T | undefined> {
  const id = context.params.id;
  if (!id) {
    context.toast("Open a document first", "This action edits the open document, and none is open.", "blocked");
    return undefined;
  }
  const handle = sharedHandle<T>(id);
  if (handle?.doc) {
    const next = change(handle.doc);
    if (next === handle.doc) return undefined;
    handle.edit(next, label);
    void context.mutate.log(label, { entityId: id, type: "update" });
    return next;
  }
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  if (!record) {
    context.toast("Not found", "The document is not in this workspace.", "failed");
    return undefined;
  }
  const before = parse(record.body);
  const next = change(before);
  if (next === before) return undefined;
  const saved = await context.mutate.patch(id, { body: next }, { expectRevision: record.revision, event: label });
  return saved ? next : undefined;
}

/** Undo the last step of the open editor's history. */
export function undoShared(context: ScreenContext): boolean {
  const handle = sharedHandle<unknown>(context.params.id);
  if (!handle?.canUndo) return false;
  handle.undo();
  return true;
}

export function canUndoShared(context: ScreenContext): boolean {
  return Boolean(sharedHandle<unknown>(context.params.id)?.canUndo);
}

/* ====================================================================== *
 * Keeping the header honest.
 *
 * The screen host evaluates each action's guard when it renders, and it
 * does not re-render when an editor's own state changes (a clip or a layer
 * is selected, the playhead moves, a document finishes loading). A guard
 * would then stay disabled after its reason had gone, or enabled after it
 * had arrived. Each editor component calls this hook: it recomputes every
 * guard of the screen and, only when one of the answers changes, asks the
 * host to re-render by re-selecting the current tab.
 * ====================================================================== */

const LAST_SIGNATURE = new Map<string, string>();

export function useGuardRefresh(context: ScreenContext): void {
  const def = getScreenDef(context.screen.applicationCode, context.screen.id);
  const signature = (def?.actions ?? []).map((action) => {
    try { return action.guard?.(context) ?? ""; } catch { return "!"; }
  }).join("|");
  const key = `${context.screen.id}:${context.params.id ?? ""}`;
  useEffect(() => {
    const last = LAST_SIGNATURE.get(key);
    if (last === signature) return;
    LAST_SIGNATURE.set(key, signature);
    if (last === undefined || def?.chrome === "full") return;
    /* The re-render is requested by re-selecting the current tab. If the person
       has already moved to another tab since this component rendered, that
       value is stale: re-selecting it would pull them back. Their navigation
       re-renders the host anyway, so there is nothing to request. */
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab !== null && urlTab !== context.tab) return;
    context.setTab(context.tab);
  });
}
