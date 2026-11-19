import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useState } from "react";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ActionDef, ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import { CAPABILITY_LABELS } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import { useStore } from "@/applications/visual/kit";
import { chartData, evaluate, readWorkbook } from "@/applications/sheets/model";
import {
  alignObjects, distributeObjects, layoutById, nextId, resequenceAnimations, updateObjects,
  type AlignMode, type Deck, type SlideObject,
} from "./model";
import { activeDeckEditor, useDeckEditor, type DeckEditor } from "./state";
import { advanceSlides, endPresenting, presenterUi } from "./session";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * Present: the contract actions that operate on the open deck, and the
 * small forms they open. Every edit goes through the deck's one editor, so
 * it is one undoable step and is saved with the rest of the session.
 * ====================================================================== */

function useDeckFor(context: ScreenContext): Rec | undefined {
  const fromRoute = useRecord(context.params.id);
  const all = useCollection("decks");
  if (context.params.id) return fromRoute?.collection === "decks" ? fromRoute : all.find((record) => record.id === context.params.id);
  return all.find((record) => record.fields.isTemplate !== true) ?? all[0];
}

function editorFor(context: ScreenContext): DeckEditor | undefined {
  return activeDeckEditor(context.params.id);
}

export function formFooter(form: string, label: string) {
  return ({ close }: { close: () => void }) => (
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <Button variant="primary" type="submit" form={form}>{label}</Button>
    </>
  );
}

const needsSelection = (context: ScreenContext) => {
  const editor = editorFor(context);
  if (!editor) return undefined;
  const objects = editor.slide.objects.filter((object) => editor.selectedIds.includes(object.id));
  if (objects.length === 0) return "Select an object on the slide first";
  if (objects.every((object) => object.locked)) return "The selected objects are locked";
  return undefined;
};

/* ----------------------------- slide editor ----------------------------- */

export const SLIDE_ACTIONS: ActionDef[] = [
  { id: "Insert slide", label: "Insert slide", placement: "toolbar", run: (context) => context.openOverlay("Layout picker") },
  { id: "drag object", label: "Move object…", placement: "toolbar", guard: needsSelection, run: (context) => context.openOverlay("move object") },
  { id: "align", label: "Align…", placement: "toolbar", guard: needsSelection, run: (context) => context.openOverlay("align objects") },
  { id: "resize", label: "Resize…", placement: "toolbar", guard: needsSelection, run: (context) => context.openOverlay("resize object") },
  { id: "comment", label: "Comment", placement: "toolbar", run: (context) => context.openOverlay("properties", { mode: "comment" }) },
  {
    id: "undo", label: "Undo", placement: "toolbar", shortcut: "⌘Z",
    guard: (context) => { const editor = editorFor(context); return editor && !editor.canUndo ? "Nothing to undo yet" : undefined; },
    run: (context) => { const editor = editorFor(context); if (editor?.canUndo) editor.undo(); else context.toast("Nothing to undo", "The editor has no steps to take back.", "blocked"); },
  },
];

function selectedObjects(editor: DeckEditor): SlideObject[] {
  return editor.slide.objects.filter((object) => editor.selectedIds.includes(object.id) && !object.locked);
}

export function MoveObject({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const objects = selectedObjects(editor);
  const first = objects[0];
  const [x, setX] = useState(String(first?.x ?? 0));
  const [y, setY] = useState(String(first?.y ?? 0));
  if (!first) return <Notice tone="info" title="Select an object">Pick an unlocked object on the slide first.</Notice>;
  return (
    <form
      id="present-move"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const dx = Number(x) - first.x;
        const dy = Number(y) - first.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        editor.commitSlide(updateObjects(editor.slide, objects.map((object) => object.id), (object) => ({ ...object, x: Math.round(object.x + dx), y: Math.round(object.y + dy), customised: true })), "Move object");
        close();
      }}
    >
      <p className="ds-prose">The keyboard equivalent of dragging. {objects.length > 1 ? `The ${objects.length} selected objects move together, keeping their spacing.` : `Moves ${first.name}.`} On the slide, arrow keys nudge.</p>
      <Row gap={3} wrap>
        <Field label="Left (px)"><TextInput type="number" value={x} onChange={(event) => setX(event.target.value)} autoFocus /></Field>
        <Field label="Top (px)"><TextInput type="number" value={y} onChange={(event) => setY(event.target.value)} /></Field>
      </Row>
    </form>
  );
}

