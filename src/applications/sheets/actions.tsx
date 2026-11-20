import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useState } from "react";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput, OverlayActions } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import { CAPABILITY_LABELS } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import { downloadFile } from "@/runtime/db";
import { FUNCTION_HELP, boxLabel, cellAddress, rangeBox, toCsv } from "./engine";
import {
  chartData, fillRange, nextId, pasteAt, readWorkbook, setCell, sheetToRows, sortRange, usedBox,
  type Sheet, type Workbook,
} from "./model";
import { proposeChange } from "./preview";
import { activeWorkbookEditor, protectedSet, useWorkbookEditor, type WorkbookEditor } from "./state";

/* ====================================================================== *
 * Sheets: contract actions that operate on the open workbook, and the
 * forms they open. Every change goes through the workbook's one editor, so
 * it recalculates, lands on the undo stack and saves with the session.
 * ====================================================================== */

function useWorkbookFor(context: ScreenContext): Rec | undefined {
  const fromRoute = useRecord(context.params.id);
  const all = useCollection("workbooks");
  return fromRoute ?? all.find((record) => record.status === "active") ?? all[0];
}

const editorFor = (context: ScreenContext) => activeWorkbookEditor(context.params.id);

export function formFooter(form: string, label: string, danger = false, dismiss = "Cancel") {
  return ({ close }: { close: () => void }) => (
    <OverlayActions
      primary={<Button variant={danger ? "outline-danger" : "primary"} type="submit" form={form}>{label}</Button>}
      end={<Button variant="ghost" onClick={close}>{dismiss}</Button>}
    />
  );
}

function blockedByProtection(editor: WorkbookEditor, addresses: string[]): string | undefined {
  const guarded = protectedSet(editor.workbook, editor.sheet);
  const hit = addresses.find((address) => guarded.has(address));
  return hit ? `${hit} is in a protected range` : undefined;
}

function selectionAddresses(editor: WorkbookEditor): string[] {
  const box = editor.selection.box;
  const out: string[] = [];
  for (let row = box.fromRow; row <= box.toRow; row += 1) for (let col = box.fromCol; col <= box.toCol; col += 1) out.push(cellAddress(col, row));
  return out;
}

/* ------------------------------ grid editor ------------------------------ */

export const GRID_ACTIONS: ActionDef[] = [
  { id: "Edit cell", label: "Edit cell…", placement: "toolbar", shortcut: "F2", run: (context) => context.openOverlay("edit cell") },
  {
    id: "paste", label: "Paste", placement: "toolbar", shortcut: "⌘V",
    run: async (context) => {
      const editor = editorFor(context);
      if (!editor) return;
      let text = "";
      try { text = await navigator.clipboard.readText(); } catch { /* permission refused */ }
      if (!text) { context.openOverlay("paste cells"); return; }
      pasteInto(context, editor, text);
    },
  },
  {
    id: "fill", label: "Fill down", placement: "toolbar", shortcut: "⌘D",
    guard: (context) => { const box = editorFor(context)?.selection.box; return box && box.toRow === box.fromRow && box.toCol === box.fromCol ? "Select a range: the first row is copied into the rest" : undefined; },
    run: (context) => {
      const editor = editorFor(context);
      if (!editor) return;
      const box = editor.selection.box;
      const direction = box.toRow > box.fromRow ? "down" : "right";
      const blocked = blockedByProtection(editor, selectionAddresses(editor));
      if (blocked) { context.toast("Protected", blocked, "blocked"); return; }
      if (!proposeChange(editor, fillRange(editor.sheet, box, direction), `Fill ${direction} ${boxLabel(box)}`, context.params.id ?? "")) {
        context.toast("Review the fill", "It replaces existing values, so the change is shown above the grid.", "info");
      }
    },
  },
  { id: "sort", label: "Sort…", placement: "toolbar", run: (context) => context.openOverlay("sort range") },
  { id: "filter", label: "Filter…", placement: "toolbar", run: (context) => context.openOverlay("data validation", { mode: "filter" }) },
  {
    id: "freeze", label: "Freeze at the selection", placement: "toolbar",
    run: (context) => {
      const editor = editorFor(context);
      if (!editor) return;
      const { col, row } = editor.selection.active;
      const same = editor.sheet.freeze.rows === row && editor.sheet.freeze.cols === col;
      const freeze = same ? { rows: 0, cols: 0 } : { rows: row, cols: col };
      editor.commitSheet({ ...editor.sheet, freeze }, same ? "Unfreeze panes" : "Freeze panes");
      context.toast(same ? "Panes unfrozen" : "Panes frozen", same ? "Nothing is pinned." : `${row} row${row === 1 ? "" : "s"} and ${col} column${col === 1 ? "" : "s"} stay in view while the grid scrolls.`);
    },
  },
  {
    id: "undo", label: "Undo", placement: "toolbar", shortcut: "⌘Z",
    guard: (context) => { const editor = editorFor(context); return editor && !editor.canUndo ? "Nothing to undo yet" : undefined; },
    run: (context) => { const editor = editorFor(context); if (editor?.canUndo) editor.undo(); },
  },
];

