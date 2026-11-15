import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import {
  activeMarks, blockIndex, blockText, collapsed, deleteRange, indent as indentBlock, insertText,
  isTextBlock, mergeBackwards, orderedRange, outdent as outdentBlock, readDoc, setBlockType,
  splitBlock, toggleMark,
  type DocModel, type DocRange, type EditActor, type History, type HistoryEntry,
} from "./model";
import type { EditIntent } from "./canvas";
import { shareEditor } from "@/applications/sheets/sharedEditor";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface DocEditor {
  model: DocModel;
  selection: DocRange | null;
  restoreToken: number;
  saveState: SaveState;
  lastSavedAt?: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  marks: ReturnType<typeof activeMarks>;
  /** Commit a new model as one undo step. */
  commit: (next: DocModel, label: string, selection?: DocRange | null, coalesce?: boolean) => void;
  setSelection: (range: DocRange | null) => void;
  /** Move the caret and force the DOM selection to follow. */
  moveCaret: (range: DocRange) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  handleEdit: (intent: EditIntent, hooks?: EditHooks) => void;
  actor: EditActor;
  conflict?: { theirs: DocModel; at: string };
  resolveConflict: (keep: "mine" | "theirs") => Promise<void>;
  recoverToVersion: () => Promise<void>;
}

export interface EditHooks {
  onRequestLink?: (range: DocRange) => void;
  onRequestFind?: () => void;
}

const AUTOSAVE_MS = 800;

/**
 * One editor state per document record. Edits run against the in-memory
 * model; the record is patched on a debounce with `skipHistory` so the
 * document's own version list is not flooded by keystrokes.
 */
