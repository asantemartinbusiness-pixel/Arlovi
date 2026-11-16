import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Images, ShieldAlert, Wand2 } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented,
  Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso, clockNow, daysBetween } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { AssetPreview, FileStateTag, assetPreviewUri, fileState, palette, storedBytes } from "./thumbs";

/* ====================================================================== *
 * ASSET panels — the media library: browse, inspect, brand kits,
 * transformations and governance.
 * ====================================================================== */

/* A tiny shared store so the contract "group" action and the toolbar control are one setting. */
export type AssetGrouping = "none" | "kind" | "licence" | "tag";
let grouping: AssetGrouping = "none";
const groupingListeners = new Set<() => void>();
export function setAssetGrouping(next: AssetGrouping): void {
  grouping = next;
  for (const listener of groupingListeners) listener();
}
function useAssetGrouping(): [AssetGrouping, (next: AssetGrouping) => void] {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((value) => value + 1);
    groupingListeners.add(listener);
    return () => { groupingListeners.delete(listener); };
  }, []);
  return [grouping, setAssetGrouping];
}

export const ASSET_COLLECTIONS = ["assets", "brands", "transforms", "campaigns", "products", "documents"];

export function useAssets(): Record<string, Rec[]> {
  return useCollections(ASSET_COLLECTIONS);
}

export function csvList(value: unknown): string[] {
  return typeof value === "string" && value.trim().length > 0
    ? value.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
}

export type LicenceState = "owned" | "ok" | "expiring" | "expired" | "unknown";

export function licence(record: Rec, now: Date): { state: LicenceState; days?: number; label: string } {
  const kind = String(record.fields.licence ?? "");
  const expiry = String(record.fields.licenceExpiry ?? "");
  if (!expiry) {
    if (kind === "owned") return { state: "owned", label: "Owned outright" };
    if (kind === "royalty_free") return { state: "owned", label: "Royalty free" };
    return { state: kind ? "ok" : "unknown", label: kind ? `${kind.replace(/_/g, " ")}, no expiry recorded` : "No licence recorded" };
  }
  const days = daysBetween(now, new Date(expiry));
  if (days < 0) return { state: "expired", days, label: `Expired ${Math.abs(days)} days ago` };
  if (days <= 30) return { state: "expiring", days, label: `Expires in ${days} days` };
  return { state: "ok", days, label: `Licensed until the expiry date` };
}

export function licenceTone(state: LicenceState): "success" | "warning" | "danger" | "neutral" {
  return state === "expired" ? "danger" : state === "expiring" ? "warning" : state === "unknown" ? "neutral" : "success";
}

