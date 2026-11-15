/* ====================================================================== *
 * Workbook document model.
 *
 * The record body is the single source of truth. Older bodies written by the
 * previous grid (`{ sheets: [{ name, rows, cols, cells }] }`) are migrated on
 * read, so an existing workbook opens without losing a formula.
 * ====================================================================== */

import {
  cellAddress, columnName, evaluateWorkbook, parseAddress, rangeBox, toText,
  type CellResult, type EvaluationResult, type NamedRange, type RangeBox, type Scalar,
} from "./engine";

export const MAX_COLS = 64;
export const MAX_ROWS = 1000;

export type NumberFormat = "general" | "number" | "currency" | "percent" | "date" | "text";

export interface CellStyle {
  format?: NumberFormat;
  decimals?: number;
  align?: "start" | "center" | "end";
  bold?: boolean;
  italic?: boolean;
  fill?: string;
  /** Sides that carry a rule. */
  border?: ("top" | "right" | "bottom" | "left")[];
}

export interface SheetFilter {
  /** Header row the filter reads its labels from. */
  headerRow: number;
  column: number;
  /** Cell values kept; an empty list keeps everything. */
  keep: string[];
}

export interface SheetSort {
  column: number;
  direction: "asc" | "desc";
  headerRow: number;
}

export interface SheetTable {
  id: string;
  name: string;
  ref: string;
  headerRow: boolean;
  columns: { name: string; type: "text" | "number" | "currency" | "percent" | "date" | "boolean"; required?: boolean; rule?: string }[];
}

export interface SheetChart {
  id: string;
  title: string;
  kind: "bar" | "line" | "donut";
  /** Range including the header row/column. */
  ref: string;
  sheetId: string;
  seriesInColumns: boolean;
  /** Snapshot of the values the chart was last published from. */
  snapshotAt?: string;
}

export interface SheetComment {
  id: string;
  sheetId: string;
  address: string;
  author: string;
  at: string;
  body: string;
  resolved: boolean;
}

export interface ProtectedRange {
  id: string;
  sheetId: string;
  ref: string;
  note: string;
}

export interface Sheet {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, string>;
  styles: Record<string, CellStyle>;
  colWidths: Record<string, number>;
  freeze: { rows: number; cols: number };
  filters: SheetFilter[];
  sort?: SheetSort;
  hidden?: boolean;
  colour?: string;
}

