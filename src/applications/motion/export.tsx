import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, Download, TriangleAlert } from "lucide-react";
import { Button, Card, DataGrid, Empty, Grid, Meter, Notice, Pill, Row, Select, Stack, TextArea, TextInput, ModalActions, OverlayActions, OverlayCancel } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { CAPABILITY_LABELS, capabilityById } from "@/platform/capability";
import {
  EditorFrame, NumberBox, PanelGroup, SaveState, createStore, downloadBlob, downloadText, slug, useStore, type DocHandle,
} from "@/applications/visual/kit";
import { uid } from "@/applications/visual/geometry";
import {
  compatibility, featuresUsed, lottieGaps, sampleAll, toCss, toHtml, toSvgAnimation,
  type ExportFormat, type ExportPreset, type MotionDoc, type MotionRender, type MotionTest, type Support,
} from "./anim";
import { motionUi } from "./model";
import { Stage, TransportRow, reducedFrame } from "./parts";
import { recorderSupport, renderGif, renderWebm } from "./render";
import { MissingComposition, current, useMotionDoc, useSession, FormField } from "./shared";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * ARL-MOTION-005 — Motion Export
 * ====================================================================== */

export const FORMATS: { id: ExportFormat; name: string; kind: "text" | "raster" | "none"; ext: string; mime: string; blurb: string }[] = [
  { id: "css", name: "CSS animation", kind: "text", ext: "css", mime: "text/css", blurb: "@keyframes per layer with the layout and the markup it expects." },
  { id: "html", name: "HTML page", kind: "text", ext: "html", mime: "text/html", blurb: "The CSS in a self-contained page you can open and check." },
  { id: "svg", name: "SVG animation", kind: "text", ext: "svg", mime: "image/svg+xml", blurb: "An animated SVG; CSS inside the file, so reduced motion applies." },
  { id: "webm", name: "Video (WebM)", kind: "raster", ext: "webm", mime: "video/webm", blurb: "Recorded in real time from a canvas by this browser's encoder." },
  { id: "gif", name: "GIF", kind: "raster", ext: "gif", mime: "image/gif", blurb: "Encoded here frame by frame, on a fixed 252-colour palette." },
  { id: "json", name: "Composition (JSON)", kind: "text", ext: "json", mime: "application/json", blurb: "The editable composition, which Motion Projects can import." },
  { id: "lottie", name: "Lottie", kind: "none", ext: "json", mime: "application/json", blurb: "Not produced: the gaps are listed rather than a file a player would reject." },
];

export interface ExportOptions { format: ExportFormat; width: number; fps: number; loop: boolean; reduced: boolean }

export const exportOptions = createStore<ExportOptions>({ format: "css", width: 960, fps: 30, loop: true, reduced: false });

export const renderProgress = createStore<{ id?: string; frame: number; frames: number; format?: string; cancel?: { cancelled: boolean } }>({ frame: 0, frames: 0 });

const LEVEL_TONE: Record<Support, "success" | "warning" | "danger"> = { exact: "success", approximated: "warning", unsupported: "danger" };

function textFile(doc: MotionDoc, title: string, format: ExportFormat, loop: boolean): string {
  const target = { ...doc, loop };
  if (format === "css") return toCss(target, `.${slug(title)}`);
  if (format === "html") return toHtml(target, title);
  if (format === "svg") return toSvgAnimation(target, title);
  return JSON.stringify({ title, exportedAt: clockIso(), format: "arlovi-motion", composition: { ...target, renders: [], tests: [] } }, null, 2);
}

async function writeRender(recordId: string, change: (doc: MotionDoc) => MotionDoc, label: string, context: ScreenContext): Promise<void> {
  const open = current();
  if (open && open.recordId === recordId) { open.handle.edit(change, label); return; }
  /* The editor was left while the render ran: write to the record directly. */
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(recordId);
  if (!record) return;
  const { parseMotion } = await import("./model");
  await context.mutate.patch(recordId, { body: change(parseMotion(record.body)) }, { event: label });
}

