import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { Folder, FolderOpen, FolderPlus, Images, Inbox, Link2, Pencil, Upload, X } from "lucide-react";
import {
  Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Segmented,
  Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useWorkspace } from "@/platform/workspace";
import { routeForRecord } from "@/platform/attention";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { AssetPreview, FileStateTag, fileState } from "./thumbs";
import {
  ALL_FOLDERS, EMPTY_FILTER, LINKABLE_COLLECTIONS, LINKABLE_LABEL, SORT_LABEL, UNFILED,
  addTags, bytesOf, duplicatesOf, extensionOf, filterAssets, folderCounts, folderOf, hexDigest, kindForFile,
  licence, linkedIds, parseTags, removeTag, sortAssets, tagCounts, titleFromFileName, validateUpload,
  withLink, withoutLink,
  type AssetSort, type LibraryFilter, type LicenceFilter,
} from "./library-model";
import "./asset.css";

/* ====================================================================== *
 * ASSET library workspace (ARL-ASSET-001)
 *
 * Folders on the left, search, filters, sort and tags on top, a grid or list
 * of real previews, multi-select with bulk edits, and an import that keeps
 * each chosen file in this browser's IndexedDB with its record.
 * ====================================================================== */

export const FOLDER_COLLECTION = "assetFolders";

/* ---------- Filter store: one setting shared by the toolbar, the rail and actions ---------- */

let filterState: LibraryFilter = EMPTY_FILTER;
const filterListeners = new Set<() => void>();
function setFilter(patch: Partial<LibraryFilter>): void {
  filterState = { ...filterState, ...patch };
  for (const listener of filterListeners) listener();
}
function useFilter(): [LibraryFilter, (patch: Partial<LibraryFilter>) => void] {
  const value = useSyncExternalStore(
    (listener) => { filterListeners.add(listener); return () => { filterListeners.delete(listener); }; },
    () => filterState,
    () => filterState,
  );
  return [value, setFilter];
}

/* ---------- Grouping: the contract "group" action and the toolbar control are one setting ---------- */

export type AssetGrouping = "none" | "kind" | "licence" | "tag" | "folder";
let grouping: AssetGrouping = "none";
const groupingListeners = new Set<() => void>();
export function setAssetGrouping(next: AssetGrouping): void {
  grouping = next;
  for (const listener of groupingListeners) listener();
}
export function useAssetGrouping(): [AssetGrouping, (next: AssetGrouping) => void] {
  const value = useSyncExternalStore(
    (listener) => { groupingListeners.add(listener); return () => { groupingListeners.delete(listener); }; },
    () => grouping,
    () => grouping,
  );
  return [value, setAssetGrouping];
}

/* ---------- Per-viewer conveniences: layout and sort survive a reload on this device ---------- */

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable: the choice lasts this visit only */ }
}
const SORTS = ["updated", "oldest", "name", "size", "uses", "expiry"] as const;
const VIEWS = ["grid", "list"] as const;

const KIND_OPTIONS = ["image", "logo", "icon", "template", "document", "video", "audio", "font", "other"];

type LibraryTab = "All" | "Mine" | "Approved" | "Brand" | "Archived";