function pasteInto(context: ScreenContext, editor: WorkbookEditor, text: string) {
  const { col, row } = editor.selection.active;
  const lines = text.replace(/\r/g, "").split("\n").filter((line, index, all) => line || index < all.length - 1);
  const height = lines.length;
  const width = Math.max(...lines.map((line) => line.split("\t").length));
  const targets: string[] = [];
  for (let r = 0; r < height; r += 1) for (let c = 0; c < width; c += 1) targets.push(cellAddress(col + c, row + r));
  const blocked = blockedByProtection(editor, targets);
  if (blocked) { context.toast("Protected", blocked, "blocked"); return; }
  if (!proposeChange(editor, pasteAt(editor.sheet, text, col, row), `Paste ${width} × ${height} at ${cellAddress(col, row)}`, context.params.id ?? "")) {
    context.toast("Review the paste", "It replaces existing values, so the change is shown above the grid. Nothing is written until you apply it.", "info");
    return;
  }
  context.toast("Pasted", `${width} × ${height} cells from ${cellAddress(col, row)}. Text is kept as typed: a date or an amount is not reinterpreted.`);
}

export function EditCell({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const { col, row } = editor.selection.active;
  const address = cellAddress(col, row);
  const draftScope = `sheets:edit-cell:${context.org.id}:${context.actor}:${context.params.id ?? "none"}:${editor.sheet.id}:${address}`;
  const [draftRaw, setRaw] = useWorkingField<string | undefined>(draftScope, "raw", undefined);
  const raw = draftRaw ?? editor.sheet.cells[address] ?? "";
  const blocked = blockedByProtection(editor, [address]);
  return (
    <form
      id="sheets-edit-cell"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        editor.commitSheet(setCell(editor.sheet, address, raw), `Edit ${address}`);
        clearWorkingDraft(draftScope);
        close();
      }}
    >
      <Field label={`${editor.sheet.name}!${address}`} hint="Start with = for a formula.">
        <TextInput value={raw} onChange={(event) => setRaw(event.target.value)} autoFocus style={{ fontFamily: "var(--font-mono)" }} />
      </Field>
      {blocked && <Notice tone="danger" title="Protected">{blocked}. The reason is listed in Collaboration.</Notice>}
      <Properties rows={[{ label: "Shows now", value: String(editor.values[address]?.value ?? "") || "empty" }]} />
      <Row gap={2}><WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
    </form>
  );
}

export function PasteCells({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const { col, row } = editor.selection.active;
  const draftScope = `sheets:paste:${context.org.id}:${context.actor}:${context.params.id ?? "none"}:${editor.sheet.id}:${cellAddress(col, row)}`;
  const [text, setText] = useWorkingField(draftScope, "text", "");
  return (
    <form
      id="sheets-paste"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text) return;
        // A protected cell must not consume the draft. An error message
        // remains visible so the person can review the selection.
        const lines = text.replace(/\r/g, "").split("\n");
        const width = Math.max(...lines.map(line => line.split("\t").length));
        const addresses: string[] = [];
        for (let r = 0; r < lines.length; r++) for (let c = 0; c < width; c++) addresses.push(cellAddress(col + c, row + r));
        if (blockedByProtection(editor, addresses)) { pasteInto(context, editor, text); return; }
        pasteInto(context, editor, text);
        clearWorkingDraft(draftScope);
        close();
      }}
    >
      <Notice tone="info" title="The browser did not share the clipboard">Paste the cells here (tab between columns, a new line per row). They go in from {cellAddress(editor.selection.active.col, editor.selection.active.row)}.</Notice>
      <TextArea rows={6} value={text} onChange={(event) => setText(event.target.value)} autoFocus aria-label="Cells to paste" style={{ fontFamily: "var(--font-mono)" }} />
      <Row gap={2}><WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
    </form>
  );
}

