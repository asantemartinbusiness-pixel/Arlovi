import { useEffect, useMemo, useState } from "react";
import {
  Film, Clapperboard, FolderOpen, SlidersHorizontal, Captions, Palette,
  Download, MessageSquare, Scissors, MousePointer2, MoveHorizontal, Split, ZoomIn, ZoomOut,
  SquareSplitHorizontal, ArrowLeftToLine, ArrowRightToLine,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, KeyValueList, Meter, ModalActions, Notice,
  OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, OVERLAY_WIDTH, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput, Tool, Toolbar,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, downloadBlob, downloadText,
  slug, useStore, type DocHandle,
} from "@/applications/visual/kit";
import { canUndoShared, editShared, readShared, sharedHandle, undoShared, useGuardRefresh, useSharedDoc } from "@/applications/design/sharedDoc";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { RENDER_PRESETS, cancelRender, closeInterrupted, heldFile, isInterrupted, latestHeld, renderUi, startRender } from "./exporter";
import {
  captionIssues, captionsToSrt, captionsToVtt, clipEnd, clipsOnTrack, dbToGain,
  measureLoudness, mixAudio, patchClip, renderSamples, rippleDelete, sequenceDuration,
  moveClip, snapFrame, sourceOf, splitClip, timecode, trimClip, splitCaption, captionAt,
  isEditable, lockReason, moveCaption, retimeCaption, splitAllAt, trimToTime,
  type Clip, type MediaSource, type RenderJob, type VideoDoc,
} from "./timeline";
import { contactSheet, frameDataUrl, frameScopes, playSamples, recorderSupport } from "./render";
import { FittedMonitor, MixWaveform, PreviewMonitor, TimelineView, TransportBar, addCueHere, transportKeys, useTransport } from "./parts";
import "./video.css";
import { parseVideo, setPlayhead, setVideoTool, starterVideo, videoUi, type VideoTool } from "./model";
import { clockIso, wallMs } from "@/platform/clock";

/* ====================================================================== *
 * VIDEO — Video Production & Editing
 * ====================================================================== */

function useVideoDoc(context: ScreenContext, id?: string) {
  const record = useRecord(id ?? context.params.id);
  const handle = useSharedDoc<VideoDoc>(record, parseVideo, context.screen.id);
  useTransport(handle.doc);
  useStore(videoUi);
  useGuardRefresh(context);
  return { record, handle };
}

function MissingProject({ context }: { context: ScreenContext }) {
  return (
    <Empty
      title="No video project at this address"
      icon={<Film size={20} />}
      action={
        <Button
          variant="primary"
          onClick={async () => {
            const made = await context.mutate.create({
              collection: "videos", title: "Untitled sequence", status: "draft",
              summary: "Created in the timeline.", body: starterVideo("Untitled sequence"),
              fields: { kind: "sequence", fps: 25, duration: 16 },
            }, "Video project created");
            context.navigate(context.path("/o/:org/video/projects/:id", made.id));
          }}
        >
          Create a project here
        </Button>
      }
    >
      {context.params.id ? <>The record <code className="ds-num">{context.params.id}</code> is not in {context.org.shortName}.</> : <>Open one from the list.</>}
    </Empty>
  );
}

const VIDEO_TOOLS: { tool: VideoTool; label: string; icon: React.ReactNode; key: string }[] = [
  { tool: "select", label: "Select and move", icon: <MousePointer2 size={15} />, key: "V" },
  { tool: "trim", label: "Trim", icon: <MoveHorizontal size={15} />, key: "T" },
  { tool: "ripple", label: "Ripple trim", icon: <Scissors size={15} />, key: "R" },
  { tool: "roll", label: "Roll the edit", icon: <Split size={15} />, key: "N" },
  { tool: "razor", label: "Razor", icon: <Scissors size={15} />, key: "C" },
];

/* ---------------------------- VIDEO-001 ---------------------------- */

function ProjectList({ context, lens }: { context: ScreenContext; lens: "Recent" | "Shared" | "Templates" | "Archived" }) {
  const videos = useCollection("videos");
  const { relative } = useWorkspace();
  const rows = videos.filter((record) => {
    if (lens === "Shared") return Boolean(record.fields.sharedWith);
    if (lens === "Templates") return record.fields.kind === "template";
    if (lens === "Archived") return record.status === "archived";
    return record.status !== "archived" && record.fields.kind !== "template";
  });

  if (rows.length === 0) {
    return <Empty title={`No ${lens.toLowerCase()} projects`} icon={<Film size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("new sequence")}>Create</Button>} />;
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Projects" value={videos.length} prov="human" meta={`in ${context.org.shortName}`} />
        <Stat label="Total runtime" value={`${Math.round(videos.reduce((sum, record) => sum + parseVideo(record.body).duration, 0))}s`} prov="human" meta="counted from the sequences" />
        <Stat label="Render queue" value={videos.reduce((sum, record) => sum + parseVideo(record.body).renders.filter((job) => job.state === "queued").length, 0)} prov="human" meta="jobs waiting" />
        <Stat label="Render service" value="Not connected" unavailable meta="encoding happens in this browser" />
      </StatRow>
      <Grid>
        {rows.map((record) => {
          const doc = parseVideo(record.body);
          return (
            <Card
              key={record.id}
              span={4}
              eyebrow={lens === "Templates" ? "TEMPLATE" : "SEQUENCE"}
              prov="human"
              title={record.title}
              subtitle={<><span className="ds-num">{timecode(doc.duration, doc.fps)}</span> · <span className="ds-num">{doc.fps}</span> fps · edited {relative(record.updatedAt)}</>}
              actions={<Button size="sm" variant="secondary" onClick={() => { context.select(record.id); context.navigate(context.path("/o/:org/video/projects/:id", record.id)); }}>Open</Button>}
            >
              <Stack gap={2}>
                <ProjectThumb doc={doc} />
                <Row gap={2} wrap>
                  <Pill tone={record.status === "archived" ? "warning" : "info"} dot>{record.status}</Pill>
                  <Pill><span className="ds-num">{doc.clips.length}</span> clips</Pill>
                  <Pill><span className="ds-num">{doc.tracks.length}</span> tracks</Pill>
                  {doc.sources.some((source) => source.missing) && <Pill tone="danger">media offline</Pill>}
                  {doc.sources.some((source) => source.license === "Unknown") && <Pill tone="danger">rights unknown</Pill>}
                </Row>
                <Row gap={1} wrap>
                  <Button size="sm" variant="ghost" onClick={() => context.select(record.id)}>Select</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("project settings", { id: record.id })}>Settings</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

function ProjectThumb({ doc }: { doc: VideoDoc }) {
  const stills = useMemo(() => {
    try {
      return [0.1, 0.45, 0.8].map((fraction) => frameDataUrl(doc, fraction * doc.duration, 200));
    } catch { return []; }
  }, [doc]);
  return (
    <Row gap={1}>
      {stills.map((src, index) => (
        <img key={index} src={src} alt={`Frame at ${Math.round([0.1, 0.45, 0.8][index] * doc.duration)}s`} style={{ width: "33%", borderRadius: 4, display: "block" }} />
      ))}
    </Row>
  );
}

/* ---------------------------- VIDEO-002 ---------------------------- */

function TimelineScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  /* Undo and redo answer anywhere in the editor, not only when the timeline
     has focus: a trim made from the clip panel is undone with ⌘Z too. The
     timeline handles its own keys, so its events are left to it. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[role='application'], input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      event.preventDefault();
      if (event.shiftKey) handle.redo(); else handle.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handle]);
  if (!record) return <div className="pg-body"><MissingProject context={context} /></div>;
  const doc = handle.doc;
  const tab = context.tab;
  const clip = doc?.clips.find((item) => item.id === ui.selectedClipId);

  /* Split at the playhead: the selected clip when the playhead is inside it,
     otherwise every clip the playhead crosses on an unlocked track. */
  const splitHere = () => {
    const current = handle.doc;
    if (!current) return;
    const at = videoUi.get().playhead;
    const selected = current.clips.find((item) => item.id === videoUi.get().selectedClipId);
    const only = selected && at > selected.start && at < clipEnd(selected) ? [selected.id] : undefined;
    const result = splitAllAt(current, at, only);
    if (result.count === 0) {
      context.toast("Nothing to split", "No clip on an unlocked track crosses the playhead, or it sits within a frame of an edge.", "blocked");
      return;
    }
    handle.edit(result.doc, result.count === 1 ? "Split at the playhead" : `Split ${result.count} clips at the playhead`);
    videoUi.set((currentUi) => ({ ...currentUi, selectedClipId: result.newClipIds[0] }));
  };

  const trimHere = (edge: "start" | "end") => {
    const current = handle.doc;
    const selected = current?.clips.find((item) => item.id === videoUi.get().selectedClipId);
    if (!current || !selected) { context.toast("Select a clip first", "Trimming to the playhead works on the selected clip.", "blocked"); return; }
    if (!isEditable(current, selected)) { context.toast("The clip is locked", "Unlock the clip or its track to trim it.", "blocked"); return; }
    const next = trimToTime(current, selected.id, edge, videoUi.get().playhead, { ripple: videoUi.get().tool === "ripple" });
    if (next === current) { context.toast("Nothing trimmed", "The playhead is outside what this clip's source can reach.", "blocked"); return; }
    handle.edit(next, edge === "start" ? "Trim the head to the playhead" : "Trim the tail to the playhead");
  };

  return (
    <EditorFrame
      context={context}
      lean
      actions={actions}
      tabs={[{ id: "Edit" }, { id: "Colour" }, { id: "Audio" }, { id: "Captions" }, { id: "Export" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{timecode(doc.duration, doc.fps)}</span> · <span className="ds-num">{doc.width}×{doc.height}</span> · <span className="ds-num">{doc.fps}</span> fps</span>}</Row>}
      backTo={{ label: "Video", to: `/o/${context.org.slug}/video/projects` }}
      tools={
        <div className="vd-tools">
          <Toolbar label="Edit tools">
            {VIDEO_TOOLS.map((item) => (
              <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setVideoTool(item.tool)} />
            ))}
          </Toolbar>
          <Toolbar label="Cut">
            <Tool label="Split at the playhead (S)" icon={<SquareSplitHorizontal size={15} />} disabled={!doc} onClick={splitHere} />
            <Tool label="Trim the head to the playhead (Q)" icon={<ArrowLeftToLine size={15} />} disabled={!clip} onClick={() => trimHere("start")} />
            <Tool label="Trim the tail to the playhead (W)" icon={<ArrowRightToLine size={15} />} disabled={!clip} onClick={() => trimHere("end")} />
          </Toolbar>
          <Toolbar label="View">
            <Tool label="Snap to clip edges" active={ui.snapToClips} onClick={() => videoUi.set((c) => ({ ...c, snapToClips: !c.snapToClips }))}>Snap</Tool>
            <Tool label="Show captions on the monitor" active={ui.showCaptions} onClick={() => videoUi.set((c) => ({ ...c, showCaptions: !c.showCaptions }))}>Captions</Tool>
            <Tool label="Title and action safe areas" active={ui.showGuides} onClick={() => videoUi.set((c) => ({ ...c, showGuides: !c.showGuides }))}>Safe areas</Tool>
            <Tool label="Zoom the timeline out" icon={<ZoomOut size={15} />} onClick={() => videoUi.set((c) => ({ ...c, zoom: Math.max(0.25, c.zoom / 1.4) }))} />
            <Tool label="Zoom the timeline in" icon={<ZoomIn size={15} />} onClick={() => videoUi.set((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.4) }))} />
          </Toolbar>
        </div>
      }
      left={
        <Stack gap={3}>
          <RecoveryNotice handle={handle as DocHandle<unknown>} />
          <PanelGroup title="Bins">
            {doc?.sources.map((source) => (
              <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <span className="ds-grow ds-truncate">{source.name}</span>
                <Pill tone={source.missing ? "danger" : "neutral"}>{source.missing ? "offline" : source.kind}</Pill>
              </Row>
            ))}
            <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id/media", context.params.id))}>Open the media bin</Button>
          </PanelGroup>
        </Stack>
      }
      leftLabel="Media"
      right={
        tab === "Colour" ? <ColourPanel handle={handle} context={context} />
          : tab === "Audio" ? <AudioPanel handle={handle} context={context} />
            : tab === "Captions" ? <CaptionPanel handle={handle} context={context} />
              : tab === "Export" ? <ExportPanel handle={handle} context={context} record={record.title} />
                : <ClipPanel handle={handle} context={context} />
      }
      rightLabel={tab === "Edit" ? "Clip" : tab}
      status={
        <>
          <span><span className="ds-num">{timecode(ui.playhead, doc?.fps ?? 25)}</span></span>
          <span>Tool: {ui.tool}</span>
          {clip && <span>{clip.name}: <span className="ds-num">{timecode(clip.start, doc?.fps ?? 25)}</span> → <span className="ds-num">{timecode(clipEnd(clip), doc?.fps ?? 25)}</span></span>}
          <span className="ds-grow" />
          <span>J K L shuttle · arrows step a frame · S split · Q W trim to the playhead · V T R N C tools · ⌘Z undo</span>
        </>
      }
    >
      <div
        tabIndex={0}
        role="application"
        aria-label="Timeline and programme monitor. J, K and L shuttle; arrow keys step one frame."
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (event.shiftKey) handle.redo(); else handle.undo();
            return;
          }
          const typing = (event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable='true']");
          if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "s") { event.preventDefault(); splitHere(); return; }
            if (key === "q") { event.preventDefault(); trimHere("start"); return; }
            if (key === "w") { event.preventDefault(); trimHere("end"); return; }
            const tool = VIDEO_TOOLS.find((item) => item.key.toLowerCase() === key);
            if (tool) { event.preventDefault(); setVideoTool(tool.tool); return; }
          }
          if (doc && transportKeys(event, doc)) event.preventDefault();
        }}
        style={{ position: "absolute", inset: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", outline: "none" }}
      >
        <div style={{ position: "relative", background: "#07070A", minHeight: 0 }}>
          {doc && <FittedMonitor doc={doc} handle={handle} time={ui.playhead} captions={ui.showCaptions} guides={ui.showGuides} bypassEffects={ui.bypassEffects} />}
        </div>
        <div style={{ borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)", maxHeight: 270, overflowY: "auto" }}>
          {doc && (
            <TimelineView
              handle={handle}
              height={timelineHeight(doc)}
              onSelect={(id) => videoUi.set((current) => ({ ...current, selectedClipId: id }))}
              onCaptionSelect={() => { if (context.tab !== "Captions") context.setTab("Captions"); }}
              onCaptionOpen={() => { if (context.tab !== "Captions") context.setTab("Captions"); }}
            />
          )}
        </div>
      </div>
    </EditorFrame>
  );
}

/** The timeline's full height: the ruler, every track and the caption lane. It scrolls when taller than its room. */
function timelineHeight(doc: VideoDoc): number {
  return 26 + doc.tracks.reduce((sum, track) => sum + track.height, 0) + 32;
}

function ClipPanel({ handle, context, inOverlay }: { handle: DocHandle<VideoDoc>; context: ScreenContext; inOverlay?: boolean }) {
  const ui = useStore(videoUi);
  const doc = handle.doc;
  if (!doc) return null;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  if (!clip) {
    return (
      <Stack gap={3}>
        <PanelGroup title="Sequence">
          <KeyValueList items={[
            { label: "Duration", value: timecode(doc.duration, doc.fps), mono: true },
            { label: "Content ends", value: timecode(sequenceDuration(doc), doc.fps), mono: true },
            { label: "Frame", value: `${doc.width} × ${doc.height} at ${doc.fps} fps`, mono: true },
            { label: "Clips", value: doc.clips.length, mono: true },
          ]} />
        </PanelGroup>
        <p className="vx-mini">Select a clip on the timeline to trim, retime or grade it. Drag its ends to trim; the ripple and roll tools change the edit.</p>
      </Stack>
    );
  }
  const source = sourceOf(doc, clip);
  const set = (patch: Partial<Clip>, label: string) => handle.edit((current) => patchClip(current, clip.id, patch), label);
  const locked = lockReason(doc, clip);
  return (
    <Stack gap={3}>
      <PanelGroup title={clip.name}>
        <KeyValueList items={[
          { label: "Starts", value: timecode(clip.start, doc.fps), mono: true },
          { label: "Ends", value: timecode(clipEnd(clip), doc.fps), mono: true },
          { label: "Duration", value: `${timecode(clip.duration, doc.fps)} (${Math.round(clip.duration * doc.fps)} frames)`, mono: true },
          { label: "Source in", value: timecode(clip.sourceIn, doc.fps), mono: true },
          { label: "Source", value: source ? `${source.name} (${timecode(source.duration, doc.fps)})` : "none" },
        ]} />
      </PanelGroup>
      {locked && (
        <Notice tone="warning" title="Locked">
          {locked} It cannot be moved, trimmed, split or deleted until it is unlocked.
        </Notice>
      )}
      <PanelGroup title="Trim by the frame">
        <Row gap={1} wrap>
          {([["start", -1], ["start", 1], ["end", -1], ["end", 1]] as const).map(([edge, direction]) => (
            <Button
              key={`${edge}${direction}`}
              size="sm"
              variant="ghost"
              onClick={() => handle.edit((current) => trimClip(current, clip.id, edge, (direction as number) / doc.fps), "Trim by one frame")}
            >
              {edge} {direction > 0 ? "+" : "−"}1
            </Button>
          ))}
        </Row>
        <Row gap={1} wrap>
          <Button size="sm" variant="ghost" disabled={Boolean(locked)} onClick={() => handle.edit((current) => trimToTime(current, clip.id, "start", ui.playhead), "Trim the head to the playhead")}>Head to playhead</Button>
          <Button size="sm" variant="ghost" disabled={Boolean(locked)} onClick={() => handle.edit((current) => trimToTime(current, clip.id, "end", ui.playhead), "Trim the tail to the playhead")}>Tail to playhead</Button>
        </Row>
        <Row gap={1} wrap>
          <Button size="sm" variant="secondary" onClick={() => { const result = splitClip(doc, clip.id, ui.playhead); if (result.newClipId) handle.edit(() => result.doc, "Split at the playhead"); else context.toast("Nothing to split", locked ?? "The playhead is not inside this clip, or it is within a frame of an edge.", "blocked"); }}>Split at the playhead</Button>
          <Button size="sm" variant="outline-danger" title="Removes the clip and closes the gap. Undo restores it." onClick={() => { handle.edit((current) => rippleDelete(current, clip.id), "Ripple delete"); videoUi.set((current) => ({ ...current, selectedClipId: undefined })); }}>Ripple delete</Button>
        </Row>
      </PanelGroup>
      <PanelGroup title="Transform and opacity">
        <div className="vx-fieldrow">
          <div><label className="vx-label" htmlFor="clip-scale">Scale</label><input id="clip-scale" className="vx-num" type="number" step={0.05} value={clip.transform.scale} onChange={(event) => set({ transform: { ...clip.transform, scale: Number(event.target.value) } }, "Scale the clip")} /></div>
          <div><label className="vx-label" htmlFor="clip-x">X %</label><input id="clip-x" className="vx-num" type="number" value={clip.transform.x} onChange={(event) => set({ transform: { ...clip.transform, x: Number(event.target.value) } }, "Move the clip")} /></div>
          <div><label className="vx-label" htmlFor="clip-y">Y %</label><input id="clip-y" className="vx-num" type="number" value={clip.transform.y} onChange={(event) => set({ transform: { ...clip.transform, y: Number(event.target.value) } }, "Move the clip")} /></div>
          <div><label className="vx-label" htmlFor="clip-rot">Rotation</label><input id="clip-rot" className="vx-num" type="number" value={clip.transform.rotation} onChange={(event) => set({ transform: { ...clip.transform, rotation: Number(event.target.value) } }, "Rotate the clip")} /></div>
          <div><label className="vx-label" htmlFor="clip-in">Fade in (s)</label><input id="clip-in" className="vx-num" type="number" step={0.1} value={clip.fadeIn} onChange={(event) => set({ fadeIn: Math.max(0, Number(event.target.value)) }, "Set the fade in")} /></div>
          <div><label className="vx-label" htmlFor="clip-out">Fade out (s)</label><input id="clip-out" className="vx-num" type="number" step={0.1} value={clip.fadeOut} onChange={(event) => set({ fadeOut: Math.max(0, Number(event.target.value)) }, "Set the fade out")} /></div>
        </div>
      </PanelGroup>
      {clip.text !== undefined && (
        <PanelGroup title="Title">
          <Field label="Text"><TextArea rows={3} value={clip.text} onChange={(event) => set({ text: event.target.value }, "Edit the title")} /></Field>
          <div className="vx-fieldrow">
            <div><label className="vx-label" htmlFor="title-size">Size</label><input id="title-size" className="vx-num" type="number" value={clip.textStyle?.size ?? 54} onChange={(event) => set({ textStyle: { ...(clip.textStyle ?? { size: 54, weight: 700, color: "#FFFFFF", align: "center", family: "Inter" }), size: Number(event.target.value) } }, "Set the title size")} /></div>
            <div><label className="vx-label" htmlFor="title-colour">Colour</label><input id="title-colour" type="color" value={clip.textStyle?.color ?? "#FFFFFF"} onChange={(event) => set({ textStyle: { ...(clip.textStyle ?? { size: 54, weight: 700, color: "#FFFFFF", align: "center", family: "Inter" }), color: event.target.value } }, "Set the title colour")} style={{ width: "100%", height: 26 }} /></div>
          </div>
        </PanelGroup>
      )}
      {!inOverlay && <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Clip property")}>More…</Button>}
    </Stack>
  );
}

function ColourPanel({ handle, context }: { handle: DocHandle<VideoDoc>; context: ScreenContext }) {
  const ui = useStore(videoUi);
  const doc = handle.doc;
  if (!doc) return null;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  if (!clip) return <Notice tone="info" title="Select a clip">Colour work applies to one clip at a time.</Notice>;
  const effectAmount = (kind: Clip["effects"][number]["kind"]) => clip.effects.find((effect) => effect.kind === kind)?.amount ?? 0;
  const setEffect = (kind: Clip["effects"][number]["kind"], amount: number) => {
    handle.edit((current) => patchClip(current, clip.id, {
      effects: clip.effects.some((effect) => effect.kind === kind)
        ? clip.effects.map((effect) => (effect.kind === kind ? { ...effect, amount } : effect))
        : [...clip.effects, { id: `fx-${kind}-${wallMs().toString(36)}`, kind, amount, bypassed: false }],
    }), `Set ${kind}`);
  };
  return (
    <Stack gap={3}>
      <PanelGroup title={`${clip.name} — grade`}>
        {(["exposure", "contrast", "saturation", "temperature", "blur"] as const).map((kind) => (
          <div key={kind}>
            <label className="vx-label" htmlFor={`fx-${kind}`}>
              {kind} <span className="ds-num" style={{ float: "right", fontWeight: 400 }}>{Math.round(effectAmount(kind))}</span>
            </label>
            <input id={`fx-${kind}`} className="vx-range" type="range" min={kind === "blur" ? 0 : -100} max={100} value={effectAmount(kind)} onChange={(event) => setEffect(kind, Number(event.target.value))} />
          </div>
        ))}
        <Field label="Look">
          <Select
            value={clip.effects.find((effect) => effect.kind === "lut")?.lut ?? ""}
            onChange={(event) => {
              const lut = event.target.value;
              handle.edit((current) => patchClip(current, clip.id, {
                effects: lut
                  ? [...clip.effects.filter((effect) => effect.kind !== "lut"), { id: `fx-lut-${wallMs().toString(36)}`, kind: "lut" as const, amount: 100, lut, bypassed: false }]
                  : clip.effects.filter((effect) => effect.kind !== "lut"),
              }), "Apply a look");
            }}
          >
            <option value="">None</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="mono">Monochrome</option>
          </Select>
        </Field>
        <Checkbox label="Bypass every effect in the preview" checked={ui.bypassEffects} onChange={(event) => videoUi.set((current) => ({ ...current, bypassEffects: event.target.checked }))} />
      </PanelGroup>
      <PanelGroup title="Effect stack" actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Effect inspector")}>Inspect</Button>}>
        {clip.effects.length === 0 ? <p className="vx-mini">No effects on this clip.</p> : (
          <Stack gap={1}>
            {clip.effects.map((effect, index) => (
              <Row key={effect.id} gap={1} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
                <span className="ds-grow">{effect.kind}{effect.lut ? ` · ${effect.lut}` : ""}</span>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${effect.kind} earlier`} disabled={index === 0} onClick={() => handle.edit((current) => patchClip(current, clip.id, { effects: reorderEffects(clip.effects, index, -1) }), "Reorder the effects")}>↑</Button>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${effect.kind} later`} disabled={index === clip.effects.length - 1} onClick={() => handle.edit((current) => patchClip(current, clip.id, { effects: reorderEffects(clip.effects, index, 1) }), "Reorder the effects")}>↓</Button>
                <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => patchClip(current, clip.id, { effects: clip.effects.map((item) => (item.id === effect.id ? { ...item, bypassed: !item.bypassed } : item)) }), "Bypass the effect")}>{effect.bypassed ? "on" : "off"}</Button>
              </Row>
            ))}
          </Stack>
        )}
      </PanelGroup>
      <Notice tone="warning" title="The grade is a canvas filter">
        Effects are applied as canvas filters when the frame is drawn, so the preview and the export match each other. They are not a colour-managed grade, and the order they are listed in is the order they are applied.
      </Notice>
    </Stack>
  );
}