function useOwnDocEditor(context: ScreenContext, record: Rec | undefined): DocEditor {
  const actor = useMemo<EditActor>(() => ({ author: context.actor, at: context.now.toISOString() }), [context.actor, context.now]);

  const [model, setModel] = useState<DocModel>(() => readDoc(record?.body, context.actor, context.now.toISOString()));
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const [selection, setSelectionState] = useState<DocRange | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(record?.updatedAt);
  const [conflict, setConflict] = useState<{ theirs: DocModel; at: string } | undefined>();

  const recordId = record?.id;
  const baseRevision = useRef<number>(record?.revision ?? 0);
  const loadedFor = useRef<string | undefined>(undefined);
  const pending = useRef<DocModel | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  // Load a different record, or pick up a change that did not come from here.
  useEffect(() => {
    if (!record) return;
    if (loadedFor.current === record.id && dirty.current) {
      if (record.revision > baseRevision.current + 1) {
        setConflict({ theirs: readDoc(record.body, context.actor, context.now.toISOString()), at: record.updatedAt });
        setSaveState("conflict");
      }
      return;
    }
    if (loadedFor.current === record.id && record.revision === baseRevision.current) return;
    loadedFor.current = record.id;
    baseRevision.current = record.revision;
    if (!dirty.current) {
      setModel(readDoc(record.body, context.actor, context.now.toISOString()));
      setLastSavedAt(record.updatedAt);
    }
  }, [record, context.actor, context.now]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || !recordId) return;
    pending.current = null;
    setSaveState("saving");
    const result = await context.mutate.patch(
      recordId,
      { body: next, summary: record?.summary ?? "", status: record?.status ?? "draft" },
      { expectRevision: baseRevision.current, skipHistory: true },
    );
    if (!result) {
      setSaveState("conflict");
      setConflict({ theirs: readDoc(record?.body, context.actor, context.now.toISOString()), at: record?.updatedAt ?? "" });
      return;
    }
    baseRevision.current = result.revision;
    dirty.current = false;
    setLastSavedAt(result.updatedAt);
    setSaveState("saved");
  }, [context, recordId, record?.summary, record?.status, record?.body, record?.updatedAt]);

  const schedule = useCallback((next: DocModel) => {
    pending.current = next;
    dirty.current = true;
    setSaveState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush]);

  const commit = useCallback((next: DocModel, label: string, nextSelection?: DocRange | null, coalesce = false) => {
    setHistory((current) => {
      const entry: HistoryEntry = { model, selection: selection ?? collapsed({ blockId: model.blocks[0]?.id ?? "", offset: 0 }), label, at: Date.now() };
      const last = current.past[current.past.length - 1];
      if (coalesce && last && last.label === label && entry.at - last.at < 700) return { past: current.past, future: [] };
      return { past: [...current.past.slice(-80), entry], future: [] };
    });
    setModel(next);
    if (nextSelection !== undefined) {
      setSelectionState(nextSelection);
      if (nextSelection) setRestoreToken((value) => value + 1);
    }
    schedule(next);
  }, [model, selection, schedule]);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;
      setModel(previous.model);
      setSelectionState(previous.selection);
      setRestoreToken((value) => value + 1);
      schedule(previous.model);
      return {
        past: current.past.slice(0, -1),
        future: [...current.future, { model, selection: selection ?? previous.selection, label: previous.label, at: previous.at }],
      };
    });
  }, [model, selection, schedule]);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[current.future.length - 1];
      if (!next) return current;
      setModel(next.model);
      setSelectionState(next.selection);
      setRestoreToken((value) => value + 1);
      schedule(next.model);
      return {
        past: [...current.past, { model, selection: selection ?? next.selection, label: next.label, at: next.at }],
        future: current.future.slice(0, -1),
      };
    });
  }, [model, selection, schedule]);

  const saveNow = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!pending.current) {
      if (saveState === "dirty") pending.current = model;
      else return;
    }
    await flush();
  }, [flush, model, saveState]);

  const moveCaret = useCallback((range: DocRange) => {
    setSelectionState(range);
    setRestoreToken((value) => value + 1);
  }, []);

  const handleEdit = useCallback((intent: EditIntent, hooks?: EditHooks) => {
    switch (intent.kind) {
      case "insertText": {
        const lines = intent.text.split(/\r?\n/);
        let result = insertText(model, intent.range, lines[0], actor);
        for (const line of lines.slice(1)) {
          const split = splitBlock(result.model, result.selection, actor);
          result = insertText(split.model, split.selection, line, actor);
        }
        commit(result.model, "Typing", result.selection, lines.length === 1 && intent.text.length === 1);
        return;
      }
      case "splitBlock": {
        const result = splitBlock(model, intent.range, actor);
        commit(result.model, "New block", result.selection);
        return;
      }
      case "deleteRange": {
        const result = deleteRange(model, intent.range, actor);
        commit(result.model, "Delete", result.selection);
        return;
      }
      case "deleteBackward": {
        const index = blockIndex(model, intent.position.blockId);
        if (index < 0) return;
        if (intent.position.offset > 0) {
          const result = deleteRange(model, {
            anchor: { blockId: intent.position.blockId, offset: intent.position.offset - 1 },
            head: intent.position,
          }, actor);
          commit(result.model, "Delete", result.selection, true);
          return;
        }
        const result = mergeBackwards(model, intent.position);
        if (result.model === model) return;
        commit(result.model, "Join blocks", result.selection);
        return;
      }
      case "deleteForward": {
        const index = blockIndex(model, intent.position.blockId);
        if (index < 0) return;
        const block = model.blocks[index];
        const length = blockText(block).length;
        if (intent.position.offset < length) {
          const result = deleteRange(model, {
            anchor: intent.position,
            head: { blockId: intent.position.blockId, offset: intent.position.offset + 1 },
          }, actor);
          commit(result.model, "Delete", result.selection, true);
          return;
        }
        const next = model.blocks[index + 1];
        if (!next) return;
        const result = mergeBackwards(model, { blockId: next.id, offset: 0 });
        if (result.model === model) return;
        commit(result.model, "Join blocks", result.selection);
        return;
      }
      case "deleteWordBackward": {
        const position = orderedRange(model, intent.range).from;
        const index = blockIndex(model, position.blockId);
        if (index < 0) return;
        const block = model.blocks[index];
        if (!isTextBlock(block)) return;
        const text = blockText(block).slice(0, position.offset);
        const match = /[^\s]*\s*$/.exec(text);
        const removed = match ? match[0].length : 0;
        if (removed === 0) {
          const result = mergeBackwards(model, position);
          if (result.model !== model) commit(result.model, "Join blocks", result.selection);
          return;
        }
        const result = deleteRange(model, {
          anchor: { blockId: position.blockId, offset: position.offset - removed },
          head: position,
        }, actor);
        commit(result.model, "Delete word", result.selection);
        return;
      }
      case "indent": {
        const result = indentBlock(model, intent.position);
        commit(result.model, "Indent", result.selection);
        return;
      }
      case "outdent": {
        const result = outdentBlock(model, intent.position);
        commit(result.model, "Outdent", result.selection);
        return;
      }
      case "toggleMark": {
        const result = toggleMark(model, intent.range, intent.mark);
        if (result.model === model) return;
        commit(result.model, `Format ${intent.mark}`, result.selection);
        return;
      }
      case "setHeading": {
        const type = intent.level === 0 ? "paragraph" : (`heading${intent.level}` as const);
        const result = setBlockType(model, intent.range, type);
        commit(result.model, "Block type", result.selection);
        return;
      }
      case "undo": undo(); return;
      case "redo": redo(); return;
      case "requestLink": hooks?.onRequestLink?.(intent.range); return;
      case "requestFind": hooks?.onRequestFind?.(); return;
      case "requestSave": void saveNow(); return;
      default: return;
    }
  }, [model, actor, commit, undo, redo, saveNow]);

  const resolveConflict = useCallback(async (keep: "mine" | "theirs") => {
    if (!conflict || !recordId) return;
    if (keep === "theirs") {
      setModel(conflict.theirs);
      dirty.current = false;
      pending.current = null;
      baseRevision.current = record?.revision ?? baseRevision.current;
      setConflict(undefined);
      setSaveState("clean");
      return;
    }
    const result = await context.mutate.patch(recordId, { body: model }, { event: "Autosave conflict resolved by keeping this editor's version" });
    if (result) {
      baseRevision.current = result.revision;
      dirty.current = false;
      pending.current = null;
      setLastSavedAt(result.updatedAt);
      setConflict(undefined);
      setSaveState("saved");
    }
  }, [conflict, recordId, context, model, record?.revision]);

  const recoverToVersion = useCallback(async () => {
    if (!recordId || !record) return;
    const created = await context.mutate.create({
      collection: "documents",
      title: `${record.title} — recovered ${context.dateTime(context.now)}`,
      status: "draft",
      summary: "Recovered from an autosave conflict. Nothing was overwritten.",
      parentId: recordId,
      tags: ["recovered"],
      fields: { recoveredFrom: recordId, kind: "recovery" },
      body: model,
    }, `Recovery version created from ${record.title}`);
    context.toast("Recovery version created", `${created.title} holds this editor's text. The shared document was left as the other save made it.`);
    setConflict(undefined);
    dirty.current = false;
    pending.current = null;
    setSaveState("clean");
    setModel(readDoc(record.body, context.actor, context.now.toISOString()));
  }, [recordId, record, context, model]);

  const marks = useMemo(() => (selection ? activeMarks(model, selection) : []), [model, selection]);

  return {
    model, selection, restoreToken, saveState, lastSavedAt,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.past[history.past.length - 1]?.label,
    marks,
    commit,
    setSelection: setSelectionState,
    moveCaret,
    undo, redo, saveNow, handleEdit,
    actor,
    conflict,
    resolveConflict,
    recoverToVersion,
  };
}

export const SAVE_LABEL: Record<SaveState, string> = {
  clean: "No unsaved changes",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Save conflict",
  error: "Save failed",
};

export const SAVE_TONE: Record<SaveState, "neutral" | "warning" | "success" | "danger" | "info"> = {
  clean: "neutral", dirty: "warning", saving: "info", saved: "success", conflict: "danger", error: "danger",
};

const SHARED = shareEditor<DocEditor & { record?: Rec }>(useOwnDocEditor, (editor) => [editor.model, editor.selection, editor.saveState, editor.canUndo, editor.canRedo, editor.conflict, editor.restoreToken]);

/** Open a document for editing; components that open the same document share one editor. */
export const useDocEditor: (context: ScreenContext, record: Rec | undefined) => DocEditor = SHARED.useShared;

/** The editor that owns a document while it is open, for screen actions. */
export const activeDocEditor: (id: string | undefined) => DocEditor | undefined = SHARED.active;
