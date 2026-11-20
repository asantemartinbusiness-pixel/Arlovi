import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, Brush, Eraser, Crop, Move, SquareDashed, Lasso, Pipette, Hand, Stamp,
  Layers as LayersIcon, SlidersHorizontal, Images, Download, Circle, Undo2, Redo2,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, KeyValueList, Meter, ModalActions, Notice,
  OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, OVERLAY_WIDTH, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, ShortcutTable,
  useStore, type DocHandle,
} from "@/applications/visual/kit";
import {
  NEUTRAL_ADJUST, addLayer, bakeCrop, compositeImageData, describeAdjust,
  groupLayers, isNeutral, layerById, loadImage, makeCanvas, context2d,
  newAdjustmentLayer, patchLayer, selectionBoundsOf,
  type Adjust, type PhotoLayer, type RasterDoc,
} from "./raster";
import { addToAssetLibrary, batchUi, buildBatch, downloadResults, exportImage, exportUi, heldBatchFiles, outputSize, planBatch, runBatch, testSample, type PlannedName } from "./jobs";
import { canUndoShared, editShared, readShared, sharedHandle, undoShared, useGuardRefresh, useSharedDoc } from "@/applications/design/sharedDoc";
import { PhotoCanvas, useImageBank, LayerThumb, type ImageBank } from "./canvas";
import { AdjustControls, CurveEditor, HistogramView, LayerProperties, PhotoLayers, useHistogram } from "./panels";
import {
  bumpPixels, newPixelLayer, parsePhoto, photoUi, setPhotoTool, starterPhoto, unsupportedReason, type PhotoTool,
} from "./model";
import { clockIso, wallMs } from "@/platform/clock";
import { ImageTools } from "./imageTools";
import { frameOf } from "./maskSpace";
import "./photo.css";

/* ====================================================================== *
 * PHOTO — Photo & Image Editing
 * ====================================================================== */

const LICENCES = ["Unknown", "Company-owned", "Licensed — single use", "Licensed — unlimited", "Creative Commons BY", "Model released", "No model release"];

function usePhotoDoc(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useSharedDoc<RasterDoc>(record, parsePhoto, context.screen.id);
  const bank = useImageBank(handle.doc);
  useStore(photoUi);
  useGuardRefresh(context);
  return { record, handle, bank };
}

function MissingPhoto({ context }: { context: ScreenContext }) {
  return (
    <Empty
      title="No image at this address"
      icon={<Camera size={20} />}
      action={
        <Button
          variant="primary"
          onClick={async () => {
            const made = await context.mutate.create({
              collection: "photos", title: "Untitled image", status: "draft",
              summary: "Created in the raster editor.", body: starterPhoto("Untitled image"),
              fields: { kind: "image", width: 900, height: 600 },
            }, "Image created");
            context.navigate(context.path("/o/:org/photo/photos/:id", made.id));
          }}
        >
          Create an image here
        </Button>
      }
    >
      {context.params.id
        ? <>The record <code>{context.params.id}</code> is not in {context.org.shortName}.</>
        : <>Open an image from the library, or create one now.</>}
    </Empty>
  );
}

const PHOTO_TOOLS: { tool: PhotoTool; label: string; icon: React.ReactNode; key: string }[] = [
  { tool: "move", label: "Move the layer", icon: <Move size={15} />, key: "V" },
  { tool: "brush", label: "Brush", icon: <Brush size={15} />, key: "B" },
  { tool: "eraser", label: "Eraser", icon: <Eraser size={15} />, key: "E" },
  { tool: "clone", label: "Clone", icon: <Stamp size={15} />, key: "S" },
  { tool: "crop", label: "Crop", icon: <Crop size={15} />, key: "C" },
  { tool: "marquee", label: "Rectangular marquee", icon: <SquareDashed size={15} />, key: "M" },
  { tool: "ellipse", label: "Elliptical marquee", icon: <Circle size={15} />, key: "N" },
  { tool: "lasso", label: "Lasso", icon: <Lasso size={15} />, key: "L" },
  { tool: "eyedropper", label: "Eyedropper", icon: <Pipette size={15} />, key: "I" },
  { tool: "hand", label: "Hand", icon: <Hand size={15} />, key: "H" },
];

/* ---------------------------- PHOTO-001 ---------------------------- */

function PhotoLibrary({ context, lens }: { context: ScreenContext; lens: "Recent" | "Albums" | "Shared" | "Imports" }) {
  const photos = useCollection("photos");
  const { relative } = useWorkspace();
  const rows = photos.filter((record) => {
    if (lens === "Shared") return Boolean(record.fields.sharedWith);
    if (lens === "Imports") return record.fields.importedAt !== undefined || record.status === "imported";
    return true;
  });

  if (lens === "Albums") {
    const albums = new Map<string, typeof photos>();
    for (const record of photos) {
      const album = String(record.fields.album ?? "Unfiled");
      albums.set(album, [...(albums.get(album) ?? []), record]);
    }
    return (
      <Grid>
        {[...albums.entries()].map(([album, items]) => (
          <Card key={album} span={4} title={album} subtitle={`${items.length} image${items.length === 1 ? "" : "s"}`}>
            <Stack gap={2}>
              {items.slice(0, 4).map((record) => (
                <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow">{record.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => context.navigate(context.path("/o/:org/photo/photos/:id", record.id))}>Open</Button>
                </Row>
              ))}
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  if (rows.length === 0) {
    return <Empty title={`No ${lens.toLowerCase()} images`} icon={<Camera size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Bulk import")}>Upload</Button>} />;
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Images" value={photos.length} meta={`in ${context.org.shortName}`} />
        <Stat label="With rights recorded" value={photos.filter((record) => record.fields.license && record.fields.license !== "Unknown").length} meta="licence stored on the record" />
        <Stat label="Flagged for rights" value={photos.filter((record) => String(record.fields.license ?? "") === "Unknown").length} meta="do not publish" />
        <Stat label="Could not be read" value={photos.filter((record) => record.status === "unreadable").length} meta="kept, never silently dropped" />
      </StatRow>
      <Grid>
        {rows.map((record) => {
          const doc = parsePhoto(record.body);
          return (
            <Card
              key={record.id}
              span={4}
              title={record.title}
              subtitle={`${doc.width} × ${doc.height} · ${doc.layers.length} layer${doc.layers.length === 1 ? "" : "s"} · ${relative(record.updatedAt)}`}
              actions={<Button size="sm" variant="secondary" onClick={() => { context.select(record.id); context.navigate(context.path("/o/:org/photo/photos/:id", record.id)); }}>Open</Button>}
            >
              <Stack gap={2}>
                <PhotoPreview record={record.id} doc={doc} />
                <Row gap={2} wrap>
                  <Pill tone={record.status === "unreadable" ? "danger" : "info"} dot>{record.status}</Pill>
                  <Pill tone={String(record.fields.license ?? "") === "Unknown" ? "danger" : "neutral"}>{String(record.fields.license ?? doc.rights.license)}</Pill>
                  {record.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
                </Row>
                {record.status === "unreadable" && (
                  <Notice tone="danger" title="This file could not be decoded">{record.summary}</Notice>
                )}
                <Row gap={1} wrap>
                  <Button size="sm" variant="ghost" onClick={() => context.select(record.id)}>Select</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("asset detail", { id: record.id })}>Detail</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("license", { id: record.id })}>Licence</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

/** A thumbnail composited from the record's real layers. */
function PhotoPreview({ record, doc, height = 150 }: { record: string; doc: RasterDoc; height?: number }) {
  const bank = useImageBank(doc);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!bank.ready) return;
    try {
      const canvas = makeCanvas(360, Math.max(1, Math.round((360 * doc.height) / doc.width)));
      const frame = compositeImageData(doc, bank.images, bank.masks, {}, 360);
      context2d(canvas).putImageData(frame, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    } catch { setSrc(null); }
  }, [bank.ready, bank.version, doc]);
  return src
    ? <img src={src} alt={`Composite of ${record}`} style={{ width: "100%", height, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border-default)" }} />
    : <div className="vx-checker" style={{ height, borderRadius: 6, display: "grid", placeItems: "center" }}><span className="vx-mini">Compositing…</span></div>;
}

/* ---------------------------- PHOTO-002 ---------------------------- */

function RasterEditor({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const ui = useStore(photoUi);
  const data = useHistogram(handle.doc, bank);
  /* Opening an image whose active layer is an adjustment would greet the brush with "holds no pixels":
     start on the top pixel layer instead (a view choice, so it makes no undo entry). */
  const settledFor = useRef<string>();
  useEffect(() => {
    const open = handle.doc;
    if (!open || !record || settledFor.current === record.id) return;
    settledFor.current = record.id;
    const active = layerById(open, open.activeLayerId);
    if (active && active.kind !== "pixel") {
      const top = [...open.layers].reverse().find((layer) => layer.kind === "pixel");
      if (top) handle.live({ ...open, activeLayerId: top.id });
    }
  }, [handle, record]);
  if (!record) return <div className="pg-body"><MissingPhoto context={context} /></div>;
  const doc = handle.doc;
  const tab = context.tab;

  return (
    <EditorFrame
      context={context}
      lean
      titleLevel={1}
      actions={actions}
      tabs={[{ id: "Edit" }, { id: "Layers" }, { id: "Adjust" }, { id: "Review" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{doc.width} × {doc.height}</span> · {doc.layers.length} layers</span>}{doc && <button type="button" className="ph-licence" onClick={() => context.openOverlay("rights")} aria-label={`Licence: ${doc.rights.license}. Open rights`}><Pill tone={doc.rights.license === "Unknown" ? "danger" : "neutral"}>{doc.rights.license}</Pill></button>}</Row>}
      backTo={{ label: "Photo", to: `/o/${context.org.slug}/photo/photos` }}
      tools={
        <div className="ph-tools">
          <Toolbar label="Tools">
            {PHOTO_TOOLS.map((item) => (
              <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setPhotoTool(item.tool)} />
            ))}
          </Toolbar>
          <Toolbar label="History">
            <Tool label="Undo (⌘Z)" icon={<Undo2 size={15} />} disabled={!handle.canUndo} onClick={() => { handle.undo(); bumpPixels(); }} />
            <Tool label="Redo (⇧⌘Z)" icon={<Redo2 size={15} />} disabled={!handle.canRedo} onClick={() => { handle.redo(); bumpPixels(); }} />
            <Tool label="Before and after: bypass every adjustment" active={ui.compare} onClick={() => photoUi.set((c) => ({ ...c, compare: !c.compare }))}>Before</Tool>
          </Toolbar>
          <ImageTools context={context} handle={handle} bank={bank} title={record.title} />
        </div>
      }
      left={
        <Stack gap={3}>
          <RecoveryNotice handle={handle as DocHandle<unknown>} />
          {doc && (
            <PanelGroup title="Source and rights">
              <p className="vx-mini">{doc.origin}</p>
              <KeyValueList items={[
                { label: "Licence", value: doc.rights.license, tone: doc.rights.license === "Unknown" ? "danger" : undefined },
                { label: "Credit", value: doc.rights.credit },
                { label: "Profile", value: doc.profile },
              ]} />
            </PanelGroup>
          )}
          <PanelGroup title="Layers">{<PhotoLayers handle={handle} bank={bank} onOpenBlend={() => context.openOverlay("Tool options")} />}</PanelGroup>
        </Stack>
      }
      leftLabel="Layers"
      right={
        tab === "Adjust" ? <AdjustmentPanel handle={handle} context={context} />
          : tab === "Review" ? <ReviewPanel handle={handle} context={context} data={data} />
            : tab === "Layers" ? <LayerProperties handle={handle} />
              : <BrushPanel handle={handle} context={context} data={data} />
      }
      rightLabel={tab === "Adjust" ? "Adjustment" : tab === "Review" ? "Review" : tab === "Layers" ? "Layer" : "Tool"}
      status={
        <>
          <span>Tool: {ui.tool}</span>
          <span>Brush {Math.round(ui.brush.size)}px, {Math.round(ui.brush.opacity * 100)}% opacity</span>
          {data && <span>{data.counted.toLocaleString()} pixels counted</span>}
          <span className="ds-grow" />
          <span>[ and ] resize the brush · arrows move the layer · ⌘Z undo</span>
        </>
      }
    >
      <PhotoCanvas handle={handle} bank={bank} onSample={() => context.toast("Colour picked", `The brush colour is now ${photoUi.get().brush.color}.`)} />
    </EditorFrame>
  );
}

function BrushPanel({ handle, context, data }: { handle: DocHandle<RasterDoc>; context: ScreenContext; data: ReturnType<typeof useHistogram> }) {
  const ui = useStore(photoUi);
  const doc = handle.doc;
  const layer = doc ? layerById(doc, doc.activeLayerId) : undefined;
  return (
    <Stack gap={3}>
      <PanelGroup title="Brush">
        <SliderBoxLocal label="Size" value={ui.brush.size} min={1} max={400} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, size: value } }))} suffix="px" />
        <SliderBoxLocal label="Softness" value={Math.round(ui.brush.softness * 100)} min={0} max={100} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, softness: value / 100 } }))} suffix="%" />
        <SliderBoxLocal label="Opacity" value={Math.round(ui.brush.opacity * 100)} min={1} max={100} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, opacity: value / 100 } }))} suffix="%" />
        <Field label="Colour">
          <Row gap={2}>
            <input type="color" aria-label="Brush colour" value={ui.brush.color} onChange={(event) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, color: event.target.value } }))} style={{ width: 34, height: 28 }} />
            <code className="ds-num">{ui.brush.color}</code>
          </Row>
        </Field>
        {layer && layer.kind !== "pixel" && (
          <Notice tone="warning" title="This layer holds no pixels">
            {layer.name} is {layer.kind === "adjustment" ? "an adjustment" : "a fill"} layer. Add a pixel layer, or select one, before painting.
            <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => addLayer(current, newPixelLayer(`Paint ${current.layers.length}`, current.width, current.height)), "Add a pixel layer")}>Add a pixel layer</Button>
          </Notice>
        )}
      </PanelGroup>
      <PanelGroup title="Histogram" actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Tool options")}>Options</Button>}>
        <HistogramView data={data} />
      </PanelGroup>
      <PanelGroup title="Canvas">
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("canvas size")}>Canvas size…</Button>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("adjustment layer")}>Add an adjustment layer…</Button>
      </PanelGroup>
    </Stack>
  );
}

