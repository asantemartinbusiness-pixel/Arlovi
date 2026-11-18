import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Notice, Pill, Row, Select, Stack, TextArea } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { EditorFrame, NumberBox, PanelGroup, SaveState, useStore, type DocHandle } from "@/applications/visual/kit";
import { clamp, springValue } from "@/applications/visual/geometry";
import {
  EASING_PRESETS, accessibilityFindings, closeLoop, easeAt, layerSpan, loopSeams, retime, sampleTrack, setEasing, shiftLayer,
  type AnimatableProperty, type Easing, type Keyframe, type MotionDoc, type MotionTest,
} from "./anim";
import { motionUi } from "./model";
import { EasingGraph, Stage, TransportRow } from "./parts";
import { PROPERTY_LABEL, editorKeys, selectedKeyframe } from "./editor";
import { MissingComposition, useMotionDoc, usePrefersReducedMotion, useSession, FormField } from "./shared";
import { clockIso, wallMs } from "@/platform/clock";

/* ====================================================================== *
 * ARL-MOTION-003 — Easing & Timing
 * ====================================================================== */

interface Segment { layerId: string; layer: string; property: AnimatableProperty; from: Keyframe; to: Keyframe }

export function segments(doc: MotionDoc): Segment[] {
  const out: Segment[] = [];
  for (const layer of doc.layers) {
    for (const [property, keyframes] of Object.entries(layer.tracks) as [AnimatableProperty, Keyframe[] | undefined][]) {
      const sorted = [...(keyframes ?? [])].sort((a, b) => a.t - b.t);
      for (let index = 0; index < sorted.length - 1; index += 1) out.push({ layerId: layer.id, layer: layer.name, property, from: sorted[index], to: sorted[index + 1] });
    }
  }
  return out.sort((a, b) => a.from.t - b.from.t);
}

function easingName(easing: Easing): string {
  const preset = EASING_PRESETS.find((item) => JSON.stringify(item.easing) === JSON.stringify(easing));
  if (preset) return preset.name;
  if (easing.kind === "bezier") return `cubic-bezier(${(easing.points ?? []).join(", ")})`;
  if (easing.kind === "spring") return `spring ${easing.spring?.stiffness}/${easing.spring?.damping}`;
  return easing.kind;
}

/** Run the frame-by-frame motion test, record it, and require a review when it fails. */
export function runMotionTest(handle: DocHandle<MotionDoc>, actor: string): MotionTest | null {
  const doc = handle.doc;
  if (!doc) return null;
  const findings = accessibilityFindings(doc);
  const serious = findings.filter((finding) => finding.severity !== "info");
  const test: MotionTest = {
    id: `test-${wallMs().toString(36)}`, kind: "accessibility", at: clockIso(), by: actor,
    pass: serious.length === 0,
    findings: findings.length ? findings.map((finding) => `${finding.severity}: ${finding.title}. ${finding.detail}`) : ["No flashing, large-area travel, fast zoom or unreachable trigger found."],
  };
  handle.edit((current) => ({
    ...current,
    tests: [test, ...current.tests].slice(0, 30),
    review: serious.length > 0
      ? { state: "required", reasons: serious.map((finding) => finding.title), requestedAt: test.at }
      : current.review.state === "required" ? { state: "not_required", reasons: [] } : current.review,
  }), serious.length ? "Motion test failed: review required" : "Motion test passed");
  return test;
}