export function SortForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  /* A single cell means "the table it sits in": the whole used area, so a
     sort never reorders one column away from the rest of its rows. */
  const single = editor.selection.box.toRow === editor.selection.box.fromRow && editor.selection.box.toCol === editor.selection.box.fromCol;
  const box = single ? usedBox(editor.sheet) : editor.selection.box;
  const [column, setColumn] = useState(box.fromCol);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [header, setHeader] = useState(true);
  const columns: number[] = [];
  for (let col = box.fromCol; col <= box.toCol; col += 1) columns.push(col);
  return (
    <form
      id="sheets-sort"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const blocked = blockedByProtection(editor, selectionAddresses({ ...editor, selection: { ...editor.selection, box } }));
        if (blocked) { context.toast("Protected", blocked, "blocked"); return; }
        if (!proposeChange(editor, sortRange(editor.sheet, box, column, direction, header, editor.values), `Sort ${boxLabel(box)}`, context.params.id ?? "", true)) {
          context.toast("Review the sort", "The cells that change are highlighted in the grid and listed above it. Apply writes them.", "info");
        }
        close();
      }}
    >
      <Properties rows={[{ label: "Range", value: boxLabel(box) }]} />
      {!single && (box.fromCol > usedBox(editor.sheet).fromCol || box.toCol < usedBox(editor.sheet).toCol) && (
        <Notice tone="warning" title="Only the selected columns move">Cells outside {boxLabel(box)} stay where they are, so rows can come apart. Select a single cell to sort the whole table.</Notice>
      )}
      <Row gap={3} wrap>
        <Field label="By column">
          <Select value={column} onChange={(event) => setColumn(Number(event.target.value))}>
            {columns.map((col) => <option key={col} value={col}>{cellAddress(col, 0).replace(/\d+/, "")}</option>)}
          </Select>
        </Field>
        <Field label="Order">
          <Select value={direction} onChange={(event) => setDirection(event.target.value as "asc")}>
            <option value="asc">A to Z, smallest first</option>
            <option value="desc">Z to A, largest first</option>
          </Select>
        </Field>
      </Row>
      <Checkbox label="The first row is a header and stays put" checked={header} onChange={(event) => setHeader(event.target.checked)} />
      <p className="vx-mini">Formulas move with their rows and their relative references are adjusted, so each row keeps computing from its own cells.</p>
    </form>
  );
}

/* ---------------------------- formula manager ---------------------------- */

export function FixErrors({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const fixable = editor.evaluation.errors.filter((error) => error.code !== "#CYCLE!");
  const cycles = editor.evaluation.errors.length - fixable.length;
  const [excluded, setExcluded] = useState<string[]>([]);
  const picked = fixable.map((error) => error.key).filter((key) => !excluded.includes(key));
  const setPicked = (next: (current: string[]) => string[]) => { const kept = next(picked); setExcluded(fixable.map((error) => error.key).filter((key) => !kept.includes(key))); };
  if (editor.evaluation.errors.length === 0) return <Notice tone="success" title="No formula errors">Every formula evaluates.</Notice>;
  return (
    <form
      id="sheets-fix"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        let workbook: Workbook = editor.workbook;
        for (const error of fixable.filter((item) => picked.includes(item.key))) {
          workbook = { ...workbook, sheets: workbook.sheets.map((sheet) => (sheet.name === error.sheetName ? setCell(sheet, error.address, `=IFERROR(${error.source.slice(1)},0)`) : sheet)) };
        }
        editor.commit(workbook, `Wrap ${picked.length} formulas in IFERROR`);
        close();
      }}
    >
      {fixable.map((error) => (
        <Checkbox
          key={error.key}
          label={`${error.sheetName}!${error.address} · ${error.code} · ${error.source}`}
          checked={picked.includes(error.key)}
          onChange={(event) => setPicked((current) => (event.target.checked ? [...current, error.key] : current.filter((key) => key !== error.key)))}
        />
      ))}
      <Notice tone="warning" title="IFERROR hides the error behind a zero">Wrap only formulas where zero is a fair answer. {cycles ? `${cycles} circular references are not listed: wrapping a loop would hide it, so it has to be broken by hand.` : ""}</Notice>
    </form>
  );
}