/** Write a text export to a file and record it. */
export function exportText(context: ScreenContext, options: ExportOptions): { name: string; bytes: number } | null {
  const open = current();
  if (!open) return null;
  const format = FORMATS.find((item) => item.id === options.format);
  if (!format || format.kind !== "text") return null;
  const text = textFile(open.doc, open.title, options.format, options.loop);
  const name = `${slug(open.title)}${format.id === "json" ? ".motion" : ""}.${format.ext}`;
  downloadText(name, text, format.mime);
  const bytes = new Blob([text]).size;
  const unsupported = compatibility(open.doc, options.format).filter((row) => row.level !== "exact").map((row) => `${row.feature.label}: ${row.level}`);
  const entry: MotionRender = { id: uid("rnd"), at: clockIso(), by: context.actor, format: format.id, state: "done", artifact: name, bytes, note: `${format.name}. Reduced motion: ${open.doc.reducedMotion.strategy}.${unsupported.length ? ` Declared: ${unsupported.join("; ")}.` : ""}` };
  open.handle.edit((doc) => ({ ...doc, renders: [entry, ...doc.renders] }), `Export ${format.name}`);
  return { name, bytes };
}

/** Queue and run a raster render in this browser; the file downloads when it finishes. */
export async function runRender(context: ScreenContext, options: ExportOptions): Promise<void> {
  const open = current();
  if (!open) return;
  const format = FORMATS.find((item) => item.id === options.format);
  if (!format || format.kind !== "raster") return;
  const id = uid("rnd");
  const cancel = { cancelled: false };
  const doc = { ...open.doc, loop: options.loop };
  const recordId = open.recordId;
  const title = open.title;
  const entry: MotionRender = { id, at: clockIso(), by: context.actor, format: format.id, state: "rendering", note: `${options.width}px wide at ${options.fps} fps${options.reduced ? ", reduced-motion alternative" : ""}.` };
  open.handle.edit((current) => ({ ...current, renders: [entry, ...current.renders] }), `Render ${format.name}`);
  renderProgress.set({ id, frame: 0, frames: Math.round(doc.duration * options.fps), format: format.id, cancel });
  const onProgress = (progress: { frame: number; frames: number }) => renderProgress.set((current) => ({ ...current, ...progress }));
  try {
    const result = format.id === "gif"
      ? await renderGif(doc, { width: options.width, fps: options.fps, loop: options.loop, reduced: options.reduced, onProgress, signal: cancel })
      : await renderWebm(doc, { width: options.width, fps: options.fps, reduced: options.reduced, onProgress, signal: cancel });
    if (cancel.cancelled) throw new Error("Cancelled before the last frame. No file was written.");
    const name = `${slug(title)}${options.reduced ? "-reduced" : ""}.${format.ext}`;
    downloadBlob(name, result.blob);
    await writeRender(recordId, (current) => ({ ...current, renders: current.renders.map((item) => (item.id === id ? { ...item, state: "done", artifact: name, bytes: result.blob.size, note: `${item.note} ${result.frames} frames.` } : item)) }), `Rendered ${name}`, context);
    context.toast("Rendered", `${name} (${(result.blob.size / 1024).toFixed(1)} KB, ${result.frames} frames) was written by this browser.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The render failed.";
    await writeRender(recordId, (current) => ({ ...current, renders: current.renders.map((item) => (item.id === id ? { ...item, state: "failed", note: `${item.note} ${message}` } : item)) }), "Render failed", context);
    context.toast("Render failed", message, "failed");
  } finally {
    renderProgress.set({ frame: 0, frames: 0 });
  }
}

/** Check the reduced-motion alternative: declared, in every text output, and free of movement. */
export function testFallback(handle: DocHandle<MotionDoc>, actor: string, title: string): MotionTest | null {
  const doc = handle.doc;
  if (!doc) return null;
  const findings: string[] = [];
  let pass = true;
  if (doc.reducedMotion.strategy === "none") { pass = false; findings.push("No alternative is declared: reduced-motion viewers get the full animation."); }
  const css = toCss(doc, ".m");
  const svg = toSvgAnimation(doc, title);
  for (const [name, text] of [["CSS", css], ["SVG", svg]] as const) {
    const has = text.includes("@media (prefers-reduced-motion: reduce)");
    if (!has) pass = false;
    findings.push(`${name} ${has ? "carries" : "does not carry"} a prefers-reduced-motion rule.`);
  }
  if (doc.reducedMotion.strategy !== "none") {
    const frames = Math.round(doc.duration * doc.fps);
    let travel = 0;
    let scaleChange = 0;
    const first = sampleAll(doc, reducedFrame(doc, 0).time);
    for (let frame = 1; frame <= frames; frame += 1) {
      const sample = sampleAll(doc, reducedFrame(doc, frame / doc.fps).time);
      sample.forEach((layer, index) => {
        travel = Math.max(travel, Math.hypot(layer.x - first[index].x, layer.y - first[index].y));
        scaleChange = Math.max(scaleChange, Math.abs(layer.scale - first[index].scale), Math.abs(layer.rotation - first[index].rotation) / 90);
      });
    }
    const still = travel < 0.5 && scaleChange < 0.001;
    if (!still) pass = false;
    findings.push(still ? `Sampled ${frames} frames of the alternative: nothing moves, scales or turns.` : `The alternative still moves: up to ${travel.toFixed(1)}px of travel.`);
    findings.push(doc.reducedMotion.strategy === "cross-fade" ? "The alternative fades in over 0.4s into the final frame." : "The alternative shows the first frame and holds it.");
  }
  const test: MotionTest = { id: uid("test"), kind: "fallback", at: clockIso(), by: actor, pass, findings };
  handle.edit((current) => ({ ...current, tests: [test, ...current.tests].slice(0, 30) }), pass ? "Reduced-motion fallback passed" : "Reduced-motion fallback failed");
  return test;
}

/* ------------------------------ screen ------------------------------ */

export function ExportScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, doc, playback } = useMotionDoc(context);
  const ui = useStore(motionUi);
  const options = useStore(exportOptions);
  const ready = Boolean(doc);
  /* Start each composition's options from its own size, rate and loop. */
  useEffect(() => {
    const opened = current();
    if (opened) exportOptions.set((currentOptions) => ({ ...currentOptions, width: opened.doc.width, fps: opened.doc.fps, loop: opened.doc.loop }));
  }, [record?.id, ready]);
  if (!record) return <div className="pg-body"><MissingComposition context={context} /></div>;
  const tab = context.tab || "Formats";
  return (
    <EditorFrame
      context={context}
      lean
      actions={actions}
      tabs={[{ id: "Formats" }, { id: "Presets" }, { id: "Queue" }, { id: "History" }]}
      title={`${record.title} — export`}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{doc.duration}s</span> · <span className="ds-num">{doc.fps}</span> fps · reduced motion: {doc.reducedMotion.strategy}</span>}</Row>}
      backTo={{ label: "Motion", to: `/o/${context.org.slug}/motion/projects` }}
      right={doc ? <QualityPanel doc={doc} options={options} context={context} /> : null}
      rightLabel="Before export"
      status={<><span>Format: {FORMATS.find((item) => item.id === options.format)?.name}</span><span className="ds-num">{options.width}px · {options.fps} fps</span><span className="ds-grow" /><span>Files are written by this browser; nothing is uploaded</span></>}
    >
      <div className="mo-scroll" style={{ position: "absolute", inset: 0 }}>
        {doc && (
          <Stack gap={3} style={{ padding: "var(--space-3)" }}>
            <Row gap={3} wrap style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 280px" }}><span className="ds-eyebrow">FULL MOTION</span><Stage doc={doc} time={ui.time} height={170} /></div>
              <div style={{ flex: "1 1 280px" }}><span className="ds-eyebrow">REDUCED-MOTION ALTERNATIVE</span><Stage doc={doc} time={ui.time} height={170} reduced /></div>
            </Row>
            <TransportRow doc={doc} fps={playback.fps} />
            {tab === "Formats" && <FormatsTab doc={doc} options={options} context={context} />}
            {tab === "Presets" && <PresetsTab handle={handle} doc={doc} options={options} />}
            {tab === "Queue" && <QueueTab doc={doc} context={context} />}
            {tab === "History" && <HistoryTab doc={doc} context={context} />}
          </Stack>
        )}
      </div>
    </EditorFrame>
  );
}

function FormatsTab({ doc, options, context }: { doc: MotionDoc; options: ExportOptions; context: ScreenContext }) {
  const support = recorderSupport();
  return (
    <Grid>
      {FORMATS.map((format) => {
        const rows = compatibility(doc, format.id);
        const counts = { exact: rows.filter((row) => row.level === "exact").length, approximated: rows.filter((row) => row.level === "approximated").length, unsupported: rows.filter((row) => row.level === "unsupported").length };
        const unavailable = format.kind === "none" ? "No Lottie writer in this build." : format.id === "webm" && !support.webm ? support.reason : undefined;
        const chosen = options.format === format.id;
        return (
          <Card key={format.id} span={4} eyebrow={format.kind === "raster" ? "RENDER" : format.kind === "text" ? "FILE" : "NOT PRODUCED"} title={format.name} subtitle={format.blurb} className={chosen ? "mo-selected" : undefined}
            actions={<Button size="sm" variant={chosen ? "primary" : "secondary"} disabled={Boolean(unavailable)} aria-pressed={chosen} onClick={() => exportOptions.set((current) => ({ ...current, format: format.id }))}>{chosen ? "Chosen" : "Choose"}</Button>}>
            <Stack gap={2}>
              <Row gap={1} wrap>
                <Pill tone="success">{counts.exact} exact</Pill>
                {counts.approximated > 0 && <Pill tone="warning">{counts.approximated} approximated</Pill>}
                {counts.unsupported > 0 && <Pill tone="danger">{counts.unsupported} unsupported</Pill>}
              </Row>
              {unavailable && <span className="vx-mini">{unavailable}</span>}
              {format.id === "lottie" && <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "var(--text-xs)" }}>{lottieGaps(doc).map((gap) => <li key={gap}>{gap}</li>)}</ul>}
              <Button size="sm" variant="ghost" onClick={() => { exportOptions.set((current) => ({ ...current, format: format.id })); context.openOverlay("compatibility"); }}>Compatibility detail</Button>
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

function PresetsTab({ handle, doc, options }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; options: ExportOptions }) {
  const [name, setName] = useState("");
  return (
    <Stack gap={3}>
      <DataGrid<ExportPreset>
        label="Export presets"
        rows={doc.presets}
        rowId={(row) => row.id}
        filterable={false}
        empty={<Empty title="No presets">Save the current options as a preset.</Empty>}
        columns={[
          { key: "name", header: "Preset", primary: true, cell: (row) => row.name },
          { key: "format", header: "Format", cell: (row) => <code className="ds-num">{row.format}</code> },
          { key: "width", header: "Width", align: "end", cell: (row) => <span className="ds-num">{row.width}px</span> },
          { key: "fps", header: "Rate", align: "end", cell: (row) => <span className="ds-num">{row.fps} fps</span> },
          { key: "loop", header: "Loop", cell: (row) => (row.loop ? "loops" : "once") },
          { key: "use", header: "", cell: (row) => (
            <Row gap={1}>
              <Button size="sm" variant="secondary" onClick={() => exportOptions.set((current) => ({ ...current, format: row.format, width: row.width, fps: row.fps, loop: row.loop }))}>Use</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete the preset ${row.name}`} onClick={() => handle.edit((current) => ({ ...current, presets: current.presets.filter((item) => item.id !== row.id) }), `Delete the preset ${row.name}`)}>Delete</Button>
            </Row>
          ) },
        ]}
      />
      <Row gap={2} wrap style={{ alignItems: "flex-end" }}>
        <FormField label="Save the current options as"><TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Launch sting, GIF" /></FormField>
        <Button variant="secondary" disabled={!name.trim()} onClick={() => { handle.edit((current) => ({ ...current, presets: [...current.presets, { id: uid("pre"), name: name.trim(), format: options.format, width: options.width, fps: options.fps, loop: options.loop }] }), `Save the preset ${name.trim()}`); setName(""); }}>Save preset</Button>
        <span className="vx-mini">Current: {options.format}, {options.width}px, {options.fps} fps, {options.loop ? "loops" : "once"}.</span>
      </Row>
    </Stack>
  );
}

