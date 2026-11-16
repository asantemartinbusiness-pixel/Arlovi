import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowUp, Circle, Diamond, Eye, EyeOff, Lock, Square, Trash2, Type, Unlock } from "lucide-react";
import {
  Button, Notice, Pill, Row, Select, Stack, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import {
  ColorBox, EditorFrame, NumberBox, PanelGroup, RecoveryNotice, SaveState, ShortcutTable, useStore, type DocHandle,
} from "@/applications/visual/kit";
import { clamp, uid } from "@/applications/visual/geometry";
import {
  EASING_PRESETS, MOTION_PRESETS, applyPreset, editProperty, propertyDefault, removeKeyframe, sampleLayer, sampleTrack,
  setEasing, setKeyframe, type AnimatableProperty, type Easing, type Keyframe, type MotionDoc, type MotionLayer,
} from "./anim";
import { motionUi, setMotionTime } from "./model";
import { EasingGraph, KeyframeTimeline, Stage, TransportRow } from "./parts";
import { MissingComposition, SHORTCUTS, useAssetLookup, useMotionDoc, usePrefersReducedMotion, useSession, FormField } from "./shared";

/* ====================================================================== *
 * ARL-MOTION-002 — Composition Editor
 * ====================================================================== */

export const PROPERTY_LABEL: Record<AnimatableProperty, string> = {
  x: "Position X", y: "Position Y", scale: "Scale", rotation: "Rotation", opacity: "Opacity",
  colour: "Colour", letterSpacing: "Letter spacing", blur: "Blur",
};

const TRANSFORM_PROPS: AnimatableProperty[] = ["x", "y", "scale", "rotation", "opacity", "colour"];
const EFFECT_PROPS: AnimatableProperty[] = ["blur", "letterSpacing"];

export function selectedLayer(doc: MotionDoc | null | undefined): MotionLayer | undefined {
  const ui = motionUi.get();
  return doc?.layers.find((layer) => layer.id === (ui.selectedLayerId ?? doc.activeLayerId)) ?? doc?.layers[0];
}

export function selectedKeyframe(doc: MotionDoc | null | undefined): { layer: MotionLayer; property: AnimatableProperty; keyframe: Keyframe; next?: Keyframe } | undefined {
  const ui = motionUi.get();
  if (!doc || !ui.selectedKeyframeId) return undefined;
  for (const layer of doc.layers) {
    for (const [property, keyframes] of Object.entries(layer.tracks) as [AnimatableProperty, Keyframe[] | undefined][]) {
      const sorted = [...(keyframes ?? [])].sort((a, b) => a.t - b.t);
      const index = sorted.findIndex((keyframe) => keyframe.id === ui.selectedKeyframeId);
      if (index >= 0) return { layer, property, keyframe: sorted[index], next: sorted[index + 1] };
    }
  }
  return undefined;
}

/** Set a keyframe on the selected property at the playhead, at the value it currently has. */
export function setKeyframeHere(handle: DocHandle<MotionDoc>): string | undefined {
  const doc = handle.doc;
  const layer = selectedLayer(doc);
  const ui = motionUi.get();
  if (!doc || !layer) return "Select a layer first";
  if (layer.locked) return `${layer.name} is locked`;
  const property = ui.selectedProperty ?? "opacity";
  const value = sampleTrack(layer.tracks[property], ui.time, property === "colour" ? layer.fill : propertyDefault(property, layer));
  const t = Math.round(ui.time * doc.fps) / doc.fps;
  handle.edit((current) => setKeyframe(current, layer.id, property, t, value), `Set a ${PROPERTY_LABEL[property].toLowerCase()} keyframe`);
  const id = `kf-${layer.id}-${property}-${Math.round(t * 1000)}`;
  const existing = (layer.tracks[property] ?? []).find((keyframe) => Math.abs(keyframe.t - t) < 0.5 / doc.fps);
  motionUi.set((currentUi) => ({ ...currentUi, selectedLayerId: layer.id, selectedProperty: property, selectedKeyframeId: existing?.id ?? id }));
  return undefined;
}

function isTyping(event: ReactKeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function editorKeys(event: ReactKeyboardEvent, handle: DocHandle<MotionDoc>, context: ScreenContext): void {
  const doc = handle.doc;
  if (!doc || isTyping(event)) return;
  const ui = motionUi.get();
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) handle.redo(); else handle.undo(); return; }
  if ((event.target as HTMLElement).closest("[role=slider], .vx-key")) return;
  if (event.key === " ") { event.preventDefault(); motionUi.set((current) => ({ ...current, playing: !current.playing })); return; }
  if (event.key.toLowerCase() === "k" && !mod) { event.preventDefault(); const blocked = setKeyframeHere(handle); if (blocked) context.toast("No keyframe set", blocked, "blocked"); return; }
  if (event.key === "Home") { event.preventDefault(); setMotionTime(0, doc.fps); return; }
  if (event.key === "End") { event.preventDefault(); setMotionTime(doc.duration, doc.fps); return; }
  if (event.key === "," || event.key === ".") { event.preventDefault(); setMotionTime(ui.time + (event.key === "," ? -1 : 1) / doc.fps, doc.fps); }
}

