import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { currentSlide, readDeck, replaceSlide, updateObjects, type Deck, type Slide, type SlideObject } from "./model";

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

export function useDeckEditor(context: ScreenContext, record: Rec | undefined): DeckEditor {
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
      const at = Date.now();
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
    setPast((current) => [...current.slice(-120), { deck: base, label, at: Date.now() }]);
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
