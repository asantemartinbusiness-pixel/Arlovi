import { useEffect, useMemo, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpAZ, BarChart3, Bold, Calculator,
  ChevronsLeftRight, Copy, Database, Filter, FileSpreadsheet, FileUp, FunctionSquare, Grid2x2,
  Italic, LayoutDashboard, Lock, MessageSquare, Palette, PaintBucket, Percent, PoundSterling,
  Plus, RefreshCw, Redo2, Rows3, Snowflake, Table2, Trash2, Undo2,
} from "lucide-react";
import {
  BarChart, Button, ButtonGroup, Card, Checkbox, DataGrid, DonutChart, Empty, Field, Grid,
  InspectorSection, LineChart, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat,
  StatRow, Switch, Tabs, TextArea, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { getScreenDef, registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useGuardRefresh } from "@/applications/design/sharedDoc";
import {
  ChangeChartType, CommentCell, CompareDependencies, CompatibilityCheck, ConnectSource, DrillDown, EditCell, ExportCsv,
  FixErrors, GRID_ACTIONS, MergePanel, PasteCells, PublishWorkbook, RestoreVersion, SearchWorkbooks, SendChartToDeck, SortForm, formFooter,
} from "./actions";
import { activeWorkbookEditor } from "./state";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  boxLabel, cellAddress, columnName, expandRange, FUNCTION_HELP, parseAddress, parseCsv,
  parseFormula, precedents, rangeBox, toCsv, toText, type CellResult,
} from "./engine";
import {
  chartData, clearRange, copyRange, displayValue, distinctColumnValues, emptySheet, fillRange,
  FORMAT_LABELS, hiddenRows, nextId, pasteAt, planImport, readWorkbook, rowsToSheet, setCell,
  sheetToRows, sortRange, styleRange, usedBox, usedExtent,
  type CellStyle, type NumberFormat, type Sheet, type SheetTable, type Workbook,
} from "./model";
import { SheetGrid, singleSelection } from "./grid";
import { boxAddresses, protectedSet, SAVE_LABEL, SAVE_TONE, useWorkbookEditor, type WorkbookEditor } from "./state";
import "./sheets.css";

/* ====================================================================== *
 * SHEETS — Spreadsheets, Models & Structured Data
 *
 * The calculation engine lives in ./engine.ts and is covered by
 * tests/unit/sheets-engine.test.ts: a tokeniser, a precedence-climbing
 * parser, a dependency graph with Tarjan cycle detection and a deterministic
 * topological recalculation order.
 * ====================================================================== */

function useWorkbook(context: ScreenContext): Rec | undefined {
  const fromRoute = useRecord(context.params.id);
  const all = useCollection("workbooks");
  useGuardRefresh(context);
  return fromRoute ?? all.find((record) => record.status === "active") ?? all[0];
}

/** The grid's contract actions, on its own bar (the full-chrome surface has no page header). */
function GridActions({ context }: { context: ScreenContext }) {
  const def = getScreenDef(context.screen.applicationCode, context.screen.id);
  return (
    <Toolbar label="Grid actions">
      {(def?.actions ?? []).map((action: ActionDef) => {
        const blocked = action.guard?.(context);
        return <Button key={action.id} size="sm" variant="ghost" disabled={Boolean(blocked)} title={blocked ?? action.shortcut} onClick={() => void action.run(context)}>{action.label ?? action.id}</Button>;
      })}
    </Toolbar>
  );
}

function SaveBadge({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  return (
    <Row gap={2}>
      <Pill tone={SAVE_TONE[editor.saveState]} dot>{SAVE_LABEL[editor.saveState]}</Pill>
      {editor.lastSavedAt && <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{context.relative(editor.lastSavedAt)}</span>}
    </Row>
  );
}

function ConflictNotice({ editor }: { editor: WorkbookEditor }) {
  if (!editor.conflict) return null;
  return (
    <Notice
      tone="danger"
      title="This workbook changed somewhere else"
      actions={<>
        <Button size="sm" variant="secondary" onClick={() => void editor.resolveConflict("mine")}>Keep my cells</Button>
        <Button size="sm" variant="ghost" onClick={() => void editor.resolveConflict("theirs")}>Take the stored version</Button>
      </>}
    >
      Autosave was refused because the stored revision moved on while you were editing. Nothing has been overwritten; choose which version wins.
    </Notice>
  );
}

function SheetTabs({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  return (
    <div className="sx-tabs" role="tablist" aria-label="Worksheets">
      {editor.workbook.sheets.map((sheet) => {
        const errors = Object.values(editor.evaluation.values[sheet.name] ?? {}).filter((cell) => cell.error).length;
        return (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            className="sx-tab"
            aria-selected={sheet.id === editor.workbook.activeSheetId}
            onClick={() => editor.selectSheet(sheet.id)}
            onDoubleClick={() => context.openOverlay("named range", { mode: "rename", sheetId: sheet.id })}
          >
            {sheet.colour && <span className="sx-tab-dot" style={{ background: sheet.colour }} aria-hidden />}
            {sheet.name}
            {errors > 0 && <Pill tone="danger">{errors}</Pill>}
          </button>
        );
      })}
      <button
        type="button"
        className="sx-tab"
        aria-label="Add a worksheet"
        onClick={() => {
          const name = `Sheet ${editor.workbook.sheets.length + 1}`;
          const sheet = emptySheet(name);
          editor.commit({ ...editor.workbook, sheets: [...editor.workbook.sheets, sheet], activeSheetId: sheet.id }, "Add sheet");
        }}
      ><Plus size={14} /></button>
      {editor.workbook.sheets.length > 1 && (
        <button
          type="button"
          className="sx-tab"
          aria-label={`Delete ${editor.sheet.name}`}
          onClick={() => {
            const remaining = editor.workbook.sheets.filter((item) => item.id !== editor.sheet.id);
            editor.commit({ ...editor.workbook, sheets: remaining, activeSheetId: remaining[0].id }, "Delete sheet");
            context.toast("Sheet deleted", `${editor.sheet.name} and its cells were removed. A formula that read it now shows #REF!.`, "blocked");
          }}
        ><Trash2 size={14} /></button>
      )}
    </div>
  );
}

function FormulaBar({ editor, onEdit }: { editor: WorkbookEditor; onEdit: (address: string, raw: string) => void }) {
  const address = cellAddress(editor.selection.active.col, editor.selection.active.row);
  const raw = editor.sheet.cells[address] ?? "";
  const [draft, setDraft] = useState(raw);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(address);

  useEffect(() => {
    if (!editing) { setDraft(raw); setName(boxLabel(editor.selection.box)); }
  }, [raw, editing, editor.selection.box]);

  const result = editor.values[address];
  return (
    <div className="sx-formula-bar">
      <div className="sx-namebox">
        <input
          className="ds-num"
          aria-label="Name box — type an address or a named range"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const named = editor.workbook.namedRanges.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
            const reference = named ? named.ref : name.trim();
            const box = rangeBox(reference);
            if (!box) { setName(boxLabel(editor.selection.box)); return; }
            if (named?.sheetName) {
              const target = editor.workbook.sheets.find((item) => item.name.toLowerCase() === named.sheetName!.toLowerCase());
              if (target && target.id !== editor.sheet.id) editor.selectSheet(target.id);
            }
            editor.setSelection({ active: { col: box.fromCol, row: box.fromRow }, box });
          }}
        />
      </div>
      <div className="sx-fx" aria-hidden="true">fx</div>
      <input
        className="sx-formula-input ds-num"
        aria-label={`Formula for ${address}`}
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { setEditing(false); if (draft !== raw) onEdit(address, draft); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); onEdit(address, draft); setEditing(false); (event.target as HTMLInputElement).blur(); }
          if (event.key === "Escape") { event.preventDefault(); setDraft(raw); setEditing(false); (event.target as HTMLInputElement).blur(); }
          event.stopPropagation();
        }}
        placeholder="Type a value, or = to start a formula"
      />
      <div className="sx-fx" style={{ width: 150, justifyContent: "flex-end", paddingInlineEnd: 12, borderInline: 0 }}>
        {result?.error
          ? <Pill tone="danger">{result.error}</Pill>
          : <span className="ds-num" style={{ fontSize: "var(--text-sm)", fontStyle: "normal" }}>{displayValue(result, editor.sheet.styles[address], editor.format)}</span>}
      </div>
    </div>
  );
}

function StatusStrip({ editor }: { editor: WorkbookEditor }) {
  const addresses = boxAddresses(editor.selection.box);
  const numbers = addresses
    .map((address) => editor.values[address])
    .filter((cell): cell is CellResult => Boolean(cell) && !cell.error)
    .map((cell) => (typeof cell.value === "number" ? cell.value : Number(toText(cell.value))))
    .filter((value) => !Number.isNaN(value));
  const sum = numbers.reduce((total, value) => total + value, 0);
  const extent = usedExtent(editor.sheet);
  const errors = Object.values(editor.values).filter((cell) => cell.error).length;
  return (
    <div className="sx-status">
      <span>Selection <strong className="ds-num">{boxLabel(editor.selection.box)}</strong></span>
      <span>Cells <strong className="ds-num">{addresses.length}</strong></span>
      <span>Numeric <strong className="ds-num">{numbers.length}</strong></span>
      <span>Sum <strong className="ds-num">{numbers.length ? String(Math.round(sum * 1e6) / 1e6) : "—"}</strong></span>
      <span>Average <strong className="ds-num">{numbers.length ? String(Math.round((sum / numbers.length) * 1e4) / 1e4) : "—"}</strong></span>
      <span>Used range <strong className="ds-num">{extent.cols ? `A1:${cellAddress(extent.cols - 1, extent.rows - 1)}` : "empty"}</strong></span>
      <span>Grid <strong className="ds-num">{columnName(editor.sheet.cols - 1)}{editor.sheet.rows}</strong></span>
      <span>Formulas <strong className="ds-num">{Object.keys(editor.evaluation.graph).length}</strong></span>
      <span>Errors <strong className="ds-num" style={{ color: errors ? "var(--danger)" : undefined }}>{errors}</strong></span>
      <span>Recalculated <strong className="ds-num">{editor.recalculatedAt.toLocaleTimeString(editor.format.locale)}</strong></span>
    </div>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-001 — Workbook Library
 * ====================================================================== */

function WorkbookLibrary({ context, tab }: { context: ScreenContext; tab: "Recent" | "Mine" | "Shared" | "Templates" }) {
  const workbooks = useCollection("workbooks");
  const { org, actor } = useWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [folder, setFolder] = useState("all");
  const active = useMemo(() => workbooks.filter((record) => record.status !== "archived"), [workbooks]);
  const folders = [...new Set(workbooks.map((record) => String(record.fields.folder ?? "Unfiled")))];
  const templateCount = workbooks.filter((record) => record.fields.isTemplate === true || record.status === "template").length;
  const sharedCount = workbooks.filter((record) => String(record.fields.sharedWith ?? "").split("|").some((name) => name.trim().length > 0)).length;

  const rows = useMemo(() => {
    let list = tab === "Templates" ? workbooks : active;
    if (tab === "Recent") list = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
    if (tab === "Mine") list = active.filter((record) => record.ownerName === actor);
    if (tab === "Shared") list = active.filter((record) => String(record.fields.sharedWith ?? "").split("|").some((name) => name.trim().length > 0));
    if (tab === "Templates") list = workbooks.filter((record) => record.fields.isTemplate === true || record.status === "template");
    if (status !== "all") list = list.filter((record) => record.status === status);
    if (folder !== "all") list = list.filter((record) => String(record.fields.folder ?? "Unfiled") === folder);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((record) => `${record.title} ${record.summary} ${record.tags.join(" ")}`.toLowerCase().includes(needle));
    }
    return list;
  }, [workbooks, active, tab, actor, query, status, folder]);

  const hasFilters = Boolean(query.trim()) || status !== "all" || folder !== "all";
  if (rows.length === 0 && !hasFilters) {
    return (
      <Empty title={`No ${tab.toLowerCase()} workbooks`} icon={<FileSpreadsheet size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("new workbook")}>New workbook</Button>}>
        {tab === "Templates" ? "Mark a workbook as a template to reuse its sheets and formats." : "Create a workbook, or import a CSV."}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <div className="sx-library-header">
        <div>
          <span className="sx-library-eyebrow">SHEETS / WORKBOOK LIBRARY</span>
          <h2>{tab === "Shared" ? "Recorded collaboration." : tab === "Templates" ? "Reusable workbook structures." : tab === "Mine" ? "Your models and data." : "Your workbook workspace."}</h2>
          <p>{tab === "Shared" ? "Workbooks with a locally recorded sharing list. This is not an external permission or invitation." : "Find, review and open calculation models without losing the context of your company."}</p>
        </div>
        <Button variant="primary" onClick={() => context.openOverlay("new workbook")}>New workbook</Button>
      </div>
      <div className="sx-library-metrics" aria-label="Workbook library overview">
        <div><span>Active workbooks</span><strong>{active.length}</strong><small>Available in this workspace</small></div>
        <div><span>Owned by you</span><strong>{active.filter((record) => record.ownerName === actor).length}</strong><small>Your working models</small></div>
        <div><span>Sharing recorded</span><strong>{sharedCount}</strong><small>Local record only</small></div>
        <div><span>Templates</span><strong>{templateCount}</strong><small>Reusable structures</small></div>
      </div>
      <div className="sx-library-filters">
        <Row gap={3} wrap>
          <Field label="Search"><TextInput aria-label="Search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, summary or tag" /></Field>
          <Field label="Status"><Select aria-label="Workbook status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="template">Template</option>
          </Select></Field>
          <Field label="Folder"><Select aria-label="Workbook folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
            <option value="all">All folders</option>{folders.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select></Field>
          {hasFilters && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setStatus("all"); setFolder("all"); }}>Clear filters</Button>}
        </Row>
      </div>
      {rows.length === 0 && <Empty title="No workbooks match your filters" action={<Button variant="secondary" onClick={() => { setQuery(""); setStatus("all"); setFolder("all"); }}>Reset filters</Button>}>Try another title, folder or status.</Empty>}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} workbooks`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.navigate(`/o/${org.slug}/sheets/workbooks/${id}`)}
        columns={[
          { key: "title", header: "Workbook", primary: true, sortValue: (row) => row.title, filterValue: (row) => row.title, cell: (row) => <Row gap={2}><FileSpreadsheet size={15} aria-hidden /><span className="ds-truncate">{row.title}</span></Row> },
          { key: "sheets", header: "Sheets", align: "end", cell: (row) => String(readWorkbook(row.body).sheets.length), hideBelow: 900 },
          {
            key: "formulas", header: "Formulas", align: "end", hideBelow: 1100,
            cell: (row) => String(readWorkbook(row.body).sheets.reduce((total, sheet) => total + Object.values(sheet.cells).filter((raw) => raw.startsWith("=")).length, 0)),
          },
          { key: "owner", header: "Owner", cell: (row) => row.ownerName, hideBelow: 1100 },
          { key: "folder", header: "Folder", cell: (row) => String(row.fields.folder ?? "Unfiled"), hideBelow: 1280 },
          { key: "updated", header: "Last change", align: "end", sortValue: (row) => row.updatedAt, cell: (row) => <span title={context.dateTime(row.updatedAt)}>{context.relative(row.updatedAt)}</span> },
        ]}
        bulkActions={[
          {
            label: "Duplicate",
            onRun: (selected) => selected.forEach((row) => void context.mutate.create({
              collection: "workbooks", title: `${row.title} copy`, status: "active", summary: row.summary,
              tags: row.tags, fields: { ...row.fields }, body: readWorkbook(row.body),
            }, `${row.title} duplicated`)),
          },
          { label: "Archive", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { status: "archived" }, { expectRevision: row.revision, event: `${row.title} archived` })) },
        ]}
      />
    </Stack>
  );
}

function LibraryInspector({ context }: { context: ScreenContext }) {
  const record = useRecord(context.selectedId);
  const { org, now } = useWorkspace();
  if (!record) return <Empty title="Select a workbook" icon={<FileSpreadsheet size={18} />}>Its sheets, formulas and last change appear here.</Empty>;
  const workbook = readWorkbook(record.body);
  const formulas = workbook.sheets.reduce((total, sheet) => total + Object.values(sheet.cells).filter((raw) => raw.startsWith("=")).length, 0);
  const cells = workbook.sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0);
  return (
    <Stack gap={5}>
      <InspectorSection title="Workbook">
        <Properties rows={[
          { label: "Owner", value: record.ownerName },
          { label: "Sheets", value: String(workbook.sheets.length) },
          { label: "Cells with content", value: String(cells) },
          { label: "Formulas", value: String(formulas) },
          { label: "Named ranges", value: String(workbook.namedRanges.length) },
          { label: "Charts", value: String(workbook.charts.length) },
          { label: "Changed", value: context.dateTime(record.updatedAt) },
        ]} />
      </InspectorSection>
      <InspectorSection title="Sheets">
        <Stack gap={2}>
          {workbook.sheets.map((sheet) => {
            const extent = usedExtent(sheet);
            return (
              <Row key={sheet.id} gap={2}>
                <span className="ds-grow ds-truncate">{sheet.name}</span>
                <span className="ds-subtle">{extent.cols ? `A1:${cellAddress(extent.cols - 1, extent.rows - 1)}` : "empty"}</span>
              </Row>
            );
          })}
        </Stack>
      </InspectorSection>
      <InspectorSection title="Open">
        <Row gap={2}>
          <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${org.slug}/sheets/workbooks/${record.id}`)}>Grid</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/sheets/workbooks/${record.id}/formulas`)}>Formulas</Button>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/sheets/workbooks/${record.id}/charts`)}>Charts</Button>
        </Row>
        <p className="ds-subtle" style={{ marginBlockStart: "var(--space-2)" }}>Changed {context.relative(record.updatedAt)}, read from this browser at {context.dateTime(now)}.</p>
      </InspectorSection>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-002 — Grid Editor
 * ====================================================================== */

