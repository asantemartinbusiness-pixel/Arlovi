import { AlertTriangle, Images, Palette, ScrollText, Wand2 } from "lucide-react";
import { Button, Empty, Notice, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { getRecord } from "@/platform/repo";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { AssetPreview, FileStateTag } from "./thumbs";
import {
  ArchiveAsset, AssetDetail, AssetInspector, AssetLibrary, GroupAssets, LibraryStripLine, MediaImport, ReplacementImpact,
  RightsCheck, RightsForm, VariantEditor, downloadAsset, licence, licenceTone, useAssets,
} from "./panels";
import {
  BrandKits, BrandSelection, CompareSources, ExpiryWarning, GlobalImpact, GovernanceExport, GovernanceScreen,
  MergePreview, OverwriteReview, TokenEditor, TransformInspector, TransformRights,
  Transformations, UsageInspector,
} from "./governance";

/* ====================================================================== *
 * ASSET — Assets, Media Library & Brand Resources
 *
 * A media library: browse with real previews, inspect an asset's metadata and
 * usage, keep brand kits, define transformations, and govern rights, duplicates
 * and storage. Nothing here claims a file that is not in this browser.
 * ====================================================================== */

function AssetHeader({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const { now } = useWorkspace();
  if (!record) return null;
  const state = licence(record, now);
  return (
    <Row gap={4} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "center" }}>
      <div style={{ width: 128, flex: "none" }}>
        <AssetPreview record={record} height={84} fit={String(record.fields.kind) === "template" ? "contain" : "cover"} />
      </div>
      <Stack gap={2} className="ds-grow">
        <Row gap={2} wrap>
          <span className="ds-eyebrow">{String(record.fields.kind ?? "asset")} · {String(record.fields.format ?? "").toUpperCase()}</span>
          <FileStateTag record={record} />
        </Row>
        <h2 style={{ fontSize: "var(--text-lg)" }}>{record.title}</h2>
        <p className="ds-subtle">{record.summary}</p>
        <span className="ds-subtle">
          {record.fields.width ? `${String(record.fields.width)} × ${String(record.fields.height)} · ` : ""}
          {state.label} · version {String(record.fields.version ?? 1)} · changed {context.relative(record.updatedAt)}
        </span>
      </Stack>
    </Row>
  );
}

function AssetInspectorPanel({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const { now } = useWorkspace();
  if (!record) return <Empty title="No asset open" icon={<Images size={20} />}>Open an asset from the library.</Empty>;
  const state = licence(record, now);
  return (
    <Stack gap={4}>
      <Notice tone={licenceTone(state.state) === "danger" ? "danger" : licenceTone(state.state) === "warning" ? "warning" : "success"} title={state.label}>
        {String(record.fields.licensor ?? "No licensor recorded")}
      </Notice>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => downloadAsset(context, record, now)}>Download</Button>
        <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Variant editor", { id: record.id })}>New variant</Button>
      </Row>
    </Stack>
  );
}

