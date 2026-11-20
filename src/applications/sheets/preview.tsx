import { Button, Pill } from "@/design-system";
import { createStore, useStore } from "@/applications/visual/kit";
import { evaluate, replaceSheet, type Sheet } from "./model";
import type { WorkbookEditor } from "./state";

/* ====================================================================== *
 * Change preview. A range edit that would overwrite more than a cell's
 * worth of existing content (clear, paste, fill, sort) is shown as a diff
 * first, inline above the grid, and only written when the person applies
 * it. Nothing here blocks the grid and nothing is written until Apply.
 * ====================================================================== */

export interface ChangeLine { address: string; before: string; after: string }
export interface ChangeDiff {
  changes: ChangeLine[];
  overwritten: number;
  formulasReplaced: number;
  errorsBefore: number;
  errorsAfter: number;
}
export interface PendingChange { id: number; label: string; next: Sheet; diff: ChangeDiff; editorKey: string }

export const pendingChange = createStore<PendingChange | null>(null);
let counter = 0;

export function diffSheets(editor: WorkbookEditor, next: Sheet): ChangeDiff {
  const prev = editor.sheet;
  const keys = new Set([...Object.keys(prev.cells), ...Object.keys(next.cells)]);
  const changes: ChangeLine[] = [];
  let overwritten = 0;
  let formulasReplaced = 0;
  for (const address of keys) {
    const before = prev.cells[address] ?? "";
    const after = next.cells[address] ?? "";
    if (before === after) continue;
    changes.push({ address, before, after });
    if (before !== "") overwritten += 1;
    if (before.startsWith("=")) formulasReplaced += 1;
  }
  changes.sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }));
  const after = evaluate(replaceSheet(editor.workbook, next), editor.recalculatedAt);
  return { changes, overwritten, formulasReplaced, errorsBefore: editor.evaluation.errors.length, errorsAfter: after.errors.length };
}

/** A change is previewed when it overwrites several existing values or replaces a formula as part of a range edit. */
export function needsPreview(diff: ChangeDiff): boolean {
  return diff.overwritten >= 2 || (diff.formulasReplaced >= 1 && diff.changes.length >= 2) || diff.errorsAfter > diff.errorsBefore;
}

/** Commit straight away when the change is small; otherwise hold it for review. Returns true if it was committed. */
export function proposeChange(editor: WorkbookEditor, next: Sheet, label: string, editorKey: string, force = false): boolean {
  const diff = diffSheets(editor, next);
  if (diff.changes.length === 0) return true;
  if (!force && !needsPreview(diff)) { editor.commitSheet(next, label); return true; }
  counter += 1;
  pendingChange.set({ id: counter, label, next, diff, editorKey });
  return false;
}

const show = (value: string) => (value === "" ? "empty" : value.length > 28 ? `${value.slice(0, 27)}…` : value);

export function ChangePreview({ editor, editorKey }: { editor: WorkbookEditor; editorKey: string }) {
  const pending = useStore(pendingChange);
  if (!pending || pending.editorKey !== editorKey) return null;
  const { diff } = pending;
  const stale = pending.next.id !== editor.sheet.id;
  const apply = () => { editor.commitSheet(pending.next, pending.label); pendingChange.set(null); };
  return (
    <section className="sx-preview" aria-label="Change preview" role="region">
      <div className="sx-preview-head">
        <strong>{pending.label}</strong>
        <span className="sx-preview-counts">
          <Pill tone="warning">{diff.changes.length} cell{diff.changes.length === 1 ? "" : "s"} change</Pill>
          {diff.overwritten > 0 && <Pill tone="neutral">{diff.overwritten} existing value{diff.overwritten === 1 ? "" : "s"} replaced</Pill>}
          {diff.formulasReplaced > 0 && <Pill tone="danger">{diff.formulasReplaced} formula{diff.formulasReplaced === 1 ? "" : "s"} replaced</Pill>}
          {diff.errorsAfter > diff.errorsBefore && <Pill tone="danger">{diff.errorsAfter - diff.errorsBefore} new calculation error{diff.errorsAfter - diff.errorsBefore === 1 ? "" : "s"}</Pill>}
        </span>
        <span className="ds-grow" />
        <Button size="sm" variant="primary" disabled={stale} onClick={apply}>Apply to {diff.changes.length} cell{diff.changes.length === 1 ? "" : "s"}</Button>
        <Button size="sm" variant="ghost" onClick={() => pendingChange.set(null)}>Cancel</Button>
      </div>
      <ul className="sx-preview-list">
        {diff.changes.slice(0, 6).map((line) => (
          <li key={line.address}>
            <code className="sx-preview-addr">{line.address}</code>
            <span className="sx-preview-before">{show(line.before)}</span>
            <span aria-hidden="true">→</span>
            <span className="sx-preview-after">{show(line.after)}</span>
          </li>
        ))}
        {diff.changes.length > 6 && <li className="sx-preview-more">and {diff.changes.length - 6} more</li>}
      </ul>
    </section>
  );
}
