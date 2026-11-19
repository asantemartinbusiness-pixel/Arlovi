import { useMemo, useState } from "react";
import { Clapperboard, FileUp, Link2, Unlink } from "lucide-react";
import { Button, Card, DataGrid, Empty, Grid, Notice, Pill, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, ModalActions, OverlayActions, OverlayCancel, OverlaySection, FactGrid, KeyValueList, DrawerActions } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { uid } from "@/applications/visual/geometry";
import { keyframeCount, type MotionAsset, type MotionDoc, type MotionLayer } from "./anim";
import { parseMotion, starterMotion, storyboardFromBrief } from "./model";
import { Stage } from "./parts";
import { useAssetLookup, FormField } from "./shared";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * ARL-MOTION-001 — Motion Projects
 * ====================================================================== */

export type ProjectLens = "Recent" | "Shared" | "Templates" | "Renders";

function isTemplate(record: Rec): boolean {
  return record.fields.kind === "template";
}

export function ProjectsTab({ context, lens }: { context: ScreenContext; lens: ProjectLens }) {
  const motions = useCollection("motions");
  const assets = useAssetLookup();
  const docs = useMemo(() => new Map(motions.map((record) => [record.id, parseMotion(record.body)])), [motions]);
  const missing = motions.flatMap((record) => (assets.ready ? (docs.get(record.id)?.assets ?? []).filter((asset) => !assets.status(asset).found).map((asset) => ({ record, asset })) : []));

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Compositions" value={motions.filter((record) => !isTemplate(record)).length} prov="human" meta={`in ${context.org.shortName}`} />
        <Stat label="Brand templates" value={motions.filter(isTemplate).length} prov="human" meta="published in this workspace" />
        <Stat
          label="Missing linked assets"
          value={assets.ready ? missing.length : "—"}
          unavailable={!assets.ready}
          prov={assets.ready ? "human" : undefined}
          meta={assets.ready ? "links whose record is gone" : "checking the asset records"}
        />
        <Stat label="Renders recorded" value={[...docs.values()].reduce((sum, doc) => sum + doc.renders.length, 0)} prov="human" meta="files made in this browser" />
      </StatRow>

      {missing.length > 0 && (
        <Notice tone="warning" title={`${missing.length} linked asset${missing.length === 1 ? " is" : "s are"} missing`}>
          <Stack gap={1}>
            {missing.map(({ record, asset }) => (
              <Row key={`${record.id}-${asset.id}`} gap={2} wrap>
                <span><strong>{record.title}</strong> links <strong>{asset.name}</strong> (<code className="ds-num">{asset.recordId}</code>), which is no longer in {context.org.shortName}.</span>
                <Button size="sm" variant="secondary" onClick={() => { context.select(record.id); context.openOverlay("asset library", { id: record.id }); }}>Relink or remove</Button>
              </Row>
            ))}
          </Stack>
        </Notice>
      )}

      {lens === "Renders" ? <RenderList context={context} motions={motions} docs={docs} /> : <CompositionCards context={context} lens={lens} motions={motions} docs={docs} />}
    </Stack>
  );
}