function SliderBoxLocal({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <div>
      <label className="vx-label">{label} <span className="ds-num" style={{ float: "right", fontWeight: 400 }}>{Math.round(value)}{suffix}</span>
        <input className="vx-range" type="range" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
      </label>
    </div>
  );
}

function AdjustmentPanel({ handle, context }: { handle: DocHandle<RasterDoc>; context: ScreenContext }) {
  const doc = handle.doc;
  if (!doc) return null;
  const layer = layerById(doc, doc.activeLayerId);
  if (!layer || layer.kind !== "adjustment" || !layer.adjust) {
    const adjustments = doc.layers.filter((item) => item.kind === "adjustment");
    return (
      <Stack gap={3}>
        <Notice tone="info" title="Select an adjustment layer">An adjustment layer changes everything painted below it without touching those pixels.</Notice>
        {adjustments.map((item) => (
          <Button key={item.id} size="sm" variant="secondary" onClick={() => handle.edit((current) => ({ ...current, activeLayerId: item.id }), "Select the adjustment")}>{item.name}</Button>
        ))}
        <Button
          variant="primary"
          onClick={() => handle.edit((current) => addLayer(current, newAdjustmentLayer(`adj-${wallMs().toString(36)}`, `Adjustment ${current.layers.filter((item) => item.kind === "adjustment").length + 1}`)), "Add an adjustment layer")}
        >
          Add an adjustment layer
        </Button>
      </Stack>
    );
  }
  return (
    <Stack gap={3}>
      <PanelGroup title={layer.name}>
        <AdjustControls adjust={layer.adjust} onChange={(next) => handle.edit((current) => patchLayer(current, layer.id, { adjust: next }), "Adjust")} />
      </PanelGroup>
      <PanelGroup title="Presets">
        {doc.presets.map((preset) => (
          <Button key={preset.id} size="sm" variant="ghost" onClick={() => handle.edit((current) => patchLayer(current, layer.id, { adjust: { ...preset.adjust, curve: [...preset.adjust.curve] } }), `Apply ${preset.name}`)}>{preset.name}</Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/photo/photos/:id/adjust", context.params.id))}>Open the adjustment screen</Button>
      </PanelGroup>
    </Stack>
  );
}

function ReviewPanel({ handle, context, data }: { handle: DocHandle<RasterDoc>; context: ScreenContext; data: ReturnType<typeof useHistogram> }) {
  const doc = handle.doc;
  if (!doc) return null;
  return (
    <Stack gap={3}>
      <PanelGroup title="What has been done">
        {doc.history.length === 0 ? <p className="vx-mini">Nothing recorded on the document yet. The undo stack holds this session's steps.</p> : (
          <Stack gap={1}>
            {doc.history.slice(0, 10).map((entry) => (
              <Row key={entry.id} gap={2}><span className="ds-grow">{entry.label}</span><span className="vx-mini">{context.relative(entry.at)}</span></Row>
            ))}
          </Stack>
        )}
      </PanelGroup>
      <PanelGroup title="Histogram"><HistogramView data={data} channel="luma" /></PanelGroup>
      <PanelGroup title="Rights">
        <Properties rows={[{ label: "Licence", value: doc.rights.license }, { label: "Credit", value: doc.rights.credit }, { label: "Profile", value: doc.profile }]} />
      </PanelGroup>
      <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/photo/photos/:id/export", context.params.id))}>Export…</Button>
    </Stack>
  );
}

/* ---------------------------- PHOTO-003 ---------------------------- */

function MasksScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const ui = useStore(photoUi);
  if (!record) return <div className="pg-body"><MissingPhoto context={context} /></div>;
  const doc = handle.doc;
  const tab = context.tab;
  const layer = doc ? layerById(doc, doc.activeLayerId) : undefined;

  const applySelectionAsMask = async () => {
    if (!doc || !doc.selection || !layer) return;
    const canvas = makeCanvas(doc.width, doc.height);
    const ctx = context2d(canvas);
    ctx.fillStyle = doc.selection.inverted ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.fillStyle = doc.selection.inverted ? "#000000" : "#ffffff";
    if (doc.selection.feather > 0) ctx.filter = `blur(${doc.selection.feather}px)`;
    ctx.beginPath();
    if (doc.selection.kind === "rect" && doc.selection.rect) {
      ctx.rect(doc.selection.rect.x, doc.selection.rect.y, doc.selection.rect.w, doc.selection.rect.h);
    } else if (doc.selection.kind === "ellipse" && doc.selection.rect) {
      const r = doc.selection.rect;
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2);
    } else if (doc.selection.points) {
      doc.selection.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.closePath();
    }
    ctx.fill();
    const data = canvas.toDataURL("image/png");
    handle.edit((current) => patchLayer(current, layer.id, { mask: data, maskEnabled: true, maskFrame: frameOf(layerById(current, layer.id) ?? layer) }), "Turn the selection into a mask");
    bumpPixels();
    context.toast("Mask created", `${layer.name} is now masked by the selection, feathered by ${doc.selection.feather}px.`);
  };

  return (
    <EditorFrame
      context={context}
      lean
      titleLevel={1}
      actions={actions}
      tabs={[{ id: "Select" }, { id: "Refine" }, { id: "Mask" }, { id: "Compare" }]}
      title={`${record.title} — selections and masks`}
      subtitle={<Row gap={2}><SaveState handle={handle} /><span>{doc?.selection ? `${doc.selection.kind} selection${doc.selection.inverted ? ", inverted" : ""}` : "no selection"}</span></Row>}
      backTo={{ label: record.title, to: context.path("/o/:org/photo/photos/:id", context.params.id) }}
      tools={
        <Toolbar label="Selection tools">
          {PHOTO_TOOLS.filter((item) => ["marquee", "ellipse", "lasso", "brush", "eraser", "hand"].includes(item.tool)).map((item) => (
            <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setPhotoTool(item.tool)} />
          ))}
          <ToolbarSeparator />
          <Button size="sm" variant="ghost" disabled={!doc?.selection} onClick={() => handle.edit((current) => ({ ...current, selection: current.selection ? { ...current.selection, inverted: !current.selection.inverted } : undefined }), "Invert the selection")}>Invert</Button>
          <Button size="sm" variant="ghost" disabled={!doc?.selection} onClick={() => handle.edit((current) => ({ ...current, selection: undefined }), "Clear the selection")}>Deselect</Button>
        </Toolbar>
      }
      left={<PanelGroup title="Layers"><PhotoLayers handle={handle} bank={bank} /></PanelGroup>}
      leftLabel="Layers"
      right={
        <Stack gap={3}>
          {tab === "Select" && (
            <PanelGroup title="Selection">
              {!doc?.selection ? <p className="vx-mini">Drag on the canvas with a marquee or the lasso.</p> : (
                <Properties rows={[
                  { label: "Kind", value: doc.selection.kind },
                  { label: "Bounds", value: (() => { const b = selectionBoundsOf(doc.selection, doc.width, doc.height); return `${Math.round(b.x)}, ${Math.round(b.y)} · ${Math.round(b.w)} × ${Math.round(b.h)}`; })() },
                  { label: "Inverted", value: doc.selection.inverted ? "yes" : "no" },
                  { label: "Feather", value: `${doc.selection.feather}px` },
                ]} />
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handle.edit((current) => ({ ...current, selection: { kind: "rect", rect: { x: current.width * 0.15, y: current.height * 0.15, w: current.width * 0.7, h: current.height * 0.7 }, feather: 0, inverted: false } }), "Select the centre")}
              >
                Select the middle seventy percent
              </Button>
              <Notice tone="warning" title="Subject detection is not available">
                There is no model connected, so nothing can find a subject for you. The lasso, the marquees and the mask brush do the work, and the feather below softens the edge.
              </Notice>
            </PanelGroup>
          )}
          {tab === "Refine" && (
            <PanelGroup title="Refine the edge">
              <SliderBoxLocal
                label="Feather"
                value={doc?.selection?.feather ?? 0}
                min={0}
                max={60}
                onChange={(value) => handle.edit((current) => ({ ...current, selection: current.selection ? { ...current.selection, feather: value } : undefined }), "Feather the selection")}
                suffix="px"
              />
              <p className="vx-mini">Feathering is applied as a real blur when the selection becomes a mask, so the edge you set is the edge you get.</p>
              <Button size="sm" variant="primary" disabled={!doc?.selection || !layer} onClick={() => void applySelectionAsMask()}>Turn the selection into a mask</Button>
            </PanelGroup>
          )}
          {tab === "Mask" && (
            <PanelGroup title="Mask">
              {!layer ? <p className="vx-mini">Select a layer.</p> : layer.mask ? (
                <Stack gap={2}>
                  <img src={layer.mask} alt={`Mask on ${layer.name}`} style={{ width: "100%", border: "1px solid var(--border-default)", borderRadius: 4 }} />
                  <Checkbox label="Mask enabled" checked={Boolean(layer.maskEnabled)} onChange={(event) => handle.edit((current) => patchLayer(current, layer.id, { maskEnabled: event.target.checked }), "Toggle the mask")} />
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => patchLayer(current, layer.id, { mask: undefined, maskEnabled: false, maskFrame: undefined }), "Delete the mask")}>Delete the mask</Button>
                </Stack>
              ) : (
                <Stack gap={2}>
                  <p className="vx-mini">{layer.name} has no mask. Paint one below, or make a selection and convert it on the Refine tab.</p>
                  <Button size="sm" variant="secondary" disabled={!doc?.selection} onClick={() => void applySelectionAsMask()}>Use the current selection</Button>
                </Stack>
              )}
              <Notice tone="info" title="Painting goes to the mask on this tab">White shows the layer, black hides it. Switch the brush to the eraser to paint white back.</Notice>
            </PanelGroup>
          )}
          {tab === "Compare" && (
            <PanelGroup title="Compare">
              <Checkbox label="Bypass every adjustment layer" checked={ui.compare} onChange={(event) => photoUi.set((c) => ({ ...c, compare: event.target.checked }))} />
              <Checkbox label="Show the selection outline" checked={ui.showSelection} onChange={(event) => photoUi.set((c) => ({ ...c, showSelection: event.target.checked }))} />
              <p className="vx-mini">The canvas recomposites immediately; nothing is cached between the two states.</p>
            </PanelGroup>
          )}
        </Stack>
      }
      rightLabel={tab}
      status={
        <>
          <span>{doc?.selection ? `${doc.selection.kind} selection` : "No selection"}</span>
          <span className="ds-grow" />
          <span>⌘D deselects · ⌘I inverts · the selection follows a crop</span>
        </>
      }
    >
      <PhotoCanvas handle={handle} bank={bank} paintTarget={tab === "Mask" ? "mask" : "layer"} />
    </EditorFrame>
  );
}

/* ---------------------------- PHOTO-004 ---------------------------- */

function AdjustScreen({ context, lens }: { context: ScreenContext; lens: "Basic" | "Curves" | "Colour" | "Detail" }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const ui = useStore(photoUi);
  const data = useHistogram(handle.doc, bank);
  const before = useHistogram(handle.doc, bank, { bypassAdjustments: true });
  if (!record) return <MissingPhoto context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the image…" />;
  const layer = layerById(doc, doc.activeLayerId);
  const target = layer?.kind === "adjustment" ? layer : doc.layers.filter((item) => item.kind === "adjustment").at(-1);

  const ensureAdjustment = () => {
    handle.edit((current) => addLayer(current, newAdjustmentLayer(`adj-${wallMs().toString(36)}`, "Adjustment")), "Add an adjustment layer");
  };

  if (!target?.adjust) {
    return (
      <Empty title="No adjustment layer yet" icon={<SlidersHorizontal size={20} />} action={<Button variant="primary" onClick={ensureAdjustment}>Add an adjustment layer</Button>}>
        Adjustments live on their own layer so the pixels underneath are never rewritten.
      </Empty>
    );
  }

  const set = (next: Adjust) => handle.edit((current) => patchLayer(current, target.id, { adjust: next }), "Adjust");

  const comparison = (
    <Card title="Before and after" subtitle="Both read from the composited pixels" actions={<Checkbox label="Bypass adjustments on the canvas" checked={ui.compare} onChange={(event) => photoUi.set((c) => ({ ...c, compare: event.target.checked }))} />}>
      <Grid>
        <Card span={6} title="Before" pad="tight"><HistogramView data={before} channel="luma" /></Card>
        <Card span={6} title="After" pad="tight"><HistogramView data={data} channel="luma" /></Card>
      </Grid>
    </Card>
  );

  return (
    <Grid>
      <Card span={5} title={`${target.name}`} subtitle={describeAdjust(target.adjust)}>
        {lens === "Basic" && <AdjustControls adjust={target.adjust} onChange={set} />}
        {lens === "Curves" && <CurveEditor points={target.adjust.curve} onChange={(curve) => set({ ...target.adjust!, curve })} />}
        {lens === "Colour" && (
          <Stack gap={3}>
            <SliderBoxLocal label="Temperature" value={target.adjust.temperature} min={-100} max={100} onChange={(value) => set({ ...target.adjust!, temperature: value })} />
            <SliderBoxLocal label="Tint" value={target.adjust.tint} min={-100} max={100} onChange={(value) => set({ ...target.adjust!, tint: value })} />
            <SliderBoxLocal label="Saturation" value={target.adjust.saturation} min={-100} max={100} onChange={(value) => set({ ...target.adjust!, saturation: value })} />
            <Field label="Colour profile">
              <Select value={doc.profile} onChange={(event) => handle.edit((current) => ({ ...current, profile: event.target.value }), "Change the colour profile")}>
                {["sRGB IEC61966-2.1", "Display P3", "Adobe RGB (1998)", "ProPhoto RGB"].map((option) => <option key={option}>{option}</option>)}
              </Select>
            </Field>
            {doc.profile !== "sRGB IEC61966-2.1" && (
              <Notice tone="warning" title="This browser edits in sRGB" actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("profile warning")}>What this means</Button>}>
                The canvas works in sRGB. {doc.profile} is recorded on the document for a later converter, but no conversion is applied here and the exported file will be sRGB.
              </Notice>
            )}
          </Stack>
        )}
        {lens === "Detail" && (
          <Stack gap={3}>
            <SliderBoxLocal label="Highlights" value={target.adjust.highlights} min={-100} max={100} onChange={(value) => set({ ...target.adjust!, highlights: value })} />
            <SliderBoxLocal label="Shadows" value={target.adjust.shadows} min={-100} max={100} onChange={(value) => set({ ...target.adjust!, shadows: value })} />
            <Notice tone="warning" title="Sharpening and noise reduction are not implemented">
              A convolution pass over every pixel is within reach but is not built here. Nothing on this screen pretends to sharpen; the two recovery sliders above are real and operate on the tone curve.
            </Notice>
          </Stack>
        )}
        <Row gap={2} wrap style={{ marginBlockStart: 12 }}>
          <Button size="sm" variant="ghost" onClick={() => set({ ...NEUTRAL_ADJUST, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] })}>Reset</Button>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Histogram")}>Histogram</Button>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("colour picker")}>Sample a colour</Button>
        </Row>
      </Card>
      <Card span={7} title="The image" subtitle={isNeutral(target.adjust) ? "This adjustment layer is currently neutral" : "Recomposited on every change"} flush>
        <div style={{ position: "relative", height: 420 }}>
          <PhotoCanvas handle={handle} bank={bank} showSelectionOverlay={false} />
        </div>
      </Card>
      <div className="ds-col-12">{comparison}</div>
      <Card span={12} title="Presets" subtitle={`${doc.presets.length} saved on this document`}>
        <Row gap={2} wrap>
          {doc.presets.map((preset) => (
            <Button key={preset.id} size="sm" variant="secondary" onClick={() => set({ ...preset.adjust, curve: [...preset.adjust.curve] })}>{preset.name}</Button>
          ))}
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const name = `Preset ${doc.presets.length + 1}`;
              handle.edit((current) => ({ ...current, presets: [...current.presets, { id: `pr-${wallMs().toString(36)}`, name, adjust: { ...target.adjust!, curve: [...target.adjust!.curve] } }] }), "Save a preset");
              context.toast("Preset saved", `${name} stores ${describeAdjust(target.adjust!)}.`);
            }}
          >
            Save these settings as a preset
          </Button>
        </Row>
      </Card>
    </Grid>
  );
}