export function ResizeObject({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const object = selectedObjects(editor)[0];
  const [w, setW] = useState(String(object?.w ?? 0));
  const [h, setH] = useState(String(object?.h ?? 0));
  const [keep, setKeep] = useState(object?.type === "image");
  if (!object) return <Notice tone="info" title="Select an object">Pick an unlocked object on the slide first.</Notice>;
  const ratio = object.w / Math.max(1, object.h);
  return (
    <form
      id="present-resize"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const width = Math.max(8, Math.round(Number(w)));
        const height = Math.max(8, Math.round(keep ? width / ratio : Number(h)));
        editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, w: width, h: height, customised: true })), "Resize object");
        close();
      }}
    >
      <Properties rows={[{ label: "Object", value: object.name }, { label: "Now", value: `${object.w} × ${object.h}` }]} />
      <Row gap={3} wrap>
        <Field label="Width (px)"><TextInput type="number" value={w} onChange={(event) => setW(event.target.value)} autoFocus /></Field>
        <Field label="Height (px)"><TextInput type="number" value={keep ? String(Math.round(Number(w) / ratio)) : h} disabled={keep} onChange={(event) => setH(event.target.value)} /></Field>
      </Row>
      <label className="ds-row ds-gap-2"><input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} /> Keep the proportions</label>
    </form>
  );
}

const ALIGN_OPTIONS: { mode: AlignMode; label: string }[] = [
  { mode: "left", label: "Left edges" }, { mode: "centreX", label: "Centres across" }, { mode: "right", label: "Right edges" },
  { mode: "top", label: "Top edges" }, { mode: "centreY", label: "Middles" }, { mode: "bottom", label: "Bottom edges" },
];

export function AlignObjects({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const objects = selectedObjects(editor);
  if (objects.length === 0) return <Notice tone="info" title="Select objects">Select one object to align it to the slide, or several to align them to each other.</Notice>;
  const ids = objects.map((object) => object.id);
  return (
    <Stack gap={3}>
      <p className="ds-prose">{objects.length === 1 ? `${objects[0].name} aligns to the slide.` : `${objects.length} objects align to the box around them.`} Locked objects are left where they are.</p>
      <Row gap={2} wrap>
        {ALIGN_OPTIONS.map((option) => (
          <Button key={option.mode} variant="secondary" onClick={() => { editor.commitSlide(alignObjects(editor.slide, ids, option.mode), `Align ${option.label.toLowerCase()}`); close(); }}>{option.label}</Button>
        ))}
      </Row>
      {objects.length > 2 && (
        <Row gap={2} wrap>
          <Button variant="ghost" onClick={() => { editor.commitSlide(distributeObjects(editor.slide, ids, "x"), "Distribute across"); close(); }}>Distribute across</Button>
          <Button variant="ghost" onClick={() => { editor.commitSlide(distributeObjects(editor.slide, ids, "y"), "Distribute down"); close(); }}>Distribute down</Button>
        </Row>
      )}
    </Stack>
  );
}

/* ------------------------------ theme screen ------------------------------ */

export function CreateLayout({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const draftScope = `present:create-layout:${context.org.id}:${context.actor}:${context.params.id ?? "none"}`;
  const [basedOn, setBasedOn] = useWorkingField(draftScope, "basedOn", "");
  const [name, setName] = useWorkingField(draftScope, "name", "");
  const base = layoutById(editor.deck, basedOn || editor.slide.layoutId);
  const taken = editor.deck.layouts.some((layout) => layout.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      id="present-create-layout"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || taken) return;
        const layout = { ...base, id: nextId("ly"), name: name.trim(), placeholders: base.placeholders.map((placeholder) => ({ ...placeholder })), decoration: base.decoration?.map((item) => ({ ...item })) };
        editor.commit({ ...editor.deck, layouts: [...editor.deck.layouts, layout] }, `Create the layout ${layout.name}`);
        void context.mutate.log(`Layout ${layout.name} created from ${base.name}`, { entityId: context.params.id, type: "update" });
        clearWorkingDraft(draftScope);
        context.setTab("Layouts");
        close();
      }}
    >
      <Field label="Start from">
        <Select value={base.id} onChange={(event) => setBasedOn(event.target.value)}>
          {editor.deck.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
        </Select>
      </Field>
      <Field label="Name" required error={taken ? "A layout already has this name." : undefined}><TextInput value={name} onChange={(event) => setName(event.target.value)} required autoFocus placeholder="Two images and a caption" /></Field>
      <Properties rows={[{ label: "Placeholders copied", value: String(base.placeholders.length) }, { label: "Background", value: base.backgroundToken }]} />
      <p className="vx-mini">The new layout belongs to this deck's master. No slide uses it until it is applied.</p>
      <Row gap={2}>
        <WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
    </form>
  );
}