export function CompareDependencies({ context }: { context: ScreenContext }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const formulas = Object.keys(editor.evaluation.graph);
  const active = `${editor.sheet.name}!${cellAddress(editor.selection.active.col, editor.selection.active.row)}`;
  const [left, setLeft] = useState(formulas.includes(active) ? active : formulas[0] ?? "");
  const [right, setRight] = useState(formulas.find((key) => key !== left) ?? "");
  if (formulas.length < 2) return <Empty title="Fewer than two formulas">Comparing needs two formula cells.</Empty>;
  const reads = (key: string) => editor.evaluation.graph[key] ?? [];
  const readers = (key: string) => Object.entries(editor.evaluation.graph).filter(([, list]) => list.includes(key)).map(([item]) => item);
  const shared = reads(left).filter((key) => reads(right).includes(key));
  const column = (key: string, set: (value: string) => void) => (
    <Stack gap={2}>
      <Select value={key} onChange={(event) => set(event.target.value)} aria-label="Formula">{formulas.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      <Properties rows={[
        { label: "Formula", value: <span className="ds-num">{editor.workbook.sheets.find((sheet) => sheet.name === key.split("!")[0])?.cells[key.split("!")[1]] ?? ""}</span> },
        { label: "Reads", value: reads(key).join(", ") || "nothing" },
        { label: "Read by", value: readers(key).join(", ") || "nothing" },
        { label: "Order", value: String(editor.evaluation.order.indexOf(key) + 1) },
        { label: "In a cycle", value: editor.evaluation.cycles.includes(key) ? "yes" : "no" },
      ]} />
    </Stack>
  );
  return (
    <Stack gap={3}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {column(left, setLeft)}
        {column(right, setRight)}
      </div>
      <Notice tone="info" title={`${shared.length} inputs in common`}>{shared.join(", ") || "They read nothing in common."}</Notice>
    </Stack>
  );
}

/* ------------------------------ data tables ------------------------------ */

export function ConnectSource({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const [kind, setKind] = useState("Database (Postgres)");
  const [target, setTarget] = useState("");
  return (
    <form
      id="sheets-connect"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!target.trim()) return;
        editor.commit({ ...editor.workbook, io: [{ id: nextId("io"), at: context.now.toISOString(), kind: "import", format: `Connection: ${kind}`, note: `Requested for ${target.trim()}; ${CAPABILITY_LABELS.queued_local.toLowerCase()}, no provider is connected and nothing was read.`, warnings: ["Not connected"] }, ...editor.workbook.io] }, "Request a data connection");
        void context.mutate.log(`Data connection to ${kind} requested and queued locally; no provider is connected`, { entityId: context.params.id, type: "connect", capability: "queued_local" });
        context.toast("Queued locally, not connected", "The request is recorded on the workbook's import history. No provider is attached, so no data was read and nothing left this browser.", "info");
        close();
      }}
    >
      <Field label="Source">
        <Select value={kind} onChange={(event) => setKind(event.target.value)}>
          {["Database (Postgres)", "Accounting ledger", "Shop orders", "Another workbook online"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="What to read" required><TextInput value={target} onChange={(event) => setTarget(event.target.value)} required autoFocus placeholder="orders table, last 90 days" /></Field>
      <Properties rows={[{ label: "Provider", value: <Pill tone="warning">{CAPABILITY_LABELS.not_connected}</Pill> }]} />
      <Notice tone="warning" title="Nothing will be read">A table reads cells in this workbook. The connection is recorded as a request so it is not forgotten; it does nothing until a provider is connected.</Notice>
    </form>
  );
}

/* ---------------------------- charts and pivots ---------------------------- */

function ChartChoice({ editor, value, onChange }: { editor: WorkbookEditor; value: string; onChange: (id: string) => void }) {
  return (
    <Field label="Chart">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {editor.workbook.charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.title} · {chart.kind}</option>)}
      </Select>
    </Field>
  );
}

export function ChangeChartType({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const [chartId, setChartId] = useState("");
  const chart = editor.workbook.charts.find((item) => item.id === (chartId || editor.workbook.charts[0]?.id));
  const [kind, setKind] = useState<"bar" | "line" | "donut" | "">("");
  if (!chart) return <Empty title="No charts yet">Create a chart first.</Empty>;
  const next = kind || chart.kind;
  return (
    <form
      id="sheets-chart-type"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit({ ...editor.workbook, charts: editor.workbook.charts.map((item) => (item.id === chart.id ? { ...item, kind: next } : item)) }, `Change ${chart.title} to ${next}`);
        close();
      }}
    >
      <ChartChoice editor={editor} value={chart.id} onChange={(id) => { setChartId(id); setKind(""); }} />
      <Field label="Type">
        <Select value={next} onChange={(event) => setKind(event.target.value as "bar")}>
          <option value="bar">Bar — compare categories</option>
          <option value="line">Line — a trend over time</option>
          <option value="donut">Donut — parts of one whole</option>
        </Select>
      </Field>
      {next === "donut" && <Notice tone="warning" title="A donut needs parts of a whole">Use it only when the values add up to something meaningful; negative values cannot be drawn.</Notice>}
    </form>
  );
}