function CompositionCards({ context, lens, motions, docs }: { context: ScreenContext; lens: Exclude<ProjectLens, "Renders">; motions: Rec[]; docs: Map<string, MotionDoc> }) {
  const { relative } = useWorkspace();
  const assets = useAssetLookup();
  const rows = motions
    .filter((record) => (lens === "Templates" ? isTemplate(record) : lens === "Shared" ? Boolean(record.fields.sharedWith) : !isTemplate(record)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (rows.length === 0) {
    return (
      <Empty
        title={lens === "Templates" ? "No brand motion templates yet" : lens === "Shared" ? "Nothing shared yet" : "No compositions yet"}
        icon={<Clapperboard size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Composition setup")}>Create a composition</Button>}
      >
        {lens === "Templates" ? "Publish a composition as a template and it appears here for everyone in this workspace." : lens === "Shared" ? "A composition shared with a colleague in this workspace is listed here." : "Start from a size, a brief or a template."}
      </Empty>
    );
  }

  return (
    <Grid>
      {rows.map((record) => {
        const doc = docs.get(record.id) ?? parseMotion(record.body);
        const missingCount = assets.ready ? doc.assets.filter((asset) => !assets.status(asset).found).length : 0;
        const selected = context.selectedId === record.id;
        return (
          <Card
            key={record.id}
            span={4}
            eyebrow={isTemplate(record) ? "BRAND TEMPLATE" : "COMPOSITION"}
            prov="human"
            title={record.title}
            subtitle={<><span className="ds-num">{doc.duration}s</span> · <span className="ds-num">{doc.fps}</span> fps · <span className="ds-num">{doc.width}×{doc.height}</span> · edited {relative(record.updatedAt)}</>}
            className={selected ? "mo-selected" : undefined}
            data-testid={`motion-card-${record.id}`}
          >
            <Stack gap={2}>
              <button type="button" className="mo-thumb" aria-pressed={selected} aria-label={`Select ${record.title}`} onClick={() => context.select(record.id)} onDoubleClick={() => context.navigate(context.path("/o/:org/motion/projects/:id", record.id))}>
                <Stage doc={doc} time={doc.duration * 0.6} height={150} label={`${record.title}, preview frame`} />
              </button>
              <Row gap={1} wrap>
                <Pill tone="info" dot>{record.status}</Pill>
                <Pill><span className="ds-num">{doc.layers.length}</span> layers</Pill>
                <Pill><span className="ds-num">{keyframeCount(doc)}</span> keyframes</Pill>
                {doc.triggers.length > 0 && <Pill><span className="ds-num">{doc.triggers.length}</span> triggers</Pill>}
                {doc.reducedMotion.strategy === "none" && <Pill tone="danger">no reduced-motion alternative</Pill>}
                {missingCount > 0 && <Pill tone="warning">{missingCount} asset{missingCount === 1 ? "" : "s"} missing</Pill>}
                {record.fields.sharedWith && <Pill>shared with {String(record.fields.sharedWith)}</Pill>}
              </Row>
              <Row gap={1} wrap>
                <Button size="sm" variant={selected ? "primary" : "ghost"} onClick={() => context.select(record.id)}>{selected ? "Selected" : "Select"}</Button>
                <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/motion/projects/:id", record.id))}>Open</Button>
                <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => { context.select(record.id); context.openOverlay("asset library", { id: record.id }); }}>Assets</Button>
                {isTemplate(record)
                  ? <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Composition setup", { templateId: record.id })}>Use template</Button>
                  : <Button size="sm" variant="ghost" onClick={() => { context.select(record.id); context.openOverlay("publish", { id: record.id }); }}>Publish as template</Button>}
              </Row>
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

interface RenderRow { id: string; recordId: string; title: string; format: string; state: string; at: string; by: string; bytes?: number; note: string; artifact?: string }

function RenderList({ context, motions, docs }: { context: ScreenContext; motions: Rec[]; docs: Map<string, MotionDoc> }) {
  const { dateTime } = useWorkspace();
  const rows: RenderRow[] = motions.flatMap((record) => (docs.get(record.id)?.renders ?? []).map((render) => ({ ...render, id: `${record.id}:${render.id}`, recordId: record.id, title: record.title })))
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <DataGrid<RenderRow>
      label="Renders across compositions"
      rows={rows}
      rowId={(row) => row.id}
      rowTone={(row) => (row.state === "failed" ? "danger" : row.state === "queued" ? "warning" : undefined)}
      onOpen={(id) => { const row = rows.find((item) => item.id === id); if (row) context.navigate(context.path("/o/:org/motion/projects/:id/export", row.recordId)); }}
      empty={<Empty title="Nothing rendered yet" icon={<Clapperboard size={20} />}>Exports and renders made in Motion Export are listed here with their size and who made them.</Empty>}
      columns={[
        { key: "title", header: "Composition", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
        { key: "format", header: "Format", cell: (row) => <code className="ds-num">{row.format}</code>, sortValue: (row) => row.format },
        { key: "state", header: "State", cell: (row) => <Pill tone={row.state === "done" ? "success" : row.state === "failed" ? "danger" : "info"}>{row.state}</Pill>, sortValue: (row) => row.state },
        { key: "artifact", header: "File", cell: (row) => <span className="ds-num">{row.artifact ?? "—"}</span>, hideBelow: 900 },
        { key: "bytes", header: "Size", align: "end", cell: (row) => <span className="ds-num">{row.bytes ? `${(row.bytes / 1024).toFixed(1)} KB` : "—"}</span>, sortValue: (row) => row.bytes ?? 0 },
        { key: "by", header: "By", cell: (row) => row.by, hideBelow: 700 },
        { key: "at", header: "When", cell: (row) => <span className="ds-num">{dateTime(row.at)}</span>, sortValue: (row) => row.at },
      ]}
    />
  );
}

/* ------------------------------ overlays ------------------------------ */

const SIZES = [
  { id: "1920x1080", label: "1920 × 1080 — landscape video" },
  { id: "1080x1080", label: "1080 × 1080 — square social" },
  { id: "1080x1920", label: "1080 × 1920 — vertical story" },
  { id: "960x540", label: "960 × 540 — web hero" },
  { id: "480x480", label: "480 × 480 — icon and email" },
];

export function CompositionSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const motions = useCollection("motions");
  const templates = motions.filter(isTemplate);
  const payload = (context.overlayPayload ?? {}) as { templateId?: string };
  const [name, setName] = useState("");
  const [size, setSize] = useState("960x540");
  const [fps, setFps] = useState("30");
  const [duration, setDuration] = useState("3");
  const [start, setStart] = useState<"starter" | "brief" | "template">(payload.templateId ? "template" : "starter");
  const [brief, setBrief] = useState("");
  const [templateId, setTemplateId] = useState(payload.templateId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    const seconds = Number.parseFloat(duration);
    if (!name.trim()) next.name = "Give the composition a name.";
    if (!Number.isFinite(seconds) || seconds < 0.5 || seconds > 60) next.duration = "Between 0.5 and 60 seconds.";
    if (start === "brief" && brief.trim().split(/\s+/).length < 4) next.brief = "Write at least a sentence for the storyboard to work from.";
    if (start === "template" && !templateId) next.template = "Choose a template.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const [width, height] = size.split("x").map(Number);
      const rate = Number(fps);
      let body: MotionDoc;
      if (start === "brief") body = storyboardFromBrief(name.trim(), brief, { width, height, fps: rate });
      else if (start === "template") {
        const template = templates.find((record) => record.id === templateId);
        body = { ...parseMotion(template?.body), renders: [], tests: [], review: { state: "not_required", reasons: [] } };
      } else {
        const base = starterMotion(name.trim());
        const sx = width / base.width;
        const sy = height / base.height;
        body = {
          ...base, width, height, fps: rate, duration: seconds,
          layers: base.layers.map((layer) => ({ ...layer, box: { x: Math.round(layer.box.x * sx), y: Math.round(layer.box.y * sy), w: Math.round(layer.box.w * sx), h: Math.round(layer.box.h * sy) } })),
        };
      }
      if (start !== "template" && start !== "brief") body.duration = seconds;
      const made = await context.mutate.create({
        collection: "motions", title: name.trim(), status: "draft",
        summary: start === "brief" ? "Storyboard composed from a written brief: one beat per sentence, no model called." : start === "template" ? `From the template ${templates.find((record) => record.id === templateId)?.title ?? ""}.` : "Started from the three-layer starter.",
        body, fields: { kind: "composition", fps: body.fps, width: body.width, height: body.height, duration: body.duration, ...(start === "template" ? { fromTemplate: templateId } : {}) },
      }, `Composition created: ${name.trim()}`);
      close();
      context.navigate(context.path("/o/:org/motion/projects/:id", made.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="motion-setup" className="ds-stack ds-gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <FormField label="Name" required error={errors.name}>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Arc Lamp launch sting" invalid={Boolean(errors.name)} autoFocus />
      </FormField>
      <FormField label="Start from">
        <Select value={start} onChange={(event) => setStart(event.target.value as typeof start)}>
          <option value="starter">The starter: a title, an accent bar and a dot</option>
          <option value="brief">A creative brief, as a storyboard</option>
          <option value="template" disabled={templates.length === 0}>A brand motion template{templates.length === 0 ? " (none published)" : ""}</option>
        </Select>
      </FormField>
      {start === "brief" && (
        <FormField label="Creative brief" error={errors.brief} hint="Each sentence becomes one beat: a text layer that fades and rises in on its own slot. This is a rule applied to your words; no model is called, and every keyframe it writes can be edited.">
          <TextArea rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Introduce the Arc Lamp. Show the brass finish. End on the showroom address." invalid={Boolean(errors.brief)} />
        </FormField>
      )}
      {start === "template" && (
        <FormField label="Template" error={errors.template}>
          <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Choose…</option>
            {templates.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
          </Select>
        </FormField>
      )}
      {start !== "template" && (
        <Row gap={3} wrap>
          <FormField label="Size">
            <Select value={size} onChange={(event) => setSize(event.target.value)}>
              {SIZES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Frame rate">
            <Select value={fps} onChange={(event) => setFps(event.target.value)}>
              {["12", "24", "25", "30", "60"].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
            </Select>
          </FormField>
          {start === "starter" && (
            <FormField label="Duration (s)" error={errors.duration}>
              <TextInput type="number" step="0.1" value={duration} onChange={(event) => setDuration(event.target.value)} invalid={Boolean(errors.duration)} />
            </FormField>
          )}
        </Row>
      )}
      <ModalActions><OverlayActions primary={<Button variant="primary" type="submit" form="motion-setup" busy={busy}>Create and open</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </form>
  );
}

/** Lift a static SVG's shapes into layers, one per element, at their drawn positions. */
function layersFromSvg(text: string): { width: number; height: number; background: string; layers: MotionLayer[]; skipped: string[] } {
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = parsed.querySelector("svg");
  if (!svg || parsed.querySelector("parsererror")) throw new Error("That file is not a readable SVG.");
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Number.parseFloat(svg.getAttribute("width") ?? "") || box[2] || 960;
  const height = Number.parseFloat(svg.getAttribute("height") ?? "") || box[3] || 540;
  const num = (el: Element, name: string, fallback = 0) => Number.parseFloat(el.getAttribute(name) ?? "") || fallback;
  const fillOf = (el: Element) => {
    const fill = el.getAttribute("fill") ?? "#FFFFFF";
    return /^#[0-9a-f]{3,6}$/i.test(fill) ? fill : "#FFFFFF";
  };
  const layers: MotionLayer[] = [];
  const skipped: string[] = [];
  let background = "#0E1016";
  svg.querySelectorAll("rect, circle, ellipse, text, path, polygon, image, line").forEach((el, index) => {
    const tag = el.tagName.toLowerCase();
    const base = { id: uid("lay"), visible: true, locked: false, tracks: {}, fill: fillOf(el) };
    if (tag === "rect") {
      const w = num(el, "width", width);
      const h = num(el, "height", height);
      if (index === 0 && w >= width && h >= height) { background = fillOf(el); return; }
      layers.push({ ...base, name: el.getAttribute("id") ?? `Rectangle ${layers.length + 1}`, kind: "rect", box: { x: num(el, "x"), y: num(el, "y"), w, h }, radius: num(el, "rx") });
    } else if (tag === "circle" || tag === "ellipse") {
      const rx = tag === "circle" ? num(el, "r") : num(el, "rx");
      const ry = tag === "circle" ? num(el, "r") : num(el, "ry");
      layers.push({ ...base, name: el.getAttribute("id") ?? `Ellipse ${layers.length + 1}`, kind: "ellipse", box: { x: num(el, "cx") - rx, y: num(el, "cy") - ry, w: rx * 2, h: ry * 2 } });
    } else if (tag === "text") {
      const size = num(el, "font-size", 32);
      layers.push({ ...base, name: el.getAttribute("id") ?? `Text ${layers.length + 1}`, kind: "text", text: el.textContent ?? "", textStyle: { family: "Inter", size, weight: num(el, "font-weight", 600), align: "start" }, box: { x: num(el, "x"), y: num(el, "y") - size * 0.82, w: Math.max(40, (el.textContent ?? "").length * size * 0.6), h: size * 1.2 } });
    } else if (tag === "path") {
      layers.push({ ...base, name: el.getAttribute("id") ?? `Path ${layers.length + 1}`, kind: "path", path: el.getAttribute("d") ?? "", box: { x: 0, y: 0, w: width, h: height } });
    } else {
      skipped.push(tag);
    }
  });
  return { width, height, background, layers, skipped };
}

export function ImportComposition({ context, close }: { context: ScreenContext; close: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; doc: MotionDoc; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      const text = await file.text();
      const name = file.name.replace(/\.(json|svg)$/i, "");
      if (/\.svg$/i.test(file.name) || text.trimStart().startsWith("<")) {
        const lifted = layersFromSvg(text);
        if (lifted.layers.length === 0) throw new Error("The SVG has no rectangles, circles, ellipses, paths or text to turn into layers.");
        const base = starterMotion(name);
        setPreview({
          name,
          doc: { ...base, width: Math.round(lifted.width), height: Math.round(lifted.height), background: lifted.background, layers: lifted.layers, activeLayerId: lifted.layers[0].id, states: [] },
          note: `${lifted.layers.length} vector layer(s) lifted from the SVG with no keyframes yet.${lifted.skipped.length ? ` Not imported: ${[...new Set(lifted.skipped)].join(", ")}.` : ""}`,
        });
        return;
      }
      const json = JSON.parse(text) as { title?: string; composition?: unknown; version?: number };
      const body = json.composition ?? json;
      if ((body as MotionDoc).version !== 2 || !Array.isArray((body as MotionDoc).layers)) throw new Error("That JSON is not an Arlovi composition (it needs version 2 and a layers list).");
      const doc = parseMotion(body);
      setPreview({ name: json.title ?? name, doc, note: `${doc.layers.length} layers and ${keyframeCount(doc)} keyframes, exactly as exported.` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be read.");
    }
  };

  return (
    <Stack gap={3}>
      <FormField label="Composition file" hint="An Arlovi composition (.json, from Motion Export) or a static SVG, whose shapes become layers. The file is read in this browser; nothing is uploaded.">
        <input type="file" accept=".json,.svg,application/json,image/svg+xml" aria-label="Composition file" data-testid="motion-import-file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void read(file); }} />
      </FormField>
      {error && <Notice tone="danger" title="Not imported">{error}</Notice>}
      {preview && (
        <Card eyebrow="IMPORT PREVIEW" prov="human" title={preview.name} subtitle={preview.note}>
          <Stage doc={preview.doc} time={preview.doc.duration} height={160} label={`${preview.name} preview`} />
        </Card>
      )}
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          icon={<FileUp size={14} />}
          disabled={!preview}
          busy={busy}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            try {
              const made = await context.mutate.create({
                collection: "motions", title: preview.name, status: "draft", summary: `Imported. ${preview.note}`,
                body: preview.doc, fields: { kind: "composition", imported: true },
              }, `Imported composition ${preview.name}`);
              context.select(made.id);
              close();
              context.toast("Imported", `${preview.name} is a new composition record.`);
            } finally { setBusy(false); }
          }}
        >
          Import as a new composition
        </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function targetId(context: ScreenContext): string | undefined {
  const payload = context.overlayPayload as { id?: string } | undefined;
  return payload?.id ?? context.selectedId;
}

export function AssetLibrary({ context }: { context: ScreenContext }) {
  const id = targetId(context);
  const record = useRecord(id);
  const lookup = useAssetLookup();
  const [pick, setPick] = useState("");
  const [relinkFor, setRelinkFor] = useState<string | null>(null);
  if (!record) return <Notice tone="warning" title="Select a composition first">The asset library lists the assets linked from one composition.</Notice>;
  const doc = parseMotion(record.body);
  const save = async (assets: MotionAsset[], event: string) => {
    await context.mutate.patch(record.id, { body: { ...doc, assets } }, { expectRevision: record.revision, event });
  };
  const linked = new Set(doc.assets.map((asset) => asset.recordId));
  const candidates = lookup.candidates.filter((item) => item.id !== record.id && !linked.has(item.id));

  return (
    <Stack gap={3}>
      <p className="ds-subtle">Assets are links to records in {context.org.shortName}: photos, designs and other compositions. A link whose record has gone is shown as missing until it is relinked or removed.</p>
      {doc.assets.length === 0 && <Empty title="No linked assets" icon={<Link2 size={18} />}>Link a photo or a design so the composition says where its artwork comes from.</Empty>}
      {doc.assets.map((asset) => {
        const status = lookup.status(asset);
        return (
          <Card key={asset.id} pad="tight" prov={status.found ? "human" : "unknown"} title={asset.name} subtitle={<><code className="ds-num">{asset.recordId ?? "no record"}</code> · {asset.kind}</>}
            actions={<Pill tone={status.found ? "success" : "warning"} dot>{status.found ? "linked" : "missing"}</Pill>}>
            <Stack gap={2}>
              {status.found ? <span className="ds-subtle">Resolves to “{status.title}”.</span> : <span>The record this asset points at is not in {context.org.shortName}. Layers using it draw a dashed placeholder.</span>}
              {relinkFor === asset.id ? (
                <Row gap={2} wrap>
                  <Select aria-label={`Relink ${asset.name} to`} value={pick} onChange={(event) => setPick(event.target.value)}>
                    <option value="">Choose a record…</option>
                    {candidates.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.collection})</option>)}
                  </Select>
                  <Button size="sm" variant="primary" disabled={!pick} onClick={async () => {
                    const target = lookup.candidates.find((item) => item.id === pick);
                    await save(doc.assets.map((item) => (item.id === asset.id ? { ...item, recordId: pick, collection: target?.collection } : item)), `Relinked ${asset.name} to ${target?.title ?? pick}`);
                    setRelinkFor(null); setPick("");
                  }}>Relink</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRelinkFor(null)}>Cancel</Button>
                </Row>
              ) : (
                <Row gap={1}>
                  <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => { setRelinkFor(asset.id); setPick(""); }}>Relink</Button>
                  <Button size="sm" variant="ghost" icon={<Unlink size={14} />} onClick={() => save(doc.assets.filter((item) => item.id !== asset.id), `Removed the asset link ${asset.name}`)}>Remove link</Button>
                </Row>
              )}
            </Stack>
          </Card>
        );
      })}
      <Stack gap={1}>
        <span className="ds-field-label">Link another asset</span>
        <Row gap={2}>
          <Select value={relinkFor ? "" : pick} onChange={(event) => { setRelinkFor(null); setPick(event.target.value); }} aria-label="Asset to link">
            <option value="">Choose a record…</option>
            {candidates.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.collection})</option>)}
          </Select>
          <Button variant="primary" disabled={!pick || Boolean(relinkFor)} onClick={async () => {
            const target = lookup.candidates.find((item) => item.id === pick);
            if (!target) return;
            await save([...doc.assets, { id: uid("asset"), name: target.title, kind: target.collection === "photos" ? "image" : "vector", recordId: target.id, collection: target.collection }], `Linked ${target.title}`);
            setPick("");
          }}>Link</Button>
        </Row>
      </Stack>
    </Stack>
  );
}

export function PublishTemplate({ context, close }: { context: ScreenContext; close: () => void }) {
  const id = targetId(context);
  const record = useRecord(id);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!record) return <Notice tone="warning" title="Select a composition first">Choose the composition to publish as a brand template.</Notice>;
  const doc = parseMotion(record.body);
  const already = isTemplate(record);
  return (
    <Stack gap={3}>
      <p>
        Publishing <strong>{record.title}</strong> makes it a brand motion template in {context.org.shortName}: it moves to the Templates tab and anyone here can start a new composition from it.
        Compositions already made from it are not changed.
      </p>
      {doc.reducedMotion.strategy === "none" && <Notice tone="warning" title="No reduced-motion alternative">Every composition made from this template inherits that gap. Choose an alternative in Motion Export first if you can.</Notice>}
      <Notice tone="info" title="Inside this workspace only">Publishing to a public CDN or a brand portal needs a hosting connection, which is not connected. Nothing leaves this browser.</Notice>
      <FormField label="Note for people using the template">
        <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Use for product launches; keep the accent bar papaya." />
      </FormField>
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={already}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(record.id, {
                status: "published",
                fields: { ...record.fields, kind: "template", publishedBy: context.actor, publishedAt: clockIso(), templateNote: note },
              }, { expectRevision: record.revision, event: `Published ${record.title} as a brand motion template` });
              if (saved) { close(); context.setTab("Templates"); }
            } finally { setBusy(false); }
          }}
        >
          {already ? "Already a template" : "Publish as a template"}
        </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}
