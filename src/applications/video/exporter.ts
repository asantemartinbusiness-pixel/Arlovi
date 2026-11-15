/* ====================================================================== *
 * The render controller.
 *
 * One render runs at a time in this browser. Its progress, its cancel flag
 * and the files it produced this session live here rather than inside the
 * export panel, so the screen's actions (export, cancel, download) and the
 * panel drive the same job. A job's record is written through the open
 * editing session, so it is saved with the project and shows on every tab.
 * ====================================================================== */

import type { ScreenContext } from "@/platform/registry";
import { createStore, downloadBlob, slug } from "@/applications/visual/kit";
import { editShared, readShared } from "@/applications/design/sharedDoc";
import { parseVideo, videoUi } from "./model";
import { exportWebm, recorderSupport } from "./render";
import type { RenderJob, VideoDoc } from "./timeline";
import { clockIso, wallMs } from "@/platform/clock";

export interface RenderPreset { width: number; height: number; bitrate: number }

export const RENDER_PRESETS: Record<string, RenderPreset> = {
  "1080p WebM": { width: 1920, height: 1080, bitrate: 8_000_000 },
  "720p WebM": { width: 1280, height: 720, bitrate: 4_000_000 },
  "Square 1080 WebM": { width: 1080, height: 1080, bitrate: 5_000_000 },
  "480p WebM (small)": { width: 854, height: 480, bitrate: 1_600_000 },
};

export interface RenderState {
  busy: boolean;
  jobId?: string;
  projectId?: string;
  progress?: { frame: number; frames: number };
  preset: string;
}

export const renderUi = createStore<RenderState>({ busy: false, preset: "720p WebM" });

const cancelFlag = { cancelled: false };

/** Files produced in this session. A blob is not kept in the record; after a reload it must be rendered again. */
const PRODUCED = new Map<string, { name: string; blob: Blob }>();

export function heldFile(jobId: string): { name: string; blob: Blob } | undefined {
  return PRODUCED.get(jobId);
}

export function latestHeld(doc: VideoDoc): RenderJob | undefined {
  return doc.renders.find((job) => job.state === "done" && PRODUCED.has(job.id));
}

/** A job the record says is running, while nothing in this browser is rendering it, was interrupted. */
export function isInterrupted(job: RenderJob): boolean {
  if (job.state !== "running" && job.state !== "queued") return false;
  const state = renderUi.get();
  return !(state.busy && state.jobId === job.id);
}

function patchJob(context: ScreenContext, id: string, patch: Partial<RenderJob>, label: string) {
  return editShared<VideoDoc>(context, parseVideo, (doc) => ({
    ...doc,
    renders: doc.renders.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  }), label);
}

/**
 * Render the sequence to WebM. With `resumeId`, an interrupted job is run
 * again under the same id: a recorder stream cannot be continued after the
 * page that held it is gone, so resuming means rendering the job again from
 * its settings, and the job says so.
 */
export async function startRender(context: ScreenContext, title: string, presetName: string, resumeId?: string): Promise<void> {
  const state = renderUi.get();
  if (state.busy) {
    context.toast("A render is already running", "One render runs at a time in this browser. Cancel it or wait for it to finish.", "blocked");
    return;
  }
  const support = recorderSupport();
  if (!support.webm) {
    context.toast("This browser cannot encode video", support.reason, "blocked");
    return;
  }
  const doc = await readShared<VideoDoc>(context, parseVideo);
  if (!doc) return;
  const preset = RENDER_PRESETS[presetName] ?? RENDER_PRESETS["720p WebM"];
  const id = resumeId ?? `job-${wallMs().toString(36)}`;
  cancelFlag.cancelled = false;
  renderUi.set((current) => ({ ...current, busy: true, jobId: id, projectId: context.params.id, progress: { frame: 0, frames: Math.round(doc.duration * doc.fps) } }));

  if (resumeId) {
    await patchJob(context, id, { state: "running", note: "Resumed: rendering again from the job's settings, because a recording cannot continue after its page closed." }, "Resume a render job");
  } else {
    await editShared<VideoDoc>(context, parseVideo, (current) => ({
      ...current,
      renders: [{ id, at: clockIso(), by: context.actor, preset: presetName, state: "running", note: "Drawing every frame onto a canvas and recording the stream." }, ...current.renders],
    }), "Start a render job");
  }

  try {
    const result = await exportWebm(doc, {
      width: preset.width, height: preset.height, fps: doc.fps, bitrate: preset.bitrate,
      captions: videoUi.get().showCaptions,
      signal: cancelFlag,
      /* Every sixth frame is enough for a progress bar, and keeps the
         panels that show it from re-rendering on every encoded frame. */
      onProgress: (value) => { if (value.frame % 6 === 0 || value.frame === value.frames - 1) renderUi.set((current) => ({ ...current, progress: { frame: value.frame, frames: value.frames } })); },
    });
    if (cancelFlag.cancelled) {
      await patchJob(context, id, { state: "cancelled", note: "Cancelled before the end. Nothing was written." }, "Cancel a render job");
      context.toast("Render cancelled", "The render stopped and no file was written.", "blocked");
      return;
    }
    const name = `${slug(title)}-${preset.height}p.webm`;
    PRODUCED.set(id, { name, blob: result.blob });
    downloadBlob(name, result.blob);
    await patchJob(context, id, {
      state: "done", artifact: name, bytes: result.blob.size, frames: result.frames,
      note: `${result.frames} frames recorded as ${result.mimeType}. The file was checked to be ${result.blob.size} bytes before it was offered.`,
    }, "Finish a render job");
    context.toast("Render finished", `${name}: ${result.frames} frames, ${(result.blob.size / 1024 / 1024).toFixed(2)} MB, downloaded from this browser.`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The browser could not encode the sequence.";
    await patchJob(context, id, { state: "failed", note: reason }, "Record a failed render");
    context.toast("Render failed", reason, "failed");
  } finally {
    renderUi.set((current) => ({ ...current, busy: false, jobId: undefined, progress: undefined }));
  }
}

export function cancelRender(context: ScreenContext): void {
  if (!renderUi.get().busy) {
    context.toast("Nothing is rendering", "There is no render running in this browser to cancel.", "blocked");
    return;
  }
  cancelFlag.cancelled = true;
  context.toast("Cancelling", "The render stops at the next frame, and the job is recorded as cancelled.", "info");
}

/** Cancel a job that is not running here: it was interrupted, so it is closed off honestly. */
export async function closeInterrupted(context: ScreenContext, jobId: string): Promise<void> {
  await patchJob(context, jobId, { state: "cancelled", note: "Interrupted: the page that was rendering it closed. Nothing was written." }, "Close an interrupted render");
}