function reorderEffects(effects: Clip["effects"], index: number, delta: number): Clip["effects"] {
  const next = [...effects];
  const target = Math.max(0, Math.min(next.length - 1, index + delta));
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

function AudioPanel({ handle, context }: { handle: DocHandle<VideoDoc>; context: ScreenContext }) {
  const doc = handle.doc;
  if (!doc) return null;
  const audioTracks = doc.tracks.filter((track) => track.kind === "audio");
  return (
    <Stack gap={3}>
      {audioTracks.map((track) => (
        <PanelGroup key={track.id} title={track.name}>
          <div>
            <label className="vx-label" htmlFor={`gain-${track.id}`}>
              Gain <span className="ds-num" style={{ float: "right", fontWeight: 400 }}>{(track.gainDb ?? 0).toFixed(1)} dB</span>
            </label>
            <input
              id={`gain-${track.id}`}
              className="vx-range"
              type="range"
              min={-40}
              max={12}
              step={0.5}
              value={track.gainDb ?? 0}
              onChange={(event) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, gainDb: Number(event.target.value) } : item)) }), "Change the gain")}
            />
          </div>
          <Row gap={1}>
            <Button size="sm" variant={track.muted ? "primary" : "ghost"} onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, muted: !item.muted } : item)) }), "Mute")}>Mute</Button>
            <Button size="sm" variant={track.solo ? "primary" : "ghost"} onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, solo: !item.solo } : item)) }), "Solo")}>Solo</Button>
          </Row>
        </PanelGroup>
      ))}
      <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id/audio", context.params.id))}>Open the mixer</Button>
    </Stack>
  );
}

function CaptionPanel({ handle, context }: { handle: DocHandle<VideoDoc>; context: ScreenContext }) {
  const ui = useStore(videoUi);
  const doc = handle.doc;
  if (!doc) return null;
  const live = doc.captions.find((caption) => ui.playhead >= caption.start && ui.playhead < caption.end);
  const picked = doc.captions.find((caption) => caption.id === ui.selectedCaptionId);
  const frame = 1 / doc.fps;
  return (
    <Stack gap={3}>
      {picked && (
        <PanelGroup title="Selected cue" actions={<Button size="sm" variant="ghost" onClick={() => videoUi.set((current) => ({ ...current, selectedCaptionId: undefined }))}>Done</Button>}>
          <Stack gap={2}>
            <TextArea
              rows={3}
              aria-label="Selected cue text"
              value={picked.text}
              onChange={(event) => handle.live((current) => ({ ...current, captions: current.captions.map((item) => (item.id === picked.id ? { ...item, text: event.target.value, reviewed: false } : item)) }))}
              onBlur={handle.beginGesture}
            />
            <Properties rows={[
              { label: "In", value: <span className="ds-num">{timecode(picked.start, doc.fps)}</span> },
              { label: "Out", value: <span className="ds-num">{timecode(picked.end, doc.fps)}</span> },
              { label: "Reading speed", value: <><span className="ds-num">{Math.round(picked.text.length / Math.max(0.1, picked.end - picked.start))}</span> characters a second</> },
            ]} />
            <Row gap={1} wrap>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "start", picked.start - frame), "Retime the cue")}>in −1</Button>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "start", picked.start + frame), "Retime the cue")}>in +1</Button>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "end", picked.end - frame), "Retime the cue")}>out −1</Button>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "end", picked.end + frame), "Retime the cue")}>out +1</Button>
            </Row>
            <Row gap={1} wrap>
              <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "start", ui.playhead), "Set the cue in point")}>In at playhead</Button>
              <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => retimeCaption(current, picked.id, "end", ui.playhead), "Set the cue out point")}>Out at playhead</Button>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => moveCaption(current, picked.id, ui.playhead), "Move the cue to the playhead")}>Move to playhead</Button>
            </Row>
            <Row gap={1} wrap>
              <Pill tone={picked.reviewed ? "success" : "warning"}>{picked.reviewed ? "checked" : "not checked"}</Pill>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === picked.id ? { ...item, reviewed: !item.reviewed } : item)) }), "Mark the caption")}>{picked.reviewed ? "Unmark" : "Mark as checked"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { handle.edit((current) => ({ ...current, captions: current.captions.filter((item) => item.id !== picked.id) }), "Delete the cue"); videoUi.set((current) => ({ ...current, selectedCaptionId: undefined })); }}>Delete the cue</Button>
            </Row>
            <p className="vx-mini">Drag the cue on the caption lane to move it, or its ends to retime it. It never overlaps the cues beside it.</p>
          </Stack>
        </PanelGroup>
      )}
      <PanelGroup title="At the playhead">
        {live ? (
          <Stack gap={2}>
            <TextArea rows={3} aria-label="Caption text" value={live.text} onChange={(event) => handle.live((current) => ({ ...current, captions: current.captions.map((item) => (item.id === live.id ? { ...item, text: event.target.value, reviewed: false } : item)) }))} onBlur={handle.beginGesture} />
            <Row gap={1} wrap>
              <Pill tone={live.reviewed ? "success" : "warning"}>{live.reviewed ? "checked" : "not checked"}</Pill>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === live.id ? { ...item, reviewed: !item.reviewed } : item)) }), "Mark the caption")}>{live.reviewed ? "Unmark" : "Mark as checked"}</Button>
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => splitCaption(current, live.id, ui.playhead), "Split the cue")}>Split here</Button>
            </Row>
          </Stack>
        ) : (
          <Stack gap={2}>
            <p className="vx-mini">No cue covers <span className="ds-num">{timecode(ui.playhead, doc.fps)}</span>.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { const blocked = addCueHere(handle); if (blocked) context.toast("No cue added", blocked, "blocked"); }}
            >
              Add a cue here
            </Button>
          </Stack>
        )}
      </PanelGroup>
      <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id/captions", context.params.id))}>Open the transcript</Button>
    </Stack>
  );
}

function ExportPanel({ handle, context, record }: { handle: DocHandle<VideoDoc>; context: ScreenContext; record: string }) {
  const doc = handle.doc;
  const support = useMemo(() => recorderSupport(), []);
  const render = useStore(renderUi);
  if (!doc) return null;
  const preset = RENDER_PRESETS[render.preset];
  const frames = Math.round(doc.duration * (preset ? doc.fps : doc.fps));
  return (
    <Stack gap={3}>
      <PanelGroup title="Where it renders">
        <KeyValueList items={[
          { label: "Renderer", value: "This browser, on this machine" },
          { label: "Container", value: support.webm ? "WebM" : "none available", tone: support.webm ? undefined : "danger" },
          { label: "Frames", value: String(frames), mono: true },
          { label: "Not produced", value: "MP4, H.264, a hosted render" },
        ]} />
        {!support.webm && <p className="vx-mini">{support.reason}</p>}
      </PanelGroup>
      <Button variant="primary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id/export", context.params.id))}>Open the render screen</Button>
      <Button
        variant="ghost"
        onClick={() => {
          const sheet = contactSheet(doc, 4, 3, 240);
          sheet.canvas.toBlob((blob) => {
            if (!blob) { context.toast("Nothing written", "The canvas produced no data.", "failed"); return; }
            downloadBlob(`${slug(record)}-contact-sheet.png`, blob);
            context.toast("Contact sheet written", `Twelve real frames from the sequence, ${(blob.size / 1024).toFixed(0)} kB.`);
          }, "image/png");
        }}
      >
        Download a contact sheet
      </Button>
    </Stack>
  );
}

/* ---------------------------- VIDEO-003 ---------------------------- */