function QueueTab({ doc, context }: { doc: MotionDoc; context: ScreenContext }) {
  const progress = useStore(renderProgress);
  const queue = doc.renders.filter((render) => render.state === "queued" || render.state === "rendering" || render.state === "failed");
  if (queue.length === 0) return <Empty title="Nothing in the queue" icon={<Download size={18} />} action={<Button variant="primary" onClick={() => context.openOverlay("Export options", { mode: "render" })}>Render</Button>}>Renders run here in this browser, one at a time, and appear in History when their file is written.</Empty>;
  return (
    <Stack gap={2}>
      {queue.map((render) => {
        const running = progress.id === render.id;
        const stale = render.state === "rendering" && !running;
        return (
          <Card key={render.id} pad="tight" prov="human" title={`${render.format.toUpperCase()} — ${render.state === "rendering" && stale ? "interrupted" : render.state}`} subtitle={`${render.by} · ${context.dateTime(render.at)} · ${render.note}`}
            actions={running ? <Button size="sm" variant="outline-danger" onClick={() => { if (progress.cancel) progress.cancel.cancelled = true; }}>Cancel</Button> : undefined}>
            {running ? <Meter value={progress.frame} max={Math.max(1, progress.frames)} label={`Frame ${progress.frame} of ${progress.frames}`} />
              : stale ? <span className="vx-mini">This render stopped when the page was left or reloaded; no file was written. Render again.</span>
                : <span className="vx-mini">{render.note}</span>}
          </Card>
        );
      })}
    </Stack>
  );
}