export interface Workbook {
  sheets: Sheet[];
  activeSheetId: string;
  namedRanges: NamedRange[];
  tables: SheetTable[];
  charts: SheetChart[];
  comments: SheetComment[];
  protection: ProtectedRange[];
  /** Import/export runs recorded against the workbook. */
  io: { id: string; at: string; kind: "import" | "export"; format: string; note: string; rows?: number; warnings: string[] }[];
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptySheet(name: string, rows = MAX_ROWS, cols = MAX_COLS): Sheet {
  return {
    id: nextId("sh"),
    name,
    rows,
    cols,
    cells: {},
    styles: {},
    colWidths: {},
    freeze: { rows: 0, cols: 0 },
    filters: [],
  };
}

interface LegacySheet { name?: string; rows?: number; cols?: number; cells?: Record<string, string> }

/** Read any stored body into the current shape without dropping data. */
export function readWorkbook(body: unknown): Workbook {
  const source = (body ?? {}) as Partial<Workbook> & { sheets?: (Sheet | LegacySheet)[] };
  const sheets: Sheet[] = (source.sheets ?? []).map((raw, index) => {
    const legacy = raw as LegacySheet & Partial<Sheet>;
    return {
      id: legacy.id ?? `sheet-${index + 1}`,
      name: legacy.name ?? `Sheet ${index + 1}`,
      rows: Math.max(MAX_ROWS, legacy.rows ?? 0),
      cols: Math.max(MAX_COLS, legacy.cols ?? 0),
      cells: { ...(legacy.cells ?? {}) },
      styles: { ...(legacy.styles ?? {}) },
      colWidths: { ...(legacy.colWidths ?? {}) },
      freeze: legacy.freeze ?? { rows: 0, cols: 0 },
      filters: legacy.filters ?? [],
      sort: legacy.sort,
      hidden: legacy.hidden,
      colour: legacy.colour,
    };
  });
  if (sheets.length === 0) sheets.push({ ...emptySheet("Sheet 1"), id: "sheet-1" });
  return {
    sheets,
    activeSheetId: source.activeSheetId && sheets.some((sheet) => sheet.id === source.activeSheetId) ? source.activeSheetId : sheets[0].id,
    namedRanges: source.namedRanges ?? [],
    tables: source.tables ?? [],
    charts: source.charts ?? [],
    comments: source.comments ?? [],
    protection: source.protection ?? [],
    io: source.io ?? [],
  };
}

export function sheetById(workbook: Workbook, id: string): Sheet {
  return workbook.sheets.find((sheet) => sheet.id === id) ?? workbook.sheets[0];
}

export function replaceSheet(workbook: Workbook, sheet: Sheet): Workbook {
  return { ...workbook, sheets: workbook.sheets.map((item) => (item.id === sheet.id ? sheet : item)) };
}

/* ----------------------------- Evaluation ----------------------------- */

export function evaluate(workbook: Workbook, now: Date): EvaluationResult {
  return evaluateWorkbook({
    sheets: workbook.sheets.map((sheet) => ({ id: sheet.id, name: sheet.name, cells: sheet.cells })),
    namedRanges: workbook.namedRanges,
    now,
  });
}

/* ----------------------------- Formatting ----------------------------- */

export interface FormatContext {
  currency: string;
  locale: string;
}

const MS_PER_DAY = 86400000;
const EPOCH_OFFSET = 25569;

export function displayValue(result: CellResult | undefined, style: CellStyle | undefined, context: FormatContext): string {
  if (!result) return "";
  if (result.error) return result.error;
  const value = result.value;
  if (value === null) return "";
  const format = style?.format ?? "general";
  if (format === "text") return toText(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") {
    if (format === "general") return value;
    const asNumber = Number(value.trim());
    if (value.trim() === "" || Number.isNaN(asNumber)) return value;
    return formatNumber(asNumber, format, style, context);
  }
  return formatNumber(value, format, style, context);
}

function formatNumber(value: number, format: NumberFormat, style: CellStyle | undefined, context: FormatContext): string {
  const decimals = style?.decimals;
  if (format === "date") {
    const ms = Math.round((value - EPOCH_OFFSET) * MS_PER_DAY);
    if (!Number.isFinite(ms)) return "#VALUE!";
    return new Intl.DateTimeFormat(context.locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(ms));
  }
  if (format === "currency") {
    return new Intl.NumberFormat(context.locale, {
      style: "currency", currency: context.currency,
      minimumFractionDigits: decimals ?? 2, maximumFractionDigits: decimals ?? 2,
    }).format(value);
  }
  if (format === "percent") {
    return new Intl.NumberFormat(context.locale, {
      style: "percent", minimumFractionDigits: decimals ?? 1, maximumFractionDigits: decimals ?? 1,
    }).format(value);
  }
  if (format === "number") {
    return new Intl.NumberFormat(context.locale, {
      minimumFractionDigits: decimals ?? 2, maximumFractionDigits: decimals ?? 2,
    }).format(value);
  }
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1e10) / 1e10);
}

export const FORMAT_LABELS: Record<NumberFormat, string> = {
  general: "General",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  date: "Date",
  text: "Text",
};

/* ----------------------------- Range edits ----------------------------- */

export function setCell(sheet: Sheet, address: string, raw: string): Sheet {
  const cells = { ...sheet.cells };
  if (raw === "") delete cells[address];
  else cells[address] = raw;
  return { ...sheet, cells };
}

export function setCells(sheet: Sheet, updates: Record<string, string>): Sheet {
  const cells = { ...sheet.cells };
  for (const [address, raw] of Object.entries(updates)) {
    if (raw === "") delete cells[address];
    else cells[address] = raw;
  }
  return { ...sheet, cells };
}

export function styleRange(sheet: Sheet, box: RangeBox, patch: CellStyle | null): Sheet {
  const styles = { ...sheet.styles };
  for (let row = box.fromRow; row <= box.toRow; row += 1) {
    for (let col = box.fromCol; col <= box.toCol; col += 1) {
      const address = cellAddress(col, row);
      if (patch === null) { delete styles[address]; continue; }
      styles[address] = { ...styles[address], ...patch };
    }
  }
  return { ...sheet, styles };
}