/* ------------------------------- data screen ------------------------------- */

/** Re-read every linked chart from its workbook, evaluating the sheet as Sheets would. */
export async function refreshCharts(context: ScreenContext): Promise<void> {
  const editor = editorFor(context);
  if (!editor) { context.toast("Open the deck first", "Refreshing changes the charts of the open deck.", "blocked"); return; }
  const { db } = await import("@/runtime/db");
  const linked = editor.deck.slides.flatMap((slide) => slide.objects.filter((object) => object.chart?.linked && object.chart.sourceWorkbookId));
  if (linked.length === 0) { context.toast("No linked charts", "Link a chart to a workbook first; a chart held in the slide has nothing to refresh from.", "info"); return; }
  const cache = new Map<string, { record: Rec; values: ReturnType<typeof evaluate> } | null>();
  const refreshed: string[] = [];
  const failed: string[] = [];
  let next: Deck = editor.deck;
  for (const object of linked) {
    const chart = object.chart!;
    if (!cache.has(chart.sourceWorkbookId!)) {
      const record = await db.records.get(chart.sourceWorkbookId!);
      cache.set(chart.sourceWorkbookId!, record ? { record, values: evaluate(readWorkbook(record.body), context.now) } : null);
    }
    const source = cache.get(chart.sourceWorkbookId!);
    const workbook = source ? readWorkbook(source.record.body) : undefined;
    const sheet = workbook?.sheets.find((item) => item.name === chart.sourceSheetName);
    const data = sheet && chart.sourceRef ? chartData(sheet, chart.sourceRef, true, source!.values.values[sheet.name] ?? {}) : null;
    if (!data || data.series.length === 0) { failed.push(chart.title); continue; }
    next = {
      ...next,
      slides: next.slides.map((slide) => updateObjects(slide, [object.id], (item) => ({ ...item, chart: { ...item.chart!, series: data.series, capturedAt: context.now.toISOString() } }))),
    };
    refreshed.push(chart.title);
  }
  if (refreshed.length) editor.commit(next, "Update chart data");
  if (refreshed.length) void context.mutate.log(`Updated ${refreshed.length} charts from their workbooks`, { entityId: context.params.id, type: "update" });
  context.toast(
    refreshed.length ? "Charts updated" : "Nothing updated",
    `${refreshed.length} chart${refreshed.length === 1 ? "" : "s"} re-read from the workbook with a new capture time.${failed.length ? ` ${failed.length} could not be read (${failed.join(", ")}): the workbook, sheet or range is gone, and the old snapshot is kept and still marked with its age.` : ""}`,
    failed.length ? "info" : "ok",
  );
}