function HistoryTab({ doc, context }: { doc: MotionDoc; context: ScreenContext }) {
  const done = doc.renders.filter((render) => render.state === "done" || render.state === "published");
  return (
    <DataGrid<MotionRender>
      label="Export history"
      rows={done}
      rowId={(row) => row.id}
      empty={<Empty title="Nothing exported yet" icon={<Download size={18} />}>Each file written by Export or Render is listed with its size and who made it.</Empty>}
      columns={[
        { key: "artifact", header: "File", primary: true, cell: (row) => <code className="ds-num">{row.artifact ?? "—"}</code>, sortValue: (row) => row.artifact ?? "" },
        { key: "format", header: "Format", cell: (row) => row.format },
        { key: "bytes", header: "Size", align: "end", cell: (row) => <span className="ds-num">{row.bytes ? `${(row.bytes / 1024).toFixed(1)} KB` : "—"}</span>, sortValue: (row) => row.bytes ?? 0 },
        { key: "publish", header: "Publish", cell: (row) => (row.publish ? <Pill tone="info">{CAPABILITY_LABELS[row.publish.state]}</Pill> : "—") },
        { key: "by", header: "By", cell: (row) => row.by, hideBelow: 700 },
        { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
        { key: "note", header: "Notes", cell: (row) => <span className="vx-mini">{row.note}</span>, hideBelow: 1100 },
      ]}
    />
  );
}

function QualityPanel({ doc, options, context }: { doc: MotionDoc; options: ExportOptions; context: ScreenContext }) {
  const rows = compatibility(doc, options.format);
  const fallback = doc.tests.find((test) => test.kind === "fallback");
  return (
    <Stack gap={3}>
      <PanelGroup title="Quality">
        <NumberBox label="Width" suffix="px" value={options.width} step={10} min={64} max={3840} onChange={(width) => exportOptions.set((current) => ({ ...current, width: Math.max(64, Math.min(3840, Math.round(width))) }))} />
        <span className="vx-mini">Height follows: <span className="ds-num">{Math.round((options.width * doc.height) / doc.width)}px</span>.</span>
        <FormField label="Frame rate">
          <Select value={String(options.fps)} onChange={(event) => exportOptions.set((current) => ({ ...current, fps: Number(event.target.value) }))}>
            {[10, 12, 15, 24, 25, 30, 60].map((rate) => <option key={rate} value={rate}>{rate} fps{rate === doc.fps ? " (composition)" : ""}</option>)}
          </Select>
        </FormField>
        <label className="ds-check"><input type="checkbox" checked={options.loop} onChange={(event) => exportOptions.set((current) => ({ ...current, loop: event.target.checked }))} /><span>Loop</span></label>
      </PanelGroup>
      <PanelGroup title={`What ${FORMATS.find((item) => item.id === options.format)?.name} carries`}>
        {rows.map((row) => (
          <Row key={row.feature.id} gap={2}>
            {row.level === "exact" ? <CheckCircle2 size={14} aria-hidden="true" /> : row.level === "approximated" ? <TriangleAlert size={14} aria-hidden="true" /> : <CircleSlash size={14} aria-hidden="true" />}
            <span className="ds-grow" style={{ fontSize: "var(--text-xs)" }}>{row.feature.label}</span>
            <Pill tone={LEVEL_TONE[row.level]}>{row.level}</Pill>
          </Row>
        ))}
        <Button size="sm" variant="ghost" onClick={() => context.openOverlay("compatibility")}>Full matrix</Button>
      </PanelGroup>
      <PanelGroup title="Reduced motion">
        <Pill tone={doc.reducedMotion.strategy === "none" ? "danger" : "success"} dot>{doc.reducedMotion.strategy}</Pill>
        {fallback ? <span className="vx-mini">Fallback test {fallback.pass ? "passed" : "failed"} · {context.dateTime(fallback.at)}</span> : <span className="vx-mini">The fallback has not been tested.</span>}
        {doc.fallbackReview ? <span className="vx-mini">Reviewed by {doc.fallbackReview.by}.</span> : <span className="vx-mini">Not reviewed by a person.</span>}
      </PanelGroup>
      {doc.review.state === "required" && <Notice tone="danger" title="Accessibility review required">Easing & Timing found {doc.review.reasons.join("; ")}. Publishing waits for the review.</Notice>}
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function ExportOptionsOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const { doc } = useSession();
  const options = useStore(exportOptions);
  const progress = useStore(renderProgress);
  const mode = ((context.overlayPayload as { mode?: "render" | "export" } | undefined)?.mode) ?? "export";
  const choices = FORMATS.filter((format) => (mode === "render" ? format.kind === "raster" : format.kind !== "raster"));
  const format = choices.find((item) => item.id === options.format) ?? choices[0];
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const support = recorderSupport();
  if (!doc) return null;
  const rows = compatibility(doc, format.id);
  const declared = rows.filter((row) => row.level !== "exact");
  const blocked = format.kind === "none" ? "Lottie is not produced in this build." : format.id === "webm" && !support.webm ? support.reason : undefined;
  return (
    <Stack gap={3}>
      <Row gap={3} wrap>
        <FormField label="Format">
          <Select value={format.id} onChange={(event) => { exportOptions.set((current) => ({ ...current, format: event.target.value as ExportFormat })); setAcknowledged(false); }}>
            {choices.map((item) => <option key={item.id} value={item.id} disabled={item.kind === "none" || (item.id === "webm" && !support.webm)}>{item.name}{item.kind === "none" ? " — not produced" : ""}</option>)}
          </Select>
        </FormField>
        {format.kind === "raster" && <NumberBox label="Width" suffix="px" value={options.width} step={10} min={64} onChange={(width) => exportOptions.set((current) => ({ ...current, width: Math.max(64, Math.round(width)) }))} />}
        {format.kind === "raster" && (
          <FormField label="Frame rate">
            <Select value={String(options.fps)} onChange={(event) => exportOptions.set((current) => ({ ...current, fps: Number(event.target.value) }))}>{[10, 12, 15, 24, 25, 30].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}</Select>
          </FormField>
        )}
      </Row>
      <Row gap={3} wrap>
        <label className="ds-check"><input type="checkbox" checked={options.loop} onChange={(event) => exportOptions.set((current) => ({ ...current, loop: event.target.checked }))} /><span>Loop</span></label>
        {format.kind === "raster" && <label className="ds-check"><input type="checkbox" checked={options.reduced} onChange={(event) => exportOptions.set((current) => ({ ...current, reduced: event.target.checked }))} /><span>Render the reduced-motion alternative instead</span></label>}
      </Row>
      <span className="vx-mini">{format.blurb}</span>
      {format.kind === "raster" && <span className="vx-mini">A video or GIF cannot respond to prefers-reduced-motion; render the alternative as its own file if it will be shown to people who ask for it.</span>}

      <PanelGroup title="Declared before export">
        {declared.length === 0 ? <Notice tone="success" title="Everything this composition uses is carried exactly" /> : (
          <Notice tone={declared.some((row) => row.level === "unsupported") ? "danger" : "warning"} title={`${declared.length} feature${declared.length === 1 ? "" : "s"} will not come through exactly`}>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {declared.map((row) => <li key={row.feature.id}><strong>{row.feature.label}</strong> ({row.feature.layers.join(", ")}): {row.level}{row.note ? `. ${row.note}` : ""}</li>)}
            </ul>
          </Notice>
        )}
        {declared.length > 0 && <label className="ds-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I have read what this format cannot carry</span></label>}
        {doc.reducedMotion.strategy === "none" && <Notice tone="warning" title="No reduced-motion alternative">The file will say so in a comment. Choose one on the composition's Preview tab.</Notice>}
        {doc.review.state === "required" && <Notice tone="warning" title="Accessibility review outstanding">{doc.review.reasons.join("; ")}.</Notice>}
      </PanelGroup>

      {progress.frames > 0 && <Meter value={progress.frame} max={progress.frames} label={`Rendering frame ${progress.frame} of ${progress.frames}`} />}
      {blocked && <Notice tone="danger" title="Not available">{blocked}</Notice>}
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || (declared.length > 0 && !acknowledged) || progress.frames > 0}
          data-testid="motion-export-confirm"
          onClick={async () => {
            if (format.kind === "text") {
              const written = exportText(context, { ...options, format: format.id });
              if (written) { context.toast("Exported", `${written.name} (${(written.bytes / 1024).toFixed(1)} KB) was written by this browser.`); close(); }
              return;
            }
            setBusy(true);
            try { await runRender(context, { ...options, format: format.id }); } finally { setBusy(false); }
            close();
          }}
        >
          {format.kind === "raster" ? `Render ${format.name}` : `Export ${format.name}`}
        </Button>} end={<OverlayCancel>{progress.frames > 0 ? "Hide (keeps rendering)" : "Cancel"}</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

export function ReducedMotionReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const { handle, doc } = useSession();
  const ui = useStore(motionUi);
  const [note, setNote] = useState("");
  if (!handle || !doc) return null;
  const latest = doc.tests.find((test) => test.kind === "fallback");
  return (
    <Stack gap={3}>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 220px" }}><span className="ds-eyebrow">FULL</span><Stage doc={doc} time={ui.time} height={150} /></div>
        <div style={{ flex: "1 1 220px" }}><span className="ds-eyebrow">ALTERNATIVE</span><Stage doc={doc} time={ui.time} height={150} reduced /></div>
      </Row>
      <Row gap={2}><Button size="sm" variant="secondary" onClick={() => motionUi.set((current) => ({ ...current, time: 0, playing: true }))}>Play both from the start</Button></Row>
      <FormField label="Alternative">
        <Select value={doc.reducedMotion.strategy} onChange={(event) => handle.edit((current) => ({ ...current, reducedMotion: { ...current.reducedMotion, strategy: event.target.value as MotionDoc["reducedMotion"]["strategy"] } }), "Reduced-motion alternative")}>
          <option value="cross-fade">Cross-fade into the final frame</option>
          <option value="static-first-frame">Static first frame</option>
          <option value="none">None</option>
        </Select>
      </FormField>
      {latest ? (
        <Notice tone={latest.pass ? "success" : "danger"} title={`Fallback test ${latest.pass ? "passed" : "failed"}`}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{latest.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
        </Notice>
      ) : <Notice title="Not tested yet">Test fallback checks the alternative is declared, written into the CSS and SVG, and free of movement.</Notice>}
      {doc.fallbackReview && <span className="vx-mini">Reviewed by {doc.fallbackReview.by} on {context.dateTime(doc.fallbackReview.at)}: {doc.fallbackReview.note}</span>}
      <FormField label="Review note" hint="What you checked, for example that the alternative still says everything the full motion says.">
        <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      <ModalActions><OverlayActions primary={<Button variant="primary" disabled={note.trim().length < 6 || doc.reducedMotion.strategy === "none"} onClick={() => { handle.edit((current) => ({ ...current, fallbackReview: { by: context.actor, at: clockIso(), note: note.trim() } }), "Reduced-motion alternative reviewed"); close(); }}>Record the review</Button>} end={<OverlayCancel>Close</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

export function CompatibilityOverlay() {
  const { doc } = useSession();
  const features = useMemo(() => (doc ? featuresUsed(doc) : []), [doc]);
  if (!doc) return null;
  const formats = FORMATS.filter((format) => format.id !== "json");
  return (
    <Stack gap={3}>
      <p className="vx-mini">Each row is something this composition uses; each column a format. This is decided by rules in this build, checked against what each writer here produces.</p>
      <div style={{ overflowX: "auto" }}>
        <table className="ds-table">
          <thead><tr><th scope="col">Uses</th>{formats.map((format) => <th key={format.id} scope="col">{format.name}</th>)}</tr></thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.id}>
                <th scope="row" style={{ fontWeight: 500 }}>{feature.label}<div className="vx-mini">{feature.layers.join(", ")}</div></th>
                {formats.map((format) => {
                  const row = compatibility(doc, format.id).find((item) => item.feature.id === feature.id);
                  return <td key={format.id} title={row?.note}><Pill tone={LEVEL_TONE[row?.level ?? "unsupported"]}>{row?.level ?? "unsupported"}</Pill></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PanelGroup title="Lottie">
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "var(--text-xs)" }}>{lottieGaps(doc).map((gap) => <li key={gap}>{gap}</li>)}</ul>
      </PanelGroup>
    </Stack>
  );
}

export function PublishExport({ context, close }: { context: ScreenContext; close: () => void }) {
  const { handle, doc } = useSession();
  const hosting = capabilityById("site.publish");
  const latest = doc?.renders.find((render) => render.state === "done");
  if (!handle || !doc || !latest) return <Notice tone="warning" title="Nothing to publish yet">Export or render a file first.</Notice>;
  return (
    <Stack gap={3}>
      <p>Publish <code className="ds-num">{latest.artifact}</code> ({latest.format}, {latest.bytes ? `${(latest.bytes / 1024).toFixed(1)} KB` : "size unknown"}) to the brand asset host.</p>
      <Notice tone="warning" title={`${hosting?.provider ?? "Hosting"}: ${CAPABILITY_LABELS[hosting?.state ?? "not_connected"]}`}>
        {hosting?.note} The publication is recorded here as queued locally, with who asked and when. Nothing leaves this browser, and no public URL exists.
      </Notice>
      <ModalActions><OverlayActions primary={<Button variant="primary" onClick={async () => {
          const at = clockIso();
          handle.edit((current) => ({ ...current, renders: current.renders.map((render) => (render.id === latest.id ? { ...render, publish: { state: "queued_local", at, by: context.actor } } : render)) }), `Publish ${latest.artifact} queued locally`);
          await context.mutate.log(`Publish of ${latest.artifact} queued locally; hosting is not connected, nothing left the browser.`, { entityId: current()?.recordId, type: "publish", capability: "queued_local" });
          context.setTab("History");
          close();
        }}>Queue the publication locally</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}