export function clearRange(sheet: Sheet, box: RangeBox): Sheet {
  const cells = { ...sheet.cells };
  for (let row = box.fromRow; row <= box.toRow; row += 1) {
    for (let col = box.fromCol; col <= box.toCol; col += 1) delete cells[cellAddress(col, row)];
  }
  return { ...sheet, cells };
}

/** Shift every relative A1 reference in a formula by a row/column delta. */
export function shiftFormula(source: string, deltaCol: number, deltaRow: number): string {
  if (!source.startsWith("=")) return source;
  return source.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g, (whole, absCol, col, absRow, row) => {
    const parsed = parseAddress(`${col}${row}`);
    if (!parsed) return whole;
    const nextCol = absCol ? parsed.col : parsed.col + deltaCol;
    const nextRow = absRow ? parsed.row : parsed.row + deltaRow;
    if (nextCol < 0 || nextRow < 0) return "#REF!";
    return `${absCol}${columnName(nextCol)}${absRow}${nextRow + 1}`;
  });
}

/** Fill the first row/column of a selection across the rest of it. */
export function fillRange(sheet: Sheet, box: RangeBox, direction: "down" | "right"): Sheet {
  const updates: Record<string, string> = {};
  if (direction === "down") {
    for (let col = box.fromCol; col <= box.toCol; col += 1) {
      const source = sheet.cells[cellAddress(col, box.fromRow)] ?? "";
      for (let row = box.fromRow + 1; row <= box.toRow; row += 1) {
        updates[cellAddress(col, row)] = shiftFormula(source, 0, row - box.fromRow);
      }
    }
  } else {
    for (let row = box.fromRow; row <= box.toRow; row += 1) {
      const source = sheet.cells[cellAddress(box.fromCol, row)] ?? "";
      for (let col = box.fromCol + 1; col <= box.toCol; col += 1) {
        updates[cellAddress(col, row)] = shiftFormula(source, col - box.fromCol, 0);
      }
    }
  }
  return setCells(sheet, updates);
}

/** Copy a rectangle as a tab-separated clipboard payload. */
export function copyRange(sheet: Sheet, box: RangeBox): string {
  const lines: string[] = [];
  for (let row = box.fromRow; row <= box.toRow; row += 1) {
    const line: string[] = [];
    for (let col = box.fromCol; col <= box.toCol; col += 1) line.push(sheet.cells[cellAddress(col, row)] ?? "");
    lines.push(line.join("\t"));
  }
  return lines.join("\n");
}

export function pasteAt(sheet: Sheet, text: string, col: number, row: number): Sheet {
  const rows = text.replace(/\r/g, "").split("\n").map((line) => line.split("\t"));
  const updates: Record<string, string> = {};
  rows.forEach((line, rowOffset) => {
    line.forEach((value, colOffset) => {
      const targetCol = col + colOffset;
      const targetRow = row + rowOffset;
      if (targetCol >= sheet.cols || targetRow >= sheet.rows) return;
      updates[cellAddress(targetCol, targetRow)] = value;
    });
  });
  return setCells(sheet, updates);
}

/* ----------------------------- Sort & filter ----------------------------- */

/**
 * Sort the rows of a range by one column. Formulas inside the moved rows are
 * shifted with them, so a sort does not silently change what a formula reads.
 */
export function sortRange(sheet: Sheet, box: RangeBox, column: number, direction: "asc" | "desc", headerRow: boolean, values: Record<string, CellResult>): Sheet {
  const first = box.fromRow + (headerRow ? 1 : 0);
  const rows: { index: number; cells: Record<number, string>; key: Scalar }[] = [];
  for (let row = first; row <= box.toRow; row += 1) {
    const cells: Record<number, string> = {};
    for (let col = box.fromCol; col <= box.toCol; col += 1) {
      const raw = sheet.cells[cellAddress(col, row)];
      if (raw !== undefined) cells[col] = raw;
    }
    const keyResult = values[cellAddress(column, row)];
    rows.push({ index: row, cells, key: keyResult?.error ? keyResult.error : keyResult?.value ?? "" });
  }
  const sorted = [...rows].sort((a, b) => {
    const aBlank = a.key === "" || a.key === null;
    const bBlank = b.key === "" || b.key === null;
    if (aBlank && bBlank) return a.index - b.index;
    if (aBlank) return 1;
    if (bBlank) return -1;
    const aNumber = typeof a.key === "number" ? a.key : Number(toText(a.key));
    const bNumber = typeof b.key === "number" ? b.key : Number(toText(b.key));
    const numeric = !Number.isNaN(aNumber) && !Number.isNaN(bNumber);
    const comparison = numeric
      ? aNumber - bNumber
      : toText(a.key).localeCompare(toText(b.key), undefined, { numeric: true, sensitivity: "base" });
    if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
    return a.index - b.index;
  });
  const cells = { ...sheet.cells };
  for (let row = first; row <= box.toRow; row += 1) {
    for (let col = box.fromCol; col <= box.toCol; col += 1) delete cells[cellAddress(col, row)];
  }
  sorted.forEach((entry, offset) => {
    const targetRow = first + offset;
    const deltaRow = targetRow - entry.index;
    for (const [col, raw] of Object.entries(entry.cells)) {
      cells[cellAddress(Number(col), targetRow)] = deltaRow === 0 ? raw : shiftFormula(raw, 0, deltaRow);
    }
  });
  return { ...sheet, cells, sort: { column, direction, headerRow: box.fromRow } };
}