function MediaBin({ context, lens }: { context: ScreenContext; lens: "Media" | "Folders" | "Proxy" | "Missing" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;
  const sources = doc.sources.filter((source) => (lens === "Missing" ? source.missing : lens === "Proxy" ? true : true));

  if (lens === "Missing") {
    const missing = doc.sources.filter((source) => source.missing);
    return (
      <Stack gap={4}>
        {missing.length === 0 ? (
          <Notice tone="success" title="Nothing is offline">Every clip's source is present.</Notice>
        ) : (
          <>
            <Notice tone="danger" title={`${missing.length} sources are offline`}>
              A clip whose source is offline shows a marked frame in the preview, with the source name on it. It is never replaced by other footage.
            </Notice>
            {missing.map((source) => (
              <Card key={source.id} eyebrow="OFFLINE" prov="unknown" title={source.name} subtitle={<>Used by <span className="ds-num">{doc.clips.filter((clip) => clip.sourceId === source.id).length}</span> clips</>}>
                <Stack gap={2}>
                  <Properties rows={[
                    { label: "Duration recorded", value: <span className="ds-num">{timecode(source.duration, doc.fps)}</span> },
                    { label: "Licence", value: source.license },
                  ]} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, missing: false } : item)) }), "Relink the source");
                      context.toast("Relinked", `${source.name} is back online. The clips that use it render again.`);
                    }}
                  >
                    Relink to a generated stand-in
                  </Button>
                  <Notice tone="warning" title="Relinking here does not find your file">
                    There is no file system to search. Relinking marks the source as present and the generated picture is used, which is stated on the clip.
                  </Notice>
                </Stack>
              </Card>
            ))}
          </>
        )}
      </Stack>
    );
  }

  if (lens === "Proxy") {
    return (
      <Card eyebrow="PROXY" prov="human" title="Proxies" subtitle="What a proxy would be, and what is actually here">
        <Stack gap={3}>
          <Notice tone="info" title="Nothing needs transcoding">
            A clip's picture is generated at the size the preview asks for, so there is no heavy file to make a proxy of. The column below says so per source rather than showing a progress bar that means nothing.
          </Notice>
          <DataGrid
            rows={doc.sources}
            rowId={(row) => row.id}
            label="Proxy status"
            columns={[
              { key: "name", header: "Source", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
              { key: "kind", header: "Kind", cell: (row) => row.kind },
              { key: "proxy", header: "Proxy", cell: (row) => <Pill tone={row.proxy === "generated" ? "success" : "neutral"}>{row.proxy === "generated" ? "generated on demand" : "not needed"}</Pill> },
              { key: "duration", header: "Duration", align: "end", cell: (row) => <span className="ds-num">{timecode(row.duration, doc.fps)}</span> },
            ]}
          />
        </Stack>
      </Card>
    );
  }

  if (lens === "Folders") {
    const folders = new Map<string, MediaSource[]>();
    for (const source of doc.sources) {
      const key = source.kind === "audio" ? "Audio" : source.kind === "graphic" ? "Graphics" : "Footage";
      folders.set(key, [...(folders.get(key) ?? []), source]);
    }
    return (
      <Grid>
        {[...folders.entries()].map(([name, items]) => (
          <Card key={name} span={4} eyebrow="BIN" prov="human" title={name} subtitle={<><span className="ds-num">{items.length}</span> items</>}>
            <Stack gap={2}>
              {items.map((source) => (
                <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow ds-truncate">{source.name}</span>
                  <span className="ds-num">{timecode(source.duration, doc.fps)}</span>
                </Row>
              ))}
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
      <Grid>
        {sources.map((source) => (
          <Card
            key={source.id}
            span={4}
            eyebrow={source.kind.toUpperCase()}
            prov={source.license === "Unknown" ? "unknown" : "human"}
            title={source.name}
            subtitle={<><span className="ds-num">{timecode(source.duration, doc.fps)}</span> · used by <span className="ds-num">{doc.clips.filter((clip) => clip.sourceId === source.id).length}</span> clips</>}
            actions={
              <Button
                size="sm"
                variant={ui.selectedSourceId === source.id ? "primary" : "ghost"}
                aria-pressed={ui.selectedSourceId === source.id}
                onClick={() => videoUi.set((current) => ({ ...current, selectedSourceId: current.selectedSourceId === source.id ? undefined : source.id }))}
              >
                {ui.selectedSourceId === source.id ? "Selected" : "Select"}
              </Button>
            }
          >
            <Stack gap={2}>
              {source.kind === "audio" ? (
                <MixWaveform doc={{ ...doc, clips: [{ id: "preview", trackId: doc.tracks.find((track) => track.kind === "audio")?.id ?? "tr-a1", start: 0, sourceIn: 0, duration: Math.min(source.duration, 8), sourceId: source.id, name: source.name, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0 }] }} seconds={Math.min(source.duration, 8)} height={60} label={`${source.name} waveform`} />
              ) : (
                <img src={frameDataUrl({ ...doc, clips: [{ id: "preview", trackId: "preview", start: 0, sourceIn: 0, duration: source.duration, sourceId: source.id, name: source.name, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0 }], tracks: [{ id: "preview", name: "preview", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 40 }] }, source.duration / 2, 320)} alt={`${source.name} frame`} style={{ width: "100%", borderRadius: 4 }} />
              )}
              <Properties rows={[
                { label: "Licence", value: source.license },
                { label: "Credit", value: source.credit },
                { label: "Proxy", value: source.proxy === "generated" ? "generated on demand" : "none recorded" },
              ]} />
              {(source.tags ?? []).length > 0 && (
                <Row gap={1} wrap>{(source.tags ?? []).map((tag) => <Pill key={tag}>{tag}</Pill>)}</Row>
              )}
              <Row gap={1} wrap>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={source.kind !== "audio"}
                  onClick={async () => {
                    try {
                      const player = await playSamples(renderSamples(source, Math.min(source.duration, 4), 22050), 22050);
                      setAuditioning(source.id);
                      window.setTimeout(() => { player.stop(); setAuditioning(null); }, Math.min(source.duration, 4) * 1000);
                      context.toast("Auditioning", "Playing the generated samples through the Web Audio API.");
                    } catch (error) {
                      context.toast("Cannot play", error instanceof Error ? error.message : "Audio is unavailable.", "failed");
                    }
                  }}
                >
                  {auditioning === source.id ? "Playing…" : "Audition"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Media inspector", { id: source.id })}>Inspect</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("license", { id: source.id })}>Licence</Button>
              </Row>
            </Stack>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

/* ---------------------------- VIDEO-004 ---------------------------- */

function AudioMixer({ context, lens }: { context: ScreenContext; lens: "Tracks" | "Mixer" | "Effects" | "Loudness" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const [playing, setPlaying] = useState<{ stop: () => void } | null>(null);
  const loaded = handle.doc;
  const loudnessOrNull = useMemo(() => (loaded ? measureLoudness(mixAudio(loaded, 0, Math.min(loaded.duration, 30), 8000)) : null), [loaded]);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc || !loudnessOrNull) return <Empty title="Opening the project…" />;
  const audioTracks = doc.tracks.filter((track) => track.kind === "audio");
  const loudness = loudnessOrNull;

  if (lens === "Loudness") {
    const over = loudness.approximateLufs > doc.loudnessTarget + 1;
    const under = loudness.approximateLufs < doc.loudnessTarget - 1;
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Programme loudness" value={`${loudness.approximateLufs} LUFS`} prov="human" meta={`target ${doc.loudnessTarget} LUFS`} />
          <Stat label="Sample peak" value={`${loudness.samplePeakDb.toFixed(1)} dBFS`} prov="human" meta="not a true-peak meter" />
          <Stat label="RMS" value={`${loudness.rms.toFixed(1)} dBFS`} prov="human" meta="over the whole programme" />
          <Stat label="Clipped samples" value={loudness.clippedSamples} prov="human" meta={loudness.clippedSamples > 0 ? "at or above full scale" : "none"} />
        </StatRow>
        {loudness.clippedSamples > 0 && (
          <Notice tone="danger" title={`${loudness.clippedSamples} samples are at full scale`}>
            The mix is clipping. Pull a track's gain down; the measurement updates from the samples immediately.
          </Notice>
        )}
        {(over || under) && (
          <Notice tone="warning" title={`The mix is ${over ? "louder" : "quieter"} than the target`}>
            It measures {loudness.approximateLufs} LUFS against a target of {doc.loudnessTarget}. Most platforms normalise, so a mix well above the target will simply be turned down.
          </Notice>
        )}
        <Notice tone="warning" title="This is an approximation, not a certified meter">
          A real LUFS measurement applies K-weighting and gating as the standard specifies. What is shown is RMS with a fixed offset, computed from the same samples the waveform is drawn from. It is useful for comparing one mix with another and should not be sent to a broadcaster as compliance.
        </Notice>
        <Card eyebrow="MIX" prov="human" title="The programme" subtitle={<>First <span className="ds-num">{Math.min(doc.duration, 30)}s</span> of the mix</>}>
          <MixWaveform doc={doc} seconds={Math.min(doc.duration, 30)} height={110} label="Programme mix waveform" />
          <Field label={`Loudness target: ${doc.loudnessTarget} LUFS`}>
            <input className="vx-range" type="range" min={-30} max={-9} value={doc.loudnessTarget} aria-label="Loudness target" onChange={(event) => handle.edit((current) => ({ ...current, loudnessTarget: Number(event.target.value) }), "Change the loudness target")} />
          </Field>
        </Card>
      </Stack>
    );
  }

  if (lens === "Effects") {
    return (
      <Card eyebrow="EFFECTS" prov="human" title="Audio effects" subtitle="What is implemented, and what is not">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Gain", value: "Implemented. Applied per track and per clip when the mix is built." },
            { label: "Fades", value: "Implemented. Linear in and out per clip, applied to the samples." },
            { label: "Mute and solo", value: "Implemented. A soloed track silences the others in the mix." },
            { label: "Ducking", value: "Not implemented. A sidechain that lowers music under speech would need an envelope follower; it is not built." },
            { label: "Equalisation", value: "Not implemented." },
            { label: "Noise reduction", value: "Not implemented." },
          ]} />
          <Notice tone="warning" title="Nothing on this screen pretends to clean up audio">
            The mixer changes level, balance and fades, which are real operations on the samples. Spectral repair, de-noise and voice isolation are not here.
          </Notice>
          <Notice tone="info" title="Voice consent">
            Any narration added to a project must have the speaker's consent on the record. Nothing here synthesises a voice, and no model is connected that could.
          </Notice>
        </Stack>
      </Card>
    );
  }

  const meterFor = (trackId: string) => {
    const samples = mixAudio({ ...doc, tracks: doc.tracks.map((track) => ({ ...track, solo: track.id === trackId })) }, ui.playhead, 0.4, 8000);
    return measureLoudness(samples);
  };

  return (
    <Grid>
      {audioTracks.map((track) => {
        const meter = meterFor(track.id);
        return (
          <Card
            key={track.id}
            span={lens === "Mixer" ? 4 : 6}
            eyebrow="TRACK"
            prov="human"
            title={track.name}
            subtitle={<><span className="ds-num">{clipsOnTrack(doc, track.id).length}</span> clips</>}
          >
            <Stack gap={3}>
              <div>
                <label className="vx-label" htmlFor={`mix-gain-${track.id}`}>
                  Gain <span className="ds-num" style={{ float: "right", fontWeight: 400 }}>{(track.gainDb ?? 0).toFixed(1)} dB</span>
                </label>
                <input
                  id={`mix-gain-${track.id}`}
                  className="vx-range"
                  type="range"
                  min={-40}
                  max={12}
                  step={0.5}
                  value={track.gainDb ?? 0}
                  onChange={(event) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, gainDb: Number(event.target.value) } : item)) }), "Change the gain")}
                />
              </div>
              <div>
                <span className="vx-label">Level at the playhead</span>
                <Meter value={Math.max(0, 60 + meter.rms)} max={60} tone={meter.samplePeakDb > -1 ? "danger" : meter.samplePeakDb > -6 ? "warning" : "success"} label={`${track.name} level`} />
                <p className="vx-mini">RMS <span className="ds-num">{meter.rms.toFixed(1)} dBFS</span> · peak <span className="ds-num">{meter.samplePeakDb.toFixed(1)} dBFS</span></p>
              </div>
              <Row gap={1} wrap>
                <Button size="sm" variant={track.muted ? "primary" : "ghost"} onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, muted: !item.muted } : item)) }), "Mute the track")}>Mute</Button>
                <Button size="sm" variant={track.solo ? "primary" : "ghost"} onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, solo: !item.solo } : item)) }), "Solo the track")}>Solo</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Mixer property", { id: track.id })}>Properties</Button>
              </Row>
            </Stack>
          </Card>
        );
      })}
      <Card span={12} eyebrow="PROGRAMME" prov="human" title="The mix" subtitle="Every audible clip summed, with gains and fades applied to the samples">
        <Stack gap={3}>
          <MixWaveform doc={doc} seconds={Math.min(doc.duration, 30)} height={120} label="Programme mix waveform" />
          <Row gap={2} wrap>
            <Button
              variant="primary"
              onClick={async () => {
                if (playing) { playing.stop(); setPlaying(null); return; }
                try {
                  const samples = mixAudio(doc, 0, Math.min(doc.duration, 20), 22050);
                  const player = await playSamples(samples, 22050);
                  setPlaying(player);
                  window.setTimeout(() => { player.stop(); setPlaying(null); }, Math.min(doc.duration, 20) * 1000);
                } catch (error) {
                  context.toast("Cannot play", error instanceof Error ? error.message : "Audio is unavailable.", "failed");
                }
              }}
            >
              {playing ? "Stop" : "Play the mix"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const samples = mixAudio(doc, 0, doc.duration, 22050);
                downloadBlob(`${slug(record.title)}-mix.wav`, wavFromSamples(samples, 22050));
                context.toast("Mix written", `A ${doc.duration.toFixed(1)}s WAV at 22.05 kHz, encoded in this browser from the same samples the waveform shows.`);
              }}
            >
              Export the mix as WAV
            </Button>
            <Button variant="ghost" onClick={() => context.openOverlay("loudness review")}>Loudness…</Button>
          </Row>
        </Stack>
      </Card>
    </Grid>
  );
}

/** A real 16-bit PCM WAV, written byte by byte. */
function wavFromSamples(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/* ---------------------------- VIDEO-005 ---------------------------- */

function CaptionScreen({ context, lens }: { context: ScreenContext; lens: "Transcript" | "Captions" | "Languages" | "Review" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;
  const languages = [...new Set(doc.captions.map((caption) => caption.language))];
  const issues = captionIssues(doc);
  const inLanguage = doc.captions.filter((caption) => caption.language === ui.language).sort((a, b) => a.start - b.start);

  if (lens === "Languages") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Nothing here translates">
          There is no translation service connected. A second language can be added as an empty track with the same timings, which a person then fills in. The screen will not pretend to have translated anything.
        </Notice>
        <Card eyebrow="LANGUAGES" prov="human" title="Caption tracks" subtitle={<><span className="ds-num">{languages.length}</span> languages</>}>
          <Stack gap={2}>
            {languages.map((language) => {
              const cues = doc.captions.filter((caption) => caption.language === language);
              return (
                <Row key={language} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <strong className="ds-grow">{language}</strong>
                  <Pill><span className="ds-num">{cues.length}</span> cues</Pill>
                  <Pill tone={cues.every((cue) => cue.reviewed) ? "success" : "warning"}>
                    <span className="ds-num">{cues.filter((cue) => cue.reviewed).length}</span> checked
                  </Pill>
                  <Button size="sm" variant={language === ui.language ? "primary" : "ghost"} onClick={() => videoUi.set((current) => ({ ...current, language }))}>Edit</Button>
                </Row>
              );
            })}
            <Row gap={2} wrap>
              {["fr", "de", "nl", "es"].filter((code) => !languages.includes(code)).map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    handle.edit((current) => ({
                      ...current,
                      captions: [...current.captions, ...current.captions.filter((caption) => caption.language === "en").map((caption) => ({ ...caption, id: `${caption.id}-${code}`, language: code, text: "", reviewed: false }))],
                    }), `Add a ${code} caption track`);
                    context.toast("Track added", `${code} cues were created with the English timings and no text. A person writes them.`);
                  }}
                >
                  Add {code} with the same timings
                </Button>
              ))}
            </Row>
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (lens === "Review") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Cues" value={doc.captions.length} prov="human" meta={`${languages.length} languages`} />
          <Stat label="Checked by a person" value={doc.captions.filter((caption) => caption.reviewed).length} prov="human" meta="the rest are drafts" />
          <Stat label="Findings" value={issues.length} prov="human" meta="timing and reading speed" />
          <Stat label="Transcription service" value="Not connected" unavailable meta="every cue was typed here" />
        </StatRow>
        {issues.length === 0 ? <Notice tone="success" title="No findings">Every cue reads at a comfortable speed and none overlap.</Notice> : (
          <Card eyebrow="REVIEW" prov="human" title="Findings" subtitle={<><span className="ds-num">{issues.length}</span> across <span className="ds-num">{new Set(issues.map((issue) => issue.captionId)).size}</span> cues</>}>
            <Stack gap={2}>
              {issues.map((issue, index) => {
                const caption = doc.captions.find((item) => item.id === issue.captionId);
                return (
                  <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <span className="ds-num">{caption ? timecode(caption.start, doc.fps) : "—"}</span>
                    <span className="ds-grow">{issue.note}</span>
                    {caption && <Button size="sm" variant="ghost" onClick={() => setPlayhead(caption.start, doc.fps)}>Go to it</Button>}
                  </Row>
                );
              })}
            </Stack>
          </Card>
        )}
        <Notice tone="warning" title="Captions are a draft until a person says otherwise">
          Nothing on this screen was produced by speech recognition — no model is connected. Every cue here was typed, and each one carries whether a person has checked it.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Captions") {
    return (
      <Grid>
        <Card span={7} eyebrow="CAPTIONS" prov="human" title="Cue list" subtitle={<><span className="ds-num">{inLanguage.length}</span> cues in {ui.language}</>}>
          <DataGrid
            rows={inLanguage}
            rowId={(row) => row.id}
            label="Captions"
            columns={[
              { key: "start", header: "In", primary: true, cell: (row) => <span className="ds-num">{timecode(row.start, doc.fps)}</span>, sortValue: (row) => row.start },
              { key: "end", header: "Out", cell: (row) => <span className="ds-num">{timecode(row.end, doc.fps)}</span> },
              { key: "text", header: "Text", cell: (row) => row.text || <span className="ds-subtle">empty</span>, filterValue: (row) => row.text },
              { key: "cps", header: "Chars/s", align: "end", cell: (row) => <span className="ds-num">{Math.round(row.text.length / Math.max(0.1, row.end - row.start))}</span> },
              { key: "state", header: "Checked", cell: (row) => <Pill tone={row.reviewed ? "success" : "warning"}>{row.reviewed ? "yes" : "draft"}</Pill> },
            ]}
            onOpen={(id) => { const caption = doc.captions.find((item) => item.id === id); if (caption) { setPlayhead(caption.start, doc.fps); context.openOverlay("Caption editor", { id }); } }}
          />
        </Card>
        <Card span={5} eyebrow="PREVIEW" prov="human" title="At the playhead" flush>
          <div style={{ padding: 12, background: "#07070A" }}>
            <PreviewMonitor doc={doc} time={ui.playhead} height={200} captions />
          </div>
          <div style={{ padding: 12 }}>
            <TransportBar doc={doc} handle={handle} />
          </div>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow="TRANSCRIPT" prov="human" title="Timecoded transcript" subtitle="Click a line to move the playhead to it">
        <Stack gap={2}>
          {inLanguage.length === 0 ? (
            <Empty title="No transcript yet" action={
              <Button
                variant="primary"
                onClick={() => handle.edit((current) => ({
                  ...current,
                  captions: [...current.captions, { id: `cap-${wallMs().toString(36)}`, start: 0, end: Math.min(3, current.duration), text: "", reviewed: false, language: ui.language }],
                }), "Add the first cue")}
              >
                Add the first cue
              </Button>
            }>
              There is no speech recognition connected, so a transcript is typed here.
            </Empty>
          ) : inLanguage.map((caption) => (
            <div key={caption.id} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <Row gap={2}>
                <button type="button" className="ds-num" style={{ background: "none", color: "var(--fg-link)" }} onClick={() => setPlayhead(caption.start, doc.fps)}>
                  {timecode(caption.start, doc.fps)}
                </button>
                <TextInput
                  aria-label={`Speaker at ${timecode(caption.start, doc.fps)}`}
                  placeholder="Speaker"
                  value={caption.speaker ?? ""}
                  onChange={(event) => handle.live((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, speaker: event.target.value } : item)) }))}
                  onBlur={handle.beginGesture}
                  style={{ maxWidth: 120 }}
                />
                <Pill tone={caption.reviewed ? "success" : "warning"}>{caption.reviewed ? "checked" : "draft"}</Pill>
              </Row>
              <TextArea
                rows={2}
                aria-label={`Transcript at ${timecode(caption.start, doc.fps)}`}
                value={caption.text}
                onChange={(event) => handle.live((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, text: event.target.value, reviewed: false } : item)) }))}
                onBlur={handle.beginGesture}
              />
              <Row gap={1} wrap>
                <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, reviewed: !item.reviewed } : item)) }), "Mark the cue")}>{caption.reviewed ? "Unmark" : "Mark as checked"}</Button>
                <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => splitCaption(current, caption.id, (caption.start + caption.end) / 2), "Split the cue")}>Split in half</Button>
                <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, captions: current.captions.filter((item) => item.id !== caption.id) }), "Delete the cue")}>Delete</Button>
              </Row>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => handle.edit((current) => {
              const last = [...current.captions].filter((item) => item.language === ui.language).sort((a, b) => a.start - b.start).at(-1);
              const start = last ? Math.min(current.duration - 1, last.end) : 0;
              return { ...current, captions: [...current.captions, { id: `cap-${wallMs().toString(36)}`, start, end: Math.min(current.duration, start + 2.5), text: "", reviewed: false, language: ui.language }] };
            }, "Add a cue")}
          >
            Add a cue after the last
          </Button>
        </Stack>
      </Card>
      <Card span={5} eyebrow="MONITOR" prov="human" title="Monitor" flush>
        <div style={{ padding: 12, background: "#07070A" }}>
          <PreviewMonitor doc={doc} time={ui.playhead} height={200} captions />
        </div>
        <div style={{ padding: 12 }}>
          <Stack gap={2}>
            <TransportBar doc={doc} handle={handle} />
            <Row gap={2} wrap>
              <Button size="sm" variant="secondary" onClick={() => { downloadText(`${slug(record.title)}-${ui.language}.srt`, captionsToSrt(doc.captions, ui.language), "application/x-subrip"); context.toast("SRT written", `${inLanguage.length} cues with millisecond timings.`); }}>Export SRT</Button>
              <Button size="sm" variant="ghost" onClick={() => { downloadText(`${slug(record.title)}-${ui.language}.vtt`, captionsToVtt(doc.captions, ui.language), "text/vtt"); context.toast("WebVTT written", "Suitable for a <track> element.");  }}>Export WebVTT</Button>
            </Row>
          </Stack>
        </div>
      </Card>
    </Grid>
  );
}

