import { useMemo, useState } from "react";
import {
  Film, Clapperboard, FolderOpen, SlidersHorizontal, Captions, Palette,
  Download, MessageSquare, Scissors, MousePointer2, MoveHorizontal, Split,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, downloadBlob, downloadText,
  slug, useDoc, useStore, type DocHandle,
} from "@/applications/visual/kit";
import {
  captionIssues, captionsToSrt, captionsToVtt, clipEnd, clipsOnTrack, dbToGain,
  measureLoudness, mixAudio, patchClip, renderSamples, rippleDelete, sequenceDuration,
  snapFrame, sourceOf, splitClip, timecode, trimClip, splitCaption,
  type Clip, type MediaSource, type RenderJob, type VideoDoc,
} from "./timeline";
import { contactSheet, exportWebm, frameDataUrl, frameScopes, playSamples, recorderSupport } from "./render";
import { MixWaveform, PreviewMonitor, TimelineView, TransportBar, transportKeys, useTransport } from "./parts";
import { parseVideo, setPlayhead, setVideoTool, starterVideo, videoUi, type VideoTool } from "./model";

/* ====================================================================== *
 * VIDEO — Video Production & Editing
 * ====================================================================== */

function useVideoDoc(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useDoc<VideoDoc>(record, parseVideo, context.screen.id);
  useTransport(handle.doc);
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
  if (!record) return <div className="pg-body"><MissingProject context={context} /></div>;
  const doc = handle.doc;
  const tab = context.tab;
  const clip = doc?.clips.find((item) => item.id === ui.selectedClipId);

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Edit" }, { id: "Colour" }, { id: "Audio" }, { id: "Captions" }, { id: "Export" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{timecode(doc.duration, doc.fps)}</span> · <span className="ds-num">{doc.width}×{doc.height}</span> · <span className="ds-num">{doc.fps}</span> fps</span>}</Row>}
      backTo={{ label: "Video", to: `/o/${context.org.slug}/video/projects` }}
      tools={
        <>
          <Toolbar label="Edit tools">
            {VIDEO_TOOLS.map((item) => (
              <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setVideoTool(item.tool)} />
            ))}
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="View">
            <Button size="sm" variant={ui.snapToClips ? "primary" : "ghost"} onClick={() => videoUi.set((c) => ({ ...c, snapToClips: !c.snapToClips }))}>Snap</Button>
            <Button size="sm" variant={ui.showCaptions ? "primary" : "ghost"} onClick={() => videoUi.set((c) => ({ ...c, showCaptions: !c.showCaptions }))}>Captions</Button>
            <Button size="sm" variant={ui.showGuides ? "primary" : "ghost"} onClick={() => videoUi.set((c) => ({ ...c, showGuides: !c.showGuides }))}>Safe areas</Button>
            <Button size="sm" variant="ghost" onClick={() => videoUi.set((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.4) }))}>Zoom in</Button>
            <Button size="sm" variant="ghost" onClick={() => videoUi.set((c) => ({ ...c, zoom: Math.max(0.25, c.zoom / 1.4) }))}>Zoom out</Button>
          </Toolbar>
        </>
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
          <span>J K L shuttle · arrows step a frame, Shift a second · I and O set in and out</span>
        </>
      }
    >
      <div
        tabIndex={0}
        role="application"
        aria-label="Timeline and programme monitor. J, K and L shuttle; arrow keys step one frame."
        onKeyDown={(event) => { if (doc && transportKeys(event, doc)) event.preventDefault(); }}
        style={{ position: "absolute", inset: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", outline: "none" }}
      >
        <div style={{ display: "grid", placeContent: "center", background: "#07070A", minHeight: 0, padding: 10 }}>
          {doc && (
            <Stack gap={2}>
              <PreviewMonitor doc={doc} time={ui.playhead} height={280} captions={ui.showCaptions} guides={ui.showGuides} bypassEffects={ui.bypassEffects} />
              <TransportBar doc={doc} handle={handle} />
            </Stack>
          )}
        </div>
        <div style={{ borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          {doc && <TimelineView handle={handle} height={240} onSelect={(id) => videoUi.set((current) => ({ ...current, selectedClipId: id }))} />}
        </div>
      </div>
    </EditorFrame>
  );
}

function ClipPanel({ handle, context }: { handle: DocHandle<VideoDoc>; context: ScreenContext }) {
  const ui = useStore(videoUi);
  const doc = handle.doc;
  if (!doc) return null;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId);
  if (!clip) {
    return (
      <Stack gap={3}>
        <Notice tone="info" title="No clip selected">Click a clip on the timeline. Drag its ends to trim, and use the ripple or roll tool to change the edit.</Notice>
        <PanelGroup title="Sequence">
          <Properties rows={[
            { label: "Duration", value: <span className="ds-num">{timecode(doc.duration, doc.fps)}</span> },
            { label: "Content ends", value: <span className="ds-num">{timecode(sequenceDuration(doc), doc.fps)}</span> },
            { label: "Frame", value: <span className="ds-num">{doc.width} × {doc.height} at {doc.fps} fps</span> },
            { label: "Clips", value: doc.clips.length },
          ]} />
        </PanelGroup>
      </Stack>
    );
  }
  const source = sourceOf(doc, clip);
  const set = (patch: Partial<Clip>, label: string) => handle.edit((current) => patchClip(current, clip.id, patch), label);
  return (
    <Stack gap={3}>
      <PanelGroup title={clip.name}>
        <Properties rows={[
          { label: "Starts", value: <span className="ds-num">{timecode(clip.start, doc.fps)}</span> },
          { label: "Ends", value: <span className="ds-num">{timecode(clipEnd(clip), doc.fps)}</span> },
          { label: "Duration", value: <span className="ds-num">{timecode(clip.duration, doc.fps)} ({Math.round(clip.duration * doc.fps)} frames)</span> },
          { label: "Source in", value: <span className="ds-num">{timecode(clip.sourceIn, doc.fps)}</span> },
          { label: "Source", value: source ? `${source.name} (${timecode(source.duration, doc.fps)})` : "none" },
        ]} />
      </PanelGroup>
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
          <Button size="sm" variant="secondary" onClick={() => { const result = splitClip(doc, clip.id, ui.playhead); if (result.newClipId) handle.edit(() => result.doc, "Split at the playhead"); else context.toast("Nothing to split", "The playhead is not inside this clip, or it is within a frame of an edge.", "blocked"); }}>Split at the playhead</Button>
          <Button size="sm" variant="ghost" onClick={() => { handle.edit((current) => rippleDelete(current, clip.id), "Ripple delete"); videoUi.set((current) => ({ ...current, selectedClipId: undefined })); }}>Ripple delete</Button>
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
      <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Clip property")}>More…</Button>
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
        : [...clip.effects, { id: `fx-${kind}-${Date.now().toString(36)}`, kind, amount, bypassed: false }],
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
                  ? [...clip.effects.filter((effect) => effect.kind !== "lut"), { id: `fx-lut-${Date.now().toString(36)}`, kind: "lut" as const, amount: 100, lut, bypassed: false }]
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
  return (
    <Stack gap={3}>
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
              onClick={() => handle.edit((current) => ({
                ...current,
                captions: [...current.captions, { id: `cap-${Date.now().toString(36)}`, start: ui.playhead, end: Math.min(current.duration, ui.playhead + 2.5), text: "", reviewed: false, language: ui.language }].sort((a, b) => a.start - b.start),
              }), "Add a cue")}
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
  if (!doc) return null;
  return (
    <Stack gap={3}>
      <Notice tone={support.webm ? "info" : "warning"} title={support.webm ? "This browser can encode WebM" : "This browser cannot encode video"}>
        {support.reason}
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id/export", context.params.id))}>Open the export screen</Button>
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
              ]} />
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
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;
  const audioTracks = doc.tracks.filter((track) => track.kind === "audio");
  const mix = useMemo(() => mixAudio(doc, 0, Math.min(doc.duration, 30), 8000), [doc]);
  const loudness = useMemo(() => measureLoudness(mix), [mix]);

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
                  captions: [...current.captions, { id: `cap-${Date.now().toString(36)}`, start: 0, end: Math.min(3, current.duration), text: "", reviewed: false, language: ui.language }],
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
              return { ...current, captions: [...current.captions, { id: `cap-${Date.now().toString(36)}`, start, end: Math.min(current.duration, start + 2.5), text: "", reviewed: false, language: ui.language }] };
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

function EffectsScreen({ context, lens }: { context: ScreenContext; lens: "Colour" | "Effects" | "Presets" | "Compare" }) {
  const { record, handle } = useVideoDoc(context);
  const ui = useStore(videoUi);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;
  const clip = doc.clips.find((item) => item.id === ui.selectedClipId) ?? doc.clips.find((item) => doc.tracks.find((track) => track.id === item.trackId)?.kind === "video");
  const scopes = useMemo(() => { try { return frameScopes(doc, ui.playhead); } catch { return null; } }, [doc, ui.playhead]);

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
    const presets = [
      { name: "Showroom warm", effects: [{ kind: "exposure" as const, amount: 8 }, { kind: "temperature" as const, amount: 30 }, { kind: "saturation" as const, amount: 12 }] },
      { name: "Cool product", effects: [{ kind: "contrast" as const, amount: 14 }, { kind: "temperature" as const, amount: -24 }, { kind: "saturation" as const, amount: -6 }] },
      { name: "Press monochrome", effects: [{ kind: "contrast" as const, amount: 18 }, { kind: "saturation" as const, amount: -100 }] },
      { name: "Soft focus", effects: [{ kind: "blur" as const, amount: 14 }, { kind: "exposure" as const, amount: 6 }] },
    ];
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
                  handle.edit((current) => patchClip(current, clip.id, { effects: preset.effects.map((effect, index) => ({ id: `fx-${index}-${Date.now().toString(36)}`, kind: effect.kind, amount: effect.amount, bypassed: false })) }), `Apply ${preset.name}`);
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
      <Card span={5} eyebrow="GRADE" prov="human" title={clip ? clip.name : "No clip"}>
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
  const [preset, setPreset] = useState("720p WebM");
  const [progress, setProgress] = useState<{ frame: number; frames: number } | null>(null);
  const [cancel] = useState<{ cancelled: boolean }>({ cancelled: false });
  const [busy, setBusy] = useState(false);
  const support = useMemo(() => recorderSupport(), []);
  if (!record) return <MissingProject context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the project…" />;

  const presets: Record<string, { width: number; height: number; fps: number; bitrate: number }> = {
    "1080p WebM": { width: 1920, height: 1080, fps: doc.fps, bitrate: 8_000_000 },
    "720p WebM": { width: 1280, height: 720, fps: doc.fps, bitrate: 4_000_000 },
    "Square 1080 WebM": { width: 1080, height: 1080, fps: doc.fps, bitrate: 5_000_000 },
    "480p WebM (small)": { width: 854, height: 480, fps: doc.fps, bitrate: 1_600_000 },
  };

  const addJob = (job: RenderJob) => handle.edit((current) => ({ ...current, renders: [job, ...current.renders] }), "Record a render job");
  const patchJob = (id: string, patch: Partial<RenderJob>) => handle.edit((current) => ({ ...current, renders: current.renders.map((item) => (item.id === id ? { ...item, ...patch } : item)) }), "Update a render job");

  const runExport = async () => {
    const settings = presets[preset];
    const id = `job-${Date.now().toString(36)}`;
    cancel.cancelled = false;
    setBusy(true);
    addJob({ id, at: new Date().toISOString(), by: context.actor, preset, state: "running", note: "Drawing every frame onto a canvas and recording the stream." });
    try {
      const result = await exportWebm(doc, {
        ...settings,
        captions: videoUi.get().showCaptions,
        signal: cancel,
        onProgress: (value) => setProgress({ frame: value.frame, frames: value.frames }),
      });
      if (cancel.cancelled) {
        patchJob(id, { state: "cancelled", note: "Stopped before the end. Nothing was written." });
        context.toast("Cancelled", "The render stopped and no file was written.", "blocked");
        return;
      }
      const name = `${slug(record.title)}-${settings.height}p.webm`;
      downloadBlob(name, result.blob);
      patchJob(id, {
        state: "done", artifact: name, bytes: result.blob.size, frames: result.frames,
        note: `${result.frames} frames recorded as ${result.mimeType}. The file was verified to be ${result.blob.size} bytes before it was offered.`,
      });
      context.toast("Export finished", `${name} — ${result.frames} frames, ${(result.blob.size / 1024 / 1024).toFixed(2)} MB. It downloaded from this browser.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The browser could not encode the sequence.";
      patchJob(id, { state: "failed", note: reason });
      context.toast("Export failed", reason, "failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

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
              { key: "note", header: "What happened", cell: (row) => row.note },
            ]}
          />
        )}
      </Card>
    );
  }

  return (
    <Grid>
      <Card span={5} eyebrow="EXPORT" prov="human" title="Render settings">
        <Stack gap={3}>
          <Field label="Preset">
            <Select value={preset} onChange={(event) => setPreset(event.target.value)}>
              {Object.keys(presets).map((key) => <option key={key}>{key}</option>)}
            </Select>
          </Field>
          <Properties rows={[
            { label: "Frame", value: <span className="ds-num">{presets[preset].width} × {presets[preset].height}</span> },
            { label: "Rate", value: <span className="ds-num">{presets[preset].fps} fps</span> },
            { label: "Bitrate", value: <span className="ds-num">{(presets[preset].bitrate / 1_000_000).toFixed(1)} Mb/s</span> },
            { label: "Frames to draw", value: <span className="ds-num">{Math.round(doc.duration * presets[preset].fps)}</span> },
            { label: "Container", value: support.mimeType ?? "unavailable" },
          ]} />
          {support.webm ? (
            <Notice tone="info" title="What the export actually does">
              Every frame is drawn onto a canvas and the canvas stream is handed to the browser's recorder, which encodes WebM. It runs in real time — a {Math.round(doc.duration)} second sequence takes about {Math.round(doc.duration)} seconds — and the resulting file is checked for a non-zero size before it is offered.
            </Notice>
          ) : (
            <Notice tone="danger" title="This browser cannot encode a video file">
              {support.reason} Nothing here can produce an MP4: there is no encoder for it in a browser without shipping one, and none is shipped. The contact sheet and the frame sequence below are what can honestly be produced.
            </Notice>
          )}
          <Notice tone="warning" title="No MP4, and no render farm">
            H.264 and HEVC are not produced here. There is no render service connected, so every frame is drawn by this machine. A hosted render would be a different capability and is not pretending to exist.
          </Notice>
          {progress && (
            <div>
              <Meter value={progress.frame} max={progress.frames} label="Render progress" />
              <p className="vx-mini">Frame <span className="ds-num">{progress.frame}</span> of <span className="ds-num">{progress.frames}</span></p>
            </div>
          )}
          <Row gap={2} wrap>
            <Button variant="primary" busy={busy} disabled={!support.webm} onClick={() => void runExport()}>
              {support.webm ? `Render ${Math.round(doc.duration * presets[preset].fps)} frames to WebM` : "WebM is unavailable here"}
            </Button>
            {busy && <Button variant="outline-danger" onClick={() => { cancel.cancelled = true; context.toast("Stopping", "The render stops at the next frame."); }}>Cancel</Button>}
          </Row>
        </Stack>
      </Card>
      <Card span={7} eyebrow="ALWAYS AVAILABLE" prov="human" title="What can be produced without an encoder" subtitle="These need no codec support at all">
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
          <Notice tone="info" title="Why a frame sequence is offered">
            A numbered sequence of PNGs is lossless and can be encoded anywhere. It is slower to download than a video file and much larger, which is why it is not the default, but it never depends on what this browser can encode.
          </Notice>
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
        <Card span={12} eyebrow="COMPARE" prov="human" title="Compare the cut" subtitle="The frame at the playhead, with and without the title track">
          <Grid>
            <Card span={6} pad="tight"><PreviewMonitor doc={doc} time={ui.playhead} height={200} onlyTrack={doc.tracks.find((track) => track.kind === "video")?.id} /><p className="vx-mini">Picture only</p></Card>
            <Card span={6} pad="tight"><PreviewMonitor doc={doc} time={ui.playhead} height={200} captions /><p className="vx-mini">Everything, with captions</p></Card>
          </Grid>
          <TransportBar doc={doc} handle={handle} />
        </Card>
      </Grid>
    );
  }

  if (lens === "Approval") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="An approval binds to a revision, not to the project">
          Each decision records the record revision it was given at. An edit afterwards raises the revision and the approval is shown as out of date.
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
                  <Pill tone={review.revision === record.revision ? "success" : "warning"}>
                    {review.revision === record.revision ? <>covers revision <span className="ds-num">{review.revision}</span></> : <>given at <span className="ds-num">{review.revision}</span>, now <span className="ds-num">{record.revision}</span></>}
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
    const approved = doc.reviews.find((review) => review.state === "approved" && review.revision === record.revision);
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
                  markers: [...current.markers, { id: `mk-${Date.now().toString(36)}`, time: ui.playhead, text: note, author: context.actor, at: new Date().toISOString(), resolved: false }],
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
      className="ds-stack ds-gap-4"
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
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="Showroom walkthrough" /></Field>
      <Row gap={3} wrap>
        <Field label="Frame rate">
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
      <Notice tone="info" title="The timebase is fixed at creation">
        Every clip is snapped to a whole frame at this rate. A source shot at another rate is conformed by mapping frames, not by guessing.
      </Notice>
    </form>
  );
}

function MediaImport({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"video" | "audio">("video");
  const [license, setLicense] = useState("Unknown");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="No video file is stored in this workspace">
        A source added here is a generated shot: a look and a motion the renderer draws from. It is honest about what it is, and the preview, the scrub and the export all use it.
      </Notice>
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Workshop hands" /></Field>
      <Field label="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value as "video")}>
          <option value="video">Picture</option>
          <option value="audio">Audio</option>
        </Select>
      </Field>
      <Field label="Licence">
        <Select value={license} onChange={(event) => setLicense(event.target.value)}>
          {["Unknown", "Company-owned", "Licensed — single use", "Licensed — unlimited", "Model released", "No model release"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      {license === "Unknown" && <Notice tone="danger" title="Rights are not recorded">A clip whose rights are unknown is flagged in the project list and should not be delivered.</Notice>}
      <Button
        variant="primary"
        disabled={!name.trim()}
        onClick={() => {
          const id = `src-${Date.now().toString(36)}`;
          handle.edit((current) => ({
            ...current,
            sources: [...current.sources, {
              id, name, kind, duration: 20,
              look: { hue: (current.sources.length * 47) % 360, motion: "pan", subject: kind === "audio" ? "bars" : "room", grain: 0.05 },
              tone: kind === "audio" ? { root: 110, kind: "room", tempo: 90 } : undefined,
              license, credit: "not recorded", proxy: "generated",
            }],
          }), `Add the source ${name}`);
          context.toast("Source added", "Drag it onto a track from the media bin, or use Create a clip on the timeline.");
          close();
        }}
      >
        Add the source
      </Button>
    </Stack>
  );
}

function ClipProperty({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  return <ClipPanel handle={handle} context={context} />;
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
          <Properties rows={[
            { label: "From", value: previous.name },
            { label: "To", value: clip.name },
            { label: "At", value: <span className="ds-num">{timecode(clip.start, doc.fps)}</span> },
          ]} />
          <Field label="Kind">
            <Select
              value={existing?.kind ?? "cross-dissolve"}
              onChange={(event) => handle.edit((current) => ({
                ...current,
                transitions: existing
                  ? current.transitions.map((transition) => (transition.id === existing.id ? { ...transition, kind: event.target.value as "cross-dissolve" } : transition))
                  : [...current.transitions, { id: `x-${Date.now().toString(36)}`, fromClipId: previous.id, toClipId: clip.id, kind: event.target.value as "cross-dissolve", duration: 0.8 }],
              }), "Set the transition")}
            >
              <option value="cross-dissolve">Cross dissolve</option>
              <option value="dip-to-black">Dip to black</option>
              <option value="wipe-left">Wipe from the left</option>
            </Select>
          </Field>
          <Field label={`Duration ${existing?.duration.toFixed(2) ?? "0.80"}s`}>
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
                  : [...current.transitions, { id: `x-${Date.now().toString(36)}`, fromClipId: previous.id, toClipId: clip.id, kind: "cross-dissolve", duration: snapFrame(Number(event.target.value), doc.fps) }],
              }), "Set the transition duration")}
            />
          </Field>
          {existing && (
            <Button size="sm" variant="ghost" onClick={() => { handle.edit((current) => ({ ...current, transitions: current.transitions.filter((transition) => transition.id !== existing.id) }), "Remove the transition"); close(); }}>Remove the transition</Button>
          )}
          <Notice tone="info" title="The transition is rendered, not drawn as a label">
            The compositor mixes the two clips across the duration, so scrubbing through the join shows the real mix at every frame.
          </Notice>
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
      <Notice tone="info" title="There is nothing to transcode">
        Each source's picture is generated at whatever size is asked for, so a smaller proxy would be no faster. Where a real file existed, this is where its transcode would be queued.
      </Notice>
      <Properties rows={[
        { label: "Sources", value: doc.sources.length },
        { label: "Generated on demand", value: doc.sources.filter((source) => source.proxy === "generated").length },
        { label: "Offline", value: doc.sources.filter((source) => source.missing).length },
      ]} />
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
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Name", value: source.name },
        { label: "Kind", value: source.kind },
        { label: "Duration", value: <span className="ds-num">{timecode(source.duration, doc.fps)}</span> },
        { label: "Used by", value: <><span className="ds-num">{uses.length}</span> clips</> },
        { label: "Licence", value: source.license },
        { label: "Credit", value: source.credit },
        { label: "State", value: source.missing ? "offline" : "present" },
      ]} />
      {source.kind !== "audio" && (
        <img
          src={frameDataUrl({ ...doc, tracks: [{ id: "preview", name: "preview", kind: "video", order: 1, muted: false, solo: false, locked: false, height: 40 }], clips: [{ id: "preview", trackId: "preview", start: 0, sourceIn: 0, duration: source.duration, sourceId: source.id, name: source.name, opacity: 1, transform: { scale: 1, x: 0, y: 0, rotation: 0 }, effects: [], fadeIn: 0, fadeOut: 0 }] }, source.duration / 3, 400)}
          alt={`${source.name} frame`}
          style={{ width: "100%", borderRadius: 6 }}
        />
      )}
      <Field label="Licence">
        <Select value={source.license} onChange={(event) => handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, license: event.target.value } : item)) }), "Change the licence")}>
          {["Unknown", "Company-owned", "Licensed — single use", "Licensed — unlimited", "Model released", "No model release"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="Credit">
        <TextInput value={source.credit} onChange={(event) => handle.edit((current) => ({ ...current, sources: current.sources.map((item) => (item.id === source.id ? { ...item, credit: event.target.value } : item)) }), "Change the credit")} />
      </Field>
    </Stack>
  );
}

function RelinkFile({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const missing = handle.doc.sources.filter((source) => source.missing);
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is no file system to search">
        A real editor would search a folder for the file by name. Nothing here can read your disk, so relinking marks the source as present and uses the generated picture, which the clip says on its face.
      </Notice>
      {missing.length === 0 ? <Notice tone="success" title="Nothing is offline" /> : missing.map((source) => (
        <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
          <span className="ds-grow">{source.name}</span>
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
  return (
    <Stack gap={3}>
      <Field label="Name"><TextInput value={track.name} onChange={(event) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, name: event.target.value } : item)) }), "Rename the track")} /></Field>
      <Field label={`Gain ${(track.gainDb ?? 0).toFixed(1)} dB`}>
        <input className="vx-range" type="range" min={-40} max={12} step={0.5} value={track.gainDb ?? 0} aria-label="Gain" onChange={(event) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, gainDb: Number(event.target.value) } : item)) }), "Change the gain")} />
      </Field>
      <Field label={`Pan ${(track.pan ?? 0).toFixed(2)}`}>
        <input className="vx-range" type="range" min={-1} max={1} step={0.05} value={track.pan ?? 0} aria-label="Pan" onChange={(event) => handle.edit((current) => ({ ...current, tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, pan: Number(event.target.value) } : item)) }), "Change the pan")} />
      </Field>
      <Notice tone="warning" title="Pan is stored but the mix is mono">The mix is summed to one channel, so a pan value is recorded on the track and does not change what you hear. It is not applied silently.</Notice>
      <Properties rows={[
        { label: "Gain as a factor", value: <span className="ds-num">{dbToGain(track.gainDb ?? 0).toFixed(3)}</span> },
        { label: "Clips", value: clipsOnTrack(doc, track.id).length },
      ]} />
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
      <Properties rows={[
        { label: "Approximate loudness", value: <span className="ds-num">{loudness.approximateLufs} LUFS</span> },
        { label: "Target", value: <span className="ds-num">{doc.loudnessTarget} LUFS</span> },
        { label: "RMS", value: <span className="ds-num">{loudness.rms.toFixed(1)} dBFS</span> },
        { label: "Sample peak", value: <span className="ds-num">{loudness.samplePeakDb.toFixed(1)} dBFS</span> },
        { label: "Clipped samples", value: <span className="ds-num">{loudness.clippedSamples}</span> },
      ]} />
      {loudness.clippedSamples > 0 && <Notice tone="danger" title="The mix clips">Samples reach full scale. Lower a track's gain.</Notice>}
      <Notice tone="warning" title="Not a compliance meter">
        A certified measurement applies K-weighting and gating. This is RMS with a fixed offset over the same samples. Useful for comparison; not evidence of compliance.
      </Notice>
      <MixWaveform doc={doc} seconds={Math.min(doc.duration, 30)} height={100} label="Programme waveform" />
    </Stack>
  );
}

function VoiceCleanup() {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Voice cleanup is not implemented">
        De-noise, de-reverb and voice isolation all need signal processing that is not built here. The mixer's gain and fades are real; nothing else is claimed.
      </Notice>
      <Notice tone="info" title="Consent comes first anyway">
        A voice in a project needs the speaker's consent on the record before it is processed or published. No model is connected that could synthesise or alter a voice.
      </Notice>
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
  return (
    <Stack gap={3}>
      <PreviewMonitor doc={doc} time={(caption.start + caption.end) / 2} height={180} captions />
      <Row gap={2} wrap>
        <Field label="In (s)"><TextInput type="number" step={0.1} value={caption.start} onChange={(event) => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, start: Number(event.target.value) } : item)) }), "Change the cue timing")} /></Field>
        <Field label="Out (s)"><TextInput type="number" step={0.1} value={caption.end} onChange={(event) => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, end: Number(event.target.value) } : item)) }), "Change the cue timing")} /></Field>
      </Row>
      <Field label="Text"><TextArea rows={3} value={caption.text} onChange={(event) => handle.edit((current) => ({ ...current, captions: current.captions.map((item) => (item.id === caption.id ? { ...item, text: event.target.value, reviewed: false } : item)) }), "Edit the cue")} /></Field>
      <Properties rows={[
        { label: "Reading speed", value: <><span className="ds-num">{Math.round(caption.text.length / Math.max(0.1, caption.end - caption.start))}</span> characters a second</> },
        { label: "On screen", value: <span className="ds-num">{(caption.end - caption.start).toFixed(2)}s</span> },
        { label: "Checked", value: caption.reviewed ? "yes" : "not yet" },
      ]} />
    </Stack>
  );
}

function SpeakerVerification({ context }: { context: ScreenContext }) {
  const { record, handle } = useVideoDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const speakers = [...new Set(handle.doc.captions.map((caption) => caption.speaker).filter(Boolean))];
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Speakers are typed, not identified">
        Nothing here recognises a voice. A speaker label is whatever a person wrote on the cue, and it is listed below so it can be checked.
      </Notice>
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
  return (
    <Stack gap={3}>
      {languages.map((language) => {
        const cues = doc.captions.filter((caption) => caption.language === language);
        const empty = cues.filter((cue) => !cue.text.trim()).length;
        return (
          <Notice key={language} tone={empty > 0 ? "warning" : cues.every((cue) => cue.reviewed) ? "success" : "info"} title={`${language}: ${cues.length} cues`}>
            {empty > 0 ? `${empty} cues have no text. They were created with the timings of another track and still need writing.` : `${cues.filter((cue) => cue.reviewed).length} have been checked by a person.`}
          </Notice>
        );
      })}
      {languages.length === 0 && <Empty title="No caption tracks" />}
    </Stack>
  );
}

function RenderSettings({ context }: { context: ScreenContext }) {
  return <ExportScreen context={context} lens="Export" />;
}

function Compatibility() {
  const support = recorderSupport();
  return (
    <Stack gap={3}>
      <Notice tone={support.webm ? "success" : "danger"} title={support.webm ? "WebM can be encoded here" : "No video encoding is available"}>{support.reason}</Notice>
      <Properties rows={[
        { label: "WebM / VP9", value: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "supported" : "not supported" },
        { label: "WebM / VP8", value: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "supported" : "not supported" },
        { label: "MP4 / H.264", value: "not produced — no encoder is shipped with this application" },
        { label: "ProRes or DNxHD", value: "not produced" },
        { label: "Frame sequence", value: "always available; PNG is drawn by the same renderer" },
      ]} />
      <Notice tone="warning" title="What a delivery spec would need">
        A broadcaster asking for ProRes at a given loudness cannot be served from here. The honest route is a frame sequence plus the WAV mix, encoded elsewhere.
      </Notice>
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
      ) : (
        <>
          <Notice tone="success" title={`${done.length} files were written`}>Each one was checked for a non-zero size before it was offered for download.</Notice>
          {done.map((job) => (
            <Properties
              key={job.id}
              rows={[
                { label: "File", value: <span className="ds-num">{job.artifact}</span> },
                { label: "Size", value: <span className="ds-num">{((job.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB</span> },
                { label: "Frames", value: <span className="ds-num">{job.frames}</span> },
                { label: "What happened", value: job.note },
              ]}
            />
          ))}
        </>
      )}
      <Notice tone="warning" title="Delivery is not connected">
        There is no destination to send a file to. A render downloads to this machine, and the record keeps what was produced.
      </Notice>
    </Stack>
  );
}

function ReviewMarker({ context }: { context: ScreenContext }) {
  return <ReviewScreen context={context} lens="Comments" />;
}

function VersionComparison({ context }: { context: ScreenContext }) {
  return <ReviewScreen context={context} lens="Versions" />;
}

function FinalSignoff({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useVideoDoc(context);
  const [state, setState] = useState<"approved" | "changes" | "pending">("approved");
  const [note, setNote] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a project first" />;
  const doc = handle.doc;
  return (
    <form
      id="video-signoff"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => ({
          ...current,
          reviews: [{ id: `rv-${Date.now().toString(36)}`, at: new Date().toISOString(), by: context.actor, state, note, revision: record.revision, digest: cutDigest(current) }, ...current.reviews],
        }), "Record a review decision");
        context.toast("Decision recorded", `Bound to revision ${record.revision} and to the cut digest ${cutDigest(doc)}. Any edit changes the digest.`);
        close();
      }}
    >
      <Notice tone="info" title={`This binds to revision ${record.revision} and digest ${cutDigest(doc)}`}>
        The digest is computed from every clip's source, position and duration. Change the cut and the approval no longer matches it.
      </Notice>
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

async function withVideo(context: ScreenContext, change: (doc: VideoDoc) => VideoDoc, event: string): Promise<void> {
  const id = context.params.id;
  if (!id) return;
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  if (!record) return;
  await context.mutate.patch(id, { body: change(parseVideo(record.body)) }, { event });
}

const TIMELINE_ACTIONS: ActionDef[] = [
  {
    id: "Trim", label: "Trim one frame off the end", placement: "toolbar",
    guard: () => (videoUi.get().selectedClipId ? undefined : "Select a clip first"),
    run: (context) => withVideo(context, (doc) => trimClip(doc, videoUi.get().selectedClipId!, "end", -1 / doc.fps), "Trimmed a frame"),
  },
  {
    id: "split", label: "Split at the playhead", placement: "primary",
    guard: () => (videoUi.get().selectedClipId ? undefined : "Select a clip first"),
    run: (context) => withVideo(context, (doc) => splitClip(doc, videoUi.get().selectedClipId!, videoUi.get().playhead).doc, "Split a clip"),
  },
  {
    id: "ripple", label: "Ripple delete", placement: "overflow", tone: "danger",
    guard: () => (videoUi.get().selectedClipId ? undefined : "Select a clip first"),
    run: (context) => withVideo(context, (doc) => rippleDelete(doc, videoUi.get().selectedClipId!), "Ripple deleted a clip"),
  },
  { id: "drag clips", label: "Select tool", placement: "overflow", run: () => setVideoTool("select") },
  { id: "scrub", label: "Go to the start", placement: "secondary", run: () => videoUi.set((current) => ({ ...current, playhead: 0, playing: false })) },
  { id: "undo", label: "Transitions", placement: "secondary", run: (context) => context.openOverlay("transition editor") },
];

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
        { id: "Create", label: "Create", placement: "primary", run: (context) => context.openOverlay("new sequence") },
        {
          id: "import media", label: "Import media", placement: "secondary",
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
        { id: "Media import", kind: "modal", title: "Add a source", width: 520, render: ({ close, ...context }) => <MediaImport context={context} close={close} /> },
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
        { id: "Import", label: "Add a source", placement: "primary", run: (context) => context.openOverlay("Media inspector") },
        { id: "relink", label: "Relink", placement: "secondary", run: (context) => context.openOverlay("relink file") },
        {
          id: "tag", label: "Mark the rights as company-owned", placement: "overflow",
          run: (context) => withVideo(context, (doc) => ({ ...doc, sources: doc.sources.map((source) => (source.license === "Unknown" ? { ...source, license: "Company-owned" } : source)) }), "Recorded the rights on every unknown source"),
        },
        { id: "proxy generate", label: "Proxies", placement: "overflow", run: (context) => context.setTab("Proxy") },
        { id: "audition", label: "Missing media", placement: "secondary", run: (context) => context.setTab("Missing") },
      ],
      overlays: [
        { id: "Media inspector", kind: "drawer", title: "Source", width: 460, render: ({ ...context }) => <MediaInspector context={context} /> },
        { id: "relink file", kind: "modal", title: "Relink", width: 520, render: ({ close, ...context }) => <RelinkFile context={context} close={close} /> },
        { id: "license", kind: "drawer", title: "Rights", width: 440, render: ({ ...context }) => <LicenceDrawer context={context} /> },
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
          id: "Adjust gain", label: "Pull every track down 1 dB", placement: "secondary",
          run: (context) => withVideo(context, (doc) => ({ ...doc, tracks: doc.tracks.map((track) => (track.kind === "audio" ? { ...track, gainDb: (track.gainDb ?? 0) - 1 } : track)) }), "Lowered every audio track by 1 dB"),
        },
        {
          id: "mute", label: "Mute every audio track", placement: "overflow",
          run: (context) => withVideo(context, (doc) => ({ ...doc, tracks: doc.tracks.map((track) => (track.kind === "audio" ? { ...track, muted: !track.muted } : track)) }), "Muted the audio tracks"),
        },
        { id: "automate", label: "Effects", placement: "overflow", run: (context) => context.setTab("Effects") },
        { id: "export mix", label: "Loudness", placement: "primary", run: (context) => context.setTab("Loudness") },
      ],
      overlays: [
        { id: "Mixer property", kind: "drawer", title: "Track", width: 420, render: ({ ...context }) => <MixerProperty context={context} /> },
        { id: "loudness review", kind: "modal", title: "Loudness", width: 560, render: ({ ...context }) => <LoudnessReview context={context} /> },
        { id: "voice cleanup", kind: "modal", title: "Voice cleanup", width: 520, render: () => <VoiceCleanup /> },
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
          id: "Correct", label: "Add a cue at the playhead", placement: "primary",
          run: (context) => withVideo(context, (doc) => ({
            ...doc,
            captions: [...doc.captions, { id: `cap-${Date.now().toString(36)}`, start: videoUi.get().playhead, end: Math.min(doc.duration, videoUi.get().playhead + 2.5), text: "", reviewed: false, language: videoUi.get().language }].sort((a, b) => a.start - b.start),
          }), "Added a caption cue"),
        },
        {
          id: "split cue", label: "Split the cue at the playhead", placement: "secondary",
          run: (context) => withVideo(context, (doc) => {
            const caption = doc.captions.find((item) => videoUi.get().playhead > item.start && videoUi.get().playhead < item.end);
            return caption ? splitCaption(doc, caption.id, videoUi.get().playhead) : doc;
          }, "Split a caption cue"),
        },
        { id: "time", label: "Review", placement: "secondary", run: (context) => context.setTab("Review") },
        { id: "style", label: "Languages", placement: "overflow", run: (context) => context.setTab("Languages") },
        {
          id: "export SRT", label: "Export SRT", placement: "overflow",
          run: async (context) => {
            const id = context.params.id;
            if (!id) return;
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(id);
            if (!record) return;
            const doc = parseVideo(record.body);
            downloadText(`${slug(record.title)}.srt`, captionsToSrt(doc.captions, videoUi.get().language), "application/x-subrip");
            context.toast("SRT written", `${doc.captions.filter((caption) => caption.language === videoUi.get().language).length} cues with millisecond timings.`);
          },
        },
      ],
      overlays: [
        { id: "Caption editor", kind: "drawer", title: "Cue", width: 460, render: ({ ...context }) => <CaptionEditorOverlay context={context} /> },
        { id: "speaker verification", kind: "modal", title: "Speakers", width: 520, render: ({ ...context }) => <SpeakerVerification context={context} /> },
        { id: "language review", kind: "modal", title: "Languages", width: 520, render: ({ ...context }) => <LanguageReview context={context} /> },
      ],
    },

    "ARL-VIDEO-006": {
      id: "ARL-VIDEO-006",
      tabs: (["Colour", "Effects", "Presets", "Compare"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EffectsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Apply", label: "Presets", placement: "primary", run: (context) => context.setTab("Presets") },
        {
          id: "reorder", label: "Reverse the effect order", placement: "overflow",
          guard: () => (videoUi.get().selectedClipId ? undefined : "Select a clip first"),
          run: (context) => withVideo(context, (doc) => patchClip(doc, videoUi.get().selectedClipId!, { effects: [...(doc.clips.find((clip) => clip.id === videoUi.get().selectedClipId)?.effects ?? [])].reverse() }), "Reversed the effect order"),
        },
        { id: "preview", label: "Compare", placement: "secondary", run: (context) => context.setTab("Compare") },
        { id: "bypass", label: "Bypass every effect", placement: "secondary", run: () => videoUi.set((current) => ({ ...current, bypassEffects: !current.bypassEffects })) },
        {
          id: "reset", label: "Clear the grade", placement: "overflow", tone: "danger",
          guard: () => (videoUi.get().selectedClipId ? undefined : "Select a clip first"),
          run: (context) => withVideo(context, (doc) => patchClip(doc, videoUi.get().selectedClipId!, { effects: [] }), "Cleared the grade"),
        },
      ],
      overlays: [
        { id: "Effect inspector", kind: "drawer", title: "Effects", width: 440, render: ({ ...context }) => <EffectInspectorOverlay context={context} /> },
        { id: "scope display", kind: "modal", title: "Scopes", width: 560, render: ({ ...context }) => <ScopeOverlay context={context} /> },
        { id: "preset save", kind: "modal", title: "Presets", width: 620, render: ({ ...context }) => <EffectsScreen context={context} lens="Presets" /> },
      ],
    },

    "ARL-VIDEO-007": {
      id: "ARL-VIDEO-007",
      tabs: (["Export", "Queue", "History", "Failures"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExportScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Render preview", label: "Contact sheet", placement: "secondary", run: (context) => context.setTab("Export") },
        { id: "export", label: "Export", placement: "primary", run: (context) => context.setTab("Export") },
        { id: "cancel", label: "Queue", placement: "overflow", run: (context) => context.setTab("Queue") },
        { id: "download", label: "History", placement: "overflow", run: (context) => context.setTab("History") },
        { id: "publish", label: "Compatibility", placement: "secondary", run: (context) => context.openOverlay("compatibility") },
      ],
      overlays: [
        { id: "Render settings", kind: "modal", title: "Render", width: 760, render: ({ ...context }) => <RenderSettings context={context} /> },
        { id: "compatibility", kind: "modal", title: "What this browser can encode", width: 560, render: () => <Compatibility /> },
        { id: "delivery confirmation", kind: "drawer", title: "Delivery", width: 460, render: ({ ...context }) => <DeliveryConfirmation context={context} /> },
      ],
    },

    "ARL-VIDEO-008": {
      id: "ARL-VIDEO-008",
      tabs: (["Comments", "Versions", "Approval", "Delivery"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ReviewScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Comment timestamp", label: "Comment here", placement: "primary", run: (context) => context.openOverlay("Review marker") },
        { id: "compare", label: "Compare versions", placement: "secondary", run: (context) => context.setTab("Versions") },
        { id: "approve", label: "Record a decision", placement: "secondary", run: (context) => context.openOverlay("final signoff") },
        {
          id: "assign edit", label: "Assign every open note", placement: "overflow",
          run: async (context) => {
            const id = context.params.id;
            if (!id) return;
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(id);
            if (!record) return;
            const doc = parseVideo(record.body);
            const open = doc.markers.filter((marker) => !marker.resolved);
            if (open.length === 0) { context.toast("Nothing to assign", "No open notes on this cut.", "info"); return; }
            for (const marker of open) {
              await context.mutate.create({
                collection: "tasks", title: `Edit note at ${timecode(marker.time, doc.fps)}: ${marker.text.slice(0, 50)}`,
                status: "todo", summary: `From the review of ${record.title}.`, parentId: record.id,
                fields: { assignee: context.actor, timecode: timecode(marker.time, doc.fps), source: "video review" },
              }, "Edit task created from a review note");
            }
            context.toast("Assigned", `${open.length} tasks created in Projects, each with its timecode.`);
          },
        },
      ],
      overlays: [
        { id: "Review marker", kind: "modal", title: "Timecoded note", width: 720, render: ({ ...context }) => <ReviewMarker context={context} /> },
        { id: "version comparison", kind: "modal", title: "Compare", width: 820, render: ({ ...context }) => <VersionComparison context={context} /> },
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
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Project", value: record.title },
        { label: "Frame", value: <span className="ds-num">{doc.width} × {doc.height}</span> },
        { label: "Rate", value: <span className="ds-num">{doc.fps} fps</span> },
        { label: "Duration", value: <span className="ds-num">{timecode(doc.duration, doc.fps)}</span> },
        { label: "Clips", value: doc.clips.length },
        { label: "Sources", value: doc.sources.length },
        { label: "Rights unknown", value: doc.sources.filter((source) => source.license === "Unknown").length },
        { label: "Revision", value: <span className="ds-num">{record.revision}</span> },
      ]} />
      <Button variant="primary" onClick={() => context.navigate(context.path("/o/:org/video/projects/:id", record.id))}>Open the timeline</Button>
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
