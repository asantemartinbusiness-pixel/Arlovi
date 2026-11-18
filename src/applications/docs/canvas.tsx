import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode,
} from "react";
import {
  blockText, collapsed, isTextBlock, outline, runPrefixLength,
  type Block, type DocComment, type DocModel, type DocPosition, type DocRange, type Hit, type InlineRun, type MarkType,
  type TableEdit,
} from "./model";
import { Button } from "@/design-system";

/* ====================================================================== *
 * The editing surface.
 *
 * One contentEditable root renders the model. Every `beforeinput` is
 * cancelled and translated into a model command, so the DOM never becomes
 * the source of truth and `document.execCommand` is never called. Selection
 * is mapped both ways through `data-bid` / `data-run` markers.
 * ====================================================================== */

export type EditIntent =
  | { kind: "insertText"; text: string; range: DocRange }
  | { kind: "splitBlock"; range: DocRange }
  | { kind: "deleteRange"; range: DocRange }
  | { kind: "deleteBackward"; position: DocPosition }
  | { kind: "deleteForward"; position: DocPosition }
  | { kind: "deleteWordBackward"; range: DocRange }
  | { kind: "indent"; position: DocPosition }
  | { kind: "outdent"; position: DocPosition }
  | { kind: "toggleMark"; mark: MarkType; range: DocRange }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "requestLink"; range: DocRange }
  | { kind: "requestFind" }
  | { kind: "requestSave" }
  | { kind: "setHeading"; level: 0 | 1 | 2 | 3; range: DocRange };

/* ----------------------------- Mapping ----------------------------- */