export function EditorScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, doc, playback } = useMotionDoc(context);
  const ui = useStore(motionUi);
  const osReduced = usePrefersReducedMotion();
  const [showFull, setShowFull] = useState(false);
  const assets = useAssetLookup();
  if (!record) return <div className="pg-body"><MissingComposition context={context} /></div>;
  const tab = context.tab || "Animate";
  const layer = selectedLayer(doc);
  const missingIds = doc && assets.ready ? doc.layers.filter((item) => item.assetId && !assets.status(doc.assets.find((asset) => asset.id === item.assetId) ?? { id: "", name: "", kind: "image" }).found).map((item) => item.id) : [];
  const reducedPreview = tab === "Preview" && (ui.reduceMotionPreview || (osReduced && !showFull));

  const startDrag = (id: string, event: ReactPointerEvent<SVGGElement>) => {
    if (!doc || tab === "Preview") return;
    const target = doc.layers.find((item) => item.id === id);
    if (!target || target.locked) return;
    const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!matrix) return;
    const startX = Number(sampleTrack(target.tracks.x, ui.time, 0));
    const startY = Number(sampleTrack(target.tracks.y, ui.time, 0));
    const origin = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const before = handle.doc;
    const move = (ev: PointerEvent) => {
      const point = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(matrix.inverse());
      const dx = Math.round(point.x - origin.x);
      const dy = Math.round(point.y - origin.y);
      if (!before) return;
      const animate = motionUi.get().animate || (target.tracks.x?.length ?? 0) > 0 || (target.tracks.y?.length ?? 0) > 0;
      let next = before;
      if (animate && motionUi.get().animate) {
        next = setKeyframe(next, id, "x", ui.time, startX + dx);
        next = setKeyframe(next, id, "y", ui.time, startY + dy);
      } else {
        next = editProperty(next, id, "x", (target.tracks.x?.length ? startX : 0) + dx, ui.time, false);
        next = editProperty(next, id, "y", (target.tracks.y?.length ? startY : 0) + dy, ui.time, false);
      }
      handle.live(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      handle.beginGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!doc || !layer || !event.key.startsWith("Arrow") || tab === "Preview" || isTyping(event)) return false;
    if ((event.target as HTMLElement) !== event.currentTarget) return false;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const property: AnimatableProperty = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -step : step;
    const animated = (layer.tracks[property]?.length ?? 0) > 0;
    const now = Number(sampleTrack(layer.tracks[property], ui.time, 0));
    handle.edit((current) => editProperty(current, layer.id, property, (animated || ui.animate ? now : 0) + delta, ui.time, ui.animate), `Nudge ${layer.name}`);
    return true;
  };

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Animate" }, { id: "Design" }, { id: "Effects" }, { id: "Preview" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{doc.duration}s</span> · <span className="ds-num">{doc.width}×{doc.height}</span> · <span className="ds-num">{doc.fps}</span> fps</span>}{ui.animate && <Pill tone="danger" dot>Animate mode: edits write keyframes</Pill>}</Row>}
      backTo={{ label: "Motion", to: `/o/${context.org.slug}/motion/projects` }}
      tools={
        <>
          <Toolbar label="Add a layer">
            <Tool label="Add a rectangle" icon={<Square size={15} />} onClick={() => addLayer(handle, "rect")} />
            <Tool label="Add an ellipse" icon={<Circle size={15} />} onClick={() => addLayer(handle, "ellipse")} />
            <Tool label="Add text" icon={<Type size={15} />} onClick={() => addLayer(handle, "text")} />
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="View">
            <Button size="sm" variant={ui.onion ? "primary" : "ghost"} aria-pressed={ui.onion} onClick={() => motionUi.set((c) => ({ ...c, onion: !c.onion }))}>Onion skin</Button>
            <Button size="sm" variant="ghost" aria-label="Zoom the timeline out" onClick={() => motionUi.set((c) => ({ ...c, zoom: clamp(c.zoom / 1.5, 0.5, 6) }))}>−</Button>
            <span className="ds-num vx-mini">{Math.round(ui.zoom * 100)}%</span>
            <Button size="sm" variant="ghost" aria-label="Zoom the timeline in" onClick={() => motionUi.set((c) => ({ ...c, zoom: clamp(c.zoom * 1.5, 0.5, 6) }))}>+</Button>
          </Toolbar>
          <ToolbarSeparator />
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("keyboard")}>Keyboard</Button>
        </>
      }
      left={doc ? <LayerList handle={handle} doc={doc} missingIds={missingIds} context={context} /> : null}
      leftLabel="Vector layers"
      right={doc ? (
        tab === "Design" ? <DesignPanel handle={handle} doc={doc} />
          : tab === "Effects" ? <EffectsPanel handle={handle} doc={doc} />
            : tab === "Preview" ? <PreviewPanel handle={handle} doc={doc} osReduced={osReduced} showFull={showFull} setShowFull={setShowFull} />
              : <AnimatePanel handle={handle} doc={doc} context={context} />
      ) : null}
      rightLabel={tab === "Animate" ? "Properties and keyframes" : tab}
      status={
        <>
          <span className="ds-num">{ui.time.toFixed(2)}s · frame {doc ? Math.round(ui.time * doc.fps) : 0}</span>
          {layer && <span>{layer.name}{ui.selectedProperty ? ` · ${PROPERTY_LABEL[ui.selectedProperty]}` : ""}</span>}
          {handle.lastLabel && <span>Last: {handle.lastLabel}</span>}
          <span className="ds-grow" />
          <span>Space plays · K sets a keyframe · arrows on the stage nudge · , and . step a frame</span>
        </>
      }
    >
      <div
        className="mo-editor"
        tabIndex={-1}
        role="application"
        aria-label="Composition editor. Space plays, K sets a keyframe, Ctrl Z undoes."
        onKeyDown={(event) => editorKeys(event, handle, context)}
      >
        <div
          className="mo-stagewrap"
          tabIndex={0}
          aria-label={layer ? `Stage. ${layer.name} is selected; arrow keys move it one pixel, Shift ten.` : "Stage"}
          onKeyDown={(event) => { if (nudge(event)) event.stopPropagation(); }}
        >
          {doc && (
            <>
              <RecoveryNotice handle={handle as DocHandle<unknown>} />
              <Stage
                doc={doc}
                time={ui.time}
                height="100%"
                onion={ui.onion && tab !== "Preview"}
                selectedId={tab === "Preview" ? undefined : layer?.id}
                onSelect={tab === "Preview" ? undefined : (id) => motionUi.set((current) => ({ ...current, selectedLayerId: id }))}
                onLayerPointerDown={startDrag}
                reduced={reducedPreview}
                missingIds={missingIds}
              />
            </>
          )}
        </div>
        <div className="mo-transport">
          {doc && <TransportRow doc={doc} fps={playback.fps} />}
          {reducedPreview && <div className="vx-mini" role="status">Showing the reduced-motion alternative: {doc?.reducedMotion.strategy === "none" ? "none is declared, so the full motion plays" : doc?.reducedMotion.strategy}.</div>}
        </div>
        {tab !== "Preview" && (
          <div className="mo-timeline">
            <KeyframeTimeline handle={handle} height={210} onOpenKeyframe={() => context.openOverlay("Keyframe editor")} />
          </div>
        )}
      </div>
    </EditorFrame>
  );
}