export function EasingScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, doc, playback } = useMotionDoc(context);
  const ui = useStore(motionUi);
  if (!record) return <div className="pg-body"><MissingComposition context={context} /></div>;
  const tab = context.tab || "Curves";
  const list = doc ? segments(doc) : [];
  const picked = selectedKeyframe(doc);

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Curves" }, { id: "Timing" }, { id: "Presets" }, { id: "Spring" }]}
      title={`${record.title} — easing and timing`}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} />{doc && <span><span className="ds-num">{doc.duration}s</span> · <span className="ds-num">{doc.fps}</span> fps · {doc.loop ? "loops" : "plays once"}</span>}{doc?.review.state === "required" && <Pill tone="danger" dot>Accessibility review required</Pill>}</Row>}
      backTo={{ label: "Motion", to: `/o/${context.org.slug}/motion/projects` }}
      left={
        <Stack gap={1}>
          {list.length === 0 && <p className="vx-mini">No segments yet: a segment is the stretch between two keyframes of one property.</p>}
          {list.map((segment) => (
            <button
              key={segment.from.id}
              type="button"
              className="mo-layer"
              data-selected={picked?.keyframe.id === segment.from.id}
              style={{ width: "100%", textAlign: "start", border: 0, background: picked?.keyframe.id === segment.from.id ? undefined : "transparent", display: "grid", gap: 0 }}
              onClick={() => motionUi.set((current) => ({ ...current, selectedLayerId: segment.layerId, selectedProperty: segment.property, selectedKeyframeId: segment.from.id, time: segment.from.t }))}
            >
              <span>{segment.layer} · {PROPERTY_LABEL[segment.property]}</span>
              <span className="vx-mini"><span className="ds-num">{segment.from.t.toFixed(2)}→{segment.to.t.toFixed(2)}s</span> · {easingName(segment.from.easing)}</span>
            </button>
          ))}
        </Stack>
      }
      leftLabel="Segments"
      right={doc ? <ReviewPanel handle={handle} doc={doc} context={context} /> : null}
      rightLabel="Accessibility"
      status={<><span className="ds-num">{ui.time.toFixed(2)}s</span>{picked && <span>{picked.layer.name} · {PROPERTY_LABEL[picked.property]} · {easingName(picked.keyframe.easing)}</span>}<span className="ds-grow" /><span>Arrow keys on a curve handle move it · Space plays</span></>}
    >
      <div className="mo-scroll" style={{ position: "absolute", inset: 0, outline: "none" }} tabIndex={-1} onKeyDown={(event) => editorKeys(event, handle, context)}>
        {doc && (
          <Stack gap={3} style={{ padding: "var(--space-3)" }}>
            <div style={{ background: "var(--graphite-900)", borderRadius: 8, padding: 8 }}>
              <Stage doc={doc} time={ui.time} height={200} />
            </div>
            <TransportRow doc={doc} fps={playback.fps} />
            {tab === "Curves" && <CurvesTab handle={handle} doc={doc} context={context} />}
            {tab === "Timing" && <TimingTab handle={handle} doc={doc} />}
            {tab === "Presets" && <PresetsTab handle={handle} doc={doc} />}
            {tab === "Spring" && <SpringTab handle={handle} doc={doc} />}
          </Stack>
        )}
      </div>
    </EditorFrame>
  );
}