/* ---------------------------- VIDEO-006 ---------------------------- */

const BUILT_IN_PRESETS: { name: string; effects: { kind: Clip["effects"][number]["kind"]; amount: number }[] }[] = [
  { name: "Showroom warm", effects: [{ kind: "exposure", amount: 8 }, { kind: "temperature", amount: 30 }, { kind: "saturation", amount: 12 }] },
  { name: "Cool product", effects: [{ kind: "contrast", amount: 14 }, { kind: "temperature", amount: -24 }, { kind: "saturation", amount: -6 }] },
  { name: "Press monochrome", effects: [{ kind: "contrast", amount: 18 }, { kind: "saturation", amount: -100 }] },
  { name: "Soft focus", effects: [{ kind: "blur", amount: 14 }, { kind: "exposure", amount: 6 }] },
];

function presetEffects(preset: { effects: { kind: Clip["effects"][number]["kind"]; amount: number }[] }): Clip["effects"] {
  return preset.effects.map((effect, index) => ({ id: `fx-${index}-${wallMs().toString(36)}`, kind: effect.kind, amount: effect.amount, bypassed: false }));
}

function EffectsScreen({ context, lens }: { context: ScreenContext; lens: "Colour" | "Effects" | "Presets" | "Compare" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const loaded = handle.doc;
  const scopes = useMemo(() => { if (!loaded) return null; try { return frameScopes(loaded, ui.playhead); } catch { return null; } }, [loaded, ui.playhead]);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId) ?? doc.clips.find((item) => doc.tracks.find((track) => track.id === item.trackId)?.kind === "video");

  if (lens === "Compare") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Both panels are rendered now">Neither is cached. The left has every effect bypassed, the right has the stack applied.</Notice>
        <Grid>
          <Card span={6} eyebrow="BYPASSED" prov="human" title="Without effects" flush>
            <div style={{ padding: 12, background: "#07070A" }}><PreviewMonitor doc={doc} time={ui.playhead} height={240} bypassEffects /></div>
          </Card>
          <Card span={6} eyebrow="GRADED" prov="human" title="With effects" flush>
            <div style={{ padding: 12, background: "#07070A" }}><PreviewMonitor doc={doc} time={ui.playhead} height={240} /></div>
          </Card>
        </Grid>
        <Card eyebrow="TRANSPORT" prov="human" title="Playhead"><TransportBar doc={doc} handle={handle} /></Card>
      </Stack>
    );
  }

  if (lens === "Presets") {
    const presets = [...BUILT_IN_PRESETS, ...(doc.effectPresets ?? [])];
    return (
      <Grid>
        {presets.map((preset) => (
          <Card key={preset.name} span={6} eyebrow="PRESET" prov="human" title={preset.name} subtitle={preset.effects.map((effect) => `${effect.kind} ${effect.amount}`).join(" · ")}>
            <Stack gap={2}>
              {clip && (
                <img
                  src={frameDataUrl({ ...doc, clips: doc.clips.map((item) => (item.id === clip.id ? { ...item, effects: preset.effects.map((effect, index) => ({ id: `p${index}`, kind: effect.kind, amount: effect.amount, bypassed: false })) } : item)) }, Math.max(clip.start + 0.2, ui.playhead), 320)}
                  alt={`${preset.name} applied`}
                  style={{ width: "100%", borderRadius: 4 }}
                />
              )}
              <Button
                variant="secondary"
                disabled={!clip}
                onClick={() => {
                  if (!clip) return;
                  handle.edit((current) => patchClip(current, clip.id, { effects: presetEffects(preset) }), `Apply ${preset.name}`);
                  context.toast("Applied", `${preset.name} is on ${clip.name}.`);
                }}
              >
                Apply to {clip?.name ?? "the clip"}
              </Button>
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={5} eyebrow="GRADE" prov="human" title={clip ? clip.name : "No clip"} actions={<ClipPicker doc={doc} />}>
        {clip ? <ColourPanel handle={handle} context={context} /> : <Empty title="Select a clip on the timeline" />}
      </Card>
      <Card span={7} eyebrow="MONITOR" prov="human" title="Preview" flush>
        <div style={{ padding: 12, background: "#07070A" }}>
          <PreviewMonitor doc={doc} time={ui.playhead} height={260} />
        </div>
        <div style={{ padding: 12 }}>
          <Stack gap={3}>
            <TransportBar doc={doc} handle={handle} />
            {lens === "Colour" && scopes && (
              <div>
                <span className="vx-label">RGB histogram at this frame</span>
                <Scopes scopes={scopes} />
                <p className="vx-mini">Counted from the frame the monitor just drew, at <span className="ds-num">{timecode(ui.playhead, doc.fps)}</span>.</p>
              </div>
            )}
            <Notice tone="warning" title="Rendering can differ from this preview">
              The export draws the same frames with the same filters, but the encoder it hands them to is the browser's. Check the exported file before it goes anywhere; the export screen says what was produced.
            </Notice>
          </Stack>
        </div>
      </Card>
    </Grid>
  );
}

/** Choose the clip the colour actions work on, without going back to the timeline. */
function ClipPicker({ doc }: { doc: VideoDoc }) {
  const ui = useStore(videoUi);
  const picture = doc.clips.filter((item) => doc.tracks.find((track) => track.id === item.trackId)?.kind !== "audio");
  return (
    <Select aria-label="Clip to grade" value={ui.selectedClipId ?? ""} onChange={(event) => videoUi.set((current) => ({ ...current, selectedClipId: event.target.value || undefined }))}>
      <option value="">Choose a clip</option>
      {picture.map((item) => <option key={item.id} value={item.id}>{item.name} · {timecode(item.start, doc.fps)}</option>)}
    </Select>
  );
}

function Scopes({ scopes }: { scopes: { r: number[]; g: number[]; b: number[]; luma: number[] } }) {
  const peak = Math.max(1, ...scopes.r, ...scopes.g, ...scopes.b);
  return (
    <svg viewBox="0 0 64 40" style={{ width: "100%", height: 90, background: "#0B1020", borderRadius: 6 }} role="img" aria-label="RGB histogram of the current frame">
      {(["r", "g", "b"] as const).map((channel) => (
        <polyline
          key={channel}
          points={scopes[channel].map((value, index) => `${index},${40 - (value / peak) * 38}`).join(" ")}
          fill="none"
          stroke={channel === "r" ? "#FF6B6B" : channel === "g" ? "#4FE08A" : "#6FA8FF"}
          strokeWidth={0.8}
        />
      ))}
    </svg>
  );
}

/* ---------------------------- VIDEO-007 ---------------------------- */

function ExportScreen({ context, lens }: { context: ScreenContext; lens: "Export" | "Queue" | "History" | "Failures" }) {
  const { record, handle } = useVideoDoc(context);
  const render = useStore(renderUi);
  const preset = render.preset;
  const setPreset = (value: string) => renderUi.set((current) => ({ ...current, preset: value }));
  const support = useMemo(() => recorderSupport(), []);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;

  const presets: Record<string, { width: number; height: number; fps: number; bitrate: number }> = Object.fromEntries(
    Object.entries(RENDER_PRESETS).map(([key, value]) => [key, { ...value, fps: doc.fps }]),
  );
  const busy = render.busy;
  const progress = render.progress;
  const runExport = () => startRender(context, record.title, preset);

  if (lens === "Queue" || lens === "History" || lens === "Failures") {
    const rows = doc.renders.filter((job) => (lens === "Queue" ? job.state === "queued" || job.state === "running" : lens === "Failures" ? job.state === "failed" || job.state === "cancelled" : job.state === "done"));
    return (
      <Card
        eyebrow={lens.toUpperCase()}
        prov="posted"
        title={lens === "Queue" ? "Jobs running" : lens === "Failures" ? "Jobs that did not finish" : "Files produced"}
        subtitle={<><span className="ds-num">{rows.length}</span> of <span className="ds-num">{doc.renders.length}</span></>}
      >
        {rows.length === 0 ? (
          <Empty title={lens === "Queue" ? "Nothing is running" : lens === "Failures" ? "Nothing failed" : "Nothing has been rendered yet"}>
            {lens === "History" ? "A finished render records the file name, the byte count and the frame count it actually produced." : "Start an export on the Export tab."}
          </Empty>
        ) : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label={lens}
            columns={[
              { key: "at", header: "Started", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "preset", header: "Preset", cell: (row) => row.preset },
              { key: "state", header: "State", cell: (row) => <Pill tone={row.state === "done" ? "success" : row.state === "failed" ? "danger" : row.state === "cancelled" ? "warning" : "info"} dot>{row.state}</Pill> },
              { key: "artifact", header: "File", cell: (row) => (row.artifact ? <span className="ds-num">{row.artifact}</span> : "none") },
              { key: "bytes", header: "Bytes", align: "end", cell: (row) => (row.bytes ? <span className="ds-num">{(row.bytes / 1024 / 1024).toFixed(2)} MB</span> : "—") },
              { key: "frames", header: "Frames", align: "end", cell: (row) => (row.frames ? <span className="ds-num">{row.frames}</span> : "—") },
              { key: "note", header: "What happened", cell: (row) => (isInterrupted(row) ? <>Interrupted: no page in this browser is rendering it. {row.note}</> : row.note) },
              ...(lens === "Queue" ? [{
                key: "resume", header: "Resume", cell: (row: RenderJob) => (isInterrupted(row) ? (
                  <Row gap={1}>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void startRender(context, record.title, row.preset, row.id)}>Resume</Button>
                    <Button size="sm" variant="ghost" onClick={() => void closeInterrupted(context, row.id)}>Close</Button>
                  </Row>
                ) : <Pill tone="info">rendering here</Pill>),
              }] : []),
              ...(lens === "History" ? [{
                key: "delivery", header: "Publishing", cell: (row: RenderJob) => (row.delivery ? <Pill tone="info">{CAPABILITY_LABELS[row.delivery.state]}</Pill> : <span className="ds-subtle">not requested</span>),
              }] : []),
            ]}
          />
        )}
      </Card>
    );
  }

  const frames = Math.round(doc.duration * presets[preset].fps);
  return (
    <Grid>
      <Card span={5} eyebrow="RENDER" prov="human" title="Render settings">
        <Stack gap={3}>
          <Field label="Preset">
            <Select value={preset} disabled={busy} onChange={(event) => setPreset(event.target.value)}>
              {Object.keys(presets).map((key) => <option key={key}>{key}</option>)}
            </Select>
          </Field>
          <FactGrid columns={2} dense items={[
            { label: "Frame", value: `${presets[preset].width} × ${presets[preset].height}`, mono: true },
            { label: "Rate", value: `${presets[preset].fps} fps`, mono: true },
            { label: "Bitrate", value: `${(presets[preset].bitrate / 1_000_000).toFixed(1)} Mb/s`, mono: true },
            { label: "Frames to draw", value: frames, mono: true },
            { label: "Container", value: support.mimeType ?? "unavailable", mono: true, tone: support.webm ? undefined : "danger" },
          ]} />
          <div className="vd-boundary" data-ok={support.webm || undefined}>
            <div className="vd-boundary-row"><Pill tone={support.webm ? "success" : "danger"} dot>Renders here</Pill><span>{support.webm ? <>This machine draws every frame and records WebM in real time, about <span className="ds-num">{Math.round(doc.duration)}</span> s. The file is checked for a non-zero size before it is offered.</> : <>{support.reason} No video file can be produced here.</>}</span></div>
            <div className="vd-boundary-row"><Pill tone="warning" dot>Not produced</Pill><span>MP4, H.264 and HEVC. No render service is connected, and nothing is uploaded.</span></div>
          </div>
          {progress && (
            <div>
              <Meter value={progress.frame} max={progress.frames} label="Render progress" />
              <p className="vx-mini">Frame <span className="ds-num">{progress.frame}</span> of <span className="ds-num">{progress.frames}</span></p>
            </div>
          )}
          <Row gap={2} wrap>
            <Button variant="primary" busy={busy} disabled={!support.webm} onClick={() => void runExport()}>
              {support.webm ? `Render ${frames} frames to WebM` : "WebM is unavailable here"}
            </Button>
            {busy && <Button variant="outline-danger" onClick={() => cancelRender(context)}>Cancel</Button>}
          </Row>
        </Stack>
      </Card>
      <Card span={7} eyebrow="WITHOUT AN ENCODER" prov="human" title="What can be produced anywhere" subtitle="A numbered PNG sequence is lossless and can be encoded elsewhere; it never depends on this browser's encoder.">
        <Stack gap={3}>
          <PreviewMonitor doc={doc} time={videoUi.get().playhead} height={200} />
          <Row gap={2} wrap>
            <Button
              variant="secondary"
              onClick={() => {
                const sheet = contactSheet(doc, 4, 3, 320);
                sheet.canvas.toBlob((blob) => {
                  if (!blob) { context.toast("Nothing written", "The canvas produced no data.", "failed"); return; }
                  downloadBlob(`${slug(record.title)}-contact-sheet.png`, blob);
                  context.toast("Contact sheet written", `Twelve frames at ${sheet.times.map((time) => timecode(time, doc.fps)).slice(0, 2).join(", ")} and so on — ${(blob.size / 1024).toFixed(0)} kB.`);
                }, "image/png");
              }}
            >
              Contact sheet (PNG)
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const count = Math.min(24, Math.round(doc.duration * doc.fps));
                for (let index = 0; index < count; index += 1) {
                  const time = (index / Math.max(1, count - 1)) * Math.max(0, doc.duration - 1 / doc.fps);
                  const url = frameDataUrl(doc, time, 640);
                  const response = await fetch(url);
                  downloadBlob(`${slug(record.title)}-${String(index).padStart(4, "0")}.png`, await response.blob());
                }
                context.toast("Frame sequence written", `${count} PNG files downloaded, evenly spaced across the sequence. They are numbered so an encoder elsewhere can assemble them.`);
              }}
            >
              Frame sequence (24 PNGs)
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                downloadText(`${slug(record.title)}-edl.json`, JSON.stringify({
                  sequence: record.title, fps: doc.fps, width: doc.width, height: doc.height, duration: doc.duration,
                  tracks: doc.tracks, clips: doc.clips, transitions: doc.transitions,
                }, null, 2), "application/json");
                context.toast("Edit list written", "Every clip with its timeline position, source in-point and duration.");
              }}
            >
              Edit list (JSON)
            </Button>
          </Row>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- VIDEO-008 ---------------------------- */

