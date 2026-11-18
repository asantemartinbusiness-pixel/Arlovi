import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { boxLabel, cellAddress, columnName, FUNCTION_HELP, parseAddress, type CellResult, type RangeBox } from "./engine";
import {
  applySuggestion, displayValue, edgeJump, formulaWantsReference, functionSuggestions, usedBox,
  type CellStyle, type FormatContext, type Sheet,
} from "./model";

/** Keyboard commands the grid hands back to the editor that owns the workbook. */
export type GridShortcut = "undo" | "redo" | "fillDown" | "fillRight" | "bold" | "italic";

const FUNCTION_NAMES = FUNCTION_HELP.map((item) => item.name);

/* ====================================================================== *
 * Virtualised worksheet grid.
 *
 * Replaces audit finding A12's six hardcoded columns. The grid addresses the
 * sheet's full extent (64 columns × 1000 rows by default), renders only the
 * cells inside the viewport, and keeps four panes so a frozen row or column
 * stays put while the rest scrolls.
 * ====================================================================== */

export const ROW_H = 26;
export const DEFAULT_COL_W = 104;
export const HEADER_H = 26;
export const ROWHEAD_W = 54;

export interface GridSelection {
  /** The cell that receives typing. */
  active: { col: number; row: number };
  /** The rectangle the selection covers; equals the active cell when single. */
  box: RangeBox;
}

export function singleSelection(col: number, row: number): GridSelection {
  return { active: { col, row }, box: { fromCol: col, fromRow: row, toCol: col, toRow: row } };
}

export function extendSelection(selection: GridSelection, col: number, row: number): GridSelection {
  return {
    active: selection.active,
    box: {
      fromCol: Math.min(selection.active.col, col),
      fromRow: Math.min(selection.active.row, row),
      toCol: Math.max(selection.active.col, col),
      toRow: Math.max(selection.active.row, row),
    },
  };
}

export interface SheetGridProps {
  sheet: Sheet;
  values: Record<string, CellResult>;
  format: FormatContext;
  selection: GridSelection;
  onSelectionChange: (selection: GridSelection) => void;
  onCommit: (address: string, raw: string) => void;
  onClear: (box: RangeBox) => void;
  onPaste: (text: string, col: number, row: number) => void;
  onCopy: (box: RangeBox) => string;
  hiddenRows?: Set<number>;
  comments?: { address: string; resolved: boolean }[];
  protectedAddresses?: Set<string>;
  readOnly?: boolean;
  /** Addresses highlighted as the precedents of the inspected formula. */
  highlighted?: Set<string>;
  height?: number;
  /** Raised when the editor should start from the formula bar. */
  editRequest?: { address: string; initial: string; token: number };
  /** Ctrl/⌘ shortcuts: undo, redo, fill down (D), fill right (R), bold (B), italic (I). */
  onShortcut?: (action: GridShortcut, box: RangeBox) => void;
}

function columnWidth(sheet: Sheet, col: number): number {
  return sheet.colWidths[String(col)] ?? DEFAULT_COL_W;
}

function columnOffsets(sheet: Sheet): number[] {
  const offsets = [0];
  for (let col = 0; col < sheet.cols; col += 1) offsets.push(offsets[col] + columnWidth(sheet, col));
  return offsets;
}