export function toggleLabels(context: ScreenContext): void {
  const editor = editorFor(context);
  if (!editor) return;
  const charts = editor.slide.objects.filter((object) => object.type === "chart" && (editor.selectedIds.length === 0 || editor.selectedIds.includes(object.id)));
  if (charts.length === 0) { context.toast("No chart here", "This slide has no chart. Pick a slide with one.", "blocked"); return; }
  const show = charts.some((object) => !object.chart?.showLabels);
  editor.commitSlide(updateObjects(editor.slide, charts.map((object) => object.id), (object) => ({ ...object, chart: { ...object.chart!, showLabels: show } })), show ? "Show data labels" : "Hide data labels");
  context.toast(show ? "Labels shown" : "Labels hidden", `${charts.length} chart${charts.length === 1 ? "" : "s"} on slide ${editor.deck.index + 1}. The values come from the chart's snapshot, not a live query.`);
}

/* ----------------------------- animation screen ----------------------------- */

export function sequenceSlide(context: ScreenContext): void {
  const editor = editorFor(context);
  if (!editor) return;
  const animated = editor.slide.objects.filter((object) => object.animation && object.animation.effect !== "none");
  if (animated.length === 0) { context.toast("Nothing to sequence", "No object on this slide is animated.", "info"); return; }
  editor.commitSlide(resequenceAnimations(editor.slide), "Sequence the builds");
  context.toast("Builds sequenced", `${animated.length} animations on slide ${editor.deck.index + 1} now run 1 to ${animated.length}, with no gaps or ties.`);
}

export function toggleReduceMotion(context: ScreenContext): void {
  const editor = editorFor(context);
  if (!editor) return;
  const next = !editor.deck.reduceMotion;
  editor.commit({ ...editor.deck, reduceMotion: next }, next ? "Reduce motion" : "Allow motion");
  context.toast(next ? "Motion reduced" : "Motion allowed", next ? "The deck is marked for reduced motion: the animation preview shows every object at once, with no builds. The setting is saved with the deck." : "Builds play as set in the animation preview.");
}

/* ------------------------------- presenter ------------------------------- */

export function Annotate({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const session = useStore(presenterUi);
  const draftScope = `present:annotation:${context.org.id}:${context.actor}:${context.params.id ?? "none"}:${editor.slide.id}`;
  const [text, setText] = useWorkingField(draftScope, "text", "");
  const notes = session.annotations[editor.slide.id] ?? [];
  return (
    <form
      id="present-annotate"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        presenterUi.set((state) => ({ ...state, annotations: { ...state.annotations, [editor.slide.id]: [...(state.annotations[editor.slide.id] ?? []), { id: nextId("an"), text: text.trim(), at: clockIso() }] } }));
        clearWorkingDraft(draftScope);
        close();
      }}
    >
      <p className="ds-prose">An annotation is drawn over slide {editor.deck.index + 1} on the audience display while you present. It is not saved into the deck.</p>
      <Field label="Annotation" required><TextArea rows={2} value={text} onChange={(event) => setText(event.target.value)} required autoFocus placeholder="Lead time is now six weeks" /></Field>
      <Row gap={2}><WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
      {notes.length > 0 && (
        <Stack gap={1}>
          {notes.map((item) => (
            <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
              <span className="ds-grow">{item.text}</span>
              <Button size="sm" variant="ghost" onClick={() => presenterUi.set((state) => ({ ...state, annotations: { ...state.annotations, [editor.slide.id]: (state.annotations[editor.slide.id] ?? []).filter((entry) => entry.id !== item.id) } }))}>Remove</Button>
            </Row>
          ))}
        </Stack>
      )}
    </form>
  );
}

export function advanceAction(context: ScreenContext): void {
  const editor = editorFor(context);
  if (!editor) return;
  if (!advanceSlides(editor, 1)) context.toast("This is the last slide", "There is no visible slide after this one.", "info");
}

export function endAction(context: ScreenContext): void {
  const session = presenterUi.get();
  if (!session.running && !session.fullscreen) { context.toast("Nothing is being presented", "Start presenting or rehearsing first.", "blocked"); return; }
  endPresenting(editorFor(context));
  const ended = presenterUi.get().lastEnded;
  context.toast("Presentation ended", `${ended ? `${Math.floor(ended.elapsed / 60)}:${String(ended.elapsed % 60).padStart(2, "0")} elapsed, ${ended.slides} slides timed` : "Stopped"}. The audience display is closed and the times are on the Rehearsal tab.`);
}