function ReviewScreen({ context, lens }: { context: ScreenContext; lens: "Comments" | "Versions" | "Approval" | "Delivery" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const [note, setNote] = useState("");
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;

  if (lens === "Versions") {
    return (
      <Grid>
        <Card span={6} eyebrow="SESSION" prov="human" title="This session" subtitle={<><span className="ds-num">{handle.historyLabels.length}</span> undoable steps</>}>
          {handle.historyLabels.length === 0 ? <Empty title="Nothing yet" /> : (
            <Stack gap={1}>
              {[...handle.historyLabels].reverse().slice(0, 15).map((label, index) => (
                <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}><span className="ds-grow">{label}</span><span className="ds-num">{handle.historyLabels.length - index}</span></Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={6} eyebrow="RECORD" prov="posted" title="Saved versions" subtitle={<>revision <span className="ds-num">{record.revision}</span></>}>
          {record.history.length === 0 ? <p className="ds-subtle">No snapshots yet.</p> : (
            <DataGrid
              rows={record.history.map((item, index) => ({ ...item, id: String(index) }))}
              rowId={(row) => row.id}
              label="Versions"
              columns={[
                { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
                { key: "status", header: "Status", cell: (row) => row.status },
              ]}
            />
          )}
        </Card>
        <Card span={12} eyebrow="COMPARE" prov="posted" title="Compare with a saved version" subtitle="The current cut against a snapshot the record kept">
          <VersionCompare context={context} />
        </Card>
      </Grid>
    );
  }

  if (lens === "Approval") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="An approval binds to a revision, not to the project">
          Each decision records the cut digest and the record revision it was given at. Any edit to the cut changes the digest, and the approval is then shown as given for another cut.
        </Notice>
        <Card eyebrow="DECISIONS" prov="posted" title="Review decisions" subtitle={<><span className="ds-num">{doc.reviews.length}</span> recorded · the record is at revision <span className="ds-num">{record.revision}</span></>}>
          {doc.reviews.length === 0 ? <Empty title="Nothing recorded yet" /> : (
            <Stack gap={2}>
              {doc.reviews.map((review) => (
                <Row key={review.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <strong>{review.by}</strong>
                    <p className="ds-subtle">{review.note}</p>
                    {review.digest && <p className="vx-mini">Cut digest <span className="ds-num">{review.digest}</span></p>}
                  </div>
                  <Pill tone={review.state === "approved" ? "success" : review.state === "changes" ? "warning" : "info"} dot>{review.state}</Pill>
                  <Pill tone={review.digest === cutDigest(doc) ? "success" : "warning"}>
                    {review.digest === cutDigest(doc) ? <>covers this cut (<span className="ds-num">{review.digest}</span>)</> : <>given for another cut, at revision <span className="ds-num">{review.revision}</span></>}
                  </Pill>
                </Row>
              ))}
            </Stack>
          )}
          <Row gap={2} style={{ marginBlockStart: 12 }}>
            <Button variant="primary" onClick={() => context.openOverlay("final signoff")}>Record a decision</Button>
          </Row>
        </Card>
      </Stack>
    );
  }

  if (lens === "Delivery") {
    const approved = doc.reviews.find((review) => review.state === "approved" && review.digest === cutDigest(doc));
    const done = doc.renders.filter((job) => job.state === "done");
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Approved cut" value={approved ? `revision ${approved.revision}` : "none"} prov={approved ? "posted" : "unknown"} unavailable={!approved} meta={approved ? `by ${approved.by}` : "no approval covers the current revision"} />
          <Stat label="Files produced" value={done.length} prov="posted" meta="verified non-empty when written" />
          <Stat label="Delivery service" value="Not connected" unavailable meta="files download to this machine" />
          <Stat label="Cut digest" value={cutDigest(doc)} prov="posted" meta="of the clip list and timings" />
        </StatRow>
        {!approved && (
          <Notice tone="warning" title="Nothing is approved at this revision">
            A delivery should not go out against an approval given for an earlier cut. Record a decision on the Approval tab first.
          </Notice>
        )}
        <Card eyebrow="DELIVERY" prov="posted" title="What would be delivered" subtitle="The digest locks the approval to this exact cut">
          <Properties rows={[
            { label: "Digest", value: <span className="ds-num">{cutDigest(doc)}</span> },
            { label: "Computed from", value: "Every clip's source, position, source in-point and duration, plus the transitions" },
            { label: "Changes if", value: "Any edit at all changes the digest, so an approval cannot drift onto a different cut" },
            { label: "Files", value: done.length === 0 ? "none rendered yet" : done.map((job) => job.artifact).join(", ") },
          ]} />
        </Card>
      </Stack>
    );
  }

  const markers = [...doc.markers].sort((a, b) => a.time - b.time);
  return (
    <Grid>
      <Card span={7} eyebrow="MONITOR" prov="human" title="Comment at a timecode" flush>
        <div style={{ padding: 12, background: "#07070A" }}>
          <PreviewMonitor doc={doc} time={ui.playhead} height={260} captions />
        </div>
        <div style={{ padding: 12 }}>
          <Stack gap={2}>
            <TransportBar doc={doc} handle={handle} />
            <Field label={`Note at ${timecode(ui.playhead, doc.fps)}`}>
              <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="The cut lands a beat late here." />
            </Field>
            <Button
              variant="primary"
              disabled={!note.trim()}
              onClick={() => {
                handle.edit((current) => ({
                  ...current,
                  markers: [...current.markers, { id: `mk-${wallMs().toString(36)}`, time: ui.playhead, text: note, author: context.actor, at: clockIso(), resolved: false }],
                }), "Add a timecoded note");
                setNote("");
                context.toast("Note added", `Pinned at ${timecode(ui.playhead, doc.fps)} and shown on the timeline.`);
              }}
            >
              Add the note at this timecode
            </Button>
          </Stack>
        </div>
      </Card>
      <Card span={5} eyebrow="NOTES" prov="human" title="Notes" subtitle={<><span className="ds-num">{markers.filter((marker) => !marker.resolved).length}</span> open of <span className="ds-num">{markers.length}</span></>}>
        {markers.length === 0 ? <Empty title="No notes yet" /> : (
          <Stack gap={2}>
            {markers.map((marker) => (
              <div key={marker.id} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <Row gap={2}>
                  <button type="button" className="ds-num" style={{ background: "none", color: "var(--fg-link)" }} onClick={() => setPlayhead(marker.time, doc.fps)}>{timecode(marker.time, doc.fps)}</button>
                  <strong className="ds-grow">{marker.author}</strong>
                  <Pill tone={marker.resolved ? "success" : "warning"}>{marker.resolved ? "done" : "open"}</Pill>
                </Row>
                <p>{marker.text}</p>
                <Row gap={1}>
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, markers: current.markers.map((item) => (item.id === marker.id ? { ...item, resolved: !item.resolved } : item)) }), "Resolve the note")}>{marker.resolved ? "Reopen" : "Mark done"}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await context.mutate.create({
                        collection: "tasks", title: `Edit note at ${timecode(marker.time, doc.fps)}: ${marker.text.slice(0, 50)}`,
                        status: "todo", summary: `From the review of ${record.title}.`, parentId: record.id,
                        fields: { assignee: context.actor, timecode: timecode(marker.time, doc.fps), source: "video review" },
                      }, "Edit task created from a review note");
                      context.toast("Assigned", "A task was created in Projects, linked to this project.");
                    }}
                  >
                    Assign
                  </Button>
                </Row>
              </div>
            ))}
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

/** A short digest of the cut, so an approval cannot drift onto another edit. */
function cutDigest(doc: VideoDoc): string {
  const material = doc.clips
    .slice()
    .sort((a, b) => a.start - b.start || a.trackId.localeCompare(b.trackId))
    .map((clip) => `${clip.trackId}:${clip.sourceId}:${clip.start.toFixed(3)}:${clip.sourceIn.toFixed(3)}:${clip.duration.toFixed(3)}`)
    .concat(doc.transitions.map((transition) => `${transition.fromClipId}>${transition.toClipId}:${transition.kind}:${transition.duration}`))
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/* ====================================================================== *
 * Overlays and registration
 * ====================================================================== */

function NewSequence({ context, close }: { context: ScreenContext; close: () => void }) {
  const [name, setName] = useState("");
  const [fps, setFps] = useState(25);
  const [size, setSize] = useState("1280x720");
  return (
    <form
      id="video-new-sequence"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const [width, height] = size.split("x").map(Number);
        const doc = starterVideo(name || "Untitled sequence");
        doc.fps = fps;
        doc.width = width;
        doc.height = height;
        const made = await context.mutate.create({
          collection: "videos", title: name || "Untitled sequence", status: "draft",
          summary: `${width} × ${height} at ${fps} fps.`, body: doc,
          fields: { kind: "sequence", fps, width, height, duration: doc.duration },
        }, `Sequence ${name || "Untitled"} created`);
        context.toast("Created", `${made.title} opens with two clips, a title and a music bed.`);
        close();
        context.navigate(context.path("/o/:org/video/projects/:id", made.id));
      }}
    >
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="Showroom walkthrough" autoFocus /></Field>
      <Row gap={3} wrap>
        <Field label="Frame rate" hint="Fixed at creation">
          <Select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
            {[24, 25, 30, 50, 60].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
          </Select>
        </Field>
        <Field label="Frame size">
          <Select value={size} onChange={(event) => setSize(event.target.value)}>
            {["1920x1080", "1280x720", "1080x1080", "1080x1920"].map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
      </Row>
      <p className="vx-mini">Every clip snaps to a whole frame at this rate. A source shot at another rate is conformed by mapping frames, not by guessing.</p>
    </form>
  );
}

function MediaImport({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context, (context.overlayPayload as { id?: string } | undefined)?.id);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"video" | "audio">("video");
  const [license, setLicense] = useState("Unknown");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  return (
    <Stack gap={3}>
      <p className="ds-prose">No video file is stored in this workspace. A source added here is a generated shot: a look and a motion the renderer draws from, used by the preview, the scrub and the export.</p>
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Workshop hands" autoFocus /></Field>
      <Row gap={3} wrap>
        <Field label="Kind">
          <Select value={kind} onChange={(event) => setKind(event.target.value as "video")}>
            <option value="video">Picture</option>
            <option value="audio">Audio</option>
          </Select>
        </Field>
        <Field label="Licence">
          <Select value={license} onChange={(event) => setLicense(event.target.value)}>
            {SOURCE_LICENCES.map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
      </Row>
      {license === "Unknown" && <Notice tone="danger" title="Rights are not recorded">A source whose rights are unknown is flagged in the project list and should not be delivered.</Notice>}
      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                const id = `src-${wallMs().toString(36)}`;
                handle.edit((current) => ({
                  ...current,
                  sources: [...current.sources, {
                    id, name, kind, duration: 20,
                    look: { hue: (current.sources.length * 47) % 360, motion: "pan", subject: kind === "audio" ? "bars" : "room", grain: 0.05 },
                    tone: kind === "audio" ? { root: 110, kind: "room", tempo: 90 } : undefined,
                    license, credit: "not recorded", proxy: "generated",
                  }],
                }), `Add the source ${name}`);
                context.toast("Source added", `${name} is in the media bin of ${record.title}. Nothing was uploaded: the picture is generated.`);
                close();
              }}
            >
              Add the source
            </Button>
          }
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

function ClipProperty({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  return <ClipPanel handle={handle} context={context} inOverlay />;
}

function TransitionEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  const track = clip ? clipsOnTrack(doc, clip.trackId) : [];
  const index = clip ? track.findIndex((item) => item.id === clip.id) : -1;
  const previous = index > 0 ? track[index - 1] : undefined;
  const existing = doc.transitions.find((transition) => transition.toClipId === clip?.id);
  return (
    <Stack gap={3}>
      {!clip ? <Notice tone="info" title="Select a clip">A transition goes on the join between a clip and the one before it.</Notice> : !previous ? (
        <Notice tone="warning" title="Nothing precedes this clip">A transition needs a clip on each side of the join.</Notice>
      ) : (
        <>
          <FactGrid columns={3} dense items={[
            { label: "From", value: previous.name },
            { label: "To", value: clip.name },
            { label: "At", value: timecode(clip.start, doc.fps), mono: true },
          ]} />
          <Field label="Kind">
            <Select
              value={existing?.kind ?? "cross-dissolve"}
              onChange={(event) => handle.edit((current) => ({
                ...current,
                transitions: existing
                  ? current.transitions.map((transition) => (transition.id === existing.id ? { ...transition, kind: event.target.value as "cross-dissolve" } : transition))
                  : [...current.transitions, { id: `x-${wallMs().toString(36)}`, fromClipId: previous.id, toClipId: clip.id, kind: event.target.value as "cross-dissolve", duration: 0.8 }],
              }), "Set the transition")}
            >
              <option value="cross-dissolve">Cross dissolve</option>
              <option value="dip-to-black">Dip to black</option>
              <option value="wipe-left">Wipe from the left</option>
            </Select>
          </Field>
          <Field label={`Duration ${existing?.duration.toFixed(2) ?? "0.80"}s`} hint="The compositor mixes the two clips across this time, so scrubbing through the join shows the real mix.">
            <input
              className="vx-range"
              type="range"
              min={0.1}
              max={Math.min(3, clip.duration, previous.duration)}
              step={1 / doc.fps}
              value={existing?.duration ?? 0.8}
              aria-label="Transition duration"
              onChange={(event) => handle.edit((current) => ({
                ...current,
                transitions: existing
                  ? current.transitions.map((transition) => (transition.id === existing.id ? { ...transition, duration: snapFrame(Number(event.target.value), doc.fps) } : transition))
                  : [...current.transitions, { id: `x-${wallMs().toString(36)}`, fromClipId: previous.id, toClipId: clip.id, kind: "cross-dissolve", duration: snapFrame(Number(event.target.value), doc.fps) }],
              }), "Set the transition duration")}
            />
          </Field>
          <ModalActions>
            <OverlayActions
              primary={<Button variant="primary" onClick={close}>Done</Button>}
              end={existing ? <Button variant="outline-danger" onClick={() => { handle.edit((current) => ({ ...current, transitions: current.transitions.filter((transition) => transition.id !== existing.id) }), "Remove the transition"); close(); }}>Remove the transition</Button> : undefined}
            />
          </ModalActions>
        </>
      )}
    </Stack>
  );
}

function ProxyStatus({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <FactGrid columns={3} items={[
        { label: "Sources", value: doc.sources.length, mono: true },
        { label: "Generated on demand", value: doc.sources.filter((source) => source.proxy === "generated").length, mono: true },
        { label: "Offline", value: doc.sources.filter((source) => source.missing).length, mono: true, tone: doc.sources.some((source) => source.missing) ? "danger" : undefined },
      ]} />
      <OverlaySection title="There is nothing to transcode" tone="info">
        Each source's picture is generated at whatever size is asked for, so a smaller proxy would be no faster. Where a real file existed, this is where its transcode would be queued.
      </OverlaySection>
    </Stack>
  );
}

function MediaInspector({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const source = doc.sources.find((item) => item.id === payload?.id) ?? doc.sources[0];
  if (!source) return <Empty title="No sources" />;
  const uses = doc.clips.filter((clip) => clip.sourceId === source.id);
  const patchSource = (change: Partial<MediaSource>, label: string) => handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, ...change } : item)) }), label);
  return (
    <Stack gap={3}>
      {source.kind !== "audio" && (
        <img
          src={frameDataUrl({ ...doc, tracks: [{ id: "preview", name: "preview", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 40 }], clips: [{ id: "preview", trackId: "preview", start: 0, sourceIn: 0, duration: source.duration, sourceId: source.id, name: source.name, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0 }] }, source.duration / 3, 400)}
          alt={`${source.name} frame`}
          style={{ width: "100%", borderRadius: 6 }}
        />
      )}
      <FactGrid columns={3} dense items={[
        { label: "Duration", value: timecode(source.duration, doc.fps), mono: true },
        { label: "Used by", value: `${uses.length} clip${uses.length === 1 ? "" : "s"}`, mono: true },
        { label: "State", value: source.missing ? "offline" : "present", tone: source.missing ? "danger" : undefined },
      ]} />
      <OverlaySection title="Rights" hint="Saved as you change them" tone={source.license === "Unknown" ? "danger" : "neutral"}>
        <Field label="Licence">
          <Select value={source.license} onChange={(event) => patchSource({ license: event.target.value }, "Change the licence")}>
            {SOURCE_LICENCES.map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
        <Field label="Credit">
          <TextInput value={source.credit} onChange={(event) => patchSource({ credit: event.target.value }, "Change the credit")} />
        </Field>
        {source.license === "Unknown" && <p className="vx-mini">Unknown rights block delivery: record where this source came from.</p>}
      </OverlaySection>
    </Stack>
  );
}

/** Identity block for a source: its name, licence and length. */
function SourceSummary({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const doc = handle.doc;
  const source = doc?.sources.find((item) => item.id === payload?.id) ?? doc?.sources[0];
  if (!record || !doc || !source) return null;
  return (
    <OverlaySummary
      eyebrow={source.kind === "audio" ? "Audio source" : "Picture source"}
      title={source.name}
      status={<Pill tone={source.license === "Unknown" ? "danger" : "neutral"}>{source.license}</Pill>}
      meta={[<span className="ds-num" key="d">{timecode(source.duration, doc.fps)}</span>, source.missing ? "offline" : "present", record.title]}
    />
  );
}

/** Identity block for the selected clip: where it sits on the timeline. */
function ClipSummary({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const doc = handle.doc;
  const clip = doc?.clips.find((item) => item.id === ui.selectedClipId);
  if (!record || !doc) return null;
  if (!clip) return <OverlaySummary eyebrow="Clip" title="No clip selected" meta={[record.title]} />;
  const track = doc.tracks.find((item) => item.id === clip.trackId);
  return (
    <OverlaySummary
      eyebrow="Clip"
      title={clip.name}
      status={lockReason(doc, clip) ? <Pill tone="warning">locked</Pill> : undefined}
      meta={[track?.name, <span className="ds-num" key="r">{timecode(clip.start, doc.fps)} → {timecode(clipEnd(clip), doc.fps)}</span>]}
    />
  );
}

/** Identity block for an audio track. */
function TrackSummary({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const doc = handle.doc;
  const track = doc?.tracks.find((item) => item.id === payload?.id) ?? doc?.tracks.find((item) => item.kind === "audio");
  if (!record || !doc || !track) return null;
  return (
    <OverlaySummary
      eyebrow="Audio track"
      title={track.name}
      status={track.muted ? <Pill tone="warning">muted</Pill> : track.solo ? <Pill tone="info">solo</Pill> : undefined}
      meta={[<span className="ds-num" key="g">{(track.gainDb ?? 0).toFixed(1)} dB</span>, `${clipsOnTrack(doc, track.id).length} clips`]}
    />
  );
}

/** Identity block for a caption cue. */
function CueSummary({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const doc = handle.doc;
  const cue = doc?.captions.find((item) => item.id === payload?.id) ?? doc?.captions.find((item) => ui.playhead >= item.start && ui.playhead < item.end);
  if (!record || !doc || !cue) return null;
  return (
    <OverlaySummary
      eyebrow={`Caption cue · ${cue.language}`}
      title={<span className="ds-num">{timecode(cue.start, doc.fps)} → {timecode(cue.end, doc.fps)}</span>}
      status={<Pill tone={cue.reviewed ? "success" : "warning"}>{cue.reviewed ? "checked" : "not checked"}</Pill>}
      meta={[cue.speaker || "no speaker named"]}
    />
  );
}

function RelinkFile({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const missing = handle.doc.sources.filter((source) => source.missing);
  return (
    <Stack gap={3}>
      <p className="ds-prose">There is no file system to search: nothing here can read your disk. Relinking marks the source as present and uses the generated picture, which the clip says on its face.</p>
      {missing.length === 0 ? <Notice tone="success" title="Nothing is offline" /> : missing.map((source) => (
        <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
          <span className="ds-grow ds-truncate">{source.name}</span>
          <Pill tone="danger">offline</Pill>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, missing: false } : item)) }), "Relink the source");
              context.toast("Relinked", `${source.name} is marked present.`);
              close();
            }}
          >
            Relink
          </Button>
        </Row>
      ))}
    </Stack>
  );
}

function LicenceDrawer({ context }: { context: ScreenContext }) {
  return <MediaInspector context={context} />;
}

function MixerProperty({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const track = doc.tracks.find((item) => item.id === payload?.id) ?? doc.tracks.find((item) => item.kind === "audio");
  if (!track) return <Empty title="No audio track" />;
  const patchTrack = (change: Partial<typeof track>, label: string) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, ...change } : item)) }), label);
  return (
    <Stack gap={3}>
      <Field label="Name"><TextInput value={track.name} onChange={(event) => patchTrack({ name: event.target.value }, "Rename the track")} /></Field>
      <Field label={`Gain ${(track.gainDb ?? 0).toFixed(1)} dB`} hint={`A factor of ${dbToGain(track.gainDb ?? 0).toFixed(3)}`}>
        <input className="vx-range" type="range" min={-40} max={12} step={0.5} value={track.gainDb ?? 0} aria-label="Gain" onChange={(event) => patchTrack({ gainDb: Number(event.target.value) }, "Change the gain")} />
      </Field>
      <Field label={`Pan ${(track.pan ?? 0).toFixed(2)}`} hint="Stored on the track. The mix is summed to mono, so pan does not change what you hear.">
        <input className="vx-range" type="range" min={-1} max={1} step={0.05} value={track.pan ?? 0} aria-label="Pan" onChange={(event) => patchTrack({ pan: Number(event.target.value) }, "Change the pan")} />
      </Field>
    </Stack>
  );
}