function blockElement(root: HTMLElement, blockId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-bid="${CSS.escape(blockId)}"]`);
}

export function domToModel(root: HTMLElement, node: Node | null, offset: number, model: DocModel): DocPosition | null {
  if (!node || !root.contains(node)) return null;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  if (!element) return null;
  const leaf = element.closest<HTMLElement>("[data-run]");
  if (leaf) {
    const host = leaf.closest<HTMLElement>("[data-bid]");
    const blockId = host?.dataset.bid;
    if (!blockId) return null;
    const block = model.blocks.find((item) => item.id === blockId);
    if (!block) return null;
    const runIndex = Number(leaf.dataset.run ?? 0);
    const inner = node.nodeType === Node.TEXT_NODE
      ? Math.min(offset, (node.textContent ?? "").length)
      : offset > 0 ? (leaf.textContent ?? "").length : 0;
    // An empty block renders one zero-width placeholder leaf, so clamp to the
    // block's real length rather than trusting the DOM character count.
    const limit = blockText(block).length;
    return { blockId, offset: Math.min(limit, runPrefixLength(block, runIndex) + inner) };
  }
  const host = element.closest<HTMLElement>("[data-bid]");
  const blockId = host?.dataset.bid;
  if (!blockId) return null;
  const block = model.blocks.find((item) => item.id === blockId);
  if (!block) return null;
  const length = blockText(block).length;
  if (!isTextBlock(block)) return { blockId, offset: 0 };
  return { blockId, offset: offset > 0 ? length : 0 };
}

export function readSelection(root: HTMLElement, model: DocModel): DocRange | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = domToModel(root, selection.anchorNode, selection.anchorOffset, model);
  const head = domToModel(root, selection.focusNode, selection.focusOffset, model);
  if (!anchor || !head) return null;
  return { anchor, head };
}

function modelToDom(root: HTMLElement, model: DocModel, position: DocPosition): { node: Node; offset: number } | null {
  const host = blockElement(root, position.blockId);
  if (!host) return null;
  const block = model.blocks.find((item) => item.id === position.blockId);
  if (!block || !isTextBlock(block)) return { node: host, offset: 0 };
  const leaves = [...host.querySelectorAll<HTMLElement>("[data-run]")];
  if (leaves.length === 0) return { node: host, offset: 0 };
  let prefix = 0;
  for (const leaf of leaves) {
    const runIndex = Number(leaf.dataset.run ?? 0);
    const length = block.runs[runIndex]?.text.length ?? (leaf.textContent ?? "").length;
    if (position.offset <= prefix + length) {
      const text = leaf.firstChild;
      if (text && text.nodeType === Node.TEXT_NODE) return { node: text, offset: Math.max(0, position.offset - prefix) };
      return { node: leaf, offset: 0 };
    }
    prefix += length;
  }
  const last = leaves[leaves.length - 1];
  const text = last.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) return { node: text, offset: (text.textContent ?? "").length };
  return { node: last, offset: 0 };
}

export function writeSelection(root: HTMLElement, model: DocModel, range: DocRange): void {
  const anchor = modelToDom(root, model, range.anchor);
  const head = modelToDom(root, model, range.head);
  if (!anchor || !head) return;
  const selection = root.ownerDocument.getSelection();
  if (!selection) return;
  // A Range collapses when its end precedes its start, which would destroy
  // every backward selection (Shift+ArrowLeft). setBaseAndExtent keeps the
  // direction, so extending leftwards survives the caret restore.
  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    return;
  } catch {
    /* fall through to a forward range below */
  }
  const domRange = root.ownerDocument.createRange();
  try {
    domRange.setStart(anchor.node, anchor.offset);
    domRange.setEnd(head.node, head.offset);
  } catch {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(domRange);
}

/* ----------------------------- Rendering ----------------------------- */

const MARK_CLASS: Record<MarkType, string> = {
  bold: "dx-bold", italic: "dx-italic", underline: "dx-underline", strike: "dx-strike", code: "dx-code",
};

function runClassName(run: InlineRun): string {
  const classes = ["dx-run", ...run.marks.map((mark) => MARK_CLASS[mark])];
  if (run.link) classes.push("dx-link");
  if (run.suggestion?.kind === "insert") classes.push("dx-sg-insert");
  if (run.suggestion?.kind === "delete") classes.push("dx-sg-delete");
  return classes.join(" ");
}

function RunSpans({ block, hits, comments, activeCommentId }: { block: Block; hits: Hit[]; comments: DocComment[]; activeCommentId?: string }) {
  if (block.runs.length === 0) return <span className="dx-run dx-empty" data-run={0}>{"​"}</span>;
  const marks: { start: number; end: number; commentId: string }[] = comments
    .filter((comment) => comment.anchor.blockId === block.id && !comment.resolved)
    .map((comment) => ({ start: comment.anchor.start, end: comment.anchor.end, commentId: comment.id }));
  const found = hits.filter((hit) => hit.blockId === block.id);
  let cursor = 0;
  return (
    <>
      {block.runs.map((run, index) => {
        const start = cursor;
        cursor += run.text.length;
        const commented = marks.find((mark) => start < mark.end && cursor > mark.start);
        const matched = found.some((hit) => start < hit.end && cursor > hit.start);
        const classes = [runClassName(run)];
        if (commented) classes.push(commented.commentId === activeCommentId ? "dx-commented dx-commented-active" : "dx-commented");
        if (matched) classes.push("dx-hit");
        return (
          <span
            key={index}
            className={classes.join(" ")}
            data-run={index}
            data-comment={commented?.commentId}
            title={run.link ? `Link to ${run.link}` : undefined}
          >{run.text}</span>
        );
      })}
    </>
  );
}

const BLOCK_TAG: Record<string, keyof HTMLElementTagNameMap> = {
  paragraph: "p", heading1: "h1", heading2: "h2", heading3: "h3",
  bulletItem: "li", numberItem: "li", quote: "blockquote", code: "pre",
};

export interface CanvasProps {
  model: DocModel;
  readOnly?: boolean;
  showSuggestions: boolean;
  hits: Hit[];
  activeCommentId?: string;
  focusBlockId?: string;
  onEdit: (intent: EditIntent) => void;
  onSelection: (range: DocRange | null) => void;
  onCommentClick?: (commentId: string) => void;
  onTableCell?: (blockId: string, row: number, col: number, value: string) => void;
  /** Add or remove rows and columns of a table block. */
  onTableEdit?: (blockId: string, edit: TableEdit) => void;
  onBlockClick?: (blockId: string) => void;
  /** Incremented by the owner to force the caret back to `selection`. */
  restoreToken: number;
  selection: DocRange | null;
  style?: CSSProperties;
  pageWidth?: number;
  children?: ReactNode;
}

export function DocumentCanvas({
  model, readOnly, showSuggestions, hits, activeCommentId, focusBlockId,
  onEdit, onSelection, onCommentClick, onTableCell, onTableEdit, onBlockClick, restoreToken, selection, style, pageWidth, children,
}: CanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  /* The table cell that last had focus: row and column commands act on it. */
  const [tableCell, setTableCell] = useState<{ blockId: string; row: number; col: number } | null>(null);
  const focusCell = (blockId: string, row: number, col: number) => {
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLInputElement>(`[data-bid="${blockId}"] input[data-cell="${row}:${col}"]`)?.focus();
    });
  };
  const modelRef = useRef(model);
  const selectionRef = useRef(selection);
  modelRef.current = model;
  selectionRef.current = selection;

  const styleById = useMemo(() => new Map(model.styles.map((item) => [item.id, item])), [model.styles]);

  const currentRange = useCallback((): DocRange => {
    const root = rootRef.current;
    const read = root ? readSelection(root, modelRef.current) : null;
    if (read) return read;
    const fallback = selectionRef.current;
    if (fallback) return fallback;
    const first = modelRef.current.blocks[0];
    return collapsed({ blockId: first?.id ?? "", offset: 0 });
  }, []);

  /* Selection tracking -------------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const document_ = root.ownerDocument;
    function onSelectionChange() {
      const active = document_.getSelection();
      if (!active || active.rangeCount === 0) return;
      if (!root || !root.contains(active.anchorNode)) return;
      onSelection(readSelection(root, modelRef.current));
    }
    document_.addEventListener("selectionchange", onSelectionChange);
    return () => document_.removeEventListener("selectionchange", onSelectionChange);
  }, [onSelection]);

  /* Input interception -------------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || readOnly) return;

    function onBeforeInput(event: InputEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const type = event.inputType;
      const range = currentRange();
      const collapsedNow = range.anchor.blockId === range.head.blockId && range.anchor.offset === range.head.offset;
      if (type === "insertParagraph" || type === "insertLineBreak") {
        event.preventDefault();
        onEdit({ kind: "splitBlock", range });
        return;
      }
      if (type.startsWith("insert")) {
        const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
        if (!text) { event.preventDefault(); return; }
        event.preventDefault();
        onEdit({ kind: "insertText", text, range });
        return;
      }
      if (type === "deleteWordBackward" && collapsedNow) {
        event.preventDefault();
        onEdit({ kind: "deleteWordBackward", range });
        return;
      }
      if (type.startsWith("delete")) {
        event.preventDefault();
        if (!collapsedNow) { onEdit({ kind: "deleteRange", range }); return; }
        if (type === "deleteContentForward" || type === "deleteWordForward") onEdit({ kind: "deleteForward", position: range.head });
        else onEdit({ kind: "deleteBackward", position: range.head });
        return;
      }
      if (type === "historyUndo") { event.preventDefault(); onEdit({ kind: "undo" }); return; }
      if (type === "historyRedo") { event.preventDefault(); onEdit({ kind: "redo" }); return; }
      if (type.startsWith("format")) event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const meta = event.metaKey || event.ctrlKey;
      const range = currentRange();
      if (event.key === "Tab" && !meta) {
        event.preventDefault();
        onEdit(event.shiftKey ? { kind: "outdent", position: range.head } : { kind: "indent", position: range.head });
        return;
      }
      if (!meta) return;
      const key = event.key.toLowerCase();
      // Cmd/Ctrl+K belongs to the global command palette and is left alone.
      if (key === "k") return;
      if (key === "b" && !event.shiftKey) { event.preventDefault(); onEdit({ kind: "toggleMark", mark: "bold", range }); return; }
      if (key === "i" && !event.shiftKey) { event.preventDefault(); onEdit({ kind: "toggleMark", mark: "italic", range }); return; }
      if (key === "u" && !event.shiftKey) { event.preventDefault(); onEdit({ kind: "toggleMark", mark: "underline", range }); return; }
      if (key === "e" && !event.shiftKey) { event.preventDefault(); onEdit({ kind: "toggleMark", mark: "code", range }); return; }
      if (key === "x" && event.shiftKey) { event.preventDefault(); onEdit({ kind: "toggleMark", mark: "strike", range }); return; }
      if (key === "l" && event.shiftKey) { event.preventDefault(); onEdit({ kind: "requestLink", range }); return; }
      if (key === "f") { event.preventDefault(); onEdit({ kind: "requestFind" }); return; }
      if (key === "s") { event.preventDefault(); onEdit({ kind: "requestSave" }); return; }
      if (key === "z") {
        event.preventDefault();
        onEdit(event.shiftKey ? { kind: "redo" } : { kind: "undo" });
        return;
      }
      if (event.altKey && ["0", "1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        onEdit({ kind: "setHeading", level: Number(event.key) as 0 | 1 | 2 | 3, range });
      }
    }

    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      onEdit({ kind: "insertText", text, range: currentRange() });
    }

    function onDrop(event: DragEvent) { event.preventDefault(); }

    root.addEventListener("beforeinput", onBeforeInput as EventListener);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("paste", onPaste as EventListener);
    root.addEventListener("drop", onDrop);
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput as EventListener);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste as EventListener);
      root.removeEventListener("drop", onDrop);
    };
  }, [currentRange, onEdit, readOnly]);

  /* Caret restoration --------------------------------------------------- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || readOnly || !selection || restoreToken === 0) return;
    /* A table cell being typed in keeps its focus; restoring the document
       caret here would pull every keystroke after the first out of the cell. */
    const active = root.ownerDocument.activeElement;
    if (active instanceof HTMLElement && root.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    writeSelection(root, model, selection);
  }, [restoreToken, readOnly, selection, model]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !focusBlockId) return;
    const host = blockElement(root, focusBlockId);
    host?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusBlockId]);

  const nodes: ReactNode[] = [];
  let listBuffer: ReactNode[] = [];
  let listKind: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listKind) return;
    const Tag = listKind;
    nodes.push(<Tag key={`list-${nodes.length}`} className="dx-list">{listBuffer}</Tag>);
    listBuffer = [];
    listKind = null;
  };

  for (const block of model.blocks) {
    const style = block.styleId ? styleById.get(block.styleId) : undefined;
    const inlineStyle: CSSProperties = style
      ? {
        fontSize: style.fontSize, fontWeight: style.weight, marginBlockStart: style.spaceBefore,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}em` : undefined,
        color: style.colour === "muted" ? "var(--fg-muted)" : undefined,
      }
      : {};

    if (block.type === "bulletItem" || block.type === "numberItem") {
      const wanted = block.type === "bulletItem" ? "ul" : "ol";
      if (listKind !== wanted) { flushList(); listKind = wanted; }
      listBuffer.push(
        <li
          key={block.id}
          data-bid={block.id}
          className="dx-block dx-item"
          style={{ ...inlineStyle, marginInlineStart: (block.indent ?? 0) * 24 }}
        ><RunSpans block={block} hits={hits} comments={model.comments} activeCommentId={activeCommentId} /></li>,
      );
      continue;
    }
    flushList();

    if (block.type === "pageBreak") {
      nodes.push(
        <div key={block.id} data-bid={block.id} className="dx-block dx-pagebreak" contentEditable={false} role="separator" aria-label="Page break">
          <span>Page break</span>
        </div>,
      );
      continue;
    }
    if (block.type === "image") {
      nodes.push(
        <figure key={block.id} data-bid={block.id} className="dx-block dx-figure" contentEditable={false}>
          <button type="button" className="dx-image-frame" style={{ width: `${block.image?.widthPercent ?? 100}%` }} onClick={() => onBlockClick?.(block.id)}>
            <span className="dx-image-id">{block.image?.assetId ?? "No asset referenced"}</span>
            <span className="dx-image-alt">{block.image?.alt || "No alternative text yet"}</span>
          </button>
          <figcaption>{block.image?.caption || "Click the frame to set the asset, caption and alternative text."}</figcaption>
        </figure>,
      );
      continue;
    }
    if (block.type === "table") {
      const rows = block.table?.rows ?? [];
      const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
      const focused = tableCell?.blockId === block.id ? tableCell : null;
      const tableId = block.id;
      const cellInput = (cell: string, row: number, col: number, label: string) => (
        <input
          aria-label={label}
          data-cell={`${row}:${col}`}
          value={cell}
          readOnly={readOnly}
          onFocus={() => setTableCell({ blockId: tableId, row, col })}
          onChange={(event) => onTableCell?.(tableId, row, col, event.target.value)}
          onKeyDown={(event) => {
            /* Tab from the last cell adds a row, as word processors do. */
            if (readOnly || !onTableEdit || event.key !== "Tab" || event.shiftKey) return;
            if (row === rows.length - 1 && col === width - 1) {
              event.preventDefault();
              onTableEdit(tableId, { kind: "addRow", after: row });
              focusCell(tableId, row + 1, 0);
            }
          }}
        />
      );
      nodes.push(
        <div key={block.id} data-bid={block.id} className="dx-block dx-tablewrap" contentEditable={false}>
          <table className="dx-table">
            {block.table?.header && rows[0] && (
              <thead><tr>{rows[0].map((cell, col) => (
                <th key={col} scope="col">{cellInput(cell, 0, col, `Column ${col + 1} heading`)}</th>
              ))}</tr></thead>
            )}
            <tbody>
              {(block.table?.header ? rows.slice(1) : rows).map((row, rowIndex) => {
                const actual = block.table?.header ? rowIndex + 1 : rowIndex;
                return (
                  <tr key={actual}>
                    {row.map((cell, col) => (
                      <td key={col}>{cellInput(cell, actual, col, `Row ${actual + 1} column ${col + 1}`)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!readOnly && onTableEdit && (
            <div className="dx-table-tools" role="toolbar" aria-label={`Table ${rows.length} by ${width}`}>
              <span className="dx-table-where">{focused ? `Row ${focused.row + 1}, column ${focused.col + 1}` : `${rows.length} × ${width}`}</span>
              <Button size="sm" variant="ghost" onClick={() => { const after = focused?.row ?? rows.length - 1; onTableEdit(tableId, { kind: "addRow", after }); focusCell(tableId, after + 1, focused?.col ?? 0); }}>Add row</Button>
              <Button size="sm" variant="ghost" onClick={() => { const after = focused?.col ?? width - 1; onTableEdit(tableId, { kind: "addColumn", after }); focusCell(tableId, focused?.row ?? 0, after + 1); }}>Add column</Button>
              <Button size="sm" variant="ghost" disabled={rows.length <= (block.table?.header ? 2 : 1)} onClick={() => { onTableEdit(tableId, { kind: "removeRow", at: focused?.row ?? rows.length - 1 }); setTableCell(null); }}>Remove row</Button>
              <Button size="sm" variant="ghost" disabled={width <= 1} onClick={() => { onTableEdit(tableId, { kind: "removeColumn", at: focused?.col ?? width - 1 }); setTableCell(null); }}>Remove column</Button>
            </div>
          )}
        </div>,
      );
      continue;
    }

    const Tag = BLOCK_TAG[block.type] ?? "p";
    nodes.push(
      <Tag
        key={block.id}
        data-bid={block.id}
        className={`dx-block dx-${block.type}`}
        style={{ ...inlineStyle, marginInlineStart: (block.indent ?? 0) * 24 }}
      ><RunSpans block={block} hits={hits} comments={model.comments} activeCommentId={activeCommentId} /></Tag>,
    );
  }
  flushList();

  return (
    <div className="dx-page-outer" style={style}>
      {children}
      <div
        ref={rootRef}
        className={`dx-page${showSuggestions ? "" : " dx-hide-suggestions"}`}
        style={{ maxWidth: pageWidth ?? 820, columnCount: model.page.columns === 2 ? 2 : undefined }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label="Document body"
        tabIndex={0}
        onClick={(event) => {
          const element = (event.target as HTMLElement).closest<HTMLElement>("[data-comment]");
          if (element?.dataset.comment) onCommentClick?.(element.dataset.comment);
        }}
      >
        {nodes}
      </div>
    </div>
  );
}

/** Reading-order outline used by the navigation panel and the host page. */
export function useOutline(model: DocModel) {
  return useMemo(() => outline(model), [model]);
}