/* ------------------------------- review screen ------------------------------- */

export function ResolveComments({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const open = editor.deck.comments.filter((comment) => !comment.resolved);
  if (open.length === 0) return <Notice tone="success" title="Nothing is open">Every comment on this deck is resolved.</Notice>;
  const slideNumber = (slideId: string) => editor.deck.slides.findIndex((slide) => slide.id === slideId) + 1;
  const resolve = (ids: string[]) => {
    editor.commit({ ...editor.deck, comments: editor.deck.comments.map((comment) => (ids.includes(comment.id) ? { ...comment, resolved: true } : comment)) }, ids.length === 1 ? "Resolve a comment" : `Resolve ${ids.length} comments`);
    void context.mutate.log(`${ids.length} deck comment${ids.length === 1 ? "" : "s"} resolved by ${context.actor}`, { entityId: context.params.id, type: "update" });
  };
  return (
    <Stack gap={2}>
      {open.map((comment) => (
        <Row key={comment.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <div className="ds-grow"><strong>{comment.author}</strong> · slide {slideNumber(comment.slideId)}<p className="ds-subtle">{comment.body}</p></div>
          <Button size="sm" variant="secondary" onClick={() => resolve([comment.id])}>Resolve</Button>
        </Row>
      ))}
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="primary" onClick={() => { resolve(open.map((comment) => comment.id)); close(); }}>Resolve all {open.length}</Button>
      </Row>
    </Stack>
  );
}

export function ShareDeck({ context, close }: { context: ScreenContext; close: () => void }) {
  const editor = useDeckEditor(context, useDeckFor(context));
  const [scope, setScope] = useState<"workspace" | "link">("workspace");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const open = editor.deck.comments.filter((comment) => !comment.resolved).length;
  return (
    <form
      id="present-share"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!acknowledged) return;
        editor.commit({ ...editor.deck, exports: [{ id: nextId("ex"), at: context.now.toISOString(), format: "Link", note: note.trim() || (scope === "workspace" ? "Workspace sharing intent (local only)" : "Public link request, queued locally"), scope }, ...editor.deck.exports] }, "Share the deck");
        void context.mutate.log(scope === "workspace" ? "Workspace sharing intent recorded locally; access was not granted" : "Public link request recorded locally; no hosting is connected", { entityId: context.params.id, type: "share", capability: scope === "link" ? "queued_local" : undefined });
        context.toast(scope === "workspace" ? "Sharing intent recorded" : "Public request recorded locally", "The entry is stored in this browser and can be revoked in Publish. No external access or public URL has been created.", "info");
        close();
      }}
    >
      <Field label="Record sharing intent">
        <Select value={scope} onChange={(event) => { setScope(event.target.value as "workspace" | "link"); setAcknowledged(false); }}>
          <option value="workspace">Workspace sharing record (local)</option>
          <option value="link">Public link request (not connected)</option>
        </Select>
      </Field>
      {scope === "workspace" && <Notice tone="info" title="This is not a working share link">This records sharing intent only. External access and server-side permissions are not connected.</Notice>}
      {scope === "link" && (
        <Notice tone="warning" title="A public link needs hosting, which is not connected">
          The request is recorded as {CAPABILITY_LABELS.queued_local.toLowerCase()}. Nobody outside this browser can open the deck until a host is connected.
        </Notice>
      )}
      {open > 0 && <Notice tone="warning" title={`${open} comments are unresolved`}>Sharing is allowed; the open comments stay visible to anyone who opens the deck here.</Notice>}
      <Field label="Note"><TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="For the trade buyers" /></Field>
      <Checkbox label="I understand this only records a request and does not grant access" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
      <Properties rows={[{ label: "Hosting", value: <Pill tone="warning">{CAPABILITY_LABELS.not_connected}</Pill> }]} />
    </form>
  );
}

export function EmptyDeck() {
  return <Empty title="No deck is open" />;
}
