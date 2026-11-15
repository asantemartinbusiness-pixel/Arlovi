import { useEffect, useMemo, useState } from "react";
import {
  Camera, Brush, Eraser, Crop, Move, SquareDashed, Lasso, Pipette, Hand, Stamp,
  Layers as LayersIcon, SlidersHorizontal, Images, Download, Circle,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, ShortcutTable, downloadBlob,
  slug, useDoc, useStore, type DocHandle,
} from "@/applications/visual/kit";
import {
  NEUTRAL_ADJUST, addLayer, bakeCrop, compositeImageData, describeAdjust, exportComposite,
  groupLayers, histogram, isNeutral, layerById, loadImage, makeCanvas, context2d,
  newAdjustmentLayer, patchLayer, selectionBoundsOf, transformSelection,
  type Adjust, type PhotoLayer, type RasterDoc,
} from "./raster";
import { PhotoCanvas, useImageBank, LayerThumb, type ImageBank } from "./canvas";
import { AdjustControls, CurveEditor, HistogramView, LayerProperties, PhotoLayers, useHistogram } from "./panels";
import {
  bumpPixels, newPixelLayer, parsePhoto, photoUi, setPhotoTool, starterPhoto, unsupportedReason, type PhotoTool,
} from "./model";

/* ====================================================================== *
 * PHOTO — Photo & Image Editing
 * ====================================================================== */

function usePhotoDoc(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useDoc<RasterDoc>(record, parsePhoto, context.screen.id);
  const bank = useImageBank(handle.doc);
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
              subtitle={`${doc.width} × ${doc.height} · ${doc.layers.length} layers · ${relative(record.updatedAt)}`}
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
  if (!record) return <div className="pg-body"><MissingPhoto context={context} /></div>;
  const doc = handle.doc;
  const tab = context.tab;

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Edit" }, { id: "Layers" }, { id: "Adjust" }, { id: "Review" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span>{doc.width} × {doc.height} · {doc.layers.length} layers</span>}</Row>}
      backTo={{ label: "Photo", to: `/o/${context.org.slug}/photo/photos` }}
      tools={
        <>
          <Toolbar label="Tools">
            {PHOTO_TOOLS.map((item) => (
              <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setPhotoTool(item.tool)} />
            ))}
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="History">
            <Button size="sm" variant="ghost" disabled={!handle.canUndo} onClick={handle.undo}>Undo</Button>
            <Button size="sm" variant="ghost" disabled={!handle.canRedo} onClick={handle.redo}>Redo</Button>
            <Button size="sm" variant={ui.compare ? "primary" : "ghost"} onClick={() => photoUi.set((c) => ({ ...c, compare: !c.compare }))}>Compare</Button>
          </Toolbar>
        </>
      }
      left={
        <Stack gap={3}>
          <RecoveryNotice handle={handle as DocHandle<unknown>} />
          {doc && <Notice tone="info" title="Where these pixels come from">{doc.origin}</Notice>}
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
          onClick={() => handle.edit((current) => addLayer(current, newAdjustmentLayer(`adj-${Date.now().toString(36)}`, `Adjustment ${current.layers.filter((item) => item.kind === "adjustment").length + 1}`)), "Add an adjustment layer")}
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
    handle.edit((current) => patchLayer(current, layer.id, { mask: data, maskEnabled: true }), "Turn the selection into a mask");
    bumpPixels();
    context.toast("Mask created", `${layer.name} is now masked by the selection, feathered by ${doc.selection.feather}px.`);
  };

  return (
    <EditorFrame
      context={context}
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
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => patchLayer(current, layer.id, { mask: undefined, maskEnabled: false }), "Delete the mask")}>Delete the mask</Button>
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
    handle.edit((current) => addLayer(current, newAdjustmentLayer(`adj-${Date.now().toString(36)}`, "Adjustment")), "Add an adjustment layer");
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
              handle.edit((current) => ({ ...current, presets: [...current.presets, { id: `pr-${Date.now().toString(36)}`, name, adjust: { ...target.adjust!, curve: [...target.adjust!.curve] } }] }), "Save a preset");
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
      <Card span={8} title="Layer table" subtitle="Reorder, blend, replace">
        <LayerTable handle={handle} bank={bank} context={context} />
      </Card>
      <Card span={12} title="Composite" flush>
        <div style={{ position: "relative", height: 380 }}>
          <PhotoCanvas handle={handle} bank={bank} showSelectionOverlay={false} />
        </div>
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
            const id = `grp-${Date.now().toString(36)}`;
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

