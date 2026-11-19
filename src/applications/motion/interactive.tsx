import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard, MonitorSmartphone, MousePointer2, Plus, Trash2 } from "lucide-react";
import { Button, DataGrid, Empty, Notice, Pill, Row, Segmented, Select, Stack, TextInput } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { ColorBox, EditorFrame, NumberBox, PanelGroup, SaveState, downloadText, slug, useStore, type DocHandle } from "@/applications/visual/kit";
import { clamp, uid } from "@/applications/visual/geometry";
import {
  EASING_PRESETS, REST, easeAt, interact, stateValues, testTriggers, toInteractionHtml,
  type AnimatableProperty, type Easing, type InteractionInput, type InteractionState, type MotionDoc, type MotionLayer,
  type MotionState, type MotionTest, type SampledLayer, type Trigger, type TriggerEvent,
} from "./anim";
import { motionUi } from "./model";
import { LayerShape } from "./parts";
import { PROPERTY_LABEL } from "./editor";
import { MissingComposition, current, useMotionDoc, usePrefersReducedMotion, useSession, FormField } from "./shared";
import { clockIso, wallMs } from "@/platform/clock";

/* ====================================================================== *
 * ARL-MOTION-004 — Interactive Motion
 * ====================================================================== */

const STATE_PROPS: AnimatableProperty[] = ["x", "y", "scale", "rotation", "opacity", "colour"];

const EVENT_LABEL: Record<TriggerEvent, string> = { load: "Page load", hover: "Hover", click: "Click", scroll: "Scroll into view", key: "Key press" };

function stateName(doc: MotionDoc, id: string): string {
  return id === REST ? "Rest" : doc.states.find((state) => state.id === id)?.name ?? id;
}

/* ------------------------------ live preview ------------------------------ */

type Mode = "pointer" | "touch" | "keyboard";