/* ---------------------------- PHOTO-005 ---------------------------- */

function CompositeScreen({ context, lens }: { context: ScreenContext; lens: "Layers" | "Groups" | "Effects" | "History" }) {
  const { record, handle, bank } = usePhotoDoc(context);
  if (!record) return <MissingPhoto context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the image…" />;

  if (lens === "History") {
    return (
      <Grid>
        <Card span={6} title="This session" subtitle={`${handle.historyLabels.length} undoable steps`}>
          {handle.historyLabels.length === 0 ? <Empty title="Nothing yet">Paint a stroke or move a slider; every step lands here and ⌘Z walks back through them.</Empty> : (
            <Stack gap={1}>
              {[...handle.historyLabels].reverse().map((label, index) => (
                <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow">{label}</span>
                  <Pill>{handle.historyLabels.length - index}</Pill>
                </Row>
              ))}
            </Stack>
          )}
          <Row gap={2} style={{ marginBlockStart: 12 }}>
            <Button size="sm" variant="secondary" disabled={!handle.canUndo} onClick={handle.undo}>Undo</Button>
            <Button size="sm" variant="secondary" disabled={!handle.canRedo} onClick={handle.redo}>Redo</Button>
          </Row>
        </Card>
        <Card span={6} title="Record snapshots" subtitle={`${record.history.length} kept by the repository · revision ${record.revision}`}>
          {record.history.length === 0 ? <p className="ds-subtle">The record has not been saved twice yet.</p> : (
            <DataGrid
              rows={record.history.map((item, index) => ({ ...item, id: String(index) }))}
              rowId={(row) => row.id}
              label="Snapshots"
              columns={[
                { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
                { key: "status", header: "Status", cell: (row) => row.status },
              ]}
            />
          )}
          <Notice tone="info" title="A crop is destructive, so it is versioned">
            Baking a crop rewrites the pixel layers. The snapshot above holds the document from before it, and the editor's undo stack holds it for this session.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Effects") {
    const layer = layerById(doc, doc.activeLayerId);
    return (
      <Grid>
        <Card span={5} title="Blend and opacity" subtitle={layer?.name ?? "no layer"}>
          <LayerProperties handle={handle} />
        </Card>
        <Card span={7} title="Every blend mode on this layer" subtitle="Rendered by the browser's own compositor">
          {!layer || layer.kind === "adjustment" ? <Empty title="Select a pixel or fill layer" /> : (
            <Grid>
              {["normal", "multiply", "screen", "overlay", "soft-light", "difference"].map((mode) => (
                <Card key={mode} span={4} pad="tight">
                  <BlendPreview doc={doc} bank={bank} layerId={layer.id} mode={mode as PhotoLayer["blend"]} />
                  <Row gap={2} style={{ marginBlockStart: 6 }}>
                    <span className="ds-grow vx-mini">{mode}</span>
                    <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => patchLayer(current, layer.id, { blend: mode as PhotoLayer["blend"] }), "Change the blend mode")}>Use</Button>
                  </Row>
                </Card>
              ))}
            </Grid>
          )}
        </Card>
      </Grid>
    );
  }

  if (lens === "Groups") {
    const groups = doc.layers.filter((layer) => layer.kind === "group");
    return (
      <Grid>
        <Card span={5} title="Groups" subtitle={`${groups.length} groups`}>
          {groups.length === 0 ? <Empty title="No groups yet">Select layers in the table and group them.</Empty> : (
            <Stack gap={2}>
              {groups.map((group) => (
                <Row key={group.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <strong className="ds-grow">{group.name}</strong>
                  <Pill>{doc.layers.filter((layer) => layer.parentId === group.id).length} members</Pill>
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => patchLayer(current, group.id, { visible: !group.visible }), "Toggle the group")}>{group.visible ? "Hide" : "Show"}</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={7} title="Layers" subtitle="Select rows and group them">
          <LayerTable handle={handle} bank={bank} context={context} grouping />
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={4} title="Layer stack" subtitle={`${doc.layers.length} layers, topmost first`}>
        <PhotoLayers handle={handle} bank={bank} onOpenBlend={() => context.openOverlay("Blend picker")} />
      </Card>
      <Card span={8} title="Composite" subtitle="The image as the layers stack it now" flush>
        <div style={{ position: "relative", height: 340 }}>
          <PhotoCanvas handle={handle} bank={bank} showSelectionOverlay={false} />
        </div>
      </Card>
      <Card span={12} title="Layer table" subtitle="Reorder, blend, replace">
        <LayerTable handle={handle} bank={bank} context={context} />
      </Card>
    </Grid>
  );
}

function BlendPreview({ doc, bank, layerId, mode }: { doc: RasterDoc; bank: ImageBank; layerId: string; mode: PhotoLayer["blend"] }) {
  const preview = useMemo(() => ({ ...doc, layers: doc.layers.map((layer) => (layer.id === layerId ? { ...layer, blend: mode } : layer)) }), [doc, layerId, mode]);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!bank.ready) return;
    try {
      const frame = compositeImageData(preview, bank.images, bank.masks, {}, 180);
      const canvas = makeCanvas(frame.width, frame.height);
      context2d(canvas).putImageData(frame, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    } catch { setSrc(null); }
  }, [preview, bank.ready, bank.version]);
  return src ? <img src={src} alt={`${mode} blend`} style={{ width: "100%", borderRadius: 4 }} /> : <div className="vx-checker" style={{ height: 80, borderRadius: 4 }} />;
}

function LayerTable({ handle, bank, context, grouping }: { handle: DocHandle<RasterDoc>; bank: ImageBank; context: ScreenContext; grouping?: boolean }) {
  const doc = handle.doc;
  if (!doc) return null;
  const rows = [...doc.layers].reverse();
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Layers"
      selectedId={doc.activeLayerId}
      onSelect={(id) => handle.edit((current) => ({ ...current, activeLayerId: id }), "Select a layer")}
      columns={[
        { key: "thumb", header: "", width: "52px", cell: (row) => <LayerThumb doc={doc} layer={row} bank={bank} size={40} /> },
        { key: "name", header: "Layer", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
        { key: "kind", header: "Kind", cell: (row) => row.kind, sortValue: (row) => row.kind },
        {
          key: "blend", header: "Blend", cell: (row) => (
            <Select aria-label={`${row.name} blend mode`} value={row.blend} onChange={(event) => handle.edit((current) => patchLayer(current, row.id, { blend: event.target.value as PhotoLayer["blend"] }), "Change the blend mode")}>
              {["normal", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "difference", "luminosity"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </Select>
          ),
        },
        { key: "opacity", header: "Opacity", align: "end", cell: (row) => `${Math.round(row.opacity * 100)}%`, sortValue: (row) => row.opacity },
        { key: "mask", header: "Mask", cell: (row) => (row.mask ? <Pill tone="accent">{row.maskEnabled ? "on" : "off"}</Pill> : "—") },
        {
          key: "order", header: "Order", align: "end", cell: (row) => (
            <Row gap={1}>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Raise ${row.name}`} onClick={() => handle.edit((current) => moveLayerLocal(current, row.id, 1), "Raise the layer")}>↑</Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Lower ${row.name}`} onClick={() => handle.edit((current) => moveLayerLocal(current, row.id, -1), "Lower the layer")}>↓</Button>
            </Row>
          ),
        },
      ]}
      bulkActions={grouping ? [
        {
          label: "Group",
          onRun: (selected) => {
            const id = `grp-${wallMs().toString(36)}`;
            handle.edit((current) => groupLayers(current, selected.map((row) => row.id), `Group ${current.layers.filter((layer) => layer.kind === "group").length + 1}`, id), "Group the layers");
            context.toast("Grouped", `${selected.length} layers moved into a group. Hiding the group hides them all.`);
          },
        },
        { label: "Hide", onRun: (selected) => selected.forEach((row) => handle.edit((current) => patchLayer(current, row.id, { visible: false }), "Hide the layer")) },
      ] : undefined}
      onOpen={(id) => { handle.edit((current) => ({ ...current, activeLayerId: id }), "Select a layer"); context.openOverlay("layer properties", { id }); }}
    />
  );
}

function moveLayerLocal(doc: RasterDoc, id: string, delta: number): RasterDoc {
  const from = doc.layers.findIndex((layer) => layer.id === id);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(doc.layers.length - 1, from + delta));
  if (to === from) return doc;
  const layers = [...doc.layers];
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
  return { ...doc, layers };
}

/* ---------------------------- PHOTO-006 ---------------------------- */

/** The file names a run would produce with today's settings. Recomputed when the queue or the output settings change. */
function useBatchPlan(): PlannedName[] | undefined {
  const batch = useStore(batchUi);
  const [plan, setPlan] = useState<PlannedName[]>();
  useEffect(() => {
    let live = true;
    if (batch.jobs.length === 0) { setPlan([]); return; }
    void planBatch().then((next) => { if (live) setPlan(next); });
    return () => { live = false; };
  }, [batch.jobs, batch.format, batch.pattern, batch.longEdge]);
  return plan;
}

/** Run the queue; when any output name is already taken, the decision is made explicit first. */
async function requestRun(context: ScreenContext): Promise<void> {
  const plan = await planBatch();
  if (plan.some((item) => item.collision)) { context.openOverlay("overwrite confirmation"); return; }
  await runBatch(context);
}

function BatchScreen({ context, lens }: { context: ScreenContext; lens: "Queue" | "Presets" | "Results" | "Failed" }) {
  const batch = useStore(batchUi);
  useGuardRefresh(context);
  const { jobs, chosen, format, quality, longEdge, pattern, running } = batch;
  const set = (patch: Partial<typeof batch>) => batchUi.set((current) => ({ ...current, ...patch }));
  const setFormat = (value: typeof format) => set({ format: value });
  const setQuality = (value: number) => set({ quality: value });
  const setLongEdge = (value: number) => set({ longEdge: value });
  const setPattern = (value: string) => set({ pattern: value });
  const execute = (onlyFailed = false) => runBatch(context, onlyFailed);

  if (lens === "Presets") {
    return (
      <Grid>
        <Card span={6} title="Output" subtitle="These settings apply to every job in the queue">
          <Stack gap={3}>
            <Field label="Format">
              <Select value={format} onChange={(event) => setFormat(event.target.value as "jpeg")}>
                <option value="jpeg">JPEG — smallest, no transparency</option>
                <option value="png">PNG — lossless, keeps transparency</option>
                <option value="webp">WebP — small and keeps transparency</option>
              </Select>
            </Field>
            {format !== "png" && <SliderBoxLocal label="Quality" value={Math.round(quality * 100)} min={5} max={100} onChange={(value) => setQuality(value / 100)} suffix="%" />}
            <Field label="Longest edge" hint="Images smaller than this are left alone rather than enlarged.">
              <TextInput type="number" value={longEdge} onChange={(event) => setLongEdge(Math.max(16, Number(event.target.value)))} />
            </Field>
            <Field label="File name" hint="{name}, {w} and {h} are replaced.">
              <TextInput value={pattern} onChange={(event) => setPattern(event.target.value)} />
            </Field>
            <Field label="If a name is already taken" hint="This page cannot overwrite a file on your disk. The names are previewed before any run.">
              <Select value={batch.onCollision} onChange={(event) => set({ onCollision: event.target.value as "counter" | "skip" })}>
                <option value="counter">Keep both: add a counter to the new file</option>
                <option value="skip">Skip the duplicate</option>
              </Select>
            </Field>
            {format === "jpeg" && <Notice tone="warning" title="JPEG has no alpha">Transparent areas are flattened onto white. Choose PNG or WebP to keep them.</Notice>}
            <Button variant="secondary" onClick={() => context.openOverlay("Preset editor")}>Name and store this preset</Button>
          </Stack>
        </Card>
        <Card span={6} title="Sample" subtitle="Run one job to check the settings before the whole queue">
          <Stack gap={3}>
            <Button
              variant="primary"
              busy={running}
              disabled={chosen.length === 0}
              onClick={() => void testSample(context)}
            >
              Test one sample
            </Button>
            {chosen.length === 0 && <p className="vx-mini">Choose images on the Queue tab first.</p>}
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Results" || lens === "Failed") {
    const rows = jobs.filter((job) => (lens === "Failed" ? job.state === "failed" : job.state === "done" || job.state === "skipped"));
    return (
      <Card
        title={lens === "Failed" ? "Jobs that failed" : "Files written"}
        subtitle={`${rows.length} of ${jobs.length}`}
        actions={lens === "Failed" && rows.length > 0 ? <Button size="sm" variant="secondary" busy={running} onClick={() => void execute(true)}>Retry the failures</Button> : undefined}
      >
        {rows.length === 0 ? (
          <Empty title={lens === "Failed" ? "Nothing failed" : "Nothing written yet"}>
            {lens === "Failed" ? "Every job that has run so far produced a file." : "Build a queue on the Queue tab and run it; each file downloads from this browser."}
          </Empty>
        ) : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label={lens}
            columns={[
              { key: "title", header: "Image", primary: true, cell: (row) => row.title, sortValue: (row) => row.title },
              { key: "out", header: "File", cell: (row) => row.outName ?? "—" },
              { key: "size", header: "Pixels", align: "end", cell: (row) => (row.width ? `${row.width} × ${row.height}` : "—") },
              { key: "bytes", header: "Bytes", align: "end", cell: (row) => (row.bytes ? `${(row.bytes / 1024).toFixed(0)} kB` : "—") },
              { key: "reason", header: "Note", cell: (row) => row.reason ?? "" },
            ]}
          />
        )}
      </Card>
    );
  }

  return <BatchQueue context={context} />;
}

function BatchQueue({ context }: { context: ScreenContext }) {
  const photos = useCollection("photos");
  const batch = useStore(batchUi);
  const plan = useBatchPlan();
  const { jobs, chosen, format, longEdge, pattern, running, done } = batch;
  const setChosen = (next: string[] | ((current: string[]) => string[])) => batchUi.set((current) => ({ ...current, chosen: typeof next === "function" ? next(current.chosen) : next }));
  const build = () => buildBatch(context, new Map(photos.map((row) => [row.id, row.title])));
  const queued = jobs.filter((job) => job.state === "queued").length;
  const clashes = (plan ?? []).filter((item) => item.collision);
  const planOf = new Map((plan ?? []).map((item) => [item.jobId, item]));
  return (
    <Grid>
      <Card span={6} title="Choose the images" subtitle={`${chosen.length} of ${photos.length} selected`} actions={<Row gap={1}><Button size="sm" variant="ghost" onClick={() => setChosen(photos.filter((row) => row.status !== "unreadable").map((row) => row.id))}>Select every readable image</Button><Button size="sm" variant="ghost" onClick={() => setChosen([])}>Clear</Button></Row>}>
        <DataGrid
          rows={photos}
          rowId={(row) => row.id}
          label="Images"
          onOpen={(id) => setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
          columns={[
            { key: "title", header: "Image", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => <Row gap={1} wrap><Pill tone={row.status === "unreadable" ? "danger" : "neutral"}>{row.status}</Pill>{chosen.includes(row.id) && <Pill tone="info" dot>In the batch</Pill>}</Row> },
            { key: "album", header: "Album", cell: (row) => String(row.fields.album ?? "Unfiled") },
            {
              key: "pick", header: "In the batch", align: "end", cell: (row) => (
                <span onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    label={chosen.includes(row.id) ? "Included" : "Include"}
                    aria-label={`Include ${row.title}`}
                    checked={chosen.includes(row.id)}
                    onChange={(event) => setChosen((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                  />
                </span>
              ),
            },
          ]}
        />
      </Card>
      <Card span={6} title="Queue" subtitle={jobs.length === 0 ? "Not built yet" : `${done} of ${jobs.length} finished`}>
        <Stack gap={3}>
          {jobs.length > 0 && <Meter value={done} max={jobs.length} label="Batch progress" />}
          <KeyValueList columns={2} items={[
            { label: "Format", value: format.toUpperCase(), mono: true },
            { label: "Longest edge", value: `${longEdge}px`, mono: true },
            { label: "Naming", value: pattern, mono: true },
            { label: "If a name is taken", value: batch.onCollision === "skip" ? "skip it" : "keep both, add a counter" },
          ]} />
          {jobs.length > 0 && (
            <div className="ph-plan" role="list" aria-label="Planned output files">
              {jobs.map((job) => {
                const item = planOf.get(job.id);
                const name = job.outName ?? item?.name;
                return (
                  <div key={job.id} role="listitem" className="ph-plan-row" data-collision={item?.collision && job.state === "queued" ? "true" : undefined}>
                    <span className="ph-plan-title ds-truncate">{job.title}</span>
                    <span className="ph-plan-name ds-num" title={name}>{name ?? "…"}</span>
                    {item?.collision && job.state === "queued"
                      ? <Pill tone="warning">name taken</Pill>
                      : <Pill tone={job.state === "done" ? "success" : job.state === "failed" ? "danger" : job.state === "running" ? "info" : "neutral"} dot>{job.state}</Pill>}
                  </div>
                );
              })}
            </div>
          )}
          {clashes.length > 0 && (
            <Notice tone="warning" title={`${clashes.length} output name${clashes.length === 1 ? " is" : "s are"} already taken`}>
              This page cannot replace a file on your disk, so nothing is overwritten. You choose, before the run, whether to keep both or skip the duplicate.
              <div><Button size="sm" variant="secondary" onClick={() => context.openOverlay("overwrite confirmation")}>Review the names</Button></div>
            </Notice>
          )}
          <Row gap={2} wrap>
            <Button variant="secondary" disabled={chosen.length === 0 || running} onClick={build}>{jobs.length ? "Rebuild the batch" : "Build the batch"}</Button>
            <Button variant="primary" busy={running} disabled={queued === 0} onClick={() => void requestRun(context)}>
              {clashes.length > 0 ? `Review names, then run ${queued}` : `Run ${queued} job${queued === 1 ? "" : "s"}`}
            </Button>
          </Row>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- PHOTO-007 ---------------------------- */

function ExportScreen({ context, lens }: { context: ScreenContext; lens: "Export" | "Presets" | "Publish" }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const settings = useStore(exportUi);
  const { format, quality, scale, keepAspect, busy, preview } = settings;
  const set = (patch: Partial<typeof settings>) => exportUi.set((current) => ({ ...current, ...patch }));
  const setFormat = (value: typeof format) => set({ format: value });
  const setQuality = (value: number) => set({ quality: value });
  const setScale = (value: number) => set({ scale: value });
  const setKeepAspect = (value: boolean) => set({ keepAspect: value });
  const setWidth = (value: number) => set({ width: value });
  const doc = handle.doc;
  const width = settings.width || doc?.width || 0;

  if (!record) return <MissingPhoto context={context} />;
  if (!doc) return <Empty title="Opening the image…" />;

  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(keepAspect ? (width * scale * doc.height) / doc.width : doc.height * scale));
  const hasAlpha = doc.layers.some((layer) => layer.kind === "pixel" && layer.visible);

  const makeFile = (download: boolean) => exportImage(context, download);

  if (lens === "Publish") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Uploading to an asset service is not connected">
          Nothing leaves this browser. The exported file downloads to this machine, and the image can be copied into the workspace asset library as a record instead.
        </Notice>
        <Card title="Copy into the asset library" subtitle="Creates an asset record in this workspace">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Source", value: record.title },
              { label: "Licence", value: doc.rights.license },
              { label: "Credit", value: doc.rights.credit },
            ]} />
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void addToAssetLibrary(context)}
            >
              Add a PNG to the asset library
            </Button>
            <Button variant="secondary" onClick={() => context.openOverlay("rights")}>Rights…</Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (lens === "Presets") {
    const presets: { name: string; format: "png" | "jpeg" | "webp"; width: number; quality: number; why: string }[] = [
      { name: "Web hero", format: "webp", width: 1920, quality: 0.78, why: "Large but light; WebP keeps transparency." },
      { name: "Email", format: "jpeg", width: 1200, quality: 0.75, why: "JPEG is the safest in mail clients. Transparency is flattened onto white." },
      { name: "Print proof", format: "png", width: doc.width, quality: 1, why: "Lossless at the document's own pixel size." },
      { name: "Thumbnail", format: "jpeg", width: 480, quality: 0.7, why: "Small enough for a list, honest about the quality drop." },
    ];
    return (
      <Grid>
        {presets.map((preset) => (
          <Card key={preset.name} span={6} title={preset.name} subtitle={`${preset.format.toUpperCase()} · ${preset.width}px wide`}>
            <Stack gap={2}>
              <p className="ds-subtle">{preset.why}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setFormat(preset.format);
                  setWidth(preset.width);
                  setScale(1);
                  setQuality(preset.quality);
                  context.setTab("Export");
                }}
              >
                Use this preset
              </Button>
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={5} title="Export" subtitle={`${doc.width} × ${doc.height} source`}>
        <Stack gap={3}>
          <Field label="Format">
            <Select value={format} onChange={(event) => setFormat(event.target.value as "png")}>
              <option value="png">PNG — lossless, keeps transparency</option>
              <option value="jpeg">JPEG — lossy, no transparency</option>
              <option value="webp">WebP — lossy, keeps transparency</option>
            </Select>
          </Field>
          {format !== "png" && <SliderBoxLocal label="Quality" value={Math.round(quality * 100)} min={5} max={100} onChange={(value) => setQuality(value / 100)} suffix="%" />}
          <Field label="Width"><TextInput type="number" value={width} onChange={(event) => setWidth(Math.max(1, Number(event.target.value)))} /></Field>
          <SliderBoxLocal label="Scale" value={scale * 100} min={10} max={400} onChange={(value) => setScale(value / 100)} suffix="%" />
          <Checkbox label="Keep the aspect ratio" checked={keepAspect} onChange={(event) => setKeepAspect(event.target.checked)} />
          <KeyValueList items={[
            { label: "Output", value: `${outWidth} × ${outHeight}`, mono: true },
            { label: "Aspect", value: keepAspect ? `kept at ${(doc.width / doc.height).toFixed(3)}` : `changed to ${(outWidth / outHeight).toFixed(3)}`, mono: true, tone: keepAspect ? undefined : "warning" },
            { label: "Transparency", value: format === "jpeg" ? "flattened onto white" : hasAlpha ? "kept" : "no transparent pixels", tone: format === "jpeg" ? "warning" : undefined },
            { label: "Profile", value: `${doc.profile} recorded; written as sRGB` },
            { label: "Licence", value: doc.rights.license, tone: doc.rights.license === "Unknown" ? "danger" : undefined },
          ]} />
          {!keepAspect && <Notice tone="warning" title="The aspect ratio will change">The output is {(outWidth / outHeight).toFixed(3)} against the source {(doc.width / doc.height).toFixed(3)}. The image will be stretched.</Notice>}
          <Row gap={2} wrap>
            <Button variant="primary" busy={busy} onClick={() => { if (exportChanges(doc, settings).length > 0) context.openOverlay("export check"); else void makeFile(true); }}>Export</Button>
            <Button variant="secondary" busy={busy} onClick={() => void makeFile(false)}>Preview the real file</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("profile handling")}>Profile…</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("rights")}>Rights…</Button>
          </Row>
        </Stack>
      </Card>
      <Card span={7} title="Preview" subtitle={preview ? `${preview.width} × ${preview.height}, ${(preview.bytes / 1024).toFixed(0)} kB — the encoded file, decoded back` : "Press Preview to encode the real file"}>
        {preview ? (
          <Stack gap={2}>
            <img src={preview.src} alt={`Export preview of ${record.title}`} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border-default)" }} className="vx-checker" />
            <Properties rows={[
              { label: "Bytes", value: preview.bytes.toLocaleString() },
              { label: "Bytes per pixel", value: (preview.bytes / (preview.width * preview.height)).toFixed(2) },
            ]} />
          </Stack>
        ) : (
          <div style={{ position: "relative", height: 360 }}>
            <PhotoCanvas handle={handle} bank={bank} showSelectionOverlay={false} />
          </div>
        )}
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function BulkImport({ context, close }: { context: ScreenContext; close: () => void }) {
  const [results, setResults] = useState<{ name: string; state: "ok" | "rejected"; note: string }[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={3}>
      <Field label="Images" hint="Decoded in this browser; nothing is uploaded. PNG, JPEG, WebP, GIF, AVIF and BMP are decoded. Anything else is reported rather than dropped.">
        <input
          type="file"
          multiple
          accept="image/*"
          aria-label="Choose images"
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            setBusy(true);
            try {
              const report: { name: string; state: "ok" | "rejected"; note: string }[] = [];
              for (const file of files) {
                const reason = unsupportedReason(file);
                if (reason) {
                  await context.mutate.create({
                    collection: "photos", title: file.name, status: "unreadable",
                    summary: reason, fields: { kind: "image", bytes: file.size, license: "Unknown" },
                  }, `${file.name} could not be imported`);
                  report.push({ name: file.name, state: "rejected", note: reason });
                  continue;
                }
                try {
                  const src = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error("The file could not be read."));
                    reader.readAsDataURL(file);
                  });
                  const image = await loadImage(src);
                  const doc: RasterDoc = {
                    version: 2,
                    width: image.naturalWidth, height: image.naturalHeight,
                    layers: [{
                      id: "layer-base", name: file.name, kind: "pixel",
                      visible: true, locked: false, opacity: 1, blend: "normal",
                      src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
                      x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight, rotation: 0,
                    }],
                    activeLayerId: "layer-base",
                    presets: [],
                    profile: "sRGB IEC61966-2.1",
                    rights: { license: "Unknown", credit: "not recorded" },
                    origin: `Imported from ${file.name} in this browser.`,
                    history: [],
                  };
                  await context.mutate.create({
                    collection: "photos", title: file.name, status: "imported",
                    summary: `${image.naturalWidth} × ${image.naturalHeight}, ${(file.size / 1024).toFixed(0)} kB.`,
                    body: doc,
                    fields: { kind: "image", width: image.naturalWidth, height: image.naturalHeight, bytes: file.size, license: "Unknown", importedAt: clockIso() },
                  }, `Imported ${file.name}`);
                  report.push({ name: file.name, state: "ok", note: `${image.naturalWidth} × ${image.naturalHeight}` });
                } catch (error) {
                  await context.mutate.create({
                    collection: "photos", title: file.name, status: "unreadable",
                    summary: error instanceof Error ? error.message : "The browser could not decode this file.",
                    fields: { kind: "image", bytes: file.size, license: "Unknown" },
                  }, `${file.name} could not be decoded`);
                  report.push({ name: file.name, state: "rejected", note: "The browser could not decode it." });
                }
              }
              setResults(report);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {busy && <p className="ds-subtle">Decoding…</p>}
      {results.length > 0 && (
        <Stack gap={2}>
          {results.map((item) => (
            <Row key={item.name} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
              <span className="ds-grow">{item.name}</span>
              <Pill tone={item.state === "ok" ? "success" : "danger"}>{item.state === "ok" ? item.note : "rejected"}</Pill>
            </Row>
          ))}
          <Notice tone={results.some((item) => item.state === "rejected") ? "warning" : "success"} title={`${results.filter((item) => item.state === "ok").length} imported, ${results.filter((item) => item.state === "rejected").length} rejected`}>
            A rejected file is still kept as a record with the reason, so the library never loses track of it. Every import starts with its licence marked Unknown.
          </Notice>
        </Stack>
      )}
      <ModalActions>
        <OverlayActions
          primary={results.length > 0 ? <Button variant="primary" onClick={close}>Done</Button> : undefined}
          end={<OverlayCancel disabled={busy}>{results.length > 0 ? "Close" : "Cancel"}</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

function AssetDetail({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  if (!record) return <Notice tone="info" title="Select an image first">Pick an image in the library, then open its details.</Notice>;
  const doc = parsePhoto(record.body);
  return (
    <Stack gap={3}>
      <PhotoPreview record={record.id} doc={doc} height={200} />
      <FactGrid columns={3} items={[
        { label: "Pixels", value: `${doc.width} × ${doc.height}`, mono: true },
        { label: "Layers", value: doc.layers.length, mono: true, hint: `${doc.layers.filter((layer) => layer.kind === "adjustment").length} adjustment · ${doc.layers.filter((layer) => layer.mask).length} masked` },
        { label: "Profile", value: doc.profile },
      ]} />
      <OverlaySection title="Source" hint="Where the pixels came from">
        <p className="ds-prose">{doc.origin}</p>
        <KeyValueList items={[
          { label: "Owner", value: record.ownerName },
          { label: "Updated", value: context.dateTime(record.updatedAt) },
        ]} />
      </OverlaySection>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" onClick={() => context.navigate(context.path("/o/:org/photo/photos/:id", record.id))}>Open in the editor</Button>}
          secondary={<Button variant="secondary" onClick={() => context.openOverlay("license", { id: record.id })}>Rights</Button>}
        />
      </DrawerActions>
    </Stack>
  );
}

/** Identity block shared by the image drawers: a thumbnail, the title, the licence and the size. */
function PhotoSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!record) return null;
  const doc = parsePhoto(record.body);
  const licence = String(record.fields.license ?? doc.rights.license);
  return (
    <OverlaySummary
      eyebrow="Image"
      title={record.title}
      avatar={<div className="ph-summary-thumb"><PhotoPreview record={record.id} doc={doc} height={48} /></div>}
      status={<Pill tone={licence === "Unknown" ? "danger" : "neutral"}>{licence}</Pill>}
      meta={[<span className="ds-num" key="px">{doc.width} × {doc.height}</span>, `${doc.layers.length} layer${doc.layers.length === 1 ? "" : "s"}`, record.status]}
    />
  );
}

function LicencePanel({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const [credit, setCredit] = useState("");
  if (!record) return <Notice tone="info" title="Select an image first">Pick an image in the library, then open its rights.</Notice>;
  const licence = String(record.fields.license ?? "Unknown");
  const saved = String(record.fields.credit ?? "not recorded");
  return (
    <Stack gap={3}>
      {licence === "Unknown" && <Notice tone="danger" title="Do not publish this image">Its licence is unknown. Record where it came from before it is used anywhere.</Notice>}
      <OverlaySection title="Licence" hint="Saved on the record as soon as you change it">
        <Select
          aria-label="Licence"
          value={licence}
          onChange={async (event) => {
            const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, license: event.target.value } }, { expectRevision: record.revision, event: `Licence set on ${record.title}` });
            if (!saved) context.toast("Licence not saved", "The record changed or could not be written. Reopen it and try again.", "failed");
          }}
        >
          {LICENCES.map((option) => <option key={option}>{option}</option>)}
        </Select>
      </OverlaySection>
      <OverlaySection title="Credit" hint={`Now: ${saved}`}>
        <TextInput aria-label="Credit" value={credit} placeholder={saved} onChange={(event) => setCredit(event.target.value)} />
      </OverlaySection>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={!credit.trim()} onClick={async () => {
            const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, credit: credit.trim() } }, { expectRevision: record.revision, event: `Credit recorded on ${record.title}` });
            if (saved) { setCredit(""); context.toast("Credit saved", `${record.title}: ${credit.trim()}`); }
            else context.toast("Credit not saved", "The record changed or could not be written. Your text is kept; try again.", "failed");
          }}>Save the credit</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function ToolOptions({ context: _context }: { context: ScreenContext }) {
  const ui = useStore(photoUi);
  return (
    <Stack gap={3}>
      <OverlaySection title="Brush">
        <SliderBoxLocal label="Size" value={ui.brush.size} min={1} max={400} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, size: value } }))} suffix="px" />
        <SliderBoxLocal label="Softness" value={Math.round(ui.brush.softness * 100)} min={0} max={100} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, softness: value / 100 } }))} suffix="%" />
        <SliderBoxLocal label="Opacity" value={Math.round(ui.brush.opacity * 100)} min={1} max={100} onChange={(value) => photoUi.set((c) => ({ ...c, brush: { ...c.brush, opacity: value / 100 } }))} suffix="%" />
      </OverlaySection>
      <OverlaySection title="Clone" tone="warning">
        Choosing Clone paints with the brush. Sampling from one place and stamping it in another is not implemented, and the tool does not pretend otherwise.
      </OverlaySection>
      <OverlaySection title="Keys" flush>
        <ShortcutTable
          rows={[
            { keys: "B / E", does: "Brush and eraser" },
            { keys: "[ and ]", does: "Smaller and larger brush" },
            { keys: "I", does: "Pick a colour from the canvas" },
            { keys: "M / N / L", does: "Rectangular, elliptical and lasso selection" },
            { keys: "C", does: "Crop" },
            { keys: "Arrows", does: "Move the active layer, Shift for ten pixels" },
            { keys: "⌘Z / ⇧⌘Z", does: "Undo and redo" },
            { keys: "⌘D", does: "Deselect" },
            { keys: "⌘I", does: "Invert the selection" },
            { keys: "0", does: "Reset the zoom" },
          ]}
        />
      </OverlaySection>
    </Stack>
  );
}