export function useFolders(): Rec[] {
  const rows = useCollection(FOLDER_COLLECTION);
  return useMemo(() => [...rows].sort((a, b) => a.title.localeCompare(b.title)), [rows]);
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function tabRows(all: Rec[], tab: LibraryTab, actor: string): Rec[] {
  if (tab === "Archived") return all.filter((row) => row.status === "archived");
  const live = all.filter((row) => row.status !== "archived");
  if (tab === "Mine") return live.filter((row) => row.ownerName === actor || String(row.fields.photographer ?? "") === actor || String(row.fields.importedBy ?? "") === actor);
  if (tab === "Approved") return live.filter((row) => row.status === "approved");
  if (tab === "Brand") return live.filter((row) => row.tags.includes("brand") || Boolean(row.fields.brandId));
  return live;
}

export function AssetLibrary({ context, tab }: { context: ScreenContext; tab: LibraryTab }) {
  const assets = useCollection("assets");
  const folders = useFolders();
  const { now, actor } = useWorkspace();
  const [filter, patchFilter] = useFilter();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<"grid" | "list">(() => readPref("arlovi.asset.view", "grid", VIEWS));
  const [sort, setSortState] = useState<AssetSort>(() => readPref("arlovi.asset.sort", "updated", SORTS));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [group, setGroup] = useAssetGrouping();

  // The open folder lives in the address, so a folder can be linked to and survives a reload.
  const folder = params.get("folder") ?? ALL_FOLDERS;
  function openFolder(id: string) {
    const next = new URLSearchParams(params);
    if (id === ALL_FOLDERS) next.delete("folder");
    else next.set("folder", id);
    setParams(next, { replace: true });
    setChecked(new Set());
  }
  const setView = (next: "grid" | "list") => { setViewState(next); writePref("arlovi.asset.view", next); };
  const setSort = (next: AssetSort) => { setSortState(next); writePref("arlovi.asset.sort", next); };

  const base = useMemo(() => tabRows(assets, tab, actor), [assets, tab, actor]);
  const rows = useMemo(() => sortAssets(filterAssets(base, { ...filter, folder }, now), sort), [base, filter, folder, now, sort]);
  const counts = useMemo(() => folderCounts(base), [base]);
  const tags = useMemo(() => tagCounts(base).slice(0, 14), [base]);
  const selected = rows.filter((row) => checked.has(row.id));
  const filtersOn = Boolean(filter.query.trim()) || filter.kind !== "all" || filter.licence !== "any" || filter.tags.length > 0;
  const openFolderRecord = folders.find((row) => row.id === folder);
  const expired = rows.filter((row) => licence(row, now).state === "expired");
  const groups = useMemo(() => {
    if (group === "none") return [{ label: "", rows }];
    const key = (row: Rec) => {
      if (group === "kind") return String(row.fields.kind ?? "other");
      if (group === "licence") return String(row.fields.licence ?? "unrecorded").replace(/_/g, " ");
      if (group === "folder") return folders.find((entry) => entry.id === folderOf(row))?.title ?? "Not in a folder";
      return row.tags[0] ?? "untagged";
    };
    const map = new Map<string, Rec[]>();
    for (const row of rows) {
      const label = key(row);
      map.set(label, [...(map.get(label) ?? []), row]);
    }
    return [...map.entries()].map(([label, list]) => ({ label, rows: list })).sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [rows, group, folders]);

  // Drop the selection of rows that are no longer shown.
  useEffect(() => {
    setChecked((current) => {
      const visible = new Set(rows.map((row) => row.id));
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const inspect = (id: string) => { context.select(id); context.openOverlay("asset inspector", { id }); };
  const openAsset = (id: string) => context.navigate(`/o/${context.org.slug}/asset/assets/${id}`);

  async function archive(list: Rec[]) {
    const live = list.filter((row) => row.status !== "archived");
    await Promise.all(live.map((row) => context.mutate.patch(row.id, { status: "archived", fields: { ...row.fields, archivedBy: context.actor, archivedAt: clockIso(), statusBeforeArchive: row.status } }, { event: `Asset archived: ${row.title}`, expectRevision: row.revision })));
    context.toast("Archived", `${live.length} ${live.length === 1 ? "asset is" : "assets are"} archived. Archived assets stay resolvable so older documents still find them.`);
    setChecked(new Set());
  }

  const rail = (
    <nav className="asset-rail" aria-label="Folders">
      <div className="asset-rail-head">
        <span className="ds-eyebrow">Folders</span>
        <Button size="sm" variant="ghost" aria-label="New folder" onClick={() => context.openOverlay("folder editor")}><FolderPlus size={15} /></Button>
      </div>
      <ul className="asset-rail-list">
        <li>
          <button type="button" className="asset-rail-item" aria-current={folder === ALL_FOLDERS ? "true" : undefined} onClick={() => openFolder(ALL_FOLDERS)}>
            <Images size={15} aria-hidden="true" /><span className="asset-rail-name">All assets</span><span className="asset-rail-count">{base.length}</span>
          </button>
        </li>
        <li>
          <button type="button" className="asset-rail-item" aria-current={folder === UNFILED ? "true" : undefined} onClick={() => openFolder(UNFILED)}>
            <Inbox size={15} aria-hidden="true" /><span className="asset-rail-name">Not in a folder</span><span className="asset-rail-count">{counts.get(UNFILED) ?? 0}</span>
          </button>
        </li>
        <li aria-hidden="true"><div className="asset-rail-sep" /></li>
        {folders.map((row) => (
          <li key={row.id}>
            <div className="asset-rail-row">
              <button type="button" className="asset-rail-item" aria-current={folder === row.id ? "true" : undefined} onClick={() => openFolder(row.id)}>
                {folder === row.id ? <FolderOpen size={15} aria-hidden="true" /> : <Folder size={15} aria-hidden="true" />}
                <span className="asset-rail-name">{row.title}</span>
                <span className="asset-rail-count">{counts.get(row.id) ?? 0}</span>
              </button>
              <Button size="sm" variant="ghost" className="asset-rail-edit" aria-label={`Edit folder ${row.title}`} onClick={() => context.openOverlay("folder editor", { id: row.id })}><Pencil size={13} /></Button>
            </div>
          </li>
        ))}
      </ul>
      {folders.length === 0 && <p className="ds-subtle" style={{ padding: "var(--space-1)" }}>No folders yet. Folders group assets without copying them.</p>}
    </nav>
  );

  const toolbar = (
    <div className="asset-toolbar" role="search">
      <TextInput
        className="asset-search"
        type="search"
        aria-label="Search the library"
        placeholder="Search name, tag, licensor, file name"
        value={filter.query}
        onChange={(event) => patchFilter({ query: event.target.value })}
      />
      <Select aria-label="Type" value={filter.kind} onChange={(event) => patchFilter({ kind: event.target.value })}>
        <option value="all">Every type</option>
        {KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</option>)}
      </Select>
      <Select aria-label="Licence" value={filter.licence} onChange={(event) => patchFilter({ licence: event.target.value as LicenceFilter })}>
        <option value="any">Any licence</option>
        <option value="clear">Clear to use</option>
        <option value="expiring">Expiring within 30 days</option>
        <option value="expired">Expired</option>
        <option value="unrecorded">No licence recorded</option>
      </Select>
      <Select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as AssetSort)}>
        {SORTS.map((entry) => <option key={entry} value={entry}>{SORT_LABEL[entry]}</option>)}
      </Select>
      <Select aria-label="Group by" value={group} onChange={(event) => setGroup(event.target.value as AssetGrouping)}>
        <option value="none">No grouping</option>
        <option value="kind">Group by type</option>
        <option value="licence">Group by licence</option>
        <option value="folder">Group by folder</option>
        <option value="tag">Group by first tag</option>
      </Select>
      <Segmented label="Layout" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
    </div>
  );

  const tagBar = tags.length > 0 && (
    <div className="asset-tagbar" aria-label="Filter by tag">
      <span className="ds-subtle">Tags</span>
      {tags.map(({ tag, count }) => {
        const on = filter.tags.includes(tag);
        return (
          <button key={tag} type="button" className="asset-chip" aria-pressed={on} onClick={() => patchFilter({ tags: on ? removeTag(filter.tags, tag) : [...filter.tags, tag] })}>
            {tag} <span className="ds-num">{count}</span>
          </button>
        );
      })}
      {filtersOn && <Button size="sm" variant="ghost" onClick={() => patchFilter({ ...EMPTY_FILTER })}>Clear filters</Button>}
    </div>
  );

  const selectionBar = selected.length > 0 && (
    <div className="asset-selbar" role="region" aria-label="Selected assets">
      <strong>{selected.length} selected</strong>
      <span className="ds-grow" />
      <Button size="sm" variant="secondary" onClick={() => context.openOverlay("bulk edit", { ids: selected.map((row) => row.id) })}>Move or tag</Button>
      <Button size="sm" variant="secondary" onClick={() => context.openOverlay("rights check", { ids: selected.map((row) => row.id) })}>Check rights</Button>
      {tab !== "Archived" && <Button size="sm" variant="danger" onClick={() => void archive(selected)}>Archive</Button>}
      <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Clear</Button>
    </div>
  );

  const empty = (
    <Empty
      title={filtersOn || folder !== ALL_FOLDERS ? "No assets match" : "Nothing here yet"}
      icon={<Images size={20} />}
      action={filtersOn
        ? <Button size="sm" variant="secondary" onClick={() => patchFilter({ ...EMPTY_FILTER })}>Clear filters</Button>
        : <Button size="sm" variant="primary" onClick={() => context.openOverlay("Media import", { folderId: folder !== ALL_FOLDERS && folder !== UNFILED ? folder : undefined })}>Upload files</Button>}
    >
      {filtersOn ? "Nothing in this view matches the search and filters." : "Upload files, or drop them anywhere on the library."}
    </Empty>
  );

  return (
    <div className="asset-lib">
      {rail}
      <div
        className="asset-lib-main"
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragOver(true); } }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false); }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragOver(false);
          context.openOverlay("Media import", { files: [...event.dataTransfer.files], folderId: folder !== ALL_FOLDERS && folder !== UNFILED ? folder : undefined });
        }}
        data-drag={dragOver ? "true" : undefined}
      >
        <Row gap={2} wrap style={{ alignItems: "baseline" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>{folder === ALL_FOLDERS ? `${tab === "All" ? "All assets" : tab}` : folder === UNFILED ? "Not in a folder" : openFolderRecord?.title ?? "Folder"}</h2>
          <span className="ds-subtle">{rows.length} of {base.length} shown</span>
          <span className="ds-grow" />
          {openFolderRecord && <Button size="sm" variant="ghost" onClick={() => context.openOverlay("folder editor", { id: openFolderRecord.id })}><Pencil size={14} /> Edit folder</Button>}
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Media import", { folderId: folder !== ALL_FOLDERS && folder !== UNFILED ? folder : undefined })}>
            <Upload size={14} /> Upload{openFolderRecord ? " here" : ""}
          </Button>
        </Row>
        {openFolderRecord?.summary && <p className="ds-subtle">{openFolderRecord.summary}</p>}
        {folder !== ALL_FOLDERS && folder !== UNFILED && !openFolderRecord && folders.length > 0 && (
          <Notice tone="warning" title="That folder is not in this workspace">It may have been deleted. Showing nothing rather than another folder's assets.</Notice>
        )}
        {toolbar}
        {tagBar}
        {expired.length > 0 && (
          <Notice
            tone="warning"
            title={`${expired.length} ${expired.length === 1 ? "asset has" : "assets have"} an expired licence`}
            actions={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/governance?tab=Rights`)}>Rights report</Button>}
          >
            {expired.map((row) => row.title).join("; ")} may not be used in anything published. Downloads and transformation jobs that include them are refused.
          </Notice>
        )}
        {dragOver && <div className="asset-drop" data-over="true">Drop to import into {openFolderRecord ? openFolderRecord.title : "the library"}</div>}
        {view === "grid" ? (
          <>
            {selectionBar}
            {rows.length === 0 ? empty : (
              <>
                <Row gap={2}>
                  <Checkbox
                    label={checked.size === rows.length ? "Clear selection" : `Select all ${rows.length}`}
                    checked={checked.size > 0 && checked.size === rows.length}
                    onChange={() => setChecked(checked.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)))}
                  />
                </Row>
                {groups.map((bucket) => (
                  <Stack key={bucket.label || "all"} gap={2}>
                    {bucket.label && <h3 style={{ textTransform: "capitalize", fontSize: "var(--text-md)" }}>{bucket.label} · {bucket.rows.length}</h3>}
                    <ul className="asset-tiles" aria-label={bucket.label ? `Assets: ${bucket.label}` : "Assets"} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {bucket.rows.map((row) => <AssetTile key={row.id} row={row} context={context} now={now} folders={folders} checked={checked.has(row.id)} onToggle={() => toggle(row.id)} onInspect={() => inspect(row.id)} />)}
                    </ul>
                  </Stack>
                ))}
              </>
            )}
          </>
        ) : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Asset library"
            selectedId={context.selectedId}
            onSelect={context.select}
            onOpen={openAsset}
            rowTone={(row) => (licence(row, now).state === "expired" ? "danger" : licence(row, now).state === "expiring" ? "warning" : undefined)}
            filterable={false}
            columns={[
              {
                key: "title", header: "Asset", primary: true,
                cell: (row) => (
                  <Row gap={3}>
                    <div style={{ width: 56, flex: "none" }}><AssetPreview record={row} height={38} /></div>
                    <div style={{ minWidth: 0 }}>
                      <strong>{row.title}</strong>
                      <p className="ds-subtle ds-truncate" style={{ maxWidth: "44ch" }}>{row.tags.length ? row.tags.map((tag) => `#${tag}`).join(" ") : row.summary}</p>
                    </div>
                  </Row>
                ),
                sortValue: (row) => row.title,
              },
              { key: "kind", header: "Type", cell: (row) => <Pill>{String(row.fields.kind ?? "")} · {String(row.fields.format ?? "").toUpperCase()}</Pill>, sortValue: (row) => String(row.fields.kind ?? "") },
              { key: "folder", header: "Folder", hideBelow: 1100, cell: (row) => folders.find((entry) => entry.id === folderOf(row))?.title ?? <span className="ds-subtle">—</span>, sortValue: (row) => folders.find((entry) => entry.id === folderOf(row))?.title ?? "~" },
              { key: "size", header: "Stored", align: "end", hideBelow: 1200, cell: (row) => <span className="ds-num">{formatSize(bytesOf(row)) || "—"}</span>, sortValue: (row) => bytesOf(row) },
              { key: "licence", header: "Licence", cell: (row) => <Pill tone={licenceTone(row, now)}>{licence(row, now).label}</Pill>, sortValue: (row) => String(row.fields.licenceExpiry ?? "~") },
              { key: "links", header: "Linked", align: "end", hideBelow: 1000, cell: (row) => String(linkedIds(row).length), sortValue: (row) => linkedIds(row).length },
              { key: "updated", header: "Changed", align: "end", hideBelow: 1280, cell: (row) => <span className="ds-num">{context.relative(row.updatedAt)}</span>, sortValue: (row) => row.updatedAt },
            ]}
            bulkActions={[
              { label: "Inspect", onRun: (list) => inspect(list[0].id), disabled: (list) => list.length !== 1 },
              { label: "Move or tag", onRun: (list) => context.openOverlay("bulk edit", { ids: list.map((row) => row.id) }) },
              { label: "Check rights", onRun: (list) => context.openOverlay("rights check", { ids: list.map((row) => row.id) }) },
              { label: "Archive", tone: "danger", onRun: (list) => void archive(list), disabled: (list) => list.every((row) => row.status === "archived") },
            ]}
            empty={empty}
          />
        )}
      </div>
    </div>
  );
}