function DataRibbon({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  const box = editor.selection.box;
  return (
    <Toolbar label="Data tools">
      <Tool label="Undo" icon={<Undo2 size={16} />} disabled={!editor.canUndo} onClick={editor.undo} />
      <Tool label="Redo" icon={<Redo2 size={16} />} disabled={!editor.canRedo} onClick={editor.redo} />
      <ToolbarSeparator />
      <Tool label="Sort A to Z by the first selected column" icon={<ArrowUpAZ size={16} />} onClick={() => {
        const next = sortRange(editor.sheet, box, box.fromCol, "asc", box.fromRow === 0, editor.values);
        editor.commitSheet(next, "Sort ascending");
        context.toast("Sorted", `${boxLabel(box)} sorted on column ${columnName(box.fromCol)}. Relative references in the moved rows were shifted with them.`);
      }} />
      <Tool label="Sort Z to A by the first selected column" icon={<ArrowDownAZ size={16} />} onClick={() => {
        const next = sortRange(editor.sheet, box, box.fromCol, "desc", box.fromRow === 0, editor.values);
        editor.commitSheet(next, "Sort descending");
      }} />
      <Tool label="Filter the selected column" icon={<Filter size={16} />} onClick={() => context.openOverlay("data validation", { mode: "filter" })} />
      <ToolbarSeparator />
      <Tool label="Fill down" icon={<Rows3 size={16} />} disabled={box.fromRow === box.toRow} onClick={() => {
        editor.commitSheet(fillRange(editor.sheet, box, "down"), "Fill down");
      }} />
      <Tool label="Fill right" icon={<ChevronsLeftRight size={16} />} disabled={box.fromCol === box.toCol} onClick={() => {
        editor.commitSheet(fillRange(editor.sheet, box, "right"), "Fill right");
      }} />
      <Tool label="Copy the selection" icon={<Copy size={16} />} onClick={() => {
        void navigator.clipboard?.writeText(copyRange(editor.sheet, box)).catch(() => undefined);
        context.toast("Copied", `${boxLabel(box)} is on the clipboard as tab separated text.`);
      }} />
      <Tool label="Clear the selection" icon={<Trash2 size={16} />} onClick={() => editor.commitSheet(clearRange(editor.sheet, box), "Clear cells")} />
      <ToolbarSeparator />
      <Tool label="Data validation" icon={<Database size={16} />} onClick={() => context.openOverlay("data validation")} />
      <Tool label="Import or export CSV" icon={<FileUp size={16} />} onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/io", context.params.id))} />
    </Toolbar>
  );
}

function FormatRibbon({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  const box = editor.selection.box;
  const first = editor.sheet.styles[cellAddress(box.fromCol, box.fromRow)];
  const apply = (patch: CellStyle, label: string) => editor.commitSheet(styleRange(editor.sheet, box, patch), label);
  return (
    <Toolbar label="Formatting">
      <Select aria-label="Number format" value={first?.format ?? "general"} onChange={(event) => apply({ format: event.target.value as NumberFormat }, "Number format")}>
        {(Object.keys(FORMAT_LABELS) as NumberFormat[]).map((key) => <option key={key} value={key}>{FORMAT_LABELS[key]}</option>)}
      </Select>
      <Tool label="Currency" icon={<PoundSterling size={16} />} pressed={first?.format === "currency"} onClick={() => apply({ format: "currency" }, "Currency format")} />
      <Tool label="Percent" icon={<Percent size={16} />} pressed={first?.format === "percent"} onClick={() => apply({ format: "percent", decimals: 1 }, "Percent format")} />
      <ToolbarSeparator />
      <Tool label="Bold" icon={<Bold size={16} />} pressed={first?.bold} onClick={() => apply({ bold: !first?.bold }, "Bold")} />
      <Tool label="Italic" icon={<Italic size={16} />} pressed={first?.italic} onClick={() => apply({ italic: !first?.italic }, "Italic")} />
      <ToolbarSeparator />
      <Tool label="Align left" icon={<AlignLeft size={16} />} pressed={first?.align === "start"} onClick={() => apply({ align: "start" }, "Align left")} />
      <Tool label="Align centre" icon={<AlignCenter size={16} />} pressed={first?.align === "center"} onClick={() => apply({ align: "center" }, "Align centre")} />
      <Tool label="Align right" icon={<AlignRight size={16} />} pressed={first?.align === "end"} onClick={() => apply({ align: "end" }, "Align right")} />
      <ToolbarSeparator />
      <Tool label="Fill the cells" icon={<PaintBucket size={16} />} onClick={() => apply({ fill: first?.fill ? undefined : "var(--warning-soft)" }, "Fill")} />
      <Tool label="Rule above the cells" icon={<Palette size={16} />} onClick={() => apply({ border: first?.border?.includes("top") ? [] : ["top"] }, "Border")} />
      <Tool label="Clear the formatting" icon={<Trash2 size={16} />} onClick={() => editor.commitSheet(styleRange(editor.sheet, box, null), "Clear formatting")} />
      <ToolbarSeparator />
      <Tool label="Format cells" icon={<Grid2x2 size={16} />} onClick={() => context.openOverlay("Format cells")} />
    </Toolbar>
  );
}

function ViewRibbon({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  const freeze = editor.sheet.freeze;
  return (
    <Toolbar label="View">
      <Tool
        label="Freeze at the selection" icon={<Snowflake size={16} />}
        pressed={freeze.rows > 0 || freeze.cols > 0}
        onClick={() => editor.commitSheet({ ...editor.sheet, freeze: { rows: editor.selection.active.row, cols: editor.selection.active.col } }, "Freeze panes")}
      />
      <Tool label="Unfreeze" icon={<ChevronsLeftRight size={16} />} disabled={freeze.rows === 0 && freeze.cols === 0} onClick={() => editor.commitSheet({ ...editor.sheet, freeze: { rows: 0, cols: 0 } }, "Unfreeze")} />
      <Pill tone="neutral">{freeze.rows} row{freeze.rows === 1 ? "" : "s"}, {freeze.cols} column{freeze.cols === 1 ? "" : "s"} frozen</Pill>
      <ToolbarSeparator />
      <Tool label="Widen the selected columns" onClick={() => {
        const colWidths = { ...editor.sheet.colWidths };
        for (let col = editor.selection.box.fromCol; col <= editor.selection.box.toCol; col += 1) {
          colWidths[String(col)] = Math.min(320, (colWidths[String(col)] ?? 104) + 32);
        }
        editor.commitSheet({ ...editor.sheet, colWidths }, "Column width");
      }}>Wider</Tool>
      <Tool label="Narrow the selected columns" onClick={() => {
        const colWidths = { ...editor.sheet.colWidths };
        for (let col = editor.selection.box.fromCol; col <= editor.selection.box.toCol; col += 1) {
          colWidths[String(col)] = Math.max(56, (colWidths[String(col)] ?? 104) - 32);
        }
        editor.commitSheet({ ...editor.sheet, colWidths }, "Column width");
      }}>Narrower</Tool>
      <ToolbarSeparator />
      <Tool label="Named ranges" icon={<Table2 size={16} />} onClick={() => context.openOverlay("named range")} />
      <Tool label="Insert a chart from the selection" icon={<BarChart3 size={16} />} onClick={() => context.openOverlay("chart picker")} />
    </Toolbar>
  );
}

function FormulaRibbon({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  const active = cellAddress(editor.selection.active.col, editor.selection.active.row);
  const box = editor.selection.box;
  function insert(formula: string) {
    editor.commitSheet(setCell(editor.sheet, active, formula), "Insert formula");
  }
  const targetRange = box.fromRow === box.toRow && box.fromCol === box.toCol
    ? `${columnName(box.fromCol)}1:${columnName(box.fromCol)}${Math.max(1, box.fromRow)}`
    : boxLabel(box);
  return (
    <Toolbar label="Formulas">
      <Tool label={`Sum ${targetRange}`} icon={<FunctionSquare size={16} />} onClick={() => insert(`=SUM(${targetRange})`)}>SUM</Tool>
      <Tool label={`Average ${targetRange}`} onClick={() => insert(`=AVERAGE(${targetRange})`)}>AVERAGE</Tool>
      <Tool label={`Count ${targetRange}`} onClick={() => insert(`=COUNT(${targetRange})`)}>COUNT</Tool>
      <Tool label={`Minimum of ${targetRange}`} onClick={() => insert(`=MIN(${targetRange})`)}>MIN</Tool>
      <Tool label={`Maximum of ${targetRange}`} onClick={() => insert(`=MAX(${targetRange})`)}>MAX</Tool>
      <ToolbarSeparator />
      <Tool label="Recalculate the workbook" icon={<RefreshCw size={16} />} onClick={() => { editor.recalculate(); context.toast("Recalculated", "Every formula was re-evaluated in dependency order."); }} />
      <Tool label="Function help" icon={<Calculator size={16} />} onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/formulas", context.params.id))} />
      <ToolbarSeparator />
      <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{FUNCTION_HELP.length} functions, listed in the Formula manager</span>
    </Toolbar>
  );
}

function ReviewRibbon({ editor, context }: { editor: WorkbookEditor; context: ScreenContext }) {
  const active = cellAddress(editor.selection.active.col, editor.selection.active.row);
  const open = editor.workbook.comments.filter((comment) => !comment.resolved);
  return (
    <Toolbar label="Review">
      <Tool label={`Comment on ${active}`} icon={<MessageSquare size={16} />} onClick={() => context.openOverlay("data validation", { mode: "comment" })} />
      <Pill tone={open.length ? "warning" : "neutral"}>{open.length} open comment{open.length === 1 ? "" : "s"}</Pill>
      <ToolbarSeparator />
      <Tool label="Protect the selected range" icon={<Lock size={16} />} onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/collab", context.params.id))} />
      <Tool label="Open collaboration and versions" onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/collab", context.params.id))}>History</Tool>
    </Toolbar>
  );
}

function GridEditorScreen({ context }: { context: ScreenContext }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const [mobilePanel, setMobilePanel] = useState<"grid" | "aside">("grid");

  if (!record) {
    return (
      <div className="sx-shell">
        <div className="sx-scroll">
          <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks`)}>Open the library</Button>} />
        </div>
      </div>
    );
  }

  const tab = context.tab || "Sheet tabs";
  const guarded = protectedSet(editor.workbook, editor.sheet);
  const hidden = hiddenRows(editor.sheet, editor.values, editor.format);
  const sheetComments = editor.workbook.comments.filter((comment) => comment.sheetId === editor.sheet.id);
  const sheetErrors = editor.evaluation.errors.filter((error) => error.sheetName === editor.sheet.name);
  const formulaCount = Object.values(editor.sheet.cells).filter((value) => value.startsWith("=")).length;
  const populatedCells = Object.keys(editor.sheet.cells).length;

  function commitCell(address: string, raw: string) {
    if (guarded.has(address)) {
      context.toast("That cell is protected", "A protected range is listed in Collaboration with the reason it was protected.", "blocked");
      return;
    }
    editor.commitSheet(setCell(editor.sheet, address, raw), `Edit ${address}`);
  }

  return (
    <div className="sx-shell">
      <div className="sx-bar">
        <div className="sx-bar-title">
          <strong>{record.title}</strong>
          <span>{editor.sheet.name} · {editor.workbook.sheets.length} sheet{editor.workbook.sheets.length === 1 ? "" : "s"} · {String(record.fields.folder ?? "Unfiled")}</span>
        </div>
        <span className="ds-grow" />
        <GridActions context={context} />
        <SaveBadge editor={editor} context={context} />
        <Button size="sm" variant="secondary" disabled={editor.saveState === "clean" || editor.saveState === "saved"} onClick={() => void editor.saveNow()}>Save now</Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={15} />} onClick={() => { editor.recalculate(); context.toast("Recalculated", "Formulas were re-evaluated in topological order."); }}>Recalculate</Button>
        <ButtonGroup label="Panels on narrow screens">
          <Button size="sm" variant={mobilePanel === "aside" ? "secondary" : "ghost"} aria-pressed={mobilePanel === "aside"} onClick={() => setMobilePanel(mobilePanel === "aside" ? "grid" : "aside")}>Inspector</Button>
        </ButtonGroup>
      </div>

      <section className="sx-workflow-strip" aria-label="Workbook working status">
        <div className="sx-workflow-context">
          <span className="sx-library-eyebrow">ACTIVE SHEET</span>
          <Row gap={2} wrap>
            <Pill tone={record.status === "archived" ? "warning" : "neutral"}>{record.status.replace("_", " ")}</Pill>
            <strong>{editor.sheet.name}</strong>
            <span className="ds-subtle">{populatedCells} populated cells · {formulaCount} formulas</span>
            {sheetErrors.length > 0 && <Pill tone="danger">{sheetErrors.length} calculation error{sheetErrors.length === 1 ? "" : "s"}</Pill>}
          </Row>
          <span className="ds-subtle">Values are calculated locally. Editing and sharing do not imply a cloud spreadsheet session.</span>
        </div>
        <div className="sx-workflow-actions">
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks`)}>Library</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/formulas", record.id))}>Formula audit</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id/charts", record.id))}>Charts</Button>
        </div>
      </section>
      <div className="sx-bar" style={{ minHeight: 40, paddingBlock: 0 }}>
        <Tabs
          label="Grid modes"
          value={tab}
          onChange={context.setTab}
          items={[
            { id: "Sheet tabs", label: "Home" },
            { id: "Data", label: "Data" },
            { id: "Formulas", label: "Formulas", count: Object.keys(editor.evaluation.graph).length },
            { id: "Review", label: "Review", count: editor.workbook.comments.filter((comment) => !comment.resolved).length },
            { id: "View", label: "View" },
          ]}
        />
      </div>

      <div className="sx-ribbon">
        {tab === "Sheet tabs" && <FormatRibbon editor={editor} context={context} />}
        {tab === "Data" && <DataRibbon editor={editor} context={context} />}
        {tab === "Formulas" && <FormulaRibbon editor={editor} context={context} />}
        {tab === "Review" && <ReviewRibbon editor={editor} context={context} />}
        {tab === "View" && <ViewRibbon editor={editor} context={context} />}
      </div>

      <FormulaBar editor={editor} onEdit={commitCell} />

      {editor.conflict && <div style={{ padding: "var(--space-3) var(--space-4)" }}><ConflictNotice editor={editor} /></div>}

      <div className="sx-body" data-mobile={mobilePanel}>
        <div className="sx-main">
          <SheetGrid
            sheet={editor.sheet}
            values={editor.values}
            format={editor.format}
            selection={editor.selection}
            onSelectionChange={editor.setSelection}
            onCommit={commitCell}
            onClear={(box) => editor.commitSheet(clearRange(editor.sheet, box), "Clear cells")}
            onPaste={(text, col, row) => {
              editor.commitSheet(pasteAt(editor.sheet, text, col, row), "Paste");
              context.toast("Pasted", "Values were written as typed. A pasted formula keeps its references exactly as pasted.");
            }}
            onCopy={(box) => copyRange(editor.sheet, box)}
            hiddenRows={hidden}
            comments={sheetComments.map((comment) => ({ address: comment.address, resolved: comment.resolved }))}
            protectedAddresses={guarded}
            height={560}
          />
          <SheetTabs editor={editor} context={context} />
          <StatusStrip editor={editor} />
        </div>

        <div className="sx-aside">
          <InspectorSection title="Cell">
            <Properties rows={[
              { label: "Address", value: cellAddress(editor.selection.active.col, editor.selection.active.row) },
              { label: "Raw", value: <code style={{ fontSize: "var(--text-xs)" }}>{editor.sheet.cells[cellAddress(editor.selection.active.col, editor.selection.active.row)] || "(empty)"}</code> },
              { label: "Value", value: displayValue(editor.values[cellAddress(editor.selection.active.col, editor.selection.active.row)], editor.sheet.styles[cellAddress(editor.selection.active.col, editor.selection.active.row)], editor.format) || "(empty)" },
              { label: "Format", value: FORMAT_LABELS[editor.sheet.styles[cellAddress(editor.selection.active.col, editor.selection.active.row)]?.format ?? "general"] },
              { label: "Selection", value: boxLabel(editor.selection.box) },
            ]} />
          </InspectorSection>
          <InspectorSection title="Precedents">
            <PrecedentList editor={editor} />
          </InspectorSection>
          <InspectorSection title="Errors on this sheet">
            {editor.evaluation.errors.filter((error) => error.sheetName === editor.sheet.name).length === 0
              ? <span className="ds-subtle">No formula on this sheet is in error.</span>
              : (
                <Stack gap={2}>
                  {editor.evaluation.errors.filter((error) => error.sheetName === editor.sheet.name).map((error) => (
                    <Row key={error.key} gap={2}>
                      <Pill tone="danger">{error.code}</Pill>
                      <button
                        type="button"
                        className="ds-link"
                        onClick={() => {
                          const parsed = parseAddress(error.address);
                          if (parsed) editor.setSelection(singleSelection(parsed.col, parsed.row));
                        }}
                      >{error.address}</button>
                      <code className="ds-grow ds-truncate" style={{ fontSize: "var(--text-2xs)" }}>{error.source}</code>
                    </Row>
                  ))}
                </Stack>
              )}
          </InspectorSection>
          <InspectorSection title="Named ranges">
            {editor.workbook.namedRanges.length === 0 ? <span className="ds-subtle">None defined.</span> : (
              <Properties rows={editor.workbook.namedRanges.map((range) => ({ label: range.name, value: `${range.sheetName ?? editor.sheet.name}!${range.ref}` }))} />
            )}
            <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => context.openOverlay("named range")}>Define a range</Button>
          </InspectorSection>
          <InspectorSection title="Keyboard">
            <Properties rows={[
              { label: "Move", value: "Arrow keys" },
              { label: "Extend selection", value: "Shift + arrows, Shift + click" },
              { label: "Jump", value: "Cmd/Ctrl + arrows, Page up/down, Home" },
              { label: "Edit", value: "Enter or F2, or just start typing" },
              { label: "Commit", value: "Enter (down), Tab (right)" },
              { label: "Clear", value: "Delete or Backspace" },
              { label: "Copy / paste", value: "Cmd/Ctrl + C / V" },
            ]} />
          </InspectorSection>
        </div>
      </div>
    </div>
  );
}