export function DrillDown({ context }: { context: ScreenContext }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const [chartId, setChartId] = useState("");
  const [category, setCategory] = useState("");
  const chart = editor.workbook.charts.find((item) => item.id === (chartId || editor.workbook.charts[0]?.id));
  if (!chart) return <Empty title="No charts yet" />;
  const sheet = editor.workbook.sheets.find((item) => item.id === chart.sheetId);
  const data = sheet ? chartData(sheet, chart.ref, chart.seriesInColumns, editor.evaluation.values[sheet.name] ?? {}) : null;
  const box = rangeBox(chart.ref);
  const labels = data?.labels ?? [];
  const chosen = category || labels[0] || "";
  const rows = sheet && box ? sheetToRows(sheet, editor.evaluation.values[sheet.name] ?? {}, editor.format, true).slice(box.fromRow, box.toRow + 1) : [];
  const header = rows[0] ?? [];
  const matching = rows.slice(1).map((row, index) => ({ row, number: (box?.fromRow ?? 0) + index + 2 })).filter(({ row }) => !chart.seriesInColumns || row[box?.fromCol ?? 0] === chosen);
  return (
    <Stack gap={3}>
      <ChartChoice editor={editor} value={chart.id} onChange={(id) => { setChartId(id); setCategory(""); }} />
      <Field label="Category">
        <Select value={chosen} onChange={(event) => setCategory(event.target.value)}>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</Select>
      </Field>
      {data?.series.map((series) => {
        const point = series.points.find((item) => item.label === chosen);
        return <Properties key={series.name} rows={[{ label: series.name, value: <span className="ds-num">{point ? point.value.toLocaleString() : "—"}</span> }]} />;
      })}
      <p className="vx-mini">The rows of {sheet?.name ?? "the sheet"}!{chart.ref} behind {chosen || "this category"}, as the grid computes them:</p>
      <div style={{ overflowX: "auto" }}>
        <table className="ds-table" style={{ borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead><tr><th>Row</th>{header.slice(box?.fromCol ?? 0, (box?.toCol ?? 0) + 1).map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
          <tbody>{matching.map(({ row, number }) => <tr key={number}><td className="ds-num">{number}</td>{row.slice(box?.fromCol ?? 0, (box?.toCol ?? 0) + 1).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Stack>
  );
}

export function SendChartToDeck({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbookFor(context);
  const editor = useWorkbookEditor(context, record);
  const decks = useCollection("decks");
  const [chartId, setChartId] = useState("");
  const [deckId, setDeckId] = useState("");
  const chart = editor.workbook.charts.find((item) => item.id === (chartId || editor.workbook.charts[0]?.id));
  const deck = decks.find((item) => item.id === (deckId || decks[0]?.id));
  if (!chart) return <Empty title="No charts yet" />;
  if (!deck) return <Empty title="No deck in this workspace" />;
  const sheet = editor.workbook.sheets.find((item) => item.id === chart.sheetId);
  const data = sheet ? chartData(sheet, chart.ref, chart.seriesInColumns, editor.evaluation.values[sheet.name] ?? {}) : null;
  return (
    <form
      id="sheets-publish-chart"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!sheet || !data || !record) return;
        if (!(await context.mutate.patch(deck.id, {
          fields: { ...deck.fields, pendingChart: JSON.stringify({ title: chart.title, kind: chart.kind, series: data.series, sourceWorkbookId: record.id, sourceSheetName: sheet.name, sourceRef: chart.ref, capturedAt: context.now.toISOString(), linked: true }) },
        }, { expectRevision: deck.revision, event: `${chart.title} published to ${deck.title}` }))) return;
        editor.commit({ ...editor.workbook, charts: editor.workbook.charts.map((item) => (item.id === chart.id ? { ...item, snapshotAt: context.now.toISOString() } : item)) }, "Publish a chart snapshot");
        context.toast("Published to the deck", `${chart.title} waits in ${deck.title}: insert it from Charts & data. The snapshot time travels with it.`);
        close();
      }}
    >
      <ChartChoice editor={editor} value={chart.id} onChange={setChartId} />
      <Field label="Deck">
        <Select value={deck.id} onChange={(event) => setDeckId(event.target.value)}>{decks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select>
      </Field>
      <Properties rows={[
        { label: "Range", value: `${sheet?.name ?? "?"}!${chart.ref}` },
        { label: "Points", value: String(data?.series.reduce((sum, series) => sum + series.points.length, 0) ?? 0) },
        { label: "Last published", value: chart.snapshotAt ? context.dateTime(chart.snapshotAt) : "never" },
      ]} />
      {!data && <Notice tone="danger" title="The range has no chartable values">Fix the chart's range first.</Notice>}
    </form>
  );
}

/* ------------------------------ import & export ------------------------------ */

export function ExportCsv({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbookFor(context);
  const editor = useWorkbookEditor(context, record);
  const [sheetId, setSheetId] = useState(editor.sheet.id);
  const [mode, setMode] = useState<"values" | "formulas">("values");
  const sheet: Sheet = editor.workbook.sheets.find((item) => item.id === sheetId) ?? editor.sheet;
  const formulas = Object.values(sheet.cells).filter((raw) => raw.startsWith("=")).length;
  return (
    <form
      id="sheets-export"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!record) return;
        const rows = sheetToRows(sheet, editor.evaluation.values[sheet.name] ?? {}, editor.format, mode === "values");
        downloadFile(`${record.title} - ${sheet.name} (${mode}).csv`, toCsv(rows), "text/csv");
        const warnings = mode === "values" && formulas ? [`${formulas} formulas written as their computed values`] : [];
        editor.commit({ ...editor.workbook, io: [{ id: nextId("io"), at: context.now.toISOString(), kind: "export", format: `CSV (${mode})`, note: `${sheet.name}, ${rows.length} rows`, rows: rows.length, warnings }, ...editor.workbook.io] }, "Export CSV");
        context.toast("CSV written", `${rows.length} rows of ${sheet.name} as ${mode}.${warnings.length ? ` ${warnings[0]}; re-importing this file will not bring the formulas back.` : ""}`);
        close();
      }}
    >
      <Field label="Sheet"><Select value={sheet.id} onChange={(event) => setSheetId(event.target.value)}>{editor.workbook.sheets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Write">
        <Select value={mode} onChange={(event) => setMode(event.target.value as "values")}>
          <option value="values">Computed values, as the grid shows them</option>
          <option value="formulas">Formulas as text</option>
        </Select>
      </Field>
      {formulas > 0 && <Notice tone="warning" title={`${formulas} formulas on this sheet`}>{mode === "values" ? "They are written as numbers. A CSV cannot hold a formula and a value in one cell." : "They are written as text starting with =. Another program may or may not evaluate them."}</Notice>}
      <p className="vx-mini">Dates and amounts are written as the grid formats them, not converted to another locale.</p>
    </form>
  );
}

export function CompatibilityCheck({ context }: { context: ScreenContext }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const errors = editor.evaluation.errors;
  const unsupported = errors.filter((error) => error.code === "#NAME?");
  const allFormulas = editor.workbook.sheets.flatMap((sheet) => Object.entries(sheet.cells).filter(([, raw]) => raw.startsWith("=")).map(([address, raw]) => ({ sheet: sheet.name, address, raw })));
  const crossSheet = allFormulas.filter((item) => item.raw.includes("!")).length;
  return (
    <Stack gap={3}>
      <Notice tone={unsupported.length || errors.length ? "warning" : "success"} title={`Tested ${allFormulas.length} formulas just now`}>
        {unsupported.length ? `${unsupported.length} call a function this engine does not have and show #NAME?.` : "Every function used is implemented."} {errors.length - unsupported.length > 0 ? `${errors.length - unsupported.length} other formulas return an error.` : ""}
      </Notice>
      <Properties rows={[
        { label: "Functions implemented", value: String(FUNCTION_HELP.length) },
        { label: "Unsupported calls", value: unsupported.map((error) => `${error.sheetName}!${error.address}`).join(", ") || "none" },
        { label: "Cross-sheet references", value: `${crossSheet}, supported` },
        { label: "Circular references", value: String(editor.evaluation.cycles.length) },
        { label: "Array formulas", value: "Not implemented" },
        { label: "Macros", value: "Not implemented" },
      ]} />
      <Notice tone="warning" title="A CSV round trip loses formulas">Exporting values turns every formula into a number; the export says so before it writes.</Notice>
    </Stack>
  );
}

export function PublishWorkbook({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbookFor(context);
  const editor = useWorkbookEditor(context, record);
  const [scope, setScope] = useState<"workspace" | "web">("workspace");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <Empty title="No workbook is open" />;
  return (
    <form
      id="sheets-publish"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!confirmed || saving) return;
        setSaving(true);
        setError("");
        try {
        if (scope === "workspace") {
          if (!(await context.mutate.patch(record.id, { status: "published", fields: { ...record.fields, publishedAt: context.now.toISOString(), publishedBy: context.actor } }, { expectRevision: record.revision, event: `${record.title} published in the workspace` }))) return;
          context.toast("Workspace status updated", "The workbook is marked published in this local workspace. This does not create server-side read-only permissions.");
        } else {
          editor.commit({ ...editor.workbook, io: [{ id: nextId("io"), at: context.now.toISOString(), kind: "export", format: "Publish to the web", note: `${CAPABILITY_LABELS.queued_local}: no hosting is connected, nothing was published.`, warnings: ["Not connected"] }, ...editor.workbook.io] }, "Request web publishing");
          void context.mutate.log("Web publishing requested and queued locally; no hosting is connected", { entityId: record.id, type: "publish", capability: "queued_local" });
          context.toast("Queued locally, not published", "No hosting is connected, so there is no public copy and nothing left this browser. The request is on the import and export history.", "info");
        }
        close();
        } catch (cause) { setError(cause instanceof Error ? cause.message : "The workbook publishing record could not be saved."); }
        finally { setSaving(false); }
      }}
    >
      <Field label="Publish to">
        <Select value={scope} onChange={(event) => { setScope(event.target.value as "workspace" | "web"); setConfirmed(false); }}>
          <option value="workspace">Mark as published in this workspace</option>
          <option value="web">The public web</option>
        </Select>
      </Field>
      {scope === "workspace" && <Notice tone="info" title="Status only, not access enforcement">Publishing marks the local workbook as published. Server-side permissions and external read-only access are not connected.</Notice>}
      {scope === "web" && <Notice tone="warning" title="Hosting is not connected">The request is recorded as {CAPABILITY_LABELS.queued_local.toLowerCase()}. No public URL exists until a host is connected.</Notice>}
      <Properties rows={[{ label: "Status now", value: record.status }, { label: "Formula errors", value: String(editor.evaluation.errors.length) }]} />
      {editor.evaluation.errors.length > 0 && <Notice tone="warning" title="Some formulas return errors">The local publication status can still be recorded, but exported values may contain errors.</Notice>}
      {error && <Notice tone="danger" title="Publishing not recorded">{error}</Notice>}
      {saving && <p className="ds-subtle">Saving publishing record…</p>}
      <Checkbox label={scope === "web" ? "I understand no public site will be created" : "I understand this records status without granting external access"} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
    </form>
  );
}

/* ------------------------------ collaboration ------------------------------ */

export function CommentCell({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useWorkbookEditor(context, useWorkbookFor(context));
  const draftScope = `sheets:comment:${context.org.id}:${context.actor}:${context.params.id ?? "none"}:${editor.sheet.id}`;
  const [draftAddress, setAddress] = useWorkingField<string | undefined>(draftScope, "address", undefined);
  const address = draftAddress ?? cellAddress(editor.selection.active.col, editor.selection.active.row);
  const [body, setBody] = useWorkingField(draftScope, "body", "");
  const valid = /^[A-Z]{1,3}[1-9]\d*$/.test(address.trim().toUpperCase());
  return (
    <form
      id="sheets-comment"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || !body.trim()) return;
        editor.commit({ ...editor.workbook, comments: [{ id: nextId("cm"), sheetId: editor.sheet.id, address: address.trim().toUpperCase(), author: context.actor, at: context.now.toISOString(), body: body.trim(), resolved: false }, ...editor.workbook.comments] }, `Comment on ${address.toUpperCase()}`);
        clearWorkingDraft(draftScope);
        close();
      }}
    >
      <Field label={`Cell on ${editor.sheet.name}`} error={valid ? undefined : "Use an address like B4."}><TextInput value={address} onChange={(event) => setAddress(event.target.value)} style={{ fontFamily: "var(--font-mono)" }} /></Field>
      <Field label="Comment" required><TextArea rows={3} value={body} onChange={(event) => setBody(event.target.value)} required autoFocus /></Field>
      <Row gap={2}><WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
    </form>
  );
}

export function RestoreVersion({ context }: { context: ScreenContext }) {
  const record = useWorkbookFor(context);
  if (!record) return <Empty title="No workbook is open" />;
  const versions = record.history.map((snapshot, index) => ({ snapshot, index })).filter(({ snapshot }) => snapshot.body);
  if (versions.length === 0) return <Empty title="No saved versions">The record keeps a version each time it is published, imported or restored over.</Empty>;
  return (
    <Stack gap={2}>
      {versions.map(({ snapshot, index }) => {
        const stored = readWorkbook(snapshot.body);
        return (
          <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <div className="ds-grow"><strong>{context.dateTime(snapshot.at)}</strong><p className="ds-subtle">{stored.sheets.length} sheets · {stored.sheets.reduce((sum, sheet) => sum + Object.keys(sheet.cells).length, 0)} cells · {snapshot.status}</p></div>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("restore confirmation", { snapshotId: `snap-${index}` })}>Restore…</Button>
          </Row>
        );
      })}
    </Stack>
  );
}