function CanvasSize({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const doc = handle.doc;
  useEffect(() => { if (doc && width === 0) { setWidth(doc.width); setHeight(doc.height); } }, [doc, width]);
  if (!record || !doc) return <Empty title="Open an image first" />;
  const smaller = width < doc.width || height < doc.height;
  return (
    <form
      id="photo-canvas-size"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => ({ ...current, width, height }), "Change the canvas size");
        context.toast("Canvas resized", `Now ${width} × ${height}. Layer pixels were not touched.`);
        close();
      }}
    >
      <FactGrid columns={2} dense items={[
        { label: "Now", value: `${doc.width} × ${doc.height}`, mono: true },
        { label: "After", value: `${width} × ${height}`, mono: true, tone: smaller ? "warning" : undefined },
      ]} />
      <Row gap={2}>
        <Field label="Width"><TextInput type="number" min={1} value={width} onChange={(event) => setWidth(Math.max(1, Number(event.target.value)))} /></Field>
        <Field label="Height"><TextInput type="number" min={1} value={height} onChange={(event) => setHeight(Math.max(1, Number(event.target.value)))} /></Field>
      </Row>
      <p className="vx-mini">{smaller ? "Smaller: what falls outside the canvas is hidden, not deleted. Undo restores the size." : "Layers keep their own pixels and position; only the canvas changes."}</p>
    </form>
  );
}

function AdjustmentLayerPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const presets: { name: string; adjust: Partial<Adjust>; what: string }[] = [
    { name: "Exposure", adjust: { exposure: 0.3 }, what: "+0.3 stop" },
    { name: "Contrast", adjust: { contrast: 18 }, what: "+18" },
    { name: "Saturation", adjust: { saturation: 15 }, what: "+15" },
    { name: "Temperature", adjust: { temperature: 18 }, what: "warmer" },
    { name: "Curves", adjust: { curve: [{ x: 0, y: 8 }, { x: 128, y: 138 }, { x: 255, y: 250 }] }, what: "soft lift" },
    { name: "Black and white", adjust: { saturation: -100, contrast: 12 }, what: "desaturated" },
  ];
  return (
    <Stack gap={3}>
      <p className="ds-prose">An adjustment layer rewrites what is composited below it; the pixels on the layers themselves are never changed, and it can be switched off at any time.</p>
      <div className="ph-picker-grid">
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="ph-picker-item"
            onClick={() => {
              handle.edit((current) => addLayer(current, newAdjustmentLayer(`adj-${wallMs().toString(36)}`, preset.name, preset.adjust)), `Add a ${preset.name.toLowerCase()} layer`);
              context.toast("Adjustment added", `${preset.name} sits above the stack and can be turned off at any time.`);
              close();
            }}
          >
            <strong>{preset.name}</strong>
            <span className="vx-mini">{preset.what}</span>
          </button>
        ))}
      </div>
    </Stack>
  );
}

function SelectionOptions({ context }: { context: ScreenContext }) {
  const { record, handle } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <OverlaySection title="Current selection">
        {doc.selection ? (
          <FactGrid columns={2} dense items={[
            { label: "Kind", value: doc.selection.kind },
            { label: "Feather", value: `${doc.selection.feather}px`, mono: true },
            { label: "Inverted", value: doc.selection.inverted ? "yes" : "no" },
            { label: "Outline points", value: doc.selection.points?.length ?? "none", mono: true },
          ]} />
        ) : <p className="ds-subtle">Nothing is selected.</p>}
      </OverlaySection>
      <OverlaySection title="Change it" hint="A selection survives a crop: it is carried through the same translation and rotation.">
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" disabled={!doc.selection} onClick={() => handle.edit((current) => ({ ...current, selection: current.selection ? { ...current.selection, inverted: !current.selection.inverted } : undefined }), "Invert the selection")}>Invert</Button>
          <Button size="sm" variant="secondary" disabled={!doc.selection} onClick={() => handle.edit((current) => ({ ...current, selection: undefined }), "Clear the selection")}>Deselect</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handle.edit((current) => ({ ...current, selection: { kind: "rect", rect: { x: 0, y: 0, w: current.width, h: current.height }, feather: 0, inverted: false } }), "Select everything")}
          >
            Select everything
          </Button>
        </Row>
      </OverlaySection>
    </Stack>
  );
}

function QuickMask({ context }: { context: ScreenContext }) {
  const { record, handle, bank } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  const layer = layerById(doc, doc.activeLayerId);
  return (
    <Stack gap={3}>
      <p className="ds-prose">Paint black to hide, white to show. The mask is a real greyscale image stored on <strong>{layer?.name ?? "the layer"}</strong>.</p>
      <Row gap={2} wrap>
        <Button
          size="sm"
          variant="secondary"
          disabled={!layer}
          onClick={() => {
            const canvas = makeCanvas(doc.width, doc.height);
            const ctx = context2d(canvas);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, doc.width, doc.height);
            handle.edit((current) => patchLayer(current, layer!.id, { mask: canvas.toDataURL("image/png"), maskEnabled: true, maskFrame: frameOf(layerById(current, layer!.id) ?? layer!) }), "Add a mask");
            bumpPixels();
          }}
        >
          Add a white mask
        </Button>
        <Button size="sm" variant="ghost" disabled={!layer?.mask} aria-pressed={Boolean(layer?.maskEnabled)} onClick={() => handle.edit((current) => patchLayer(current, layer!.id, { maskEnabled: !layer!.maskEnabled }), "Toggle the mask")}>{layer?.maskEnabled ? "Mask on" : "Mask off"}</Button>
        {!layer?.mask && <span className="vx-mini">This layer has no mask yet.</span>}
      </Row>
      <Grid>
        {layer?.mask && <Card span={4} title="Mask" pad="tight"><img src={layer.mask} alt={`Mask on ${layer.name}`} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border-default)" }} /></Card>}
        <Card span={layer?.mask ? 8 : 12} title="Paint the mask" pad="tight"><div style={{ position: "relative", height: 240 }}><PhotoCanvas handle={handle} bank={bank} paintTarget="mask" /></div></Card>
      </Grid>
    </Stack>
  );
}