function PrecedentList({ editor }: { editor: WorkbookEditor }) {
  const address = cellAddress(editor.selection.active.col, editor.selection.active.row);
  const raw = editor.sheet.cells[address] ?? "";
  if (!raw.startsWith("=")) return <span className="ds-subtle">This cell holds a value, so it reads nothing.</span>;
  let reads: string[] = [];
  try {
    const node = parseFormula(raw);
    reads = [...new Set(precedents(node, editor.sheet.name, (name) => editor.workbook.namedRanges.find((item) => item.name.toUpperCase() === name.toUpperCase())))];
  } catch {
    return <Notice tone="danger" title="This formula does not parse">{raw}</Notice>;
  }
  const dependents = Object.entries(editor.evaluation.graph)
    .filter(([, list]) => list.includes(`${editor.sheet.name}!${address}`))
    .map(([key]) => key);
  return (
    <Stack gap={3}>
      <div>
        <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Reads {reads.length} cell{reads.length === 1 ? "" : "s"}</span>
        <Row gap={1} wrap>{reads.slice(0, 24).map((key) => <Pill key={key} tone="accent">{key.split("!").pop()}</Pill>)}</Row>
        {reads.length > 24 && <span className="ds-subtle">and {reads.length - 24} more</span>}
      </div>
      <div>
        <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Read by {dependents.length} formula{dependents.length === 1 ? "" : "s"}</span>
        <Row gap={1} wrap>{dependents.slice(0, 16).map((key) => <Pill key={key}>{key}</Pill>)}</Row>
      </div>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-003 — Formula Manager
 * ====================================================================== */

function FormulaManager({ context, tab }: { context: ScreenContext; tab: "All" | "Errors" | "Dependencies" | "Named ranges" }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} />;

  const formulas = editor.workbook.sheets.flatMap((sheet) => Object.entries(sheet.cells)
    .filter(([, raw]) => raw.startsWith("="))
    .map(([address, raw]) => {
      const result = editor.evaluation.values[sheet.name]?.[address];
      return {
        id: `${sheet.name}!${address}`, sheetName: sheet.name, sheetId: sheet.id, address, source: raw,
        error: result?.error, value: result ? displayValue(result, sheet.styles[address], editor.format) : "",
        reads: (editor.evaluation.graph[`${sheet.name}!${address}`] ?? []).length,
      };
    }));

  const formulaErrors = editor.evaluation.errors.length;
  const formulaCycles = editor.evaluation.cycles.length;
  const formulaReady = formulaErrors === 0 && formulaCycles === 0;
  const overview = (
    <div className="sx-formula-overview">
      <div className="sx-formula-header">
        <span className="sx-library-eyebrow">SHEETS / CALCULATION AUDIT</span>
        <h2>Understand every result.</h2>
        <p>Trace formula dependencies, inspect errors and navigate named ranges. All calculations are evaluated in this workbook, not by an external service.</p>
      </div>
      <div className="sx-formula-metrics" aria-label="Calculation overview">
        <div><span>Formulas</span><strong>{formulas.length}</strong><small>Across {editor.workbook.sheets.length} sheets</small></div>
        <div><span>Formula errors</span><strong>{formulaErrors}</strong><small>{formulaReady ? "No errors reported" : "Review before sharing"}</small></div>
        <div><span>Circular dependencies</span><strong>{formulaCycles}</strong><small>Identified by the calculation graph</small></div>
      </div>
      <Row gap={2} wrap>
        <Button variant="secondary" size="sm" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}`)}>Back to grid</Button>
        <Button variant="secondary" size="sm" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}/io`)}>Import & export</Button>
        <Pill tone={formulaReady ? "success" : "warning"}>{formulaReady ? "Calculation checks clear" : "Review required"}</Pill>
      </Row>
    </div>
  );

  if (tab === "Errors") {
    const errors = editor.evaluation.errors;
    const cycles = editor.evaluation.cycles;
    return (
      <Stack gap={4}>
        {overview}
        <StatRow>
          <Stat prov="human" label="Formulas" value={String(formulas.length)} />
          <Stat prov="human" label="In error" value={String(errors.length)} meta={errors.length ? "Shown explicitly, never hidden" : "All evaluating"} />
          <Stat prov="human" label="In a cycle" value={String(cycles.length)} meta={cycles.length ? "Reported as #CYCLE!" : "No cycle detected"} />
        </StatRow>
        {cycles.length > 0 && (
          <Notice tone="danger" title={`${cycles.length} cell${cycles.length === 1 ? " is" : "s are"} in or downstream of a circular reference`}
            actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("circular reference")}>Show the cycle</Button>}>
            A cycle has no defined value, so those cells report #CYCLE! rather than a number from a stale pass. Everything that reads a cycle carries the same error.
          </Notice>
        )}
        {errors.length === 0 ? <Empty title="No formula is in error" icon={<FunctionSquare size={20} />} /> : (
          <DataGrid
            rows={errors.map((error) => ({ ...error, id: error.key }))}
            rowId={(row) => row.id}
            label="Formula errors"
            rowTone={() => "danger"}
            columns={[
              { key: "where", header: "Cell", primary: true, cell: (row) => `${row.sheetName}!${row.address}`, sortValue: (row) => row.key },
              { key: "code", header: "Error", cell: (row) => <Pill tone="danger">{row.code}</Pill> },
              { key: "source", header: "Formula", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.source}</code>, filterValue: (row) => row.source },
              {
                key: "meaning", header: "What it means", cell: (row) => ({
                  "#CYCLE!": "The formula depends on itself, directly or through other cells.",
                  "#NAME?": "A function or name the engine does not implement.",
                  "#REF!": "A reference to a sheet or cell that is not in the workbook.",
                  "#DIV/0!": "A division by zero.",
                  "#VALUE!": "An argument of the wrong kind.",
                  "#N/A": "A lookup found no match.",
                  "#PARSE!": "The formula text could not be parsed.",
                }[row.code] ?? "Unknown"),
              },
            ]}
            onOpen={(id) => context.openOverlay("Formula inspector", { key: id })}
            bulkActions={[{
              label: "Replace with IFERROR",
              onRun: (rows) => {
                let workbook = editor.workbook;
                for (const row of rows) {
                  if (row.code === "#CYCLE!") continue;
                  const sheet = workbook.sheets.find((item) => item.name === row.sheetName);
                  if (!sheet) continue;
                  const wrapped = `=IFERROR(${row.source.slice(1)},0)`;
                  workbook = { ...workbook, sheets: workbook.sheets.map((item) => (item.id === sheet.id ? setCell(item, row.address, wrapped) : item)) };
                }
                editor.commit(workbook, "Wrap in IFERROR");
                context.toast("Wrapped", "Each selected formula now falls back to zero. A cycle cannot be fixed this way and was left alone.");
              },
            }]}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Dependencies") {
    const graph = Object.entries(editor.evaluation.graph);
    const order = editor.evaluation.order;
    return (
      <Stack gap={4}>
        {overview}
      <Grid>
        <Card span={7} eyebrow="DEPENDENCIES" prov="human" title="Recalculation order" subtitle={`${order.length} formulas, computed in this order every time`}>
          {order.length === 0 ? <Empty title="No formulas" /> : (
            <ol className="ds-stack ds-gap-1" style={{ paddingInlineStart: "var(--space-6)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
              {order.map((key) => <li key={key}>{key} <span className="ds-subtle">reads {(editor.evaluation.graph[key] ?? []).length}</span></li>)}
            </ol>
          )}
          <Notice tone="neutral">The order comes from a topological sort with a stable tie-break, so the same workbook always recalculates identically.</Notice>
        </Card>
        <Card span={5} eyebrow="DEPENDENCIES" prov="human" title="Most depended on" subtitle="Cells that many formulas read">
          {(() => {
            const counts = new Map<string, number>();
            for (const [, reads] of graph) for (const read of reads) counts.set(read, (counts.get(read) ?? 0) + 1);
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (top.length === 0) return <Empty title="Nothing is read by a formula" />;
            return (
              <BarChart
                title="Formulas reading each cell"
                height={220}
                format={(value) => String(Math.round(value))}
                series={[{ name: "Readers", points: top.map(([key, count]) => ({ label: key.split("!").pop() ?? key, value: count })) }]}
              />
            );
          })()}
        </Card>
        <Card span={12} eyebrow="DEPENDENCIES" prov="human" title="Edges" subtitle={`${graph.reduce((total, [, reads]) => total + reads.length, 0)} dependencies`}>
          <DataGrid
            rows={graph.map(([key, reads]) => ({ id: key, key, reads }))}
            rowId={(row) => row.id}
            label="Dependency edges"
            columns={[
              { key: "cell", header: "Formula cell", primary: true, cell: (row) => row.key, filterValue: (row) => row.key },
              { key: "count", header: "Reads", align: "end", cell: (row) => String(row.reads.length), sortValue: (row) => row.reads.length },
              { key: "list", header: "Cells read", cell: (row) => <span className="ds-truncate">{row.reads.slice(0, 12).join(", ")}{row.reads.length > 12 ? ` +${row.reads.length - 12}` : ""}</span> },
              { key: "cycle", header: "In a cycle", cell: (row) => (editor.evaluation.cycles.includes(row.key) ? <Pill tone="danger">Yes</Pill> : <Pill tone="success">No</Pill>) },
            ]}
            onOpen={(id) => context.openOverlay("Formula inspector", { key: id })}
          />
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (tab === "Named ranges") {
    return (
      <Stack gap={4}>
        {editor.workbook.namedRanges.length === 0 ? (
          <Empty title="No named ranges" icon={<Table2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("named range")}>Define one</Button>}>
            A named range lets a formula read <code>=SUM(PipelineNet)</code> instead of a bare rectangle.
          </Empty>
        ) : (
          <DataGrid
            rows={editor.workbook.namedRanges.map((range) => ({ ...range, id: range.name }))}
            rowId={(row) => row.id}
            label="Named ranges"
            columns={[
              { key: "name", header: "Name", primary: true, cell: (row) => <code>{row.name}</code>, filterValue: (row) => row.name },
              { key: "ref", header: "Refers to", cell: (row) => `${row.sheetName ?? editor.sheet.name}!${row.ref}` },
              { key: "cells", header: "Cells", align: "end", cell: (row) => String(expandRange(row.ref).length) },
              {
                key: "used", header: "Used by", cell: (row) => {
                  const used = editor.workbook.sheets.flatMap((sheet) => Object.entries(sheet.cells)
                    .filter(([, raw]) => raw.toUpperCase().includes(row.name.toUpperCase()))
                    .map(([address]) => `${sheet.name}!${address}`));
                  return used.length ? used.join(", ") : <span className="ds-subtle">Not referenced</span>;
                },
              },
            ]}
            bulkActions={[{
              label: "Delete", tone: "danger",
              onRun: (rows) => {
                editor.commit({ ...editor.workbook, namedRanges: editor.workbook.namedRanges.filter((item) => !rows.some((row) => row.name === item.name)) }, "Delete named range");
                context.toast("Deleted", "A formula that used the name now reports #NAME? rather than silently returning zero.", "blocked");
              },
            }]}
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="info" title={`${FUNCTION_HELP.length} functions are implemented`}>
        Anything outside that list reports #NAME? rather than being approximated. Open a formula to see what it reads and what reads it.
      </Notice>
      {formulas.length === 0 ? <Empty title="This workbook has no formulas" icon={<FunctionSquare size={20} />} /> : (
        <DataGrid
          rows={formulas}
          rowId={(row) => row.id}
          label="Formulas"
          rowTone={(row) => (row.error ? "danger" : undefined)}
          columns={[
            { key: "cell", header: "Cell", primary: true, cell: (row) => `${row.sheetName}!${row.address}`, sortValue: (row) => row.id, filterValue: (row) => row.id },
            { key: "source", header: "Formula", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.source}</code>, filterValue: (row) => row.source },
            { key: "value", header: "Value", align: "end", cell: (row) => (row.error ? <Pill tone="danger">{row.error}</Pill> : <span className="ds-num">{row.value}</span>) },
            { key: "reads", header: "Reads", align: "end", cell: (row) => String(row.reads), sortValue: (row) => row.reads },
          ]}
          onOpen={(id) => context.openOverlay("Formula inspector", { key: id })}
          bulkActions={[{
            label: "Copy as text",
            onRun: (rows) => {
              void navigator.clipboard?.writeText(rows.map((row) => `${row.id}\t${row.source}`).join("\n")).catch(() => undefined);
              context.toast("Copied", `${rows.length} formula${rows.length === 1 ? "" : "s"} copied as text.`);
            },
          }]}
        />
      )}
      <Card eyebrow="ENGINE" title="Function reference" subtitle="Every function the engine implements">
        <DataGrid
          rows={FUNCTION_HELP.map((item) => ({ ...item, id: item.name }))}
          rowId={(row) => row.id}
          label="Functions"
          dense
          columns={[
            { key: "name", header: "Name", primary: true, cell: (row) => <code>{row.name}</code>, filterValue: (row) => `${row.name} ${row.summary}` },
            { key: "signature", header: "Signature", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.signature}</code> },
            { key: "summary", header: "What it does", cell: (row) => row.summary },
          ]}
          onOpen={(id) => context.openOverlay("function help", { name: id })}
        />
      </Card>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-004 — Data Tables
 * ====================================================================== */

function DataTables({ context, tab }: { context: ScreenContext; tab: "Tables" | "Views" | "Relationships" | "Validation" }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} />;

  if (tab === "Views") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A view is a filter and a sort kept on the sheet">
          Views here are the sheet's own filters and sort, so what you see in the grid and what a formula reads never diverge.
        </Notice>
        {editor.workbook.sheets.map((sheet) => (
          <Card key={sheet.id} eyebrow="VIEW" prov="human" title={sheet.name} subtitle={`${sheet.filters.length} filter${sheet.filters.length === 1 ? "" : "s"}${sheet.sort ? `, sorted on column ${columnName(sheet.sort.column)} ${sheet.sort.direction}` : ", not sorted"}`}>
            {sheet.filters.length === 0 && !sheet.sort ? <Empty title="No view applied" /> : (
              <Properties rows={[
                ...sheet.filters.map((filter) => ({ label: `Filter on ${columnName(filter.column)}`, value: filter.keep.length ? filter.keep.join(", ") : "Everything" })),
                ...(sheet.sort ? [{ label: "Sort", value: `${columnName(sheet.sort.column)} ${sheet.sort.direction}` }] : []),
              ]} />
            )}
            {(sheet.filters.length > 0 || sheet.sort) && (
              <Button size="sm" variant="ghost" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => {
                editor.commit({ ...editor.workbook, sheets: editor.workbook.sheets.map((item) => (item.id === sheet.id ? { ...item, filters: [], sort: undefined } : item)) }, "Clear view");
              }}>Clear the view</Button>
            )}
          </Card>
        ))}
      </Stack>
    );
  }

  if (tab === "Relationships") {
    const crossSheet = Object.entries(editor.evaluation.graph)
      .flatMap(([key, reads]) => reads
        .filter((read) => read.split("!")[0] !== key.split("!")[0])
        .map((read) => ({ id: `${key}->${read}`, from: key, to: read })));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Relationships are the formula links between sheets">
          Nothing is inferred from a column name. A relationship exists when one sheet's formula reads another sheet's cells, which is exactly what the dependency graph records.
        </Notice>
        {crossSheet.length === 0 ? <Empty title="No sheet reads another" icon={<Table2 size={20} />} /> : (
          <DataGrid
            rows={crossSheet}
            rowId={(row) => row.id}
            label="Cross-sheet references"
            columns={[
              { key: "from", header: "Formula", primary: true, cell: (row) => row.from, filterValue: (row) => row.from },
              { key: "to", header: "Reads", cell: (row) => row.to },
              { key: "sheets", header: "Across", cell: (row) => `${row.from.split("!")[0]} → ${row.to.split("!")[0]}` },
            ]}
            onOpen={(id) => context.openOverlay("relation preview", { edge: id })}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Validation") {
    const table = editor.workbook.tables[0];
    if (!table) return <Empty title="Define a table first" icon={<Database size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Column editor", { mode: "create" })}>Create a table</Button>} />;
    const sheet = editor.sheet;
    const box = rangeBox(table.ref);
    const breaches: { id: string; address: string; column: string; expected: string; found: string }[] = [];
    if (box) {
      for (let row = box.fromRow + (table.headerRow ? 1 : 0); row <= box.toRow; row += 1) {
        table.columns.forEach((column, index) => {
          const address = cellAddress(box.fromCol + index, row);
          const raw = sheet.cells[address] ?? "";
          if (!raw && column.required) breaches.push({ id: address, address, column: column.name, expected: "A value is required", found: "(empty)" });
          if (raw && (column.type === "number" || column.type === "currency" || column.type === "percent")) {
            const result = editor.evaluation.values[sheet.name]?.[address];
            const numeric = typeof result?.value === "number" || (!Number.isNaN(Number(raw)) && raw.trim() !== "");
            if (!numeric && !result?.formula) breaches.push({ id: address, address, column: column.name, expected: column.type, found: raw });
          }
          if (raw && column.rule && column.rule.includes(",")) {
            const allowed = column.rule.split(/,| or /).map((value) => value.trim().toLowerCase()).filter(Boolean);
            if (!allowed.includes(raw.trim().toLowerCase())) breaches.push({ id: address, address, column: column.name, expected: column.rule, found: raw });
          }
        });
      }
    }
    return (
      <Stack gap={4}>
        <Notice tone="info" title={`Validation scope: ${sheet.name} · ${table.name}`}>
          Rules are checked against the currently active sheet. Table definitions do not yet store a sheet identifier, so results are not presented as workbook-wide validation.
        </Notice>
        <StatRow>
          <Stat prov="human" label="Columns with a rule" value={String(table.columns.filter((column) => column.rule || column.required).length)} />
          <Stat prov="human" label="Rows checked" value={box ? String(box.toRow - box.fromRow + (table.headerRow ? 0 : 1)) : "0"} />
          <Stat prov="human" label="Breaches" value={String(breaches.length)} meta={breaches.length ? "Reported, not corrected" : "Everything inside its rule"} />
        </StatRow>
        {breaches.length === 0 ? <Empty title="Every value is inside its rule" icon={<Database size={20} />} /> : (
          <DataGrid
            rows={breaches}
            rowId={(row) => row.id}
            label="Validation breaches"
            rowTone={() => "warning"}
            columns={[
              { key: "address", header: "Cell", primary: true, cell: (row) => row.address },
              { key: "column", header: "Column", cell: (row) => row.column },
              { key: "expected", header: "Rule", cell: (row) => row.expected },
              { key: "found", header: "Found", cell: (row) => <code>{row.found}</code> },
            ]}
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <div className="sx-formula-overview">
        <div className="sx-formula-header"><span className="sx-library-eyebrow">SHEETS / STRUCTURED DATA</span><h2>Structure behind the cells.</h2>
          <p>Review table definitions, typed columns and validation rules. Table schemas describe ranges; they do not move or rewrite the underlying values.</p>
        </div>
        <div className="sx-formula-metrics" aria-label="Structured data overview">
          <div><span>Tables</span><strong>{editor.workbook.tables.length}</strong><small>Defined structures</small></div>
          <div><span>Columns</span><strong>{editor.workbook.tables.reduce((total, table) => total + table.columns.length, 0)}</strong><small>Across all definitions</small></div>
          <div><span>Validation rules</span><strong>{editor.workbook.tables.reduce((total, table) => total + table.columns.filter((column) => column.required || column.rule).length, 0)}</strong><small>Required and constrained fields</small></div>
        </div>
        <Row gap={2} wrap><Button size="sm" variant="primary" onClick={() => context.openOverlay("Column editor", { mode: "create" })}>Create a table</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}`)}>Back to grid</Button></Row>
      </div>
      {editor.workbook.tables.length === 0 ? (
        <Empty title="No structured table" icon={<Table2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Column editor", { mode: "create" })}>Create a table</Button>}>
          A table gives a range a name, a header row and a type per column, so validation and relationships have something to check against.
        </Empty>
      ) : editor.workbook.tables.map((table) => {
        const box = rangeBox(table.ref);
        return (
          <Card
            key={table.id}
            eyebrow="TABLE"
            prov="human"
            title={table.name}
            subtitle={`${table.ref} · ${table.columns.length} columns · ${box ? box.toRow - box.fromRow + (table.headerRow ? 0 : 1) : 0} rows`}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Column editor", { tableId: table.id })}>Edit schema</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("relation preview", { tableId: table.id })}>References</Button>
            </>}
          >
            <DataGrid
              rows={table.columns.map((column, index) => ({ ...column, id: `${table.id}-${index}`, index }))}
              rowId={(row) => row.id}
              label={`${table.name} schema`}
              dense
              filterable={false}
              columns={[
                { key: "name", header: "Column", primary: true, cell: (row) => row.name },
                { key: "letter", header: "In the sheet", cell: (row) => (box ? columnName(box.fromCol + row.index) : "—") },
                { key: "type", header: "Type", cell: (row) => <Pill tone="accent">{row.type}</Pill> },
                { key: "required", header: "Required", cell: (row) => (row.required ? <Pill tone="warning">Yes</Pill> : "No") },
                { key: "rule", header: "Rule", cell: (row) => row.rule ?? "—" },
              ]}
            />
          </Card>
        );
      })}
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-005 — Charts & Dashboards
 * ====================================================================== */

function ChartView({ editor, chart }: { editor: WorkbookEditor; chart: Workbook["charts"][number] }) {
  const sheet = editor.workbook.sheets.find((item) => item.id === chart.sheetId) ?? editor.sheet;
  const values = editor.evaluation.values[sheet.name] ?? {};
  const data = chartData(sheet, chart.ref, chart.seriesInColumns, values);
  if (!data || data.series.length === 0) {
    return <Empty title="This chart has no series" icon={<BarChart3 size={20} />}>The range {chart.ref} on {sheet.name} produced no numeric series.</Empty>;
  }
  const footer = data.skipped.length
    ? `${data.skipped.length} cell${data.skipped.length === 1 ? "" : "s"} were not numeric and were skipped: ${data.skipped.slice(0, 6).join(", ")}.`
    : `Built from ${chart.ref} on ${sheet.name}.`;
  if (chart.kind === "line") {
    return <LineChart title={chart.title} series={data.series} height={260} format={(value) => String(Math.round(value))} footer={footer} />;
  }
  if (chart.kind === "donut") {
    return <DonutChart title={chart.title} points={data.series[0].points} format={(value) => String(Math.round(value))} />;
  }
  return <BarChart title={chart.title} series={data.series} height={260} format={(value) => String(Math.round(value))} footer={footer} />;
}

function ChartsScreen({ context, tab }: { context: ScreenContext; tab: "Charts" | "Pivot" | "Dashboard" | "Presentation" }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const [pivot, setPivot] = useState({ rowCol: 1, valueCol: 4, aggregate: "sum" as "sum" | "count" | "average" });
  // Every hook runs on every render: the Presentation tab needs the decks, so
  // the read is hoisted above the branch rather than called inside it.
  const decks = useCollection("decks");
  if (!record) return <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} />;

  if (tab === "Pivot") {
    const sheet = editor.sheet;
    const box = usedBox(sheet);
    const groups = new Map<string, number[]>();
    for (let row = box.fromRow + 1; row <= box.toRow; row += 1) {
      const keyCell = editor.values[cellAddress(pivot.rowCol, row)];
      const valueCell = editor.values[cellAddress(pivot.valueCol, row)];
      if (!keyCell && !valueCell) continue;
      const key = toText(keyCell?.value ?? "(blank)") || "(blank)";
      const value = typeof valueCell?.value === "number" ? valueCell.value : Number(toText(valueCell?.value ?? ""));
      const list = groups.get(key) ?? [];
      if (!Number.isNaN(value)) list.push(value);
      groups.set(key, list);
    }
    const rows = [...groups.entries()].map(([key, list]) => ({
      id: key, key, count: list.length,
      value: pivot.aggregate === "count" ? list.length : pivot.aggregate === "average" ? (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0) : list.reduce((a, b) => a + b, 0),
    }));
    return (
      <Stack gap={4}>
        <Row gap={3} wrap>
          <Field label="Group by column">
            <Select aria-label="Group by column" value={String(pivot.rowCol)} onChange={(event) => setPivot((current) => ({ ...current, rowCol: Number(event.target.value) }))}>
              {Array.from({ length: Math.max(1, box.toCol + 1) }, (_, col) => (
                <option key={col} value={col}>{columnName(col)} — {toText(editor.values[cellAddress(col, box.fromRow)]?.value ?? "")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Value column">
            <Select aria-label="Value column" value={String(pivot.valueCol)} onChange={(event) => setPivot((current) => ({ ...current, valueCol: Number(event.target.value) }))}>
              {Array.from({ length: Math.max(1, box.toCol + 1) }, (_, col) => (
                <option key={col} value={col}>{columnName(col)} — {toText(editor.values[cellAddress(col, box.fromRow)]?.value ?? "")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Aggregate">
            <Select aria-label="Aggregate" value={pivot.aggregate} onChange={(event) => setPivot((current) => ({ ...current, aggregate: event.target.value as "sum" | "count" | "average" }))}>
              <option value="sum">Sum</option><option value="count">Count</option><option value="average">Average</option>
            </Select>
          </Field>
        </Row>
        {rows.length === 0 ? <Empty title="Nothing to group" icon={<LayoutDashboard size={20} />} /> : (
          <Grid>
            <Card span={6} eyebrow="PIVOT" prov="human" title="Pivot" subtitle={`${rows.length} groups from ${sheet.name}`}>
              <DataGrid
                rows={rows}
                rowId={(row) => row.id}
                label="Pivot result"
                filterable={false}
                columns={[
                  { key: "key", header: columnName(pivot.rowCol), primary: true, cell: (row) => row.key },
                  { key: "count", header: "Rows", align: "end", cell: (row) => String(row.count) },
                  { key: "value", header: pivot.aggregate, align: "end", cell: (row) => <span className="ds-num">{Math.round(row.value * 100) / 100}</span>, sortValue: (row) => row.value },
                ]}
                summary={<span>Total {Math.round(rows.reduce((total, row) => total + row.value, 0) * 100) / 100}</span>}
              />
            </Card>
            <Card span={6} eyebrow="PIVOT" prov="human" title="As a chart" subtitle="The same numbers, drawn">
              <BarChart
                title={`${pivot.aggregate} by ${columnName(pivot.rowCol)}`}
                height={240}
                format={(value) => String(Math.round(value))}
                series={[{ name: pivot.aggregate, points: rows.map((row) => ({ label: row.key, value: row.value })) }]}
              />
            </Card>
          </Grid>
        )}
      </Stack>
    );
  }

  if (tab === "Dashboard") {
    return (
      <Stack gap={4}>
        <div className="sx-formula-overview">
          <div className="sx-formula-header"><span className="sx-library-eyebrow">SHEETS / VISUAL ANALYSIS</span><h2>Dashboard from your data.</h2>
            <p>Every chart reads a workbook range. Review each source and return to the grid to correct values or formulas.</p></div>
          <div className="sx-formula-metrics" aria-label="Chart dashboard overview">
            <div><span>Charts</span><strong>{editor.workbook.charts.length}</strong><small>Linked to workbook ranges</small></div>
            <div><span>Sheets</span><strong>{editor.workbook.sheets.length}</strong><small>Available sources</small></div>
            <div><span>Formula errors</span><strong>{editor.evaluation.errors.length}</strong><small>Review before distribution</small></div>
          </div>
          <Row gap={2} wrap><Button size="sm" variant="primary" onClick={() => context.openOverlay("Series editor", { mode: "create" })}>New chart</Button><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}`)}>Back to grid</Button></Row>
        </div>
        <Notice tone="info" title="Every tile reads a live range">
          A tile is a range and a renderer, so editing a cell changes the tile on the next recalculation. Nothing is cached behind a figure.
        </Notice>
        <Grid>
          {editor.workbook.charts.map((chart) => (
            <Card key={chart.id} span={6} eyebrow="CHART" prov="human" title={chart.title} subtitle={`${chart.ref} on ${editor.workbook.sheets.find((item) => item.id === chart.sheetId)?.name ?? "?"}`}>
              <ChartView editor={editor} chart={chart} />
            </Card>
          ))}
          {editor.workbook.charts.length === 0 && <Empty title="No charts yet" icon={<LayoutDashboard size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Series editor", { mode: "create" })}>Create a chart</Button>} />}
        </Grid>
      </Stack>
    );
  }

  if (tab === "Presentation") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="A chart sent to a deck is a snapshot with a time on it">
          Present keeps the numbers it was given and records when they were captured, so a stale slide is visible as stale rather than quietly wrong.
        </Notice>
        {editor.workbook.charts.length === 0 ? <Empty title="No charts to send" icon={<BarChart3 size={20} />} /> : (
          <Grid>
            {editor.workbook.charts.map((chart) => {
              const sheet = editor.workbook.sheets.find((item) => item.id === chart.sheetId) ?? editor.sheet;
              const data = chartData(sheet, chart.ref, chart.seriesInColumns, editor.evaluation.values[sheet.name] ?? {});
              return (
                <Card key={chart.id} span={6} eyebrow="SNAPSHOT" prov="human" title={chart.title} subtitle={chart.snapshotAt ? `Last snapshot ${context.relative(chart.snapshotAt)}` : "Never snapshotted"}
                  footer={<Button size="sm" variant="secondary" disabled={!data || decks.length === 0} onClick={async () => {
                    const deck = decks[0];
                    if (!deck || !data) return;
                    await context.mutate.patch(deck.id, {
                      fields: { ...deck.fields, pendingChart: JSON.stringify({ title: chart.title, kind: chart.kind, series: data.series, sourceWorkbookId: record.id, sourceSheetName: sheet.name, sourceRef: chart.ref, capturedAt: context.now.toISOString(), linked: true }) },
                    }, { event: `${chart.title} queued for ${deck.title}` });
                    editor.commit({ ...editor.workbook, charts: editor.workbook.charts.map((item) => (item.id === chart.id ? { ...item, snapshotAt: context.now.toISOString() } : item)) }, "Snapshot chart");
                    context.toast("Queued for the deck", `Insert it on a slide in ${deck.title} from Charts & data. The snapshot time travels with it.`);
                  }}>Send to a deck</Button>}
                >
                  <ChartView editor={editor} chart={chart} />
                </Card>
              );
            })}
          </Grid>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2}>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("Series editor", { mode: "create" })}>New chart from a range</Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={() => context.openOverlay("calculation note")}>How these numbers are produced</Button>
      </Row>
      {editor.workbook.charts.length === 0 ? (
        <Empty title="No charts" icon={<BarChart3 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Series editor", { mode: "create" })}>Create a chart</Button>}>
          A chart points at a range. When the range changes, the chart changes with it.
        </Empty>
      ) : (
        <Grid>
          {editor.workbook.charts.map((chart) => (
            <Card
              key={chart.id}
              span={6}
              eyebrow="CHART"
              prov="human"
              title={chart.title}
              subtitle={`${chart.kind} from ${chart.ref}`}
              actions={<Segmented
                label={`${chart.title} type`}
                value={chart.kind}
                onChange={(kind) => editor.commit({ ...editor.workbook, charts: editor.workbook.charts.map((item) => (item.id === chart.id ? { ...item, kind } : item)) }, "Chart type")}
                options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "donut", label: "Donut" }]}
              />}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Series editor", { chartId: chart.id })}>Series</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("formatting inspector", { chartId: chart.id })}>Format</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  editor.commit({ ...editor.workbook, charts: editor.workbook.charts.filter((item) => item.id !== chart.id) }, "Delete chart");
                }}>Delete</Button>
              </>}
            >
              <ChartView editor={editor} chart={chart} />
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-006 — Import & Export
 * ====================================================================== */

function ImportExport({ context, tab }: { context: ScreenContext; tab: "Imports" | "Exports" | "Errors" | "History" }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} />;

  if (tab === "Exports") {
    const rowsRaw = sheetToRows(editor.sheet, editor.values, editor.format, false);
    const rowsEvaluated = sheetToRows(editor.sheet, editor.values, editor.format, true);
    return (
      <Stack gap={4}>
        <div className="sx-formula-overview">
          <div className="sx-formula-header"><span className="sx-library-eyebrow">SHEETS / DATA PORTABILITY</span><h2>Know exactly what you export.</h2>
            <p>Choose calculated values, original formula text or the structured workbook. Downloads stay on the device; no external integration is implied.</p></div>
          <div className="sx-formula-metrics" aria-label="Export overview">
            <div><span>Sheet</span><strong className="sx-compact-value">{editor.sheet.name}</strong><small>Current worksheet</small></div>
            <div><span>Rows</span><strong>{rowsEvaluated.length}</strong><small>In calculated CSV</small></div>
            <div><span>Formula errors</span><strong>{editor.evaluation.errors.length}</strong><small>Inspect before distribution</small></div>
          </div>
          <Row gap={2} wrap><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}`)}>Back to grid</Button>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/sheets/workbooks/${record.id}/formulas`)}>Formula audit</Button></Row>
        </div>
      <Grid>
        <Card span={6} eyebrow="EXPORT" title="Export this sheet" subtitle={`${editor.sheet.name} · ${rowsRaw.length} rows`}>
          <Stack gap={3}>
            <Notice tone="warning" title="A CSV cannot carry a formula">
              Two exports are offered and named for what they do: the formulas as typed, or the values as calculated. Neither pretends to be the other.
            </Notice>
            <Row gap={2} wrap>
              <Button variant="primary" onClick={() => {
                downloadFile(`${record.title} - ${editor.sheet.name} (values).csv`, toCsv(rowsEvaluated), "text/csv");
                editor.commit({ ...editor.workbook, io: [{ id: nextId("io"), at: context.now.toISOString(), kind: "export", format: "CSV values", note: `${editor.sheet.name} exported as calculated values`, rows: rowsEvaluated.length, warnings: [] }, ...editor.workbook.io] }, "Export CSV");
              }}>CSV, calculated values</Button>
              <Button variant="secondary" onClick={() => {
                downloadFile(`${record.title} - ${editor.sheet.name} (formulas).csv`, toCsv(rowsRaw), "text/csv");
                editor.commit({ ...editor.workbook, io: [{ id: nextId("io"), at: context.now.toISOString(), kind: "export", format: "CSV formulas", note: `${editor.sheet.name} exported with formulas as typed`, rows: rowsRaw.length, warnings: ["Formulas are exported as text; a spreadsheet reading this file will recalculate them itself."] }, ...editor.workbook.io] }, "Export CSV");
              }}>CSV, formulas as typed</Button>
              <Button variant="ghost" onClick={() => {
                const payload = JSON.stringify(editor.workbook, null, 2);
                downloadFile(`${record.title}.json`, payload, "application/json");
              }}>JSON, the whole workbook</Button>
            </Row>
          </Stack>
        </Card>
        <Card span={6} eyebrow="EXPORT" prov="human" title="Preview" subtitle="First rows of the calculated export">
          <TextArea readOnly rows={12} value={toCsv(rowsEvaluated.slice(0, 20))} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }} aria-label="Export preview" />
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (tab === "Errors") {
    const warnings = editor.workbook.io.flatMap((entry) => entry.warnings.map((warning, index) => ({ id: `${entry.id}-${index}`, at: entry.at, kind: entry.kind, format: entry.format, warning })));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Nothing is coerced without a record of it">
          Every import that changed a value's kind is listed here with what it did. That is the honest alternative to a silent conversion.
        </Notice>
        {warnings.length === 0 ? <Empty title="No import or export reported a problem" icon={<FileUp size={20} />} /> : (
          <DataGrid
            rows={warnings}
            rowId={(row) => row.id}
            label="Import and export warnings"
            rowTone={() => "warning"}
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "kind", header: "Kind", cell: (row) => <Pill>{row.kind}</Pill> },
              { key: "format", header: "Format", cell: (row) => row.format },
              { key: "warning", header: "What happened", cell: (row) => row.warning },
            ]}
          />
        )}
      </Stack>
    );
  }

  if (tab === "History") {
    return (
      <Stack gap={4}>
        {editor.workbook.io.length === 0 ? <Empty title="No import or export recorded" /> : (
          <DataGrid
            rows={editor.workbook.io}
            rowId={(row) => row.id}
            label="Import and export history"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "import" ? "accent" : "neutral"}>{row.kind}</Pill> },
              { key: "format", header: "Format", cell: (row) => row.format },
              { key: "rows", header: "Rows", align: "end", cell: (row) => String(row.rows ?? "—") },
              { key: "note", header: "Note", cell: (row) => row.note },
              { key: "warnings", header: "Warnings", align: "end", cell: (row) => (row.warnings.length ? <Pill tone="warning">{row.warnings.length}</Pill> : "0") },
            ]}
            bulkActions={[{
              label: "Roll back",
              disabled: (rows) => rows.some((row) => row.kind !== "import"),
              onRun: () => context.openOverlay("rollback"),
            }]}
          />
        )}
        <Card eyebrow="HISTORY" prov="posted" title="Record history" subtitle={`${record.history.length} saved versions on the workbook record`}>
          {record.history.length === 0 ? <span className="ds-subtle">Autosave suppresses history, so only deliberate saves appear.</span> : (
            <Stack gap={2}>
              {record.history.slice(0, 8).map((snapshot) => (
                <Row key={snapshot.at} gap={2}><span className="ds-grow">{snapshot.title}</span><span className="ds-subtle">{context.dateTime(snapshot.at)}</span></Row>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Card eyebrow="IMPORT" title="Import a CSV" subtitle="Read in this browser; nothing is uploaded">
        <Stack gap={3}>
          <Notice tone="warning" title="A large file is read fully before anything is written">
            The whole file is parsed and planned first, and the plan is shown before a cell changes, so an import cannot half-finish and drop a formula.
          </Notice>
          <Button variant="primary" icon={<FileUp size={15} />} onClick={() => context.openOverlay("Import wizard")}>Choose a file</Button>
        </Stack>
      </Card>
      <Card eyebrow="ENGINE" title="Formula compatibility" subtitle="What this engine implements">
        <Properties rows={[
          { label: "Implemented functions", value: `${FUNCTION_HELP.length}, listed in the Formula manager` },
          { label: "Unsupported function", value: "Reported as #NAME? in the cell, never approximated" },
          { label: "Absolute references", value: "Honoured on fill and sort ($A$1 stays put)" },
          { label: "Cross-sheet references", value: "Supported as Sheet!A1 and Sheet!A1:B4" },
          { label: "Array formulas", value: <Pill tone="warning">Not implemented</Pill> },
          { label: "Pivot tables as objects", value: <Pill tone="warning">Computed live in Charts, not stored</Pill> },
        ]} />
      </Card>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-SHEETS-007 — Collaboration & Versioning
 * ====================================================================== */

function Collaboration({ context, tab }: { context: ScreenContext; tab: "Comments" | "History" | "Permissions" | "Changes" }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const members = useCollection("members");
  if (!record) return <Empty title="No workbook is open" icon={<FileSpreadsheet size={20} />} />;

  if (tab === "History") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Autosave does not create a version per keystroke">
          Cell edits are written with history suppressed. The list below holds deliberate saves, which is what makes restoring one meaningful.
        </Notice>
        {record.history.length === 0 ? <Empty title="No stored version yet" /> : (
          <DataGrid
            rows={record.history.map((snapshot, index) => ({ ...snapshot, id: `${snapshot.at}-${index}`, index }))}
            rowId={(row) => row.id}
            label="Workbook versions"
            columns={[
              { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "sheets", header: "Sheets", align: "end", cell: (row) => String(readWorkbook(row.body).sheets.length) },
              {
                key: "cells", header: "Cells", align: "end",
                cell: (row) => String(readWorkbook(row.body).sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0)),
              },
              { key: "status", header: "Status", cell: (row) => <Pill>{String(row.status)}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("restore confirmation", { snapshotId: id })}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Permissions") {
    return (
      <Grid>
        <Card span={7} eyebrow="PROTECTION" prov="human" title="Protected ranges" subtitle={`${editor.workbook.protection.length} protected`}>
          {editor.workbook.protection.length === 0 ? (
            <Empty title="Nothing is protected" icon={<Lock size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("protected range")}>Protect a range</Button>}>
              Protecting a range stops an accidental edit in this interface and records why it matters.
            </Empty>
          ) : (
            <Stack gap={3}>
              {editor.workbook.protection.map((range) => (
                <Row key={range.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <Row gap={2}><strong>{editor.workbook.sheets.find((sheet) => sheet.id === range.sheetId)?.name ?? "?"}!{range.ref}</strong><Pill tone="warning">Protected</Pill></Row>
                    <p className="ds-subtle">{range.note}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => editor.commit({ ...editor.workbook, protection: editor.workbook.protection.filter((item) => item.id !== range.id) }, "Unprotect range")}>Unprotect</Button>
                </Row>
              ))}
            </Stack>
          )}
          <Notice tone="warning" title="This shapes the interface, not an account">
            A protected range is enforced by this editor in this browser. It is not a server-side permission and does not claim to be one.
          </Notice>
        </Card>
        <Card span={5} eyebrow="PRESENCE" prov="human" title="Who is in the workspace" subtitle="Presence is not simulated">
          <Stack gap={2}>
            {members.slice(0, 6).map((member) => (
              <Row key={member.id} gap={2}><span className="ds-grow ds-truncate">{member.title}</span><Pill tone="neutral">{String(member.fields.role ?? "member")}</Pill></Row>
            ))}
          </Stack>
          <Notice tone="neutral">Nobody else is connected: this workspace lives in one browser. Showing live cursors would be a fiction.</Notice>
        </Card>
      </Grid>
    );
  }

  if (tab === "Changes") {
    const previous = record.history[0] ? readWorkbook(record.history[0].body) : null;
    const changes: { id: string; sheet: string; address: string; before: string; after: string }[] = [];
    if (previous) {
      for (const sheet of editor.workbook.sheets) {
        const old = previous.sheets.find((item) => item.id === sheet.id || item.name === sheet.name);
        const addresses = new Set([...Object.keys(sheet.cells), ...Object.keys(old?.cells ?? {})]);
        for (const address of addresses) {
          const before = old?.cells[address] ?? "";
          const after = sheet.cells[address] ?? "";
          if (before !== after) changes.push({ id: `${sheet.name}!${address}`, sheet: sheet.name, address, before, after });
        }
      }
    }
    return (
      <Stack gap={4}>
        {!previous ? <Empty title="No stored version to compare against" icon={<Copy size={20} />} /> : changes.length === 0 ? (
          <Empty title="No cell differs from the last stored version" icon={<Copy size={20} />} />
        ) : (
          <DataGrid
            rows={changes}
            rowId={(row) => row.id}
            label="Changed cells"
            columns={[
              { key: "cell", header: "Cell", primary: true, cell: (row) => row.id, filterValue: (row) => row.id },
              { key: "before", header: "Stored version", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.before || "(empty)"}</code> },
              { key: "after", header: "Now", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.after || "(empty)"}</code> },
            ]}
            bulkActions={[{
              label: "Revert to the stored value",
              onRun: (rows) => {
                let workbook = editor.workbook;
                for (const row of rows) {
                  const sheet = workbook.sheets.find((item) => item.name === row.sheet);
                  if (!sheet) continue;
                  workbook = { ...workbook, sheets: workbook.sheets.map((item) => (item.id === sheet.id ? setCell(item, row.address, row.before) : item)) };
                }
                editor.commit(workbook, "Revert cells");
                context.toast("Reverted", `${rows.length} cell${rows.length === 1 ? "" : "s"} put back to the stored value.`);
              },
            }]}
          />
        )}
        <Card eyebrow="CONFLICTS" title="Two people editing the same cell" subtitle="What this editor does">
          <Notice tone="warning" title="A conflicting save is refused, never merged silently">
            Autosave carries the revision it was based on. If the stored revision moved on, the write is refused and the grid offers both versions: keep these cells, or take the stored ones. There is no last-write-wins.
          </Notice>
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("Conflict resolver")}>Open the conflict resolver</Button>
        </Card>
      </Stack>
    );
  }

  const comments = editor.workbook.comments;
  return (
    <Grid>
      <Card span={8} eyebrow="REVIEW" prov="human" title="Cell comments" subtitle={`${comments.filter((comment) => !comment.resolved).length} open of ${comments.length}`}>
        {comments.length === 0 ? (
          <Empty title="No comments" icon={<MessageSquare size={20} />} action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/sheets/workbooks/:id", record.id))}>Open the grid</Button>}>
            Comment on a cell from the Review ribbon in the grid.
          </Empty>
        ) : (
          <Stack gap={3}>
            {comments.map((comment) => {
              const sheet = editor.workbook.sheets.find((item) => item.id === comment.sheetId);
              const result = sheet ? editor.evaluation.values[sheet.name]?.[comment.address] : undefined;
              return (
                <div key={comment.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2}>
                    <strong>{sheet?.name}!{comment.address}</strong>
                    <Pill tone={comment.resolved ? "success" : "warning"}>{comment.resolved ? "Resolved" : "Open"}</Pill>
                    <span className="ds-grow" />
                    <span className="ds-subtle">{comment.author} · {context.relative(comment.at)}</span>
                  </Row>
                  <p style={{ marginBlock: 6 }}>{comment.body}</p>
                  <Row gap={2}>
                    <span className="ds-subtle">Cell now reads <strong className="ds-num">{sheet && result ? displayValue(result, sheet.styles[comment.address], editor.format) : "(empty)"}</strong></span>
                    <span className="ds-grow" />
                    <Button size="sm" variant="ghost" onClick={() => editor.commit({ ...editor.workbook, comments: editor.workbook.comments.map((item) => (item.id === comment.id ? { ...item, resolved: !item.resolved } : item)) }, "Toggle comment")}>
                      {comment.resolved ? "Reopen" : "Resolve"}
                    </Button>
                  </Row>
                </div>
              );
            })}
          </Stack>
        )}
      </Card>
      <Card span={4} eyebrow="SAVE" prov="posted" title="Save state" subtitle="How this workbook is being written">
        <Properties rows={[
          { label: "State", value: <Pill tone={SAVE_TONE[editor.saveState]}>{SAVE_LABEL[editor.saveState]}</Pill> },
          { label: "Last change", value: context.dateTime(record.updatedAt) },
          { label: "Revision", value: String(record.revision) },
          { label: "Stored versions", value: String(record.history.length) },
        ]} />
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function NewWorkbook({ context, close }: { context: ScreenContext; close: () => void }) {
  const workbooks = useCollection("workbooks");
  const { org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sheetNames, setSheetNames] = useState("Sheet 1");
  const duplicate = workbooks.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());
  const templates = workbooks.filter((record) => record.fields.isTemplate === true || record.status === "template");
  return (
    <form
      id="new-workbook"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const template = templates.find((record) => record.id === templateId);
        const body: Workbook = template
          ? readWorkbook(template.body)
          : (() => {
            const sheets = sheetNames.split(",").map((name) => name.trim()).filter(Boolean).map((name) => emptySheet(name));
            const list = sheets.length ? sheets : [emptySheet("Sheet 1")];
            return { sheets: list, activeSheetId: list[0].id, namedRanges: [], tables: [], charts: [], comments: [], protection: [], io: [] };
          })();
        const created = await context.mutate.create({
          collection: "workbooks", title: title.trim(), status: "active",
          summary: template ? `Started from ${template.title}.` : `${body.sheets.length} sheet${body.sheets.length === 1 ? "" : "s"}, ${body.sheets[0].cols} columns by ${body.sheets[0].rows} rows.`,
          fields: { folder: "Models", recalc: "automatic", sheets: body.sheets.length },
          body,
        }, `Workbook ${title.trim()} created`);
        close();
        context.navigate(`/o/${org.slug}/sheets/workbooks/${created.id}`);
      }}
    >
      <Field label="Title" required><TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required autoFocus /></Field>
      {duplicate && <Notice tone="danger" title="A workbook already has that title" />}
      <Field label="Start from">
        <Select aria-label="Start from" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Empty sheets</option>
          {templates.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
        </Select>
      </Field>
      {!templateId && (
        <Field label="Sheet names" hint="Comma separated. Each sheet starts at 64 columns by 1000 rows.">
          <TextInput aria-label="Sheet names" value={sheetNames} onChange={(event) => setSheetNames(event.target.value)} />
        </Field>
      )}
    </form>
  );
}

function ImportMapper({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const [text, setText] = useState("");
  const [headerRow, setHeaderRow] = useState(true);
  const [target, setTarget] = useState("new");
  const [types, setTypes] = useState<Record<number, NumberFormat>>({});
  const rows = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const plans = useMemo(() => (rows.length ? planImport(rows, headerRow) : []), [rows, headerRow]);
  if (!record) return <Empty title="No workbook is open" />;

  return (
    <form
      id="import-wizard"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rows.length === 0) return;
        const warnings = plans.filter((plan) => plan.warning).map((plan) => plan.warning!);
        const base = target === "new" ? emptySheet(`Imported ${editor.workbook.sheets.length + 1}`) : editor.sheet;
        const filled = rowsToSheet(base, rows);
        const styles = { ...filled.styles };
        for (const [index, format] of Object.entries(types)) {
          const col = Number(index);
          for (let row = headerRow ? 1 : 0; row < rows.length; row += 1) styles[cellAddress(col, row)] = { ...styles[cellAddress(col, row)], format };
        }
        const withStyles: Sheet = { ...filled, styles };
        const sheets = target === "new" ? [...editor.workbook.sheets, withStyles] : editor.workbook.sheets.map((item) => (item.id === withStyles.id ? withStyles : item));
        editor.commit({
          ...editor.workbook,
          sheets,
          activeSheetId: withStyles.id,
          io: [{
            id: nextId("io"), at: context.now.toISOString(), kind: "import", format: "CSV",
            note: `${rows.length} rows into ${withStyles.name}. Column types applied: ${Object.keys(types).length ? Object.entries(types).map(([col, format]) => `${columnName(Number(col))}=${format}`).join(", ") : "none, values kept as typed"}.`,
            rows: rows.length, warnings,
          }, ...editor.workbook.io],
        }, "Import CSV");
        context.toast("Imported", `${rows.length} rows into ${withStyles.name}. ${warnings.length} column${warnings.length === 1 ? "" : "s"} needed a decision and it is recorded.`);
        close();
      }}
    >
      <Field label="Paste CSV, or choose a file" hint="The file is read in this browser. Nothing is uploaded.">
        <TextArea aria-label="Paste CSV, or choose a file" rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="Deal,Net,Signed&#10;Harrow,1800,2026-11-14" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }} />
      </Field>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        aria-label="CSV file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setText(await file.text());
        }}
      />
      <Checkbox label="The first row is a header" checked={headerRow} onChange={(event) => setHeaderRow(event.target.checked)} />
      <Field label="Where">
        <Select aria-label="Where" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="new">A new sheet</option>
          <option value="current">Overwrite {editor.sheet.name} from A1</option>
        </Select>
      </Field>
      {plans.length > 0 && (
        <>
          <p className="ds-subtle">{rows.length} rows, {plans.length} columns. Choose a type per column; nothing is converted unless you choose.</p>
          <Stack gap={2}>
            {plans.map((plan) => (
              <Row key={plan.index} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <div className="ds-grow" style={{ minWidth: 0 }}>
                  <Row gap={2}><strong>{columnName(plan.index)}</strong><span className="ds-truncate">{plan.header}</span><Pill tone={plan.detected === "mixed" ? "warning" : "accent"}>{plan.detected}</Pill></Row>
                  <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{plan.samples.join(" · ") || "no samples"}</span>
                  {plan.warning && <p className="ds-subtle" style={{ color: "var(--warning)" }}>{plan.warning}</p>}
                </div>
                <Select
                  aria-label={`Type for column ${columnName(plan.index)}`}
                  value={types[plan.index] ?? "general"}
                  onChange={(event) => setTypes((current) => ({ ...current, [plan.index]: event.target.value as NumberFormat }))}
                >
                  {(Object.keys(FORMAT_LABELS) as NumberFormat[]).map((key) => <option key={key} value={key}>{FORMAT_LABELS[key]}</option>)}
                </Select>
              </Row>
            ))}
          </Stack>
        </>
      )}
      <Notice tone="warning" title="Nothing is coerced silently">
        A date-looking column stays as text unless you choose the date type. A currency symbol is never read as a currency. Every decision is written into the import history.
      </Notice>
    </form>
  );
}