export function SheetGrid({
  sheet, values, format, selection, onSelectionChange, onCommit, onClear, onPaste, onCopy,
  hiddenRows, comments, protectedAddresses, readOnly, highlighted, height = 520, editRequest, onShortcut,
}: SheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colHeadRef = useRef<HTMLDivElement>(null);
  const rowHeadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState({ width: 900, height });
  const [editing, setEditing] = useState<{ col: number; row: number; value: string } | null>(null);
  const dragging = useRef(false);
  /* Pointing: while a formula is typed, clicking or dragging over cells writes their reference. */
  const pointing = useRef<{ insertAt: number; from: { col: number; row: number }; dragging: boolean } | null>(null);
  const [suggestion, setSuggestion] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  const offsets = useMemo(() => columnOffsets(sheet), [sheet]);
  const freezeCols = Math.min(sheet.freeze.cols, 6);
  const freezeRows = Math.min(sheet.freeze.rows, 12);
  const frozenWidth = offsets[freezeCols];
  const frozenHeight = freezeRows * ROW_H;

  const scrollWidth = offsets[sheet.cols] - frozenWidth;
  const scrollHeight = (sheet.rows - freezeRows) * ROW_H;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    setViewport({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setScroll({ left: node.scrollLeft, top: node.scrollTop });
    if (colHeadRef.current) colHeadRef.current.scrollLeft = node.scrollLeft;
    if (rowHeadRef.current) rowHeadRef.current.scrollTop = node.scrollTop;
  }, []);

  /* Which cells are inside the viewport ------------------------------- */
  const firstCol = useMemo(() => {
    let col = freezeCols;
    while (col < sheet.cols && offsets[col + 1] - frozenWidth <= scroll.left) col += 1;
    return Math.max(freezeCols, col - 1);
  }, [scroll.left, offsets, sheet.cols, freezeCols, frozenWidth]);

  const lastCol = useMemo(() => {
    let col = firstCol;
    while (col < sheet.cols && offsets[col] - frozenWidth < scroll.left + viewport.width) col += 1;
    return Math.min(sheet.cols - 1, col + 1);
  }, [firstCol, offsets, sheet.cols, scroll.left, viewport.width, frozenWidth]);

  const firstRow = Math.max(freezeRows, Math.floor(scroll.top / ROW_H) - 2 + freezeRows);
  const lastRow = Math.min(sheet.rows - 1, firstRow + Math.ceil(viewport.height / ROW_H) + 4);

  const commentByAddress = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const comment of comments ?? []) map.set(comment.address, comment.resolved);
    return map;
  }, [comments]);

  /* Editing ----------------------------------------------------------- */
  const startEdit = useCallback((col: number, row: number, initial?: string) => {
    if (readOnly) return;
    const address = cellAddress(col, row);
    if (protectedAddresses?.has(address)) return;
    pointing.current = null;
    setEditing({ col, row, value: initial ?? sheet.cells[address] ?? "" });
  }, [readOnly, protectedAddresses, sheet.cells]);

  useEffect(() => {
    if (!editRequest) return;
    const parsed = parseAddress(editRequest.address);
    if (!parsed) return;
    setEditing({ col: parsed.col, row: parsed.row, value: editRequest.initial });
  }, [editRequest]);

  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = useCallback((move: "down" | "right" | "none") => {
    if (!editing) return;
    onCommit(cellAddress(editing.col, editing.row), editing.value);
    setEditing(null);
    if (move === "down") onSelectionChange(singleSelection(editing.col, Math.min(sheet.rows - 1, editing.row + 1)));
    if (move === "right") onSelectionChange(singleSelection(Math.min(sheet.cols - 1, editing.col + 1), editing.row));
    requestAnimationFrame(() => scrollRef.current?.focus());
  }, [editing, onCommit, onSelectionChange, sheet.rows, sheet.cols]);

  /* Scrolling the active cell into view -------------------------------- */
  const scrollIntoView = useCallback((col: number, row: number) => {
    const node = scrollRef.current;
    if (!node) return;
    if (col >= freezeCols) {
      const left = offsets[col] - frozenWidth;
      const right = offsets[col + 1] - frozenWidth;
      if (left < node.scrollLeft) node.scrollLeft = left;
      else if (right > node.scrollLeft + node.clientWidth) node.scrollLeft = right - node.clientWidth;
    }
    if (row >= freezeRows) {
      const top = (row - freezeRows) * ROW_H;
      if (top < node.scrollTop) node.scrollTop = top;
      else if (top + ROW_H > node.scrollTop + node.clientHeight) node.scrollTop = top + ROW_H - node.clientHeight;
    }
  }, [offsets, freezeCols, freezeRows, frozenWidth]);

  const move = useCallback((dCol: number, dRow: number, extend: boolean) => {
    const target = extend
      ? { col: Math.max(0, Math.min(sheet.cols - 1, selection.box.toCol + dCol)), row: Math.max(0, Math.min(sheet.rows - 1, selection.box.toRow + dRow)) }
      : { col: Math.max(0, Math.min(sheet.cols - 1, selection.active.col + dCol)), row: Math.max(0, Math.min(sheet.rows - 1, selection.active.row + dRow)) };
    onSelectionChange(extend ? extendSelection(selection, target.col, target.row) : singleSelection(target.col, target.row));
    scrollIntoView(target.col, target.row);
  }, [selection, sheet.cols, sheet.rows, onSelectionChange, scrollIntoView]);

  /* Ctrl/⌘ + arrow jumps to the edge of the data block, as spreadsheets do. */
  const jump = useCallback((dCol: number, dRow: number, extend: boolean) => {
    const from = extend ? { col: selection.box.toCol, row: selection.box.toRow } : selection.active;
    const target = edgeJump(sheet, from.col, from.row, dCol, dRow);
    onSelectionChange(extend ? extendSelection(selection, target.col, target.row) : singleSelection(target.col, target.row));
    scrollIntoView(target.col, target.row);
  }, [selection, sheet, onSelectionChange, scrollIntoView]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const meta = event.metaKey || event.ctrlKey;
    const { active } = selection;
    if (meta && event.key.toLowerCase() === "k") return;
    if (meta && !event.altKey) {
      const letter = event.key.toLowerCase();
      const command: GridShortcut | undefined = letter === "z" ? (event.shiftKey ? "redo" : "undo")
        : letter === "y" ? "redo"
        : letter === "d" ? "fillDown"
        : letter === "r" ? "fillRight"
        : letter === "b" ? "bold"
        : letter === "i" ? "italic"
        : undefined;
      if (command && onShortcut && (!readOnly || command === "undo" || command === "redo")) {
        event.preventDefault(); event.stopPropagation();
        onShortcut(command, selection.box);
        return;
      }
      if (letter === "a") {
        event.preventDefault(); event.stopPropagation();
        const box = usedBox(sheet);
        onSelectionChange({ active: { col: box.fromCol, row: box.fromRow }, box });
        return;
      }
    }
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); event.stopPropagation(); if (meta) jump(0, 1, event.shiftKey); else move(0, 1, event.shiftKey); return;
      case "ArrowUp": event.preventDefault(); event.stopPropagation(); if (meta) jump(0, -1, event.shiftKey); else move(0, -1, event.shiftKey); return;
      case "ArrowLeft": event.preventDefault(); event.stopPropagation(); if (meta) jump(-1, 0, event.shiftKey); else move(-1, 0, event.shiftKey); return;
      case "ArrowRight": event.preventDefault(); event.stopPropagation(); if (meta) jump(1, 0, event.shiftKey); else move(1, 0, event.shiftKey); return;
      case "Tab": event.preventDefault(); event.stopPropagation(); move(event.shiftKey ? -1 : 1, 0, false); return;
      case "Home": event.preventDefault(); event.stopPropagation(); onSelectionChange(singleSelection(0, active.row)); scrollIntoView(0, active.row); return;
      case "PageDown": event.preventDefault(); event.stopPropagation(); move(0, 20, event.shiftKey); return;
      case "PageUp": event.preventDefault(); event.stopPropagation(); move(0, -20, event.shiftKey); return;
      case "Enter": case "F2": event.preventDefault(); event.stopPropagation(); startEdit(active.col, active.row); return;
      case "Backspace": case "Delete": event.preventDefault(); event.stopPropagation(); if (!readOnly) onClear(selection.box); return;
      case "Escape": event.stopPropagation(); return;
      default: break;
    }
    if (meta || event.altKey) return;
    if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      startEdit(active.col, active.row, event.key);
    }
  }

  /* Clipboard --------------------------------------------------------- */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    function onCopyEvent(event: ClipboardEvent) {
      if (editing) return;
      event.preventDefault();
      event.clipboardData?.setData("text/plain", onCopy(selection.box));
    }
    function onPasteEvent(event: ClipboardEvent) {
      if (editing || readOnly) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text) onPaste(text, selection.active.col, selection.active.row);
    }
    node.addEventListener("copy", onCopyEvent as EventListener);
    node.addEventListener("paste", onPasteEvent as EventListener);
    return () => {
      node.removeEventListener("copy", onCopyEvent as EventListener);
      node.removeEventListener("paste", onPasteEvent as EventListener);
    };
  }, [editing, onCopy, onPaste, readOnly, selection]);

  /* Cell rendering ---------------------------------------------------- */
  function cellNode(col: number, row: number, offsetX: number, offsetY: number) {
    if (hiddenRows?.has(row)) return null;
    const address = cellAddress(col, row);
    const style: CellStyle | undefined = sheet.styles[address];
    const result = values[address];
    const text = displayValue(result, style, format);
    const inBox = col >= selection.box.fromCol && col <= selection.box.toCol && row >= selection.box.fromRow && row <= selection.box.toRow;
    const isActive = col === selection.active.col && row === selection.active.row;
    const comment = commentByAddress.get(address);
    const classes = ["sx-cell"];
    if (inBox) classes.push("sx-in-range");
    if (isActive) classes.push("sx-active");
    if (result?.error) classes.push("sx-error");
    if (result?.formula) classes.push("sx-formula");
    // A figure, a date serial or an error code is data: it takes the mono face.
    const numeric = typeof result?.value === "number" || Boolean(result?.error)
      || (typeof result?.value === "string" && result.value.trim() !== "" && !Number.isNaN(Number(result.value)));
    if (numeric) classes.push("ds-num");
    if (highlighted?.has(address)) classes.push("sx-precedent");
    if (protectedAddresses?.has(address)) classes.push("sx-protected");
    const borders = style?.border ?? [];
    return (
      <div
        key={address}
        className={classes.join(" ")}
        role="gridcell"
        aria-colindex={col + 1}
        aria-rowindex={row + 1}
        aria-selected={inBox}
        aria-readonly={protectedAddresses?.has(address) || undefined}
        data-address={address}
        title={result?.error ? `${address}: ${result.error}` : sheet.cells[address]?.startsWith("=") ? `${address}: ${sheet.cells[address]}` : undefined}
        style={{
          left: offsets[col] - offsetX,
          top: (row - offsetY / ROW_H) * ROW_H - (offsetY % ROW_H),
          width: columnWidth(sheet, col),
          height: ROW_H,
          textAlign: style?.align === "end" ? "right" : style?.align === "center" ? "center" : (numeric && !result?.error ? "right" : "left"),
          fontWeight: style?.bold ? 600 : undefined,
          fontStyle: style?.italic ? "italic" : undefined,
          background: style?.fill,
          borderTopColor: borders.includes("top") ? "var(--fg-muted)" : undefined,
          borderTopWidth: borders.includes("top") ? 2 : undefined,
          borderRightColor: borders.includes("right") ? "var(--fg-muted)" : undefined,
          borderRightWidth: borders.includes("right") ? 2 : undefined,
          borderBottomColor: borders.includes("bottom") ? "var(--fg-muted)" : undefined,
          borderBottomWidth: borders.includes("bottom") ? 2 : undefined,
          borderLeftColor: borders.includes("left") ? "var(--fg-muted)" : undefined,
          borderLeftWidth: borders.includes("left") ? 2 : undefined,
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          /* Pointing mode: a formula waiting for an operand takes this cell's reference. */
          if (editing && !(editing.col === col && editing.row === row) && formulaWantsReference(editing.value)) {
            pointing.current = { insertAt: editing.value.length, from: { col, row }, dragging: true };
            setEditing({ ...editing, value: editing.value + cellAddress(col, row) });
            requestAnimationFrame(() => inputRef.current?.focus());
            return;
          }
          if (editing && pointing.current && !(editing.col === col && editing.row === row)) {
            /* Clicking again while pointing replaces the reference just written. */
            const at = pointing.current.insertAt;
            pointing.current = { insertAt: at, from: { col, row }, dragging: true };
            setEditing({ ...editing, value: editing.value.slice(0, at) + cellAddress(col, row) });
            requestAnimationFrame(() => inputRef.current?.focus());
            return;
          }
          scrollRef.current?.focus();
          if (event.shiftKey) onSelectionChange(extendSelection(selection, col, row));
          else { onSelectionChange(singleSelection(col, row)); dragging.current = true; }
        }}
        onMouseEnter={() => {
          const point = pointing.current;
          if (editing && point?.dragging) {
            const box = { fromCol: Math.min(point.from.col, col), fromRow: Math.min(point.from.row, row), toCol: Math.max(point.from.col, col), toRow: Math.max(point.from.row, row) };
            setEditing({ ...editing, value: editing.value.slice(0, point.insertAt) + boxLabel(box) });
            return;
          }
          if (dragging.current) onSelectionChange(extendSelection(selection, col, row));
        }}
        onDoubleClick={() => startEdit(col, row)}
      >
        <span className="sx-cell-text">{text}</span>
        {comment !== undefined && <span className={`sx-flag${comment ? " sx-flag-done" : ""}`} aria-hidden="true" />}
      </div>
    );
  }

  const suggestions = editing && editing.value !== dismissedAt ? functionSuggestions(editing.value, FUNCTION_NAMES) : [];

  const bodyCells = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) bodyCells.push(cellNode(col, row, frozenWidth, freezeRows * ROW_H));
  }

  const frozenTopCells = [];
  if (freezeRows > 0) {
    for (let row = 0; row < freezeRows; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) frozenTopCells.push(cellNode(col, row, frozenWidth, 0));
    }
  }

  const frozenLeftCells = [];
  if (freezeCols > 0) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = 0; col < freezeCols; col += 1) frozenLeftCells.push(cellNode(col, row, 0, freezeRows * ROW_H));
    }
  }

  const cornerCells = [];
  if (freezeCols > 0 && freezeRows > 0) {
    for (let row = 0; row < freezeRows; row += 1) {
      for (let col = 0; col < freezeCols; col += 1) cornerCells.push(cellNode(col, row, 0, 0));
    }
  }

  useEffect(() => {
    function onUp() { dragging.current = false; if (pointing.current) pointing.current = { ...pointing.current, dragging: false }; }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const editingLeft = editing ? offsets[editing.col] - (editing.col >= freezeCols ? frozenWidth + scroll.left : 0) + ROWHEAD_W + (editing.col >= freezeCols ? frozenWidth : 0) : 0;
  const editingTop = editing
    ? HEADER_H + (editing.row >= freezeRows ? frozenHeight + (editing.row - freezeRows) * ROW_H - scroll.top : editing.row * ROW_H)
    : 0;

  return (
    <div
      className="sx-wrap"
      style={{
        height,
        gridTemplateColumns: `${ROWHEAD_W}px ${frozenWidth}px minmax(0, 1fr)`,
        gridTemplateRows: `${HEADER_H}px ${frozenHeight}px minmax(0, 1fr)`,
      }}
    >
      {/* Corner */}
      <div className="sx-corner" aria-hidden="true" />

      {/* Frozen column headers */}
      <div className="sx-head sx-head-frozen">
        {Array.from({ length: freezeCols }, (_, col) => (
          <div key={col} className={`sx-colhead${col >= selection.box.fromCol && col <= selection.box.toCol ? " sx-head-active" : ""}`} style={{ left: offsets[col], width: columnWidth(sheet, col) }}>{columnName(col)}</div>
        ))}
      </div>

      {/* Scrolling column headers */}
      <div className="sx-head" ref={colHeadRef}>
        <div style={{ width: scrollWidth, height: HEADER_H, position: "relative" }}>
          {Array.from({ length: Math.max(0, lastCol - firstCol + 1) }, (_, index) => {
            const col = firstCol + index;
            return (
              <div
                key={col}
                className={`sx-colhead${col >= selection.box.fromCol && col <= selection.box.toCol ? " sx-head-active" : ""}`}
                style={{ left: offsets[col] - frozenWidth, width: columnWidth(sheet, col) }}
                onMouseDown={() => onSelectionChange({ active: { col, row: 0 }, box: { fromCol: col, fromRow: 0, toCol: col, toRow: sheet.rows - 1 } })}
              >{columnName(col)}</div>
            );
          })}
        </div>
      </div>

      {/* Frozen rows: row numbers */}
      <div className="sx-rownums sx-rownums-frozen">
        {Array.from({ length: freezeRows }, (_, row) => (
          <div key={row} className={`sx-rowhead${row >= selection.box.fromRow && row <= selection.box.toRow ? " sx-head-active" : ""}`} style={{ top: row * ROW_H }}>{row + 1}</div>
        ))}
      </div>

      {/* Frozen top-left block */}
      <div className="sx-pane sx-pane-corner">{cornerCells}</div>

      {/* Frozen rows across the scrolling columns */}
      <div className="sx-pane sx-pane-top" style={{ overflow: "hidden" }}>
        <div style={{ position: "relative", width: scrollWidth, height: frozenHeight, transform: `translateX(${-scroll.left}px)` }}>{frozenTopCells}</div>
      </div>

      {/* Row numbers for the scrolling rows */}
      <div className="sx-rownums" ref={rowHeadRef}>
        <div style={{ height: scrollHeight, position: "relative" }}>
          {Array.from({ length: Math.max(0, lastRow - firstRow + 1) }, (_, index) => {
            const row = firstRow + index;
            if (hiddenRows?.has(row)) return null;
            return (
              <div
                key={row}
                className={`sx-rowhead${row >= selection.box.fromRow && row <= selection.box.toRow ? " sx-head-active" : ""}`}
                style={{ top: (row - freezeRows) * ROW_H }}
                onMouseDown={() => onSelectionChange({ active: { col: 0, row }, box: { fromCol: 0, fromRow: row, toCol: sheet.cols - 1, toRow: row } })}
              >{row + 1}</div>
            );
          })}
        </div>
      </div>

      {/* Frozen columns down the scrolling rows */}
      <div className="sx-pane sx-pane-left" style={{ overflow: "hidden" }}>
        <div style={{ position: "relative", width: frozenWidth, height: scrollHeight, transform: `translateY(${-scroll.top}px)` }}>{frozenLeftCells}</div>
      </div>

      {/* The scrolling cell area */}
      <div
        className="sx-cells"
        ref={scrollRef}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="grid"
        aria-label={`${sheet.name} grid, ${sheet.cols} columns by ${sheet.rows} rows`}
        aria-rowcount={sheet.rows}
        aria-colcount={sheet.cols}
        aria-activedescendant={undefined}
      >
        <div style={{ width: scrollWidth, height: scrollHeight, position: "relative" }}>{bodyCells}</div>
      </div>

      {editing && (
        <input
          ref={inputRef}
          className="sx-editor ds-num"
          aria-label={`Edit ${cellAddress(editing.col, editing.row)}`}
          aria-autocomplete="list"
          aria-controls={suggestions.length ? "sx-fn-suggestions" : undefined}
          aria-expanded={suggestions.length > 0}
          value={editing.value}
          style={{ left: editingLeft, top: editingTop, width: Math.max(columnWidth(sheet, editing.col), editing.value.startsWith("=") ? 220 : 0), height: ROW_H }}
          onChange={(event) => { pointing.current = null; setSuggestion(0); setEditing({ ...editing, value: event.target.value }); }}
          onBlur={() => commitEdit("none")}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (suggestions.length) {
              if (event.key === "ArrowDown") { event.preventDefault(); setSuggestion((index) => (index + 1) % suggestions.length); return; }
              if (event.key === "ArrowUp") { event.preventDefault(); setSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                setEditing({ ...editing, value: applySuggestion(editing.value, suggestions[Math.min(suggestion, suggestions.length - 1)]) });
                setSuggestion(0);
                return;
              }
              if (event.key === "Escape") { event.preventDefault(); setDismissedAt(editing.value); return; }
            }
            if (event.key === "Enter") { event.preventDefault(); commitEdit("down"); }
            if (event.key === "Tab") { event.preventDefault(); commitEdit("right"); }
            if (event.key === "Escape") { event.preventDefault(); setEditing(null); requestAnimationFrame(() => scrollRef.current?.focus()); }
          }}
        />
      )}
      {editing && suggestions.length > 0 && (
        <ul
          id="sx-fn-suggestions"
          className="sx-suggest"
          role="listbox"
          aria-label="Matching functions"
          style={{ left: editingLeft, top: editingTop + ROW_H + 2 }}
        >
          {suggestions.map((name, index) => {
            const help = FUNCTION_HELP.find((item) => item.name === name);
            return (
              <li
                key={name}
                role="option"
                aria-selected={index === Math.min(suggestion, suggestions.length - 1)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setEditing({ ...editing, value: applySuggestion(editing.value, name) });
                  setSuggestion(0);
                  inputRef.current?.focus();
                }}
              >
                <span className="ds-num">{help?.signature ?? name}</span>
                <span className="sx-suggest-summary">{help?.summary}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