function addLayer(handle: DocHandle<MotionDoc>, kind: "rect" | "ellipse" | "text") {
  const doc = handle.doc;
  if (!doc) return;
  const id = uid("lay");
  const w = kind === "text" ? Math.round(doc.width * 0.5) : Math.round(doc.width * 0.15);
  const h = kind === "text" ? Math.round(doc.height * 0.14) : Math.round(doc.width * 0.15);
  const layer: MotionLayer = {
    id, name: kind === "text" ? "Text" : kind === "rect" ? "Rectangle" : "Ellipse", kind, visible: true, locked: false,
    box: { x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2), w, h },
    fill: kind === "text" ? "#FFFFFF" : kind === "rect" ? "#234FE8" : "#36C5BA",
    ...(kind === "text" ? { text: "New line", textStyle: { family: "Inter", size: Math.round(h * 0.7), weight: 650, align: "start" as const } } : {}),
    ...(kind === "rect" ? { radius: 8 } : {}),
    tracks: {},
  };
  handle.edit((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: id }), `Add a ${layer.name.toLowerCase()}`);
  motionUi.set((current) => ({ ...current, selectedLayerId: id, selectedKeyframeId: undefined }));
}

function LayerList({ handle, doc, missingIds, context }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; missingIds: string[]; context: ScreenContext }) {
  const ui = useStore(motionUi);
  const selected = selectedLayer(doc);
  const ordered = [...doc.layers].reverse();
  const move = (id: string, delta: number) => handle.edit((current) => {
    const index = current.layers.findIndex((layer) => layer.id === id);
    const target = clamp(index + delta, 0, current.layers.length - 1);
    if (index < 0 || target === index) return current;
    const layers = [...current.layers];
    const [item] = layers.splice(index, 1);
    layers.splice(target, 0, item);
    return { ...current, layers };
  }, "Reorder layers");
  return (
    <Stack gap={2}>
      <div role="list" aria-label="Layers, top first">
        {ordered.map((layer) => (
          <div key={layer.id} role="listitem" className="mo-layer" data-selected={selected?.id === layer.id}>
            <button type="button" className="mo-layer-name" aria-current={selected?.id === layer.id} onClick={() => motionUi.set((current) => ({ ...current, selectedLayerId: layer.id }))}>
              {layer.name} <span className="vx-mini">{missingIds.includes(layer.id) ? <span style={{ color: "var(--warning)" }}>asset missing</span> : layer.kind}</span>
            </button>
            <button type="button" className="vx-node-btn" aria-label={`Move ${layer.name} up`} onClick={() => move(layer.id, 1)}><ArrowUp size={13} /></button>
            <button type="button" className="vx-node-btn" aria-label={`Move ${layer.name} down`} onClick={() => move(layer.id, -1)}><ArrowDown size={13} /></button>
            <button type="button" className="vx-node-btn" aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} aria-pressed={!layer.visible} onClick={() => handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...item, visible: !item.visible } : item)) }), layer.visible ? "Hide a layer" : "Show a layer")}>
              {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button type="button" className="vx-node-btn" aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} aria-pressed={layer.locked} onClick={() => handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...item, locked: !item.locked } : item)) }), layer.locked ? "Unlock a layer" : "Lock a layer")}>
              {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <Row gap={1} wrap>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("layer inspector")}>Layer inspector</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={doc.layers.length <= 1} onClick={() => {
            handle.edit((current) => ({ ...current, layers: current.layers.filter((layer) => layer.id !== selected.id), triggers: current.triggers.filter((trigger) => trigger.layerId !== selected.id) }), `Delete ${selected.name}`);
            motionUi.set((current) => ({ ...current, selectedLayerId: undefined, selectedKeyframeId: undefined }));
          }}>Delete layer</Button>
        </Row>
      )}
      <p className="vx-mini">The top of this list draws in front. Move layers with the arrow buttons. {ui.animate ? "Animate mode is on." : ""}</p>
    </Stack>
  );
}