function LoudnessReview({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const mix = mixAudio(doc, 0, Math.min(doc.duration, 30), 8000);
  const loudness = measureLoudness(mix);
  return (
    <Stack gap={3}>
      <FactGrid columns={4} items={[
        { label: "Approx. loudness", value: `${loudness.approximateLufs} LUFS`, mono: true },
        { label: "Target", value: `${doc.loudnessTarget} LUFS`, mono: true },
        { label: "Sample peak", value: `${loudness.samplePeakDb.toFixed(1)} dBFS`, mono: true },
        { label: "Clipped samples", value: loudness.clippedSamples, mono: true, tone: loudness.clippedSamples > 0 ? "danger" : undefined },
      ]} />
      <MixWaveform doc={doc} seconds={Math.min(doc.duration, 30)} height={100} label="Programme waveform" />
      {loudness.clippedSamples > 0 && <Notice tone="danger" title="The mix clips">Samples reach full scale. Lower a track's gain.</Notice>}
      <p className="vx-mini">Not a compliance meter: RMS <span className="ds-num">{loudness.rms.toFixed(1)} dBFS</span> with a fixed offset, not a gated K-weighted measurement. Useful for comparison; not evidence of compliance.</p>
    </Stack>
  );
}

function VoiceCleanup() {
  return (
    <Stack gap={3}>
      <OverlaySection title="Voice cleanup is not implemented" tone="warning">
        De-noise, de-reverb and voice isolation all need signal processing that is not built here. The mixer's gain and fades are real; nothing else is claimed.
      </OverlaySection>
      <OverlaySection title="Consent comes first anyway" tone="info">
        A voice in a project needs the speaker's consent on the record before it is processed or published. No model is connected that could synthesise or alter a voice.
      </OverlaySection>
    </Stack>
  );
}

function CaptionEditorOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const caption = doc.captions.find((item) => item.id === payload?.id) ?? doc.captions.find((item) => ui.playhead >= item.start && ui.playhead < item.end);
  if (!caption) return <Empty title="No cue at the playhead" />;
  const patch = (change: Partial<typeof caption>, label: string) => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, ...change } : item)) }), label);
  const speed = Math.round(caption.text.length / Math.max(0.1, caption.end - caption.start));
  return (
    <Stack gap={3}>
      <PreviewMonitor doc={doc} time={(caption.start + caption.end) / 2} height={160} captions />
      <Row gap={2} wrap>
        <Field label="In (s)"><TextInput type="number" step={0.1} value={caption.start} onChange={(event) => patch({ start: Number(event.target.value) }, "Change the cue timing")} /></Field>
        <Field label="Out (s)"><TextInput type="number" step={0.1} value={caption.end} onChange={(event) => patch({ end: Number(event.target.value) }, "Change the cue timing")} /></Field>
      </Row>
      <Field label="Text" hint="Editing the text marks the cue as not yet checked by a person."><TextArea rows={3} value={caption.text} onChange={(event) => patch({ text: event.target.value, reviewed: false }, "Edit the cue")} /></Field>
      <FactGrid columns={2} dense items={[
        { label: "Reading speed", value: `${speed} characters a second`, mono: true, tone: speed > 20 ? "warning" : undefined },
        { label: "On screen", value: `${(caption.end - caption.start).toFixed(2)}s`, mono: true },
      ]} />
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={caption.reviewed} onClick={() => patch({ reviewed: true }, "Mark the cue as checked")}>{caption.reviewed ? "Checked" : "Mark as checked"}</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function SpeakerVerification({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const speakers = [...new Set(handle.doc.captions.map((caption) => caption.speaker).filter(Boolean))];
  return (
    <Stack gap={3}>
      <p className="ds-prose">Nothing here recognises a voice. A speaker label is whatever a person wrote on the cue; it is listed so it can be checked.</p>
      {speakers.length === 0 ? <p className="ds-subtle">No cue names a speaker.</p> : (
        <Stack gap={2}>
          {speakers.map((speaker) => (
            <Row key={speaker} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
              <span className="ds-grow">{speaker}</span>
              <Pill><span className="ds-num">{handle.doc!.captions.filter((caption) => caption.speaker === speaker).length}</span> cues</Pill>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function LanguageReview({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const languages = [...new Set(doc.captions.map((caption) => caption.language))];
  if (languages.length === 0) return <Empty title="No caption tracks" />;
  return (
    <Stack gap={3}>
      {languages.map((language) => {
        const cues = doc.captions.filter((caption) => caption.language === language);
        const empty = cues.filter((cue) => !cue.text.trim()).length;
        const checked = cues.filter((cue) => cue.reviewed).length;
        return (
          <OverlaySection key={language} title={`${language} · ${cues.length} cues`} tone={empty > 0 ? "warning" : checked === cues.length ? "success" : "info"}>
            {empty > 0 ? `${empty} cues have no text. They were created with the timings of another track and still need writing.` : `${checked} of ${cues.length} checked by a person. Subtitle text is not word-perfect until it has been.`}
          </OverlaySection>
        );
      })}
    </Stack>
  );
}

function RenderSettings({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const render = useStore(renderUi);
  const support = useMemo(() => recorderSupport(), []);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const preset = { ...(RENDER_PRESETS[render.preset] ?? RENDER_PRESETS[Object.keys(RENDER_PRESETS)[0]]), fps: doc.fps };
  const frames = Math.round(doc.duration * preset.fps);
  const seconds = Math.round(doc.duration);
  return (
    <Stack gap={3}>
      <OverlaySection title="Settings">
        <Field label="Preset">
          <Select value={render.preset} disabled={render.busy} onChange={(event) => renderUi.set((current) => ({ ...current, preset: event.target.value }))}>
            {Object.keys(RENDER_PRESETS).map((key) => <option key={key}>{key}</option>)}
          </Select>
        </Field>
        <FactGrid columns={4} dense items={[
          { label: "Frame", value: `${preset.width} × ${preset.height}`, mono: true },
          { label: "Rate", value: `${preset.fps} fps`, mono: true },
          { label: "Bitrate", value: `${(preset.bitrate / 1_000_000).toFixed(1)} Mb/s`, mono: true },
          { label: "Frames", value: frames, mono: true },
        ]} />
      </OverlaySection>
      <OverlaySection title="What happens when you press Render" tone={support.webm ? "info" : "danger"}>
        {support.webm
          ? <>This machine draws all <span className="ds-num">{frames}</span> frames and records them as WebM in real time, about <span className="ds-num">{seconds}</span> seconds. The file is checked for a non-zero size before it is offered, and it downloads here. Nothing is uploaded.</>
          : <>This browser cannot encode a video file. {support.reason} The contact sheet and the frame sequence are what can be produced.</>}
      </OverlaySection>
      <ModalActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={!support.webm || render.busy} onClick={() => { context.closeOverlay(); void startRender(context, record.title, render.preset); }}>{`Render ${frames} frames to WebM`}</Button>}
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

function Compatibility() {
  const support = recorderSupport();
  const can = (type: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);
  return (
    <Stack gap={3}>
      <KeyValueList items={[
        { label: "WebM / VP9", value: can("video/webm;codecs=vp9") ? "supported" : "not supported", tone: can("video/webm;codecs=vp9") ? "success" : undefined },
        { label: "WebM / VP8", value: can("video/webm;codecs=vp8") ? "supported" : "not supported", tone: can("video/webm;codecs=vp8") ? "success" : undefined },
        { label: "MP4 / H.264", value: "not produced: no encoder is shipped" },
        { label: "ProRes or DNxHD", value: "not produced" },
        { label: "Frame sequence", value: "always available; drawn by the same renderer" },
      ]} />
      {!support.webm && <Notice tone="danger" title="No video encoding is available">{support.reason}</Notice>}
      <OverlaySection title="If a delivery spec asks for more" tone="warning">
        A broadcaster asking for ProRes at a given loudness cannot be served from here. Send a frame sequence plus the WAV mix, encoded elsewhere.
      </OverlaySection>
    </Stack>
  );
}

function DeliveryConfirmation({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const done = handle.doc.renders.filter((job) => job.state === "done");
  return (
    <Stack gap={3}>
      {done.length === 0 ? (
        <Notice tone="warning" title="Nothing has been rendered">No file has been produced for this project, so there is nothing to confirm as delivered.</Notice>
      ) : done.map((job) => (
        <OverlaySection key={job.id} title={<span className="ds-num">{job.artifact}</span>} hint="Checked for a non-zero size before it was offered">
          <FactGrid columns={3} dense items={[
            { label: "Size", value: `${((job.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`, mono: true },
            { label: "Frames", value: job.frames ?? "—", mono: true },
            { label: "Publishing", value: job.delivery ? CAPABILITY_LABELS[job.delivery.state] : "not requested" },
          ]} />
          {job.note && <p className="vx-mini">{job.note}</p>}
        </OverlaySection>
      ))}
      <OverlaySection title="Delivery is not connected" tone="warning">
        There is no destination to send a file to. A render downloads to this machine, and the record keeps what was produced.
      </OverlaySection>
    </Stack>
  );
}

function ReviewMarker({ context }: { context: ScreenContext }) {
  return <ReviewScreen context={context} lens="Comments" />;
}

function VersionComparison({ context }: { context: ScreenContext }) {
  return <VersionCompare context={context} />;
}

function FinalSignoff({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const preset = (context.overlayPayload as { state?: "approved" | "changes" | "pending" } | undefined)?.state;
  const [state, setState] = useState<"approved" | "changes" | "pending">(preset ?? "approved");
  const [note, setNote] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const openNotes = doc.markers.filter((marker) => !marker.resolved).length;
  return (
    <form
      id="video-signoff"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => ({
          ...current,
          reviews: [{ id: `rv-${wallMs().toString(36)}`, at: clockIso(), by: context.actor, state, note, revision: record.revision, digest: cutDigest(current) }, ...current.reviews],
        }), "Record a review decision");
        context.toast("Decision recorded", `Bound to revision ${record.revision} and to the cut digest ${cutDigest(doc)}. Any edit changes the digest.`);
        close();
      }}
    >
      <FactGrid columns={2} dense items={[
        { label: "Binds to revision", value: record.revision, mono: true },
        { label: "Cut digest", value: cutDigest(doc), mono: true, hint: "From every clip's source, position and duration. Change the cut and the approval no longer matches it." },
      ]} />
      {state === "approved" && openNotes > 0 && (
        <Notice tone="warning" title={`${openNotes} review notes are still open`}>
          Approving does not close them. They stay open on the Comments tab and anyone delivering this cut will see them.
        </Notice>
      )}
      <Field label="Decision">
        <Select value={state} onChange={(event) => setState(event.target.value as "approved")}>
          <option value="approved">Approved</option>
          <option value="changes">Changes requested</option>
          <option value="pending">Still reviewing</option>
        </Select>
      </Field>
      <Field label="Note" required><TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required /></Field>
    </form>
  );
}

function editVideoResult(context: ScreenContext, change: (doc: VideoDoc) => VideoDoc, label: string) {
  return editShared<VideoDoc>(context, parseVideo, change, label);
}

async function editVideo(context: ScreenContext, change: (doc: VideoDoc) => VideoDoc, label: string): Promise<void> {
  await editShared<VideoDoc>(context, parseVideo, change, label);
}

function openVideo(context: ScreenContext): VideoDoc | undefined {
  return sharedHandle<VideoDoc>(context.params.id)?.doc ?? undefined;
}

const needsClip = () => (videoUi.get().selectedClipId ? undefined : "Select a clip on the timeline first");
const needsProject = (context: ScreenContext) => (context.params.id ? undefined : "Open a project first");

/** Every clip boundary on the timeline, in order. */
function editPoints(doc: VideoDoc): number[] {
  return [...new Set(doc.clips.flatMap((clip) => [clip.start, clipEnd(clip)]).map((time) => snapFrame(time, doc.fps)))].sort((a, b) => a - b);
}

const TIMELINE_ACTIONS: ActionDef[] = [
  {
    id: "Trim", label: "Trim one frame off the end", placement: "toolbar", shortcut: "Alt+←",
    guard: needsClip,
    run: (context) => editVideo(context, (doc) => trimClip(doc, videoUi.get().selectedClipId!, "end", -1 / doc.fps), "Trim one frame off the end"),
  },
  {
    id: "split", label: "Split at the playhead", placement: "primary",
    guard: needsClip,
    run: async (context) => {
      const result = await editVideoResult(context, (doc) => splitClip(doc, videoUi.get().selectedClipId!, videoUi.get().playhead).doc, "Split at the playhead");
      if (!result) context.toast("Nothing to split", "The playhead is not inside the selected clip, or it is within a frame of an edge.", "blocked");
    },
  },
  {
    id: "ripple", label: "Ripple delete", placement: "overflow", tone: "danger",
    guard: needsClip,
    run: async (context) => {
      const id = videoUi.get().selectedClipId!;
      await editVideo(context, (doc) => rippleDelete(doc, id), "Ripple delete");
      videoUi.set((current) => ({ ...current, selectedClipId: undefined }));
    },
  },
  {
    id: "drag clips", label: "Move the clip to the playhead", placement: "overflow",
    guard: needsClip,
    run: async (context) => {
      const id = videoUi.get().selectedClipId!;
      const result = await editVideoResult(context, (doc) => moveClip(doc, id, videoUi.get().playhead), "Move the clip to the playhead");
      if (!result) context.toast("The clip did not move", "It is locked, or it already starts at the playhead.", "blocked");
      else {
        const moved = result.clips.find((clip) => clip.id === id);
        if (moved && Math.abs(moved.start - snapFrame(videoUi.get().playhead, result.fps)) > 1e-6) {
          context.toast("Moved beside a neighbour", `The playhead would overlap another clip, so it starts at ${timecode(moved.start, result.fps)} instead.`, "info");
        }
      }
    },
  },
  { id: "select tool", label: "Select tool (V)", placement: "overflow", run: () => setVideoTool("select") },
  {
    id: "scrub", label: "Scrub to the next edit", placement: "secondary",
    guard: needsProject,
    run: (context) => {
      const doc = openVideo(context);
      if (!doc) return;
      const playhead = videoUi.get().playhead;
      const next = editPoints(doc).find((time) => time > playhead + 1e-6) ?? 0;
      videoUi.set((current) => ({ ...current, playhead: next, playing: false }));
    },
  },
  {
    id: "undo", label: "Undo", placement: "secondary", shortcut: "⌘Z",
    guard: (context) => (canUndoShared(context) ? undefined : "Nothing to undo yet"),
    run: (context) => { if (!undoShared(context)) context.toast("Nothing to undo", "The editor has no steps to take back.", "blocked"); },
  },
  { id: "transitions", label: "Transitions…", placement: "overflow", run: (context) => context.openOverlay("transition editor") },
];

/* ------------------------- new action overlays ------------------------- */

function TagSource({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const source = handle.doc?.sources.find((item) => item.id === ui.selectedSourceId);
  const [text, setText] = useState((source?.tags ?? []).join(", "));
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  if (!source) return <Notice tone="info" title="Select a source">Pick a source in the media bin with its Select button, then tag it.</Notice>;
  return (
    <form
      id="video-tag-source"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const tags = [...new Set(text.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
        handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, tags } : item)) }), `Tag ${source.name}`);
        void context.mutate.log(`Tagged ${source.name}: ${tags.join(", ") || "no tags"}`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      <FactGrid columns={2} dense items={[{ label: "Source", value: source.name }, { label: "Kind", value: source.kind }]} />
      <Field label="Tags" hint="Separate tags with commas. A tag helps find a source; its rights are recorded on its licence.">
        <TextInput value={text} onChange={(event) => setText(event.target.value)} placeholder="b-roll, showroom, approved" autoFocus />
      </Field>
    </form>
  );
}

function AutomationPoint({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const audio = handle.doc?.tracks.filter((track) => track.kind === "audio") ?? [];
  const [chosenTrack, setTrackId] = useState(ui.selectedTrackId ?? "");
  const trackId = chosenTrack || audio[0]?.id || "";
  const [time, setTime] = useState(String(ui.playhead.toFixed(2)));
  const [gain, setGain] = useState("-6");
  const [error, setError] = useState<string | null>(null);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const track = doc.tracks.find((item) => item.id === trackId);
  return (
    <form
      id="video-automation"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const at = Number(time);
        const db = Number(gain);
        if (!track) { setError("Choose an audio track."); return; }
        if (!Number.isFinite(at) || at < 0 || at > doc.duration) { setError(`The time must be between 0 and ${doc.duration.toFixed(2)} seconds.`); return; }
        if (!Number.isFinite(db) || db < -60 || db > 12) { setError("Gain must be between −60 and +12 dB."); return; }
        const point = { id: `au-${wallMs().toString(36)}`, time: snapFrame(at, doc.fps), gainDb: db };
        handle.edit((current) => ({
          ...current,
          tracks: current.tracks.map((item) => (item.id === track.id
            ? { ...item, automation: [...(item.automation ?? []).filter((existing) => Math.abs(existing.time - point.time) > 1e-6), point].sort((a, b) => a.time - b.time) }
            : item)),
        }), `Automate ${track.name}`);
        void context.mutate.log(`Gain automation on ${track.name}: ${db} dB at ${timecode(point.time, doc.fps)}`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      {error && <Notice tone="danger" title="Not written">{error}</Notice>}
      <Field label="Track">
        <Select value={trackId} onChange={(event) => setTrackId(event.target.value)}>
          {audio.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="At (seconds)"><TextInput type="number" step={1 / doc.fps} value={time} onChange={(event) => setTime(event.target.value)} /></Field>
        <Field label="Gain (dB)"><TextInput type="number" step={0.5} value={gain} onChange={(event) => setGain(event.target.value)} /></Field>
      </Row>
      {track && (track.automation ?? []).length > 0 && (
        <PanelGroup title={`Points on ${track.name}`}>
          <Stack gap={1}>
            {(track.automation ?? []).map((point) => (
              <Row key={point.id} gap={2} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
                <span className="ds-num">{timecode(point.time, doc.fps)}</span>
                <span className="ds-grow ds-num">{point.gainDb.toFixed(1)} dB</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, automation: (item.automation ?? []).filter((existing) => existing.id !== point.id) } : item)) }), "Remove an automation point")}
                >
                  Remove
                </Button>
              </Row>
            ))}
          </Stack>
        </PanelGroup>
      )}
      <Notice tone="info" title="Applied to the samples">Gain between two points is interpolated in decibels and multiplied into the mix, so the meters, the waveform and the WAV export all hear it.</Notice>
    </form>
  );
}

function mixProblems(doc: VideoDoc): string[] {
  const loudness = measureLoudness(mixAudio(doc, 0, doc.duration, 8000));
  const problems: string[] = [];
  if (loudness.clippedSamples > 0) problems.push(`${loudness.clippedSamples} samples are at full scale: the mix clips.`);
  if (loudness.approximateLufs > doc.loudnessTarget + 1) problems.push(`It measures about ${loudness.approximateLufs} LUFS, louder than the ${doc.loudnessTarget} LUFS target.`);
  if (loudness.approximateLufs < doc.loudnessTarget - 1) problems.push(`It measures about ${loudness.approximateLufs} LUFS, quieter than the ${doc.loudnessTarget} LUFS target.`);
  return problems;
}

async function writeMix(context: ScreenContext): Promise<void> {
  const doc = await readShared<VideoDoc>(context, parseVideo);
  const id = context.params.id;
  if (!doc || !id) return;
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  const samples = mixAudio(doc, 0, doc.duration, 22050);
  const name = `${slug(record?.title ?? "mix")}-mix.wav`;
  downloadBlob(name, wavFromSamples(samples, 22050));
  await context.mutate.log(`Exported the mix as ${name}`, { entityId: id, type: "export" });
  context.toast("Mix written", `${name}: ${doc.duration.toFixed(1)}s of 16-bit PCM at 22.05 kHz, encoded in this browser.`);
}

function ExportMixWarning({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const problems = mixProblems(handle.doc);
  return (
    <Stack gap={3}>
      {problems.length === 0 ? <Notice tone="success" title="The mix passes">No clipping, and the loudness is within a unit of the target.</Notice> : (
        <OverlaySection title="The mix fails its checks" tone="danger">
          <ul className="ds-list">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </OverlaySection>
      )}
      <p className="vx-mini">An approximate meter: RMS with a fixed offset, not a gated K-weighted measurement. Fix the level on the Mixer tab, or export with the failures stated.</p>
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<OverlayCancel>Keep mixing</OverlayCancel>}
          primary={<Button variant={problems.length ? "outline-danger" : "primary"} onClick={async () => { await writeMix(context); close(); }}>{problems.length ? "Export the WAV anyway" : "Export the WAV"}</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function CaptionStyleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const current = handle.doc?.captionStyle ?? { position: "bottom" as const, scale: 1, box: true };
  const [position, setPosition] = useState<"bottom" | "top">(current.position);
  const [scale, setScale] = useState(current.scale);
  const [box, setBox] = useState(current.box);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const preview: VideoDoc = { ...handle.doc, captionStyle: { position, scale, box } };
  const cue = handle.doc.captions.find((caption) => caption.language === ui.language);
  return (
    <form
      id="video-caption-style"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((doc) => ({ ...doc, captionStyle: { position, scale, box } }), "Style the captions");
        void context.mutate.log(`Caption style: ${position}, ${Math.round(scale * 100)}%, ${box ? "boxed" : "outlined"}`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      <PreviewMonitor doc={preview} time={cue ? (cue.start + cue.end) / 2 : ui.playhead} height={180} captions />
      <Row gap={3} wrap>
        <Field label="Position">
          <Select value={position} onChange={(event) => setPosition(event.target.value as "bottom")}>
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </Select>
        </Field>
        <Field label={`Size ${Math.round(scale * 100)}%`}>
          <input className="vx-range" type="range" min={0.6} max={1.6} step={0.05} value={scale} aria-label="Caption size" onChange={(event) => setScale(Number(event.target.value))} />
        </Field>
      </Row>
      <Checkbox label="Draw a box behind the text (otherwise an outline)" checked={box} onChange={(event) => setBox(event.target.checked)} />
      <Notice tone="info" title="Burned into the picture only when exported with captions">The SRT and WebVTT files carry text and timings; a player draws them in its own style.</Notice>
    </form>
  );
}

function ApplyPreset({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  if (!clip) return <Notice tone="info" title="Select a clip">A preset replaces one clip's effect stack.</Notice>;
  const presets = [...BUILT_IN_PRESETS, ...(doc.effectPresets ?? [])];
  return (
    <Stack gap={3}>
      {clip.effects.length > 0 && <Notice tone="warning" title={`${clip.name} already has ${clip.effects.length} effects`}>Applying a preset replaces them. Undo takes it back.</Notice>}
      <Stack gap={2}>
        {presets.map((preset, index) => (
          <Row key={`${preset.name}-${index}`} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <div className="ds-grow">
              <strong>{preset.name}</strong>
              <p className="vx-mini ds-num">{preset.effects.map((effect) => `${effect.kind} ${effect.amount}`).join(" · ")}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                handle.edit((current) => patchClip(current, clip.id, { effects: presetEffects(preset) }), `Apply ${preset.name}`);
                void context.mutate.log(`Applied ${preset.name} to ${clip.name}`, { entityId: record.id, type: "update" });
                close();
              }}
            >
              Apply
            </Button>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

function SavePreset({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const [name, setName] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  if (!clip) return <Notice tone="info" title="Select a clip">A preset is saved from one clip's effect stack.</Notice>;
  if (clip.effects.length === 0) return <Notice tone="info" title={`${clip.name} has no effects`}>Grade the clip first; an empty stack is not worth a preset.</Notice>;
  const taken = [...BUILT_IN_PRESETS, ...(doc.effectPresets ?? [])].some((preset) => preset.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      id="video-save-preset"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || taken) return;
        handle.edit((current) => ({
          ...current,
          effectPresets: [...(current.effectPresets ?? []), { id: `pre-${wallMs().toString(36)}`, name: name.trim(), effects: clip.effects.filter((effect) => !effect.bypassed).map((effect) => ({ kind: effect.kind, amount: effect.amount })), by: context.actor, at: clockIso() }],
        }), `Save the preset ${name.trim()}`);
        close();
      }}
    >
      <KeyValueList items={[
        { label: "From", value: clip.name },
        { label: "Effects", value: clip.effects.filter((effect) => !effect.bypassed).map((effect) => `${effect.kind} ${effect.amount}`).join(" · ") || "every effect is bypassed", mono: true },
      ]} />
      <Field label="Preset name" required error={taken ? "A preset already has this name." : undefined} hint="Bypassed effects are left out. The preset is saved with this project and appears on the Presets tab.">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} required autoFocus placeholder="Warm interior" />
      </Field>
    </form>
  );
}

function GradePreview({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  return (
    <Stack gap={3}>
      <PreviewMonitor doc={doc} time={ui.playhead} height={260} bypassEffects={ui.bypassEffects} />
      <TransportBar doc={doc} handle={handle} />
      <p className="vx-mini">
        {clip ? <>Playing {clip.name} with {clip.effects.filter((effect) => !effect.bypassed).length} live effects. </> : null}
        Every frame is rendered with the effect stack as it is now{ui.bypassEffects ? ", but effects are bypassed" : ""}. The export draws the same frames; its encoder is the browser's, so check the file.
      </p>
    </Stack>
  );
}

function RenderPreview({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const [sheet, setSheet] = useState<{ url: string; times: number[]; blob: Blob } | null>(null);
  const doc = handle.doc;
  useEffect(() => {
    if (!doc) return undefined;
    let url = "";
    const made = contactSheet(doc, 4, 3, 240);
    made.canvas.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setSheet({ url, times: made.times, blob });
    }, "image/png");
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc]);
  if (!record || !doc) return <Empty title="Open a project first" />;
  return (
    <Stack gap={3}>
      {sheet ? <img src={sheet.url} alt={`Twelve frames of ${record.title}, from ${timecode(sheet.times[0], doc.fps)} to ${timecode(sheet.times[sheet.times.length - 1], doc.fps)}`} style={{ width: "100%", borderRadius: 6 }} /> : <p className="ds-subtle">Rendering twelve frames…</p>}
      <p className="vx-mini">Twelve frames drawn just now by the renderer the export uses, evenly spaced across the sequence. A preview of the picture, not of the encoder.</p>
      <ModalActions>
        <OverlayActions primary={<Button variant="primary" disabled={!sheet} onClick={() => { if (sheet) downloadBlob(`${slug(record.title)}-preview.png`, sheet.blob); }}>Download the preview (PNG)</Button>} end={<OverlayCancel>Close</OverlayCancel>} />
      </ModalActions>
    </Stack>
  );
}

function PublishRender({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const [destination, setDestination] = useState("Company video channel");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const job = doc.renders.find((item) => item.state === "done");
  const approved = doc.reviews.find((review) => review.state === "approved" && review.digest === cutDigest(doc));
  if (!job) return <Notice tone="warning" title="Nothing has been rendered">Publishing needs a finished, verified render. Export first.</Notice>;
  return (
    <form
      id="video-publish"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const delivery = { state: "queued_local" as const, at: clockIso(), by: context.actor, destination, note: "No video host is connected. The request is recorded here and nothing left this browser." };
        handle.edit((current) => ({ ...current, renders: current.renders.map((item) => (item.id === job.id ? { ...item, delivery } : item)) }), `Queue ${job.artifact} for publishing`);
        void context.mutate.log(`Publishing ${job.artifact} to ${destination} queued locally; no host is connected`, { entityId: record.id, type: "publish", capability: "queued_local" });
        context.toast("Queued locally, not published", `${job.artifact} is recorded as ${CAPABILITY_LABELS.queued_local.toLowerCase()} for ${destination}. No video host is connected, so nothing left this browser.`, "info");
        close();
      }}
    >
      <FactGrid columns={2} dense items={[
        { label: "File", value: job.artifact, mono: true },
        { label: "Size", value: `${((job.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`, mono: true },
        { label: "Approval", value: approved ? `approved by ${approved.by} for this cut` : "no approval covers this cut", tone: approved ? "success" : "warning" },
        { label: "Video host", value: CAPABILITY_LABELS.not_connected, tone: "warning" },
      ]} />
      <Field label="Destination" hint="Publishing records the request against the render as queued locally. Nothing is uploaded; the file stays on this machine until a host is connected."><TextInput value={destination} onChange={(event) => setDestination(event.target.value)} required /></Field>
      {!approved && <Notice tone="warning" title="This cut is not approved">Publishing an unapproved cut is allowed, and it is stated on the request.</Notice>}
    </form>
  );
}

function VersionCompare({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  const [index, setIndex] = useState(0);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const snapshots = record.history.filter((item) => item.body);
  if (snapshots.length === 0) return <Empty title="No saved version to compare with">The record keeps a snapshot each time it is saved over. Edit and save the cut, then compare.</Empty>;
  const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
  const before = parseVideo(snapshot.body);
  const key = (clip: Clip) => `${clip.sourceId}:${clip.start.toFixed(3)}:${clip.duration.toFixed(3)}:${clip.sourceIn.toFixed(3)}`;
  const beforeKeys = new Set(before.clips.map(key));
  const nowKeys = new Set(doc.clips.map(key));
  const added = doc.clips.filter((clip) => !beforeKeys.has(key(clip)));
  const removed = before.clips.filter((clip) => !nowKeys.has(key(clip)));
  return (
    <Stack gap={3}>
      <Field label="Saved version">
        <Select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
          {snapshots.map((item, position) => <option key={position} value={position}>{context.dateTime(item.at)}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Digest then", value: <span className="ds-num">{cutDigest(before)}</span> },
        { label: "Digest now", value: <span className="ds-num">{cutDigest(doc)}</span> },
        { label: "Duration", value: <><span className="ds-num">{timecode(before.duration, before.fps)}</span> → <span className="ds-num">{timecode(doc.duration, doc.fps)}</span></> },
        { label: "Clips", value: <><span className="ds-num">{before.clips.length}</span> → <span className="ds-num">{doc.clips.length}</span></> },
        { label: "Changed or added", value: added.length === 0 ? "none" : added.map((clip) => `${clip.name} at ${timecode(clip.start, doc.fps)}`).join(", ") },
        { label: "Gone or changed", value: removed.length === 0 ? "none" : removed.map((clip) => `${clip.name} at ${timecode(clip.start, before.fps)}`).join(", ") },
      ]} />
      <Grid>
        <Card span={6} pad="tight"><PreviewMonitor doc={before} time={ui.playhead} height={180} /><p className="vx-mini">Saved {context.relative(snapshot.at)}</p></Card>
        <Card span={6} pad="tight"><PreviewMonitor doc={doc} time={ui.playhead} height={180} /><p className="vx-mini">Now</p></Card>
      </Grid>
      <TransportBar doc={doc} handle={handle} />
    </Stack>
  );
}

function formFooter(form: string, label: string) {
  return ({ close: _close }: { close: () => void }) => (
    <OverlayActions primary={<Button variant="primary" type="submit" form={form}>{label}</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} />
  );
}

registerApp({
  code: "VIDEO",
  short: "Video",
  name: "Video Production & Editing",
  purpose: "A frame-accurate timeline with a preview that renders the real composited frame.",
  icon: Film,
  nav: [
    { label: "Projects", items: [{ label: "Video projects", screenId: "ARL-VIDEO-001", icon: Clapperboard }] },
    {
      label: "The open project",
      items: [
        { label: "Timeline", screenId: "ARL-VIDEO-002", icon: Film },
        { label: "Media bin", screenId: "ARL-VIDEO-003", icon: FolderOpen },
        { label: "Audio mixer", screenId: "ARL-VIDEO-004", icon: SlidersHorizontal },
        { label: "Captions", screenId: "ARL-VIDEO-005", icon: Captions },
        { label: "Colour and effects", screenId: "ARL-VIDEO-006", icon: Palette },
        { label: "Export", screenId: "ARL-VIDEO-007", icon: Download },
        { label: "Review", screenId: "ARL-VIDEO-008", icon: MessageSquare },
      ],
    },
  ],
  screens: {
    "ARL-VIDEO-001": {
      id: "ARL-VIDEO-001",
      tabs: (["Recent", "Shared", "Templates", "Archived"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ProjectList context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "Create a sequence", placement: "primary", run: (context) => context.openOverlay("new sequence") },
        {
          id: "import media", label: "Import media", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: (context) => context.openOverlay("Media import", { id: context.selectedId }),
        },
        {
          id: "media bin", label: "Open the media bin", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: (context) => { context.navigate(context.path("/o/:org/video/projects/:id/media", context.selectedId)); },
        },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: async (context) => {
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(context.selectedId!);
            if (!record) return;
            const made = await context.mutate.create({
              collection: "videos", title: `${record.title} copy`, status: "draft",
              summary: record.summary, body: parseVideo(record.body), fields: { ...record.fields, kind: "sequence" },
            }, `Duplicated ${record.title}`);
            context.toast("Duplicated", `${made.title} has its own record and render history.`);
          },
        },
        {
          id: "open", label: "Open", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: (context) => context.navigate(context.path("/o/:org/video/projects/:id", context.selectedId)),
        },
      ],
      overlays: [
        { id: "Media import", kind: "modal", title: "Import media", width: 520, render: ({ close, ...context }) => <MediaImport context={context} close={close} /> },
        { id: "new sequence", kind: "modal", title: "New sequence", width: 520, render: ({ close, ...context }) => <NewSequence context={context} close={close} />, footer: ({ close }) => (<><Button variant="ghost" onClick={close}>Cancel</Button><span className="ds-grow" /><Button variant="primary" type="submit" form="video-new-sequence">Create</Button></>) },
        { id: "project settings", kind: "drawer", title: "Project", width: 420, render: ({ ...context }) => <ProjectSettings context={context} /> },
      ],
    },

    "ARL-VIDEO-002": {
      id: "ARL-VIDEO-002",
      chrome: "full",
      surface: (context) => <TimelineScreen context={context} actions={TIMELINE_ACTIONS} />,
      tabs: (["Edit", "Colour", "Audio", "Captions", "Export"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <TimelineScreen context={context} actions={TIMELINE_ACTIONS} />,
      })),
      actions: TIMELINE_ACTIONS,
      overlays: [
        { id: "Clip property", kind: "drawer", title: "Clip", width: 420, render: ({ ...context }) => <ClipProperty context={context} /> },
        { id: "transition editor", kind: "modal", title: "Transition", width: 520, render: ({ close, ...context }) => <TransitionEditor context={context} close={close} /> },
        { id: "proxy status", kind: "modal", title: "Proxies", width: 480, render: ({ ...context }) => <ProxyStatus context={context} /> },
      ],
    },

    "ARL-VIDEO-003": {
      id: "ARL-VIDEO-003",
      tabs: (["Media", "Folders", "Proxy", "Missing"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <MediaBin context={context} lens={lens} />,
      })),
      actions: [
        { id: "Import", label: "Import a source", placement: "primary", guard: needsProject, run: (context) => context.openOverlay("Media import") },
        { id: "relink", label: "Relink", placement: "secondary", guard: needsProject, run: (context) => context.openOverlay("relink file") },
        {
          id: "tag", label: "Tag the selected source", placement: "overflow",
          guard: () => (videoUi.get().selectedSourceId ? undefined : "Select a source in the bin first"),
          run: (context) => context.openOverlay("tag source"),
        },
        {
          id: "proxy generate", label: "Generate proxies", placement: "overflow",
          guard: needsProject,
          run: async (context) => {
            const doc = await readShared<VideoDoc>(context, parseVideo);
            if (!doc) return;
            const pending = doc.sources.filter((source) => source.proxy !== "generated" && !source.missing);
            const offline = doc.sources.filter((source) => source.missing).length;
            if (pending.length === 0) {
              context.toast("Nothing to generate", `Every present source already has its on-demand proxy.${offline ? ` ${offline} offline sources cannot have one until they are relinked.` : ""}`, "info");
              return;
            }
            await editVideo(context, (current) => ({ ...current, sources: current.sources.map((source) => (source.proxy !== "generated" && !source.missing ? { ...source, proxy: "generated" } : source)) }), `Generate proxies for ${pending.length} sources`);
            context.toast("Proxies generated", `${pending.length} sources now render at preview size on demand; there is no file to transcode.${offline ? ` ${offline} offline sources were skipped.` : ""}`);
          },
        },
        {
          id: "audition", label: "Audition the selected source", placement: "secondary",
          guard: (context) => {
            const doc = openVideo(context);
            const source = doc?.sources.find((item) => item.id === videoUi.get().selectedSourceId);
            if (!source) return "Select a source in the bin first";
            if (source.missing) return "The source is offline";
            if (source.kind !== "audio") return "Only audio sources can be auditioned; a picture source shows in the inspector";
            return undefined;
          },
          run: async (context) => {
            const doc = openVideo(context);
            const source = doc?.sources.find((item) => item.id === videoUi.get().selectedSourceId);
            if (!source) return;
            try {
              const seconds = Math.min(source.duration, 4);
              const player = await playSamples(renderSamples(source, seconds, 22050), 22050);
              window.setTimeout(() => player.stop(), seconds * 1000);
              context.toast("Auditioning", `${seconds.toFixed(1)}s of ${source.name}, played from the generated samples through Web Audio.`, "info");
            } catch (error) {
              context.toast("Cannot play", error instanceof Error ? error.message : "Audio is unavailable.", "failed");
            }
          },
        },
      ],
      overlays: [
        { id: "Media inspector", kind: "drawer", title: "Source", width: 460, render: ({ ...context }) => <MediaInspector context={context} /> },
        { id: "relink file", kind: "modal", title: "Relink", width: 520, render: ({ close, ...context }) => <RelinkFile context={context} close={close} /> },
        { id: "license", kind: "drawer", title: "Rights", width: 440, render: ({ ...context }) => <LicenceDrawer context={context} /> },
        { id: "Media import", kind: "modal", title: "Import a source", width: 520, render: ({ close, ...context }) => <MediaImport context={context} close={close} /> },
        { id: "tag source", kind: "modal", title: "Tag a source", width: 460, render: ({ close, ...context }) => <TagSource context={context} close={close} />, footer: formFooter("video-tag-source", "Save the tags") },
      ],
    },

    "ARL-VIDEO-004": {
      id: "ARL-VIDEO-004",
      tabs: (["Tracks", "Mixer", "Effects", "Loudness"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AudioMixer context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Adjust gain", label: "Adjust gain: every audio track −1 dB", placement: "secondary",
          guard: needsProject,
          run: (context) => editVideo(context, (doc) => ({ ...doc, tracks: doc.tracks.map((track) => (track.kind === "audio" ? { ...track, gainDb: (track.gainDb ?? 0) - 1 } : track)) }), "Lower every audio track by 1 dB"),
        },
        {
          id: "mute", label: "Mute or unmute every audio track", placement: "overflow",
          guard: needsProject,
          run: (context) => editVideo(context, (doc) => {
            const audio = doc.tracks.filter((track) => track.kind === "audio");
            const mute = audio.some((track) => !track.muted);
            return { ...doc, tracks: doc.tracks.map((track) => (track.kind === "audio" ? { ...track, muted: mute } : track)) };
          }, "Mute or unmute the audio tracks"),
        },
        { id: "automate", label: "Automate gain…", placement: "overflow", guard: needsProject, run: (context) => context.openOverlay("automation point") },
        {
          id: "export mix", label: "Export the mix (WAV)", placement: "primary",
          guard: needsProject,
          run: async (context) => {
            const doc = await readShared<VideoDoc>(context, parseVideo);
            if (!doc) return;
            if (mixProblems(doc).length > 0) context.openOverlay("export mix check");
            else await writeMix(context);
          },
        },
      ],
      overlays: [
        { id: "Mixer property", kind: "drawer", title: "Track", width: 420, render: ({ ...context }) => <MixerProperty context={context} /> },
        { id: "loudness review", kind: "modal", title: "Loudness", width: 560, render: ({ ...context }) => <LoudnessReview context={context} /> },
        { id: "voice cleanup", kind: "modal", title: "Voice cleanup", width: 520, render: () => <VoiceCleanup /> },
        { id: "automation point", kind: "modal", title: "Gain automation", width: 520, render: ({ close, ...context }) => <AutomationPoint context={context} close={close} />, footer: formFooter("video-automation", "Write the point") },
        { id: "export mix check", kind: "modal", title: "Before the mix is exported", width: 520, render: ({ close, ...context }) => <ExportMixWarning context={context} close={close} /> },
      ],
    },

    "ARL-VIDEO-005": {
      id: "ARL-VIDEO-005",
      tabs: (["Transcript", "Captions", "Languages", "Review"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CaptionScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Correct", label: "Correct the cue at the playhead", placement: "primary",
          guard: (context) => {
            const doc = openVideo(context);
            if (!doc) return "Open a project first";
            return captionAt(doc, videoUi.get().playhead, videoUi.get().language) ? undefined : "No cue at the playhead in this language";
          },
          run: (context) => {
            const doc = openVideo(context);
            const cue = doc ? captionAt(doc, videoUi.get().playhead, videoUi.get().language) : undefined;
            if (cue) context.openOverlay("Caption editor", { id: cue.id });
          },
        },
        {
          id: "add cue", label: "Add a cue at the playhead", placement: "secondary",
          guard: needsProject,
          run: (context) => editVideo(context, (doc) => ({
            ...doc,
            captions: [...doc.captions, { id: `cap-${wallMs().toString(36)}`, start: videoUi.get().playhead, end: Math.min(doc.duration, videoUi.get().playhead + 2.5), text: "", reviewed: false, language: videoUi.get().language }].sort((a, b) => a.start - b.start),
          }), "Add a caption cue"),
        },
        {
          id: "split cue", label: "Split the cue at the playhead", placement: "secondary",
          guard: (context) => {
            const doc = openVideo(context);
            return doc && captionAt(doc, videoUi.get().playhead, videoUi.get().language) ? undefined : "No cue at the playhead";
          },
          run: (context) => editVideo(context, (doc) => {
            const caption = captionAt(doc, videoUi.get().playhead, videoUi.get().language);
            return caption ? splitCaption(doc, caption.id, videoUi.get().playhead) : doc;
          }, "Split a caption cue"),
        },
        {
          id: "time", label: "Time: end the cue at the playhead", placement: "secondary",
          guard: (context) => {
            const doc = openVideo(context);
            if (!doc) return "Open a project first";
            const playhead = videoUi.get().playhead;
            return doc.captions.some((cue) => cue.language === videoUi.get().language && cue.start < playhead) ? undefined : "No cue starts before the playhead";
          },
          run: async (context) => {
            let note = "";
            await editVideo(context, (doc) => {
              const playhead = snapFrame(videoUi.get().playhead, doc.fps);
              const cues = doc.captions.filter((cue) => cue.language === videoUi.get().language).sort((a, b) => a.start - b.start);
              const cue = [...cues].reverse().find((item) => item.start < playhead);
              if (!cue) return doc;
              const next = cues.find((item) => item.start > cue.start);
              const end = next && next.start < playhead ? next.start : playhead;
              if (end !== playhead) note = `It stops at ${timecode(end, doc.fps)}, where the next cue begins, rather than overlapping it.`;
              if (Math.abs(end - cue.end) < 1e-6) return doc;
              return { ...doc, captions: doc.captions.map((item) => (item.id === cue.id ? { ...item, end, reviewed: false } : item)) };
            }, "Retime a cue to the playhead");
            if (note) context.toast("Retimed without an overlap", note, "info");
          },
        },
        { id: "style", label: "Style the captions…", placement: "overflow", guard: needsProject, run: (context) => context.openOverlay("caption style") },
        {
          id: "export SRT", label: "Export SRT", placement: "overflow",
          guard: needsProject,
          run: async (context) => {
            const id = context.params.id;
            const doc = await readShared<VideoDoc>(context, parseVideo);
            if (!doc || !id) return;
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(id);
            const cues = doc.captions.filter((caption) => caption.language === videoUi.get().language);
            downloadText(`${slug(record?.title ?? "captions")}.srt`, captionsToSrt(doc.captions, videoUi.get().language), "application/x-subrip");
            const drafts = cues.filter((caption) => !caption.reviewed).length;
            context.toast("SRT written", `${cues.length} cues with millisecond timings.${drafts ? ` ${drafts} have not been checked by a person.` : ""}`, drafts ? "info" : "ok");
          },
        },
      ],
      overlays: [
        { id: "Caption editor", kind: "drawer", title: "Cue", width: 460, render: ({ ...context }) => <CaptionEditorOverlay context={context} /> },
        { id: "speaker verification", kind: "modal", title: "Speakers", width: 520, render: ({ ...context }) => <SpeakerVerification context={context} /> },
        { id: "language review", kind: "modal", title: "Languages", width: 520, render: ({ ...context }) => <LanguageReview context={context} /> },
        { id: "caption style", kind: "modal", title: "Caption style", width: 560, render: ({ close, ...context }) => <CaptionStyleEditor context={context} close={close} />, footer: formFooter("video-caption-style", "Apply the style") },
      ],
    },

    "ARL-VIDEO-006": {
      id: "ARL-VIDEO-006",
      tabs: (["Colour", "Effects", "Presets", "Compare"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EffectsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Apply", label: "Apply a preset…", placement: "primary", guard: needsClip, run: (context) => context.openOverlay("apply preset") },
        {
          id: "reorder", label: "Reorder: reverse the effect stack", placement: "overflow",
          guard: needsClip,
          run: (context) => editVideo(context, (doc) => {
            const clip = doc.clips.find((item) => item.id === videoUi.get().selectedClipId);
            if (!clip || clip.effects.length < 2) return doc;
            return patchClip(doc, clip.id, { effects: [...clip.effects].reverse() });
          }, "Reverse the effect order"),
        },
        {
          id: "preview", label: "Preview the grade", placement: "secondary",
          guard: needsClip,
          run: (context) => {
            const doc = openVideo(context);
            const clip = doc?.clips.find((item) => item.id === videoUi.get().selectedClipId);
            if (clip && doc) videoUi.set((current) => ({ ...current, playhead: snapFrame(clip.start, doc.fps), playing: true, rate: 1 }));
            context.openOverlay("grade preview");
          },
        },
        { id: "compare", label: "Compare with and without", placement: "overflow", run: (context) => context.setTab("Compare") },
        { id: "bypass", label: "Bypass every effect", placement: "secondary", run: () => videoUi.set((current) => ({ ...current, bypassEffects: !current.bypassEffects })) },
        {
          id: "reset", label: "Reset the grade", placement: "overflow", tone: "danger",
          guard: needsClip,
          run: (context) => editVideo(context, (doc) => {
            const clip = doc.clips.find((item) => item.id === videoUi.get().selectedClipId);
            return clip && clip.effects.length > 0 ? patchClip(doc, clip.id, { effects: [] }) : doc;
          }, "Reset the grade"),
        },
        { id: "save preset", label: "Save the grade as a preset…", placement: "overflow", guard: needsClip, run: (context) => context.openOverlay("preset save") },
      ],
      overlays: [
        { id: "Effect inspector", kind: "drawer", title: "Effects", width: 440, render: ({ ...context }) => <EffectInspectorOverlay context={context} /> },
        { id: "scope display", kind: "modal", title: "Scopes", width: 560, render: ({ ...context }) => <ScopeOverlay context={context} /> },
        { id: "preset save", kind: "modal", title: "Save a preset", width: 480, render: ({ close, ...context }) => <SavePreset context={context} close={close} />, footer: formFooter("video-save-preset", "Save the preset") },
        { id: "apply preset", kind: "modal", title: "Apply a preset", width: 520, render: ({ close, ...context }) => <ApplyPreset context={context} close={close} /> },
        { id: "grade preview", kind: "modal", title: "Preview the grade", width: 620, render: ({ ...context }) => <GradePreview context={context} /> },
      ],
    },

    "ARL-VIDEO-007": {
      id: "ARL-VIDEO-007",
      tabs: (["Export", "Queue", "History", "Failures"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExportScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Render preview", label: "Render a preview", placement: "secondary", guard: needsProject, run: (context) => context.openOverlay("render preview") },
        {
          id: "export", label: "Export to WebM", placement: "primary",
          guard: (context) => {
            if (!context.params.id) return "Open a project first";
            const support = recorderSupport();
            if (!support.webm) return support.reason;
            return renderUi.get().busy ? "A render is already running" : undefined;
          },
          /* Rendering takes the machine for as long as the film runs, so the command asks first and says what it will do. */
          run: (context) => { context.setTab("Export"); context.openOverlay("Render settings"); },
        },
        },
        {
          id: "cancel", label: "Cancel the render", placement: "overflow", tone: "danger",
          guard: () => (renderUi.get().busy ? undefined : "Nothing is rendering"),
          run: (context) => cancelRender(context),
        },
        {
          id: "download", label: "Download the last render", placement: "overflow",
          guard: (context) => {
            const doc = openVideo(context);
            return doc && latestHeld(doc) ? undefined : "No render from this session is held; render again to download";
          },
          run: (context) => {
            const doc = openVideo(context);
            const job = doc ? latestHeld(doc) : undefined;
            const file = job ? heldFile(job.id) : undefined;
            if (!file) return;
            downloadBlob(file.name, file.blob);
            context.toast("Downloaded again", `${file.name}, ${(file.blob.size / 1024 / 1024).toFixed(2)} MB, the same bytes the render produced.`);
          },
        },
        {
          id: "publish", label: "Publish…", placement: "secondary",
          guard: (context) => {
            const doc = openVideo(context);
            return doc?.renders.some((job) => job.state === "done") ? undefined : "Render a file first";
          },
          run: (context) => context.openOverlay("publish render"),
        },
        { id: "compatibility", label: "What this browser can encode", placement: "overflow", run: (context) => context.openOverlay("compatibility") },
      ],
      overlays: [
        { id: "Render settings", kind: "modal", title: "Render", width: 760, render: ({ ...context }) => <RenderSettings context={context} /> },
        { id: "compatibility", kind: "modal", title: "What this browser can encode", width: 560, render: () => <Compatibility /> },
        { id: "delivery confirmation", kind: "drawer", title: "Delivery", width: 460, render: ({ ...context }) => <DeliveryConfirmation context={context} /> },
        { id: "render preview", kind: "modal", title: "Render preview", width: 760, render: ({ ...context }) => <RenderPreview context={context} /> },
        { id: "publish render", kind: "modal", title: "Publish a render", width: 520, render: ({ close, ...context }) => <PublishRender context={context} close={close} />, footer: formFooter("video-publish", "Queue for publishing") },
      ],
    },

    "ARL-VIDEO-008": {
      id: "ARL-VIDEO-008",
      tabs: (["Comments", "Versions", "Approval", "Delivery"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ReviewScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Comment timestamp", label: "Comment at the playhead", placement: "primary", guard: needsProject, run: (context) => context.openOverlay("Review marker") },
        { id: "compare", label: "Compare versions", placement: "secondary", guard: needsProject, run: (context) => context.openOverlay("version comparison") },
        { id: "approve", label: "Approve this cut", placement: "secondary", guard: needsProject, run: (context) => context.openOverlay("final signoff", { state: "approved" }) },
        {
          id: "assign edit", label: "Assign every open note", placement: "overflow",
          guard: needsProject,
          run: async (context) => {
            const id = context.params.id;
            const doc = await readShared<VideoDoc>(context, parseVideo);
            if (!id || !doc) return;
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(id);
            if (!record) return;
            const open = doc.markers.filter((marker) => !marker.resolved && !marker.taskId);
            if (open.length === 0) { context.toast("Nothing to assign", "Every open note already has a task, or none is open.", "info"); return; }
            const made: Record<string, string> = {};
            for (const marker of open) {
              const task = await context.mutate.create({
                collection: "tasks", title: `Edit note at ${timecode(marker.time, doc.fps)}: ${marker.text.slice(0, 50)}`,
                status: "todo", summary: `From the review of ${record.title}.`, parentId: record.id,
                fields: { assignee: context.actor, timecode: timecode(marker.time, doc.fps), source: "video review" },
              }, "Edit task created from a review note");
              made[marker.id] = task.id;
            }
            await editVideo(context, (current) => ({ ...current, markers: current.markers.map((marker) => (made[marker.id] ? { ...marker, taskId: made[marker.id] } : marker)) }), "Link the notes to their tasks");
            context.toast("Assigned", `${open.length} tasks created in Projects for ${context.actor}, each with its timecode.`);
          },
        },
      ],
      overlays: [
        { id: "Review marker", kind: "modal", title: "Timecoded note", width: 720, render: ({ ...context }) => <ReviewMarker context={context} /> },
        { id: "version comparison", kind: "modal", title: "Compare versions", width: 820, render: ({ ...context }) => <VersionComparison context={context} /> },
        { id: "final signoff", kind: "modal", title: "Record a decision", width: 560, render: ({ close, ...context }) => <FinalSignoff context={context} close={close} />, footer: ({ close }) => (<><Button variant="ghost" onClick={close}>Cancel</Button><span className="ds-grow" /><Button variant="primary" type="submit" form="video-signoff">Record</Button></>) },
      ],
    },
  },
});

function ProjectSettings({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  if (!record) return <Empty title="Select a project first" />;
  const doc = parseVideo(record.body);
  const unknown = doc.sources.filter((source) => source.license === "Unknown").length;
  return (
    <Stack gap={3}>
      <FactGrid columns={2} items={[
        { label: "Frame", value: `${doc.width} × ${doc.height}`, mono: true },
        { label: "Rate", value: `${doc.fps} fps`, mono: true },
        { label: "Duration", value: timecode(doc.duration, doc.fps), mono: true },
        { label: "Clips · sources", value: `${doc.clips.length} · ${doc.sources.length}`, mono: true },
        { label: "Rights unknown", value: unknown, mono: true, tone: unknown ? "danger" : undefined },
        { label: "Revision", value: record.revision, mono: true },
      ]} />
      <DrawerActions>
        <OverlayActions primary={<Button variant="primary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id", record.id))}>Open the timeline</Button>} end={<OverlayCancel>Close</OverlayCancel>} />
      </DrawerActions>
    </Stack>
  );
}

function EffectInspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  return <ColourPanel handle={handle} context={context} />;
}

function ScopeOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  const scopes = frameScopes(doc, ui.playhead);
  return (
    <Stack gap={3}>
      <PreviewMonitor doc={doc} time={ui.playhead} height={200} />
      <Scopes scopes={scopes} />
      <p className="vx-mini">Counted from the frame at <span className="ds-num">{timecode(ui.playhead, doc.fps)}</span>, which the monitor above just drew.</p>
    </Stack>
  );
}