function ShareWorkbook({ context, close }: { context: ScreenContext; close: () => void }) {
  const selected = useRecord(context.selectedId);
  const workbooks = useCollection("workbooks");
  const record = selected ?? (context.params.id ? workbooks.find((item) => item.id === context.params.id) : undefined);
  const members = useCollection("members");
  const [chosen, setChosen] = useState<string[]>(String(record?.fields.sharedWith ?? "").split("|").filter(Boolean));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!record) return <Empty title="Select a workbook" />;
  return (
    <form
      id="share-workbook"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError("");
        try {
          await context.mutate.patch(record.id, { fields: { ...record.fields, sharedWith: chosen.join("|") } }, { expectRevision: record.revision, event: `${record.title} sharing list updated` });
          context.toast("Sharing recorded", "The local workbook list was updated. No invitations were sent.");
          close();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "The workbook could not be updated.");
        } finally { setSaving(false); }
      }}
    >
      <div className="sx-share-summary"><strong>{record.title}</strong><p className="ds-subtle">Select the people recorded on this workbook.</p></div>
      {error && <Notice tone="danger" title="Sharing not saved">{error}</Notice>}
      {saving && <p className="ds-subtle">Saving sharing record…</p>}
      <div className="sx-share-summary"><strong>Recorded access list</strong><p className="ds-subtle">Existing names remain selected. Save to update this browser-local collaboration record; no invitations are sent.</p></div>
      <Stack gap={2}>
        {members.filter((member) => member.fields.kind === "human").map((member) => (
          <Checkbox
            key={member.id}
            label={member.title}
            checked={chosen.includes(member.title)}
            onChange={(event) => setChosen((current) => (event.target.checked ? [...current, member.title] : current.filter((name) => name !== member.title)))}
          />
        ))}
      </Stack>
      <Notice tone="neutral">Everything stays in this browser, so sharing is a record of intent rather than a transfer or verified external permission.</Notice>
    </form>
  );
}