export function usedIn(record: Rec): string[] {
  return csvList(record.fields.usedIn);
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "Unavailable";
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

export { formatBytes };

/* ---------------------------- ASSET-001 ---------------------------- */

type LibraryTab = "All" | "Mine" | "Approved" | "Brand" | "Archived";

export function AssetLibrary({ context, tab }: { context: ScreenContext; tab: LibraryTab }) {
  const data = useAssets();
  const { now, actor } = useWorkspace();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [group, setGroup] = useAssetGrouping();
  const [query, setQuery] = useState("");

  const base = useMemo(() => {
    const all = data.assets;
    if (tab === "Archived") return all.filter((row) => row.status === "archived");
    const live = all.filter((row) => row.status !== "archived");
    if (tab === "Mine") return live.filter((row) => row.ownerName === actor || String(row.fields.photographer ?? "") === actor);
    if (tab === "Approved") return live.filter((row) => row.status === "approved");
    if (tab === "Brand") return live.filter((row) => row.tags.includes("brand") || Boolean(row.fields.brandId));
    return live;
  }, [data.assets, tab, actor]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((row) => `${row.title} ${row.summary} ${row.tags.join(" ")} ${String(row.fields.kind ?? "")} ${String(row.fields.licensor ?? "")}`.toLowerCase().includes(needle));
  }, [base, query]);

  const groups = useMemo(() => {
    if (group === "none") return [{ label: `${rows.length} assets`, rows }];
    const key = (row: Rec) => (group === "kind" ? String(row.fields.kind ?? "other") : group === "licence" ? String(row.fields.licence ?? "unrecorded") : row.tags[0] ?? "untagged");
    const map = new Map<string, Rec[]>();
    for (const row of rows) {
      const label = key(row);
      const bucket = map.get(label);
      if (bucket) bucket.push(row);
      else map.set(label, [row]);
    }
    return [...map.entries()].map(([label, group_]) => ({ label, rows: group_ })).sort((a, b) => b.rows.length - a.rows.length);
  }, [rows, group]);

  const expired = rows.filter((row) => licence(row, now).state === "expired");

  const toolbar = (
    <Row gap={2} wrap>
      <TextInput aria-label="Search the library" placeholder="Search name, tag, licensor" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: "auto", minWidth: 240, flex: "1 1 240px" }} />
      <Segmented
        label="Layout"
        value={view}
        onChange={setView}
        options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]}
      />
      <Select aria-label="Group by" value={group} onChange={(event) => setGroup(event.target.value as typeof group)} style={{ width: "auto", minWidth: 170 }}>
        <option value="none">No grouping</option>
        <option value="kind">Group by type</option>
        <option value="licence">Group by licence</option>
        <option value="tag">Group by first tag</option>
      </Select>
    </Row>
  );

  return (
    <Stack gap={4}>
      <LibraryStats context={context} />
      {expired.length > 0 && (
        <Notice
          tone="warning"
          title={`${expired.length} ${expired.length === 1 ? "asset has" : "assets have"} an expired licence`}
          actions={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/governance?tab=Rights`)}>Rights report</Button>}
        >
          {expired.map((row) => row.title).join("; ")} may not be used in anything published. Downloads and transformation jobs that
          include them are refused.
        </Notice>
      )}

      {view === "list" ? (
        <Card eyebrow="LIBRARY" prov="posted" title={tab} subtitle={`${rows.length} of ${data.assets.length} assets`} flush>
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Asset library"
            selectedId={context.selectedId}
            onSelect={context.select}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/asset/assets/${id}`)}
            rowTone={(row) => (licence(row, now).state === "expired" ? "danger" : licence(row, now).state === "expiring" ? "warning" : undefined)}
            toolbar={toolbar}
            filterable={false}
            columns={[
              {
                key: "title", header: "Asset", primary: true,
                cell: (row) => (
                  <Row gap={3}>
                    <div style={{ width: 56, flex: "none" }}><AssetPreview record={row} height={38} /></div>
                    <div>
                      <strong>{row.title}</strong>
                      <p className="ds-subtle ds-truncate" style={{ maxWidth: "48ch" }}>{row.summary}</p>
                    </div>
                  </Row>
                ),
                sortValue: (row) => row.title,
              },
              { key: "kind", header: "Type", cell: (row) => <Pill>{String(row.fields.kind ?? "")} · {String(row.fields.format ?? "").toUpperCase()}</Pill>, sortValue: (row) => String(row.fields.kind ?? "") },
              { key: "size", header: "Dimensions", hideBelow: 1100, cell: (row) => (row.fields.width ? `${String(row.fields.width)} × ${String(row.fields.height)}` : "—") },
              { key: "file", header: "File", hideBelow: 1200, cell: (row) => <FileStateTag record={row} /> },
              { key: "licence", header: "Licence", cell: (row) => <Pill tone={licenceTone(licence(row, now).state)}>{licence(row, now).label}</Pill>, sortValue: (row) => String(row.fields.licenceExpiry ?? "~") },
              { key: "uses", header: "Uses", align: "end", cell: (row) => String(usedIn(row).length), sortValue: (row) => usedIn(row).length },
              { key: "updated", header: "Changed", align: "end", hideBelow: 1280, cell: (row) => <span className="ds-num">{context.relative(row.updatedAt)}</span>, sortValue: (row) => row.updatedAt },
            ]}
            bulkActions={[
              { label: "Inspect", onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("asset inspector", { id: selected[0]?.id }); }, disabled: (selected) => selected.length !== 1 },
              { label: "Check rights", onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("rights check", { ids: selected.map((row) => row.id) }); } },
              {
                label: "Archive",
                tone: "danger",
                onRun: (selected) => {
                  void Promise.all(selected.filter((row) => row.status !== "archived").map((row) => context.mutate.patch(row.id, { status: "archived", fields: { ...row.fields, archivedBy: context.actor, archivedAt: clockIso() } }, { event: `Asset archived: ${row.title}` })))
                    .then(() => context.toast("Archived", "Archived assets stay resolvable so older documents still find them."));
                },
                disabled: (selected) => selected.every((row) => row.status === "archived"),
              },
            ]}
            empty={<Empty title="Nothing here" icon={<Images size={20} />}>Upload an image or clear the search.</Empty>}
          />
        </Card>
      ) : (
        <Stack gap={4}>
          <Card eyebrow="LIBRARY" prov="posted" title={tab} subtitle={`${rows.length} of ${data.assets.length} assets`}>{toolbar}</Card>
          {groups.map((bucket) => (
            <Stack key={bucket.label} gap={3}>
              {group !== "none" && <h3 style={{ textTransform: "capitalize" }}>{bucket.label.replace(/_/g, " ")} · {bucket.rows.length}</h3>}
              <Grid>
                {bucket.rows.map((row) => {
                  const state = licence(row, now);
                  return (
                    <Card
                      key={row.id}
                      eyebrow={`${String(row.fields.kind ?? "asset")}`.toUpperCase()}
                      prov={fileState(row) === "metadata_only" ? "unknown" : row.fields.proposedBy ? "agent" : "human"}
                      span={3}
                      className={context.selectedId === row.id ? "ds-panel" : undefined}
                      title={
                        <button
                          type="button"
                          onClick={() => { context.select(row.id); context.openOverlay("asset inspector", { id: row.id }); }}
                          style={{ all: "unset", cursor: "pointer", fontWeight: 650, fontSize: "var(--text-md)" }}
                        >
                          {row.title}
                        </button>
                      }
                      subtitle={[String(row.fields.kind ?? "asset"), String(row.fields.format ?? "").toUpperCase()].filter(Boolean).join(" · ")}
                    >
                      <Stack gap={3}>
                        <AssetPreview record={row} height={132} fit={String(row.fields.kind) === "template" ? "contain" : "cover"} />
                        <Row gap={1} wrap>
                          <Pill tone={licenceTone(state.state)}>{state.state === "expired" ? "Licence expired" : state.state === "expiring" ? `Expires in ${state.days}d` : String(row.fields.licence ?? "unrecorded").replace(/_/g, " ")}</Pill>
                          {row.status === "pending_review" && <Pill tone="warning">Needs review</Pill>}
                          {row.status === "archived" && <Pill>Archived</Pill>}
                          {usedIn(row).length > 0 && <Pill tone="info">{usedIn(row).length} uses</Pill>}
                        </Row>
                        <FileStateTag record={row} />
                        <Row gap={2}>
                          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)}>Open</Button>
                          <Button size="sm" variant="ghost" onClick={() => { context.select(row.id); context.openOverlay("asset inspector", { id: row.id }); }}>Inspect</Button>
                        </Row>
                      </Stack>
                    </Card>
                  );
                })}
              </Grid>
              {bucket.rows.length === 0 && <Empty title="Nothing in this group" icon={<Images size={20} />}>Try another grouping.</Empty>}
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function LibraryStats({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const live = data.assets.filter((row) => row.status !== "archived");
  const stored = live.reduce((sum, row) => sum + (storedBytes(row) ?? 0), 0);
  const noFile = live.filter((row) => fileState(row) === "metadata_only").length;
  return (
    <StatRow>
      <Stat prov="posted" label="Assets" value={String(live.length)} meta={`${data.assets.length - live.length} archived`} />
      <Stat prov="posted" label="Licences expiring" value={String(live.filter((row) => ["expiring", "expired"].includes(licence(row, now).state)).length)} meta="Within 30 days or already past" onClick={() => context.navigate(`/o/${context.org.slug}/asset/governance`)} />
      <Stat prov="posted" label="Bytes actually stored" value={formatBytes(stored)} meta={`${noFile} catalogued without a file`} />
      <Stat prov="human" label="Brand kits" value={String(data.brands.length)} meta={`${data.brands.filter((row) => row.fields.master === true).length} master`} onClick={() => context.navigate(`/o/${context.org.slug}/asset/brands`)} />
    </StatRow>
  );
}

/** One compact line for the status strip: how to read what the library shows. */
export function LibraryStripLine({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const latest = [...data.assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <>
      <span>Previews are drawn in this browser from each record</span>
      <span>nothing is uploaded anywhere</span>
      <span>library last changed <strong className="ds-num">{latest ? context.relative(latest.updatedAt) : "never"}</strong></span>
      <span className="ds-grow" />
      <span>An expired licence blocks publishing, not browsing</span>
    </>
  );
}

export function MediaImport({ context, close }: { context: ScreenContext; close: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [format, setFormat] = useState("png");
  const [bytes, setBytes] = useState(0);
  const [licenceKind, setLicenceKind] = useState("owned");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function read(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Only images can be previewed in this browser. Anything else can be catalogued as metadata only.");
      return;
    }
    if (file.size > 400_000) {
      setError(`That file is ${formatBytes(file.size)}. Keep uploads under 400 kB: everything is held in this browser's storage.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setDataUrl(result);
      setBytes(file.size);
      setFormat(file.type.replace("image/", ""));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      const image = new window.Image();
      image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      image.src = result;
    };
    reader.onerror = () => setError("That file could not be read.");
    reader.readAsDataURL(file);
  }

  return (
    <Stack gap={4}>
      <Notice tone="info" title="The file is kept in this browser">
        Nothing is uploaded anywhere. The image is stored with the asset record in this device's storage, which is also why there is a
        size limit.
      </Notice>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) read(file);
        }}
        className="ds-panel"
        style={{ padding: "var(--space-5)", textAlign: "center", borderStyle: "dashed" }}
      >
        <Stack gap={3}>
          <span className="ds-subtle">Drop an image here, or choose one. Both routes do the same thing.</span>
          <Row gap={2} style={{ justifyContent: "center" }}>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>Choose a file</Button>
          </Row>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Image to import"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) read(file);
            }}
          />
        </Stack>
      </div>
      {error && <Notice tone="warning" title="Not imported">{error}</Notice>}
      {dataUrl && (
        <Row gap={3} style={{ alignItems: "flex-start" }}>
          <img src={dataUrl} alt="The image you chose" style={{ width: 160, height: 110, objectFit: "cover", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }} />
          <Properties rows={[
            { label: "Size", value: formatBytes(bytes) },
            { label: "Dimensions", value: dimensions ? `${dimensions.width} × ${dimensions.height}` : "Reading…" },
            { label: "Format", value: format.toUpperCase() },
          ]} />
        </Row>
      )}
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Licence">
        <Select value={licenceKind} onChange={(event) => setLicenceKind(event.target.value)}>
          {["owned", "licensed", "stock", "royalty_free"].map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!dataUrl || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const record = await context.mutate.create({
                collection: "assets",
                title: name,
                status: "pending_review",
                summary: `Imported in this browser on ${context.date(clockNow())}. Held locally; nothing was uploaded.`,
                tags: ["imported"],
                fields: {
                  kind: "image", format, fileState: "uploaded",
                  width: dimensions?.width ?? 0, height: dimensions?.height ?? 0,
                  licence: licenceKind, licensor: context.org.name, checksum: `local-${bytes}-${name.length}`,
                  usedIn: "", importedBy: context.actor,
                },
                body: { dataUrl },
              }, `Asset imported: ${name}`);
              context.toast("Imported", `${name} is in the library as needing review, with the file held in this browser.`);
              context.select(record.id);
              close();
            } finally { setBusy(false); }
          }}
        >
          Add to the library
        </Button>
      </Row>
    </Stack>
  );
}

export function AssetInspector({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = data.assets.find((row) => row.id === (payload?.id ?? context.selectedId));
  if (!record) return <Empty title="Select an asset" icon={<Image size={20} />}>Choose an asset to see its metadata and where it is used.</Empty>;
  const state = licence(record, now);
  const uses = usedIn(record);

  return (
    <Stack gap={4}>
      <AssetPreview record={record} height={200} fit={String(record.fields.kind) === "template" ? "contain" : "cover"} />
      <div>
        <h3 style={{ marginBlockEnd: 4 }}>{record.title}</h3>
        <p>{record.summary}</p>
      </div>
      <FileStateTag record={record} />
      <Properties rows={[
        { label: "Type", value: `${String(record.fields.kind ?? "")} · ${String(record.fields.format ?? "").toUpperCase()}` },
        { label: "Dimensions", value: record.fields.width ? `${String(record.fields.width)} × ${String(record.fields.height)}` : "Not recorded" },
        { label: "Stored bytes", value: formatBytes(storedBytes(record)) },
        { label: "Licence", value: <Pill tone={licenceTone(state.state)}>{state.label}</Pill> },
        { label: "Licensor", value: String(record.fields.licensor ?? "Not recorded") },
        { label: "Approved by", value: String(record.fields.approvedBy ?? "Not approved") },
        { label: "Version", value: String(record.fields.version ?? 1) },
        { label: "Used in", value: uses.length ? uses.join(", ") : "Nothing yet" },
        { label: "Tags", value: record.tags.join(", ") || "None" },
      ]} />
      <Row gap={2} wrap>
        <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${record.id}`)}>Open the asset</Button>
        <Button variant="secondary" onClick={() => context.openOverlay("rights check", { ids: [record.id] })}>Check rights</Button>
      </Row>
    </Stack>
  );
}

export function RightsCheck({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const ids = payload?.ids ?? (context.selectedId ? [context.selectedId] : []);
  const records = data.assets.filter((row) => ids.includes(row.id));
  if (records.length === 0) return <Empty title="Nothing selected" icon={<ShieldAlert size={20} />}>Select one or more assets to check.</Empty>;

  return (
    <Stack gap={4}>
      {records.map((record) => {
        const state = licence(record, now);
        return (
          <Card key={record.id} eyebrow="RIGHTS" prov="human" title={record.title} subtitle={String(record.fields.licensor ?? "")}>
            <Stack gap={3}>
              <Row gap={2} wrap>
                <Pill tone={licenceTone(state.state)}>{state.label}</Pill>
                {record.fields.licenceRef ? <Pill>{String(record.fields.licenceRef)}</Pill> : null}
              </Row>
              <Properties rows={[
                { label: "Licence", value: String(record.fields.licence ?? "Not recorded").replace(/_/g, " ") },
                { label: "Expiry", value: record.fields.licenceExpiry ? context.date(String(record.fields.licenceExpiry)) : "None" },
                { label: "Seats", value: record.fields.seats ? String(record.fields.seats) : "Not applicable" },
                { label: "Currently used in", value: usedIn(record).join(", ") || "Nothing" },
              ]} />
              {state.state === "expired" ? (
                <Notice tone="danger" title="Cannot be used in anything published">
                  The licence lapsed. Publishing, downloading for press and transformation jobs that include it are refused until the
                  licence is renewed or the asset is replaced.
                </Notice>
              ) : state.state === "expiring" ? (
                <Notice tone="warning" title={`${state.days} days left`}>
                  {usedIn(record).length} live {usedIn(record).length === 1 ? "use" : "uses"} would be affected. Renew the licence or
                  plan a replacement now.
                </Notice>
              ) : (
                <Notice tone="success" title="Clear to use">Nothing in the record restricts use in this workspace.</Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

/* ---------------------------- ASSET-002 ---------------------------- */

type DetailTab = "Overview" | "Variants" | "Usage" | "Rights" | "History";

export function AssetDetail({ context, tab }: { context: ScreenContext; tab: DetailTab }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const id = context.params.id ?? context.selectedId;
  const record = useRecord(id);

  if (!id || !record) {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="No asset is open">Choose one from the library to see its detail.</Notice>
        <Grid>
          {data.assets.slice(0, 8).map((row) => (
            <Card key={row.id} eyebrow="ASSET" prov="human" span={3} title={row.title} subtitle={String(row.fields.kind ?? "")}>
              <Stack gap={3}>
                <AssetPreview record={row} height={110} />
                <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)}>Open</Button>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  const variants = data.assets.filter((row) => row.parentId === record.id || String(row.fields.variantOf ?? "") === record.id);
  const parent = record.parentId ? data.assets.find((row) => row.id === record.parentId) : undefined;
  const state = licence(record, now);
  const uses = usedIn(record);

  if (tab === "Overview") {
    return (
      <Grid>
        <Card eyebrow="PREVIEW" prov={fileState(record) === "metadata_only" ? "unknown" : "human"} span={7} title="Preview" subtitle={`${String(record.fields.width ?? "?")} × ${String(record.fields.height ?? "?")} · ${String(record.fields.format ?? "").toUpperCase()}`}>
          <Stack gap={3}>
            <AssetPreview record={record} height={340} fit={String(record.fields.kind) === "template" ? "contain" : "cover"} />
            <FileStateTag record={record} />
            {fileState(record) === "generated_preview" && (
              <Notice tone="info" title="This preview is drawn here">
                No binary file for this asset exists in this browser. The picture above is rendered from the record's palette, shape and
                aspect ratio so the library is still browsable, and the metadata is what is real.
              </Notice>
            )}
            {fileState(record) === "metadata_only" && (
              <Notice tone="warning" title="Nothing is stored for this asset">
                It is catalogued so other records can reference it, but there is no file and no preview. Downloads are refused.
              </Notice>
            )}
          </Stack>
        </Card>
        <Stack gap={4} className="ds-col-5">
          <Card eyebrow="METADATA" prov="posted" span={5} title="Metadata">
            <Properties rows={[
              { label: "Type", value: String(record.fields.kind ?? "") },
              { label: "Format", value: String(record.fields.format ?? "").toUpperCase() },
              { label: "Stored bytes", value: formatBytes(storedBytes(record)) },
              { label: "Checksum", value: String(record.fields.checksum ?? "Not computed") },
              { label: "Owner", value: record.ownerName },
              { label: "Photographer", value: String(record.fields.photographer ?? "Not recorded") },
              { label: "Status", value: <Pill tone={record.status === "approved" ? "success" : record.status === "archived" ? "neutral" : "warning"}>{record.status.replace(/_/g, " ")}</Pill> },
              { label: "Version", value: String(record.fields.version ?? 1) },
              { label: "Last changed", value: `${context.relative(record.updatedAt)} by ${record.updatedBy}` },
            ]} />
          </Card>
          <Card eyebrow="PALETTE" prov="posted" span={5} title="Palette in the record">
            <Row gap={2} wrap>
              {palette(record).map((colour) => (
                <Row key={colour} gap={1}>
                  <i className="ds-swatch" style={{ background: colour, width: 18, height: 18, border: "1px solid var(--border-default)" }} aria-hidden="true" />
                  <span className="ds-subtle">{colour}</span>
                </Row>
              ))}
            </Row>
          </Card>
          {parent && (
            <Card eyebrow="LINEAGE" prov="posted" span={5} title="Derived from">
              <Row gap={2}>
                <span className="ds-grow">{parent.title}</span>
                <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${parent.id}`)}>Open</Button>
              </Row>
            </Card>
          )}
        </Stack>
      </Grid>
    );
  }

  if (tab === "Variants") {
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Button variant="primary" onClick={() => context.openOverlay("Variant editor", { id: record.id })}>Create a variant</Button>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/transforms`)}>Transformation presets</Button>
        </Row>
        {variants.length === 0 ? (
          <Empty title="No variants yet" icon={<Wand2 size={20} />}>A variant records its size, crop and the preset that produced it, and keeps a link to this original.</Empty>
        ) : (
          <Grid>
            {variants.map((variant) => (
              <Card key={variant.id} eyebrow="VARIANT" prov="human" span={4} title={variant.title} subtitle={`${String(variant.fields.width)} × ${String(variant.fields.height)} · ${String(variant.fields.crop ?? "")}`}>
                <Stack gap={3}>
                  <AssetPreview record={variant} height={120} />
                  <Properties rows={[
                    { label: "Preset", value: data.transforms.find((row) => row.id === variant.fields.presetId)?.title ?? "Made by hand" },
                    { label: "Used in", value: usedIn(variant).join(", ") || "Nothing" },
                  ]} />
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${variant.id}`)}>Open</Button>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    );
  }

  if (tab === "Usage") {
    const campaigns = data.campaigns.filter((row) => uses.some((use) => row.title.toLowerCase().includes(use.toLowerCase().split(",")[0])));
    return (
      <Grid>
        <Card eyebrow="USAGE" prov="posted" span={7} title="Where this asset is used" subtitle={`${uses.length} recorded ${uses.length === 1 ? "use" : "uses"}`}>
          {uses.length === 0 ? (
            <Empty title="Not used anywhere yet" icon={<Images size={20} />}>Uses are recorded on the asset when a surface references it.</Empty>
          ) : (
            <Stack gap={2}>
              {uses.map((use) => (
                <Row key={use} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <span className="ds-grow">{use}</span>
                  <Pill tone="info">Recorded use</Pill>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Stack gap={4} className="ds-col-5">
          <Card eyebrow="REPLACEMENT" prov="human" span={5} title="Replacing this asset">
            <Stack gap={3}>
              <p className="ds-subtle">Replacing a shared asset changes every surface above at once.</p>
              <Button variant="secondary" onClick={() => context.openOverlay("replacement impact", { id: record.id })}>Preview a replacement</Button>
            </Stack>
          </Card>
          {campaigns.length > 0 && (
            <Card eyebrow="CAMPAIGNS" prov="posted" span={5} title="Matching campaigns">
              <Stack gap={2}>
                {campaigns.map((campaign) => <Row key={campaign.id} gap={2}><span className="ds-grow ds-truncate">{campaign.title}</span><Pill>{campaign.status}</Pill></Row>)}
              </Stack>
            </Card>
          )}
        </Stack>
      </Grid>
    );
  }

  if (tab === "Rights") {
    return (
      <Grid>
        <Card eyebrow="LICENCE" prov="human" span={7} title="Licence" subtitle={state.label}>
          <Stack gap={3}>
            <Properties rows={[
              { label: "Licence", value: String(record.fields.licence ?? "Not recorded").replace(/_/g, " ") },
              { label: "Licensor", value: String(record.fields.licensor ?? "Not recorded") },
              { label: "Reference", value: String(record.fields.licenceRef ?? "None") },
              { label: "Expiry", value: record.fields.licenceExpiry ? `${context.date(String(record.fields.licenceExpiry))} (${context.relative(String(record.fields.licenceExpiry))})` : "None" },
              { label: "Seats", value: record.fields.seats ? String(record.fields.seats) : "Not applicable" },
              { label: "Retention", value: record.fields.retentionUntil ? `${context.date(String(record.fields.retentionUntil))} — ${String(record.fields.retentionBasis ?? "")}` : "No retention rule recorded" },
            ]} />
            <Button variant="primary" onClick={() => context.openOverlay("rights form", { id: record.id })}>Update the rights</Button>
          </Stack>
        </Card>
        <Card eyebrow="PERMITTED USE" prov="human" span={5} title="What the licence allows here">
          <Stack gap={3}>
            {state.state === "expired" ? (
              <Notice tone="danger" title="Publishing is blocked">The licence has lapsed, so this asset cannot go into anything published, exported for press, or used in a transformation job.</Notice>
            ) : state.state === "expiring" ? (
              <Notice tone="warning" title={`${state.days} days left`}>Plan a renewal or a replacement; {uses.length} live {uses.length === 1 ? "use" : "uses"} depend on it.</Notice>
            ) : (
              <Notice tone="success" title="No restriction recorded">Use it anywhere in this workspace.</Notice>
            )}
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Card eyebrow="VERSIONS" prov="posted" title="Versions" subtitle={`${record.history.length} earlier ${record.history.length === 1 ? "version" : "versions"} kept with this record`} flush>
      {record.history.length === 0 ? (
        <Empty title="No earlier versions" icon={<Images size={20} />}>
          This asset has not been changed since it was created on {context.date(record.createdAt)}.
        </Empty>
      ) : (
        <DataGrid
          rows={record.history.map((snapshot, index) => ({ ...snapshot, id: `${record.id}-v${record.history.length - index}` }))}
          rowId={(row) => row.id}
          label="Asset versions"
          filterable={false}
          columns={[
            { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "title", header: "Title then", primary: true, cell: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
            { key: "summary", header: "Summary", hideBelow: 1100, cell: (row) => row.summary },
          ]}
        />
      )}
    </Card>
  );
}

export function VariantEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const source = data.assets.find((row) => row.id === (payload?.id ?? context.params.id ?? context.selectedId));
  const presets = data.transforms.filter((row) => row.fields.kind === "preset" && row.status === "published");
  const [presetId, setPresetId] = useSeeded(presets[0]?.id ?? "");
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(630);
  const [crop, setCrop] = useState("centre");
  const [busy, setBusy] = useState(false);

  if (!source) return <Empty title="No source asset" icon={<Wand2 size={20} />}>Open an asset first.</Empty>;
  const state = licence(source, now);
  const preset = presets.find((row) => row.id === presetId);
  const blocked = state.state === "expired";

  return (
    <Stack gap={4}>
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <div style={{ width: 180, flex: "none" }}><AssetPreview record={source} height={120} /></div>
        <Properties rows={[
          { label: "Source", value: source.title },
          { label: "Original", value: `${String(source.fields.width)} × ${String(source.fields.height)}` },
          { label: "Licence", value: <Pill tone={licenceTone(state.state)}>{state.label}</Pill> },
        ]} />
      </Row>
      {blocked && (
        <Notice tone="danger" title="This source cannot be transformed">
          Its licence has expired, so a new variant would inherit a right nobody holds.
        </Notice>
      )}
      <Field label="Preset" hint="Choosing a preset fills the size and crop; you can still change them.">
        <Select
          value={presetId}
          onChange={(event) => {
            setPresetId(event.target.value);
            const chosen = presets.find((row) => row.id === event.target.value);
            if (chosen) {
              setWidth(Number(chosen.fields.width ?? width));
              setHeight(Number(chosen.fields.height ?? height));
              setCrop(String(chosen.fields.focus ?? crop));
            }
          }}
        >
          <option value="">By hand</option>
          {presets.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Width"><TextInput type="number" min={16} value={String(width)} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
        <Field label="Height"><TextInput type="number" min={16} value={String(height)} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
        <Field label="Focus">
          <Select value={crop} onChange={(event) => setCrop(event.target.value)}>
            {["centre", "top", "bottom", "left", "right"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </Select>
        </Field>
      </Row>
      <Notice tone="info" title="What a variant is here">
        The variant is a child record with its own size, crop and preset, and a link back to this original. Its preview is drawn from
        the same palette and shape, so nothing claims to be a re-encoded file that does not exist.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={blocked || width < 16 || height < 16}
          onClick={async () => {
            setBusy(true);
            try {
              const variant = await context.mutate.create({
                collection: "assets",
                title: `${source.title} — ${width}×${height}`,
                status: source.status === "approved" ? "approved" : "pending_review",
                summary: `Variant of ${source.title} at ${width} × ${height}, ${crop} focus.`,
                parentId: source.id,
                tags: ["variant"],
                fields: {
                  ...source.fields,
                  width, height, crop: `${crop}, ${(width / height).toFixed(2)}:1`,
                  variantOf: source.id, presetId, version: 1,
                  format: preset ? String(preset.fields.format ?? "png") : "png",
                  fileState: fileState(source) === "metadata_only" ? "metadata_only" : "generated_preview",
                  usedIn: "",
                },
              }, `Variant created from ${source.title} at ${width}×${height}`);
              context.toast("Variant created", `${variant.title} is linked to the original and inherits its licence.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Create the variant
        </Button>
      </Row>
    </Stack>
  );
}

export function RightsForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = data.assets.find((row) => row.id === (payload?.id ?? context.params.id ?? context.selectedId));
  const [kind, setKind] = useSeeded(String(record?.fields.licence ?? "owned"));
  const [licensor, setLicensor] = useSeeded(String(record?.fields.licensor ?? ""));
  const [reference, setReference] = useSeeded(String(record?.fields.licenceRef ?? ""));
  const [expiry, setExpiry] = useSeeded(String(record?.fields.licenceExpiry ?? "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <Empty title="No asset" />;

  return (
    <Stack gap={4}>
      <Field label="Licence">
        <Select value={kind} onChange={(event) => setKind(event.target.value)}>
          {["owned", "licensed", "stock", "royalty_free"].map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <Field label="Licensor" required error={error && !licensor.trim() ? error : undefined}>
        <TextInput value={licensor} onChange={(event) => setLicensor(event.target.value)} required />
      </Field>
      <Field label="Reference" hint="The agreement or order number, so the right can be proved later.">
        <TextInput value={reference} onChange={(event) => setReference(event.target.value)} />
      </Field>
      <Field label="Expiry" hint={kind === "owned" ? "An owned asset normally has no expiry." : "Leave empty if the licence does not expire."}>
        <TextInput type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            if (!licensor.trim()) { setError("Name whoever holds the right, even if it is this company."); return; }
            setBusy(true);
            try {
              await context.mutate.patch(record.id, {
                fields: {
                  ...record.fields,
                  licence: kind, licensor, licenceRef: reference,
                  licenceExpiry: expiry ? new Date(`${expiry}T00:00:00.000Z`).toISOString() : "",
                },
              }, { event: `Rights updated on ${record.title}: ${kind}, ${licensor}${expiry ? `, expires ${expiry}` : ""}`, expectRevision: record.revision });
              context.toast("Rights updated", "The asset record carries the licence, and the change is in its history.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Save the rights
        </Button>
      </Row>
    </Stack>
  );
}

export function ReplacementImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = data.assets.find((row) => row.id === (payload?.id ?? context.params.id ?? context.selectedId));
  const [withId, setWithId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="No asset" />;
  const uses = usedIn(record);
  const candidates = data.assets.filter((row) => row.id !== record.id && row.status !== "archived" && String(row.fields.kind) === String(record.fields.kind));
  const replacement = candidates.find((row) => row.id === withId);

  return (
    <Stack gap={4}>
      <Notice tone="warning" title={`${uses.length} live ${uses.length === 1 ? "use" : "uses"} would change at once`}>
        {uses.length ? uses.join("; ") : "Nothing references this asset yet."}
      </Notice>
      <Field label="Replace with">
        <Select value={withId} onChange={(event) => setWithId(event.target.value)}>
          <option value="">Choose an asset of the same type</option>
          {candidates.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {replacement && (
        <Grid>
          <Card eyebrow="NOW" prov="human" span={6} title="Now" subtitle={record.title}><AssetPreview record={record} height={140} /></Card>
          <Card eyebrow="AFTER" prov="human" span={6} title="After" subtitle={replacement.title}><AssetPreview record={replacement} height={140} /></Card>
        </Grid>
      )}
      <Notice tone="info" title="The original is kept, not overwritten">
        Replacing marks this asset superseded and points it at the replacement. Earlier documents keep resolving, and nothing is
        destroyed.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!replacement}
          onClick={async () => {
            if (!replacement) return;
            setBusy(true);
            try {
              await context.mutate.patch(record.id, {
                status: "archived",
                fields: { ...record.fields, supersededBy: replacement.id, archivedBy: context.actor, archivedAt: clockIso() },
              }, { event: `Asset superseded by ${replacement.title}`, expectRevision: record.revision });
              await context.mutate.patch(replacement.id, {
                fields: { ...replacement.fields, usedIn: [...new Set([...usedIn(replacement), ...uses])].join(", "), replaces: record.id },
              }, { event: `Asset now carries the uses of ${record.title}` });
              context.toast("Replaced", `${uses.length} ${uses.length === 1 ? "use" : "uses"} moved to ${replacement.title}. The original is archived, not deleted.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Replace across {uses.length} {uses.length === 1 ? "use" : "uses"}
        </Button>
      </Row>
    </Stack>
  );
}

export function downloadAsset(context: ScreenContext, record: Rec | undefined, now: Date) {
  if (!record) {
    context.toast("Nothing selected", "Open an asset first.", "info");
    return;
  }
  const state = licence(record, now);
  if (state.state === "expired") {
    context.toast("Download refused", `${record.title} has an expired licence, so it may not be taken out of the workspace.`, "blocked");
    void context.mutate.log(`Download refused for ${record.title}: licence expired.`, { entityId: record.id, type: "asset.download_blocked", capability: "blocked" });
    return;
  }
  const uri = assetPreviewUri(record);
  if (!uri) {
    context.toast("Nothing to download", `${record.title} is catalogued as metadata only: there is no file in this browser.`, "blocked");
    return;
  }
  const link = document.createElement("a");
  link.href = uri;
  link.download = `${record.title.replace(/\W+/g, "-").toLowerCase()}.${fileState(record) === "uploaded" ? String(record.fields.format ?? "png") : "svg"}`;
  link.click();
  void context.mutate.log(`Asset downloaded: ${record.title}.`, { entityId: record.id, type: "asset.download", capability: "ready_local" });
  context.toast("Downloaded", fileState(record) === "uploaded" ? "The file you imported was written back out." : "The stored or drawn SVG was written to a file.");
}

/* ------------------------------------------------------------------ *
 * Local primitive: state seeded from a record that loads asynchronously.
 * Asset overlays mount a render before their record arrives, so a plain
 * useState would capture an empty value and show a blank form.
 * ------------------------------------------------------------------ */
export function useSeeded<T extends string | number | boolean>(seed: T): [T, (next: T) => void] {
  const [value, setValue] = useState(seed);
  const [seen, setSeen] = useState(seed);
  if (seed !== seen) {
    setSeen(seed);
    setValue(seed);
  }
  return [value, setValue];
}

/** The contract "group" action: sets the library grouping the toolbar control also shows. */
export function GroupAssets({ close }: { close: () => void }) {
  const [group, setGroup] = useAssetGrouping();
  const [choice, setChoice] = useState<AssetGrouping>(group);
  return (
    <Stack gap={4}>
      <Field label="Group by">
        <Select aria-label="Group the library by" value={choice} onChange={(event) => setChoice(event.target.value as AssetGrouping)}>
          <option value="none">No grouping</option>
          <option value="kind">Type</option>
          <option value="licence">Licence</option>
          <option value="tag">First tag</option>
        </Select>
      </Field>
      <Row gap={2}>
        <Button variant="primary" onClick={() => { setGroup(choice); close(); }}>Apply</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Archives an asset on its own. Live uses are named first; a retention rule still applies to the archived record. */
export function ArchiveAsset({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const record = data.assets.find((row) => row.id === (context.params.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="No asset" />;
  const uses = usedIn(record);
  const archived = record.status === "archived";
  const brandMaster = data.brands.some((brand) => brand.fields.master === true && csvList(brand.fields.assetIds).includes(record.id));
  const blocked = archived ? "This asset is already archived." : brandMaster ? "It belongs to the master brand kit. Replace it there first." : undefined;
  return (
    <Stack gap={4}>
      <Notice tone={uses.length ? "warning" : "info"} title={uses.length ? `${uses.length} live ${uses.length === 1 ? "use keeps" : "uses keep"} pointing at it` : "Nothing uses this asset"}>
        {uses.length ? `${uses.join("; ")}. They keep resolving to the archived file; use Replace to move them to another asset.` : "Archiving removes it from the working library. Nothing is deleted."}
      </Notice>
      {record.fields.retentionBasis && <Notice tone="info" title="Retention still applies">{String(record.fields.retentionBasis)}: kept until {context.date(String(record.fields.retentionUntil ?? ""))}. Archiving does not shorten it.</Notice>}
      {blocked && <Notice tone="danger" title="Cannot archive">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={Boolean(blocked)}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(record.id, { status: "archived", fields: { ...record.fields, archivedBy: context.actor, archivedAt: clockIso(), statusBeforeArchive: record.status } }, { expectRevision: record.revision, event: `Asset archived by ${context.actor}: ${record.title}` });
            if (saved) context.toast("Archived", `${record.title} is archived. ${uses.length} use${uses.length === 1 ? "" : "s"} still resolve to it.`);
            setBusy(false);
            close();
          }}
        >
          Archive {record.title}
        </Button>
        <Button variant="secondary" onClick={() => context.openOverlay("replacement impact", { id: record.id })}>Replace it instead</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}