function licenceTone(row: Rec, now: Date): "success" | "warning" | "danger" | "neutral" {
  const state = licence(row, now).state;
  return state === "expired" ? "danger" : state === "expiring" ? "warning" : state === "unknown" ? "neutral" : "success";
}

function AssetTile({
  row, context, now, folders, checked, onToggle, onInspect,
}: { row: Rec; context: ScreenContext; now: Date; folders: Rec[]; checked: boolean; onToggle: () => void; onInspect: () => void }) {
  const state = licence(row, now);
  const folder = folders.find((entry) => entry.id === folderOf(row));
  const links = linkedIds(row).length;
  const size = formatSize(bytesOf(row));
  return (
    <li className="asset-tile" data-selected={checked || context.selectedId === row.id ? "true" : undefined}>
      <label className="asset-tile-check">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${row.title}`} />
      </label>
      <button type="button" className="asset-tile-thumb" onClick={onInspect} aria-label={`Inspect ${row.title}`}>
        <AssetPreview record={row} height={128} fit={["template", "logo", "icon"].includes(String(row.fields.kind)) ? "contain" : "cover"} />
      </button>
      <div className="asset-tile-body">
        <button type="button" className="asset-tile-title" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)} title={row.title}>{row.title}</button>
        <span className="asset-tile-meta">
          {[String(row.fields.kind ?? "asset"), String(row.fields.format ?? "").toUpperCase(), size, folder?.title].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="asset-tile-foot">
        <Pill tone={licenceTone(row, now)}>{state.state === "expired" ? "Licence expired" : state.state === "expiring" ? `Expires in ${state.days}d` : String(row.fields.licence ?? "unrecorded").replace(/_/g, " ")}</Pill>
        {row.status === "pending_review" && <Pill tone="warning">Needs review</Pill>}
        {row.status === "archived" && <Pill>Archived</Pill>}
        {links > 0 && <Pill tone="info">{links} linked</Pill>}
        {fileState(row) === "uploaded" && <Pill tone="success">File here</Pill>}
      </div>
    </li>
  );
}

/* ---------------------------- Folder editor ---------------------------- */

export function FolderEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const folders = useFolders();
  const assets = useCollection("assets");
  const [params, setParams] = useSearchParams();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = folders.find((row) => row.id === payload?.id);
  const [title, setTitle] = useState(record?.title ?? "");
  const [summary, setSummary] = useState(record?.summary ?? "");
  const [seen, setSeen] = useState(record?.id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (record?.id !== seen) { setSeen(record?.id); setTitle(record?.title ?? ""); setSummary(record?.summary ?? ""); }
  const inside = record ? assets.filter((row) => folderOf(row) === record.id) : [];

  async function save() {
    const name = title.trim();
    if (!name) { setError("Give the folder a name."); return; }
    if (folders.some((row) => row.id !== record?.id && row.title.toLowerCase() === name.toLowerCase())) { setError("A folder with that name already exists."); return; }
    setBusy(true);
    try {
      if (record) {
        await context.mutate.patch(record.id, { title: name, summary: summary.trim() }, { event: `Asset folder renamed to ${name}`, expectRevision: record.revision });
        context.toast("Folder saved", `${name} is updated.`);
      } else {
        const created = await context.mutate.create({ collection: FOLDER_COLLECTION, title: name, summary: summary.trim(), status: "active", tags: [], fields: {} }, `Asset folder created: ${name}`);
        const next = new URLSearchParams(params);
        next.set("folder", created.id);
        setParams(next, { replace: true });
        context.toast("Folder created", `${name} is open. Upload into it or move assets in from the library.`);
      }
      close();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!record) return;
    setBusy(true);
    try {
      await Promise.all(inside.map((row) => context.mutate.patch(row.id, { fields: { ...row.fields, folderId: "" } }, { event: `Asset moved out of ${record.title} when the folder was deleted`, expectRevision: row.revision })));
      await context.mutate.remove(record.id, `Asset folder deleted: ${record.title} (${inside.length} assets moved out, none deleted)`);
      const next = new URLSearchParams(params);
      next.delete("folder");
      setParams(next, { replace: true });
      context.toast("Folder deleted", `${inside.length} ${inside.length === 1 ? "asset is" : "assets are"} now not in a folder. No asset was deleted.`);
      close();
    } finally { setBusy(false); }
  }

  return (
    <Stack gap={4}>
      <Field label="Folder name" required error={error || undefined}>
        <TextInput value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} autoFocus />
      </Field>
      <Field label="What belongs here" hint="Optional. Shown at the top of the folder.">
        <TextArea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </Field>
      {record && confirmDelete && (
        <Notice tone="danger" title={`Delete ${record.title}?`}>
          {inside.length
            ? `${inside.length} ${inside.length === 1 ? "asset moves" : "assets move"} to "Not in a folder". The assets themselves are kept.`
            : "The folder is empty. Nothing else changes."}
        </Notice>
      )}
      <Row gap={2} wrap>
        {record && (confirmDelete
          ? <Button variant="danger" busy={busy} onClick={() => void remove()}>Delete the folder</Button>
          : <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete…</Button>)}
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>{record ? "Save folder" : "Create folder"}</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- Bulk edit ---------------------------- */

export function BulkEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const assets = useCollection("assets");
  const folders = useFolders();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const ids = payload?.ids ?? [];
  const records = assets.filter((row) => ids.includes(row.id));
  const [folder, setFolder] = useState("keep");
  const [added, setAdded] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const present = tagCounts(records);
  if (records.length === 0) return <Empty title="Nothing selected" icon={<Images size={20} />}>Select assets in the library first.</Empty>;
  const addList = parseTags(added);
  const changes = folder !== "keep" || addList.length > 0 || removed.length > 0;

  return (
    <Stack gap={4}>
      <p className="ds-subtle">{records.length} {records.length === 1 ? "asset" : "assets"}: {records.slice(0, 4).map((row) => row.title).join(", ")}{records.length > 4 ? `, and ${records.length - 4} more` : ""}.</p>
      <Field label="Folder">
        <Select value={folder} onChange={(event) => setFolder(event.target.value)}>
          <option value="keep">Leave each where it is</option>
          <option value={UNFILED}>Not in a folder</option>
          {folders.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Add tags" hint="Separate with commas. Tags are lower case; spaces become hyphens.">
        <TextInput value={added} onChange={(event) => setAdded(event.target.value)} placeholder="winter-2026, hero" />
      </Field>
      {present.length > 0 && (
        <Field label="Remove tags">
          <div className="asset-tagbar">
            {present.map(({ tag, count }) => (
              <button key={tag} type="button" className="asset-chip" aria-pressed={removed.includes(tag)} onClick={() => setRemoved(removed.includes(tag) ? removed.filter((entry) => entry !== tag) : [...removed, tag])}>
                {removed.includes(tag) ? "Remove " : ""}{tag} <span className="ds-num">{count}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!changes}
          onClick={async () => {
            setBusy(true);
            try {
              const folderTitle = folder === UNFILED ? "no folder" : folders.find((row) => row.id === folder)?.title;
              await Promise.all(records.map((row) => {
                const tags = addTags(row.tags, addList).filter((tag) => !removed.includes(tag));
                const fields = folder === "keep" ? row.fields : { ...row.fields, folderId: folder === UNFILED ? "" : folder };
                const parts = [folder !== "keep" ? `moved to ${folderTitle}` : "", addList.length ? `tagged ${addList.join(", ")}` : "", removed.length ? `untagged ${removed.join(", ")}` : ""].filter(Boolean);
                return context.mutate.patch(row.id, { tags, fields }, { event: `Asset ${parts.join("; ")}: ${row.title}`, expectRevision: row.revision });
              }));
              context.toast("Assets updated", `${records.length} ${records.length === 1 ? "asset" : "assets"} changed. Each change is in the asset's history.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Apply to {records.length}
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- Metadata editor ---------------------------- */

export function AssetEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const assets = useCollection("assets");
  const folders = useFolders();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = assets.find((row) => row.id === (payload?.id ?? context.params.id ?? context.selectedId));
  const [draft, setDraft] = useState<{ id?: string; title: string; summary: string; kind: string; folder: string; tags: string; alt: string; creator: string; status: string }>({ title: "", summary: "", kind: "image", folder: "", tags: "", alt: "", creator: "", status: "pending_review" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (record && draft.id !== record.id) {
    setDraft({
      id: record.id, title: record.title, summary: record.summary, kind: String(record.fields.kind ?? "image"),
      folder: String(record.fields.folderId ?? ""), tags: record.tags.join(", "), alt: String(record.fields.altText ?? ""),
      creator: String(record.fields.photographer ?? ""), status: record.status,
    });
  }
  if (!record) return <Empty title="No asset open" icon={<Images size={20} />}>Open an asset first.</Empty>;
  const update = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const archived = record.status === "archived";
  const approving = draft.status === "approved" && record.status !== "approved";
  const expired = licence(record, context.now).state === "expired";

  return (
    <Stack gap={4}>
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <div style={{ width: 120, flex: "none" }}><AssetPreview record={record} height={80} /></div>
        <Stack gap={1}>
          <FileStateTag record={record} />
          <span className="ds-subtle">Version {String(record.fields.version ?? 1)} · changed {context.relative(record.updatedAt)} by {record.updatedBy}</span>
        </Stack>
      </Row>
      <Field label="Name" required error={error || undefined}>
        <TextInput value={draft.title} onChange={(event) => { update({ title: event.target.value }); setError(""); }} />
      </Field>
      <Field label="Description">
        <TextArea rows={2} value={draft.summary} onChange={(event) => update({ summary: event.target.value })} />
      </Field>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Type">
            <Select value={draft.kind} onChange={(event) => update({ kind: event.target.value })}>
              {[...new Set([draft.kind, ...KIND_OPTIONS])].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Folder">
            <Select value={draft.folder} onChange={(event) => update({ folder: event.target.value })}>
              <option value="">Not in a folder</option>
              {folders.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
        </div>
      </Row>
      <Field label="Tags" hint="Separate with commas. They drive the tag filter in the library.">
        <TextInput value={draft.tags} onChange={(event) => update({ tags: event.target.value })} />
      </Field>
      <Field label="Alternative text" hint="What a screen reader says when this asset is placed in a document or page.">
        <TextInput value={draft.alt} onChange={(event) => update({ alt: event.target.value })} />
      </Field>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Photographer or creator">
            <TextInput value={draft.creator} onChange={(event) => update({ creator: event.target.value })} />
          </Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Review" hint={archived ? "Archived assets are restored from the asset page." : undefined}>
            <Select value={draft.status} disabled={archived} onChange={(event) => update({ status: event.target.value })}>
              {archived && <option value="archived">Archived</option>}
              <option value="pending_review">Needs review</option>
              <option value="approved">Approved for use</option>
            </Select>
          </Field>
        </div>
      </Row>
      {approving && expired && <Notice tone="danger" title="Cannot approve">The licence has expired. Renew it in Rights before approving the asset for use.</Notice>}
      {approving && !expired && <Notice tone="info" title="Approval is recorded">The asset is marked approved by {context.actor}, and the decision is in its history.</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={approving && expired}
          onClick={async () => {
            if (!draft.title.trim()) { setError("An asset needs a name."); return; }
            setBusy(true);
            try {
              const fields = {
                ...record.fields,
                kind: draft.kind, folderId: draft.folder, altText: draft.alt.trim(), photographer: draft.creator.trim(),
                ...(approving ? { approvedBy: context.actor, approvedAt: clockIso() } : {}),
              };
              const saved = await context.mutate.patch(record.id, {
                title: draft.title.trim(), summary: draft.summary.trim(), tags: parseTags(draft.tags), status: draft.status, fields,
              }, { event: `Asset details edited${approving ? " and approved" : ""}: ${draft.title.trim()}`, expectRevision: record.revision });
              if (saved) context.toast("Saved", approving ? `${saved.title} is approved for use.` : `${saved.title} is updated; the earlier version is kept in History.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Save details
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- Inline tags ---------------------------- */

export function TagEditor({ context, record }: { context: ScreenContext; record: Rec }) {
  const [value, setValue] = useState("");
  async function save(tags: string[], message: string) {
    await context.mutate.patch(record.id, { tags }, { event: message, expectRevision: record.revision });
  }
  return (
    <Stack gap={2}>
      <div className="asset-tagbar">
        {record.tags.length === 0 && <span className="ds-subtle">No tags yet.</span>}
        {record.tags.map((tag) => (
          <span key={tag} className="asset-chip" style={{ cursor: "default" }}>
            {tag}
            <button type="button" className="asset-chip-remove" aria-label={`Remove tag ${tag}`} onClick={() => void save(removeTag(record.tags, tag), `Tag removed from ${record.title}: ${tag}`)}><X size={12} /></button>
          </span>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const tags = parseTags(value);
          if (!tags.length) return;
          setValue("");
          void save(addTags(record.tags, tags), `Tagged ${record.title}: ${tags.join(", ")}`);
        }}
      >
        <Row gap={2}>
          <TextInput aria-label="Add a tag" placeholder="Add a tag" value={value} onChange={(event) => setValue(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <Button size="sm" variant="secondary" type="submit" disabled={!parseTags(value).length}>Add</Button>
        </Row>
      </form>
    </Stack>
  );
}

/* ---------------------------- Linked records ---------------------------- */

function useLinkable(): Rec[] {
  const data = useCollections([...LINKABLE_COLLECTIONS]);
  return useMemo(() => LINKABLE_COLLECTIONS.flatMap((name) => data[name] ?? []), [data]);
}

export function LinkedRecords({ context, record, compact }: { context: ScreenContext; record: Rec; compact?: boolean }) {
  const linkable = useLinkable();
  const ids = linkedIds(record);
  const loaded = linkable.length > 0;
  return (
    <Stack gap={3}>
      {ids.length === 0 ? (
        <p className="ds-subtle">Not linked to any project, campaign, product or document yet.</p>
      ) : (
        <div className="asset-linklist">
          {ids.map((id) => {
            const target = linkable.find((row) => row.id === id);
            const route = target ? routeForRecord(target, context.org.slug) : undefined;
            return (
              <div key={id} className="asset-linkrow">
                <Pill>{target ? LINKABLE_LABEL[target.collection] ?? target.collection : "Missing"}</Pill>
                <span className="asset-linktitle">{target ? target.title : loaded ? "Not loaded here yet: open its application once, or unlink it if it was deleted" : "Loading…"}</span>
                {route && <Button size="sm" variant="secondary" onClick={() => context.navigate(route)}>Open</Button>}
                {!compact && (
                  <Button size="sm" variant="ghost" aria-label={`Unlink ${target?.title ?? id}`} onClick={() => void context.mutate.patch(record.id, { fields: { ...record.fields, linkedIds: withoutLink(record, id) } }, { event: `Asset unlinked from ${target?.title ?? id}: ${record.title}`, expectRevision: record.revision })}>
                    Unlink
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Row gap={2}>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("link records", { id: record.id })}><Link2 size={14} /> Link to a record</Button>
      </Row>
    </Stack>
  );
}

export function LinkRecords({ context, close }: { context: ScreenContext; close: () => void }) {
  const assets = useCollection("assets");
  const linkable = useLinkable();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = assets.find((row) => row.id === (payload?.id ?? context.params.id ?? context.selectedId));
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [busyId, setBusyId] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return linkable
      .filter((row) => collection === "all" || row.collection === collection)
      .filter((row) => !needle || `${row.title} ${row.summary}`.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [linkable, query, collection]);
  if (!record) return <Empty title="No asset open" icon={<Images size={20} />}>Open an asset first.</Empty>;
  const ids = linkedIds(record);
  const expired = licence(record, context.now).state === "expired";

  async function toggleLink(target: Rec) {
    if (!record) return;
    setBusyId(target.id);
    try {
      const on = ids.includes(target.id);
      await context.mutate.patch(record.id, { fields: { ...record.fields, linkedIds: on ? withoutLink(record, target.id) : withLink(record, target.id) } }, {
        event: on ? `Asset unlinked from ${target.title}: ${record.title}` : `Asset linked to ${LINKABLE_LABEL[target.collection]?.toLowerCase() ?? "record"} ${target.title}: ${record.title}`,
        expectRevision: record.revision,
      });
    } finally { setBusyId(""); }
  }

  return (
    <Stack gap={4}>
      <p className="ds-subtle">Link {record.title} to the work it belongs to. The link is kept on the asset and opens the record in its own application.</p>
      {expired && <Notice tone="warning" title="This asset's licence has expired">A link records where it belongs; it does not make the asset usable in anything published.</Notice>}
      <Row gap={2} wrap>
        <TextInput type="search" aria-label="Find a record" placeholder="Find a project, campaign, product…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: "1 1 220px", minWidth: 0 }} autoFocus />
        <Select aria-label="Record type" value={collection} onChange={(event) => setCollection(event.target.value)} style={{ width: "auto" }}>
          <option value="all">Every type</option>
          {LINKABLE_COLLECTIONS.map((name) => <option key={name} value={name}>{LINKABLE_LABEL[name]}s</option>)}
        </Select>
      </Row>
      <div className="asset-linklist" style={{ maxHeight: 360, overflow: "auto" }}>
        {matches.length === 0 && <Empty title="No records match" icon={<Link2 size={20} />}>Try another word or record type.</Empty>}
        {matches.map((row) => {
          const on = ids.includes(row.id);
          return (
            <div key={row.id} className="asset-linkrow">
              <Pill tone={on ? "success" : "neutral"}>{LINKABLE_LABEL[row.collection]}</Pill>
              <span className="asset-linktitle" title={row.title}>{row.title}</span>
              <Button size="sm" variant={on ? "ghost" : "secondary"} busy={busyId === row.id} onClick={() => void toggleLink(row)} aria-label={`${on ? "Unlink" : "Link"} ${row.title}`}>
                {on ? "Unlink" : "Link"}
              </Button>
            </div>
          );
        })}
      </div>
      <Row gap={2}>
        <span className="ds-subtle">{ids.length} linked</span>
        <span className="ds-grow" />
        <Button variant="primary" onClick={close}>Done</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- Import ---------------------------- */

interface Queued {
  key: string;
  file: File;
  name: string;
  state: "reading" | "ready" | "error";
  error?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  checksum?: string;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(file);
  });
}

async function checksumOf(file: File): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle) throw new Error("no subtle crypto");
    return `sha256-${hexDigest(await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer()))}`;
  } catch {
    return `local-${file.size}-${file.name}`;
  }
}

function measure(dataUrl: string, mime: string): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const done = (value: { width?: number; height?: number; duration?: number }) => resolve(value);
    const timer = window.setTimeout(() => done({}), 4000);
    if (mime.startsWith("image/")) {
      const image = new window.Image();
      image.onload = () => { window.clearTimeout(timer); done({ width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { window.clearTimeout(timer); done({}); };
      image.src = dataUrl;
      return;
    }
    if (mime.startsWith("video/") || mime.startsWith("audio/")) {
      const media = document.createElement(mime.startsWith("video/") ? "video" : "audio");
      media.preload = "metadata";
      media.onloadedmetadata = () => {
        window.clearTimeout(timer);
        const video = media as HTMLVideoElement;
        done({ width: video.videoWidth || undefined, height: video.videoHeight || undefined, duration: Number.isFinite(media.duration) ? Math.round(media.duration) : undefined });
      };
      media.onerror = () => { window.clearTimeout(timer); done({}); };
      media.src = dataUrl;
      return;
    }
    window.clearTimeout(timer);
    done({});
  });
}

let queueSeq = 0;

export function MediaImport({ context, close }: { context: ScreenContext; close: () => void }) {
  const assets = useCollection("assets");
  const folders = useFolders();
  const payload = context.overlayPayload as { files?: File[]; folderId?: string } | undefined;
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [folder, setFolder] = useState(payload?.folderId ?? "");
  const [tags, setTags] = useState("");
  const [licenceKind, setLicenceKind] = useState("owned");
  const [licensor, setLicensor] = useState(context.org.name);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const took = useRef(false);

  function add(files: File[]) {
    const items: Queued[] = files.map((file) => {
      const error = validateUpload(file);
      queueSeq += 1;
      return { key: `q${queueSeq}`, file, name: titleFromFileName(file.name), state: error ? "error" : "reading", error };
    });
    setQueue((current) => [...current, ...items]);
    for (const item of items) {
      if (item.state === "error") continue;
      void (async () => {
        try {
          const [dataUrl, checksum] = await Promise.all([readDataUrl(item.file), checksumOf(item.file)]);
          const size = await measure(dataUrl, item.file.type);
          setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, state: "ready", dataUrl, checksum, ...size } : entry)));
        } catch {
          setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, state: "error", error: `${item.file.name} could not be read.` } : entry)));
        }
      })();
    }
  }

  useEffect(() => {
    if (took.current || !payload?.files?.length) return;
    took.current = true;
    add(payload.files);
  }, []);

  const ready = queue.filter((item) => item.state === "ready" && item.name.trim());
  const reading = queue.some((item) => item.state === "reading");

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Files are kept in this browser">
        Nothing is sent to a server. Each file is stored with its asset record in this device's storage, up to 8 MB a file. Images,
        video, audio, PDFs and text preview here; other files are kept and can be downloaded again.
      </Notice>
      <div
        className="asset-drop"
        data-over={over ? "true" : undefined}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); add([...event.dataTransfer.files]); }}
      >
        <Stack gap={3}>
          <span className="ds-subtle">Drop files here, or choose them. You can add several at once.</span>
          <Row gap={2} style={{ justifyContent: "center" }}>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose files</Button>
          </Row>
          <input
            ref={fileRef}
            type="file"
            multiple
            aria-label="Files to import"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            onChange={(event) => { if (event.target.files?.length) add([...event.target.files]); event.target.value = ""; }}
          />
        </Stack>
      </div>

      {queue.length > 0 && (
        <div className="asset-queue" role="list" aria-label="Queued files">
          {queue.map((item) => {
            const duplicates = item.checksum ? duplicatesOf(assets, item.checksum) : [];
            const mime = item.file.type;
            return (
              <div key={item.key} className="asset-queue-item" role="listitem">
                <div style={{ width: "100%", height: 52, borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--bg-inset)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.dataUrl && mime.startsWith("image/")
                    ? <img src={item.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span className="ds-subtle">{(extensionOf(item.file.name) || "file").toUpperCase()}</span>}
                </div>
                <Stack gap={1}>
                  <TextInput aria-label={`Name for ${item.file.name}`} value={item.name} disabled={item.state === "error"} onChange={(event) => setQueue((current) => current.map((entry) => (entry.key === item.key ? { ...entry, name: event.target.value } : entry)))} />
                  <span className="ds-subtle ds-truncate">
                    {item.file.name} · {formatSize(item.file.size)} · {kindForFile(mime, item.file.name)}
                    {item.width ? ` · ${item.width} × ${item.height}` : ""}{item.duration ? ` · ${item.duration}s` : ""}
                    {item.state === "reading" ? " · reading…" : ""}
                  </span>
                  {item.error && <span className="ds-field-error" role="alert">{item.error}</span>}
                  {duplicates.length > 0 && <span className="ds-field-hint">Same file already in the library as {duplicates.map((row) => row.title).join(", ")}. It will show under Duplicates.</span>}
                </Stack>
                <Button size="sm" variant="ghost" aria-label={`Remove ${item.file.name}`} onClick={() => setQueue((current) => current.filter((entry) => entry.key !== item.key))}><X size={14} /></Button>
              </div>
            );
          })}
        </div>
      )}

      <Row gap={3} wrap>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Folder">
            <Select value={folder} onChange={(event) => setFolder(event.target.value)}>
              <option value="">Not in a folder</option>
              {folders.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Tags" hint="Applied to every file.">
            <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="winter-2026, product" />
          </Field>
        </div>
      </Row>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Licence">
            <Select value={licenceKind} onChange={(event) => { setLicenceKind(event.target.value); if (event.target.value === "owned" && !licensor) setLicensor(context.org.name); }}>
              {["owned", "licensed", "stock", "royalty_free"].map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Rights holder">
            <TextInput value={licensor} onChange={(event) => setLicensor(event.target.value)} />
          </Field>
        </div>
      </Row>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={ready.length === 0 || reading}
          onClick={async () => {
            setBusy(true);
            try {
              const tagList = parseTags(tags);
              let last: Rec | undefined;
              for (const item of ready) {
                const mime = item.file.type || "application/octet-stream";
                const kind = kindForFile(mime, item.file.name);
                last = await context.mutate.create({
                  collection: "assets",
                  title: item.name.trim(),
                  status: "pending_review",
                  summary: `Imported from ${item.file.name} on ${context.date(context.now)}. Held in this browser; nothing was uploaded to a server.`,
                  tags: addTags(["imported"], tagList),
                  fields: {
                    kind, format: extensionOf(item.file.name) || mime.split("/")[1] || "file", fileState: "uploaded", mime, fileName: item.file.name,
                    bytes: item.file.size, width: item.width ?? 0, height: item.height ?? 0, ...(item.duration ? { durationSeconds: item.duration } : {}),
                    licence: licenceKind, licensor: licensor.trim(), checksum: item.checksum ?? `local-${item.file.size}`,
                    usedIn: "", linkedIds: "", importedBy: context.actor, folderId: folder, version: 1,
                  },
                  body: { dataUrl: item.dataUrl, mime, fileName: item.file.name },
                }, `Asset imported: ${item.name.trim()} (${item.file.name}, ${formatSize(item.file.size)})`);
              }
              context.toast("Imported", `${ready.length} ${ready.length === 1 ? "file is" : "files are"} in the library as needing review, held in this browser.`);
              if (last) context.select(last.id);
              close();
            } finally { setBusy(false); }
          }}
        >
          {ready.length > 1 ? `Add ${ready.length} files to the library` : "Add to the library"}
        </Button>
      </Row>
    </Stack>
  );
}

/** Library status: what the open folder holds, for the inspector-style summary on the detail page. */
export function FolderLine({ record }: { record: Rec }) {
  const folders = useFolders();
  const folder = folders.find((row) => row.id === folderOf(record));
  return <Properties rows={[{ label: "Folder", value: folder?.title ?? "Not in a folder" }, { label: "Linked records", value: String(linkedIds(record).length) }]} />;
}