function CurvesTab({ handle, doc, context }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; context: ScreenContext }) {
  const ui = useStore(motionUi);
  const picked = selectedKeyframe(doc);
  if (!picked || !picked.next) return <Notice title="Choose a segment">Pick a segment on the left. Its curve appears here with draggable handles; arrow keys move a focused handle.</Notice>;
  const progress = clamp((ui.time - picked.keyframe.t) / Math.max(0.001, picked.next.t - picked.keyframe.t), 0, 1);
  const easing = picked.keyframe.easing;
  return (
    <Row gap={4} wrap style={{ alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 280px", maxWidth: 420 }}>
        {easing.kind === "bezier"
          ? <EasingGraph easing={easing} size={260} progress={progress} label={`${picked.layer.name} ${PROPERTY_LABEL[picked.property]} easing`} onChange={(next) => handle.live((current) => setEasing(current, picked.layer.id, picked.property, picked.keyframe.id, next))} onCommit={handle.beginGesture} />
          : <EasingGraph easing={easing} size={260} progress={progress} onChange={() => {}} label={`${easing.kind} easing (no handles)`} />}
      </div>
      <Stack gap={2} style={{ flex: "1 1 220px" }}>
        <Pill tone="info"><span className="ds-num">{easingName(easing)}</span></Pill>
        <span className="vx-mini">The aqua dot is the value at the playhead: <span className="ds-num">{(easeAt(easing, progress) * 100).toFixed(0)}%</span> of the change at <span className="ds-num">{(progress * 100).toFixed(0)}%</span> of the time.</span>
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Curve editor")}>Open the curve editor</Button>
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("timing preview")}>Timing preview</Button>
          <Button size="sm" variant="ghost" onClick={() => handle.beginGesture()}>Commit the drag as one undo step</Button>
        </Row>
        <span className="vx-mini">Dragging a handle edits live; the change is saved with the composition and undo takes it back.</span>
      </Stack>
    </Row>
  );
}

/** Rank layers by how much they weigh visually: type size, then area. A rule, not a model. */
function hierarchyOrder(doc: MotionDoc): string[] {
  return [...doc.layers]
    .filter((layer) => Object.values(layer.tracks).some((keyframes) => (keyframes?.length ?? 0) > 0))
    .sort((a, b) => {
      const weight = (layer: typeof a) => (layer.kind === "text" ? (layer.textStyle?.size ?? 32) * 1000 : 0) + layer.box.w * layer.box.h;
      return weight(b) - weight(a);
    })
    .map((layer) => layer.id);
}

function TimingTab({ handle, doc }: { handle: DocHandle<MotionDoc>; doc: MotionDoc }) {
  const ui = useStore(motionUi);
  const [length, setLength] = useState(doc.duration);
  const [scale, setScale] = useState(true);
  const px = 100 / Math.max(doc.duration, 0.01);
  const toggleStagger = (id: string) => motionUi.set((current) => ({ ...current, staggerIds: current.staggerIds.includes(id) ? current.staggerIds.filter((item) => item !== id) : [...current.staggerIds, id] }));
  return (
    <Stack gap={4}>
      <PanelGroup title="Duration">
        <Row gap={3} wrap style={{ alignItems: "flex-end" }}>
          <NumberBox label="Length" suffix="s" value={length} step={0.1} min={0.2} onChange={setLength} />
          <label className="ds-check"><input type="checkbox" checked={scale} onChange={(event) => setScale(event.target.checked)} /><span>Scale keyframes with it</span></label>
          <Button size="sm" variant="secondary" disabled={Math.abs(length - doc.duration) < 1e-6} onClick={() => handle.edit((current) => retime(current, length, scale), `Retime to ${length}s`)}>Apply</Button>
          <FormField label="Frame rate">
            <Select value={String(doc.fps)} onChange={(event) => handle.edit((current) => ({ ...current, fps: Number(event.target.value) }), "Change the frame rate")}>
              {[12, 15, 24, 25, 30, 60].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
            </Select>
          </FormField>
        </Row>
      </PanelGroup>

      <PanelGroup title="Delays and sequencing">
        <table className="ds-table" aria-label="Layer timing">
          <thead><tr><th scope="col">Stagger</th><th scope="col">Layer</th><th scope="col">Starts</th><th scope="col">Ends</th><th scope="col">Delay</th><th scope="col" style={{ minWidth: 160 }}>Span</th></tr></thead>
          <tbody>
            {doc.layers.map((layer) => {
              const span = layerSpan(layer);
              const order = ui.staggerIds.indexOf(layer.id);
              return (
                <tr key={layer.id}>
                  <td><label className="ds-check"><input type="checkbox" checked={order >= 0} disabled={!span} onChange={() => toggleStagger(layer.id)} aria-label={`Include ${layer.name} in the stagger`} /><span className="ds-num">{order >= 0 ? order + 1 : ""}</span></label></td>
                  <td>{layer.name}</td>
                  <td className="ds-num">{span ? `${span.from.toFixed(2)}s` : "—"}</td>
                  <td className="ds-num">{span ? `${span.to.toFixed(2)}s` : "—"}</td>
                  <td>
                    <Row gap={1}>
                      <Button size="sm" variant="ghost" disabled={!span} aria-label={`Start ${layer.name} one frame earlier`} onClick={() => handle.edit((current) => shiftLayer(current, layer.id, -1 / doc.fps), `Delay ${layer.name}`)}>−1f</Button>
                      <Button size="sm" variant="ghost" disabled={!span} aria-label={`Delay ${layer.name} by one frame`} onClick={() => handle.edit((current) => shiftLayer(current, layer.id, 1 / doc.fps), `Delay ${layer.name}`)}>+1f</Button>
                      <Button size="sm" variant="ghost" disabled={!span} aria-label={`Delay ${layer.name} by 100 milliseconds`} onClick={() => handle.edit((current) => shiftLayer(current, layer.id, 0.1), `Delay ${layer.name}`)}>+0.1s</Button>
                    </Row>
                  </td>
                  <td>
                    <div style={{ position: "relative", height: 12, background: "var(--bg-inset)", borderRadius: 3 }} aria-hidden="true">
                      {span && <div style={{ position: "absolute", insetBlock: 0, insetInlineStart: `${span.from * px}%`, width: `${Math.max(1, (span.to - span.from) * px)}%`, background: "var(--accent)", borderRadius: 3 }} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Row gap={3} wrap style={{ alignItems: "flex-end" }}>
          <NumberBox label="Stagger step" suffix="s" value={ui.staggerStep} step={0.01} min={0} onChange={(staggerStep) => motionUi.set((current) => ({ ...current, staggerStep: Math.max(0, staggerStep) }))} />
          <Button size="sm" variant="ghost" onClick={() => motionUi.set((current) => ({ ...current, staggerIds: hierarchyOrder(doc) }))}>Suggest an order by hierarchy</Button>
          <Button size="sm" variant="ghost" disabled={ui.staggerIds.length === 0} onClick={() => motionUi.set((current) => ({ ...current, staggerIds: [] }))}>Clear</Button>
        </Row>
        <p className="vx-mini">The suggestion is a rule, not a model: the largest type and the largest shapes move first, so the eye meets the most important thing first. Stagger (in the toolbar) offsets each chosen layer by its position in the order times the step.</p>
      </PanelGroup>
    </Stack>
  );
}

function MiniCurve({ easing }: { easing: Easing }) {
  const d = useMemo(() => Array.from({ length: 31 }, (_, index) => { const t = index / 30; return `${index === 0 ? "M" : "L"}${(t * 60).toFixed(1)} ${(50 - easeAt(easing, t) * 40).toFixed(1)}`; }).join(" "), [easing]);
  return <svg viewBox="0 -10 60 70" width={60} height={60} aria-hidden="true"><path d={d} fill="none" strokeWidth={2} style={{ stroke: "var(--accent)" }} /></svg>;
}

function PresetsTab({ handle, doc }: { handle: DocHandle<MotionDoc>; doc: MotionDoc }) {
  useStore(motionUi);
  const picked = selectedKeyframe(doc);
  const applyToLayer = (easing: Easing) => {
    if (!picked) return;
    handle.edit((current) => {
      let next = current;
      const layer = current.layers.find((item) => item.id === picked.layer.id);
      for (const [property, keyframes] of Object.entries(layer?.tracks ?? {}) as [AnimatableProperty, Keyframe[] | undefined][]) {
        for (const keyframe of keyframes ?? []) next = setEasing(next, picked.layer.id, property, keyframe.id, easing);
      }
      return next;
    }, `Ease every keyframe of ${picked.layer.name}`);
  };
  return (
    <Stack gap={3}>
      {!picked && <Notice title="Choose a segment">Presets apply to the selected keyframe, or to every keyframe of its layer.</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {EASING_PRESETS.map((preset) => (
          <div key={preset.id} className="mo-preset" aria-label={preset.name}>
            <Row gap={2}><MiniCurve easing={preset.easing} /><Stack gap={1}><strong>{preset.name}</strong><code className="vx-mini ds-num">{preset.easing.kind === "bezier" ? `cubic-bezier(${preset.easing.points?.join(", ")})` : preset.easing.kind}</code></Stack></Row>
            <Row gap={1} wrap>
              <Button size="sm" variant="secondary" disabled={!picked} onClick={() => picked && handle.edit((current) => setEasing(current, picked.layer.id, picked.property, picked.keyframe.id, preset.easing), `Ease: ${preset.name}`)}>This keyframe</Button>
              <Button size="sm" variant="ghost" disabled={!picked} onClick={() => applyToLayer(preset.easing)}>Whole layer</Button>
            </Row>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function settleTime(spring: { stiffness: number; damping: number; mass: number }): number {
  for (let t = 0.02; t < 5; t += 0.01) {
    let settled = true;
    for (let u = t; u < t + 0.5; u += 0.02) if (Math.abs(1 - springValue(u, spring.stiffness, spring.damping, spring.mass)) > 0.01) { settled = false; break; }
    if (settled) return t;
  }
  return 5;
}

function SpringTab({ handle, doc }: { handle: DocHandle<MotionDoc>; doc: MotionDoc }) {
  useStore(motionUi);
  const picked = selectedKeyframe(doc);
  const initial = picked?.keyframe.easing.kind === "spring" && picked.keyframe.easing.spring ? picked.keyframe.easing.spring : { stiffness: 170, damping: 22, mass: 1 };
  const [spring, setSpring] = useState(initial);
  const settle = settleTime(spring);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  const path = useMemo(() => Array.from({ length: 121 }, (_, index) => { const t = (index / 120) * 2; return `${index === 0 ? "M" : "L"}${(index * 3).toFixed(1)} ${(180 - springValue(t, spring.stiffness, spring.damping, spring.mass) * 120).toFixed(1)}`; }).join(" "), [spring]);
  const peak = useMemo(() => Math.max(...Array.from({ length: 200 }, (_, index) => springValue(index / 100, spring.stiffness, spring.damping, spring.mass))), [spring]);
  return (
    <Row gap={4} wrap style={{ alignItems: "flex-start" }}>
      <svg viewBox="-10 20 380 190" style={{ flex: "1 1 300px", maxWidth: 460, background: "var(--graphite-900)", borderRadius: 8 }} role="img" aria-label={`Spring response over two seconds: settles in ${settle.toFixed(2)} seconds, peaks at ${(peak * 100).toFixed(0)} percent`}>
        <line x1={0} y1={60} x2={360} y2={60} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
        <line x1={0} y1={180} x2={360} y2={180} stroke="rgba(255,255,255,0.15)" />
        <line x1={settle * 180} y1={30} x2={settle * 180} y2={190} strokeDasharray="3 3" style={{ stroke: "var(--papaya-400)" }} />
        <path d={path} fill="none" strokeWidth={2.4} style={{ stroke: "var(--aqua-400)" }} />
        <text x={settle * 180 + 4} y={44} fontSize={11} fill="rgba(255,255,255,0.75)">settles {settle.toFixed(2)}s</text>
      </svg>
      <Stack gap={2} style={{ flex: "1 1 220px" }}>
        <div className="vx-fieldrow">
          <NumberBox label="Stiffness" value={spring.stiffness} min={1} onChange={(stiffness) => setSpring({ ...spring, stiffness: Math.max(1, stiffness) })} />
          <NumberBox label="Damping" value={spring.damping} min={1} onChange={(damping) => setSpring({ ...spring, damping: Math.max(1, damping) })} />
          <NumberBox label="Mass" value={spring.mass} step={0.1} min={0.1} onChange={(mass) => setSpring({ ...spring, mass: Math.max(0.1, mass) })} />
        </div>
        <span className="vx-mini">Damping ratio <span className="ds-num">{zeta.toFixed(2)}</span> ({zeta < 1 ? "under-damped: it overshoots" : "critically or over-damped: no overshoot"}); peak <span className="ds-num">{(peak * 100).toFixed(0)}%</span>.</span>
        {settle > 1.1 && <Notice tone="warning" title="Slow to settle">Within a segment the spring is sampled over about 1.1 seconds of its own time, so a spring that has not settled by then is cut off at the segment end.</Notice>}
        <Button size="sm" variant="primary" disabled={!picked} onClick={() => picked && handle.edit((current) => setEasing(current, picked.layer.id, picked.property, picked.keyframe.id, { kind: "spring", spring }), "Spring easing")}>
          Apply to the selected keyframe
        </Button>
        {!picked && <span className="vx-mini">Choose a segment on the left first.</span>}
        <span className="vx-mini">CSS cannot express a spring, so the export bakes spring segments to one step per frame and says so in the file.</span>
      </Stack>
    </Row>
  );
}

function ReviewPanel({ handle, doc, context }: { handle: DocHandle<MotionDoc>; doc: MotionDoc; context: ScreenContext }) {
  const [note, setNote] = useState("");
  const latest = doc.tests.find((test) => test.kind === "accessibility");
  return (
    <Stack gap={3}>
      <PanelGroup title="Review">
        {doc.review.state === "required" && (
          <Notice tone="danger" title="Accessibility review required">
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{doc.review.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            Fix the motion and test again, or record a review that accepts it with a reason.
          </Notice>
        )}
        {doc.review.state === "approved" && <Notice tone="success" title={`Reviewed by ${doc.review.reviewer}`}>{doc.review.note}</Notice>}
        {doc.review.state === "not_required" && <p className="vx-mini">No review is required. Run Test after changing the motion.</p>}
        {doc.review.state === "required" && (
          <>
            <FormField label="Review note" hint="Say why the motion is acceptable, for example that the flashing area is under the threshold at the size it ships.">
              <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </FormField>
            <Button size="sm" variant="secondary" disabled={note.trim().length < 10} onClick={() => handle.edit((current) => ({ ...current, review: { ...current.review, state: "approved", reviewer: context.actor, reviewedAt: clockIso(), note: note.trim() } }), "Accessibility review recorded")}>
              Record the review
            </Button>
            <span className="vx-mini">The role view shapes the interface; it is not an account security boundary.</span>
          </>
        )}
      </PanelGroup>
      <PanelGroup title="Last test">
        {latest ? (
          <Stack gap={1}>
            <Row gap={2}><Pill tone={latest.pass ? "success" : "danger"} dot>{latest.pass ? "passed" : "failed"}</Pill><span className="vx-mini">{latest.by} · {context.dateTime(latest.at)}</span></Row>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "var(--text-xs)" }}>{latest.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
          </Stack>
        ) : <p className="vx-mini">Not tested yet. Test samples every frame for flashing, large movement and fast zoom.</p>}
      </PanelGroup>
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function CurveEditor({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  const found = selectedKeyframe(doc);
  const [easing, setDraft] = useState<Easing>(() => (found?.keyframe.easing.kind === "bezier" ? found.keyframe.easing : { kind: "bezier", points: [0.25, 0.1, 0.25, 1] }));
  if (!handle || !doc || !found) return <Notice tone="warning" title="Select a segment first">Choose the keyframe whose outgoing curve you want to edit.</Notice>;
  const points = easing.points ?? [0.25, 0.1, 0.25, 1];
  return (
    <Stack gap={3}>
      <p className="vx-mini">{found.layer.name} · {PROPERTY_LABEL[found.property]} from <span className="ds-num">{found.keyframe.t.toFixed(2)}s</span>{found.next ? <> to <span className="ds-num">{found.next.t.toFixed(2)}s</span></> : " (last keyframe: its easing has no effect until another follows)"}. Drag a handle or focus it and use the arrow keys.</p>
      {found.keyframe.easing.kind !== "bezier" && <Notice tone="info" title={`Currently ${found.keyframe.easing.kind}`}>Saving replaces it with the bezier curve below.</Notice>}
      <EasingGraph easing={easing} size={260} onChange={setDraft} label="Curve being edited" />
      <div className="vx-fieldrow">
        {(["x1", "y1", "x2", "y2"] as const).map((name, index) => (
          <NumberBox key={name} label={name} value={points[index]} step={0.01} onChange={(next) => {
            const copy = [...points] as [number, number, number, number];
            copy[index] = index % 2 === 0 ? clamp(next, 0, 1) : clamp(next, -0.6, 1.6);
            setDraft({ kind: "bezier", points: copy });
          }} />
        ))}
      </div>
      <Row gap={1} wrap>
        {EASING_PRESETS.filter((preset) => preset.easing.kind === "bezier").map((preset) => <Button key={preset.id} size="sm" variant="ghost" onClick={() => setDraft(preset.easing)}>{preset.name}</Button>)}
      </Row>
      <code className="ds-num vx-mini">cubic-bezier({points.join(", ")})</code>
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => { handle.edit((current) => setEasing(current, found.layer.id, found.property, found.keyframe.id, easing), "Edit the easing curve"); close(); }}>Save the curve</Button>
      </Row>
    </Stack>
  );
}

export function LoopValidation({ close }: { close: () => void }) {
  const { handle, doc } = useSession();
  if (!handle || !doc) return null;
  const seams = loopSeams(doc);
  return (
    <Stack gap={3}>
      <p>When a composition loops, its last frame is followed by its first. Any property that differs between them jumps.</p>
      <Row gap={2} wrap>
        <div style={{ flex: "1 1 200px" }}><span className="vx-mini">Last frame</span><Stage doc={doc} time={doc.duration} height={120} label="Last frame" /></div>
        <div style={{ flex: "1 1 200px" }}><span className="vx-mini">First frame</span><Stage doc={doc} time={0} height={120} label="First frame" /></div>
      </Row>
      {seams.length === 0 ? <Notice tone="success" title="The loop is seamless">Every animated property ends where it starts.</Notice> : (
        <table className="ds-table">
          <caption className="vx-mini" style={{ captionSide: "top", textAlign: "start" }}>{seams.length} jump{seams.length === 1 ? "" : "s"} at the loop point</caption>
          <thead><tr><th scope="col">Layer</th><th scope="col">Property</th><th scope="col">Last frame</th><th scope="col">First frame</th></tr></thead>
          <tbody>{seams.map((seam) => <tr key={`${seam.layerId}-${seam.property}`}><td>{seam.layer}</td><td>{PROPERTY_LABEL[seam.property]}</td><td className="ds-num">{typeof seam.last === "number" ? seam.last.toFixed(2) : seam.last}</td><td className="ds-num">{typeof seam.first === "number" ? seam.first.toFixed(2) : seam.first}</td></tr>)}</tbody>
        </table>
      )}
      <Row gap={2} wrap>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>{seams.length ? "Keep the jumps" : "Close"}</Button>
        {doc.loop && <Button variant="secondary" onClick={() => { handle.edit((current) => ({ ...current, loop: false }), "Stop looping"); close(); }}>Play once instead</Button>}
        {seams.length > 0 && <Button variant="primary" onClick={() => { handle.edit((current) => closeLoop(current), "Close the loop"); close(); }}>Close the loop</Button>}
      </Row>
      {seams.length > 0 && <span className="vx-mini">Close the loop writes a keyframe on the last frame equal to the first frame, for each property that jumps.</span>}
    </Stack>
  );
}

export function TimingPreview() {
  const { doc } = useSession();
  const found = selectedKeyframe(doc);
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const span = found?.next ? found.next.t - found.keyframe.t : 1;
  const fps = doc?.fps ?? 30;
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now();
    let last = -1;
    const tick = (now: number) => {
      const total = span + 0.5;
      const elapsed = ((now - origin) / 1000) % total;
      const frame = Math.floor(elapsed * fps);
      if (frame !== last) { last = frame; setProgress(Math.min(1, elapsed / span)); }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, span, fps]);
  if (!doc || !found || !found.next) return <Notice tone="warning" title="Select a segment first">The timing preview plays one segment against a linear ramp.</Notice>;
  const eased = easeAt(found.keyframe.easing, progress);
  const count = Math.min(13, Math.max(2, Math.round(span * fps) + 1));
  const rows = Array.from({ length: count }, (_, index) => {
    const p = index / (count - 1);
    const t = found.keyframe.t + p * span;
    return { frame: Math.round(t * fps), p, value: sampleTrack([found.keyframe, found.next!], t, 0) };
  });
  return (
    <Stack gap={3}>
      <p className="vx-mini">{found.layer.name} · {PROPERTY_LABEL[found.property]}, <span className="ds-num">{span.toFixed(2)}s</span> at <span className="ds-num">{fps}</span> fps, then a half-second pause. {reduced ? "Your device asks for reduced motion, so this waits for Play." : ""}</p>
      <svg viewBox="0 0 400 90" style={{ width: "100%", background: "var(--graphite-900)", borderRadius: 8 }} role="img" aria-label={`Eased position ${(eased * 100).toFixed(0)} percent against linear ${(progress * 100).toFixed(0)} percent`}>
        <line x1={20} y1={30} x2={380} y2={30} stroke="rgba(255,255,255,0.15)" />
        <line x1={20} y1={66} x2={380} y2={66} stroke="rgba(255,255,255,0.15)" />
        <circle cx={20 + eased * 360} cy={30} r={10} style={{ fill: "var(--aqua-400)" }} />
        <circle cx={20 + progress * 360} cy={66} r={7} style={{ fill: "rgba(255,255,255,0.45)" }} />
        <text x={20} y={14} fontSize={10} fill="rgba(255,255,255,0.7)">eased</text>
        <text x={20} y={86} fontSize={10} fill="rgba(255,255,255,0.7)">linear</text>
      </svg>
      <Row gap={2}><Button size="sm" variant={playing ? "secondary" : "primary"} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</Button></Row>
      <table className="ds-table">
        <thead><tr><th scope="col">Frame</th><th scope="col">Time</th><th scope="col">Value</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.frame}><td className="ds-num">{row.frame}</td><td className="ds-num">{(row.p * 100).toFixed(0)}%</td><td className="ds-num">{typeof row.value === "number" ? row.value.toFixed(2) : row.value}</td></tr>)}</tbody>
      </table>
    </Stack>
  );
}