function PropertyRow({ handle, doc, layer, property }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; layer: MotionLayer; property: AnimatableProperty }) {
  const ui = useStore(motionUi);
  const track = layer.tracks[property] ?? [];
  const value = sampleTrack(track, ui.time, property === "colour" ? layer.fill : propertyDefault(property, layer));
  const keyHere = track.find((keyframe) => Math.abs(keyframe.t - ui.time) < 0.5 / doc.fps);
  const label = PROPERTY_LABEL[property];
  /* An unanimated position outside animate mode is the box itself, so the field shows and sets it directly. */
  const boxAxis = (property === "x" || property === "y") && track.length === 0 && !ui.animate ? property : null;
  const shown = boxAxis ? layer.box[boxAxis] : value;
  const change = (next: number | string) => {
    if (boxAxis) {
      handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...item, box: { ...item.box, [boxAxis]: Number(next) } } : item)) }), `Move ${layer.name}`);
      return;
    }
    handle.edit((current) => editProperty(current, layer.id, property, next, ui.time, ui.animate), ui.animate ? `Key ${label.toLowerCase()}` : `Change ${label.toLowerCase()}`);
  };
  return (
    <div className="mo-prop" data-animated={track.length > 0} onFocus={() => motionUi.set((current) => (current.selectedProperty === property && current.selectedLayerId === layer.id ? current : { ...current, selectedLayerId: layer.id, selectedProperty: property }))}>
      <span className="mo-prop-name" aria-hidden="true">{boxAxis ? `${label} · box` : label}</span>
      {property === "colour"
        ? <ColorBox label={label} value={String(value)} onChange={change} />
        : <NumberBox label={boxAxis ? `${label} (box)` : label} value={Number(shown)} step={property === "opacity" ? 0.05 : property === "scale" ? 0.05 : 1} onChange={change} disabled={layer.locked} />}
      <button
        type="button"
        className="mo-keybtn"
        data-on={Boolean(keyHere)}
        aria-pressed={Boolean(keyHere)}
        aria-label={keyHere ? `Remove the ${label} keyframe at ${ui.time.toFixed(2)}s` : `Set a ${label} keyframe at ${ui.time.toFixed(2)}s`}
        disabled={layer.locked}
        onClick={() => {
          if (keyHere) {
            handle.edit((current) => removeKeyframe(current, layer.id, property, keyHere.id), `Remove a ${label.toLowerCase()} keyframe`);
            motionUi.set((current) => ({ ...current, selectedKeyframeId: undefined }));
          } else {
            motionUi.set((current) => ({ ...current, selectedLayerId: layer.id, selectedProperty: property }));
            setKeyframeHere(handle);
          }
        }}
      >
        <Diamond size={13} fill={keyHere ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function AnimatePanel({ handle, doc, context }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; context: ScreenContext }) {
  useStore(motionUi);
  const layer = selectedLayer(doc);
  const picked = selectedKeyframe(doc);
  if (!layer) return <Notice title="No layer">Add a layer from the toolbar.</Notice>;
  return (
    <Stack gap={3}>
      <PanelGroup title={`${layer.name} — transform`}>
        {layer.locked && <Notice tone="warning" title="Locked">Unlock the layer to change it.</Notice>}
        {TRANSFORM_PROPS.map((property) => <PropertyRow key={property} handle={handle} doc={doc} layer={layer} property={property} />)}
        <p className="vx-mini">{motionUi.get().animate ? "Animate mode: a changed value is keyed at the playhead." : "A changed value moves the whole property, keeping its animation. Turn on animate mode, or use ◆, to key it at the playhead."}</p>
      </PanelGroup>
      <PanelGroup title="Selected keyframe" actions={picked ? <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Keyframe editor")}>Edit…</Button> : undefined}>
        {picked ? (
          <Stack gap={2}>
            <span className="vx-mini">{picked.layer.name} · {PROPERTY_LABEL[picked.property]} · <span className="ds-num">{picked.keyframe.t.toFixed(2)}s</span> → {picked.next ? <span className="ds-num">{picked.next.t.toFixed(2)}s</span> : "end"}</span>
            <FormField label="Easing out of this keyframe">
              <Select
                value={EASING_PRESETS.find((preset) => JSON.stringify(preset.easing) === JSON.stringify(picked.keyframe.easing))?.id ?? "custom"}
                onChange={(event) => {
                  const preset = EASING_PRESETS.find((item) => item.id === event.target.value);
                  if (preset) handle.edit((current) => setEasing(current, picked.layer.id, picked.property, picked.keyframe.id, preset.easing), `Ease: ${preset.name}`);
                }}
              >
                {EASING_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                <option value="custom" disabled>Custom curve</option>
              </Select>
            </FormField>
            {picked.keyframe.easing.kind === "bezier"
              ? <EasingGraph easing={picked.keyframe.easing} size={200} label="Easing of the selected keyframe" onChange={(next) => handle.live((current) => setEasing(current, picked.layer.id, picked.property, picked.keyframe.id, next))} />
              : <p className="vx-mini">A {picked.keyframe.easing.kind} easing has no handles. Choose a bezier preset to drag the curve.</p>}
            {picked.keyframe.easing.kind === "bezier" && <Button size="sm" variant="ghost" onClick={() => handle.beginGesture()}>Mark the curve change as one undo step</Button>}
          </Stack>
        ) : <p className="vx-mini">Select a keyframe on the timeline (click, or Tab to it) to edit its easing here.</p>}
      </PanelGroup>
    </Stack>
  );
}

function DesignPanel({ handle, doc }: { handle: DocHandle<MotionDoc>; doc: MotionDoc }) {
  useStore(motionUi);
  const layer = selectedLayer(doc);
  if (!layer) return null;
  const patch = (change: Partial<MotionLayer>, label: string) => handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...item, ...change } : item)) }), label);
  return (
    <Stack gap={3}>
      <PanelGroup title="Layer">
        <FormField label="Name"><TextInput value={layer.name} onChange={(event) => patch({ name: event.target.value }, "Rename a layer")} /></FormField>
        {layer.kind === "text" && <FormField label="Text"><TextInput value={layer.text ?? ""} onChange={(event) => patch({ text: event.target.value }, "Edit text")} /></FormField>}
        <ColorBox label="Base fill" value={layer.fill} onChange={(fill) => patch({ fill }, "Change the fill")} />
      </PanelGroup>
      <PanelGroup title="Geometry (before animation)">
        <div className="vx-fieldrow">
          <NumberBox label="X" value={layer.box.x} onChange={(x) => patch({ box: { ...layer.box, x } }, "Move the box")} />
          <NumberBox label="Y" value={layer.box.y} onChange={(y) => patch({ box: { ...layer.box, y } }, "Move the box")} />
          <NumberBox label="Width" value={layer.box.w} min={1} onChange={(w) => patch({ box: { ...layer.box, w: Math.max(1, w) } }, "Resize the box")} />
          <NumberBox label="Height" value={layer.box.h} min={1} onChange={(h) => patch({ box: { ...layer.box, h: Math.max(1, h) } }, "Resize the box")} />
          {layer.kind === "rect" && <NumberBox label="Corner radius" value={layer.radius ?? 0} min={0} onChange={(radius) => patch({ radius: Math.max(0, radius) }, "Change the radius")} />}
        </div>
      </PanelGroup>
      {layer.kind === "text" && layer.textStyle && (
        <PanelGroup title="Type">
          <div className="vx-fieldrow">
            <NumberBox label="Size" value={layer.textStyle.size} min={6} onChange={(size) => patch({ textStyle: { ...layer.textStyle!, size: Math.max(6, size) } }, "Change the type size")} />
            <NumberBox label="Weight" value={layer.textStyle.weight} step={50} min={100} max={900} onChange={(weight) => patch({ textStyle: { ...layer.textStyle!, weight: clamp(weight, 100, 900) } }, "Change the weight")} />
          </div>
          <FormField label="Align">
            <Select value={layer.textStyle.align} onChange={(event) => patch({ textStyle: { ...layer.textStyle!, align: event.target.value as "start" | "center" | "end" } }, "Align text")}>
              <option value="start">Start</option><option value="center">Centre</option><option value="end">End</option>
            </Select>
          </FormField>
        </PanelGroup>
      )}
      <PanelGroup title="Composition">
        <ColorBox label="Background" value={doc.background} onChange={(background) => handle.edit((current) => ({ ...current, background }), "Change the background")} />
      </PanelGroup>
    </Stack>
  );
}