function mix(a: SampledLayer, b: SampledLayer, amount: number): SampledLayer {
  const hex = (from: string, to: string) => {
    const parse = (value: string) => [1, 3, 5].map((offset) => Number.parseInt(value.replace("#", "").padEnd(6, "0").slice(offset - 1, offset + 1), 16));
    const x = parse(from); const y = parse(to);
    return `#${x.map((value, index) => Math.round(value + (y[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  };
  const lerp = (x: number, y: number) => x + (y - x) * amount;
  return { ...b, x: lerp(a.x, b.x), y: lerp(a.y, b.y), scale: lerp(a.scale, b.scale), rotation: lerp(a.rotation, b.rotation), opacity: lerp(a.opacity, b.opacity), colour: hex(a.colour, b.colour), letterSpacing: lerp(a.letterSpacing, b.letterSpacing), blur: lerp(a.blur, b.blur) };
}

/**
 * Hover, click, focus, keys, taps and scroll all go through the same
 * reducer the test uses; each layer then tweens to its new state with the
 * state's own duration and easing, frame by frame at the composition's rate.
 */
export function InteractivePreview({ doc, mode = "pointer", height = 300, reducedOverride, onState }: { doc: MotionDoc; mode?: Mode; height?: number | string; reducedOverride?: boolean; onState?: (state: InteractionState) => void }) {
  const osReduced = usePrefersReducedMotion();
  const reduced = reducedOverride ?? osReduced;
  const [state, setState] = useState<InteractionState>(() => interact(doc, {}, { kind: "load" }));
  const [shown, setShown] = useState<Record<string, SampledLayer>>(() => Object.fromEntries(doc.layers.map((layer) => [layer.id, stateValues(layer, REST, doc)])));
  const tweens = useRef<Record<string, { from: SampledLayer; to: SampledLayer; start: number; duration: number; easing: Easing }>>({});
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const raf = useRef(0);
  const [log, setLog] = useState<string[]>([]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = (input: InteractionInput, label: string) => {
    const before = stateRef.current;
    const next = interact(doc, before, input);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    stateRef.current = next;
    setState(next);
    setLog((items) => [`${label} → ${Object.entries(next).map(([id, value]) => `${doc.layers.find((layer) => layer.id === id)?.name ?? id}: ${stateName(doc, value)}`).join(", ")}`, ...items].slice(0, 6));
  };

  useEffect(() => { onState?.(state); }, [state, onState]);

  /* Retarget every layer whose state changed. */
  useEffect(() => {
    const now = performance.now();
    for (const layer of doc.layers) {
      const target = stateValues(layer, state[layer.id] ?? REST, doc);
      const transition = doc.states.find((item) => item.id === (state[layer.id] ?? REST)) ?? doc.states.find((item) => item.id === REST);
      const current = shownRef.current[layer.id] ?? target;
      tweens.current[layer.id] = { from: current, to: target, start: now, duration: reduced ? 0 : (transition?.duration ?? 0.25), easing: transition?.easing ?? { kind: "bezier", points: [0.2, 0, 0, 1] } };
    }
    const fps = doc.fps;
    let last = -1;
    const tick = (time: number) => {
      const frame = Math.floor((time / 1000) * fps);
      let busy = false;
      if (frame !== last) {
        last = frame;
        const next: Record<string, SampledLayer> = {};
        for (const [id, tween] of Object.entries(tweens.current)) {
          const progress = tween.duration <= 0 ? 1 : clamp((time - tween.start) / (tween.duration * 1000), 0, 1);
          if (progress < 1) busy = true;
          next[id] = mix(tween.from, tween.to, easeAt(tween.easing, progress));
        }
        setShown(next);
      } else busy = true;
      if (busy) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [state, doc, reduced]);

  const interactive = new Set(doc.triggers.filter((trigger) => trigger.on === "hover" || trigger.on === "click").map((trigger) => trigger.layerId));
  const hasScroll = doc.triggers.some((trigger) => trigger.on === "scroll");
  const keys = doc.triggers.filter((trigger) => trigger.on === "key" && trigger.keyboard);

  const onKey = (event: ReactKeyboardEvent, layerId?: string) => {
    if (layerId) {
      const key = event.key === " " ? "Space" : event.key;
      if (doc.triggers.some((trigger) => trigger.layerId === layerId && trigger.keyboard && trigger.keyboard.toLowerCase() === key.toLowerCase())) {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ kind: "key", layerId, key }, `${key} on ${doc.layers.find((layer) => layer.id === layerId)?.name}`);
        return;
      }
    }
    for (const trigger of keys) {
      if (trigger.keyboard!.toLowerCase() === event.key.toLowerCase()) dispatch({ kind: "key", layerId: trigger.layerId, key: event.key }, `Key ${event.key}`);
    }
  };

  const svg = (
    <svg
      viewBox={`0 0 ${doc.width} ${doc.height}`}
      style={{ display: "block", width: "100%", height, background: doc.background, borderRadius: 8 }}
      className="mo-interactive"
      role="group"
      aria-label="Interactive preview"
      data-testid="interactive-preview"
    >
      {doc.layers.filter((layer) => layer.visible).map((layer) => {
        const sampled = { ...(shown[layer.id] ?? stateValues(layer, REST, doc)), layer };
        /* Layers without their own trigger let input through to what is beneath, as a button's label does. */
        if (!interactive.has(layer.id)) return <g key={layer.id} pointerEvents="none"><LayerShape sampled={sampled} /></g>;
        const name = layer.text || layer.name;
        return (
          <g
            key={layer.id}
            data-state-layer={layer.id}
            data-state={state[layer.id] ?? REST}
            tabIndex={0}
            role="button"
            aria-label={`${name}, ${stateName(doc, state[layer.id] ?? REST)}`}
            onPointerEnter={(event) => { if (mode === "pointer" && event.pointerType !== "touch") dispatch({ kind: "pointerenter", layerId: layer.id }, `Hover ${layer.name}`); }}
            onPointerLeave={(event) => { if (mode === "pointer" && event.pointerType !== "touch") dispatch({ kind: "pointerleave", layerId: layer.id }, `Leave ${layer.name}`); }}
            onPointerUp={(event) => { if (mode === "touch" || event.pointerType === "touch") dispatch({ kind: "tap", layerId: layer.id }, `Tap ${layer.name}`); }}
            onClick={(event) => { if (mode === "pointer" && event.detail > 0) dispatch({ kind: "click", layerId: layer.id }, `Click ${layer.name}`); }}
            onFocus={() => dispatch({ kind: "focus", layerId: layer.id }, `Focus ${layer.name}`)}
            onBlur={() => dispatch({ kind: "blur", layerId: layer.id }, `Blur ${layer.name}`)}
            onKeyDown={(event) => onKey(event, layer.id)}
          >
            <LayerShape sampled={sampled} />
            <rect className="mo-focus" x={layer.box.x - 4} y={layer.box.y - 4} width={layer.box.w + 8} height={layer.box.h + 8} fill="transparent" stroke="transparent" strokeWidth={3} rx={6} />
          </g>
        );
      })}
    </svg>
  );

  return (
    <Stack gap={2}>
      <div onKeyDown={(event) => onKey(event)} style={mode === "keyboard" ? { pointerEvents: "none" } : undefined}>
        {hasScroll ? (
          <div
            className="mo-scroller"
            tabIndex={0}
            aria-label="Scrollable page; arrow keys or swipe scroll it"
            style={mode === "keyboard" ? { pointerEvents: "auto" } : undefined}
            onScroll={(event) => {
              const element = event.currentTarget;
              const progress = element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight);
              dispatch({ kind: "scroll", progress }, `Scroll ${(progress * 100).toFixed(0)}%`);
            }}
          >
            <div style={{ height: 180, display: "grid", placeItems: "center" }} className="vx-mini">Scroll down, or focus here and press the arrow keys</div>
            <div style={{ pointerEvents: mode === "keyboard" ? "none" : "auto" }}>{svg}</div>
            <div style={{ height: 200 }} />
          </div>
        ) : svg}
      </div>
      {reduced && <span className="vx-mini" role="status">Reduced motion is on: states change instantly, without the transition.</span>}
      <div className="vx-mini" aria-live="polite">{log[0] ?? "Hover, click, Tab, tap or scroll the preview."}</div>
    </Stack>
  );
}

/* ------------------------------ screen ------------------------------ */

export function InteractiveScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, doc } = useMotionDoc(context);
  const ui = useStore(motionUi);
  if (!record) return <div className="pg-body"><MissingComposition context={context} /></div>;
  const tab = context.tab || "States";
  const checks = doc ? testTriggers(doc) : [];
  const failing = checks.filter((check) => !check.keyboard || !check.touch).length;

  return (
    <EditorFrame
      context={context}
      lean
      actions={actions}
      tabs={[{ id: "States" }, { id: "Triggers" }, { id: "Preview" }, { id: "Export" }]}
      title={`${record.title} — interactions`}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{doc.states.length}</span> states · <span className="ds-num">{doc.triggers.length}</span> triggers</span>}{failing > 0 && <Pill tone="danger" dot>{failing} trigger{failing === 1 ? "" : "s"} without a keyboard or touch path</Pill>}</Row>}
      backTo={{ label: "Motion", to: `/o/${context.org.slug}/motion/projects` }}
      right={doc ? <TriggerChecks doc={doc} context={context} /> : null}
      rightLabel="Keyboard and touch"
      status={<><span>{ui.selectedTriggerId ? `Trigger selected` : "No trigger selected"}</span><span className="ds-grow" /><span>Every hover and click trigger needs a keyboard and a touch path</span></>}
    >
      <div className="mo-scroll" style={{ position: "absolute", inset: 0 }}>
        {doc && (
          <Stack gap={3} style={{ padding: "var(--space-3)" }}>
            {tab === "States" && <StatesTab handle={handle} doc={doc} context={context} />}
            {tab === "Triggers" && <TriggersTab doc={doc} context={context} />}
            {tab === "Preview" && (
              <Stack gap={2}>
                <Notice tone="info" title="This preview is live">It responds to hover, click, Tab and Enter, taps and scrolling through the same rules the export and the test use.</Notice>
                <InteractivePreview doc={doc} />
                <Button size="sm" variant="secondary" icon={<MonitorSmartphone size={14} />} onClick={() => context.openOverlay("device preview")}>Device preview</Button>
              </Stack>
            )}
            {tab === "Export" && <ExportTab doc={doc} title={record.title} context={context} />}
          </Stack>
        )}
      </div>
    </EditorFrame>
  );
}

function StatesTab({ handle, doc, context }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; context: ScreenContext }) {
  const ui = useStore(motionUi);
  const selected = ui.selectedStateId ?? doc.states.find((state) => state.id !== REST)?.id;
  const [name, setName] = useState("");
  const shownDoc = useMemo(() => doc, [doc]);
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Segmented
          label="State"
          value={selected ?? REST}
          options={[{ value: REST, label: "Rest" }, ...doc.states.filter((state) => state.id !== REST).map((state) => ({ value: state.id, label: state.name }))]}
          onChange={(value) => motionUi.set((current) => ({ ...current, selectedStateId: value }))}
        />
        <span className="ds-grow" />
        <Button size="sm" variant="secondary" disabled={!selected || selected === REST} onClick={() => context.openOverlay("State inspector")}>State inspector</Button>
      </Row>
      <StaticState doc={shownDoc} state={selected ?? REST} />
      <Row gap={2} wrap style={{ alignItems: "flex-end" }}>
        <FormField label="New state">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Pressed" />
        </FormField>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!name.trim() || doc.states.some((state) => state.name.toLowerCase() === name.trim().toLowerCase())} onClick={() => {
          const id = slug(name.trim());
          handle.edit((current) => ({ ...current, states: [...current.states, { id, name: name.trim(), duration: 0.25, easing: { kind: "bezier", points: [0.2, 0, 0, 1] } }] }), `Add the state ${name.trim()}`);
          motionUi.set((current) => ({ ...current, selectedStateId: id }));
          setName("");
        }}>Add the state</Button>
      </Row>
      <p className="vx-mini">Rest is how each layer settles at the end of the timeline. A state overrides some of its properties; the State inspector sets which and to what.</p>
    </Stack>
  );
}

function StaticState({ doc, state }: { doc: MotionDoc; state: string }) {
  return (
    <svg viewBox={`0 0 ${doc.width} ${doc.height}`} role="img" aria-label={`Every layer in the ${stateName(doc, state)} state`} style={{ display: "block", width: "100%", height: 260, background: doc.background, borderRadius: 8 }}>
      {doc.layers.filter((layer) => layer.visible).map((layer) => <LayerShape key={layer.id} sampled={{ ...stateValues(layer, state, doc), layer }} />)}
    </svg>
  );
}

interface TriggerRow extends Trigger { layerName: string; stateLabel: string }

function TriggersTab({ doc, context }: { doc: MotionDoc; context: ScreenContext }) {
  const ui = useStore(motionUi);
  const rows: TriggerRow[] = doc.triggers.map((trigger) => ({ ...trigger, layerName: doc.layers.find((layer) => layer.id === trigger.layerId)?.name ?? "missing layer", stateLabel: stateName(doc, trigger.state) }));
  return (
    <DataGrid<TriggerRow>
      label="Triggers"
      rows={rows}
      rowId={(row) => row.id}
      selectedId={ui.selectedTriggerId}
      onSelect={(id) => motionUi.set((current) => ({ ...current, selectedTriggerId: id }))}
      rowTone={(row) => ((row.on === "hover" || row.on === "click" || row.on === "scroll") && (!row.keyboard || !row.touch) ? "danger" : undefined)}
      empty={<Empty title="No triggers" icon={<MousePointer2 size={18} />} action={<Button variant="primary" onClick={() => context.openOverlay("bind trigger")}>Bind a trigger</Button>}>A trigger moves a layer to a state when something happens: hover, click, a key, scrolling into view, or the page loading.</Empty>}
      columns={[
        { key: "on", header: "When", primary: true, cell: (row) => EVENT_LABEL[row.on], sortValue: (row) => row.on },
        { key: "layer", header: "Layer", cell: (row) => row.layerName, sortValue: (row) => row.layerName },
        { key: "state", header: "Goes to", cell: (row) => row.stateLabel },
        { key: "keyboard", header: "Keyboard", cell: (row) => (row.keyboard ? <code className="ds-num">{row.keyboard}</code> : row.on === "load" ? "—" : <Pill tone="danger">none</Pill>) },
        { key: "touch", header: "Touch", cell: (row) => (row.touch ? "tap" : row.on === "load" ? "—" : <Pill tone="danger">none</Pill>) },
        { key: "returns", header: "Ends", cell: (row) => (row.on === "hover" || row.on === "scroll" ? (row.returnOnEnd === false ? "stays" : "returns to rest") : "toggles"), hideBelow: 800 },
      ]}
    />
  );
}

function TriggerChecks({ doc, context }: { doc: MotionDoc; context: ScreenContext }) {
  const checks = testTriggers(doc);
  const latest = doc.tests.find((test) => test.kind === "interaction");
  return (
    <Stack gap={3}>
      <PanelGroup title="Paths to each state">
        {checks.length === 0 && <p className="vx-mini">No triggers yet.</p>}
        {checks.map((check) => (
          <div key={check.triggerId} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <strong style={{ fontSize: "var(--text-xs)" }}>{check.label}</strong>
            <Row gap={1} wrap>
              <Pill tone={check.pointer ? "success" : "danger"}>pointer {check.pointer ? "✓" : "✗"}</Pill>
              <Pill tone={check.keyboard ? "success" : "danger"}>keyboard {check.keyboard ? "✓" : "✗"}</Pill>
              <Pill tone={check.touch ? "success" : "danger"}>touch {check.touch ? "✓" : "✗"}</Pill>
            </Row>
            <span className="vx-mini">Keyboard: {check.keyboardHow}. Touch: {check.touchHow}.</span>
          </div>
        ))}
        {checks.some((check) => !check.keyboard || !check.touch) && <Button size="sm" variant="secondary" onClick={() => context.openOverlay("interaction guard")}>Fix in the interaction guard</Button>}
      </PanelGroup>
      <PanelGroup title="Last test">
        {latest ? <Stack gap={1}><Pill tone={latest.pass ? "success" : "danger"} dot>{latest.pass ? "passed" : "failed"}</Pill><span className="vx-mini">{latest.by} · {context.dateTime(latest.at)}</span><ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "var(--text-xs)" }}>{latest.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul></Stack> : <p className="vx-mini">Not tested. Test drives every trigger through pointer, keyboard and touch input.</p>}
      </PanelGroup>
    </Stack>
  );
}

function ExportTab({ doc, title, context }: { doc: MotionDoc; title: string; context: ScreenContext }) {
  const html = useMemo(() => toInteractionHtml(doc, title), [doc, title]);
  return (
    <Stack gap={2}>
      <Row gap={2} wrap>
        <Pill><span className="ds-num">{(new Blob([html]).size / 1024).toFixed(1)} KB</span></Pill>
        <span className="vx-mini">A single HTML file: CSS transitions for each state, and a short script that wires the same triggers, including focus, keys, taps and scroll. Reduced motion makes the transitions instant.</span>
        <span className="ds-grow" />
        <Button size="sm" variant="primary" onClick={() => exportInteractions(context)}>Export the HTML</Button>
      </Row>
      <pre className="ds-panel" style={{ maxHeight: 360, overflow: "auto", fontSize: 11, padding: 12, whiteSpace: "pre" }} tabIndex={0} aria-label="Interaction export source">{html}</pre>
    </Stack>
  );
}

/* ------------------------------ action helpers ------------------------------ */

/** Write the interaction HTML file and record it in the composition's render history. */
export function exportInteractions(context: ScreenContext): void {
  const open = current();
  if (!open) return;
  const { name, bytes } = downloadInteractionHtml(open.doc, open.title);
  open.handle.edit((doc) => ({
    ...doc,
    renders: [{ id: uid("rnd"), at: clockIso(), by: context.actor, format: "html-interactions", state: "done", artifact: name, bytes, note: `${doc.triggers.length} trigger(s), ${doc.states.length} state(s). Downloaded to this device.` }, ...doc.renders],
  }), "Export the interactions");
  context.toast("Interactions exported", `${name} (${(bytes / 1024).toFixed(1)} KB) was written by this browser. It is listed in the render history.`);
}

export function recordInteractionTest(handle: DocHandle<MotionDoc>, actor: string): MotionTest | null {
  const doc = handle.doc;
  if (!doc) return null;
  const checks = testTriggers(doc);
  const failing = checks.filter((check) => !check.pointer || !check.keyboard || !check.touch);
  const test: MotionTest = {
    id: `test-${wallMs().toString(36)}`, kind: "interaction", at: clockIso(), by: actor,
    pass: failing.length === 0,
    findings: checks.length === 0 ? ["No triggers to test."] : checks.map((check) => `${check.label}: pointer ${check.pointer ? "reaches" : "does not reach"}, keyboard ${check.keyboard ? `reaches (${check.keyboardHow})` : "does not reach"}, touch ${check.touch ? `reaches (${check.touchHow})` : "does not reach"} the state.`),
  };
  handle.edit((current) => ({ ...current, tests: [test, ...current.tests].slice(0, 30) }), test.pass ? "Interaction test passed" : "Interaction test failed");
  return test;
}

/* ------------------------------ overlays ------------------------------ */

const KEY_CHOICES = ["Enter", "Space", "Escape", "ArrowDown", "ArrowUp", "m", "p"];

export function BindTrigger({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const [on, setOn] = useState<TriggerEvent>("hover");
  const [layerId, setLayerId] = useState(() => doc?.layers.find((layer) => layer.kind !== "text")?.id ?? doc?.layers[0]?.id ?? "");
  const [state, setState] = useState(() => doc?.states.find((item) => item.id !== REST)?.id ?? "");
  const [keyboard, setKeyboard] = useState("Focus");
  const [touch, setTouch] = useState(true);
  const [returnOnEnd, setReturnOnEnd] = useState(true);
  const [error, setError] = useState<string | null>(null);
  if (!handle || !doc) return null;
  const states = doc.states.filter((item) => item.id !== REST);
  const keyboardOptions = on === "hover" ? ["Focus"] : on === "scroll" ? ["Arrow keys"] : on === "load" ? [] : KEY_CHOICES;
  return (
    <form className="ds-stack ds-gap-3" onSubmit={(event) => {
      event.preventDefault();
      if (!layerId) { setError("Choose a layer."); return; }
      if (!state) { setError("Add a state on the States tab first; a trigger moves a layer to a state."); return; }
      if (on !== "load" && !keyboard) { setError("A keyboard equivalent is required. Choose how someone without a pointer reaches this state."); return; }
      if (on !== "load" && on !== "key" && !touch) { setError("A touch equivalent is required. Hover does not exist on a touch screen."); return; }
      const trigger: Trigger = { id: uid("trg"), on, layerId, state, keyboard: on === "load" ? undefined : keyboard, touch: on === "load" ? undefined : touch, returnOnEnd: on === "hover" || on === "scroll" ? returnOnEnd : undefined, note: "" };
      handle.edit((current) => ({ ...current, triggers: [...current.triggers, trigger] }), `Bind ${EVENT_LABEL[on].toLowerCase()} on ${doc.layers.find((layer) => layer.id === layerId)?.name}`);
      motionUi.set((current) => ({ ...current, selectedTriggerId: trigger.id }));
      close();
    }}>
      <Row gap={3} wrap>
        <FormField label="When">
          <Select value={on} onChange={(event) => { const next = event.target.value as TriggerEvent; setOn(next); setKeyboard(next === "hover" ? "Focus" : next === "scroll" ? "Arrow keys" : next === "load" ? "" : "Enter"); }}>
            {(Object.keys(EVENT_LABEL) as TriggerEvent[]).map((event) => <option key={event} value={event}>{EVENT_LABEL[event]}</option>)}
          </Select>
        </FormField>
        <FormField label="Layer">
          <Select value={layerId} onChange={(event) => setLayerId(event.target.value)}>
            {doc.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Goes to state">
          <Select value={state} onChange={(event) => setState(event.target.value)}>
            {states.length === 0 && <option value="">No states yet</option>}
            {states.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </FormField>
      </Row>
      {on !== "load" && (
        <Row gap={3} wrap style={{ alignItems: "flex-end" }}>
          <FormField label="Keyboard equivalent" hint={on === "hover" ? "Focus reaches the hover state with Tab." : on === "scroll" ? "The scroll region is focusable and the arrow keys scroll it." : "The key that toggles the state when the layer has focus."}>
            <Select value={keyboard} onChange={(event) => setKeyboard(event.target.value)}>
              <option value="">None</option>
              {keyboardOptions.map((key) => <option key={key} value={key}>{key}</option>)}
            </Select>
          </FormField>
          <label className="ds-check"><input type="checkbox" checked={touch} onChange={(event) => setTouch(event.target.checked)} /><span>{on === "scroll" ? "Swipe scrolls it" : on === "key" ? "An on-screen control for touch" : "A tap toggles it"}</span></label>
          {(on === "hover" || on === "scroll") && <label className="ds-check"><input type="checkbox" checked={returnOnEnd} onChange={(event) => setReturnOnEnd(event.target.checked)} /><span>Return to rest when it ends</span></label>}
        </Row>
      )}
      {error && <Notice tone="danger" title="Not bound">{error}</Notice>}
      <Row gap={2}><span className="ds-grow" /><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit">Bind the trigger</Button></Row>
    </form>
  );
}

export function StateInspector({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const ui = useStore(motionUi);
  const stateId = ui.selectedStateId ?? doc?.states.find((item) => item.id !== REST)?.id;
  const state = doc?.states.find((item) => item.id === stateId);
  const [draft, setDraft] = useState<{ state: MotionState; layers: Record<string, Partial<Record<AnimatableProperty, number | string>>> } | null>(() => (doc && state ? { state: { ...state }, layers: Object.fromEntries(doc.layers.map((layer) => [layer.id, { ...(layer.states?.[state.id] ?? {}) }])) } : null));
  if (!handle || !doc || !state || !draft) return <Notice tone="warning" title="Choose a state first">Select a state other than Rest on the States tab.</Notice>;
  const setValue = (layer: MotionLayer, property: AnimatableProperty, value: number | string | undefined) => {
    const next = { ...draft.layers[layer.id] };
    if (value === undefined) delete next[property]; else next[property] = value;
    setDraft({ ...draft, layers: { ...draft.layers, [layer.id]: next } });
  };
  return (
    <Stack gap={3}>
      <Row gap={3} wrap>
        <FormField label="Name"><TextInput value={draft.state.name} onChange={(event) => setDraft({ ...draft, state: { ...draft.state, name: event.target.value } })} /></FormField>
        <NumberBox label="Transition" suffix="s" value={draft.state.duration ?? 0.25} step={0.05} min={0} onChange={(duration) => setDraft({ ...draft, state: { ...draft.state, duration: clamp(duration, 0, 5) } })} />
        <FormField label="Easing">
          <Select value={EASING_PRESETS.find((preset) => JSON.stringify(preset.easing) === JSON.stringify(draft.state.easing))?.id ?? "emphasis"} onChange={(event) => setDraft({ ...draft, state: { ...draft.state, easing: EASING_PRESETS.find((preset) => preset.id === event.target.value)?.easing } })}>
            {EASING_PRESETS.filter((preset) => preset.easing.kind !== "spring").map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </Select>
        </FormField>
      </Row>
      {doc.layers.map((layer) => {
        const rest = stateValues(layer, REST, doc);
        return (
          <PanelGroup key={layer.id} title={layer.name}>
            {STATE_PROPS.map((property) => {
              const overridden = draft.layers[layer.id]?.[property];
              const restValue = property === "colour" ? rest.colour : Number(rest[property as Exclude<AnimatableProperty, "colour">]);
              return (
                <Row key={property} gap={2} style={{ alignItems: "flex-end" }}>
                  <label className="ds-check" style={{ minWidth: 120 }}>
                    <input type="checkbox" checked={overridden !== undefined} onChange={(event) => setValue(layer, property, event.target.checked ? restValue : undefined)} />
                    <span>{PROPERTY_LABEL[property]}</span>
                  </label>
                  {overridden !== undefined && (property === "colour"
                    ? <ColorBox label={`${layer.name} ${PROPERTY_LABEL[property]}`} value={String(overridden)} onChange={(value) => setValue(layer, property, value)} />
                    : <NumberBox label={`${layer.name} ${PROPERTY_LABEL[property]}`} value={Number(overridden)} step={property === "scale" || property === "opacity" ? 0.05 : 1} onChange={(value) => setValue(layer, property, value)} />)}
                  {overridden === undefined && <span className="vx-mini">as rest: <span className="ds-num">{typeof restValue === "number" ? restValue.toFixed(2) : restValue}</span></span>}
                </Row>
              );
            })}
          </PanelGroup>
        );
      })}
      <Row gap={2}>
        <Button variant="outline-danger" icon={<Trash2 size={14} />} onClick={() => {
          handle.edit((current) => ({
            ...current,
            states: current.states.filter((item) => item.id !== state.id),
            triggers: current.triggers.filter((trigger) => trigger.state !== state.id),
            layers: current.layers.map((layer) => { const states = { ...(layer.states ?? {}) }; delete states[state.id]; return { ...layer, states }; }),
          }), `Delete the state ${state.name}`);
          motionUi.set((current) => ({ ...current, selectedStateId: undefined }));
          close();
        }}>Delete the state and its triggers</Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => {
          handle.edit((current) => ({
            ...current,
            states: current.states.map((item) => (item.id === state.id ? draft.state : item)),
            layers: current.layers.map((layer) => ({ ...layer, states: { ...(layer.states ?? {}), [state.id]: draft.layers[layer.id] ?? {} } })),
          }), `Edit the state ${draft.state.name}`);
          close();
        }}>Save the state</Button>
      </Row>
    </Stack>
  );
}

export function InteractionGuard({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  if (!handle || !doc) return null;
  const checks = testTriggers(doc);
  const failing = checks.filter((check) => !check.keyboard || !check.touch);
  const fix = (triggerId: string, change: Partial<Trigger>, label: string) => handle.edit((current) => ({ ...current, triggers: current.triggers.map((trigger) => (trigger.id === triggerId ? { ...trigger, ...change } : trigger)) }), label);
  return (
    <Stack gap={3}>
      <p>Hover does not exist on touch screens and cannot be reached without a pointer. Every interactive state must be reachable by keyboard and by touch before this composition is exported.</p>
      {failing.length === 0 ? <Notice tone="success" title="Every trigger has a keyboard and a touch path">The test drives each one three ways and each reaches its state.</Notice> : failing.map((check) => {
        const trigger = doc.triggers.find((item) => item.id === check.triggerId)!;
        return (
          <div key={check.triggerId} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <strong>{check.label}</strong>
            <Row gap={2} wrap style={{ marginTop: 6 }}>
              {!check.keyboard && trigger.on === "hover" && <Button size="sm" variant="secondary" icon={<Keyboard size={14} />} onClick={() => fix(trigger.id, { keyboard: "Focus" }, "Focus reaches the hover state")}>Focus reaches it</Button>}
              {!check.keyboard && (trigger.on === "click" || trigger.on === "key") && <Button size="sm" variant="secondary" icon={<Keyboard size={14} />} onClick={() => fix(trigger.id, { keyboard: "Enter" }, "Enter toggles the state")}>Enter toggles it</Button>}
              {!check.keyboard && trigger.on === "scroll" && <Button size="sm" variant="secondary" icon={<Keyboard size={14} />} onClick={() => fix(trigger.id, { keyboard: "Arrow keys" }, "Arrow keys scroll the region")}>Arrow keys scroll it</Button>}
              {!check.touch && <Button size="sm" variant="secondary" onClick={() => fix(trigger.id, { touch: true }, "A tap reaches the state")}>{trigger.on === "scroll" ? "Swipe scrolls it" : "A tap toggles it"}</Button>}
              <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, triggers: current.triggers.filter((item) => item.id !== trigger.id) }), "Remove an unreachable trigger")}>Remove the trigger</Button>
            </Row>
          </div>
        );
      })}
      <Row gap={2}><span className="ds-grow" /><Button variant="primary" onClick={close}>Done</Button></Row>
    </Stack>
  );
}

const DEVICES: { id: Mode; label: string; width: number; note: string; icon: React.ReactNode }[] = [
  { id: "pointer", label: "Desktop, mouse", width: 640, note: "Hover and click; Tab still works.", icon: <MousePointer2 size={14} /> },
  { id: "touch", label: "Phone, touch", width: 300, note: "No hover. A pointer press counts as a tap.", icon: <MonitorSmartphone size={14} /> },
  { id: "keyboard", label: "Keyboard only", width: 640, note: "Pointer input is ignored; Tab, Enter and the arrow keys only.", icon: <Keyboard size={14} /> },
];

export function DevicePreview() {
  const { doc } = useSession();
  const [mode, setMode] = useState<Mode>("touch");
  const [reduced, setReduced] = useState(false);
  if (!doc) return null;
  const device = DEVICES.find((item) => item.id === mode)!;
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Segmented label="Device" value={mode} options={DEVICES.map((item) => ({ value: item.id, label: item.label }))} onChange={setMode} />
        <label className="ds-check"><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} /><span>Reduced motion</span></label>
      </Row>
      <span className="vx-mini">{device.note}</span>
      <div className="mo-device" style={{ width: device.width }}>
        <InteractivePreview key={`${mode}-${reduced}`} doc={doc} mode={mode} height={mode === "touch" ? 170 : 300} reducedOverride={reduced} />
      </div>
    </Stack>
  );
}

export function RemoveTrigger({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const ui = useStore(motionUi);
  const trigger = doc?.triggers.find((item) => item.id === ui.selectedTriggerId);
  if (!handle || !doc || !trigger) return <Notice tone="warning" title="Select a trigger first">Choose one on the Triggers tab.</Notice>;
  const layer = doc.layers.find((item) => item.id === trigger.layerId);
  return (
    <Stack gap={3}>
      <p>Remove <strong>{EVENT_LABEL[trigger.on].toLowerCase()} on {layer?.name}</strong>, which moves it to <strong>{stateName(doc, trigger.state)}</strong>? The state itself is kept. Undo brings the trigger back.</p>
      <Row gap={2}><span className="ds-grow" /><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="danger" onClick={() => {
          handle.edit((current) => ({ ...current, triggers: current.triggers.filter((item) => item.id !== trigger.id) }), `Remove the ${trigger.on} trigger on ${layer?.name}`);
          motionUi.set((current) => ({ ...current, selectedTriggerId: undefined }));
          close();
        }}>Remove the trigger</Button>
      </Row>
    </Stack>
  );
}

export function downloadInteractionHtml(doc: MotionDoc, title: string): { name: string; bytes: number } {
  const html = toInteractionHtml(doc, title);
  const name = `${slug(title)}-interactions.html`;
  downloadText(name, html, "text/html");
  return { name, bytes: new Blob([html]).size };
}