function FormatCells({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const box = editor.selection.box;
  const existing = editor.sheet.styles[cellAddress(box.fromCol, box.fromRow)] ?? {};
  const [style, setStyle] = useState<CellStyle>(existing);
  if (!record) return <Empty title="No workbook is open" />;
  const sample = editor.values[cellAddress(box.fromCol, box.fromRow)];
  return (
    <form
      id="format-cells"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commitSheet(styleRange(editor.sheet, box, style), "Format cells");
        close();
      }}
    >
      <p className="ds-subtle">Applying to {boxLabel(box)} — {boxAddresses(box).length} cells.</p>
      <Row gap={3} wrap>
        <Field label="Number format">
          <Select aria-label="Number format" value={style.format ?? "general"} onChange={(event) => setStyle((current) => ({ ...current, format: event.target.value as NumberFormat }))}>
            {(Object.keys(FORMAT_LABELS) as NumberFormat[]).map((key) => <option key={key} value={key}>{FORMAT_LABELS[key]}</option>)}
          </Select>
        </Field>
        <Field label="Decimals">
          <TextInput aria-label="Decimals" inputMode="numeric" align="end" value={String(style.decimals ?? "")} onChange={(event) => setStyle((current) => ({ ...current, decimals: event.target.value === "" ? undefined : Number(event.target.value) }))} />
        </Field>
        <Field label="Alignment">
          <Select aria-label="Alignment" value={style.align ?? ""} onChange={(event) => setStyle((current) => ({ ...current, align: (event.target.value || undefined) as CellStyle["align"] }))}>
            <option value="">Automatic</option><option value="start">Left</option><option value="center">Centre</option><option value="end">Right</option>
          </Select>
        </Field>
      </Row>
      <Row gap={3} wrap>
        <Checkbox label="Bold" checked={style.bold ?? false} onChange={(event) => setStyle((current) => ({ ...current, bold: event.target.checked }))} />
        <Checkbox label="Italic" checked={style.italic ?? false} onChange={(event) => setStyle((current) => ({ ...current, italic: event.target.checked }))} />
      </Row>
      <Field label="Fill">
        <Row gap={2} wrap>
          {["", "var(--accent-soft)", "var(--success-soft)", "var(--warning-soft)", "var(--danger-soft)", "var(--bg-sunken)"].map((colour) => (
            <button
              key={colour || "none"}
              type="button"
              aria-label={colour ? `Fill ${colour}` : "No fill"}
              aria-pressed={(style.fill ?? "") === colour}
              onClick={() => setStyle((current) => ({ ...current, fill: colour || undefined }))}
              style={{ width: 28, height: 28, borderRadius: 6, border: (style.fill ?? "") === colour ? "2px solid var(--accent)" : "1px solid var(--border-default)", background: colour || "var(--bg-surface)" }}
            />
          ))}
        </Row>
      </Field>
      <Field label="Borders">
        <Row gap={2} wrap>
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <Checkbox
              key={side}
              label={side}
              checked={(style.border ?? []).includes(side)}
              onChange={(event) => setStyle((current) => ({
                ...current,
                border: event.target.checked ? [...(current.border ?? []), side] : (current.border ?? []).filter((item) => item !== side),
              }))}
            />
          ))}
        </Row>
      </Field>
      <Notice tone="neutral">Preview: <strong className="ds-num">{displayValue(sample, style, editor.format) || "(empty)"}</strong></Notice>
    </form>
  );
}

function ValidationOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { mode?: string } | undefined;
  const mode = payload?.mode === "filter" ? "filter" : payload?.mode === "comment" ? "comment" : "validation";
  const box = editor.selection.box;
  const [keep, setKeep] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [rule, setRule] = useState("");
  const [required, setRequired] = useState(false);
  if (!record) return <Empty title="No workbook is open" />;

  if (mode === "filter") {
    const options = distinctColumnValues(editor.sheet, box.fromCol, Math.max(0, box.fromRow), editor.values, editor.format);
    return (
      <form
        id="validation"
        className="ds-stack ds-gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const filters = [
            ...editor.sheet.filters.filter((filter) => filter.column !== box.fromCol),
            ...(keep.length ? [{ headerRow: box.fromRow, column: box.fromCol, keep }] : []),
          ];
          editor.commitSheet({ ...editor.sheet, filters }, "Filter");
          context.toast(keep.length ? "Filter applied" : "Filter cleared", keep.length ? `Rows outside ${keep.join(", ")} are hidden. Formulas still read every row.` : "Every row is shown again.");
          close();
        }}
      >
        <p className="ds-subtle">Filtering column {columnName(box.fromCol)} with the header on row {box.fromRow + 1}.</p>
        {options.length === 0 ? <Notice tone="warning" title="That column has no values below the header" /> : (
          <Stack gap={1}>
            {options.map((option) => (
              <Checkbox
                key={option}
                label={option || "(blank)"}
                checked={keep.includes(option)}
                onChange={(event) => setKeep((current) => (event.target.checked ? [...current, option] : current.filter((value) => value !== option)))}
              />
            ))}
          </Stack>
        )}
        <Notice tone="neutral">A filter hides rows in the grid. It never changes what a formula reads, so a total stays a total of everything.</Notice>
      </form>
    );
  }

  if (mode === "comment") {
    const address = cellAddress(editor.selection.active.col, editor.selection.active.row);
    return (
      <form
        id="validation"
        className="ds-stack ds-gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return;
          editor.commit({
            ...editor.workbook,
            comments: [{ id: nextId("sc"), sheetId: editor.sheet.id, address, author: context.actor, at: context.now.toISOString(), body: body.trim(), resolved: false }, ...editor.workbook.comments],
          }, "Add comment");
          close();
        }}
      >
        <Properties rows={[
          { label: "Cell", value: `${editor.sheet.name}!${address}` },
          { label: "Raw", value: editor.sheet.cells[address] || "(empty)" },
          { label: "Value", value: displayValue(editor.values[address], editor.sheet.styles[address], editor.format) || "(empty)" },
        ]} />
        <Field label="Comment" required><TextArea aria-label="Comment" rows={4} value={body} onChange={(event) => setBody(event.target.value)} required autoFocus /></Field>
      </form>
    );
  }

  return (
    <form
      id="validation"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const table = editor.workbook.tables[0];
        const index = table ? Math.max(0, box.fromCol - (rangeBox(table.ref)?.fromCol ?? 0)) : 0;
        if (!table) {
          context.toast("Define a table first", "Validation rules belong to a table column, so a rule has something to apply to.", "blocked");
          return;
        }
        editor.commit({
          ...editor.workbook,
          tables: editor.workbook.tables.map((item) => (item.id === table.id
            ? { ...item, columns: item.columns.map((column, position) => (position === index ? { ...column, rule: rule || undefined, required } : column)) }
            : item)),
        }, "Validation rule");
        context.toast("Rule saved", "Breaches are listed under Validation. Nothing is corrected automatically.");
        close();
      }}
    >
      <p className="ds-subtle">Applying to column {columnName(box.fromCol)}.</p>
      <Field label="Allowed values" hint="Comma separated, e.g. won, open, lost. Leave empty for no list.">
        <TextInput aria-label="Allowed values" value={rule} onChange={(event) => setRule(event.target.value)} />
      </Field>
      <Checkbox label="A value is required in every row" checked={required} onChange={(event) => setRequired(event.target.checked)} />
      <Notice tone="neutral">A rule reports a breach; it does not block typing. Silently rejecting a paste loses data a person meant to keep.</Notice>
    </form>
  );
}

function NamedRangeOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { mode?: string; sheetId?: string } | undefined;
  const [name, setName] = useState("");
  const [ref, setRef] = useState(boxLabel(editor.selection.box));
  const [sheetName, setSheetName] = useState(editor.sheet.name);
  const [renameTo, setRenameTo] = useState(editor.workbook.sheets.find((item) => item.id === payload?.sheetId)?.name ?? editor.sheet.name);
  if (!record) return <Empty title="No workbook is open" />;

  if (payload?.mode === "rename") {
    const target = editor.workbook.sheets.find((item) => item.id === payload.sheetId) ?? editor.sheet;
    return (
      <form
        id="named-range"
        className="ds-stack ds-gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!renameTo.trim() || renameTo === target.name) { close(); return; }
          const dependents = Object.entries(editor.evaluation.graph).filter(([, reads]) => reads.some((read) => read.startsWith(`${target.name}!`))).length;
          const sheets = editor.workbook.sheets.map((item) => (item.id === target.id ? { ...item, name: renameTo.trim() } : item));
          const namedRanges = editor.workbook.namedRanges.map((range) => (range.sheetName === target.name ? { ...range, sheetName: renameTo.trim() } : range));
          editor.commit({ ...editor.workbook, sheets, namedRanges }, "Rename sheet");
          context.toast("Sheet renamed", dependents > 0
            ? `${dependents} formula${dependents === 1 ? "" : "s"} referenced ${target.name} by name and now report #REF!. Rewrite them or rename back.`
            : "No formula referenced it by name.", dependents > 0 ? "blocked" : "ok");
          close();
        }}
      >
        <Field label="Sheet name" required><TextInput aria-label="Sheet name" value={renameTo} onChange={(event) => setRenameTo(event.target.value)} required autoFocus /></Field>
        <Notice tone="warning" title="A cross-sheet formula uses the name">
          Renaming does not rewrite <code>Sheet!A1</code> references. Any that break are reported as #REF! rather than quietly pointing somewhere else.
        </Notice>
      </form>
    );
  }

  const invalid = /[^A-Za-z0-9_]/.test(name) || /^\d/.test(name);
  const taken = editor.workbook.namedRanges.some((range) => range.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      id="named-range"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || invalid || taken || !rangeBox(ref)) return;
        editor.commit({ ...editor.workbook, namedRanges: [...editor.workbook.namedRanges, { name: name.trim(), sheetName, ref: ref.toUpperCase() }] }, "Define named range");
        context.toast("Named range defined", `=SUM(${name.trim()}) now reads ${sheetName}!${ref.toUpperCase()}.`);
        close();
      }}
    >
      <Field label="Name" required hint="Letters, digits and underscores; it cannot start with a digit.">
        <TextInput aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} invalid={invalid || taken} required autoFocus />
      </Field>
      {taken && <Notice tone="danger" title="That name is already defined" />}
      {invalid && name !== "" && <Notice tone="danger" title="A formula could not parse that name" />}
      <Row gap={3}>
        <Field label="Sheet">
          <Select aria-label="Sheet" value={sheetName} onChange={(event) => setSheetName(event.target.value)}>
            {editor.workbook.sheets.map((sheet) => <option key={sheet.id} value={sheet.name}>{sheet.name}</option>)}
          </Select>
        </Field>
        <Field label="Range" required hint={rangeBox(ref) ? `${expandRange(ref).length} cells` : "Not a valid range"}>
          <TextInput aria-label="Range" value={ref} onChange={(event) => setRef(event.target.value)} invalid={!rangeBox(ref)} required />
        </Field>
      </Row>
    </form>
  );
}

function ChartPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { chartId?: string; mode?: string } | undefined;
  const existing = editor.workbook.charts.find((chart) => chart.id === payload?.chartId);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState<"bar" | "line" | "donut">(existing?.kind ?? "bar");
  const [ref, setRef] = useState(existing?.ref ?? boxLabel(editor.selection.box));
  const [seriesInColumns, setSeriesInColumns] = useState(existing?.seriesInColumns ?? true);
  if (!record) return <Empty title="No workbook is open" />;
  const sheet = existing ? editor.workbook.sheets.find((item) => item.id === existing.sheetId) ?? editor.sheet : editor.sheet;
  const preview = rangeBox(ref) ? chartData(sheet, ref, seriesInColumns, editor.evaluation.values[sheet.name] ?? {}) : null;
  return (
    <form
      id="chart-picker"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rangeBox(ref)) return;
        if (existing) {
          editor.commit({
            ...editor.workbook,
            charts: editor.workbook.charts.map((chart) => (chart.id === existing.id ? { ...chart, title: title || chart.title, kind, ref: ref.toUpperCase(), seriesInColumns } : chart)),
          }, "Edit chart");
        } else {
          editor.commit({
            ...editor.workbook,
            charts: [...editor.workbook.charts, { id: nextId("ch"), title: title || `${boxLabel(rangeBox(ref)!)} chart`, kind, ref: ref.toUpperCase(), sheetId: editor.sheet.id, seriesInColumns, snapshotAt: context.now.toISOString() }],
          }, "Create chart");
        }
        close();
      }}
    >
      <Field label="Title"><TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Net by deal" /></Field>
      <Row gap={3} wrap>
        <Field label="Range" required hint={rangeBox(ref) ? "Include the header row and the label column." : "Not a valid range"}>
          <TextInput aria-label="Range" value={ref} onChange={(event) => setRef(event.target.value)} invalid={!rangeBox(ref)} required />
        </Field>
        <Field label="Type">
          <Select aria-label="Type" value={kind} onChange={(event) => setKind(event.target.value as "bar" | "line" | "donut")}>
            <option value="bar">Bar</option><option value="line">Line</option><option value="donut">Donut</option>
          </Select>
        </Field>
      </Row>
      <Switch label="Series run down columns" checked={seriesInColumns} onChange={setSeriesInColumns} />
      {preview && preview.series.length > 0 ? (
        <Card eyebrow="CHART" prov="human" title="Preview" subtitle={`${preview.series.length} series, ${preview.series[0].points.length} points`}>
          <BarChart title={title || "Preview"} height={180} format={(value) => String(Math.round(value))} series={preview.series} />
          {preview.skipped.length > 0 && <Notice tone="warning">{preview.skipped.length} cell{preview.skipped.length === 1 ? " was" : "s were"} not numeric and will be skipped: {preview.skipped.slice(0, 8).join(", ")}.</Notice>}
        </Card>
      ) : <Notice tone="warning" title="That range produces no numeric series">Check the header row and that the values are numbers.</Notice>}
    </form>
  );
}