export const assetApp = registerApp({
  code: "ASSET",
  short: "Assets",
  name: "Assets, Media Library & Brand Resources",
  purpose: "Approved media, brand kits and the rights behind them",
  icon: Images,
  nav: [
    { items: [
      { label: "Asset Library", screenId: "ARL-ASSET-001", icon: Images },
      { label: "Brand Kits", screenId: "ARL-ASSET-003", icon: Palette },
    ] },
    { label: "Production", items: [
      { label: "Transformations", screenId: "ARL-ASSET-004", icon: Wand2 },
    ] },
    { label: "Oversight", items: [
      { label: "Usage & Governance", screenId: "ARL-ASSET-005", icon: ScrollText },
    ] },
  ],
  screens: {
    "ARL-ASSET-001": {
      id: "ARL-ASSET-001",
      subtitle: (context) => `Everything approved for use in ${context.org.name}, with the licence and the file state shown on each one.`,
      statusStrip: (context) => <LibraryStripLine context={context} />,
      tabs: (["All", "Mine", "Approved", "Brand", "Archived"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AssetLibrary context={context} tab={tab} />,
      })),
      actions: [
        { id: "Upload", label: "Upload", placement: "primary", run: (context) => context.openOverlay("Media import") },
        { id: "inspect", label: "Inspect", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an asset"), run: (context) => context.openOverlay("asset inspector", { id: context.selectedId }) },
        { id: "search", label: "Search the library", placement: "overflow", run: () => { document.querySelector<HTMLInputElement>('input[aria-label="Search the library"]')?.focus(); } },
        { id: "group", label: "Group the library", placement: "overflow", run: (context) => context.openOverlay("group assets") },
        {
          id: "replace", label: "Replace", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select an asset"),
          run: (context) => context.openOverlay("replacement impact", { id: context.selectedId }),
        },
        { id: "rights", label: "Check rights", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an asset"), run: (context) => context.openOverlay("rights check", { ids: context.selectedId ? [context.selectedId] : [] }) },
      ],
      overlays: [
        { id: "Media import", kind: "modal", title: "Import media", width: 620, render: ({ close, ...context }) => <MediaImport context={context} close={close} /> },
        { id: "asset inspector", kind: "drawer", title: "Asset", width: 520, render: ({ close: _close, ...context }) => <AssetInspector context={context} /> },
        { id: "rights check", kind: "modal", title: "Rights check", width: 620, render: ({ close: _close, ...context }) => <RightsCheck context={context} /> },
        { id: "replacement impact", kind: "modal", title: "Replace this asset", width: 680, render: ({ close, ...context }) => <ReplacementImpact context={context} close={close} /> },
        { id: "group assets", kind: "modal", title: "Group the library", width: 440, render: ({ close }) => <GroupAssets close={close} /> },
      ],
    },

    "ARL-ASSET-002": {
      id: "ARL-ASSET-002",
      title: () => "Asset",
      subtitle: () => "Preview, metadata, variants, where it is used and what the licence allows.",
      header: (context) => <AssetHeader context={context} />,
      inspector: (context) => <AssetInspectorPanel context={context} />,
      inspectorTitle: "Rights",
      tabs: (["Overview", "Variants", "Usage", "Rights", "History"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AssetDetail context={context} tab={tab} />,
      })),
      actions: [
        { id: "Download", placement: "primary", run: (context) => context.openOverlay("download") },
        { id: "create variant", label: "Create a variant", placement: "secondary", run: (context) => context.openOverlay("Variant editor", { id: context.params.id }) },
        { id: "update rights", label: "Update rights", placement: "overflow", run: (context) => context.openOverlay("rights form", { id: context.params.id }) },
        { id: "archive", label: "Archive", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("archive asset") },
        { id: "replace", label: "Replace across uses", placement: "overflow", run: (context) => context.openOverlay("replacement impact", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Variant editor", kind: "modal", title: "New variant", width: 620, render: ({ close, ...context }) => <VariantEditor context={context} close={close} /> },
        { id: "rights form", kind: "modal", title: "Rights", width: 560, render: ({ close, ...context }) => <RightsForm context={context} close={close} /> },
        { id: "replacement impact", kind: "modal", title: "Replace this asset", width: 680, render: ({ close, ...context }) => <ReplacementImpact context={context} close={close} /> },
        { id: "download", kind: "modal", title: "Download", width: 520, render: ({ close, ...context }) => <DownloadOverlay context={context} close={close} /> },
        { id: "archive asset", kind: "modal", title: "Archive this asset", width: 580, tone: "danger", render: ({ close, ...context }) => <ArchiveAsset context={context} close={close} /> },
      ],
    },

    "ARL-ASSET-003": {
      id: "ARL-ASSET-003",
      subtitle: () => "Logos, palette, type and the rules that make a kit usable by somebody who was not in the room.",
      tabs: (["Brands", "Tokens", "Assets", "Rules"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <BrandKits context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create brand kit", placement: "primary", run: (context) => context.openOverlay("Token editor") },
        { id: "edit", label: "Edit tokens", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a kit"), run: (context) => context.openOverlay("Token editor", { id: context.selectedId }) },
        { id: "apply", label: "Apply to a surface", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a kit"), run: (context) => context.openOverlay("brand selection", { id: context.selectedId }) },
        { id: "publish", label: "Publish as master", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a kit"), run: (context) => context.openOverlay("global impact", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Token editor", kind: "modal", title: "Brand tokens", width: 560, render: ({ close, ...context }) => <TokenEditor context={context} close={close} /> },
        { id: "brand selection", kind: "modal", title: "Apply a kit", width: 520, render: ({ close, ...context }) => <BrandSelection context={context} close={close} /> },
        { id: "global impact", kind: "modal", title: "Publishing a master kit", tone: "danger", width: 620, blocking: true, render: ({ close, ...context }) => <GlobalImpact context={context} close={close} /> },
      ],
    },

    "ARL-ASSET-004": {
      id: "ARL-ASSET-004",
      subtitle: () => "Named sizes, crops and formats, the jobs that used them and the jobs that stopped.",
      tabs: (["Presets", "Jobs", "History", "Failed"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <Transformations context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create preset", placement: "primary", run: (context) => context.openOverlay("Transform inspector") },
        { id: "batch export", label: "Batch export", placement: "secondary", run: (context) => context.openOverlay("overwrite review", { id: context.selectedId }) },
        { id: "compare", label: "Compare sources", placement: "overflow", run: (context) => context.openOverlay("compare sources") },
        {
          id: "publish", label: "Publish preset", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a draft preset"),
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const record = await getRecord(id);
            if (!record || record.fields.kind !== "preset") {
              context.toast("Not a preset", "Choose a preset in the Presets tab; a job cannot be published.", "blocked");
              return;
            }
            if (record.status === "published") {
              context.toast("Already published", `${record.title} is already available everywhere a variant can be produced.`, "info");
              return;
            }
            await context.mutate.patch(id, {
              status: "published",
              fields: { ...record.fields, publishedBy: context.actor, publishedAt: new Date().toISOString() },
            }, { event: `Transformation preset published: ${record.title}`, expectRevision: record.revision });
            context.toast("Preset published", `${record.title} is available wherever a variant can be produced.`);
          },
        },
        { id: "rights", label: "Source rights", placement: "overflow", run: (context) => context.openOverlay("rights", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Transform inspector", kind: "modal", title: "Preset", width: 600, render: ({ close, ...context }) => <TransformInspector context={context} close={close} /> },
        { id: "rights", kind: "drawer", title: "Source rights", width: 520, render: ({ close: _close, ...context }) => <TransformRights context={context} /> },
        { id: "overwrite review", kind: "modal", title: "Batch export", width: 680, render: ({ close, ...context }) => <OverwriteReview context={context} close={close} /> },
        { id: "compare sources", kind: "drawer", title: "Sources against the preset", width: 760, render: ({ close: _close, ...context }) => <CompareSources context={context} /> },
      ],
    },

    "ARL-ASSET-005": {
      id: "ARL-ASSET-005",
      subtitle: () => "Where assets are used, what expires, what is duplicated and what is actually stored.",
      tabs: (["Usage", "Rights", "Duplicates", "Storage"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <GovernanceScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Find use", placement: "primary", run: (context) => context.openOverlay("Usage inspector") },
        { id: "resolve duplicate", label: "Resolve duplicates", placement: "secondary", run: (context) => context.openOverlay("merge preview") },
        { id: "set retention", label: "Set retention", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an asset"), run: (context) => context.openOverlay("expiry warning", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "export", label: "Export the report", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("governance export") },
      ],
      overlays: [
        { id: "Usage inspector", kind: "drawer", title: "Find a use", width: 560, render: ({ close: _close, ...context }) => <UsageInspector context={context} /> },
        { id: "merge preview", kind: "modal", title: "Resolve duplicates", width: 680, render: ({ close, ...context }) => <MergePreview context={context} close={close} /> },
        { id: "expiry warning", kind: "modal", title: "Retention and expiry", width: 600, render: ({ close, ...context }) => <ExpiryWarning context={context} close={close} /> },
        { id: "governance export", kind: "modal", title: "Export the report", width: 520, render: ({ close: _close, ...context }) => <GovernanceExport context={context} /> },
      ],
    },
  },
  fallback: (context) => (
    <Empty title={`${context.screen.title} is not built yet`} icon={<AlertTriangle size={20} />}>
      This screen is in the approved contract for the asset library but has no implementation in this module. It is recorded as
      outstanding rather than shown as a generic gallery.
    </Empty>
  ),
});

function DownloadOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const record = data.assets.find((row) => row.id === (context.params.id ?? context.selectedId));
  if (!record) return <Empty title="No asset open" icon={<Images size={20} />}>Open an asset first.</Empty>;
  const state = licence(record, now);
  return (
    <Stack gap={4}>
      <AssetPreview record={record} height={160} fit="contain" />
      <FileStateTag record={record} />
      {state.state === "expired" ? (
        <Notice tone="danger" title="Download refused">
          The licence from {String(record.fields.licensor ?? "the licensor")} {state.label.toLowerCase()}. Taking the file out of the
          workspace would be using a right nobody holds, so the refusal is recorded instead.
        </Notice>
      ) : (
        <Notice tone="info" title="What you will get">
          {record.body && (record.body as { dataUrl?: string }).dataUrl
            ? "The image you imported, exactly as it is held in this browser."
            : "The stored or drawn SVG for this record. There is no other file here to give you."}
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={state.state === "expired"}
          onClick={() => { downloadAsset(context, record, now); close(); }}
        >
          Download
        </Button>
      </Row>
    </Stack>
  );
}