/** Merge the stored workbook into this editor's, cell by cell, against the version both started from. */
export function mergeWorkbooks(base: Workbook, mine: Workbook, theirs: Workbook, picks: Record<string, "mine" | "theirs">): { merged: Workbook; conflicts: string[] } {
  const conflicts: string[] = [];
  const sheets = mine.sheets.map((sheet) => {
    const other = theirs.sheets.find((item) => item.id === sheet.id);
    const origin = base.sheets.find((item) => item.id === sheet.id);
    if (!other) return sheet;
    const cells = { ...sheet.cells };
    for (const address of new Set([...Object.keys(sheet.cells), ...Object.keys(other.cells), ...Object.keys(origin?.cells ?? {})])) {
      const was = origin?.cells[address] ?? "";
      const a = sheet.cells[address] ?? "";
      const b = other.cells[address] ?? "";
      if (a === b || b === was) continue;
      if (a === was) { if (b) cells[address] = b; else delete cells[address]; continue; }
      const key = `${sheet.name}!${address}`;
      conflicts.push(key);
      if (picks[key] === "theirs") { if (b) cells[address] = b; else delete cells[address]; }
    }
    return { ...sheet, cells };
  });
  return { merged: { ...mine, sheets: [...sheets, ...theirs.sheets.filter((sheet) => !mine.sheets.some((item) => item.id === sheet.id))] }, conflicts };
}