function FormulaInspector({ context }: { context: ScreenContext }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { key?: string } | undefined;
  if (!record || !payload?.key) return <Empty title="Select a formula" />;
  const [sheetName, address] = payload.key.split("!");
  const sheet = editor.workbook.sheets.find((item) => item.name === sheetName);
  if (!sheet || !address) return <Empty title="Formula not found" />;
  const source = sheet.cells[address] ?? "";
  const result = editor.evaluation.values[sheetName]?.[address];
  const reads = editor.evaluation.graph[payload.key] ?? [];
  const dependents = Object.entries(editor.evaluation.graph).filter(([, list]) => list.includes(payload.key!)).map(([key]) => key);
  const position = editor.evaluation.order.indexOf(payload.key);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Cell", value: payload.key },
        { label: "Formula", value: <code>{source}</code> },
        { label: "Value", value: result?.error ? <Pill tone="danger">{result.error}</Pill> : displayValue(result, sheet.styles[address], editor.format) },
        { label: "Recalculation position", value: position >= 0 ? `${position + 1} of ${editor.evaluation.order.length}` : "Excluded — it is in a cycle" },
        { label: "In a cycle", value: editor.evaluation.cycles.includes(payload.key) ? <Pill tone="danger">Yes</Pill> : <Pill tone="success">No</Pill> },
      ]} />
      <Card eyebrow="PRECEDENTS" prov="human" title={`Reads ${reads.length} cell${reads.length === 1 ? "" : "s"}`}>
        {reads.length === 0 ? <span className="ds-subtle">This formula reads no cell.</span> : (
          <DataGrid
            rows={reads.map((key) => {
              const [name, cell] = key.split("!");
              const target = editor.evaluation.values[name]?.[cell];
              return { id: key, key, value: target?.error ?? toText(target?.value ?? "") };
            })}
            rowId={(row) => row.id}
            label="Cells read"
            dense
            filterable={false}
            columns={[
              { key: "cell", header: "Cell", primary: true, cell: (row) => row.key },
              { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{row.value || "(empty)"}</span> },
            ]}
          />
        )}
      </Card>
      <Card eyebrow="DEPENDENTS" prov="human" title={`Read by ${dependents.length} formula${dependents.length === 1 ? "" : "s"}`}>
        {dependents.length === 0 ? <span className="ds-subtle">Nothing depends on this cell.</span> : (
          <Row gap={1} wrap>{dependents.map((key) => <Pill key={key}>{key}</Pill>)}</Row>
        )}
      </Card>
      {result?.error && (
        <Notice tone="danger" title={`This formula reports ${result.error}`}>
          {result.error === "#CYCLE!"
            ? "It depends on itself through the graph. Break the loop; there is no correct number to show."
            : result.error === "#NAME?"
              ? `The engine implements ${FUNCTION_HELP.length} functions. Anything else is reported rather than approximated.`
              : "The error is shown in the cell instead of a plausible-looking number."}
        </Notice>
      )}
    </Stack>
  );
}

function FunctionHelp({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { name?: string } | undefined;
  const entry = FUNCTION_HELP.find((item) => item.name === payload?.name);
  if (!entry) {
    return (
      <DataGrid
        rows={FUNCTION_HELP.map((item) => ({ ...item, id: item.name }))}
        rowId={(row) => row.id}
        label="Functions"
        columns={[
          { key: "name", header: "Name", primary: true, cell: (row) => <code>{row.name}</code>, filterValue: (row) => `${row.name} ${row.summary}` },
          { key: "signature", header: "Signature", cell: (row) => <code>{row.signature}</code> },
          { key: "summary", header: "What it does", cell: (row) => row.summary },
        ]}
      />
    );
  }
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Name", value: <code>{entry.name}</code> },
        { label: "Signature", value: <code>{entry.signature}</code> },
        { label: "What it does", value: entry.summary },
      ]} />
      <Notice tone="neutral">This list is the whole implemented set. A function outside it reports #NAME? in the cell.</Notice>
    </Stack>
  );
}

function CircularReference({ context }: { context: ScreenContext }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" />;
  const cycles = editor.evaluation.cycles;
  if (cycles.length === 0) return <Notice tone="success" title="No circular reference">Every formula in the workbook has a defined evaluation order.</Notice>;
  return (
    <Stack gap={4}>
      <Notice tone="danger" title={`${cycles.length} cell${cycles.length === 1 ? " is" : "s are"} affected`}>
        A cycle is detected with Tarjan's strongly connected components, and everything that reads a cycle is marked with it. None of these cells shows a number, because there is not one to show.
      </Notice>
      <DataGrid
        rows={cycles.map((key) => {
          const [sheetName, address] = key.split("!");
          const sheet = editor.workbook.sheets.find((item) => item.name === sheetName);
          return { id: key, key, source: sheet?.cells[address] ?? "", reads: (editor.evaluation.graph[key] ?? []).filter((read) => cycles.includes(read)) };
        })}
        rowId={(row) => row.id}
        label="Cells in a cycle"
        rowTone={() => "danger"}
        filterable={false}
        columns={[
          { key: "cell", header: "Cell", primary: true, cell: (row) => row.key },
          { key: "source", header: "Formula", cell: (row) => <code style={{ fontSize: "var(--text-xs)" }}>{row.source}</code> },
          { key: "loop", header: "Reads inside the cycle", cell: (row) => (row.reads.length ? row.reads.join(", ") : <span className="ds-subtle">Only reads cells outside — it is downstream of the loop</span>) },
        ]}
      />
      <Notice tone="neutral">Breaking a cycle means changing a formula. Nothing here does that for you, because picking which link to cut changes what the model means.</Notice>
    </Stack>
  );
}

function ColumnEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { tableId?: string; mode?: string } | undefined;
  const table = editor.workbook.tables.find((item) => item.id === payload?.tableId);
  const [name, setName] = useState(table?.name ?? "");
  const [ref, setRef] = useState(table?.ref ?? boxLabel(editor.selection.box));
  const [headerRow, setHeaderRow] = useState(table?.headerRow ?? true);
  const [columns, setColumns] = useState(table?.columns ?? []);
  if (!record) return <Empty title="No workbook is open" />;

  const box = rangeBox(ref);
  const detected: SheetTable["columns"] = box && !table
    ? Array.from({ length: box.toCol - box.fromCol + 1 }, (_, index) => ({
      name: toText(editor.values[cellAddress(box.fromCol + index, box.fromRow)]?.value ?? `Column ${index + 1}`) || `Column ${index + 1}`,
      type: "text",
    }))
    : [];

  return (
    <form
      id="column-editor"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !box) return;
        const finalColumns = columns.length ? columns : detected;
        if (table) {
          const renamed = table.columns.filter((column, index) => finalColumns[index] && finalColumns[index].name !== column.name);
          editor.commit({ ...editor.workbook, tables: editor.workbook.tables.map((item) => (item.id === table.id ? { ...item, name: name.trim(), ref: ref.toUpperCase(), headerRow, columns: finalColumns } : item)) }, "Edit table schema");
          context.toast("Schema saved", renamed.length
            ? `${renamed.length} column${renamed.length === 1 ? " was" : "s were"} renamed. A formula addresses cells by letter, so none of them broke — but any named range you built on the old name still points at the same cells.`
            : "The cells the table covers are unchanged, so nothing that referenced them broke.");
        } else {
          editor.commit({ ...editor.workbook, tables: [...editor.workbook.tables, { id: nextId("tb"), name: name.trim(), ref: ref.toUpperCase(), headerRow, columns: finalColumns }] }, "Create table");
        }
        close();
      }}
    >
      <Row gap={3} wrap>
        <Field label="Table name" required><TextInput aria-label="Table name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></Field>
        <Field label="Range" required hint={box ? `${box.toCol - box.fromCol + 1} columns` : "Not a valid range"}>
          <TextInput aria-label="Range" value={ref} onChange={(event) => setRef(event.target.value)} invalid={!box} required />
        </Field>
      </Row>
      <Checkbox label="The first row is a header" checked={headerRow} onChange={(event) => setHeaderRow(event.target.checked)} />
      <Stack gap={2}>
        {(columns.length ? columns : detected).map((column, index) => (
          <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <strong style={{ width: 28 }}>{box ? columnName(box.fromCol + index) : "?"}</strong>
            <TextInput
              aria-label={`Column ${index + 1} name`}
              value={column.name}
              onChange={(event) => setColumns((current) => (current.length ? current : detected).map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))}
            />
            <Select
              aria-label={`Column ${index + 1} type`}
              value={column.type}
              onChange={(event) => setColumns((current) => (current.length ? current : detected).map((item, position) => (position === index ? { ...item, type: event.target.value as typeof item.type } : item)))}
            >
              {["text", "number", "currency", "percent", "date", "boolean"].map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
            <Checkbox
              label="Required"
              checked={column.required ?? false}
              onChange={(event) => setColumns((current) => (current.length ? current : detected).map((item, position) => (position === index ? { ...item, required: event.target.checked } : item)))}
            />
          </Row>
        ))}
      </Stack>
      <Notice tone="warning" title="A schema change never moves a cell">
        The table describes a range; it does not own it. Renaming a column or changing a type cannot break a formula, because formulas address cells by letter and row.
      </Notice>
    </form>
  );
}

function RelationPreview({ context }: { context: ScreenContext }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { edge?: string; tableId?: string } | undefined;
  if (!record) return <Empty title="No workbook is open" />;
  if (payload?.edge) {
    const [from, to] = payload.edge.split("->");
    const [fromSheet, fromCell] = from.split("!");
    const [toSheet, toCell] = to.split("!");
    const fromSource = editor.workbook.sheets.find((item) => item.name === fromSheet)?.cells[fromCell] ?? "";
    const toResult = editor.evaluation.values[toSheet]?.[toCell];
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Formula", value: `${from} = ${fromSource}` },
          { label: "Reads", value: to },
          { label: "That cell's value", value: toResult?.error ?? toText(toResult?.value ?? "(empty)") },
        ]} />
        <Notice tone="neutral">This edge exists because the formula names the other sheet. Renaming that sheet breaks it, and the break is reported as #REF!.</Notice>
      </Stack>
    );
  }
  const table = editor.workbook.tables.find((item) => item.id === payload?.tableId) ?? editor.workbook.tables[0];
  if (!table) return <Empty title="No table" />;
  const box = rangeBox(table.ref);
  const referenced = Object.entries(editor.evaluation.graph)
    .flatMap(([key, reads]) => reads.filter((read) => {
      if (!box) return false;
      const [sheetName, address] = read.split("!");
      const parsed = parseAddress(address);
      return sheetName === editor.sheet.name && parsed && parsed.col >= box.fromCol && parsed.col <= box.toCol && parsed.row >= box.fromRow && parsed.row <= box.toRow;
    }).map((read) => ({ id: `${key}->${read}`, formula: key, cell: read })));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Table", value: table.name },
        { label: "Range", value: table.ref },
        { label: "Formulas reading it", value: String(referenced.length) },
      ]} />
      {referenced.length === 0 ? <Notice tone="neutral">No formula reads this table's cells, so a schema change affects nothing.</Notice> : (
        <DataGrid
          rows={referenced}
          rowId={(row) => row.id}
          label="Formulas reading the table"
          dense
          filterable={false}
          columns={[
            { key: "formula", header: "Formula", primary: true, cell: (row) => row.formula },
            { key: "cell", header: "Cell read", cell: (row) => row.cell },
          ]}
        />
      )}
    </Stack>
  );
}

function SeriesEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  return <ChartPicker context={context} close={close} />;
}

function FormattingInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { chartId?: string } | undefined;
  const chart = editor.workbook.charts.find((item) => item.id === payload?.chartId);
  const [title, setTitle] = useState(chart?.title ?? "");
  if (!record || !chart) return <Empty title="Select a chart" />;
  const sheet = editor.workbook.sheets.find((item) => item.id === chart.sheetId) ?? editor.sheet;
  const data = chartData(sheet, chart.ref, chart.seriesInColumns, editor.evaluation.values[sheet.name] ?? {});
  return (
    <form
      id="formatting-inspector"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit({ ...editor.workbook, charts: editor.workbook.charts.map((item) => (item.id === chart.id ? { ...item, title } : item)) }, "Chart title");
        close();
      }}
    >
      <Field label="Title"><TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Properties rows={[
        { label: "Range", value: `${sheet.name}!${chart.ref}` },
        { label: "Series", value: String(data?.series.length ?? 0) },
        { label: "Points per series", value: String(data?.series[0]?.points.length ?? 0) },
        { label: "Skipped cells", value: data?.skipped.length ? data.skipped.join(", ") : "None" },
      ]} />
      <Notice tone="neutral">
        Colours come from the design system's data series tokens, which are kept separate from status colours so a bar is never mistaken for a warning. Each chart also renders a table equivalent for screen readers.
      </Notice>
    </form>
  );
}

function CalculationNote({ context }: { context: ScreenContext }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Formula cells", value: String(Object.keys(editor.evaluation.graph).length) },
        { label: "Dependency edges", value: String(Object.values(editor.evaluation.graph).reduce((total, list) => total + list.length, 0)) },
        { label: "Cells in a cycle", value: String(editor.evaluation.cycles.length) },
        { label: "Errors", value: String(editor.evaluation.errors.length) },
        { label: "Recalculated at", value: editor.recalculatedAt.toLocaleTimeString(editor.format.locale) },
        { label: "Order", value: "Topological, with a stable alphabetical tie-break" },
      ]} />
      <Notice tone="info" title="Where a chart's numbers come from">
        Each point is a cell value after evaluation, not a stored copy. A cell that is empty, text or in error is skipped and named in the chart's footer, so a chart never fills a gap with zero.
      </Notice>
    </Stack>
  );
}

function RollbackOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" />;
  const imports = editor.workbook.io.filter((entry) => entry.kind === "import");
  return (
    <form
      id="rollback"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const snapshot = record.history[0];
        if (!snapshot) { context.toast("Nothing to roll back to", "No earlier version of this workbook is stored.", "blocked"); return; }
        editor.commit(readWorkbook(snapshot.body), "Roll back import");
        context.toast("Rolled back", `The workbook is back to the version saved ${context.dateTime(snapshot.at)}. The import is still listed in the history.`);
        close();
      }}
    >
      <Notice tone="warning" title="Rolling back restores the last stored version of the whole workbook">
        An import is not undone cell by cell; the workbook returns to its last deliberate save. Everything done since then goes with it, which is why this asks rather than doing it quietly.
      </Notice>
      <Properties rows={[
        { label: "Imports recorded", value: String(imports.length) },
        { label: "Last stored version", value: record.history[0] ? context.dateTime(record.history[0].at) : "None" },
        { label: "Cells now", value: String(editor.workbook.sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0)) },
        { label: "Cells in that version", value: record.history[0] ? String(readWorkbook(record.history[0].body).sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0)) : "—" },
      ]} />
    </form>
  );
}

function ConflictResolver({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  if (!record) return <Empty title="No workbook is open" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Save state", value: <Pill tone={SAVE_TONE[editor.saveState]}>{SAVE_LABEL[editor.saveState]}</Pill> },
        { label: "Record revision", value: String(record.revision) },
        { label: "Strategy", value: "Refuse and ask — never last write wins" },
      ]} />
      <Notice tone="info" title="How a conflict is handled">
        Every autosave carries the revision it was based on. If the stored record has moved on, the write is refused, the editor shows both options and nothing is lost: keep these cells, or take the stored ones.
      </Notice>
      {editor.conflict ? (
        <Row gap={2}>
          <Button variant="primary" onClick={async () => { await editor.resolveConflict("mine"); close(); }}>Keep my cells</Button>
          <Button variant="secondary" onClick={async () => { await editor.resolveConflict("theirs"); close(); }}>Take the stored version</Button>
        </Row>
      ) : null}
      {editor.conflict ? (
        <MergePanel context={context} close={close} />
      ) : <Notice tone="success" title="No conflict is outstanding">This editor's revision matches the stored record.</Notice>}
    </Stack>
  );
}

function ProtectedRangeOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const [ref, setRef] = useState(boxLabel(editor.selection.box));
  const [note, setNote] = useState("");
  if (!record) return <Empty title="No workbook is open" />;
  return (
    <form
      id="protected-range"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rangeBox(ref)) return;
        editor.commit({
          ...editor.workbook,
          protection: [...editor.workbook.protection, { id: nextId("pr"), sheetId: editor.sheet.id, ref: ref.toUpperCase(), note: note || "No reason recorded" }],
        }, "Protect range");
        context.toast("Protected", "The cells are hatched in the grid and an edit is refused with the reason you gave.");
        close();
      }}
    >
      <Row gap={3}>
        <Field label="Sheet"><TextInput aria-label="Sheet" readOnly value={editor.sheet.name} /></Field>
        <Field label="Range" required hint={rangeBox(ref) ? `${expandRange(ref).length} cells` : "Not a valid range"}>
          <TextInput aria-label="Range" value={ref} onChange={(event) => setRef(event.target.value)} invalid={!rangeBox(ref)} required />
        </Field>
      </Row>
      <Field label="Why it matters" required hint="Shown when someone tries to edit it.">
        <TextArea aria-label="Why it matters" rows={3} value={note} onChange={(event) => setNote(event.target.value)} required />
      </Field>
      <Notice tone="warning">This is a guard in this interface, not an account permission. Say so to whoever relies on it.</Notice>
    </form>
  );
}

function RestoreConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useWorkbook(context);
  const editor = useWorkbookEditor(context, record);
  const payload = context.overlayPayload as { snapshotId?: string } | undefined;
  if (!record) return <Empty title="No workbook is open" />;
  const index = Number(payload?.snapshotId?.split("-").pop() ?? -1);
  const snapshot = record.history[index];
  if (!snapshot) return <Empty title="Version not found" />;
  const stored = readWorkbook(snapshot.body);
  const nowCells = editor.workbook.sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0);
  const thenCells = stored.sheets.reduce((total, sheet) => total + Object.keys(sheet.cells).length, 0);
  return (
    <form
      id="restore-confirmation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(record.id, { body: stored }, { expectRevision: record.revision, event: `Workbook restored to the version saved ${snapshot.at}` });
        context.toast("Restored", `The workbook is back to ${context.dateTime(snapshot.at)}. The version you were on is kept in the history.`);
        close();
      }}
    >
      <Notice tone="warning" title="Restoring replaces every sheet">
        The current state is written to the version history first, so this is reversible. Nothing is merged: the stored version wins entirely.
      </Notice>
      <Properties rows={[
        { label: "Version", value: context.dateTime(snapshot.at) },
        { label: "Sheets then / now", value: `${stored.sheets.length} → ${editor.workbook.sheets.length}` },
        { label: "Cells then / now", value: `${thenCells} → ${nowCells}` },
        { label: "Charts then / now", value: `${stored.charts.length} → ${editor.workbook.charts.length}` },
      ]} />
    </form>
  );
}

/* ====================================================================== *
 * Registration
 * ====================================================================== */

registerApp({
  code: "SHEETS",
  short: "Sheets",
  name: "Spreadsheets, Models & Structured Data",
  purpose: "Model the business in a real grid with a deterministic calculation engine.",
  icon: FileSpreadsheet,
  nav: [
    { label: "Library", items: [{ label: "Workbooks", screenId: "ARL-SHEETS-001", icon: FileSpreadsheet }] },
    { label: "This workbook", items: [
      { label: "Grid", screenId: "ARL-SHEETS-002", icon: Grid2x2 },
      { label: "Formulas", screenId: "ARL-SHEETS-003", icon: FunctionSquare },
      { label: "Tables", screenId: "ARL-SHEETS-004", icon: Table2 },
      { label: "Charts", screenId: "ARL-SHEETS-005", icon: BarChart3 },
      { label: "Import & export", screenId: "ARL-SHEETS-006", icon: FileUp },
      { label: "Collaboration", screenId: "ARL-SHEETS-007", icon: MessageSquare },
    ] },
  ],
  screens: {
    "ARL-SHEETS-001": {
      id: "ARL-SHEETS-001",
      inspectorTitle: "Workbook",
      inspector: (context) => <LibraryInspector context={context} />,
      tabs: (["Recent", "Mine", "Shared", "Templates"] as const).map((id) => ({ id, render: (context) => <WorkbookLibrary context={context} tab={id} /> })),
      actions: [
        { id: "Create", label: "New workbook", placement: "primary", run: (context) => context.openOverlay("new workbook") },
        { id: "import", label: "Import CSV", placement: "secondary", icon: <FileUp size={15} />, run: (context) => context.openOverlay("Import mapper") },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a workbook first"),
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const source = await import("@/platform/repo").then((module) => module.getRecord(id));
            if (!source) return;
            const created = await context.mutate.create({
              collection: "workbooks", title: `${source.title} copy`, status: "active", summary: source.summary,
              tags: source.tags, fields: { ...source.fields }, body: readWorkbook(source.body),
            }, `${source.title} duplicated`);
            context.toast("Duplicated", `${created.title} has the same sheets, formats and formulas.`);
          },
        },
        { id: "search", label: "Search workbooks…", placement: "overflow", run: (context) => context.openOverlay("search workbooks") },
        {
          id: "archive", label: "Archive", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a workbook first"),
          run: async (context) => {
            if (!context.selectedId) return;
            const record = await import("@/platform/repo").then((module) => module.getRecord(context.selectedId!));
            await context.mutate.patch(context.selectedId, { status: "archived" }, { expectRevision: record?.revision, event: "Workbook archived" });
            context.toast("Archived", "It stays in this browser and can be reopened from the library.");
          },
        },
      ],
      overlays: [
        { id: "new workbook", kind: "modal", title: "New workbook", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-workbook">Create</Button></>, render: (context) => <NewWorkbook context={context} close={context.close} /> },
        { id: "Import mapper", kind: "drawer", title: "Import CSV", width: 620, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="import-wizard">Import</Button></>, render: (context) => <ImportMapper context={context} close={context.close} /> },
        { id: "search workbooks", kind: "modal", title: "Search workbooks", width: 560, render: (context) => <SearchWorkbooks context={context} close={context.close} /> },
        { id: "share", kind: "modal", title: "Share workbook", width: 480, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="share-workbook">Save</Button></>, render: (context) => <ShareWorkbook context={context} close={context.close} /> },
      ],
    },

    "ARL-SHEETS-002": {
      id: "ARL-SHEETS-002",
      chrome: "full",
      surface: (context) => <GridEditorScreen context={context} />,
      tabs: ["Sheet tabs", "Data", "Formulas", "Review", "View"].map((id) => ({ id, render: () => null })),
      actions: GRID_ACTIONS,
      overlays: [
        { id: "Format cells", kind: "modal", title: "Format cells", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="format-cells">Apply</Button></>, render: (context) => <FormatCells context={context} close={context.close} /> },
        { id: "data validation", kind: "modal", title: "Data", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="validation">Save</Button></>, render: (context) => <ValidationOverlay context={context} close={context.close} /> },
        { id: "named range", kind: "modal", title: "Named range", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="named-range">Save</Button></>, render: (context) => <NamedRangeOverlay context={context} close={context.close} /> },
        { id: "edit cell", kind: "modal", title: "Edit cell", width: 480, footer: formFooter("sheets-edit-cell", "Save"), render: (context) => <EditCell context={context} close={context.close} /> },
        { id: "paste cells", kind: "modal", title: "Paste", width: 560, footer: formFooter("sheets-paste", "Paste"), render: (context) => <PasteCells context={context} close={context.close} /> },
        { id: "sort range", kind: "modal", title: "Sort", width: 480, footer: formFooter("sheets-sort", "Sort"), render: (context) => <SortForm context={context} close={context.close} /> },
        { id: "chart picker", kind: "drawer", title: "Chart", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="chart-picker">Save chart</Button></>, render: (context) => <ChartPicker context={context} close={context.close} /> },
      ],
    },

    "ARL-SHEETS-003": {
      id: "ARL-SHEETS-003",
      title: () => "Formula manager",
      tabs: (["All", "Errors", "Dependencies", "Named ranges"] as const).map((id) => ({ id, render: (context) => <FormulaManager context={context} tab={id} /> })),
      actions: [
        {
          id: "recalculate", label: "Recalculate", placement: "primary", icon: <RefreshCw size={15} />,
          run: (context) => {
            const editor = activeWorkbookEditor(context.params.id);
            if (!editor) { context.toast("Open the workbook first", "Recalculating evaluates the open workbook.", "blocked"); return; }
            editor.recalculate();
            const formulas = Object.keys(editor.evaluation.graph).length;
            context.toast("Recalculated", `${formulas} formulas re-evaluated in dependency order. ${editor.evaluation.errors.length} return an error and ${editor.evaluation.cycles.length} sit in a cycle; the counts are from this run.`);
          },
        },
        {
          id: "Inspect", label: "Inspect a formula", placement: "secondary",
          run: (context) => {
            const editor = activeWorkbookEditor(context.params.id);
            if (!editor) return;
            const active = `${editor.sheet.name}!${cellAddress(editor.selection.active.col, editor.selection.active.row)}`;
            const key = editor.evaluation.graph[active] ? active : editor.evaluation.errors[0]?.key ?? Object.keys(editor.evaluation.graph)[0];
            if (!key) { context.toast("No formulas", "This workbook holds no formula to inspect.", "info"); return; }
            context.openOverlay("Formula inspector", { key });
          },
        },
        { id: "fix selected", label: "Fix selected errors…", placement: "overflow", run: (context) => context.openOverlay("fix errors") },
        { id: "compare", label: "Compare dependencies…", placement: "overflow", run: (context) => context.openOverlay("compare dependencies") },
      ],
      overlays: [
        { id: "Formula inspector", kind: "drawer", title: "Formula", width: 560, render: (context) => <FormulaInspector context={context} /> },
        { id: "function help", kind: "modal", title: "Function help", width: 620, render: (context) => <FunctionHelp context={context} /> },
        { id: "circular reference", kind: "drawer", title: "Circular reference", width: 600, tone: "danger", render: (context) => <CircularReference context={context} /> },
        { id: "fix errors", kind: "modal", title: "Fix formula errors", width: 620, footer: formFooter("sheets-fix", "Wrap the ticked formulas"), render: (context) => <FixErrors context={context} close={context.close} /> },
        { id: "compare dependencies", kind: "modal", title: "Compare dependencies", width: 720, render: (context) => <CompareDependencies context={context} /> },
      ],
    },

    "ARL-SHEETS-004": {
      id: "ARL-SHEETS-004",
      title: () => "Data tables",
      tabs: (["Tables", "Views", "Relationships", "Validation"] as const).map((id) => ({ id, render: (context) => <DataTables context={context} tab={id} /> })),
      actions: [
        { id: "Create table", label: "Create table", placement: "primary", run: (context) => context.openOverlay("Column editor", { mode: "create" }) },
        { id: "edit schema", label: "Edit schema", placement: "secondary", run: (context) => context.openOverlay("Column editor") },
        { id: "import", label: "Import into a table…", placement: "overflow", run: (context) => context.openOverlay("import schema") },
        { id: "connect", label: "Connect a source…", placement: "overflow", run: (context) => context.openOverlay("connect source") },
      ],
      overlays: [
        { id: "Column editor", kind: "drawer", title: "Table schema", width: 620, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="column-editor">Save</Button></>, render: (context) => <ColumnEditor context={context} close={context.close} /> },
        { id: "import schema", kind: "drawer", title: "Import", width: 620, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="import-wizard">Import</Button></>, render: (context) => <ImportMapper context={context} close={context.close} /> },
        { id: "relation preview", kind: "drawer", title: "References", width: 560, render: (context) => <RelationPreview context={context} /> },
        { id: "connect source", kind: "modal", title: "Connect a source", width: 520, footer: formFooter("sheets-connect", "Record the request"), render: (context) => <ConnectSource context={context} close={context.close} /> },
      ],
    },

    "ARL-SHEETS-005": {
      id: "ARL-SHEETS-005",
      title: () => "Charts & dashboards",
      tabs: (["Charts", "Pivot", "Dashboard", "Presentation"] as const).map((id) => ({ id, render: (context) => <ChartsScreen context={context} tab={id} /> })),
      actions: [
        { id: "Create chart", label: "New chart", placement: "primary", run: (context) => context.openOverlay("Series editor", { mode: "create" }) },
        { id: "change type", label: "Change the chart type…", placement: "secondary", run: (context) => context.openOverlay("chart type") },
        { id: "drill down", label: "Drill down…", placement: "overflow", run: (context) => context.openOverlay("drill down") },
        { id: "publish", label: "Publish to a deck…", placement: "overflow", run: (context) => context.openOverlay("publish chart") },
      ],
      overlays: [
        { id: "Series editor", kind: "drawer", title: "Chart series", width: 600, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="chart-picker">Save chart</Button></>, render: (context) => <SeriesEditor context={context} close={context.close} /> },
        { id: "formatting inspector", kind: "modal", title: "Chart formatting", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="formatting-inspector">Save</Button></>, render: (context) => <FormattingInspector context={context} close={context.close} /> },
        { id: "calculation note", kind: "modal", title: "How these numbers are produced", width: 560, render: (context) => <CalculationNote context={context} /> },
        { id: "chart type", kind: "modal", title: "Change the chart type", width: 480, footer: formFooter("sheets-chart-type", "Change"), render: (context) => <ChangeChartType context={context} close={context.close} /> },
        { id: "drill down", kind: "drawer", title: "Drill down", width: 640, render: (context) => <DrillDown context={context} /> },
        { id: "publish chart", kind: "modal", title: "Publish a chart to a deck", width: 520, footer: formFooter("sheets-publish-chart", "Publish"), render: (context) => <SendChartToDeck context={context} close={context.close} /> },
      ],
    },

    "ARL-SHEETS-006": {
      id: "ARL-SHEETS-006",
      title: () => "Import & export",
      tabs: (["Imports", "Exports", "Errors", "History"] as const).map((id) => ({ id, render: (context) => <ImportExport context={context} tab={id} /> })),
      actions: [
        { id: "Upload", label: "Upload a CSV", placement: "primary", run: (context) => context.openOverlay("Import wizard") },
        { id: "export", label: "Export CSV…", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("export csv") },
        { id: "map columns", label: "Map columns", placement: "overflow", run: (context) => context.openOverlay("Import wizard") },
        { id: "test", label: "Test compatibility", placement: "overflow", run: (context) => context.openOverlay("compatibility report") },
        { id: "publish", label: "Publish…", placement: "overflow", run: (context) => context.openOverlay("publish workbook") },
        { id: "rollback", label: "Roll back an import", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("rollback") },
      ],
      overlays: [
        { id: "Import wizard", kind: "drawer", title: "Import CSV", width: 640, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="import-wizard">Import</Button></>, render: (context) => <ImportMapper context={context} close={context.close} /> },
        {
          id: "compatibility report", kind: "modal", title: "Compatibility", width: 600,
          render: (context) => <CompatibilityCheck context={context} />,
        },
        { id: "export csv", kind: "modal", title: "Export CSV", width: 520, footer: formFooter("sheets-export", "Export"), render: (context) => <ExportCsv context={context} close={context.close} /> },
        { id: "publish workbook", kind: "modal", title: "Publish the workbook", width: 520, footer: formFooter("sheets-publish", "Publish"), render: (context) => <PublishWorkbook context={context} close={context.close} /> },
        { id: "rollback", kind: "modal", title: "Roll back", tone: "danger", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="outline-danger" type="submit" form="rollback">Roll back</Button></>, render: (context) => <RollbackOverlay context={context} close={context.close} /> },
      ],
    },

    "ARL-SHEETS-007": {
      id: "ARL-SHEETS-007",
      title: () => "Collaboration & versioning",
      tabs: (["Comments", "History", "Permissions", "Changes"] as const).map((id) => ({ id, render: (context) => <Collaboration context={context} tab={id} /> })),
      actions: [
        { id: "Comment", label: "Comment on a cell…", placement: "primary", run: (context) => context.openOverlay("comment cell") },
        { id: "compare", label: "Compare", placement: "secondary", run: (context) => context.setTab("Changes") },
        { id: "protect", label: "Protect a range", placement: "overflow", run: (context) => context.openOverlay("protected range") },
        { id: "restore", label: "Restore a version…", placement: "overflow", run: (context) => context.openOverlay("restore version") },
        {
          id: "merge", label: "Merge with the stored version", placement: "overflow",
          guard: (context) => { const editor = activeWorkbookEditor(context.params.id); return editor && !editor.conflict ? "No conflict is outstanding" : undefined; },
          run: (context) => context.openOverlay("Conflict resolver"),
        },
      ],
      overlays: [
        { id: "Conflict resolver", kind: "drawer", title: "Conflict", width: 540, render: (context) => <ConflictResolver context={context} close={context.close} /> },
        { id: "protected range", kind: "modal", title: "Protect a range", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="protected-range">Protect</Button></>, render: (context) => <ProtectedRangeOverlay context={context} close={context.close} /> },
        { id: "comment cell", kind: "modal", title: "Comment on a cell", width: 480, footer: formFooter("sheets-comment", "Comment"), render: (context) => <CommentCell context={context} close={context.close} /> },
        { id: "restore version", kind: "modal", title: "Restore a version", width: 560, render: (context) => <RestoreVersion context={context} /> },
        { id: "restore confirmation", kind: "modal", title: "Restore this version", tone: "danger", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="outline-danger" type="submit" form="restore-confirmation">Restore</Button></>, render: (context) => <RestoreConfirmation context={context} close={context.close} /> },
      ],
    },
  },
});