function EffectsPanel({ handle, doc }: { handle: DocHandle<MotionDoc>; doc: MotionDoc }) {
  useStore(motionUi);
  const layer = selectedLayer(doc);
  if (!layer) return null;
  return (
    <Stack gap={3}>
      <PanelGroup title={`${layer.name} — effects`}>
        {EFFECT_PROPS.filter((property) => property !== "letterSpacing" || layer.kind === "text").map((property) => <PropertyRow key={property} handle={handle} doc={doc} layer={layer} property={property} />)}
        <p className="vx-mini">Blur exports exactly to CSS and video, approximately to SVG, and not at all to Lottie. Motion Export declares this before any file is written.</p>
      </PanelGroup>
      <PanelGroup title="Onion skin">
        <div className="vx-fieldrow">
          <NumberBox label="Frames before" value={doc.onionSkin.before} min={0} max={6} onChange={(before) => handle.edit((current) => ({ ...current, onionSkin: { ...current.onionSkin, before: clamp(Math.round(before), 0, 6) } }), "Onion skin")} />
          <NumberBox label="Frames after" value={doc.onionSkin.after} min={0} max={6} onChange={(after) => handle.edit((current) => ({ ...current, onionSkin: { ...current.onionSkin, after: clamp(Math.round(after), 0, 6) } }), "Onion skin")} />
        </div>
        <p className="vx-mini">Ghosts are drawn four frames apart when Onion skin is on in the toolbar.</p>
      </PanelGroup>
    </Stack>
  );
}