export function MergePanel({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbookFor(context);
  const editor = useWorkbookEditor(context, record);
  const [picks, setPicks] = useState<Record<string, "mine" | "theirs">>({});
  if (!record || !editor.conflict) return null;
  const theirs = readWorkbook(record.body);
  const { merged, conflicts } = mergeWorkbooks(editor.base, editor.workbook, theirs, picks);
  return (
    <Stack gap={3}>
      <Notice tone="info" title={`${conflicts.length} cells were changed on both sides`}>Cells only one side changed are merged automatically. For each cell both changed, choose which value to keep; your value is the default.</Notice>
      {conflicts.map((key) => {
        const [sheetName, address] = key.split("!");
        const mine = editor.workbook.sheets.find((sheet) => sheet.name === sheetName)?.cells[address] ?? "";
        const stored = theirs.sheets.find((sheet) => sheet.name === sheetName)?.cells[address] ?? "";
        return (
          <Row key={key} gap={2} wrap className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <span className="ds-num ds-grow">{key}</span>
            <Button size="sm" variant={picks[key] !== "theirs" ? "primary" : "ghost"} onClick={() => setPicks((current) => ({ ...current, [key]: "mine" }))}>Mine: {mine || "empty"}</Button>
            <Button size="sm" variant={picks[key] === "theirs" ? "primary" : "ghost"} onClick={() => setPicks((current) => ({ ...current, [key]: "theirs" }))}>Stored: {stored || "empty"}</Button>
          </Row>
        );
      })}
      <Button variant="primary" onClick={async () => { await editor.resolveWith(merged, `Merge with the stored version (${conflicts.length} cells chosen)`); close(); }}>Merge and save</Button>
    </Stack>
  );
}

export function SearchWorkbooks({ context, close }: { context: ScreenContext; close: () => void }) {
  const workbooks = useCollection("workbooks");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = term.length < 2 ? [] : workbooks.flatMap((record) => {
    const why: string[] = [];
    if (record.title.toLowerCase().includes(term)) why.push("title");
    if (record.summary.toLowerCase().includes(term)) why.push("summary");
    if (record.tags.some((tag) => tag.toLowerCase().includes(term))) why.push("tag");
    const workbook = readWorkbook(record.body);
    const sheet = workbook.sheets.find((item) => item.name.toLowerCase().includes(term));
    if (sheet) why.push(`sheet ${sheet.name}`);
    const cell = workbook.sheets.flatMap((item) => Object.entries(item.cells).map(([address, raw]) => ({ sheet: item.name, address, raw }))).find((item) => !item.raw.startsWith("=") && item.raw.toLowerCase().includes(term));
    if (cell) why.push(`cell ${cell.sheet}!${cell.address}`);
    return why.length ? [{ record, why }] : [];
  });
  return (
    <Stack gap={3}>
      <Field label="Search titles, summaries, tags, sheet names and cell text"><TextInput value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="margin" /></Field>
      {term.length >= 2 && matches.length === 0 && <Empty title="Nothing matches" />}
      {matches.map(({ record, why }) => (
        <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <div className="ds-grow"><strong>{record.title}</strong><p className="ds-subtle">Found in {why.join(", ")}</p></div>
          <Button size="sm" variant="ghost" onClick={() => { context.select(record.id); close(); }}>Select</Button>
          <Button size="sm" variant="secondary" onClick={() => { close(); context.navigate(context.path("/o/:org/sheets/workbooks/:id", record.id)); }}>Open</Button>
        </Row>
      ))}
    </Stack>
  );
}