interface BatchJob {
  id: string;
  recordId: string;
  title: string;
  state: "queued" | "running" | "done" | "failed";
  outName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  reason?: string;
}

function BatchScreen({ context, lens }: { context: ScreenContext; lens: "Queue" | "Presets" | "Results" | "Failed" }) {
  const photos = useCollection("photos");
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("jpeg");
  const [quality, setQuality] = useState(0.82);
  const [longEdge, setLongEdge] = useState(1600);
  const [pattern, setPattern] = useState("{name}-{w}x{h}");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  const existingNames = useMemo(() => new Set(jobs.filter((job) => job.state === "done").map((job) => job.outName)), [jobs]);

  const nameFor = (title: string, width: number, height: number): string => {
    let base = pattern
      .replace("{name}", slug(title))
      .replace("{w}", String(width))
      .replace("{h}", String(height));
    let candidate = `${base}.${format === "jpeg" ? "jpg" : format}`;
    let counter = 2;
    while (existingNames.has(candidate)) {
      base = `${base}-${counter}`;
      candidate = `${base}.${format === "jpeg" ? "jpg" : format}`;
      counter += 1;
    }
    return candidate;
  };

  const build = () => {
    const next = chosen.map((id) => {
      const record = photos.find((item) => item.id === id);
      return { id: `job-${id}`, recordId: id, title: record?.title ?? id, state: "queued" as const };
    });
    setJobs(next);
    setDone(0);
    context.toast("Queue built", `${next.length} job${next.length === 1 ? "" : "s"} ready. Nothing has been written yet.`);
  };

  const runOne = async (job: BatchJob): Promise<BatchJob> => {
    const record = photos.find((item) => item.id === job.recordId);
    if (!record) return { ...job, state: "failed", reason: "The record is no longer in this workspace." };
    try {
      const doc = parsePhoto(record.body);
      const images = new Map<string, HTMLImageElement>();
      const masks = new Map<string, HTMLImageElement>();
      for (const layer of doc.layers) {
        if (layer.src) images.set(layer.id, await loadImage(layer.src));
        if (layer.mask) masks.set(layer.id, await loadImage(layer.mask));
      }
      const scale = longEdge / Math.max(doc.width, doc.height);
      const width = Math.max(1, Math.round(doc.width * Math.min(1, scale)));
      const height = Math.max(1, Math.round(doc.height * Math.min(1, scale)));
      const result = await exportComposite(doc, images, masks, {
        format, quality, width, height,
        background: format === "jpeg" ? "#ffffff" : undefined,
      });
      const outName = nameFor(record.title, width, height);
      downloadBlob(outName, result.blob);
      return { ...job, state: "done", outName, bytes: result.blob.size, width, height };
    } catch (error) {
      return { ...job, state: "failed", reason: error instanceof Error ? error.message : "The browser could not encode this image." };
    }
  };

  const execute = async (onlyFailed = false) => {
    setRunning(true);
    try {
      const queue = jobs.filter((job) => (onlyFailed ? job.state === "failed" : job.state === "queued"));
      for (const job of queue) {
        setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, state: "running" } : item)));
        const result = await runOne(job);
        setJobs((current) => current.map((item) => (item.id === job.id ? result : item)));
        setDone((current) => current + 1);
      }
      context.toast("Batch finished", `${queue.length} file${queue.length === 1 ? "" : "s"} written from this browser.`);
    } finally {
      setRunning(false);
    }
  };

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
            <Field label="File name" hint="{name}, {w} and {h} are replaced. A collision adds a counter rather than overwriting.">
              <TextInput value={pattern} onChange={(event) => setPattern(event.target.value)} />
            </Field>
            {format === "jpeg" && <Notice tone="warning" title="JPEG has no alpha">Transparent areas are flattened onto white. Choose PNG or WebP to keep them.</Notice>}
            <Button variant="secondary" onClick={() => context.openOverlay("Preset editor")}>Name and store this preset</Button>
          </Stack>
        </Card>
        <Card span={6} title="Sample" subtitle="Run one job to check the settings before the whole queue">
          <Stack gap={3}>
            <p className="ds-prose">A sample writes one file with exactly the settings on the left, so the size and quality are the real ones.</p>
            <Button
              variant="primary"
              busy={running}
              disabled={chosen.length === 0}
              onClick={async () => {
                setRunning(true);
                const job = { id: "sample", recordId: chosen[0], title: photos.find((item) => item.id === chosen[0])?.title ?? "", state: "queued" as const };
                const result = await runOne(job);
                setRunning(false);
                context.toast(
                  result.state === "done" ? "Sample written" : "Sample failed",
                  result.state === "done" ? `${result.outName} — ${result.width} × ${result.height}, ${((result.bytes ?? 0) / 1024).toFixed(0)} kB.` : result.reason ?? "",
                  result.state === "done" ? "ok" : "failed",
                );
              }}
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
    const rows = jobs.filter((job) => (lens === "Failed" ? job.state === "failed" : job.state === "done"));
    return (
      <Card
        title={lens === "Failed" ? "Jobs that failed" : "Files written"}
        subtitle={`${rows.length} of ${jobs.length}`}
        actions={lens === "Failed" && rows.length > 0 ? <Button size="sm" variant="secondary" busy={running} onClick={() => void execute(true)}>Retry the failures</Button> : undefined}
      >
        {rows.length === 0 ? (
          <Empty title={lens === "Failed" ? "Nothing failed" : "Nothing written yet"}>
            {lens === "Failed" ? "Every job that has run so far produced a file." : "Build a queue and run it; each file downloads from this browser."}
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

  return (
    <Grid>
      <Card span={7} title="Choose the images" subtitle={`${chosen.length} of ${photos.length} selected`}>
        <DataGrid
          rows={photos}
          rowId={(row) => row.id}
          label="Images"
          columns={[
            { key: "title", header: "Image", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "unreadable" ? "danger" : "neutral"}>{row.status}</Pill> },
            { key: "album", header: "Album", cell: (row) => String(row.fields.album ?? "Unfiled") },
            {
              key: "pick", header: "In the batch", align: "end", cell: (row) => (
                <Checkbox
                  label=""
                  aria-label={`Include ${row.title}`}
                  checked={chosen.includes(row.id)}
                  onChange={(event) => setChosen((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                />
              ),
            },
          ]}
        />
        <Row gap={2} wrap style={{ marginBlockStart: 12 }}>
          <Button variant="secondary" onClick={() => setChosen(photos.map((row) => row.id))}>Select every image</Button>
          <Button variant="ghost" onClick={() => setChosen([])}>Clear</Button>
        </Row>
      </Card>
      <Card span={5} title="Queue" subtitle={jobs.length === 0 ? "Not built yet" : `${done} of ${jobs.length} finished`}>
        <Stack gap={3}>
          {jobs.length > 0 && <Meter value={done} max={jobs.length} label="Batch progress" />}
          <Properties rows={[
            { label: "Format", value: format.toUpperCase() },
            { label: "Longest edge", value: `${longEdge}px` },
            { label: "Naming", value: pattern },
          ]} />
          <Row gap={2} wrap>
            <Button variant="secondary" disabled={chosen.length === 0} onClick={build}>Build the batch</Button>
            <Button variant="primary" busy={running} disabled={jobs.filter((job) => job.state === "queued").length === 0} onClick={() => void execute()}>
              Run {jobs.filter((job) => job.state === "queued").length} job{jobs.filter((job) => job.state === "queued").length === 1 ? "" : "s"}
            </Button>
          </Row>
          {jobs.length > 0 && (
            <Stack gap={1}>
              {jobs.map((job) => (
                <Row key={job.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow">{job.title}</span>
                  <Pill tone={job.state === "done" ? "success" : job.state === "failed" ? "danger" : job.state === "running" ? "info" : "neutral"} dot>{job.state}</Pill>
                </Row>
              ))}
            </Stack>
          )}
          <Notice tone="info" title="A stopped run resumes where it left off">
            Jobs already marked done are skipped when the queue is run again, and a name that already exists in this run gets a counter instead of overwriting.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- PHOTO-007 ---------------------------- */

function ExportScreen({ context, lens }: { context: ScreenContext; lens: "Export" | "Presets" | "Publish" }) {
  const { record, handle, bank } = usePhotoDoc(context);
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [quality, setQuality] = useState(0.9);
  const [scale, setScale] = useState(1);
  const [keepAspect, setKeepAspect] = useState(true);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ src: string; bytes: number; width: number; height: number } | null>(null);
  const doc = handle.doc;

  useEffect(() => { if (doc && width === 0) setWidth(doc.width); }, [doc, width]);

  if (!record) return <MissingPhoto context={context} />;
  if (!doc) return <Empty title="Opening the image…" />;

  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(keepAspect ? (width * scale * doc.height) / doc.width : doc.height * scale));
  const hasAlpha = doc.layers.some((layer) => layer.kind === "pixel" && layer.visible);

  const makeFile = async (download: boolean) => {
    setBusy(true);
    try {
      const result = await exportComposite(doc, bank.images, bank.masks, {
        format, quality, width: outWidth, height: outHeight,
        background: format === "jpeg" ? "#ffffff" : undefined,
      });
      if (download) {
        downloadBlob(`${slug(record.title)}-${outWidth}x${outHeight}.${format === "jpeg" ? "jpg" : format}`, result.blob);
        context.toast("Exported", `${outWidth} × ${outHeight}, ${(result.blob.size / 1024).toFixed(0)} kB written from this browser.`);
      } else {
        setPreview({ src: URL.createObjectURL(result.blob), bytes: result.blob.size, width: result.width, height: result.height });
      }
    } catch (error) {
      context.toast("Export failed", error instanceof Error ? error.message : "The browser produced no image data.", "failed");
    } finally {
      setBusy(false);
    }
  };

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
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await exportComposite(doc, bank.images, bank.masks, { format: "png", quality: 1, width: Math.min(doc.width, 1200), height: Math.round((Math.min(doc.width, 1200) * doc.height) / doc.width) });
                  const src = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.readAsDataURL(result.blob);
                  });
                  await context.mutate.create({
                    collection: "assets", title: `${record.title} (export)`, status: "ready",
                    summary: `PNG export at ${result.width} × ${result.height} from ${record.title}.`,
                    body: { src, width: result.width, height: result.height },
                    fields: { license: doc.rights.license, credit: doc.rights.credit, bytes: result.blob.size, source: record.id },
                  }, `Export of ${record.title} added to the asset library`);
                  context.toast("Added to the asset library", "It is a record in this workspace, with its licence and credit.");
                } catch (error) {
                  context.toast("Could not add it", error instanceof Error ? error.message : "The export failed.", "failed");
                } finally {
                  setBusy(false);
                }
              }}
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
          <Properties rows={[
            { label: "Output", value: `${outWidth} × ${outHeight}` },
            { label: "Aspect", value: keepAspect ? `kept at ${(doc.width / doc.height).toFixed(3)}` : `changed to ${(outWidth / outHeight).toFixed(3)}` },
            { label: "Transparency", value: format === "jpeg" ? "flattened onto white" : hasAlpha ? "kept" : "no transparent pixels" },
            { label: "Profile", value: `${doc.profile} recorded; the file is written in sRGB` },
          ]} />
          {!keepAspect && <Notice tone="warning" title="The aspect ratio will change">The output is {(outWidth / outHeight).toFixed(3)} against the source {(doc.width / doc.height).toFixed(3)}. The image will be stretched.</Notice>}
          {format === "jpeg" && <Notice tone="warning" title="JPEG drops transparency">Transparent pixels are composited onto white before encoding. Choose PNG or WebP to keep them.</Notice>}
          <Row gap={2} wrap>
            <Button variant="secondary" busy={busy} onClick={() => void makeFile(false)}>Preview the real file</Button>
            <Button variant="primary" busy={busy} onClick={() => void makeFile(true)}>Export</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("profile handling")}>Profile…</Button>
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
