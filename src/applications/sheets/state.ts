import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import type { CellResult, EvaluationResult, RangeBox } from "./engine";
import {
  evaluate, readWorkbook, replaceSheet, sheetById, type FormatContext, type Sheet, type Workbook,
} from "./model";
import { singleSelection, type GridSelection } from "./grid";
import { shareEditor } from "./sharedEditor";
import { clockNow, wallMs } from "@/platform/clock";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "conflict";

export interface WorkbookEditor {
  workbook: Workbook;
  sheet: Sheet;
  evaluation: EvaluationResult;
  values: Record<string, CellResult>;
  format: FormatContext;
  selection: GridSelection;
  setSelection: (selection: GridSelection) => void;
  saveState: SaveState;
  lastSavedAt?: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  /** Replace the workbook as one undo step. */
  commit: (next: Workbook, label: string) => void;
  /** Replace the active sheet as one undo step. */
  commitSheet: (next: Sheet, label: string) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  recalculate: () => void;
  recalculatedAt: Date;
  selectSheet: (id: string) => void;
  conflict?: boolean;
  resolveConflict: (keep: "mine" | "theirs") => Promise<void>;
  /** The workbook as it was when this editor last loaded or saved it: the base a merge compares against. */
  base: Workbook;
  /** Write a merged workbook over the stored one and clear the conflict. */
  resolveWith: (merged: Workbook, label: string) => Promise<void>;
  record?: Rec;
}

const AUTOSAVE_MS = 700;

interface Step { workbook: Workbook; label: string; at: number }