function PreviewPanel({ handle, doc, osReduced, showFull, setShowFull }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; osReduced: boolean; showFull: boolean; setShowFull: (next: boolean) => void }) {
  const ui = useStore(motionUi);
  return (
    <Stack gap={3}>
      <PanelGroup title="Playback">
        <Row gap={2} wrap>
          <Button size="sm" variant="primary" onClick={() => motionUi.set((current) => ({ ...current, time: 0, playing: true }))}>Play from the start</Button>
          <Button size="sm" variant={doc.loop ? "primary" : "ghost"} aria-pressed={doc.loop} onClick={() => handle.edit((current) => ({ ...current, loop: !current.loop }), doc.loop ? "Stop looping" : "Loop")}>Loop</Button>
        </Row>
        <p className="vx-mini">Plays at <span className="ds-num">{doc.fps}</span> fps from the wall clock; the transport shows the measured rate while playing.</p>
      </PanelGroup>
      <PanelGroup title="Reduced motion">
        {osReduced && (
          <Notice tone="info" title="This device asks for reduced motion">
            The preview shows the reduced-motion alternative by default.
            <div style={{ marginTop: 6 }}><Button size="sm" variant="secondary" onClick={() => setShowFull(!showFull)}>{showFull ? "Show the alternative again" : "Play the full motion once"}</Button></div>
          </Notice>
        )}
        <label className="ds-check">
          <input type="checkbox" checked={ui.reduceMotionPreview} onChange={(event) => motionUi.set((current) => ({ ...current, reduceMotionPreview: event.target.checked }))} />
          <span>Preview the reduced-motion alternative</span>
        </label>
        <FormField label="Alternative output">
          <Select value={doc.reducedMotion.strategy} onChange={(event) => handle.edit((current) => ({ ...current, reducedMotion: { ...current.reducedMotion, strategy: event.target.value as MotionDoc["reducedMotion"]["strategy"] } }), "Reduced-motion alternative")}>
            <option value="cross-fade">Cross-fade into the final frame</option>
            <option value="static-first-frame">Static first frame</option>
            <option value="none">None (the full motion plays)</option>
          </Select>
        </FormField>
        {doc.reducedMotion.strategy === "none" && <Notice tone="danger" title="No alternative">People who set reduced motion will get every movement. Exports say so in the file.</Notice>}
      </PanelGroup>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function KeyframeEditor({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const found = selectedKeyframe(doc);
  const [time, setTime] = useState(() => found?.keyframe.t ?? 0);
  const [value, setValue] = useState<number | string>(() => found?.keyframe.value ?? 0);
  const [easing, setEasingDraft] = useState<Easing>(() => found?.keyframe.easing ?? { kind: "linear" });
  const [error, setError] = useState<string | null>(null);
  if (!handle || !doc || !found) return <Notice tone="warning" title="Select a keyframe first">Click a keyframe on the timeline, or Tab to it, then open the editor.</Notice>;
  const points = easing.points ?? [0.25, 0.1, 0.25, 1];
  const span = found.next ? found.next.t - found.keyframe.t : 0;
  return (
    <form
      id="motion-keyframe"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (time < 0 || time > doc.duration) { setError(`The time must be between 0 and ${doc.duration}s.`); return; }
        if (found.property === "opacity" && (Number(value) < 0 || Number(value) > 1)) { setError("Opacity runs from 0 to 1."); return; }
        if (found.property === "colour" && !/^#[0-9a-f]{6}$/i.test(String(value))) { setError("A colour is a six-digit hex value such as #FFAE7C."); return; }
        handle.edit((current) => {
          let next = removeKeyframe(current, found.layer.id, found.property, found.keyframe.id);
          next = setKeyframe(next, found.layer.id, found.property, time, value, easing);
          return next;
        }, "Edit a keyframe");
        const t = Math.round(time * doc.fps) / doc.fps;
        motionUi.set((current) => ({ ...current, selectedKeyframeId: `kf-${found.layer.id}-${found.property}-${Math.round(t * 1000)}` }));
        close();
      }}
    >
      <p className="vx-mini">{found.layer.name} · {PROPERTY_LABEL[found.property]}. The easing shapes the segment from this keyframe to {found.next ? <>the next at <span className="ds-num">{found.next.t.toFixed(2)}s</span> ({span.toFixed(2)}s long)</> : "the end; the last keyframe's easing has no effect"}.</p>
      <Row gap={3} wrap>
        <NumberBox label="Frame" value={Math.round(time * doc.fps)} min={0} max={Math.round(doc.duration * doc.fps)} onChange={(frame) => setTime(clamp(frame, 0, doc.duration * doc.fps) / doc.fps)} />
        {found.property === "colour"
          ? <ColorBox label="Value" value={String(value)} onChange={setValue} />
          : <NumberBox label="Value" value={Number(value)} step={found.property === "opacity" || found.property === "scale" ? 0.05 : 1} onChange={setValue} />}
      </Row>
      <FormField label="Easing">
        <Select value={easing.kind === "bezier" ? (EASING_PRESETS.find((preset) => JSON.stringify(preset.easing) === JSON.stringify(easing))?.id ?? "custom") : easing.kind} onChange={(event) => {
          const preset = EASING_PRESETS.find((item) => item.id === event.target.value);
          if (preset) setEasingDraft(preset.easing);
        }}>
          {EASING_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          <option value="custom">Custom curve</option>
        </Select>
      </FormField>
      {easing.kind === "bezier" && (
        <>
          <EasingGraph easing={easing} size={220} onChange={setEasingDraft} label="Keyframe easing" />
          <div className="vx-fieldrow">
            {(["x1", "y1", "x2", "y2"] as const).map((name, index) => (
              <NumberBox key={name} label={name} value={points[index]} step={0.01} onChange={(next) => {
                const copy = [...points] as [number, number, number, number];
                copy[index] = index % 2 === 0 ? clamp(next, 0, 1) : clamp(next, -0.6, 1.6);
                setEasingDraft({ kind: "bezier", points: copy });
              }} />
            ))}
          </div>
          <code className="ds-num vx-mini">cubic-bezier({points.join(", ")})</code>
        </>
      )}
      {easing.kind === "spring" && (
        <div className="vx-fieldrow">
          {(["stiffness", "damping", "mass"] as const).map((name) => (
            <NumberBox key={name} label={name} value={easing.spring?.[name] ?? (name === "mass" ? 1 : name === "damping" ? 22 : 170)} step={name === "mass" ? 0.1 : 1} min={name === "mass" ? 0.1 : 1}
              onChange={(next) => setEasingDraft({ kind: "spring", spring: { stiffness: 170, damping: 22, mass: 1, ...easing.spring, [name]: Math.max(name === "mass" ? 0.1 : 1, next) } })} />
          ))}
        </div>
      )}
      {error && <Notice tone="danger" title="Not saved">{error}</Notice>}
      <Row gap={2}>
        <Button variant="outline-danger" icon={<Trash2 size={14} />} onClick={() => {
          handle.edit((current) => removeKeyframe(current, found.layer.id, found.property, found.keyframe.id), "Delete a keyframe");
          motionUi.set((current) => ({ ...current, selectedKeyframeId: undefined }));
          close();
        }}>Delete</Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" type="submit">Save the keyframe</Button>
      </Row>
    </form>
  );
}

export function LayerInspector({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const layer = selectedLayer(doc);
  const [draft, setDraft] = useState<MotionLayer | null>(() => (layer ? JSON.parse(JSON.stringify(layer)) as MotionLayer : null));
  const keyframes = useMemo(() => (layer ? Object.entries(layer.tracks).flatMap(([property, list]) => (list ?? []).map((keyframe) => ({ property: property as AnimatableProperty, keyframe }))) : []), [layer]);
  if (!handle || !doc || !layer || !draft) return <Notice tone="warning" title="Select a layer first">Choose a layer in the layer list.</Notice>;
  const end = sampleLayer(layer, doc.duration);
  return (
    <Stack gap={3}>
      <FormField label="Name"><TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>
      {draft.kind === "text" && <FormField label="Text"><TextInput value={draft.text ?? ""} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></FormField>}
      <div className="vx-fieldrow">
        <NumberBox label="X" value={draft.box.x} onChange={(x) => setDraft({ ...draft, box: { ...draft.box, x } })} />
        <NumberBox label="Y" value={draft.box.y} onChange={(y) => setDraft({ ...draft, box: { ...draft.box, y } })} />
        <NumberBox label="Width" value={draft.box.w} onChange={(w) => setDraft({ ...draft, box: { ...draft.box, w: Math.max(1, w) } })} />
        <NumberBox label="Height" value={draft.box.h} onChange={(h) => setDraft({ ...draft, box: { ...draft.box, h: Math.max(1, h) } })} />
      </div>
      <ColorBox label="Fill" value={draft.fill} onChange={(fill) => setDraft({ ...draft, fill })} />
      <Row gap={3}>
        <label className="ds-check"><input type="checkbox" checked={draft.visible} onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} /><span>Visible</span></label>
        <label className="ds-check"><input type="checkbox" checked={draft.locked} onChange={(event) => setDraft({ ...draft, locked: event.target.checked })} /><span>Locked</span></label>
      </Row>
      <FormField label="Linked asset">
        <Select value={draft.assetId ?? ""} onChange={(event) => setDraft({ ...draft, assetId: event.target.value || undefined })}>
          <option value="">None</option>
          {doc.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </Select>
      </FormField>
      <PanelGroup title={`Keyframes (${keyframes.length})`}>
        {keyframes.length === 0 ? <p className="vx-mini">Not animated yet.</p> : (
          <table className="ds-table">
            <thead><tr><th scope="col">Property</th><th scope="col">Time</th><th scope="col">Value</th><th scope="col">Easing</th></tr></thead>
            <tbody>
              {keyframes.sort((a, b) => a.keyframe.t - b.keyframe.t).map(({ property, keyframe }) => (
                <tr key={keyframe.id}><td>{PROPERTY_LABEL[property]}</td><td className="ds-num">{keyframe.t.toFixed(2)}s</td><td className="ds-num">{typeof keyframe.value === "number" ? keyframe.value.toFixed(2) : keyframe.value}</td><td>{keyframe.easing.kind}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <span className="vx-mini">Settles at x {end.x.toFixed(1)}, y {end.y.toFixed(1)}, scale {end.scale.toFixed(2)}, opacity {end.opacity.toFixed(2)}.</span>
      </PanelGroup>
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
        <Button variant="primary" onClick={() => {
          handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...draft, tracks: item.tracks } : item)) }), `Edit ${draft.name}`);
          close();
        }}>Apply to the layer</Button>
      </Row>
    </Stack>
  );
}

export function MotionPicker({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const layer = selectedLayer(doc);
  const ui = useStore(motionUi);
  const [presetId, setPresetId] = useState(MOTION_PRESETS[1].id);
  const [duration, setDuration] = useState(0.6);
  if (!handle || !doc || !layer) return <Notice tone="warning" title="Select a layer first">A motion preset writes keyframes onto one layer.</Notice>;
  const preset = MOTION_PRESETS.find((item) => item.id === presetId) ?? MOTION_PRESETS[0];
  const start = Math.min(ui.time, Math.max(0, doc.duration - 0.1));
  const preview = applyPreset(doc, layer.id, preset, start, Math.min(duration, doc.duration - start));
  return (
    <Stack gap={3}>
      <p className="vx-mini">Writes ordinary, editable keyframes onto <strong>{layer.name}</strong> from <span className="ds-num">{start.toFixed(2)}s</span>. Existing keyframes at the same times are replaced; others are kept.</p>
      <div role="group" aria-label="Motion presets" className="ds-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", display: "grid", gap: 8 }}>
        {MOTION_PRESETS.map((item) => (
          <button key={item.id} type="button" className="mo-preset" aria-pressed={item.id === presetId} onClick={() => setPresetId(item.id)}>
            <strong>{item.name}</strong>
            <span className="vx-mini">{item.description}</span>
          </button>
        ))}
      </div>
      <NumberBox label="Duration" suffix="s" value={duration} step={0.1} min={0.1} max={doc.duration} onChange={(next) => setDuration(clamp(next, 0.1, doc.duration))} />
      <Stage doc={preview} time={Math.min(doc.duration, start + Math.min(duration, doc.duration - start) * 0.5)} height={150} label={`${preset.name} halfway through, on ${layer.name}`} />
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => {
          handle.edit(preview, `Apply ${preset.name} to ${layer.name}`);
          close();
        }}>Apply {preset.name}</Button>
      </Row>
    </Stack>
  );
}

export function KeyboardHelp() {
  return <ShortcutTable rows={SHORTCUTS} />;
}
