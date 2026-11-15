import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { currentSlide, readDeck, replaceSlide, updateObjects, type Deck, type Slide, type SlideObject } from "./model";
import { wallMs } from "@/platform/clock";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "conflict";

export interface DeckEditor {
  deck: Deck;
  slide: Slide;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  saveState: SaveState;
  lastSavedAt?: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  commit: (next: Deck, label: string, coalesce?: boolean) => void;
  commitSlide: (next: Slide, label: string, coalesce?: boolean) => void;
  /** High-frequency transform during a drag: no history entry, no autosave. */
  preview: (updates: { id: string; patch: Partial<SlideObject> }[]) => void;
  /** Settle a preview into one undo step and schedule the save. */
  settle: (label: string) => void;
  selectSlide: (index: number) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  conflict?: boolean;
  resolveConflict: (keep: "mine" | "theirs") => Promise<void>;
  record?: Rec;
}

const AUTOSAVE_MS = 700;

interface Step { deck: Deck; label: string; at: number }

function useOwnDeckEditor(context: ScreenContext, record: Rec | undefined): DeckEditor {
  const [deck, setDeck] = useState<Deck>(() => readDeck(record?.body));
  const [past, setPast] = useState<Step[]>([]);
  const [future, setFuture] = useState<Step[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(record?.updatedAt);
  const [conflict, setConflict] = useState(false);

  const recordId = record?.id;
  const baseRevision = useRef(record?.revision ?? 0);
  const loadedFor = useRef<string | undefined>(undefined);
  const pending = useRef<Deck | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  /** The deck as it was before the current drag began. */
  const dragBase = useRef<Deck | null>(null);

  useEffect(() => {
    if (!record) return;
    if (loadedFor.current === record.id) {
      if (dirty.current && record.revision > baseRevision.current + 1) { setConflict(true); setSaveState("conflict"); }
      return;
    }
    loadedFor.current = record.id;
    baseRevision.current = record.revision;
    setDeck(readDeck(record.body));
    setLastSavedAt(record.updatedAt);
    setPast([]);
    setFuture([]);
    setSelectedIds([]);
  }, [record]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || !recordId) return;
    pending.current = null;
    setSaveState("saving");
    const result = await context.mutate.patch(recordId, { body: next }, { expectRevision: baseRevision.current, skipHistory: true });
    if (!result) { setConflict(true); setSaveState("conflict"); return; }
    baseRevision.current = result.revision;
    dirty.current = false;
    setLastSavedAt(result.updatedAt);
    setSaveState("saved");
  }, [context, recordId]);

  const schedule = useCallback((next: Deck) => {
    pending.current = next;
    dirty.current = true;
    setSaveState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush]);

  // A run of keyboard nudges inside the coalesce window is one undo step, so
  // five taps of an arrow key do not cost five undos to reverse.
  const COALESCE_MS = 900;
  const commit = useCallback((next: Deck, label: string, coalesce = false) => {
    setPast((current) => {
      const last = current[current.length - 1];
      const at = wallMs();
      if (coalesce && last && last.label === label && at - last.at < COALESCE_MS) {
        return [...current.slice(0, -1), { ...last, at }];
      }
      return [...current.slice(-120), { deck, label, at }];
    });
    setFuture([]);
    setDeck(next);
    schedule(next);
  }, [deck, schedule]);

  const slide = useMemo(() => currentSlide(deck), [deck]);

  const commitSlide = useCallback((next: Slide, label: string, coalesce = false) => {
    commit(replaceSlide(deck, next), label, coalesce);
  }, [commit, deck]);

  const preview = useCallback((updates: { id: string; patch: Partial<SlideObject> }[]) => {
    if (updates.length === 0) return;
    setDeck((current) => {
      if (!dragBase.current) dragBase.current = current;
      const target = currentSlide(current);
      let next = target;
      for (const update of updates) next = updateObjects(next, [update.id], (object) => ({ ...object, ...update.patch }));
      return replaceSlide(current, next);
    });
  }, []);

  const settle = useCallback((label: string) => {
    const base = dragBase.current;
    dragBase.current = null;
    if (!base) return;
    setPast((current) => [...current.slice(-120), { deck: base, label, at: wallMs() }]);
    setFuture([]);
    setDeck((current) => { schedule(current); return current; });
  }, [schedule]);

  const undo = useCallback(() => {
    setPast((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setFuture((stack) => [...stack, { deck, label: previous.label, at: previous.at }]);
      setDeck(previous.deck);
      schedule(previous.deck);
      return current.slice(0, -1);
    });
  }, [deck, schedule]);

  const redo = useCallback(() => {
    setFuture((current) => {
      const next = current[current.length - 1];
      if (!next) return current;
      setPast((stack) => [...stack, { deck, label: next.label, at: next.at }]);
      setDeck(next.deck);
      schedule(next.deck);
      return current.slice(0, -1);
    });
  }, [deck, schedule]);

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!pending.current && saveState === "dirty") pending.current = deck;
    await flush();
  }, [flush, deck, saveState]);

  const selectSlide = useCallback((index: number) => {
    setDeck((current) => ({ ...current, index: Math.max(0, Math.min(current.slides.length - 1, index)) }));
    setSelectedIds([]);
  }, []);

  const resolveConflict = useCallback(async (keep: "mine" | "theirs") => {
    if (!recordId || !record) return;
    if (keep === "theirs") {
      setDeck(readDeck(record.body));
      dirty.current = false;
      pending.current = null;
      baseRevision.current = record.revision;
      setConflict(false);
      setSaveState("clean");
      return;
    }
    const result = await context.mutate.patch(recordId, { body: deck }, { event: "Deck conflict resolved by keeping this editor's slides" });
    if (result) {
      baseRevision.current = result.revision;
      dirty.current = false;
      pending.current = null;
      setLastSavedAt(result.updatedAt);
      setConflict(false);
      setSaveState("saved");
    }
  }, [recordId, record, context, deck]);

  return {
    deck, slide, selectedIds, setSelectedIds,
    saveState, lastSavedAt,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label,
    commit, commitSlide, preview, settle, selectSlide,
    undo, redo, saveNow,
    conflict: conflict || undefined,
    resolveConflict,
    record,
  };
}

