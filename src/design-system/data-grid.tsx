import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./primitives";
import { TextInput } from "./fields";

export interface Column<T> {
  key: string;
  header: string;
  /** Rendered cell. */
  cell: (row: T) => ReactNode;
  /** Comparable value for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** Text used by the grid filter. */
  filterValue?: (row: T) => string;
  align?: "start" | "end";
  width?: string;
  /** Hide below this viewport width (px). */
  hideBelow?: number;
  primary?: boolean;
}

export interface GridAction<T> {
  label: string;
  onRun: (rows: T[]) => void;
  tone?: "danger";
  disabled?: (rows: T[]) => boolean;
}

export interface DataGridProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowId: (row: T) => string;
  label: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  rowTone?: (row: T) => "danger" | "warning" | undefined;
  /** Bulk actions enable the checkbox column. */
  bulkActions?: GridAction<T>[];
  toolbar?: ReactNode;
  empty?: ReactNode;
  filterable?: boolean;
  /** Mobile card renderer; falls back to primary column + first two columns. */
  card?: (row: T) => ReactNode;
  dense?: boolean;
  pageSize?: number;
  /** Footer summary, e.g. column totals. */
  summary?: ReactNode;
}

export function DataGrid<T>({
  rows, columns, rowId, label, selectedId, onSelect, onOpen, rowTone,
  bulkActions, toolbar, empty, filterable = true, card, pageSize = 60, summary,
}: DataGridProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(pageSize);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((column) => {
        const value = column.filterValue ? column.filterValue(row) : undefined;
        return value ? value.toLowerCase().includes(q) : false;
      }),
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
      return sort.dir === "asc" ? result : -result;
    });
    return copy;
  }, [filtered, sort, columns]);

  const visible = sorted.slice(0, limit);
  /* When a grid can both select and open, a click selects and an explicit
     Open control opens. Otherwise selecting a row would navigate away, and an
     action that needs a selection could never be used with a pointer. */
  const bothModes = Boolean(onSelect && onOpen);
  const selectedRows = bulkActions ? sorted.filter((row) => checked.has(rowId(row))) : [];

  function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, id: string, index: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (onOpen) onOpen(id);
      else onSelect?.(id);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (onSelect) onSelect(id);
      else onOpen?.(id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    const target = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]")[next];
    if (target) {
      target.focus();
      onSelect?.(target.dataset.row ?? id);
    }
  }

  return (
    <div className="ds-grid-wrap" data-responsive={card !== undefined || columns.some((c) => c.primary) ? "cards" : undefined}>
      {(filterable || toolbar || bulkActions) && (
        <div className="ds-grid-toolbar">
          {filterable && (
            <TextInput
              type="search"
              placeholder="Filter"
              aria-label={`Filter ${label}`}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }}
              style={{ maxWidth: 220, minHeight: "var(--control-h-sm)" }}
            />
          )}
          {toolbar}
          <span className="ds-grow" />
          {bulkActions && checked.size > 0 && (
            <>
              <span className="ds-subtle">{checked.size} selected</span>
              {bulkActions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.tone === "danger" ? "outline-danger" : "secondary"}
                  disabled={action.disabled?.(selectedRows)}
                  onClick={() => { action.onRun(selectedRows); setChecked(new Set()); }}
                >
                  {action.label}
                </Button>
              ))}
            </>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        empty ?? <div className="ds-empty"><h3>Nothing here yet</h3><p>No records match this view.</p></div>
      ) : (
        <>
          <div className="ds-grid-scroll">
            <table className="ds-table">
              <caption className="ds-sr-only">{label}</caption>
              <thead>
                <tr>
                  {bulkActions && (
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        checked={checked.size > 0 && checked.size === sorted.length}
                        ref={(node) => { if (node) node.indeterminate = checked.size > 0 && checked.size < sorted.length; }}
                        onChange={(event) => setChecked(event.target.checked ? new Set(sorted.map(rowId)) : new Set())}
                      />
                    </th>
                  )}
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      data-align={column.align === "end" ? "end" : undefined}
                      style={{ width: column.width }}
                      aria-sort={sort?.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={column.hideBelow ? `ds-hide-${column.hideBelow}` : undefined}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => setSort((current) =>
                            current?.key === column.key
                              ? { key: column.key, dir: current.dir === "asc" ? "desc" : "asc" }
                              : { key: column.key, dir: "asc" })}
                        >
                          {column.header}
                          <span aria-hidden="true">{sort?.key === column.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                        </button>
                      ) : column.header}
                    </th>
                  ))}
                  {bothModes && <th style={{ width: 72 }}><span className="ds-sr-only">Open</span></th>}
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {visible.map((row, index) => {
                  const id = rowId(row);
                  return (
                    <tr
                      key={id}
                      data-row={id}
                      tabIndex={0}
                      aria-selected={id === selectedId}
                      data-tone={rowTone?.(row)}
                      onClick={() => (bothModes ? onSelect?.(id) : onOpen ? onOpen(id) : onSelect?.(id))}
                      onDoubleClick={() => { if (bothModes) onOpen?.(id); }}
                      onFocus={() => onSelect?.(id)}
                      onKeyDown={(event) => onRowKey(event, id, index)}
                      style={{ cursor: onOpen || onSelect ? "pointer" : undefined }}
                    >
                      {bulkActions && (
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select row ${id}`}
                            checked={checked.has(id)}
                            onChange={(event) => setChecked((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(id); else next.delete(id);
                              return next;
                            })}
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td key={column.key} data-align={column.align === "end" ? "end" : undefined} className={column.primary ? "ds-table-primary" : undefined}>
                          {column.cell(row)}
                        </td>
                      ))}
                      {bothModes && (
                        <td data-align="end" onClick={(event) => event.stopPropagation()}>
                          <Button size="sm" variant="ghost" aria-label={`Open row ${id}`} onClick={() => onOpen?.(id)}>Open</Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ds-card-list">
            {visible.map((row) => {
              const id = rowId(row);
              return (
                <div key={id} className="ds-stack ds-gap-1" data-checked={bulkActions && checked.has(id) ? "true" : undefined}>
                {bulkActions && (
                  <label className="ds-check ds-record-card-check">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${id}`}
                      checked={checked.has(id)}
                      onChange={(event) => setChecked((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(id); else next.delete(id);
                        return next;
                      })}
                    />
                    <span className="ds-subtle">Select</span>
                  </label>
                )}
                <button
                  type="button"
                  className="ds-record-card"
                  aria-pressed={bothModes ? id === selectedId : undefined}
                  onClick={() => (bothModes ? onSelect?.(id) : onOpen ? onOpen(id) : onSelect?.(id))}
                >
                  {card ? card(row) : (
                    <>
                      <strong>{columns.find((column) => column.primary)?.cell(row) ?? columns[0].cell(row)}</strong>
                      <span className="ds-subtle ds-row ds-gap-2 ds-wrap">
                        {columns.slice(1, 3).map((column) => <span key={column.key}>{column.cell(row)}</span>)}
                      </span>
                    </>
                  )}
                </button>
                {bothModes && id === selectedId && (
                  <Button size="sm" variant="secondary" onClick={() => onOpen?.(id)}>Open</Button>
                )}
                </div>
              );
            })}
          </div>

          <div className="ds-grid-foot">
            <span>
              {visible.length === sorted.length
                ? `${sorted.length} ${sorted.length === 1 ? "record" : "records"}`
                : `${visible.length} of ${sorted.length} records`}
              {query && ` · filtered from ${rows.length}`}
            </span>
            <span className="ds-row ds-gap-3">
              {summary}
              {visible.length < sorted.length && (
                <Button size="sm" variant="ghost" onClick={() => setLimit((value) => value + pageSize)}>Show more</Button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