/** Row indexes hidden by the active filters. */
export function hiddenRows(sheet: Sheet, values: Record<string, CellResult>, context: FormatContext): Set<number> {
  const hidden = new Set<number>();
  for (const filter of sheet.filters) {
    if (filter.keep.length === 0) continue;
    for (let row = filter.headerRow + 1; row < sheet.rows; row += 1) {
      const address = cellAddress(filter.column, row);
      const shown = displayValue(values[address], sheet.styles[address], context);
      const anyContent = Object.keys(sheet.cells).some((key) => {
        const parsed = parseAddress(key);
        return parsed?.row === row;
      });
      if (!anyContent) continue;
      if (!filter.keep.includes(shown)) hidden.add(row);
    }
  }
  return hidden;
}

export function distinctColumnValues(sheet: Sheet, column: number, headerRow: number, values: Record<string, CellResult>, context: FormatContext): string[] {
  const seen = new Set<string>();
  for (let row = headerRow + 1; row < sheet.rows; row += 1) {
    const address = cellAddress(column, row);
    if (sheet.cells[address] === undefined) continue;
    seen.add(displayValue(values[address], sheet.styles[address], context));
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/* ----------------------------- Extents ----------------------------- */

export function usedExtent(sheet: Sheet): { cols: number; rows: number } {
  let cols = 0;
  let rows = 0;
  for (const address of Object.keys(sheet.cells)) {
    const parsed = parseAddress(address);
    if (!parsed) continue;
    cols = Math.max(cols, parsed.col + 1);
    rows = Math.max(rows, parsed.row + 1);
  }
  return { cols, rows };
}

/** Rectangle the sheet's data occupies, for charts and CSV export. */
export function usedBox(sheet: Sheet): RangeBox {
  const extent = usedExtent(sheet);
  return { fromCol: 0, fromRow: 0, toCol: Math.max(0, extent.cols - 1), toRow: Math.max(0, extent.rows - 1) };
}

/* ----------------------------- Charts ----------------------------- */

export interface ChartData {
  labels: string[];
  series: { name: string; points: { label: string; value: number }[] }[];
  /** Cells that were not numeric and were therefore skipped. */
  skipped: string[];
}

export function chartData(_sheet: Sheet, ref: string, seriesInColumns: boolean, values: Record<string, CellResult>): ChartData | null {
  const box = rangeBox(ref);
  if (!box) return null;
  const skipped: string[] = [];
  const read = (col: number, row: number): CellResult | undefined => values[cellAddress(col, row)];
  if (seriesInColumns) {
    const labels: string[] = [];
    for (let row = box.fromRow + 1; row <= box.toRow; row += 1) labels.push(toText(read(box.fromCol, row)?.value ?? ""));
    const series: ChartData["series"] = [];
    for (let col = box.fromCol + 1; col <= box.toCol; col += 1) {
      const name = toText(read(col, box.fromRow)?.value ?? columnName(col));
      const points: { label: string; value: number }[] = [];
      for (let row = box.fromRow + 1; row <= box.toRow; row += 1) {
        const cell = read(col, row);
        const value = typeof cell?.value === "number" ? cell.value : Number(toText(cell?.value ?? ""));
        if (cell?.error || Number.isNaN(value)) { skipped.push(cellAddress(col, row)); continue; }
        points.push({ label: labels[row - box.fromRow - 1] ?? cellAddress(col, row), value });
      }
      series.push({ name, points });
    }
    return { labels, series, skipped };
  }
  const labels: string[] = [];
  for (let col = box.fromCol + 1; col <= box.toCol; col += 1) labels.push(toText(read(col, box.fromRow)?.value ?? columnName(col)));
  const series: ChartData["series"] = [];
  for (let row = box.fromRow + 1; row <= box.toRow; row += 1) {
    const name = toText(read(box.fromCol, row)?.value ?? `Row ${row + 1}`);
    const points: { label: string; value: number }[] = [];
    for (let col = box.fromCol + 1; col <= box.toCol; col += 1) {
      const cell = read(col, row);
      const value = typeof cell?.value === "number" ? cell.value : Number(toText(cell?.value ?? ""));
      if (cell?.error || Number.isNaN(value)) { skipped.push(cellAddress(col, row)); continue; }
      points.push({ label: labels[col - box.fromCol - 1] ?? cellAddress(col, row), value });
    }
    series.push({ name, points });
  }
  return { labels, series, skipped };
}

/* ----------------------------- CSV bridge ----------------------------- */

export function sheetToRows(sheet: Sheet, values: Record<string, CellResult>, context: FormatContext, evaluated: boolean): string[][] {
  const box = usedBox(sheet);
  const rows: string[][] = [];
  for (let row = box.fromRow; row <= box.toRow; row += 1) {
    const line: string[] = [];
    for (let col = box.fromCol; col <= box.toCol; col += 1) {
      const address = cellAddress(col, row);
      line.push(evaluated ? displayValue(values[address], sheet.styles[address], context) : sheet.cells[address] ?? "");
    }
    rows.push(line);
  }
  return rows;
}

export function rowsToSheet(sheet: Sheet, rows: string[][], startCol = 0, startRow = 0): Sheet {
  const updates: Record<string, string> = {};
  rows.forEach((line, rowOffset) => {
    line.forEach((value, colOffset) => {
      updates[cellAddress(startCol + colOffset, startRow + rowOffset)] = value;
    });
  });
  return setCells(sheet, updates);
}

/**
 * Describe what an import would do to each column, so nothing is coerced
 * silently (the SHEETS-006 edge case).
 */
export interface ColumnPlan {
  index: number;
  header: string;
  detected: "number" | "currency" | "percent" | "date" | "text" | "formula" | "mixed" | "empty";
  samples: string[];
  warning?: string;
}

export function planImport(rows: string[][], headerRow: boolean): ColumnPlan[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const body = headerRow ? rows.slice(1) : rows;
  const plans: ColumnPlan[] = [];
  for (let col = 0; col < width; col += 1) {
    const samples = body.map((row) => row[col] ?? "").filter((value) => value.trim() !== "").slice(0, 60);
    const kinds = new Set<ColumnPlan["detected"]>();
    for (const sample of samples) {
      if (sample.startsWith("=")) { kinds.add("formula"); continue; }
      if (/^[-+]?[£$€]\s?[\d,]+(\.\d+)?$/.test(sample)) { kinds.add("currency"); continue; }
      if (/^[-+]?[\d,.]+\s?%$/.test(sample)) { kinds.add("percent"); continue; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(sample) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(sample)) { kinds.add("date"); continue; }
      if (/^[-+]?[\d,]*\.?\d+$/.test(sample)) { kinds.add("number"); continue; }
      kinds.add("text");
    }
    const detected: ColumnPlan["detected"] = samples.length === 0 ? "empty" : kinds.size === 1 ? [...kinds][0] : "mixed";
    let warning: string | undefined;
    if (detected === "mixed") warning = `Column ${columnName(col)} mixes ${[...kinds].join(", ")}. It will be imported as text unless a type is chosen.`;
    if (detected === "date") warning = `Column ${columnName(col)} looks like a date. Dates are only converted to serials when the date type is chosen; otherwise the text is kept.`;
    if (detected === "currency") warning = `Column ${columnName(col)} carries a currency symbol. The symbol is not a currency: pick the cell format explicitly.`;
    plans.push({ index: col, header: headerRow ? rows[0]?.[col] ?? columnName(col) : columnName(col), detected, samples: samples.slice(0, 4), warning });
  }
  return plans;
}