export const SAVE_LABEL: Record<SaveState, string> = {
  clean: "No unsaved changes",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Save conflict",
};

export const SAVE_TONE: Record<SaveState, "neutral" | "warning" | "success" | "danger" | "info"> = {
  clean: "neutral", dirty: "warning", saving: "info", saved: "success", conflict: "danger",
};

/* ====================================================================== *
 * One editor per open deck.
 *
 * Every panel and overlay used to open its own editor, each with its own
 * copy of the deck, its own undo history and its own autosave, so an edit
 * made in an overlay was invisible to the slide editor and its next save
 * hit a revision conflict. The first component to open a deck now owns its
 * editor; anything else that opens the same deck while it is mounted
 * borrows that editor, so there is one deck, one history and one save.
 * Screen actions reach the same editor through `activeDeckEditor`.
 * ====================================================================== */

interface Slot { editor: DeckEditor | null }
const SLOTS = new Map<string, Slot[]>();
const LISTENERS = new Set<() => void>();
let version = 0;
function emit(): void { version += 1; for (const listener of LISTENERS) listener(); }
function subscribe(listener: () => void): () => void { LISTENERS.add(listener); return () => { LISTENERS.delete(listener); }; }

export function useDeckEditor(context: ScreenContext, record: Rec | undefined): DeckEditor {
  useSyncExternalStore(subscribe, () => version, () => version);
  const slot = useRef<Slot>({ editor: null });
  const id = record?.id;
  const primary = id ? SLOTS.get(id)?.[0] : undefined;
  const borrowing = Boolean(primary && primary !== slot.current && primary.editor);
  const own = useOwnDeckEditor(context, borrowing ? undefined : record);

  useEffect(() => {
    if (!id) return undefined;
    const current = slot.current;
    SLOTS.set(id, [...(SLOTS.get(id) ?? []), current]);
    emit();
    return () => {
      const rest = (SLOTS.get(id) ?? []).filter((item) => item !== current);
      if (rest.length) SLOTS.set(id, rest); else SLOTS.delete(id);
      emit();
    };
  }, [id]);

  const signature = useRef<unknown[]>([]);
  useEffect(() => {
    slot.current.editor = own;
    const next = [own.deck, own.selectedIds, own.saveState, own.canUndo, own.canRedo, own.conflict];
    if (next.some((value, index) => value !== signature.current[index])) {
      signature.current = next;
      if (id && SLOTS.get(id)?.[0] === slot.current) emit();
    }
  });

  if (borrowing && primary?.editor) return { ...primary.editor, record: record ?? primary.editor.record };
  return own;
}

/** The editor that owns a deck while it is open, for screen actions. */
export function activeDeckEditor(id: string | undefined): DeckEditor | undefined {
  const editor = id ? SLOTS.get(id)?.[0]?.editor : undefined;
  return editor ?? undefined;
}