function useOwnWorkbookEditor(context: ScreenContext, record: Rec | undefined): WorkbookEditor {
  const [workbook, setWorkbook] = useState<Workbook>(() => readWorkbook(record?.body));
  const [past, setPast] = useState<Step[]>([]);
  const [future, setFuture] = useState<Step[]>([]);
  const [selection, setSelection] = useState<GridSelection>(() => singleSelection(0, 0));
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(record?.updatedAt);
  const [recalcToken, setRecalcToken] = useState(0);
  const [recalculatedAt, setRecalculatedAt] = useState(context.now);
  const [conflict, setConflict] = useState(false);

  const recordId = record?.id;
  const baseRevision = useRef(record?.revision ?? 0);
  const loadedFor = useRef<string | undefined>(undefined);
  const pending = useRef<Workbook | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const baseRef = useRef<Workbook>(workbook);

  useEffect(() => {
    if (!record) return;
    if (loadedFor.current === record.id) {
      if (dirty.current && record.revision > baseRevision.current + 1) { setConflict(true); setSaveState("conflict"); }
      return;
    }
    loadedFor.current = record.id;
    baseRevision.current = record.revision;
    setWorkbook(readWorkbook(record.body));
    baseRef.current = readWorkbook(record.body);
    setLastSavedAt(record.updatedAt);
    setPast([]);
    setFuture([]);
    setSelection(singleSelection(0, 0));
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
    baseRef.current = next;
    dirty.current = false;
    setLastSavedAt(result.updatedAt);
    setSaveState("saved");
  }, [context, recordId]);

  const schedule = useCallback((next: Workbook) => {
    pending.current = next;
    dirty.current = true;
    setSaveState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush]);

  const commit = useCallback((next: Workbook, label: string) => {
    setPast((current) => [...current.slice(-120), { workbook, label, at: wallMs() }]);
    setFuture([]);
    setWorkbook(next);
    setRecalculatedAt(clockNow());
    schedule(next);
  }, [workbook, schedule]);

  const sheet = useMemo(() => sheetById(workbook, workbook.activeSheetId), [workbook]);

  const commitSheet = useCallback((next: Sheet, label: string) => {
    commit(replaceSheet(workbook, next), label);
  }, [commit, workbook]);

  const undo = useCallback(() => {
    setPast((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setFuture((stack) => [...stack, { workbook, label: previous.label, at: previous.at }]);
      setWorkbook(previous.workbook);
      schedule(previous.workbook);
      return current.slice(0, -1);
    });
  }, [workbook, schedule]);

  const redo = useCallback(() => {
    setFuture((current) => {
      const next = current[current.length - 1];
      if (!next) return current;
      setPast((stack) => [...stack, { workbook, label: next.label, at: next.at }]);
      setWorkbook(next.workbook);
      schedule(next.workbook);
      return current.slice(0, -1);
    });
  }, [workbook, schedule]);

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!pending.current && saveState === "dirty") pending.current = workbook;
    await flush();
  }, [flush, workbook, saveState]);

  const format = useMemo<FormatContext>(() => ({ currency: context.org.currency, locale: context.org.locale }), [context.org]);

  const evaluation = useMemo(
    () => evaluate(workbook, recalculatedAt),
    // recalcToken forces a recomputation when the person asks for one.
    [workbook, recalculatedAt, recalcToken],
  );

  const values = evaluation.values[sheet.name] ?? {};

  const recalculate = useCallback(() => {
    setRecalculatedAt(clockNow());
    setRecalcToken((value) => value + 1);
  }, []);

  const selectSheet = useCallback((id: string) => {
    setWorkbook((current) => ({ ...current, activeSheetId: id }));
    setSelection(singleSelection(0, 0));
  }, []);

  const resolveConflict = useCallback(async (keep: "mine" | "theirs") => {
    if (!recordId || !record) return;
    if (keep === "theirs") {
      setWorkbook(readWorkbook(record.body));
      dirty.current = false;
      pending.current = null;
      baseRevision.current = record.revision;
      setConflict(false);
      setSaveState("clean");
      return;
    }
    const result = await context.mutate.patch(recordId, { body: workbook }, { event: "Workbook conflict resolved by keeping this editor's cells" });
    if (result) {
      baseRevision.current = result.revision;
      dirty.current = false;
      pending.current = null;
      setLastSavedAt(result.updatedAt);
      setConflict(false);
      setSaveState("saved");
    }
  }, [recordId, record, context, workbook]);

  const resolveWith = useCallback(async (merged: Workbook, label: string) => {
    if (!recordId) return;
    if (timer.current) window.clearTimeout(timer.current);
    const result = await context.mutate.patch(recordId, { body: merged }, { event: label });
    if (!result) return;
    setPast((current) => [...current.slice(-120), { workbook, label, at: wallMs() }]);
    setWorkbook(merged);
    baseRef.current = merged;
    baseRevision.current = result.revision;
    dirty.current = false;
    pending.current = null;
    setLastSavedAt(result.updatedAt);
    setConflict(false);
    setSaveState("saved");
  }, [recordId, context, workbook]);

  return {
    base: baseRef.current, resolveWith,
    workbook, sheet, evaluation, values, format,
    selection, setSelection,
    saveState, lastSavedAt,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label,
    commit, commitSheet, undo, redo, saveNow,
    recalculate, recalculatedAt,
    selectSheet,
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

/** Protected addresses on the active sheet, as a set for the grid. */
export function protectedSet(workbook: Workbook, sheet: Sheet): Set<string> {
  const out = new Set<string>();
  for (const range of workbook.protection) {
    if (range.sheetId !== sheet.id) continue;
    for (const address of expand(range.ref)) out.add(address);
  }
  return out;
}

function expand(ref: string): string[] {
  // Local copy to keep this module free of a circular import.
  const [left, right] = ref.split(":");
  const parse = (text: string) => {
    const match = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(text.replace(/\$/g, ""));
    if (!match) return null;
    let col = 0;
    for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { col: col - 1, row: Number(match[2]) - 1 };
  };
  const from = parse(left);
  if (!from) return [];
  const to = right ? parse(right) : from;
  if (!to) return [];
  const name = (col: number) => {
    let text = "";
    let n = col;
    while (n >= 0) { text = String.fromCharCode(65 + (n % 26)) + text; n = Math.floor(n / 26) - 1; }
    return text;
  };
  const out: string[] = [];
  for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
    for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col += 1) out.push(`${name(col)}${row + 1}`);
  }
  return out;
}

export function boxAddresses(box: RangeBox): string[] {
  const name = (col: number) => {
    let text = "";
    let n = col;
    while (n >= 0) { text = String.fromCharCode(65 + (n % 26)) + text; n = Math.floor(n / 26) - 1; }
    return text;
  };
  const out: string[] = [];
  for (let row = box.fromRow; row <= box.toRow; row += 1) {
    for (let col = box.fromCol; col <= box.toCol; col += 1) out.push(`${name(col)}${row + 1}`);
  }
  return out;
}

const SHARED = shareEditor(useOwnWorkbookEditor, (editor) => [editor.workbook, editor.selection, editor.saveState, editor.canUndo, editor.canRedo, editor.conflict, editor.evaluation]);

/** Open a workbook for editing; components that open the same workbook share one editor. */
export const useWorkbookEditor = SHARED.useShared;

/** The editor that owns a workbook while it is open, for screen actions. */
export const activeWorkbookEditor = SHARED.active;