function HistogramOverlay({ context }: { context: ScreenContext }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const data = useHistogram(handle.doc, bank);
  const before = useHistogram(handle.doc, bank, { bypassAdjustments: true });
  if (!record) return <Empty title="Open an image first" />;
  return (
    <Stack gap={3}>
      <OverlaySection title="After adjustments"><HistogramView data={data} height={110} /></OverlaySection>
      <OverlaySection title="Before adjustments"><HistogramView data={before} height={110} /></OverlaySection>
      {data && data.clippedWhite / Math.max(1, data.counted) > 0.02 && (
        <Notice tone="warning" title="Highlights are clipping">{((data.clippedWhite / data.counted) * 100).toFixed(1)}% of the pixels are at or near pure white. Pull the exposure or the highlights down to recover them.</Notice>
      )}
      {data && data.clippedBlack / Math.max(1, data.counted) > 0.02 && (
        <Notice tone="warning" title="Shadows are clipping">{((data.clippedBlack / data.counted) * 100).toFixed(1)}% of the pixels are at or near pure black.</Notice>
      )}
    </Stack>
  );
}

function ColourPicker({ context }: { context: ScreenContext }) {
  const ui = useStore(photoUi);
  const { record, handle, bank } = usePhotoDoc(context);
  if (!record) return <Empty title="Open an image first" />;
  return (
    <Stack gap={3}>
      <Row gap={3}>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: ui.brush.color, border: "1px solid var(--border-default)", flex: "none" }} />
        <KeyValueList items={[{ label: "Brush colour", value: ui.brush.color, mono: true }]} />
        <Button size="sm" variant="secondary" onClick={() => setPhotoTool("eyedropper")}>Use the eyedropper</Button>
      </Row>
      <p className="vx-mini">Click the image to sample a pixel. The value is read from the composited canvas, so it is the colour you can actually see.</p>
      <div style={{ position: "relative", height: 260 }}><PhotoCanvas handle={handle} bank={bank} showSelectionOverlay={false} /></div>
    </Stack>
  );
}

function ProfileWarning({ context }: { context: ScreenContext }) {
  const { record, handle } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Colour management is not implemented">
        This editor works in the browser's canvas, which is sRGB. A document can record a different profile so a later converter knows what was intended, but no conversion happens here and every file exported is sRGB.
      </Notice>
      <FactGrid columns={3} dense items={[
        { label: "Document profile", value: handle.doc.profile },
        { label: "Working space", value: "sRGB (canvas)" },
        { label: "Export profile", value: "sRGB, untagged" },
      ]} />
      <Field label="Record a different intended profile">
        <Select value={handle.doc.profile} onChange={(event) => handle.edit((current) => ({ ...current, profile: event.target.value }), "Change the colour profile")}>
          {["sRGB IEC61966-2.1", "Display P3", "Adobe RGB (1998)", "ProPhoto RGB"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
    </Stack>
  );
}

function BlendPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle, bank } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  const layer = layerById(doc, doc.activeLayerId);
  if (!layer) return <Empty title="Select a layer" />;
  return (
    <Stack gap={3}>
      <p className="ds-prose">Each preview is the real composite with that mode applied to <strong>{layer.name}</strong>. Now: <strong>{layer.blend}</strong>.</p>
      <Grid>
        {["normal", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "difference", "luminosity"].map((mode) => (
          <Card key={mode} span={4} pad="tight">
            <BlendPreview doc={doc} bank={bank} layerId={layer.id} mode={mode as PhotoLayer["blend"]} />
            <Button
              size="sm"
              variant={layer.blend === mode ? "primary" : "ghost"}
              aria-pressed={layer.blend === mode}
              onClick={() => { handle.edit((current) => patchLayer(current, layer.id, { blend: mode as PhotoLayer["blend"] }), "Change the blend mode"); close(); }}
            >
              {mode}
            </Button>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

function LinkedObject({ context }: { context: ScreenContext }) {
  const { record, handle } = usePhotoDoc(context);
  const assets = useCollection("assets");
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <p className="ds-prose">The asset's pixels are copied into a new layer. There is no live link back to the asset record; its licence is shown so it can be checked.</p>
      {assets.length === 0 ? <Empty title="No assets in this workspace" /> : (
        <Stack gap={2}>
          {assets.slice(0, 8).map((asset) => {
            const body = asset.body as { src?: string; width?: number; height?: number } | undefined;
            const licence = String(asset.fields.license ?? "not recorded");
            return (
              <Row key={asset.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <span className="ds-grow ds-truncate">{asset.title}</span>
                {body?.width && <span className="ds-num">{body.width} × {body.height}</span>}
                <Pill tone={licence === "Unknown" || licence === "not recorded" ? "warning" : "neutral"}>{licence}</Pill>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!body?.src}
                  onClick={() => {
                    handle.edit((current) => addLayer(current, {
                      id: `layer-${wallMs().toString(36)}`, name: asset.title, kind: "pixel",
                      visible: true, locked: false, opacity: 1, blend: "normal",
                      src: body!.src, naturalWidth: body?.width, naturalHeight: body?.height,
                      x: 0, y: 0, w: body?.width ?? current.width, h: body?.height ?? current.height, rotation: 0,
                    }), `Place ${asset.title}`);
                    context.toast("Placed", `${asset.title} is a new layer. Its licence is ${licence}.`);
                  }}
                >
                  Place
                </Button>
              </Row>
            );
          })}
        </Stack>
      )}
      <p className="vx-mini">{doc.layers.length} layer{doc.layers.length === 1 ? "" : "s"} now.</p>
    </Stack>
  );
}

/* ====================================================================== *
 * Registration
 * ====================================================================== */

async function withPhoto(context: ScreenContext, change: (doc: RasterDoc) => RasterDoc, event: string): Promise<void> {
  await editShared<RasterDoc>(context, parsePhoto, change, event);
}

function openPhoto(context: ScreenContext): RasterDoc | undefined {
  return sharedHandle<RasterDoc>(context.params.id)?.doc ?? undefined;
}

const needsImage = (context: ScreenContext) => (context.params.id ? undefined : "Open an image first");

function activeLayerGuard(context: ScreenContext, kind?: PhotoLayer["kind"]): string | undefined {
  const doc = openPhoto(context);
  if (!doc) return "Open an image first";
  const layer = layerById(doc, doc.activeLayerId);
  if (!layer) return "Choose a layer first";
  if (layer.locked) return `${layer.name} is locked`;
  if (kind && layer.kind !== kind) return `${layer.name} is not a ${kind} layer`;
  return undefined;
}

/** Fill the selection on the active pixel layer with the brush colour, in real pixels. */
async function fillSelection(context: ScreenContext): Promise<void> {
  const doc = openPhoto(context) ?? await readShared<RasterDoc>(context, parsePhoto);
  if (!doc?.selection) return;
  const layer = layerById(doc, doc.activeLayerId);
  if (!layer || layer.kind !== "pixel") return;
  const canvas = makeCanvas(doc.width, doc.height);
  const ctx = context2d(canvas);
  if (layer.src) ctx.drawImage(await loadImage(layer.src), 0, 0, doc.width, doc.height);
  const selection = doc.selection;
  const brush = photoUi.get().brush;
  ctx.save();
  ctx.beginPath();
  if (selection.inverted) ctx.rect(0, 0, doc.width, doc.height);
  if ((selection.kind === "rect" || selection.kind === "ellipse") && selection.rect) {
    const rect = selection.rect;
    if (selection.kind === "rect") ctx.rect(rect.x, rect.y, rect.w, rect.h);
    else ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.abs(rect.w / 2), Math.abs(rect.h / 2), 0, 0, Math.PI * 2);
  } else if (selection.points && selection.points.length > 2) {
    selection.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
  }
  if (selection.feather > 0) ctx.filter = `blur(${selection.feather}px)`;
  ctx.globalAlpha = brush.opacity;
  ctx.fillStyle = brush.color;
  ctx.fill(selection.inverted ? "evenodd" : "nonzero");
  ctx.restore();
  const src = canvas.toDataURL("image/png");
  await withPhoto(context, (current) => patchLayer(current, layer.id, { src, naturalWidth: doc.width, naturalHeight: doc.height, w: layer.w || doc.width, h: layer.h || doc.height }), `Paint the selection on ${layer.name}`);
  bumpPixels();
}

const EDITOR_ACTIONS: ActionDef[] = [
  {
    id: "Crop", label: "Crop", placement: "primary",
    guard: needsImage,
    run: async (context) => {
      const draft = photoUi.get().cropDraft;
      if (!draft || draft.rect.w < 4 || draft.rect.h < 4) {
        setPhotoTool("crop");
        context.toast("Set the crop first", "Drag on the canvas to set the crop, then press Crop again to apply it.", "info");
        return;
      }
      const doc = openPhoto(context) ?? await readShared<RasterDoc>(context, parsePhoto);
      if (!doc) return;
      const baked = await bakeCrop(doc, draft.rect, draft.angle);
      await withPhoto(context, () => baked, `Crop to ${Math.round(draft.rect.w)} × ${Math.round(draft.rect.h)}`);
      photoUi.set((current) => ({ ...current, cropDraft: undefined, tool: "move" }));
      bumpPixels();
      context.toast("Cropped", `The pixels were rewritten to ${Math.round(draft.rect.w)} × ${Math.round(draft.rect.h)}. Undo restores the previous pixels, and the record keeps the earlier version as a snapshot.`);
    },
  },
  { id: "brush", label: "Brush (B)", placement: "toolbar", run: () => setPhotoTool("brush") },
  {
    id: "clone", label: "Clone stamp…", placement: "overflow",
    guard: (context) => activeLayerGuard(context, "pixel"),
    run: (context) => { setPhotoTool("clone"); context.openOverlay("clone source"); },
  },
  {
    id: "transform", label: "Transform: rotate the layer 90°", placement: "overflow",
    guard: (context) => activeLayerGuard(context),
    run: (context) => withPhoto(context, (doc) => patchLayer(doc, doc.activeLayerId, { rotation: ((layerById(doc, doc.activeLayerId)?.rotation ?? 0) + 90) % 360 }), "Rotate the layer by 90 degrees"),
  },
  {
    id: "paint", label: "Paint the selection with the brush colour", placement: "overflow",
    guard: (context) => activeLayerGuard(context, "pixel") ?? (openPhoto(context)?.selection ? undefined : "Make a selection first"),
    run: (context) => fillSelection(context),
  },
  { id: "eraser", label: "Eraser (E)", placement: "overflow", run: () => setPhotoTool("eraser") },
  {
    id: "undo", label: "Undo", placement: "secondary", shortcut: "⌘Z",
    guard: (context) => (canUndoShared(context) ? undefined : "Nothing to undo yet"),
    run: (context) => { if (undoShared(context)) bumpPixels(); },
  },
];

const MASK_ACTIONS: ActionDef[] = [
  { id: "Lasso", label: "Lasso (L)", placement: "primary", run: () => setPhotoTool("lasso") },
  {
    id: "select subject", label: "Select the subject", placement: "secondary",
    guard: () => "No model is connected, so a subject cannot be found for you",
    run: (context) => context.openOverlay("Selection options"),
  },
  {
    id: "refine edge", label: "Refine the edge…", placement: "secondary",
    guard: (context) => (openPhoto(context)?.selection ? undefined : "Make a selection first"),
    run: (context) => context.openOverlay("refinement"),
  },
  {
    id: "invert", label: "Invert", placement: "overflow",
    guard: (context) => (openPhoto(context)?.selection ? undefined : "Make a selection first"),
    run: (context) => withPhoto(context, (doc) => ({ ...doc, selection: doc.selection ? { ...doc.selection, inverted: !doc.selection.inverted } : undefined }), "Invert the selection"),
  },
  { id: "mask", label: "Quick mask", placement: "overflow", run: (context) => context.openOverlay("quick mask") },
];

/* --------------------------- action overlays --------------------------- */

function CloneSource({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  const ui = useStore(photoUi);
  const [x, setX] = useState(String(Math.round(ui.cloneSource?.x ?? 0)));
  const [y, setY] = useState(String(Math.round(ui.cloneSource?.y ?? 0)));
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  return (
    <form
      id="photo-clone-source"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const point = { x: Math.max(0, Math.min(doc.width, Number(x))), y: Math.max(0, Math.min(doc.height, Number(y))) };
        photoUi.set((current) => ({ ...current, cloneSource: point, tool: "clone" }));
        close();
      }}
    >
      <p className="ds-prose">Alt-click on the canvas sets the source, or type it here. The stamp keeps the distance between source and stroke for the whole stroke.</p>
      <Row gap={3} wrap>
        <Field label="Source x (px)"><TextInput type="number" value={x} onChange={(event) => setX(event.target.value)} autoFocus /></Field>
        <Field label="Source y (px)"><TextInput type="number" value={y} onChange={(event) => setY(event.target.value)} /></Field>
      </Row>
      <FactGrid columns={2} dense items={[{ label: "Image", value: `${doc.width} × ${doc.height}`, mono: true }, { label: "Brush size", value: `${ui.brush.size}px`, mono: true }]} />
      {!ui.cloneSource && <p className="vx-mini">No source set yet: without one, the stamp samples 60px to the right of where a stroke starts.</p>}
    </form>
  );
}

function RefineEdge({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  const selection = handle.doc?.selection;
  const [feather, setFeather] = useState(selection?.feather ?? 0);
  const [grow, setGrow] = useState(0);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  if (!selection) return <Notice tone="info" title="Nothing is selected">Make a selection with a marquee or the lasso first.</Notice>;
  const canGrow = Boolean(selection.rect) || Boolean(selection.points);
  return (
    <form
      id="photo-refine"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => {
          const sel = current.selection;
          if (!sel) return current;
          let next = { ...sel, feather: Math.max(0, feather) };
          if (grow !== 0 && sel.rect) next = { ...next, rect: { x: sel.rect.x - grow, y: sel.rect.y - grow, w: Math.max(1, sel.rect.w + grow * 2), h: Math.max(1, sel.rect.h + grow * 2) } };
          if (grow !== 0 && sel.points && sel.points.length > 2) {
            const cx = sel.points.reduce((sum, point) => sum + point.x, 0) / sel.points.length;
            const cy = sel.points.reduce((sum, point) => sum + point.y, 0) / sel.points.length;
            next = { ...next, points: sel.points.map((point) => { const d = Math.hypot(point.x - cx, point.y - cy) || 1; return { x: point.x + ((point.x - cx) / d) * grow, y: point.y + ((point.y - cy) / d) * grow }; }) };
          }
          return { ...current, selection: next };
        }, `Refine the edge: feather ${feather}px${grow ? `, ${grow > 0 ? "grow" : "shrink"} ${Math.abs(grow)}px` : ""}`);
        close();
      }}
    >
      <SliderBoxLocal label="Feather" value={feather} min={0} max={80} onChange={setFeather} suffix="px" />
      <SliderBoxLocal label="Grow or shrink" value={grow} min={-40} max={40} onChange={setGrow} suffix="px" />
      <p className="vx-mini">{canGrow ? "Feather softens the mask and fill a selection makes; growing moves the outline outwards from its centre." : "This selection has no outline to grow."}</p>
    </form>
  );
}

