/* ====================================================================== *
 * Batch processing and export, shared by the screens and their actions.
 *
 * The queue, its settings and the files a run produced live in stores here
 * rather than in a panel's local state, so the screen's actions (build,
 * test, execute, download, export, add to the library) drive the same run
 * the panel shows, and switching tab does not drop a queue half way.
 * A blob is held only for this session; the record keeps what was written.
 * ====================================================================== */

import type { ScreenContext } from "@/platform/registry";
import { createStore, downloadBlob, slug } from "@/applications/visual/kit";
import { readShared } from "@/applications/design/sharedDoc";
import { exportComposite, loadImage, type RasterDoc } from "./raster";
import { parsePhoto } from "./model";

export type Format = "png" | "jpeg" | "webp";

export interface BatchJob {
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

export interface BatchState {
  jobs: BatchJob[];
  chosen: string[];
  format: Format;
  quality: number;
  longEdge: number;
  pattern: string;
  running: boolean;
  done: number;
}

export const batchUi = createStore<BatchState>({
  jobs: [], chosen: [], format: "jpeg", quality: 0.82, longEdge: 1600, pattern: "{name}-{w}x{h}", running: false, done: 0,
});

const HELD = new Map<string, { name: string; blob: Blob }>();

export function heldBatchFiles(): { name: string; blob: Blob }[] {
  return batchUi.get().jobs.filter((job) => job.state === "done").map((job) => HELD.get(job.id)).filter((item): item is { name: string; blob: Blob } => Boolean(item));
}

export async function loadBank(doc: RasterDoc): Promise<{ images: Map<string, HTMLImageElement>; masks: Map<string, HTMLImageElement> }> {
  const images = new Map<string, HTMLImageElement>();
  const masks = new Map<string, HTMLImageElement>();
  for (const layer of doc.layers) {
    if (layer.src) images.set(layer.id, await loadImage(layer.src));
    if (layer.mask) masks.set(layer.id, await loadImage(layer.mask));
  }
  return { images, masks };
}

function extension(format: Format): string {
  return format === "jpeg" ? "jpg" : format;
}

/** Deterministic names: a collision in this run gets a counter, in queue order, never an overwrite. */
function nameFor(title: string, width: number, height: number, taken: Set<string>): string {
  const state = batchUi.get();
  const root = state.pattern.replace("{name}", slug(title)).replace("{w}", String(width)).replace("{h}", String(height));
  let candidate = `${root}.${extension(state.format)}`;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-${counter}.${extension(state.format)}`;
    counter += 1;
  }
  return candidate;
}

export function buildBatch(context: ScreenContext, titles: Map<string, string>): void {
  const state = batchUi.get();
  if (state.chosen.length === 0) {
    context.toast("Nothing chosen", "Tick the images to include on the Queue tab first.", "blocked");
    return;
  }
  const jobs = state.chosen.map((id) => ({ id: `job-${id}`, recordId: id, title: titles.get(id) ?? id, state: "queued" as const }));
  batchUi.set((current) => ({ ...current, jobs, done: 0 }));
  context.toast("Batch built", `${jobs.length} job${jobs.length === 1 ? "" : "s"} queued. Nothing has been written yet.`);
}

async function runOne(job: BatchJob, taken: Set<string>): Promise<BatchJob> {
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(job.recordId);
  if (!record) return { ...job, state: "failed", reason: "The record is no longer in this workspace." };
  try {
    const doc = parsePhoto(record.body);
    const { images, masks } = await loadBank(doc);
    const state = batchUi.get();
    const scale = state.longEdge / Math.max(doc.width, doc.height);
    const width = Math.max(1, Math.round(doc.width * Math.min(1, scale)));
    const height = Math.max(1, Math.round(doc.height * Math.min(1, scale)));
    const result = await exportComposite(doc, images, masks, {
      format: state.format, quality: state.quality, width, height,
      background: state.format === "jpeg" ? "#ffffff" : undefined,
    });
    if (result.blob.size === 0) return { ...job, state: "failed", reason: "The encoder produced an empty file." };
    const outName = nameFor(record.title, width, height, taken);
    taken.add(outName);
    HELD.set(job.id, { name: outName, blob: result.blob });
    downloadBlob(outName, result.blob);
    return { ...job, state: "done", outName, bytes: result.blob.size, width, height, reason: undefined };
  } catch (error) {
    return { ...job, state: "failed", reason: error instanceof Error ? error.message : "The browser could not encode this image." };
  }
}

/** Run every queued job (or every failed one). Done jobs are skipped, so a stopped run resumes. */
export async function runBatch(context: ScreenContext, onlyFailed = false): Promise<void> {
  const state = batchUi.get();
  if (state.running) { context.toast("Already running", "The batch is still working through its queue.", "blocked"); return; }
  const queue = state.jobs.filter((job) => (onlyFailed ? job.state === "failed" : job.state === "queued" || job.state === "running"));
  if (queue.length === 0) { context.toast("Nothing to run", onlyFailed ? "No job has failed." : "Build the batch first; every built job has already run.", "blocked"); return; }
  const taken = new Set(state.jobs.filter((job) => job.state === "done" && job.outName).map((job) => job.outName!));
  batchUi.set((current) => ({ ...current, running: true }));
  let written = 0;
  let failed = 0;
  try {
    for (const job of queue) {
      batchUi.set((current) => ({ ...current, jobs: current.jobs.map((item) => (item.id === job.id ? { ...item, state: "running" } : item)) }));
      const result = await runOne(job, taken);
      if (result.state === "done") written += 1; else failed += 1;
      batchUi.set((current) => ({ ...current, done: current.done + 1, jobs: current.jobs.map((item) => (item.id === job.id ? result : item)) }));
    }
  } finally {
    batchUi.set((current) => ({ ...current, running: false }));
  }
  await context.mutate.log(`Photo batch: ${written} files written, ${failed} failed`, { type: "export" });
  context.toast(failed ? "Batch finished with failures" : "Batch finished", `${written} file${written === 1 ? "" : "s"} written from this browser${failed ? `; ${failed} failed and are on the Failed tab` : ""}.`, failed ? "failed" : "ok");
}

export async function testSample(context: ScreenContext): Promise<void> {
  const state = batchUi.get();
  const id = state.chosen[0];
  if (!id) { context.toast("Nothing chosen", "Tick at least one image on the Queue tab.", "blocked"); return; }
  batchUi.set((current) => ({ ...current, running: true }));
  try {
    const taken = new Set<string>();
    const result = await runOne({ id: "sample", recordId: id, title: id, state: "queued" }, taken);
    context.toast(
      result.state === "done" ? "Sample written" : "Sample failed",
      result.state === "done" ? `${result.outName}: ${result.width} × ${result.height}, ${((result.bytes ?? 0) / 1024).toFixed(0)} kB, with exactly the batch settings.` : result.reason ?? "",
      result.state === "done" ? "ok" : "failed",
    );
  } finally {
    batchUi.set((current) => ({ ...current, running: false }));
  }
}

export function downloadResults(context: ScreenContext): void {
  const files = heldBatchFiles();
  if (files.length === 0) { context.toast("No files held", "Run the batch in this session; files are not kept after a reload.", "blocked"); return; }
  for (const file of files) downloadBlob(file.name, file.blob);
  context.toast("Downloaded again", `${files.length} file${files.length === 1 ? "" : "s"}, the same bytes the batch produced.`);
}

/* ------------------------------- export ------------------------------- */

export interface ExportState {
  format: Format;
  quality: number;
  scale: number;
  keepAspect: boolean;
  width: number;
  busy: boolean;
  preview: { src: string; bytes: number; width: number; height: number } | null;
}

export const exportUi = createStore<ExportState>({ format: "png", quality: 0.9, scale: 1, keepAspect: true, width: 0, busy: false, preview: null });

export function outputSize(doc: RasterDoc, state: ExportState): { width: number; height: number } {
  const base = state.width || doc.width;
  const width = Math.max(1, Math.round(base * state.scale));
  const height = Math.max(1, Math.round(state.keepAspect ? (base * state.scale * doc.height) / doc.width : doc.height * state.scale));
  return { width, height };
}

/** Encode the real file. With `download`, it is offered for saving; otherwise it is decoded back as the preview. */
export async function exportImage(context: ScreenContext, download: boolean): Promise<void> {
  const doc = await readShared<RasterDoc>(context, parsePhoto);
  const id = context.params.id;
  if (!doc || !id) return;
  const state = exportUi.get();
  const { width, height } = outputSize(doc, state);
  exportUi.set((current) => ({ ...current, busy: true }));
  try {
    const { images, masks } = await loadBank(doc);
    const result = await exportComposite(doc, images, masks, {
      format: state.format, quality: state.quality, width, height,
      background: state.format === "jpeg" ? "#ffffff" : undefined,
    });
    if (result.blob.size === 0) throw new Error("The encoder produced an empty file.");
    if (download) {
      const { db } = await import("@/runtime/db");
      const record = await db.records.get(id);
      const name = `${slug(record?.title ?? "image")}-${width}x${height}.${extension(state.format)}`;
      downloadBlob(name, result.blob);
      await context.mutate.log(`Exported ${name} (${result.blob.size} bytes)`, { entityId: id, type: "export" });
      context.toast("Exported", `${name}: ${width} × ${height}, ${(result.blob.size / 1024).toFixed(0)} kB written from this browser.`);
    } else {
      const previous = exportUi.get().preview;
      if (previous) URL.revokeObjectURL(previous.src);
      exportUi.set((current) => ({ ...current, preview: { src: URL.createObjectURL(result.blob), bytes: result.blob.size, width: result.width, height: result.height } }));
    }
  } catch (error) {
    context.toast("Export failed", error instanceof Error ? error.message : "The browser produced no image data.", "failed");
  } finally {
    exportUi.set((current) => ({ ...current, busy: false }));
  }
}

/** Copy a PNG of the image into the workspace asset library, with its rights. Nothing is uploaded. */
export async function addToAssetLibrary(context: ScreenContext): Promise<void> {
  const doc = await readShared<RasterDoc>(context, parsePhoto);
  const id = context.params.id;
  if (!doc || !id) return;
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  if (!record) return;
  exportUi.set((current) => ({ ...current, busy: true }));
  try {
    const { images, masks } = await loadBank(doc);
    const width = Math.min(doc.width, 1200);
    const result = await exportComposite(doc, images, masks, { format: "png", quality: 1, width, height: Math.round((width * doc.height) / doc.width) });
    const src = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(result.blob);
    });
    const made = await context.mutate.create({
      collection: "assets", title: `${record.title} (export)`, status: "ready",
      summary: `PNG export at ${result.width} × ${result.height} from ${record.title}.`,
      body: { src, width: result.width, height: result.height },
      fields: { license: doc.rights.license, credit: doc.rights.credit, bytes: result.blob.size, source: record.id },
    }, `Export of ${record.title} added to the asset library`);
    context.toast("Added to the asset library", `${made.title} is a record in this workspace with the licence "${doc.rights.license}". No asset service is connected, so nothing was uploaded.`);
  } catch (error) {
    context.toast("Could not add it", error instanceof Error ? error.message : "The export failed.", "failed");
  } finally {
    exportUi.set((current) => ({ ...current, busy: false }));
  }
}