function TagImage({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.selectedId);
  const [text, setText] = useState(record?.tags.join(", ") ?? "");
  if (!record) return <Empty title="Select an image first" />;
  return (
    <form
      id="photo-tag"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const tags = [...new Set(text.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
        if (!(await context.mutate.patch(record.id, { tags }, { expectRevision: record.revision, event: `Tagged ${record.title}: ${tags.join(", ") || "no tags"}` }))) return;
        close();
      }}
    >
      <Field label="Tags" hint="Separate tags with commas."><TextInput value={text} onChange={(event) => setText(event.target.value)} autoFocus placeholder="review, catalogue, spring" /></Field>
    </form>
  );
}

function SelectImage({ context, close }: { context: ScreenContext; close: () => void }) {
  const photos = useCollection("photos");
  const [query, setQuery] = useState("");
  const rows = photos.filter((record) => record.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30);
  return (
    <Stack gap={3}>
      <Field label="Find an image"><TextInput value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Type part of a title" /></Field>
      {rows.length === 0 ? <Empty title="No image matches" /> : (
        <Stack gap={1}>
          {rows.map((record) => (
            <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
              <span className="ds-grow ds-truncate">{record.title}</span>
              {record.id === context.selectedId && <Pill tone="info">selected</Pill>}
              <Button size="sm" variant="secondary" onClick={() => { context.select(record.id); close(); }}>Select</Button>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CompareImages({ context }: { context: ScreenContext }) {
  const photos = useCollection("photos");
  const first = useRecord(context.selectedId);
  const [otherId, setOtherId] = useState(photos.find((record) => record.id !== context.selectedId)?.id ?? "");
  const other = photos.find((record) => record.id === otherId);
  if (!first) return <Empty title="Select an image first" />;
  const a = parsePhoto(first.body);
  const b = other ? parsePhoto(other.body) : undefined;
  const facts = (doc: RasterDoc) => [
    { label: "Pixels", value: `${doc.width} × ${doc.height}`, mono: true },
    { label: "Aspect", value: (doc.width / doc.height).toFixed(3), mono: true },
    { label: "Layers", value: `${doc.layers.length} · ${doc.layers.filter((layer) => layer.kind === "adjustment").length} adjustment`, mono: true },
    { label: "Licence", value: doc.rights.license, tone: doc.rights.license === "Unknown" ? ("danger" as const) : undefined },
  ];
  return (
    <Stack gap={3}>
      <Field label="Compare with">
        <Select value={otherId} onChange={(event) => setOtherId(event.target.value)}>
          {photos.filter((record) => record.id !== first.id).map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
        </Select>
      </Field>
      <Grid>
        <Card span={6} title={first.title} pad="tight"><Stack gap={2}><PhotoPreview record={first.id} doc={a} height={180} /><KeyValueList items={facts(a)} /></Stack></Card>
        <Card span={6} title={other?.title ?? "Nothing to compare"} pad="tight">{b && other ? <Stack gap={2}><PhotoPreview record={other.id} doc={b} height={180} /><KeyValueList items={facts(b)} /></Stack> : <Empty title="Only one image in the library" />}</Card>
      </Grid>
    </Stack>
  );
}

function ReplaceLayer({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  const assets = useCollection("assets");
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  const layer = layerById(doc, doc.activeLayerId);
  if (!layer || layer.kind !== "pixel") return <Notice tone="info" title="Choose a pixel layer">Replacing swaps the pixels of the active pixel layer for an asset's, keeping its name, position, blend, opacity and mask.</Notice>;
  const usable = assets.filter((asset) => (asset.body as { src?: string } | undefined)?.src);
  return (
    <Stack gap={3}>
      <FactGrid columns={3} dense items={[{ label: "Layer", value: layer.name }, { label: "Blend", value: layer.blend }, { label: "Opacity", value: `${Math.round(layer.opacity * 100)}%`, mono: true }]} />
      <OverlaySection title="Replace with" hint="Undo restores the previous pixels; the record also keeps the earlier version as a snapshot.">
        {usable.length === 0 ? <Empty title="No asset with pixels in this workspace" /> : usable.slice(0, 12).map((asset) => {
          const body = asset.body as { src: string; width?: number; height?: number };
          return (
            <Row key={asset.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
              <span className="ds-grow ds-truncate">{asset.title}</span>
              {body.width && <span className="ds-num">{body.width} × {body.height}</span>}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  handle.edit((current) => patchLayer(current, layer.id, { src: body.src, naturalWidth: body.width, naturalHeight: body.height }), `Replace ${layer.name} with ${asset.title}`);
                  void context.mutate.log(`Replaced the pixels of ${layer.name} with ${asset.title} (licence ${String(asset.fields.license ?? "not recorded")})`, { entityId: record.id, type: "update" });
                  bumpPixels();
                  close();
                }}
              >
                Replace with this
              </Button>
            </Row>
          );
        })}
      </OverlaySection>
    </Stack>
  );
}

function FormatOverlay({ close }: { close: () => void }) {
  const settings = useStore(exportUi);
  return (
    <Stack gap={3}>
      <Field label="Format">
        <Select value={settings.format} onChange={(event) => exportUi.set((current) => ({ ...current, format: event.target.value as "png" }))}>
          <option value="png">PNG — lossless, keeps transparency</option>
          <option value="jpeg">JPEG — lossy, no transparency</option>
          <option value="webp">WebP — lossy, keeps transparency</option>
        </Select>
      </Field>
      {settings.format !== "png" && <SliderBoxLocal label="Quality" value={Math.round(settings.quality * 100)} min={5} max={100} onChange={(value) => exportUi.set((current) => ({ ...current, quality: value / 100 }))} suffix="%" />}
      {settings.format === "jpeg" && <Notice tone="warning" title="JPEG drops transparency">Transparent pixels are composited onto white. Choose PNG or WebP to keep them.</Notice>}
      <ModalActions><OverlayActions primary={<Button variant="primary" onClick={close}>Use this format</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function ExportCheck({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePhotoDoc(context);
  const settings = useStore(exportUi);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  const { width, height } = outputSize(doc, settings);
  const changes = exportChanges(doc, settings);
  return (
    <Stack gap={3}>
      <OverlaySection title="This export changes the picture" tone="warning">
        <ul className="ds-list">{changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </OverlaySection>
      <FactGrid columns={2} dense items={[
        { label: "Source", value: `${doc.width} × ${doc.height}`, mono: true },
        { label: "Output", value: `${width} × ${height} ${settings.format.toUpperCase()}`, mono: true, tone: "warning" },
      ]} />
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<OverlayCancel>Change the settings</OverlayCancel>}
          primary={<Button variant="outline-danger" onClick={async () => { close(); await exportImage(context, true); }}>Export anyway</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

/** What an export would alter without being asked: aspect ratio and transparency. */
function exportChanges(doc: RasterDoc, settings: ReturnType<typeof exportUi.get>): string[] {
  const { width, height } = outputSize(doc, settings);
  const out: string[] = [];
  const source = doc.width / doc.height;
  if (Math.abs(width / height - source) > 0.005) out.push(`The aspect ratio changes from ${source.toFixed(3)} to ${(width / height).toFixed(3)}; the image is stretched.`);
  if (settings.format === "jpeg" && doc.layers.some((layer) => layer.kind === "pixel" && layer.visible)) out.push("JPEG has no alpha channel, so any transparency is flattened onto white.");
  return out;
}

registerApp({
  code: "PHOTO",
  short: "Photo",
  name: "Photo & Image Editing",
  purpose: "Raster editing with real layers, masks and adjustments, computed in this browser.",
  icon: Camera,
  nav: [
    { label: "Library", items: [{ label: "Photo library", screenId: "ARL-PHOTO-001", icon: Images }, { label: "Batch processing", screenId: "ARL-PHOTO-006", icon: LayersIcon }] },
    {
      label: "The open image",
      items: [
        { label: "Raster editor", screenId: "ARL-PHOTO-002", icon: Brush },
        { label: "Selections and masks", screenId: "ARL-PHOTO-003", icon: Lasso },
        { label: "Adjustments", screenId: "ARL-PHOTO-004", icon: SlidersHorizontal },
        { label: "Compositing", screenId: "ARL-PHOTO-005", icon: LayersIcon },
        { label: "Export", screenId: "ARL-PHOTO-007", icon: Download },
      ],
    },
  ],
  screens: {
    "ARL-PHOTO-001": {
      id: "ARL-PHOTO-001",
      tabs: (["Recent", "Albums", "Shared", "Imports"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PhotoLibrary context={context} lens={lens} />,
      })),
      actions: [
        { id: "Upload", label: "Upload", placement: "primary", run: (context) => context.openOverlay("Bulk import") },
        { id: "tag", label: "Tag…", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an image first"), run: (context) => context.openOverlay("tag image") },
        { id: "select", label: "Select an image…", placement: "overflow", run: (context) => context.openOverlay("select image") },
        { id: "clear selection", label: "Clear the selection", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Nothing is selected"), run: (context) => context.select(undefined) },
        {
          id: "compare", label: "Compare…", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select an image first"),
          run: (context) => context.openOverlay("compare images"),
        },
        { id: "details", label: "Image details", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an image first"), run: (context) => context.openOverlay("asset detail") },
        {
          id: "open", label: "Open", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select an image first"),
          run: (context) => context.navigate(context.path("/o/:org/photo/photos/:id", context.selectedId)),
        },
      ],
      overlays: [
        { id: "Bulk import", kind: "modal", title: "Import images", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <BulkImport context={context} close={close} /> },
        { id: "asset detail", kind: "drawer", title: "Image", width: OVERLAY_WIDTH.form, summary: (context) => <PhotoSummary context={context} />, render: ({ ...context }) => <AssetDetail context={context} /> },
        { id: "license", kind: "drawer", title: "Rights", width: OVERLAY_WIDTH.compact, summary: (context) => <PhotoSummary context={context} />, render: ({ ...context }) => <LicencePanel context={context} /> },
        { id: "tag image", kind: "modal", title: "Tag an image", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <TagImage context={context} close={close} />, footer: photoFooter("photo-tag", "Save the tags") },
        { id: "select image", kind: "modal", title: "Select an image", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <SelectImage context={context} close={close} /> },
        { id: "compare images", kind: "modal", title: "Compare images", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <CompareImages context={context} /> },
      ],
    },

    "ARL-PHOTO-002": {
      id: "ARL-PHOTO-002",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <RasterEditor context={context} actions={EDITOR_ACTIONS} />,
      tabs: (["Edit", "Layers", "Adjust", "Review"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <RasterEditor context={context} actions={EDITOR_ACTIONS} />,
      })),
      actions: EDITOR_ACTIONS,
      overlays: [
        { id: "Tool options", kind: "drawer", title: "Tool options", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <ToolOptions context={context} /> },
        { id: "canvas size", kind: "modal", title: "Canvas size", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <CanvasSize context={context} close={close} />, footer: photoFooter("photo-canvas-size", "Resize the canvas") },
        { id: "rights", kind: "drawer", title: "Rights", width: OVERLAY_WIDTH.compact, summary: (context) => <PhotoSummary context={context} />, render: ({ ...context }) => <RightsOverlay context={context} /> },
        { id: "adjustment layer", kind: "modal", title: "Add an adjustment layer", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <AdjustmentLayerPicker context={context} close={close} /> },
        { id: "clone source", kind: "modal", title: "Clone stamp", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <CloneSource context={context} close={close} />, footer: photoFooter("photo-clone-source", "Set the source") },
      ],
    },

    "ARL-PHOTO-003": {
      id: "ARL-PHOTO-003",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <MasksScreen context={context} actions={MASK_ACTIONS} />,
      tabs: (["Select", "Refine", "Mask", "Compare"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <MasksScreen context={context} actions={MASK_ACTIONS} />,
      })),
      actions: MASK_ACTIONS,
      overlays: [
        { id: "Selection options", kind: "drawer", title: "Selection", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <SelectionOptions context={context} /> },
        { id: "refinement", kind: "modal", title: "Refine the edge", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <RefineEdge context={context} close={close} />, footer: photoFooter("photo-refine", "Apply") },
        { id: "quick mask", kind: "modal", title: "Quick mask", width: 640, render: ({ ...context }) => <QuickMask context={context} /> },
      ],
    },

    "ARL-PHOTO-004": {
      id: "ARL-PHOTO-004",
      tabs: (["Basic", "Curves", "Colour", "Detail"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AdjustScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Adjust slider", label: "Adjust: exposure +⅓ stop", placement: "primary",
          guard: needsImage,
          run: (context) => withPhoto(context, (doc) => {
            const target = doc.layers.filter((layer) => layer.kind === "adjustment").at(-1);
            if (!target?.adjust) return addLayer(doc, newAdjustmentLayer(`adj-${wallMs().toString(36)}`, "Exposure", { exposure: 0.33 }));
            return patchLayer(doc, target.id, { adjust: { ...target.adjust, exposure: target.adjust.exposure + 0.33 } });
          }, "Raised the exposure by a third of a stop"),
        },
        {
          id: "reset", label: "Reset the adjustment", placement: "secondary",
          guard: (context) => (openPhoto(context)?.layers.some((layer) => layer.kind === "adjustment") ? undefined : "There is no adjustment layer"),
          run: (context) => withPhoto(context, (doc) => {
            const target = doc.layers.filter((layer) => layer.kind === "adjustment").at(-1);
            return target ? patchLayer(doc, target.id, { adjust: { ...NEUTRAL_ADJUST, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } }) : doc;
          }, "Reset the adjustment"),
        },
        {
          id: "save preset", label: "Save as a preset", placement: "secondary",
          guard: (context) => (openPhoto(context)?.layers.some((layer) => layer.kind === "adjustment") ? undefined : "There is no adjustment layer to save"),
          run: (context) => withPhoto(context, (doc) => {
            const target = doc.layers.filter((layer) => layer.kind === "adjustment").at(-1);
            if (!target?.adjust) return doc;
            return { ...doc, presets: [...doc.presets, { id: `pr-${wallMs().toString(36)}`, name: `Preset ${doc.presets.length + 1}`, adjust: { ...target.adjust, curve: [...target.adjust.curve] } }] };
          }, "Saved an adjustment preset"),
        },
        { id: "compare", label: "Compare", placement: "overflow", run: () => photoUi.set((current) => ({ ...current, compare: !current.compare })) },
      ],
      overlays: [
        { id: "Histogram", kind: "drawer", title: "Histogram", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <HistogramOverlay context={context} /> },
        { id: "colour picker", kind: "modal", title: "Pick a colour", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ColourPicker context={context} /> },
        { id: "profile warning", kind: "modal", title: "Colour profiles", width: 520, render: ({ ...context }) => <ProfileWarning context={context} /> },
      ],
    },

    "ARL-PHOTO-005": {
      id: "ARL-PHOTO-005",
      tabs: (["Layers", "Groups", "Effects", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CompositeScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Reorder", label: "Reorder: raise the layer", placement: "primary",
          guard: (context) => activeLayerGuard(context),
          run: (context) => withPhoto(context, (doc) => moveLayerLocal(doc, doc.activeLayerId, 1), "Raise the layer"),
        },
        { id: "lower", label: "Lower the layer", placement: "overflow", guard: (context) => activeLayerGuard(context), run: (context) => withPhoto(context, (doc) => moveLayerLocal(doc, doc.activeLayerId, -1), "Lower the layer") },
        {
          id: "group", label: "Group with the layer below", placement: "secondary",
          guard: (context) => {
            const blocked = activeLayerGuard(context);
            if (blocked) return blocked;
            const doc = openPhoto(context)!;
            const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId);
            const below = doc.layers[index - 1];
            if (doc.layers[index].kind === "group") return "The active layer is already a group";
            return below && below.kind !== "group" ? undefined : "There is no ungrouped layer below to group with";
          },
          run: (context) => withPhoto(context, (doc) => {
            const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId);
            const ids = [doc.layers[index - 1].id, doc.layers[index].id];
            const count = doc.layers.filter((layer) => layer.kind === "group").length + 1;
            return groupLayers(doc, ids, `Group ${count}`, `grp-${wallMs().toString(36)}`);
          }, "Group two layers"),
        },
        { id: "blend", label: "Blend mode…", placement: "secondary", guard: (context) => activeLayerGuard(context), run: (context) => context.openOverlay("Blend picker") },
        {
          id: "transform", label: "Transform: flip the layer", placement: "overflow",
          guard: (context) => activeLayerGuard(context),
          run: (context) => withPhoto(context, (doc) => patchLayer(doc, doc.activeLayerId, { flipX: !layerById(doc, doc.activeLayerId)?.flipX }), "Flip the layer horizontally"),
        },
        { id: "replace", label: "Replace the layer's pixels…", placement: "overflow", guard: (context) => activeLayerGuard(context, "pixel"), run: (context) => context.openOverlay("replace layer") },
        { id: "place", label: "Place an asset as a new layer", placement: "overflow", run: (context) => context.openOverlay("linked object") },
      ],
      overlays: [
        { id: "Blend picker", kind: "modal", title: "Blend mode", width: OVERLAY_WIDTH.wide, render: ({ close, ...context }) => <BlendPicker context={context} close={close} /> },
        { id: "layer properties", kind: "drawer", title: "Layer", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <LayerPropertiesOverlay context={context} /> },
        { id: "linked object", kind: "modal", title: "Place an asset", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <LinkedObject context={context} /> },
        { id: "replace layer", kind: "modal", title: "Replace a layer's pixels", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReplaceLayer context={context} close={close} /> },
      ],
    },

    "ARL-PHOTO-006": {
      id: "ARL-PHOTO-006",
      tabs: (["Queue", "Presets", "Results", "Failed"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <BatchScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Build batch", label: "Build the batch", placement: "primary",
          guard: () => (batchUi.get().chosen.length ? undefined : "Tick the images to include on the Queue tab"),
          run: async (context) => {
            const { db } = await import("@/runtime/db");
            const titles = new Map<string, string>();
            for (const id of batchUi.get().chosen) titles.set(id, (await db.records.get(id))?.title ?? id);
            buildBatch(context, titles);
          },
        },
        { id: "test sample", label: "Test one sample", placement: "secondary", guard: () => (batchUi.get().running ? "The batch is running" : batchUi.get().chosen.length ? undefined : "Tick at least one image first"), run: (context) => testSample(context) },
        {
          id: "execute", label: "Run the queue", placement: "secondary",
          guard: () => (batchUi.get().running ? "The batch is running" : batchUi.get().jobs.some((job) => job.state === "queued") ? undefined : "Build the batch first"),
          run: (context) => requestRun(context),
        },
        { id: "download", label: "Download the results", placement: "overflow", guard: () => (heldBatchFiles().length ? undefined : "No file from this session is held"), run: (context) => downloadResults(context) },
      ],
      overlays: [
        { id: "Preset editor", kind: "modal", title: "Batch preset", width: OVERLAY_WIDTH.compact, render: ({ close }) => <PresetEditor close={close} /> },
        { id: "overwrite confirmation", kind: "modal", title: "Before the files are written", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <OutputNames context={context} close={close} /> },
        { id: "result report", kind: "drawer", title: "Batch report", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <BatchReportDrawer context={context} /> },
      ],
    },

    "ARL-PHOTO-007": {
      id: "ARL-PHOTO-007",
      tabs: (["Export", "Presets", "Publish"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExportScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Set format", label: "Set the format…", placement: "secondary", run: (context) => context.openOverlay("format") },
        {
          id: "preview", label: "Preview the real file", placement: "secondary",
          guard: (context) => needsImage(context) ?? (exportUi.get().busy ? "An export is running" : undefined),
          run: async (context) => { context.setTab("Export"); context.openOverlay("Export preview"); await exportImage(context, false); },
        },
        {
          id: "export", label: "Export", placement: "primary",
          guard: (context) => needsImage(context) ?? (exportUi.get().busy ? "An export is running" : undefined),
          run: async (context) => {
            const doc = openPhoto(context) ?? await readShared<RasterDoc>(context, parsePhoto);
            if (!doc) return;
            if (exportChanges(doc, exportUi.get()).length > 0) context.openOverlay("export check");
            else await exportImage(context, true);
          },
        },
        { id: "upload to asset library", label: "Add to the asset library", placement: "overflow", guard: (context) => needsImage(context) ?? (exportUi.get().busy ? "An export is running" : undefined), run: (context) => addToAssetLibrary(context) },
      ],
      overlays: [
        { id: "Export preview", kind: "modal", title: "Export preview", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <ExportScreen context={context} lens="Export" /> },
        { id: "rights", kind: "drawer", title: "Rights", width: OVERLAY_WIDTH.compact, summary: (context) => <PhotoSummary context={context} />, render: ({ ...context }) => <RightsOverlay context={context} /> },
        { id: "profile handling", kind: "modal", title: "Colour profiles", width: 520, render: ({ ...context }) => <ProfileWarning context={context} /> },
        { id: "format", kind: "modal", title: "Export format", width: OVERLAY_WIDTH.compact, render: ({ close }) => <FormatOverlay close={close} /> },
        { id: "export check", kind: "modal", title: "Before the file is written", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <ExportCheck context={context} close={close} /> },
      ],
    },
  },
});

function photoFooter(form: string, label: string) {
  return ({ close: _close }: { close: () => void }) => (
    <OverlayActions primary={<Button variant="primary" type="submit" form={form}>{label}</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} />
  );
}

function PresetEditor({ close }: { close: () => void }) {
  const batch = useStore(batchUi);
  return (
    <Stack gap={3}>
      <FactGrid columns={2} dense items={[
        { label: "Format", value: batch.format.toUpperCase(), mono: true },
        { label: "Longest edge", value: `${batch.longEdge}px`, mono: true },
        { label: "Quality", value: batch.format === "png" ? "lossless" : `${Math.round(batch.quality * 100)}%`, mono: true },
        { label: "File name", value: batch.pattern, mono: true },
      ]} />
      <OverlaySection title="Not stored yet" tone="info">
        These settings apply to the queue immediately. Saving a named preset on the workspace is not built, and this does not pretend to save one.
      </OverlaySection>
      <ModalActions><OverlayActions primary={<Button variant="primary" onClick={close}>Keep these settings</Button>} /></ModalActions>
    </Stack>
  );
}

/** The decision that stands in for "overwrite": the names a run would write, what collides, and what to do about it. */
function OutputNames({ context, close }: { context: ScreenContext; close: () => void }) {
  const batch = useStore(batchUi);
  const plan = useBatchPlan();
  if (batch.jobs.length === 0) return <Empty title="Build the batch first">The names a run would write are previewed here once the queue exists.</Empty>;
  if (!plan) return <Empty title="Working out the file names…" />;
  const clashes = plan.filter((item) => item.collision);
  const skipping = batch.onCollision === "skip";
  const writes = plan.length - (skipping ? clashes.length : 0);
  return (
    <Stack gap={3}>
      <p className="ds-prose">This page cannot replace a file on your disk: every file is a new browser download, and it cannot see the download folder. So the choice is what to do when a name is already taken in this session.</p>
      <div className="ph-plan" role="list" aria-label="Output names">
        {plan.map((item) => (
          <div key={item.jobId} role="listitem" className="ph-plan-row" data-collision={item.collision ? "true" : undefined}>
            <span className="ph-plan-title ds-truncate">{item.title}</span>
            <span className="ph-plan-name ds-num" title={item.name}>
              {item.collision ? (skipping ? <s>{item.root}</s> : <>{item.root} → <strong>{item.name}</strong></>) : item.name}
            </span>
            {item.collision ? <Pill tone="warning">{skipping ? "skipped" : item.collision === "batch" ? "renamed, same batch" : "renamed, written before"}</Pill> : <Pill tone="success">new</Pill>}
          </div>
        ))}
      </div>
      {clashes.length > 0 && (
        <Field label="Where a name is taken">
          <Select value={batch.onCollision} onChange={(event) => batchUi.set((current) => ({ ...current, onCollision: event.target.value as "counter" | "skip" }))}>
            <option value="counter">Keep both: add a counter to the new file</option>
            <option value="skip">Skip the duplicate: write nothing for it</option>
          </Select>
        </Field>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={writes === 0 || batch.running} onClick={() => { close(); void runBatch(context); }}>{`Write ${writes} file${writes === 1 ? "" : "s"}`}</Button>}
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

function BatchReportDrawer({ context }: { context: ScreenContext }) {
  const batch = useStore(batchUi);
  const done = batch.jobs.filter((job) => job.state === "done");
  const failed = batch.jobs.filter((job) => job.state === "failed");
  const skipped = batch.jobs.filter((job) => job.state === "skipped");
  if (batch.jobs.length === 0) return <Empty title="No batch has run in this session" />;
  return (
    <Stack gap={3}>
      <FactGrid columns={4} items={[
        { label: "Jobs", value: batch.jobs.length, mono: true },
        { label: "Written", value: done.length, mono: true, tone: done.length ? "success" : undefined },
        { label: "Skipped", value: skipped.length, mono: true },
        { label: "Failed", value: failed.length, mono: true, tone: failed.length ? "danger" : undefined },
      ]} />
      <KeyValueList items={[{ label: "Bytes written", value: done.reduce((sum, job) => sum + (job.bytes ?? 0), 0).toLocaleString(), mono: true }]} />
      {[...failed, ...skipped].map((job) => <Notice key={job.id} tone={job.state === "failed" ? "danger" : "info"} title={job.title}>{job.reason}</Notice>)}
      <DrawerActions>
        <OverlayActions primary={<Button variant="primary" onClick={() => context.setTab("Results")}>Open the results</Button>} end={<OverlayCancel>Close</OverlayCancel>} />
      </DrawerActions>
    </Stack>
  );
}

function LayerPropertiesOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = usePhotoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  return <LayerProperties handle={handle} />;
}

function RightsOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = usePhotoDoc(context);
  const [credit, setCredit] = useState<string | null>(null);
  if (!record || !handle.doc) return <Empty title="Open an image first" />;
  const doc = handle.doc;
  const draft = credit ?? doc.rights.credit;
  const dirty = draft.trim() !== doc.rights.credit && draft.trim() !== "";
  return (
    <Stack gap={3}>
      {doc.rights.license === "Unknown" && <Notice tone="danger" title="Do not publish">Resolve the licence before this image leaves the workspace.</Notice>}
      <OverlaySection title="Licence" hint="Travels with every export copied into the asset library">
        <Select aria-label="Licence" value={doc.rights.license} onChange={(event) => handle.edit((current) => ({ ...current, rights: { ...current.rights, license: event.target.value } }), "Change the licence")}>
          {LICENCES.map((option) => <option key={option}>{option}</option>)}
        </Select>
      </OverlaySection>
      <OverlaySection title="Credit" hint={`Now: ${doc.rights.credit}`}>
        <TextInput aria-label="Credit" value={draft} onChange={(event) => setCredit(event.target.value)} />
      </OverlaySection>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={!dirty} onClick={() => { handle.edit((current) => ({ ...current, rights: { ...current.rights, credit: draft.trim() } }), "Change the credit"); setCredit(null); context.toast("Credit saved", draft.trim()); }}>Save the credit</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}
