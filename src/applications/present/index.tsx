import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical,
  AlignVerticalDistributeCenter, ArrowDownToLine, ArrowUpToLine, BarChart3, Circle, Copy,
  Eye, EyeOff, FileDown, Image as ImageIcon, LayoutTemplate, Lock, MessageSquare, Minus,
  MonitorPlay, Palette, Play, Plus, Presentation, Redo2, Square, Table2, Trash2, Triangle,
  Type as TypeIcon, Undo2, Unlock, Wand2,
} from "lucide-react";
import {
  Button, ButtonGroup, Card, Checkbox, DataGrid, Empty, Field, Grid, InspectorSection, Meter,
  Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, Switch, Tabs, TextArea,
  TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { getScreenDef, registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById } from "@/platform/capability";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  addObject, addSlide, alignObjects, applyLayout, buildOrder, chartFreshness, customisedObjects,
  distributeObjects, duplicateSlide, layoutById, motionWarnings, moveSlide, nextId, notesToText,
  readDeck, removeObjects, removeSlide, reorder, resequenceAnimations, reviewDeck, slideFromLayout,
  SLIDE_H, SLIDE_W, THEMES, toHtml, updateObjects,
  type AlignMode, type Deck, type ObjectAnimation, type Slide, type SlideObject, type Theme,
  type ThemeColourToken,
} from "./model";
import { ObjectBody, SlideCanvas, colour } from "./canvas";
import { SAVE_LABEL, SAVE_TONE, useDeckEditor, type DeckEditor } from "./state";
import { presenterUi, advanceSlides } from "./session";
import {
  AlignObjects, Annotate, CreateLayout, MoveObject, ResizeObject, ResolveComments, SLIDE_ACTIONS, ShareDeck,
  advanceAction, endAction, formFooter, refreshCharts, sequenceSlide, toggleLabels, toggleReduceMotion,
} from "./actions";
import { useStore } from "@/applications/visual/kit";
import { useGuardRefresh } from "@/applications/design/sharedDoc";
import "./present.css";

/* ====================================================================== *
 * PRESENT — Presentations & Storytelling
 *
 * Every slide owns an object graph (./model.ts, covered by
 * tests/unit/present-model.test.ts). The canvas moves, resizes, rotates and
 * aligns any object, with snapping guides and a keyboard equivalent for each
 * pointer gesture.
 * ====================================================================== */

function useDeck(context: ScreenContext): Rec | undefined {
  const fromRoute = useRecord(context.params.id);
  const all = useCollection("decks");
  useGuardRefresh(context);
  return fromRoute ?? all.find((record) => record.fields.isTemplate !== true) ?? all[0];
}

/** The screen's contract actions, on the editor's own bar (the full-chrome surface has no page header). */
function EditorActions({ context }: { context: ScreenContext }) {
  const def = getScreenDef(context.screen.applicationCode, context.screen.id);
  return (
    <Toolbar label="Slide actions">
      {(def?.actions ?? []).map((action: ActionDef) => {
        const blocked = action.guard?.(context);
        return (
          <Button key={action.id} size="sm" variant="ghost" disabled={Boolean(blocked)} title={blocked ?? action.shortcut} onClick={() => void action.run(context)}>
            {action.label ?? action.id}
          </Button>
        );
      })}
    </Toolbar>
  );
}

function SaveBadge({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  return (
    <Row gap={2}>
      <Pill tone={SAVE_TONE[editor.saveState]} dot>{SAVE_LABEL[editor.saveState]}</Pill>
      {editor.lastSavedAt && <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{context.relative(editor.lastSavedAt)}</span>}
    </Row>
  );
}

function ConflictNotice({ editor }: { editor: DeckEditor }) {
  if (!editor.conflict) return null;
  return (
    <Notice
      tone="danger"
      title="This deck changed somewhere else"
      actions={<>
        <Button size="sm" variant="secondary" onClick={() => void editor.resolveConflict("mine")}>Keep my slides</Button>
        <Button size="sm" variant="ghost" onClick={() => void editor.resolveConflict("theirs")}>Take the stored version</Button>
      </>}
    >
      Autosave was refused because the stored revision moved on. Nothing was overwritten.
    </Notice>
  );
}

function MiniSlide({ deck, slide, width }: { deck: Deck; slide: Slide; width: number }) {
  const scale = width / SLIDE_W;
  const layout = layoutById(deck, slide.layoutId);
  return (
    <div
      className="px-thumb-mini"
      style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, background: colour(deck, layout.backgroundToken) }}
      aria-hidden
    >
      {(layout.decoration ?? []).map((item, index) => (
        <div key={index} style={{ position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h, background: colour(deck, item.fillToken), opacity: item.opacity, borderRadius: item.kind === "ellipse" ? "50%" : 2 }} />
      ))}
      {[...slide.objects].sort((a, b) => a.z - b.z).map((object) => (
        <div key={object.id} style={{ position: "absolute", left: object.x, top: object.y, width: object.w, height: object.h, transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined, overflow: "hidden" }}>
          <ObjectBody object={object} deck={deck} readOnly />
        </div>
      ))}
    </div>
  );
}

function SlideSorter({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  return (
    <>
      {editor.deck.slides.map((slide, index) => (
        <div key={slide.id} className="px-thumb-row">
          <button
            type="button"
            className="px-thumb"
            style={{ flex: 1, minWidth: 0 }}
            aria-current={index === editor.deck.index ? "true" : undefined}
            data-hidden={slide.hidden ? "true" : undefined}
            onClick={() => editor.selectSlide(index)}
            onKeyDown={(event) => {
              if (!(event.altKey || event.metaKey)) return;
              if (event.key === "ArrowUp") { event.preventDefault(); editor.commit(moveSlide(editor.deck, slide.id, index - 1), "Reorder slides"); }
              if (event.key === "ArrowDown") { event.preventDefault(); editor.commit(moveSlide(editor.deck, slide.id, index + 1), "Reorder slides"); }
            }}
          >
            <div className="px-thumb-frame"><MiniSlide deck={editor.deck} slide={slide} width={142} /></div>
            <span className="px-thumb-label">
              <strong>{index + 1}</strong>
              <span className="ds-truncate">{slide.title}</span>
              {slide.hidden && <EyeOff size={11} aria-label="Hidden" />}
              {slide.notes.trim() && <MessageSquare size={11} aria-label="Has speaker notes" />}
            </span>
          </button>
          <Stack gap={1}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${slide.title} earlier`} disabled={index === 0} onClick={() => editor.commit(moveSlide(editor.deck, slide.id, index - 1), "Reorder slides")}><ArrowUpToLine size={13} /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${slide.title} later`} disabled={index === editor.deck.slides.length - 1} onClick={() => editor.commit(moveSlide(editor.deck, slide.id, index + 1), "Reorder slides")}><ArrowDownToLine size={13} /></Button>
          </Stack>
        </div>
      ))}
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => context.openOverlay("Layout picker")}>Slide</Button>
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => editor.commit(duplicateSlide(editor.deck, editor.slide.id), "Duplicate slide")}>Copy</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={editor.deck.slides.length <= 1} onClick={() => editor.commit(removeSlide(editor.deck, editor.slide.id), "Delete slide")}>Delete</Button>
      </Row>
      <p className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Alt with the up or down arrow reorders the focused slide from the keyboard.</p>
    </>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-001 — Presentation Library
 * ====================================================================== */

function DeckLibrary({ context, tab }: { context: ScreenContext; tab: "Recent" | "Shared" | "Templates" | "Archived" }) {
  const decks = useCollection("decks");
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const list = tab === "Recent"
      ? [...decks].filter((record) => record.status !== "archived").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : tab === "Shared"
        ? decks.filter((record) => String(record.fields.sharedWith ?? "").trim().length > 0 && record.status !== "archived")
        : tab === "Templates"
          ? decks.filter((record) => record.fields.isTemplate === true)
          : decks.filter((record) => record.status === "archived");
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((record) => `${record.title} ${record.summary} ${record.tags.join(" ")}`.toLowerCase().includes(needle)) : list;
  }, [decks, tab, query]);

  if (rows.length === 0 && tab !== "Shared" && !query.trim()) {
    return <Empty title={`No ${tab.toLowerCase()} decks`} icon={<Presentation size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("new deck")}>New deck</Button>}>
      {tab === "Templates" ? "Mark a deck as a template to reuse its masters and theme." : "Create a deck, or import one."}
    </Empty>;
  }

  return (
    <Stack gap={4}>
      <div className="pr-library-heading">
        <div><span className="pr-library-eyebrow">PRESENT / DECK LIBRARY</span>
          <h2>{tab === "Shared" ? "Recorded sharing." : tab === "Templates" ? "Reusable presentations." : tab === "Archived" ? "Presentation archive." : "Presentations in progress."}</h2>
          <p>{tab === "Shared" ? "Only decks with an explicitly recorded sharing list appear here. Public or workspace access is not implied." : "Find and present the right deck with its source, review state and design context visible."}</p>
        </div>
        <Button variant="primary" onClick={() => context.openOverlay("new deck")}>New presentation</Button>
      </div>
      <div className="pr-library-overview" aria-label="Presentation library overview">
        <div><span>Current decks</span><strong>{decks.filter((record) => record.status !== "archived").length}</strong></div>
        <div><span>Templates</span><strong>{decks.filter((record) => record.fields.isTemplate === true).length}</strong></div>
        <div><span>Archived</span><strong>{decks.filter((record) => record.status === "archived").length}</strong></div>
      </div>
      <Field label="Find a presentation"><TextInput type="search" aria-label="Find a presentation" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, summary or tags" /></Field>
      {rows.length === 0 ? <Empty title="No presentations match this view" action={<Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>}>Try another search or create a presentation.</Empty> : (
    <Grid>
      {rows.map((record) => {
        const deck = readDeck(record.body);
        const findings = reviewDeck(deck);
        return (
          <Card
            key={record.id}
            span={4}
            eyebrow="DECK"
            prov="human"
            title={record.title}
            subtitle={record.summary}
            actions={<Pill tone={record.status === "published" ? "success" : record.status === "in_review" ? "warning" : "neutral"}>{record.status.replace("_", " ")}</Pill>}
            footer={<>
              <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${org.slug}/present/decks/${record.id}`)}>Edit</Button>
              <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => context.navigate(`/o/${org.slug}/present/decks/${record.id}/present`)}>Present</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("template preview", { id: record.id })}>Preview</Button>
            </>}
          >
            <Stack gap={3}>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", overflow: "hidden", position: "relative", aspectRatio: "16 / 9" }}>
                <MiniSlide deck={deck} slide={deck.slides[0]} width={320} />
              </div>
              <Properties rows={[
                { label: "Slides", value: String(deck.slides.length) },
                { label: "Theme", value: deck.theme.name },
                { label: "Owner", value: record.ownerName },
                { label: "Changed", value: context.relative(record.updatedAt) },
              ]} />
              {deck.importNotes.length > 0 && (
                <Notice tone="warning" title="Substitutions on import">{deck.importNotes[0]}</Notice>
              )}
              {findings.filter((finding) => finding.severity === "warning").length > 0 && (
                <Pill tone="warning">{findings.filter((finding) => finding.severity === "warning").length} review findings</Pill>
              )}
            </Stack>
          </Card>
        );
      })}
    </Grid>
      )}
    </Stack>
  );
}

function LibraryInspector({ context }: { context: ScreenContext }) {
  const selected = useRecord(context.selectedId);
  const decks = useCollection("decks");
  const record = selected ?? decks[0];
  const { org } = useWorkspace();
  if (!record) return <Empty title="No decks" icon={<Presentation size={18} />} />;
  const deck = readDeck(record.body);
  const findings = reviewDeck(deck);
  return (
    <Stack gap={5}>
      <InspectorSection title="Deck">
        <Properties rows={[
          { label: "Slides", value: String(deck.slides.length) },
          { label: "Hidden", value: String(deck.slides.filter((slide) => slide.hidden).length) },
          { label: "Objects", value: String(deck.slides.reduce((total, slide) => total + slide.objects.length, 0)) },
          { label: "Theme", value: deck.theme.name },
          { label: "Masters", value: String(deck.layouts.length) },
          { label: "Comments", value: String(deck.comments.filter((comment) => !comment.resolved).length) },
        ]} />
      </InspectorSection>
      {deck.theme.fontSubstitutions.length > 0 && (
        <InspectorSection title="Font substitutions">
          <Properties rows={deck.theme.fontSubstitutions.map((item) => ({ label: item.requested, value: `→ ${item.used}` }))} />
        </InspectorSection>
      )}
      <InspectorSection title="Review findings">
        {findings.length === 0 ? <span className="ds-subtle">Nothing flagged.</span> : (
          <Stack gap={2}>{findings.slice(0, 5).map((finding) => <Notice key={finding.id} tone={finding.severity === "warning" ? "warning" : "info"}>{finding.message}</Notice>)}</Stack>
        )}
      </InspectorSection>
      <InspectorSection title="Open">
        <Row gap={2} wrap>
          <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${org.slug}/present/decks/${record.id}`)}>Editor</Button>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/present/decks/${record.id}/theme`)}>Theme</Button>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/present/decks/${record.id}/present`)}>Present</Button>
        </Row>
      </InspectorSection>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-002 — Slide Editor
 * ====================================================================== */

function DesignRibbon({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  const ids = editor.selectedIds;
  const has = ids.length > 0;
  const align = (mode: AlignMode) => () => editor.commitSlide(alignObjects(editor.slide, ids, mode), `Align ${mode}`);
  return (
    <Toolbar label="Design tools">
      <Tool label="Undo" icon={<Undo2 size={16} />} disabled={!editor.canUndo} onClick={editor.undo} />
      <Tool label="Redo" icon={<Redo2 size={16} />} disabled={!editor.canRedo} onClick={editor.redo} />
      <ToolbarSeparator />
      <Tool label="Align left" icon={<AlignStartVertical size={16} />} disabled={!has} onClick={align("left")} />
      <Tool label="Align centre horizontally" icon={<AlignCenterVertical size={16} />} disabled={!has} onClick={align("centreX")} />
      <Tool label="Align right" icon={<AlignEndVertical size={16} />} disabled={!has} onClick={align("right")} />
      <Tool label="Align top" icon={<AlignStartHorizontal size={16} />} disabled={!has} onClick={align("top")} />
      <Tool label="Align middle vertically" icon={<AlignCenterHorizontal size={16} />} disabled={!has} onClick={align("centreY")} />
      <Tool label="Align bottom" icon={<AlignEndHorizontal size={16} />} disabled={!has} onClick={align("bottom")} />
      <ToolbarSeparator />
      <Tool label="Distribute horizontally" icon={<AlignHorizontalDistributeCenter size={16} />} disabled={ids.length < 3} onClick={() => editor.commitSlide(distributeObjects(editor.slide, ids, "x"), "Distribute horizontally")} />
      <Tool label="Distribute vertically" icon={<AlignVerticalDistributeCenter size={16} />} disabled={ids.length < 3} onClick={() => editor.commitSlide(distributeObjects(editor.slide, ids, "y"), "Distribute vertically")} />
      <ToolbarSeparator />
      <Tool label="Bring to front" icon={<ArrowUpToLine size={16} />} disabled={!has} onClick={() => editor.commitSlide(reorder(editor.slide, ids, "front"), "Bring to front")} />
      <Tool label="Bring forward" disabled={!has} onClick={() => editor.commitSlide(reorder(editor.slide, ids, "forward"), "Bring forward")}>+1</Tool>
      <Tool label="Send backward" disabled={!has} onClick={() => editor.commitSlide(reorder(editor.slide, ids, "backward"), "Send backward")}>−1</Tool>
      <Tool label="Send to back" icon={<ArrowDownToLine size={16} />} disabled={!has} onClick={() => editor.commitSlide(reorder(editor.slide, ids, "back"), "Send to back")} />
      <ToolbarSeparator />
      <Tool
        label={editor.slide.objects.find((object) => object.id === ids[0])?.locked ? "Unlock" : "Lock"}
        icon={editor.slide.objects.find((object) => object.id === ids[0])?.locked ? <Unlock size={16} /> : <Lock size={16} />}
        disabled={!has}
        onClick={() => editor.commitSlide(updateObjects(editor.slide, ids, (object) => ({ ...object, locked: !object.locked })), "Lock")}
      />
      <Tool label="Layout picker" icon={<LayoutTemplate size={16} />} onClick={() => context.openOverlay("Layout picker")} />
      <Tool label="Delete the selection" icon={<Trash2 size={16} />} disabled={!has} onClick={() => { editor.commitSlide(removeObjects(editor.slide, ids), "Delete objects"); editor.setSelectedIds([]); }} />
    </Toolbar>
  );
}

function InsertRibbon({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  function place(object: SlideObject) {
    const next = addObject(editor.slide, object);
    editor.commitSlide(next, `Insert ${object.type}`);
    editor.setSelectedIds([object.id]);
  }
  const base = { x: 120, y: 160, rotation: 0, z: 1 };
  return (
    <Toolbar label="Insert">
      <Tool label="Text box" icon={<TypeIcon size={16} />} onClick={() => place({
        ...base, id: nextId("tx"), type: "text", name: "Text", w: 400, h: 90,
        text: { text: "New text", size: 24, weight: 400, align: "start", valign: "start", colourToken: "ink", role: "body" },
        customised: true,
      })} />
      <Tool label="Rectangle" icon={<Square size={16} />} onClick={() => place({
        ...base, id: nextId("sh"), type: "shape", name: "Rectangle", w: 240, h: 150,
        shape: { kind: "roundRect", fillToken: "accent", strokeWidth: 0, radius: 10, opacity: 1 }, customised: true,
      })} />
      <Tool label="Ellipse" icon={<Circle size={16} />} onClick={() => place({
        ...base, id: nextId("sh"), type: "shape", name: "Ellipse", w: 180, h: 180,
        shape: { kind: "ellipse", fillToken: "support", strokeWidth: 0, radius: 0, opacity: 1 }, customised: true,
      })} />
      <Tool label="Triangle" icon={<Triangle size={16} />} onClick={() => place({
        ...base, id: nextId("sh"), type: "shape", name: "Triangle", w: 180, h: 160,
        shape: { kind: "triangle", fillToken: "support", strokeWidth: 0, radius: 0, opacity: 1 }, customised: true,
      })} />
      <Tool label="Line" icon={<Minus size={16} />} onClick={() => place({
        ...base, id: nextId("sh"), type: "shape", name: "Line", w: 320, h: 24,
        shape: { kind: "line", fillToken: "line", strokeWidth: 3, radius: 0, opacity: 1 }, customised: true,
      })} />
      <ToolbarSeparator />
      <Tool label="Image frame" icon={<ImageIcon size={16} />} onClick={() => context.openOverlay("image insert")} />
      <Tool label="Table" icon={<Table2 size={16} />} onClick={() => place({
        ...base, id: nextId("tb"), type: "table", name: "Table", w: 620, h: 200,
        table: { header: true, rows: [["Column", "Column", "Column"], ["", "", ""], ["", "", ""]] }, customised: true,
      })} />
      <Tool label="Chart" icon={<BarChart3 size={16} />} onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/data", context.params.id))} />
      <ToolbarSeparator />
      <Tool label="New slide" icon={<Plus size={16} />} onClick={() => context.openOverlay("Layout picker")} />
    </Toolbar>
  );
}

function AnimateRibbon({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  const ids = editor.selectedIds;
  const first = editor.slide.objects.find((object) => object.id === ids[0]);
  return (
    <Toolbar label="Animation">
      <Select
        aria-label="Entrance effect"
        value={first?.animation?.effect ?? "none"}
        disabled={ids.length === 0}
        onChange={(event) => {
          const effect = event.target.value as ObjectAnimation["effect"];
          const next = updateObjects(editor.slide, ids, (object) => ({
            ...object,
            animation: effect === "none"
              ? undefined
              : { effect, order: object.animation?.order ?? buildOrder(editor.slide).length + 1, durationMs: object.animation?.durationMs ?? 320, delayMs: object.animation?.delayMs ?? 0, easing: object.animation?.easing ?? "ease-out", trigger: object.animation?.trigger ?? "onAppear" },
          }));
          editor.commitSlide(resequenceAnimations(next), "Animation");
        }}
      >
        <option value="none">No animation</option>
        <option value="fade">Fade in</option>
        <option value="riseUp">Rise up</option>
        <option value="slideLeft">Slide in from the left</option>
        <option value="scaleIn">Scale in</option>
      </Select>
      <Select
        aria-label="Slide transition"
        value={editor.slide.transition.effect}
        onChange={(event) => editor.commitSlide({ ...editor.slide, transition: { ...editor.slide.transition, effect: event.target.value as Slide["transition"]["effect"] } }, "Transition")}
      >
        <option value="none">No transition</option>
        <option value="fade">Fade</option>
        <option value="push">Push</option>
        <option value="wipe">Wipe</option>
      </Select>
      <ToolbarSeparator />
      <Switch label="Reduce motion" checked={editor.deck.reduceMotion} onChange={(next) => editor.commit({ ...editor.deck, reduceMotion: next }, "Reduce motion")} />
      <Tool label="Open the motion timeline" icon={<Wand2 size={16} />} onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/animation", context.params.id))} />
    </Toolbar>
  );
}

function ReviewRibbon({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  const open = editor.deck.comments.filter((comment) => !comment.resolved);
  return (
    <Toolbar label="Review">
      <Tool label="Comment on the slide" icon={<MessageSquare size={16} />} onClick={() => context.openOverlay("properties", { mode: "comment" })} />
      <Pill tone={open.length ? "warning" : "neutral"}>{open.length} open comment{open.length === 1 ? "" : "s"}</Pill>
      <ToolbarSeparator />
      <Tool label="Run the brand and readability review" icon={<Wand2 size={16} />} onClick={() => context.openOverlay("AI suggestion")} />
      <Tool label="Open review and publish" onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/review", context.params.id))}>Publish</Tool>
    </Toolbar>
  );
}

function ViewRibbon({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  return (
    <Toolbar label="View">
      <Tool
        label={editor.slide.hidden ? "Show this slide when presenting" : "Hide this slide when presenting"}
        icon={editor.slide.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        pressed={editor.slide.hidden}
        onClick={() => editor.commitSlide({ ...editor.slide, hidden: !editor.slide.hidden }, "Hide slide")}
      />
      <ToolbarSeparator />
      <Tool label="Present from this slide" icon={<MonitorPlay size={16} />} onClick={() => context.navigate(`${context.path("/o/:org/present/decks/:id/present", context.params.id)}?tab=Presenter`)} />
      <Tool label="Export HTML" icon={<FileDown size={16} />} onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/review", context.params.id))} />
      <ToolbarSeparator />
      <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{SLIDE_W} × {SLIDE_H} stage, 16:9</span>
    </Toolbar>
  );
}

function ObjectInspector({ editor, context }: { editor: DeckEditor; context: ScreenContext }) {
  const selected = editor.slide.objects.filter((object) => editor.selectedIds.includes(object.id));
  const object = selected[0];
  if (!object) {
    const drifted = customisedObjects(editor.deck, editor.slide);
    return (
      <>
        <InspectorSection title="Slide">
          <Field label="Title">
            <TextInput aria-label="Title" value={editor.slide.title} onChange={(event) => editor.commitSlide({ ...editor.slide, title: event.target.value }, "Slide title")} />
          </Field>
          <Properties rows={[
            { label: "Layout", value: layoutById(editor.deck, editor.slide.layoutId).name },
            { label: "Objects", value: String(editor.slide.objects.length) },
            { label: "Transition", value: `${editor.slide.transition.effect}, ${editor.slide.transition.durationMs}ms` },
            { label: "Away from the layout", value: `${drifted.length} object${drifted.length === 1 ? "" : "s"}` },
          ]} />
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => context.openOverlay("Layout picker", { mode: "reapply" })}>Change layout</Button>
        </InspectorSection>
        <InspectorSection title="Speaker notes">
          <TextArea
            rows={7}
            aria-label="Speaker notes"
            value={editor.slide.notes}
            onChange={(event) => editor.commitSlide({ ...editor.slide, notes: event.target.value }, "Speaker notes")}
            placeholder="What you will say. Private to the presenter view."
          />
          <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
            <Field label="Target seconds">
              <TextInput aria-label="Target seconds"
                inputMode="numeric" align="end"
                value={String(editor.slide.targetSeconds ?? "")}
                onChange={(event) => editor.commitSlide({ ...editor.slide, targetSeconds: event.target.value ? Number(event.target.value) : undefined }, "Target time")}
              />
            </Field>
          </Row>
          <Notice tone="neutral">Notes never appear on the audience display. The presenter view is the only place they are shown.</Notice>
        </InspectorSection>
        <InspectorSection title="Objects on this slide">
          <Stack gap={1}>
            {[...editor.slide.objects].sort((a, b) => b.z - a.z).map((item) => (
              <Row key={item.id} gap={2}>
                <Button size="sm" variant="ghost" style={{ flex: 1, justifyContent: "flex-start" }} onClick={() => editor.setSelectedIds([item.id])}>
                  {item.name}
                </Button>
                <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>z{item.z}</span>
                {item.locked && <Lock size={12} aria-label="Locked" />}
              </Row>
            ))}
            {editor.slide.objects.length === 0 && <span className="ds-subtle">This slide is empty. Use Insert.</span>}
          </Stack>
        </InspectorSection>
      </>
    );
  }

  const patch = (change: Partial<SlideObject>, label: string) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, ...change, customised: true })), label);
  const tokens: ThemeColourToken[] = ["ink", "muted", "accent", "accentInk", "support", "surface", "background", "line"];

  return (
    <>
      <InspectorSection title={selected.length > 1 ? `${selected.length} objects` : object.name}>
        <Row gap={2} wrap>
          <Field label="X"><TextInput aria-label="X" inputMode="numeric" align="end" value={String(object.x)} onChange={(event) => patch({ x: Number(event.target.value) || 0 }, "Position")} /></Field>
          <Field label="Y"><TextInput aria-label="Y" inputMode="numeric" align="end" value={String(object.y)} onChange={(event) => patch({ y: Number(event.target.value) || 0 }, "Position")} /></Field>
        </Row>
        <Row gap={2} wrap>
          <Field label="Width"><TextInput aria-label="Width" inputMode="numeric" align="end" value={String(object.w)} onChange={(event) => patch({ w: Math.max(24, Number(event.target.value) || 24) }, "Size")} /></Field>
          <Field label="Height"><TextInput aria-label="Height" inputMode="numeric" align="end" value={String(object.h)} onChange={(event) => patch({ h: Math.max(24, Number(event.target.value) || 24) }, "Size")} /></Field>
        </Row>
        <Field label={`Rotation ${object.rotation}°`}>
          <input
            type="range" min={-180} max={180} step={1} value={object.rotation}
            aria-label="Rotation in degrees"
            onChange={(event) => patch({ rotation: Number(event.target.value) }, "Rotation")}
            style={{ width: "100%" }}
          />
        </Field>
        <Row gap={2}>
          <Checkbox label="Locked" checked={object.locked ?? false} onChange={(event) => patch({ locked: event.target.checked }, "Lock")} />
        </Row>
      </InspectorSection>

      {object.type === "text" && object.text && (
        <InspectorSection title="Text">
          <TextArea
            rows={4}
            aria-label="Text content"
            value={object.text.text}
            onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, text: { ...item.text!, text: event.target.value } })), "Edit text")}
          />
          <Row gap={2} wrap>
            <Field label="Size"><TextInput aria-label="Size" inputMode="numeric" align="end" value={String(object.text.size)} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, size: Number(event.target.value) || 16 } : undefined })), "Text size")} /></Field>
            <Field label="Weight">
              <Select aria-label="Weight" value={String(object.text.weight)} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, weight: Number(event.target.value) as 300 | 400 | 500 | 600 | 650 | 700 } : undefined })), "Text weight")}>
                {[300, 400, 500, 600, 650, 700].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
              </Select>
            </Field>
          </Row>
          <Row gap={2} wrap>
            <Field label="Align">
              <Select aria-label="Align" value={object.text.align} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, align: event.target.value as "start" | "center" | "end" } : undefined })), "Text align")}>
                <option value="start">Left</option><option value="center">Centre</option><option value="end">Right</option>
              </Select>
            </Field>
            <Field label="Vertical">
              <Select aria-label="Vertical" value={object.text.valign} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, valign: event.target.value as "start" | "center" | "end" } : undefined })), "Text valign")}>
                <option value="start">Top</option><option value="center">Middle</option><option value="end">Bottom</option>
              </Select>
            </Field>
          </Row>
          <Field label="Colour">
            <Row gap={1} wrap>
              {tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  aria-label={`Colour ${token}`}
                  aria-pressed={object.text!.colourToken === token}
                  onClick={() => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, colourToken: token } : undefined })), "Text colour")}
                  style={{ width: 24, height: 24, borderRadius: 5, background: colour(editor.deck, token), border: object.text!.colourToken === token ? "2px solid var(--accent)" : "1px solid var(--border-strong)" }}
                />
              ))}
            </Row>
          </Field>
          <Checkbox label="Italic" checked={object.text.italic ?? false} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, text: item.text ? { ...item.text, italic: event.target.checked } : undefined })), "Italic")} />
        </InspectorSection>
      )}

      {object.type === "shape" && object.shape && (
        <InspectorSection title="Shape">
          <Field label="Kind">
            <Select aria-label="Kind" value={object.shape.kind} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, shape: item.shape ? { ...item.shape, kind: event.target.value as typeof item.shape.kind } : undefined })), "Shape kind")}>
              {["rect", "roundRect", "ellipse", "triangle", "line", "arrow"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </Select>
          </Field>
          <Field label="Fill">
            <Row gap={1} wrap>
              {tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  aria-label={`Fill ${token}`}
                  aria-pressed={object.shape!.fillToken === token}
                  onClick={() => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, shape: item.shape ? { ...item.shape, fillToken: token } : undefined })), "Shape fill")}
                  style={{ width: 24, height: 24, borderRadius: 5, background: colour(editor.deck, token), border: object.shape!.fillToken === token ? "2px solid var(--accent)" : "1px solid var(--border-strong)" }}
                />
              ))}
            </Row>
          </Field>
          <Field label={`Opacity ${Math.round(object.shape.opacity * 100)}%`}>
            <input
              type="range" min={10} max={100} value={Math.round(object.shape.opacity * 100)}
              aria-label="Shape opacity"
              onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, shape: item.shape ? { ...item.shape, opacity: Number(event.target.value) / 100 } : undefined })), "Opacity")}
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Corner radius">
            <TextInput aria-label="Corner radius" inputMode="numeric" align="end" value={String(object.shape.radius)} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, editor.selectedIds, (item) => ({ ...item, customised: true, shape: item.shape ? { ...item.shape, radius: Number(event.target.value) || 0 } : undefined })), "Radius")} />
          </Field>
        </InspectorSection>
      )}

      {object.type === "image" && object.image && (
        <InspectorSection title="Image">
          <Properties rows={[
            { label: "Asset", value: object.image.assetId ?? "None referenced" },
            { label: "Substituted", value: object.image.substituted ?? "No" },
          ]} />
          <Field label="Alternative text" required hint="Reported in the review when it is empty.">
            <TextInput aria-label="Alternative text" value={object.image.alt} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, image: item.image ? { ...item.image, alt: event.target.value } : undefined })), "Alt text")} />
          </Field>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("image insert", { objectId: object.id })}>Choose an asset</Button>
        </InspectorSection>
      )}

      {object.type === "chart" && object.chart && (
        <InspectorSection title="Chart">
          <Properties rows={[
            { label: "Title", value: object.chart.title },
            { label: "Kind", value: object.chart.kind },
            { label: "Series", value: String(object.chart.series.length) },
            { label: "Source", value: object.chart.sourceRef ? `${object.chart.sourceSheetName}!${object.chart.sourceRef}` : "Held in the slide" },
            { label: "Captured", value: object.chart.capturedAt ? context.dateTime(object.chart.capturedAt) : "Never" },
          ]} />
          <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/data", context.params.id))}>Open charts & data</Button>
        </InspectorSection>
      )}

      {object.type === "table" && object.table && (
        <InspectorSection title="Table">
          <Properties rows={[
            { label: "Rows", value: String(object.table.rows.length) },
            { label: "Columns", value: String(object.table.rows[0]?.length ?? 0) },
          ]} />
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" onClick={() => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({
              ...item, table: item.table ? { ...item.table, rows: [...item.table.rows, item.table.rows[0].map(() => "")] } : undefined,
            })), "Add row")}>Add row</Button>
            <Button size="sm" variant="secondary" onClick={() => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({
              ...item, table: item.table ? { ...item.table, rows: item.table.rows.map((row) => [...row, ""]) } : undefined,
            })), "Add column")}>Add column</Button>
          </Row>
        </InspectorSection>
      )}

      {object.animation && (
        <InspectorSection title="Animation">
          <Properties rows={[
            { label: "Effect", value: object.animation.effect },
            { label: "Order", value: String(object.animation.order) },
            { label: "Duration", value: `${object.animation.durationMs}ms` },
            { label: "Trigger", value: object.animation.trigger },
          ]} />
        </InspectorSection>
      )}
    </>
  );
}

function SlideEditorScreen({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "sorter" | "aside">("canvas");
  const [scale, setScale] = useState(0.82);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The record arrives asynchronously and the early return above means the ref
  // is null on the first pass, so this has to re-run once the canvas exists.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => {
      const style = window.getComputedStyle(node);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = node.clientWidth - padding - 8;
      setScale(Math.max(0.3, Math.min(1, available / SLIDE_W)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [record?.id]);

  if (!record) {
    return (
      <div className="px-shell">
        <div className="px-scroll">
          <Empty title="No deck is open" icon={<Presentation size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/present/decks`)}>Open the library</Button>} />
        </div>
      </div>
    );
  }

  const tab = context.tab || "Design";

  return (
    <div className="px-shell">
      <div className="px-bar">
        <div className="px-bar-title">
          <strong>{record.title}</strong>
          <span>Slide {editor.deck.index + 1} of {editor.deck.slides.length} · {editor.deck.theme.name} · {layoutById(editor.deck, editor.slide.layoutId).name}</span>
        </div>
        <span className="ds-grow" />
        <EditorActions context={context} />
        <SaveBadge editor={editor} context={context} />
        <Button size="sm" variant="secondary" disabled={editor.saveState === "clean" || editor.saveState === "saved"} onClick={() => void editor.saveNow()}>Save now</Button>
        <Button size="sm" variant="primary" icon={<Play size={15} />} onClick={() => context.navigate(context.path("/o/:org/present/decks/:id/present", record.id))}>Present</Button>
        <ButtonGroup label="Panels on narrow screens">
          <Button size="sm" variant={mobilePanel === "sorter" ? "secondary" : "ghost"} onClick={() => setMobilePanel(mobilePanel === "sorter" ? "canvas" : "sorter")}>Slides</Button>
          <Button size="sm" variant={mobilePanel === "aside" ? "secondary" : "ghost"} onClick={() => setMobilePanel(mobilePanel === "aside" ? "canvas" : "aside")}>Inspector</Button>
        </ButtonGroup>
      </div>

      <div className="px-bar" style={{ minHeight: 40 }}>
        <Tabs
          label="Editor modes"
          value={tab}
          onChange={context.setTab}
          items={[
            { id: "Design", label: "Design" },
            { id: "Insert", label: "Insert" },
            { id: "Animate", label: "Animate", count: buildOrder(editor.slide).length },
            { id: "Review", label: "Review", count: editor.deck.comments.filter((comment) => !comment.resolved).length },
            { id: "View", label: "View" },
          ]}
        />
      </div>

      <div className="px-ribbon">
        {tab === "Design" && <DesignRibbon editor={editor} context={context} />}
        {tab === "Insert" && <InsertRibbon editor={editor} context={context} />}
        {tab === "Animate" && <AnimateRibbon editor={editor} context={context} />}
        {tab === "Review" && <ReviewRibbon editor={editor} context={context} />}
        {tab === "View" && <ViewRibbon editor={editor} context={context} />}
      </div>

      <div className="px-body" data-mobile={mobilePanel}>
        <div className="px-sorter"><SlideSorter editor={editor} context={context} /></div>

        <div className="px-centre">
          <div className="px-scroll" ref={wrapRef}>
            <ConflictNotice editor={editor} />
            {editor.slide.hidden && <Notice tone="warning" title="This slide is hidden">It stays in the deck and in the notes export, but it is skipped when presenting.</Notice>}
            <SlideCanvas
                deck={editor.deck}
                slide={editor.slide}
                selectedIds={editor.selectedIds}
                onSelect={editor.setSelectedIds}
                onTransform={(updates, committed) => {
                  if (committed) {
                    if (updates.length === 0) { editor.settle("Move object"); return; }
                    // Keyboard nudges arrive committed one key at a time.
                    editor.commitSlide(
                      updates.reduce((slide, update) => updateObjects(slide, [update.id], (object) => ({ ...object, ...update.patch })), editor.slide),
                      "Nudge object",
                      true,
                    );
                    return;
                  }
                  editor.preview(updates);
                }}
                onEditText={() => context.openOverlay("properties")}
                onTableCell={(objectId, row, col, value) => editor.commitSlide(updateObjects(editor.slide, [objectId], (object) => ({
                  ...object,
                  table: object.table ? { ...object.table, rows: object.table.rows.map((line, lineIndex) => (lineIndex === row ? line.map((cell, cellIndex) => (cellIndex === col ? value : cell)) : line)) } : undefined,
                })), "Table cell")}
                onDelete={(ids) => { editor.commitSlide(removeObjects(editor.slide, ids), "Delete objects"); editor.setSelectedIds([]); }}
              scale={scale}
            />
            <Notice tone="neutral">
              Drag to move, the eight handles to resize, the round handle above to rotate. From the keyboard: Tab cycles objects, arrows move, Alt and arrows resize, square brackets rotate, Enter edits text, Delete removes.
            </Notice>
          </div>
          <div className="px-status">
            <span>Selection <strong className="ds-num">{editor.selectedIds.length}</strong></span>
            <span>Objects <strong className="ds-num">{editor.slide.objects.length}</strong></span>
            <span>Animated <strong className="ds-num">{buildOrder(editor.slide).length}</strong></span>
            <span>Zoom <strong className="ds-num">{Math.round(scale * 100)}%</strong></span>
            <span>Last action <strong>{editor.undoLabel ?? "none"}</strong></span>
          </div>
        </div>

        <div className="px-aside"><ObjectInspector editor={editor} context={context} /></div>
      </div>
    </div>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-003 — Master & Theme Editor
 * ====================================================================== */

function ThemeScreen({ context, tab }: { context: ScreenContext; tab: "Masters" | "Colours" | "Fonts" | "Layouts" }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  if (!record) return <Empty title="No deck is open" icon={<Presentation size={20} />} />;

  if (tab === "Colours") {
    const tokens = Object.keys(editor.deck.theme.colours) as ThemeColourToken[];
    const usage = (token: ThemeColourToken) => editor.deck.slides.reduce((total, slide) => total + slide.objects.filter((object) => object.text?.colourToken === token || object.shape?.fillToken === token).length, 0);
    return (
      <Grid>
        <Card span={7} eyebrow="THEME" prov="human" title="Theme colours" subtitle="Every object references a token, never a hex value">
          <Stack gap={3}>
            {tokens.map((token) => (
              <Row key={token} gap={3}>
                <span style={{ width: 36, height: 36, borderRadius: 8, background: editor.deck.theme.colours[token], border: "1px solid var(--border-strong)", flex: "none" }} aria-hidden />
                <div className="ds-grow">
                  <strong>{token}</strong>
                  <p className="ds-subtle">{usage(token)} object{usage(token) === 1 ? "" : "s"} use this token</p>
                </div>
                <TextInput
                  aria-label={`${token} colour`}
                  value={editor.deck.theme.colours[token]}
                  style={{ width: 120, fontFamily: "var(--font-mono)" }}
                  onChange={(event) => editor.commit({ ...editor.deck, theme: { ...editor.deck.theme, colours: { ...editor.deck.theme.colours, [token]: event.target.value } } }, "Theme colour")}
                />
              </Row>
            ))}
          </Stack>
          <Notice tone="info">Because objects store a token, changing a colour here updates every slide at once and no object needs touching.</Notice>
        </Card>
        <Card span={5} eyebrow="PREVIEW" prov="human" title="Preview" subtitle={editor.deck.slides[0]?.title ?? ""}>
          <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
            <MiniSlide deck={editor.deck} slide={editor.slide} width={320} />
          </div>
        </Card>
      </Grid>
    );
  }

  if (tab === "Fonts") {
    const capability = capabilityById("site.publish");
    return (
      <Grid>
        <Card span={7} eyebrow="FONTS" title="Typefaces" subtitle="Only fonts bundled with this workspace can be used">
          <Stack gap={3}>
            <Field label="Heading font">
              <Select aria-label="Heading font" value={editor.deck.theme.headingFont} onChange={(event) => editor.commit({ ...editor.deck, theme: { ...editor.deck.theme, headingFont: event.target.value } }, "Heading font")}>
                {["IBM Plex Sans Condensed", "Inter", "ui-serif", "IBM Plex Mono"].map((font) => <option key={font} value={font}>{font}</option>)}
              </Select>
            </Field>
            <Field label="Body font">
              <Select aria-label="Body font" value={editor.deck.theme.bodyFont} onChange={(event) => editor.commit({ ...editor.deck, theme: { ...editor.deck.theme, bodyFont: event.target.value } }, "Body font")}>
                {["IBM Plex Sans Condensed", "Inter", "ui-serif", "IBM Plex Mono"].map((font) => <option key={font} value={font}>{font}</option>)}
              </Select>
            </Field>
            <Field label={`Heading scale ${editor.deck.theme.headingScale.toFixed(2)}×`}>
              <input
                type="range" min={80} max={125} value={Math.round(editor.deck.theme.headingScale * 100)}
                aria-label="Heading scale"
                onChange={(event) => editor.commit({ ...editor.deck, theme: { ...editor.deck.theme, headingScale: Number(event.target.value) / 100 } }, "Heading scale")}
                style={{ width: "100%" }}
              />
            </Field>
          </Stack>
          <Notice tone="warning" title={`${capability?.provider ?? "Font hosting"} is not connected`}>
            A brand typeface cannot be fetched here. Where an import asked for one, the substitution is listed rather than quietly rendered in something else.
          </Notice>
        </Card>
        <Card span={5} eyebrow="IMPORT" title="Substitutions on import" subtitle={`${editor.deck.theme.fontSubstitutions.length} recorded`}>
          {editor.deck.theme.fontSubstitutions.length === 0 ? <Empty title="Nothing was substituted" /> : (
            <Properties rows={editor.deck.theme.fontSubstitutions.map((item) => ({ label: item.requested, value: `rendered as ${item.used}` }))} />
          )}
          {editor.deck.importNotes.length > 0 && (
            <Stack gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
              {editor.deck.importNotes.map((note) => <Notice key={note} tone="warning">{note}</Notice>)}
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  if (tab === "Layouts") {
    return (
      <Grid>
        {editor.deck.layouts.map((layout) => {
          const used = editor.deck.slides.filter((slide) => slide.layoutId === layout.id);
          return (
            <Card
              key={layout.id}
              span={4}
              eyebrow="MASTER"
              title={layout.name}
              subtitle={`${layout.placeholders.length} placeholders · used by ${used.length} slide${used.length === 1 ? "" : "s"}`}
              footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("global apply review", { layoutId: layout.id })}>Apply to this slide</Button>}
            >
              <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", background: colour(editor.deck, layout.backgroundToken) }}>
                <MiniSlide deck={editor.deck} slide={slideFromLayout(layout, layout.name)} width={300} />
              </div>
              <Properties rows={layout.placeholders.map((placeholder) => ({ label: placeholder.role, value: `${placeholder.x},${placeholder.y} · ${placeholder.w}×${placeholder.h}` }))} />
            </Card>
          );
        })}
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Theme">
          <Select aria-label="Theme"
            value={editor.deck.theme.id}
            onChange={(event) => {
              const next = (editor.deck.themes.find((theme) => theme.id === event.target.value) ?? THEMES[0]);
              context.openOverlay("Theme editor", { themeId: next.id });
            }}
          >
            {editor.deck.themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            {editor.deck.themes.every((theme) => theme.id !== editor.deck.theme.id) && <option value={editor.deck.theme.id}>{editor.deck.theme.name}</option>}
          </Select>
        </Field>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={() => context.openOverlay("font resolver")}>Font resolver</Button>
      </Row>
      <Grid>
        {editor.deck.slides.map((slide, index) => {
          const drifted = customisedObjects(editor.deck, slide);
          return (
            <Card key={slide.id} span={4} eyebrow="SLIDE" prov="human" title={`${index + 1}. ${slide.title}`} subtitle={layoutById(editor.deck, slide.layoutId).name}
              actions={drifted.length > 0 ? <Pill tone="warning">{drifted.length} customised</Pill> : <Pill tone="success">On master</Pill>}
              footer={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("global apply review", { slideId: slide.id })}>Re-apply master</Button>}>
              <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
                <MiniSlide deck={editor.deck} slide={slide} width={300} />
              </div>
              {drifted.length > 0 && (
                <Notice tone="warning" title="Customised objects will be kept">{drifted.map((object) => object.name).join(", ")} sit away from the master and are left alone unless you force the change.</Notice>
              )}
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-004 — Charts & Data
 * ====================================================================== */

function DataScreen({ context, tab }: { context: ScreenContext; tab: "Charts" | "Tables" | "Sources" | "Refresh" }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const workbooks = useCollection("workbooks");
  if (!record) return <Empty title="No deck is open" icon={<Presentation size={20} />} />;

  const chartObjects = editor.deck.slides.flatMap((slide) => slide.objects.filter((object) => object.type === "chart").map((object) => ({ slide, object })));
  const tableObjects = editor.deck.slides.flatMap((slide) => slide.objects.filter((object) => object.type === "table").map((object) => ({ slide, object })));

  if (tab === "Tables") {
    return (
      <Stack gap={4}>
        {tableObjects.length === 0 ? <Empty title="No tables in this deck" icon={<Table2 size={20} />} /> : tableObjects.map(({ slide, object }) => (
          <Card key={object.id} eyebrow="TABLE" prov="human" title={`${slide.title} — ${object.name}`} subtitle={`${object.table?.rows.length ?? 0} rows × ${object.table?.rows[0]?.length ?? 0} columns`}>
            <div style={{ overflowX: "auto" }}>
              <table className="ds-table" style={{ borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <tbody>
                  {(object.table?.rows ?? []).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, colIndex) => (
                        rowIndex === 0 && object.table?.header
                          ? <th key={colIndex} scope="col" style={{ border: "1px solid var(--border-default)", padding: "4px 8px", textAlign: "start" }}>{cell}</th>
                          : <td key={colIndex} style={{ border: "1px solid var(--border-default)", padding: "4px 8px" }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </Stack>
    );
  }

  if (tab === "Sources") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A chart names the workbook, sheet and range it came from">
          Nothing on a slide carries a figure with no provenance. Where a chart is not linked, it says so.
        </Notice>
        {chartObjects.length === 0 ? <Empty title="No charts in this deck" icon={<BarChart3 size={20} />} /> : (
          <DataGrid
            rows={chartObjects.map(({ slide, object }) => ({ id: object.id, slide: slide.title, object, chart: object.chart! }))}
            rowId={(row) => row.id}
            label="Chart sources"
            columns={[
              { key: "slide", header: "Slide", primary: true, cell: (row) => row.slide },
              { key: "chart", header: "Chart", cell: (row) => row.chart.title },
              { key: "source", header: "Source", cell: (row) => (row.chart.linked ? `${row.chart.sourceSheetName ?? "?"}!${row.chart.sourceRef ?? "?"}` : <Pill tone="neutral">Held in the slide</Pill>) },
              {
                key: "workbook", header: "Workbook",
                cell: (row) => {
                  const workbook = workbooks.find((item) => item.id === row.chart.sourceWorkbookId);
                  return workbook ? workbook.title : <Pill tone="warning">Not recorded</Pill>;
                },
              },
              { key: "captured", header: "Captured", align: "end", cell: (row) => (row.chart.capturedAt ? context.relative(row.chart.capturedAt) : "Never") },
            ]}
            onOpen={(id) => context.openOverlay("chart inspector", { objectId: id })}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Refresh") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="human" label="Charts" value={String(chartObjects.length)} />
          <Stat prov="human" label="Linked" value={String(chartObjects.filter(({ object }) => object.chart?.linked).length)} />
          <Stat
            label="Stale"
            value={String(chartObjects.filter(({ object }) => {
              const workbook = workbooks.find((item) => item.id === object.chart?.sourceWorkbookId);
              return chartFreshness(object.chart!, workbook?.updatedAt).state === "stale";
            }).length)}
            meta="Source changed after the snapshot"
          />
        </StatRow>
        {chartObjects.length === 0 ? <Empty title="No charts to refresh" icon={<BarChart3 size={20} />} /> : (
          <Stack gap={3}>
            {chartObjects.map(({ slide, object }) => {
              const workbook = workbooks.find((item) => item.id === object.chart?.sourceWorkbookId);
              const freshness = chartFreshness(object.chart!, workbook?.updatedAt);
              return (
                <Card key={object.id} eyebrow="SNAPSHOT" title={`${slide.title} — ${object.chart!.title}`} subtitle={freshness.label}
                  actions={<Pill tone={freshness.state === "stale" ? "warning" : freshness.state === "fresh" ? "success" : "neutral"}>{freshness.state}</Pill>}
                  footer={<>
                    <Button size="sm" variant="secondary" disabled={!workbook} onClick={() => context.openOverlay("Dataset picker", { objectId: object.id })}>Refresh from the workbook</Button>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("unlink warning", { objectId: object.id })}>Unlink</Button>
                  </>}>
                  <Properties rows={[
                    { label: "Workbook", value: workbook?.title ?? "Not in this workspace" },
                    { label: "Range", value: object.chart!.sourceRef ?? "—" },
                    { label: "Snapshot taken", value: object.chart!.capturedAt ? context.dateTime(object.chart!.capturedAt) : "Never" },
                    { label: "Workbook changed", value: workbook ? context.dateTime(workbook.updatedAt) : "Unavailable" },
                  ]} />
                  {freshness.state === "stale" && (
                    <Notice tone="warning" title="This slide shows older numbers than the workbook holds">
                      The slide keeps its snapshot on purpose: a deck that silently changed under a presenter would be worse. Refresh deliberately before the meeting.
                    </Notice>
                  )}
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2}>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("Dataset picker", { mode: "create" })}>Insert a chart from a workbook</Button>
        <span className="ds-grow" />
        {String(record.fields.pendingChart ?? "") && <Pill tone="info">A chart is queued from Sheets</Pill>}
      </Row>
      {chartObjects.length === 0 ? (
        <Empty title="No charts on any slide" icon={<BarChart3 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Dataset picker", { mode: "create" })}>Insert a chart</Button>}>
          A chart on a slide holds the numbers it was given and records the range they came from.
        </Empty>
      ) : (
        <Grid>
          {chartObjects.map(({ slide, object }) => (
            <Card key={object.id} span={6} eyebrow="CHART" prov="human" title={object.chart!.title} subtitle={`On ${slide.title}`}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("chart inspector", { objectId: object.id })}>Inspect</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  const target = editor.deck.slides.find((item) => item.id === slide.id)!;
                  editor.commit({
                    ...editor.deck,
                    slides: editor.deck.slides.map((item) => (item.id === slide.id
                      ? updateObjects(target, [object.id], (current) => ({ ...current, chart: current.chart ? { ...current.chart, kind: current.chart.kind === "bar" ? "line" : "bar" } : undefined }))
                      : item)),
                  }, "Chart type");
                }}>Switch bar / line</Button>
              </>}>
              <div style={{ height: 220, position: "relative" }}>
                <ObjectBody object={{ ...object, w: 460, h: 220 }} deck={editor.deck} readOnly />
              </div>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-005 — Transitions & Animation
 * ====================================================================== */

function AnimationScreen({ context, tab }: { context: ScreenContext; tab: "Slides" | "Objects" | "Timing" | "Preview" }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);

  const order = useMemo(() => buildOrder(editor.slide), [editor.slide]);

  useEffect(() => {
    if (!playing) return;
    setRevealed(new Set());
    if (editor.deck.reduceMotion) {
      setRevealed(new Set(order.map((object) => object.id)));
      setPlaying(false);
      return;
    }
    const timers: number[] = [];
    let elapsed = 0;
    for (const object of order) {
      elapsed += object.animation!.delayMs + object.animation!.durationMs;
      timers.push(window.setTimeout(() => setRevealed((current) => new Set([...current, object.id])), elapsed));
    }
    timers.push(window.setTimeout(() => setPlaying(false), elapsed + 200));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [playing, order, editor.deck.reduceMotion]);

  if (!record) return <Empty title="No deck is open" icon={<Presentation size={20} />} />;

  if (tab === "Slides") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A transition belongs to the slide it moves into">
          Keep them short. Anything over 600ms is flagged in the accessibility review.
        </Notice>
        <DataGrid
          rows={editor.deck.slides.map((slide, index) => ({ ...slide, id: slide.id, position: index + 1 }))}
          rowId={(row) => row.id}
          label="Slide transitions"
          filterable={false}
          columns={[
            { key: "position", header: "#", align: "end", cell: (row) => String(row.position) },
            { key: "title", header: "Slide", primary: true, cell: (row) => row.title },
            {
              key: "effect", header: "Transition",
              cell: (row) => (
                <Select
                  aria-label={`Transition for ${row.title}`}
                  value={row.transition.effect}
                  onChange={(event) => editor.commit({ ...editor.deck, slides: editor.deck.slides.map((slide) => (slide.id === row.id ? { ...slide, transition: { ...slide.transition, effect: event.target.value as Slide["transition"]["effect"] } } : slide)) }, "Transition")}
                >
                  <option value="none">None</option><option value="fade">Fade</option><option value="push">Push</option><option value="wipe">Wipe</option>
                </Select>
              ),
            },
            {
              key: "duration", header: "Duration", align: "end",
              cell: (row) => (
                <TextInput
                  aria-label={`Transition duration for ${row.title}`}
                  inputMode="numeric" align="end" style={{ width: 86 }}
                  value={String(row.transition.durationMs)}
                  onChange={(event) => editor.commit({ ...editor.deck, slides: editor.deck.slides.map((slide) => (slide.id === row.id ? { ...slide, transition: { ...slide.transition, durationMs: Number(event.target.value) || 0 } } : slide)) }, "Transition duration")}
                />
              ),
            },
            { key: "objects", header: "Animated objects", align: "end", cell: (row) => String(buildOrder(row).length) },
          ]}
        />
      </Stack>
    );
  }

  if (tab === "Objects") {
    return (
      <Stack gap={4}>
        {editor.slide.objects.length === 0 ? <Empty title="This slide has no objects" /> : (
          <DataGrid
            rows={editor.slide.objects.map((object) => ({ ...object, id: object.id }))}
            rowId={(row) => row.id}
            label="Object animations"
            filterable={false}
            columns={[
              { key: "name", header: "Object", primary: true, cell: (row) => row.name },
              { key: "type", header: "Kind", cell: (row) => <Pill tone="accent">{row.type}</Pill> },
              {
                key: "effect", header: "Effect",
                cell: (row) => (
                  <Select
                    aria-label={`Effect for ${row.name}`}
                    value={row.animation?.effect ?? "none"}
                    onChange={(event) => {
                      const effect = event.target.value as ObjectAnimation["effect"];
                      const next = updateObjects(editor.slide, [row.id], (object) => ({
                        ...object,
                        animation: effect === "none" ? undefined : {
                          effect, order: object.animation?.order ?? buildOrder(editor.slide).length + 1,
                          durationMs: object.animation?.durationMs ?? 320, delayMs: object.animation?.delayMs ?? 0,
                          easing: object.animation?.easing ?? "ease-out", trigger: object.animation?.trigger ?? "onAppear",
                        },
                      }));
                      editor.commitSlide(resequenceAnimations(next), "Animation effect");
                    }}
                  >
                    <option value="none">None</option><option value="fade">Fade</option><option value="riseUp">Rise up</option>
                    <option value="slideLeft">Slide left</option><option value="scaleIn">Scale in</option>
                  </Select>
                ),
              },
              { key: "order", header: "Order", align: "end", cell: (row) => (row.animation ? String(row.animation.order) : "—") },
              {
                key: "trigger", header: "Trigger",
                cell: (row) => (row.animation ? (
                  <Select
                    aria-label={`Trigger for ${row.name}`}
                    value={row.animation.trigger}
                    onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [row.id], (object) => ({ ...object, animation: object.animation ? { ...object.animation, trigger: event.target.value as ObjectAnimation["trigger"] } : undefined })), "Trigger")}
                  >
                    <option value="onAppear">On appear</option><option value="onClick">On click</option>
                  </Select>
                ) : "—"),
              },
              {
                key: "move", header: "Sequence", align: "end",
                cell: (row) => (row.animation ? (
                  <Row gap={1}>
                    <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${row.name} earlier in the build`} onClick={() => {
                      const next = updateObjects(editor.slide, [row.id], (object) => ({ ...object, animation: object.animation ? { ...object.animation, order: Math.max(1, object.animation.order - 1.5) } : undefined }));
                      editor.commitSlide(resequenceAnimations(next), "Sequence");
                    }}><ArrowUpToLine size={13} /></Button>
                    <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${row.name} later in the build`} onClick={() => {
                      const next = updateObjects(editor.slide, [row.id], (object) => ({ ...object, animation: object.animation ? { ...object.animation, order: object.animation.order + 1.5 } : undefined }));
                      editor.commitSlide(resequenceAnimations(next), "Sequence");
                    }}><ArrowDownToLine size={13} /></Button>
                  </Row>
                ) : "—"),
              },
            ]}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Timing") {
    const total = order.reduce((sum, object) => sum + object.animation!.delayMs + object.animation!.durationMs, 0);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="human" label="Animated objects" value={String(order.length)} />
          <Stat prov="human" label="Build length" value={`${(total / 1000).toFixed(2)}s`} meta={total > 2500 ? "Long for one slide" : "Reasonable"} />
          <Stat prov="human" label="Clicks needed" value={String(order.filter((object) => object.animation!.trigger === "onClick").length)} />
        </StatRow>
        <Card eyebrow="TIMELINE" prov="human" title="Timeline" subtitle={`${editor.slide.title} · each bar is one object's entrance`}>
          {order.length === 0 ? <Empty title="Nothing animates on this slide" /> : (
            <div className="px-timeline">
              {order.map((object) => {
                const start = order.slice(0, order.indexOf(object)).reduce((sum, item) => sum + item.animation!.delayMs + item.animation!.durationMs, 0) + object.animation!.delayMs;
                const width = object.animation!.durationMs;
                return (
                  <div key={object.id}>
                    <Row gap={2}><span className="ds-grow ds-truncate">{object.name}</span><span className="ds-subtle">{start}ms → {start + width}ms</span></Row>
                    <div className="px-track">
                      <button
                        type="button"
                        className="px-clip"
                        aria-label={`${object.name}: starts at ${start} milliseconds, runs for ${width} milliseconds`}
                        style={{ left: `${(start / Math.max(total, 1)) * 100}%`, width: `${Math.max(4, (width / Math.max(total, 1)) * 100)}%` }}
                        onClick={() => editor.setSelectedIds([object.id])}
                      >{object.animation!.effect}</button>
                    </div>
                    <Row gap={2} wrap style={{ marginBlockStart: 4 }}>
                      <Field label="Delay (ms)">
                        <TextInput aria-label="Delay (ms)"
                          inputMode="numeric" align="end" style={{ width: 90 }}
                          value={String(object.animation!.delayMs)}
                          onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, animation: item.animation ? { ...item.animation, delayMs: Number(event.target.value) || 0 } : undefined })), "Delay")}
                        />
                      </Field>
                      <Field label="Duration (ms)">
                        <TextInput aria-label="Duration (ms)"
                          inputMode="numeric" align="end" style={{ width: 90 }}
                          value={String(object.animation!.durationMs)}
                          onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, animation: item.animation ? { ...item.animation, durationMs: Number(event.target.value) || 0 } : undefined })), "Duration")}
                        />
                      </Field>
                      <Field label="Easing">
                        <Select aria-label="Easing"
                          value={object.animation!.easing}
                          onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, animation: item.animation ? { ...item.animation, easing: event.target.value as ObjectAnimation["easing"] } : undefined })), "Easing")}
                        >
                          <option value="linear">linear</option><option value="ease-out">ease-out</option><option value="ease-in-out">ease-in-out</option>
                        </Select>
                      </Field>
                    </Row>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant="primary" icon={<Play size={15} />} onClick={() => setPlaying(true)} disabled={playing}>Play the build</Button>
        <Button variant="secondary" onClick={() => setRevealed(new Set(order.map((object) => object.id)))}>Show everything</Button>
        <Switch label="Reduce motion" checked={editor.deck.reduceMotion} onChange={(next) => editor.commit({ ...editor.deck, reduceMotion: next }, "Reduce motion")} />
        <span className="ds-grow" />
        <Button variant="ghost" onClick={() => context.openOverlay("accessibility review")}>Accessibility review</Button>
      </Row>
      {editor.deck.reduceMotion && (
        <Notice tone="info" title="Motion is disabled">
          Everything appears at once. The slide must still read in that state, which is what the accessibility review checks.
        </Notice>
      )}
      <SlideCanvas
        deck={editor.deck}
        slide={editor.slide}
        selectedIds={[]}
        onSelect={() => undefined}
        onTransform={() => undefined}
        readOnly
        scale={0.72}
        revealed={editor.deck.reduceMotion ? undefined : revealed}
        showGuides={false}
      />
      <Card eyebrow="REDUCED MOTION" prov="human" title="With motion disabled" subtitle="The same slide, everything shown">
        <SlideCanvas deck={editor.deck} slide={editor.slide} selectedIds={[]} onSelect={() => undefined} onTransform={() => undefined} readOnly scale={0.48} showGuides={false} />
      </Card>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-006 — Presenter Mode
 * ====================================================================== */

function PresenterScreen({ context, tab }: { context: ScreenContext; tab: "Audience" | "Presenter" | "Rehearsal" }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const session = useStore(presenterUi);
  const { elapsed, running, fullscreen, laps } = session;
  const setRunning = (value: boolean) => presenterUi.set((state) => ({ ...state, running: value }));
  const setFullscreen = (value: boolean) => presenterUi.set((state) => ({ ...state, fullscreen: value }));
  useGuardRefresh(context);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => presenterUi.set((state) => ({ ...state, elapsed: state.elapsed + 1 })), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const visible = useMemo(() => editor.deck.slides.filter((slide) => !slide.hidden), [editor.deck.slides]);
  const position = Math.max(0, visible.findIndex((slide) => slide.id === editor.slide.id));
  const current = visible[position] ?? visible[0];
  const next = visible[position + 1];

  const advance = (delta: number) => { advanceSlides(editor, delta); };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!fullscreen) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") { event.preventDefault(); advance(1); }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); advance(-1); }
      if (event.key === "Escape") { event.preventDefault(); setFullscreen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!record) return <Empty title="No deck is open" icon={<Presentation size={20} />} />;
  if (!current) return <Empty title="Every slide is hidden" icon={<EyeOff size={20} />}>Unhide a slide in the editor before presenting.</Empty>;

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  if (fullscreen) {
    return (
      <>
        <div className="px-audience" role="region" aria-label="Audience display">
          <SlideCanvas deck={editor.deck} slide={current} selectedIds={[]} onSelect={() => undefined} onTransform={() => undefined} readOnly scale={Math.min(1.6, (window.innerWidth - 40) / SLIDE_W)} showGuides={false} />
          {(session.annotations[current.id] ?? []).length > 0 && (
            <div className="px-annotations" role="note" aria-label="Live annotations" style={{ position: "absolute", insetInline: 24, bottom: 72, display: "grid", gap: 6 }}>
              {(session.annotations[current.id] ?? []).map((item) => (
                <div key={item.id} style={{ background: "var(--papaya-300, #FFAE7C)", color: "var(--ink-900, #1A1917)", padding: "6px 10px", borderRadius: 6, fontWeight: 600, justifySelf: "start" }}>{item.text}</div>
              ))}
            </div>
          )}
        </div>
        <div className="px-audience-bar">
          <Button size="sm" variant="secondary" onClick={() => advance(-1)}>Back</Button>
          <Button size="sm" variant="primary" onClick={() => advance(1)}>Advance</Button>
          <span className="ds-grow ds-num" style={{ color: "var(--paper-0)" }}>Slide {position + 1} of {visible.length} · {clock}</span>
          <span style={{ color: "var(--paper-300)", fontSize: "var(--text-2xs)" }}>Speaker notes are not on this display</span>
          <Button size="sm" variant="ghost" onClick={() => setFullscreen(false)}>End</Button>
        </div>
      </>
    );
  }

  if (tab === "Audience") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="This is what the room sees">
          Speaker notes never render here. Opening the audience display asks for confirmation first, because a second screen is often already mirrored.
        </Notice>
        <Row gap={2} wrap>
          <Button variant="primary" icon={<MonitorPlay size={15} />} onClick={() => context.openOverlay("access confirmation")}>Open the audience display</Button>
          <Button variant="secondary" onClick={() => advance(-1)} disabled={position === 0}>Back</Button>
          <Button variant="secondary" onClick={() => advance(1)} disabled={position >= visible.length - 1}>Advance</Button>
          <span className="ds-grow" />
          <Pill tone="neutral">Slide {position + 1} of {visible.length}</Pill>
        </Row>
        <SlideCanvas deck={editor.deck} slide={current} selectedIds={[]} onSelect={() => undefined} onTransform={() => undefined} readOnly scale={0.78} showGuides={false} />
      </Stack>
    );
  }

  if (tab === "Rehearsal") {
    const totalTarget = visible.reduce((sum, slide) => sum + (slide.targetSeconds ?? 0), 0);
    const totalActual = Object.values(laps).reduce((sum, value) => sum + value, 0);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="human" label="Elapsed" value={clock} meta={running ? "Running" : "Paused"} />
          <Stat label="Target" value={totalTarget ? `${Math.floor(totalTarget / 60)}:${String(totalTarget % 60).padStart(2, "0")}` : "Unavailable"} unavailable={!totalTarget} meta={totalTarget ? `${visible.length} slides` : "No slide has a target time"} />
          <Stat prov="human" label="Slides timed" value={`${Object.keys(laps).length} of ${visible.length}`} />
          <Stat label="Over or under" value={totalTarget && totalActual ? `${totalActual - totalTarget > 0 ? "+" : ""}${totalActual - totalTarget}s` : "Unavailable"} unavailable={!totalTarget || !totalActual} />
        </StatRow>
        <Row gap={2} wrap>
          <Button variant={running ? "secondary" : "primary"} onClick={() => setRunning(!running)}>{running ? "Pause" : "Start"}</Button>
          <Button variant="ghost" onClick={() => presenterUi.set((state) => ({ ...state, running: false, elapsed: 0, laps: {}, lapStart: 0 }))}>Reset</Button>
          <Button variant="secondary" onClick={() => advance(1)}>Next slide</Button>
          <span className="ds-grow" />
          <Button variant="ghost" onClick={() => context.openOverlay("rehearsal report")}>Report</Button>
        </Row>
        <DataGrid
          rows={visible.map((slide, index) => ({ ...slide, id: slide.id, position: index + 1, actual: laps[slide.id] }))}
          rowId={(row) => row.id}
          label="Rehearsal times"
          filterable={false}
          rowTone={(row) => (row.targetSeconds && row.actual && row.actual > row.targetSeconds * 1.3 ? "warning" : undefined)}
          columns={[
            { key: "position", header: "#", align: "end", cell: (row) => String(row.position) },
            { key: "title", header: "Slide", primary: true, cell: (row) => row.title },
            { key: "target", header: "Target", align: "end", cell: (row) => (row.targetSeconds ? `${row.targetSeconds}s` : <span className="ds-subtle">Not set</span>) },
            { key: "actual", header: "Rehearsed", align: "end", cell: (row) => (row.actual !== undefined ? `${row.actual}s` : <span className="ds-subtle">Not yet</span>) },
            {
              key: "bar", header: "Against target",
              cell: (row) => (row.targetSeconds && row.actual !== undefined
                ? <Meter value={row.actual} max={Math.max(row.targetSeconds, row.actual)} label={`${row.title} time`} tone={row.actual > row.targetSeconds ? "warning" : "success"} />
                : <span className="ds-subtle">—</span>),
            },
          ]}
        />
      </Stack>
    );
  }

  return (
    <div className="px-presenter">
      <div className="px-presenter-main">
        <Row gap={2} wrap>
          <Pill tone="accent">Slide {position + 1} of {visible.length}</Pill>
          <span className="px-timer ds-num">{clock}</span>
          <span className="ds-grow" />
          <Button size="sm" variant={running ? "secondary" : "primary"} onClick={() => setRunning(!running)}>{running ? "Pause" : "Start timer"}</Button>
          <Button size="sm" variant="secondary" onClick={() => advance(-1)} disabled={position === 0}>Back</Button>
          <Button size="sm" variant="primary" onClick={() => advance(1)} disabled={position >= visible.length - 1}>Advance</Button>
          <Button size="sm" variant="ghost" icon={<MonitorPlay size={14} />} onClick={() => context.openOverlay("access confirmation")}>Audience display</Button>
        </Row>
        <SlideCanvas deck={editor.deck} slide={current} selectedIds={[]} onSelect={() => undefined} onTransform={() => undefined} readOnly scale={0.62} showGuides={false} />
      </div>
      <div className="px-presenter-side">
        <Card eyebrow="SPEAKER NOTES" prov="human" title="Speaker notes" subtitle={current.targetSeconds ? `Target ${current.targetSeconds}s` : "No target time set"}>
          <div className="px-notes">{current.notes.trim() || "No notes on this slide."}</div>
          <Notice tone="neutral">Private to this view. They are not on the audience display and are not in the HTML export unless you ask for them.</Notice>
        </Card>
        <Card eyebrow="NEXT" prov="human" title="Next slide" subtitle={next ? next.title : "This is the last slide"}>
          {next ? (
            <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
              <MiniSlide deck={editor.deck} slide={next} width={300} />
            </div>
          ) : <Empty title="End of the deck" />}
        </Card>
        <Card eyebrow="REMOTE" title="Remote control" subtitle="Keyboard only">
          <Properties rows={[
            { label: "Advance", value: "Right arrow, space or Page down" },
            { label: "Back", value: "Left arrow or Page up" },
            { label: "End", value: "Escape" },
          ]} />
          <Notice tone="warning" title="No phone remote is connected">
            A remote would need a pairing service. The keyboard drives the audience display, and both views stay in this browser.
          </Notice>
        </Card>
      </div>
    </div>
  );
}

/* ====================================================================== *
 * ARL-PRESENT-007 — Review & Publish
 * ====================================================================== */

function ReviewScreen({ context, tab }: { context: ScreenContext; tab: "Comments" | "History" | "Export" | "Publish" }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const members = useCollection("members");
  const [note, setNote] = useState("");
  if (!record) return <Empty title="No deck is open" icon={<Presentation size={20} />} />;

  if (tab === "History") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Autosave does not create a version per drag">
          Object moves are written with history suppressed, so the version list holds deliberate saves.
        </Notice>
        {record.history.length === 0 ? <Empty title="No stored version yet" /> : (
          <DataGrid
            rows={record.history.map((snapshot, index) => ({ ...snapshot, id: `${snapshot.at}-${index}` }))}
            rowId={(row) => row.id}
            label="Deck versions"
            columns={[
              { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "slides", header: "Slides", align: "end", cell: (row) => String(readDeck(row.body).slides.length) },
              { key: "objects", header: "Objects", align: "end", cell: (row) => String(readDeck(row.body).slides.reduce((total, slide) => total + slide.objects.length, 0)) },
              { key: "status", header: "Status", cell: (row) => <Pill>{String(row.status).replace("_", " ")}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("Version comparison", { snapshotId: id })}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Export") {
    return (
      <Grid>
        <Card span={6} eyebrow="EXPORT" title="Export" subtitle="Deterministic renderers, run in this browser">
          <Stack gap={3}>
            <Properties rows={[
              { label: "HTML", value: "One section per visible slide, absolutely positioned, with a table under every chart" },
              { label: "Speaker notes", value: "Plain text, one block per slide" },
              { label: "PDF", value: <Pill tone="warning">Print the HTML from the browser</Pill> },
              { label: "PPTX", value: <Pill tone="warning">Not implemented</Pill> },
            ]} />
            <Row gap={2} wrap>
              <Button variant="primary" icon={<FileDown size={15} />} onClick={() => context.openOverlay("export settings")}>Export settings</Button>
              <Button variant="secondary" onClick={() => {
                downloadFile(`${record.title}.html`, toHtml(editor.deck, record.title, false), "text/html");
                editor.commit({ ...editor.deck, exports: [{ id: nextId("ex"), at: context.now.toISOString(), format: "HTML", note: "Slides only" }, ...editor.deck.exports] }, "Export HTML");
              }}>HTML now</Button>
              <Button variant="ghost" onClick={() => downloadFile(`${record.title} - notes.txt`, notesToText(editor.deck, record.title), "text/plain")}>Speaker notes</Button>
            </Row>
            <Notice tone="warning" title="PPTX is not produced here">
              Writing a real .pptx needs an Office XML writer that is not bundled. Calling the HTML export a PowerPoint file would be untrue, so it is named HTML.
            </Notice>
          </Stack>
        </Card>
        <Card span={6} eyebrow="EXPORT" prov="human" title="Export quality" subtitle="Checked against the object graph">
          {(() => {
            const findings = reviewDeck(editor.deck);
            const bleed = findings.filter((finding) => finding.id.startsWith("bleed-"));
            const charts = editor.deck.slides.flatMap((slide) => slide.objects.filter((object) => object.type === "chart"));
            return (
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Visible slides", value: String(editor.deck.slides.filter((slide) => !slide.hidden).length) },
                  { label: "Objects exported", value: String(editor.deck.slides.filter((slide) => !slide.hidden).reduce((total, slide) => total + slide.objects.length, 0)) },
                  { label: "Charts with a data table", value: `${charts.length} of ${charts.length}` },
                  { label: "Objects cropped at the edge", value: String(bleed.length) },
                ]} />
                {bleed.length > 0 && <Notice tone="warning" title={`${bleed.length} object${bleed.length === 1 ? "" : "s"} extend past the slide`}>{bleed.slice(0, 3).map((finding) => finding.message).join(" ")}</Notice>}
                {editor.deck.exports.length > 0 && (
                  <Stack gap={1}>
                    <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Recent exports</span>
                    {editor.deck.exports.slice(0, 5).map((entry) => (
                      <Row key={entry.id} gap={2}><Pill tone="neutral">{entry.format}</Pill><span className="ds-grow">{entry.note}</span><span className="ds-subtle">{context.relative(entry.at)}</span></Row>
                    ))}
                  </Stack>
                )}
              </Stack>
            );
          })()}
        </Card>
      </Grid>
    );
  }

  if (tab === "Publish") {
    const active = editor.deck.exports.filter((entry) => entry.scope && !entry.revokedAt);
    return (
      <Grid>
        <Card span={7} eyebrow="PUBLISHING" prov="human" title="Publish" subtitle={`Status: ${record.status.replace("_", " ")}`}>
          <Stack gap={3}>
            {editor.deck.comments.filter((comment) => !comment.resolved).length > 0 && (
              <Notice tone="warning" title={`${editor.deck.comments.filter((comment) => !comment.resolved).length} comment${editor.deck.comments.filter((comment) => !comment.resolved).length === 1 ? " is" : "s are"} unresolved`}>
                Publishing is allowed, but the open comments are listed on the record so nobody has to guess whether they were seen.
              </Notice>
            )}
            <Row gap={2} wrap>
              <Button variant="primary" disabled={record.status === "published"} onClick={async () => {
                await context.mutate.patch(record.id, { status: "published" }, { expectRevision: record.revision, event: `${record.title} published in the workspace` });
                context.toast("Published", "The deck status changed on the record.");
              }}>Publish in the workspace</Button>
              <Button variant="secondary" onClick={() => {
                editor.commit({ ...editor.deck, exports: [{ id: nextId("ex"), at: context.now.toISOString(), format: "Link", note: "Workspace link", scope: "workspace" }, ...editor.deck.exports] }, "Create link");
                context.toast("Link recorded", "It is listed below with a revoke button. Nothing is served outside this browser.");
              }}>Create a workspace link</Button>
            </Row>
            {active.length > 0 && (
              <Stack gap={2}>
                {active.map((entry) => (
                  <Row key={entry.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <div className="ds-grow"><strong>{entry.scope}</strong><p className="ds-subtle">{entry.note} · {context.relative(entry.at)}</p></div>
                    <Button size="sm" variant="outline-danger" onClick={() => editor.commit({ ...editor.deck, exports: editor.deck.exports.map((item) => (item.id === entry.id ? { ...item, revokedAt: context.now.toISOString() } : item)) }, "Revoke link")}>Revoke</Button>
                  </Row>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
        <Card span={5} eyebrow="APPROVAL" prov="posted" title="Approvals" subtitle={`${editor.deck.approvals.length} recorded`}>
          {editor.deck.approvals.length === 0 ? <Empty title="Not approved yet" /> : (
            <Stack gap={2}>
              {editor.deck.approvals.map((approval) => (
                <Row key={approval.id} gap={2}>
                  <Pill tone={approval.decision === "approved" ? "success" : "warning"}>{approval.decision}</Pill>
                  <span className="ds-grow">{approval.reviewer}</span>
                  <span className="ds-subtle">{context.relative(approval.at)}</span>
                </Row>
              ))}
            </Stack>
          )}
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("approval")}>Record an approval</Button>
        </Card>
      </Grid>
    );
  }

  const findings = reviewDeck(editor.deck);
  return (
    <Grid>
      <Card span={7} eyebrow="REVIEW" prov="human" title="Comments" subtitle={`${editor.deck.comments.filter((comment) => !comment.resolved).length} open of ${editor.deck.comments.length}`}>
        <Stack gap={3}>
          {editor.deck.comments.map((comment) => {
            const slide = editor.deck.slides.find((item) => item.id === comment.slideId);
            return (
              <div key={comment.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}>
                  <strong className="ds-grow">{slide ? `${editor.deck.slides.indexOf(slide) + 1}. ${slide.title}` : "Deck"}</strong>
                  <Pill tone={comment.resolved ? "success" : "warning"}>{comment.resolved ? "Resolved" : "Open"}</Pill>
                  <span className="ds-subtle">{comment.author} · {context.relative(comment.at)}</span>
                </Row>
                <p style={{ marginBlock: 6 }}>{comment.body}</p>
                <Row gap={2}>
                  {slide && <Button size="sm" variant="ghost" onClick={() => { editor.selectSlide(editor.deck.slides.indexOf(slide)); context.navigate(context.path("/o/:org/present/decks/:id", record.id)); }}>Go to slide</Button>}
                  <Button size="sm" variant="secondary" onClick={() => editor.commit({ ...editor.deck, comments: editor.deck.comments.map((item) => (item.id === comment.id ? { ...item, resolved: !item.resolved } : item)) }, "Resolve comment")}>
                    {comment.resolved ? "Reopen" : "Resolve"}
                  </Button>
                </Row>
              </div>
            );
          })}
          {editor.deck.comments.length === 0 && <Empty title="No comments" icon={<MessageSquare size={20} />} />}
          <Row gap={2}>
            <TextInput aria-label="Comment on this deck" placeholder={`Comment on slide ${editor.deck.index + 1}`} value={note} onChange={(event) => setNote(event.target.value)} />
            <Button variant="secondary" disabled={!note.trim()} onClick={() => {
              editor.commit({
                ...editor.deck,
                comments: [{ id: nextId("cm"), slideId: editor.slide.id, author: context.actor, at: context.now.toISOString(), body: note.trim(), resolved: false }, ...editor.deck.comments],
              }, "Add comment");
              setNote("");
            }}>Comment</Button>
          </Row>
        </Stack>
      </Card>
      <Card span={5} eyebrow="REVIEW" prov="human" title="Brand and readability" subtitle={`${findings.length} findings, computed from the object graph`}>
        {findings.length === 0 ? <Notice tone="success" title="Nothing flagged">Every slide has a title, every image has alternative text and no text is under 14px.</Notice> : (
          <Stack gap={2}>
            {findings.map((finding) => (
              <Notice key={finding.id} tone={finding.severity === "warning" ? "warning" : "info"}>{finding.message}</Notice>
            ))}
          </Stack>
        )}
        <Notice tone="neutral" >No model is called. These are rules over the object graph, so the same deck always produces the same findings.</Notice>
      </Card>
      <Card span={12} eyebrow="ROSTER" prov="human" title="Reviewers" subtitle="From the workspace roster">
        <Row gap={2} wrap>
          {members.filter((member) => member.fields.kind === "human").slice(0, 6).map((member) => (
            <Pill key={member.id}>{member.title}</Pill>
          ))}
        </Row>
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function NewDeck({ context, close }: { context: ScreenContext; close: () => void }) {
  const decks = useCollection("decks");
  const { org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [templateId, setTemplateId] = useState("");
  const duplicate = decks.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());
  const templates = decks.filter((record) => record.fields.isTemplate === true);
  return (
    <form
      id="new-deck"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const template = templates.find((record) => record.id === templateId);
        const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
        const deck: Deck = template
          ? { ...readDeck(template.body), index: 0 }
          : {
            theme, themes: THEMES, layouts: readDeck({}).layouts,
            slides: [slideFromLayout(readDeck({}).layouts[0], title.trim())],
            index: 0, comments: [], approvals: [], exports: [], importNotes: [], reduceMotion: false,
          };
        const created = await context.mutate.create({
          collection: "decks", title: title.trim(), status: "draft",
          summary: template ? `Started from ${template.title}.` : `${deck.slides.length} slide, ${theme.name} theme.`,
          fields: { folder: "Sales", slides: deck.slides.length, theme: deck.theme.name },
          body: deck,
        }, `Deck ${title.trim()} created`);
        close();
        context.navigate(`/o/${org.slug}/present/decks/${created.id}`);
      }}
    >
      <Field label="Title" required><TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required autoFocus /></Field>
      {duplicate && <Notice tone="danger" title="A deck already has that title" />}
      <Field label="Start from">
        <Select aria-label="Start from" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">One title slide</option>
          {templates.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
        </Select>
      </Field>
      {!templateId && (
        <Field label="Theme">
          <Select aria-label="Theme" value={themeId} onChange={(event) => setThemeId(event.target.value)}>
            {THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </Select>
        </Field>
      )}
    </form>
  );
}

function ImportDeck({ context, close }: { context: ScreenContext; close: () => void }) {
  const { org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [fonts, setFonts] = useState("");
  return (
    <form
      id="import-deck"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || !outline.trim()) return;
        const base = readDeck({});
        const blocks = outline.split(/\n\s*\n/).map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean)).filter((block) => block.length);
        const slides = blocks.map((block, index) => {
          const layout = index === 0 ? base.layouts[0] : base.layouts[1];
          const slide = slideFromLayout(layout, block[0]);
          return {
            ...slide,
            objects: slide.objects.map((object) => (
              object.text?.role === "title" ? { ...object, text: { ...object.text!, text: block[0] } }
                : object.text?.role === "body" || object.text?.role === "subtitle" ? { ...object, text: { ...object.text!, text: block.slice(1).join("\n") } }
                  : object
            )),
          };
        });
        const substitutions = fonts.split(",").map((font) => font.trim()).filter(Boolean).map((font) => ({ requested: font, used: "Inter" }));
        const deck: Deck = {
          ...base,
          theme: { ...base.theme, fontSubstitutions: substitutions },
          slides: slides.length ? slides : base.slides,
          importNotes: [
            `${slides.length} slide${slides.length === 1 ? "" : "s"} built from the pasted outline.`,
            ...(substitutions.length ? [`${substitutions.length} font${substitutions.length === 1 ? "" : "s"} not available locally and substituted with Inter: ${substitutions.map((item) => item.requested).join(", ")}.`] : []),
            "No media was carried in: an import here reads text only, so any image frame is left empty rather than filled with a placeholder that looks like content.",
          ],
        };
        const created = await context.mutate.create({
          collection: "decks", title: title.trim(), status: "draft",
          summary: `Imported outline, ${deck.slides.length} slides.`,
          tags: ["import"],
          fields: { folder: "Imports", slides: deck.slides.length, theme: deck.theme.name },
          body: deck,
        }, `Deck ${title.trim()} imported`);
        context.toast("Imported", `${deck.slides.length} slides. Every substitution is listed on the deck.`);
        close();
        context.navigate(`/o/${org.slug}/present/decks/${created.id}`);
      }}
    >
      <Field label="Deck title" required><TextInput aria-label="Deck title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></Field>
      <Field label="Outline" required hint="One slide per blank-line-separated block. The first line of each block becomes the title.">
        <TextArea aria-label="Outline" rows={8} value={outline} onChange={(event) => setOutline(event.target.value)} placeholder={"Winter collection\nBrushed brass, six weeks\n\nThe Arc Lamp\n£900 ex VAT\nAdjustable drop"} />
      </Field>
      <Field label="Fonts the original asked for" hint="Comma separated. Each is recorded as substituted rather than silently replaced.">
        <TextInput aria-label="Fonts the original asked for" value={fonts} onChange={(event) => setFonts(event.target.value)} placeholder="Gill Sans Nova, Caslon Display" />
      </Field>
      <Notice tone="warning" title="An import discloses what it could not reproduce">
        Fonts and media that are not available here are listed on the deck, not quietly swapped.
      </Notice>
    </form>
  );
}

function TemplatePreview({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  if (!record) return <Empty title="Select a deck" />;
  const deck = readDeck(record.body);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Slides", value: String(deck.slides.length) },
        { label: "Theme", value: deck.theme.name },
        { label: "Layouts", value: deck.layouts.map((layout) => layout.name).join(", ") },
      ]} />
      <Grid>
        {deck.slides.map((slide, index) => (
          <Card key={slide.id} span={6} eyebrow="SLIDE" prov="human" title={`${index + 1}. ${slide.title}`} subtitle={layoutById(deck, slide.layoutId).name}>
            <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
              <MiniSlide deck={deck} slide={slide} width={300} />
            </div>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

function LayoutPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { mode?: string } | undefined;
  const reapply = payload?.mode === "reapply";
  const [layoutId, setLayoutId] = useState(editor.slide.layoutId);
  const [force, setForce] = useState(false);
  if (!record) return <Empty title="No deck is open" />;
  const drifted = customisedObjects(editor.deck, editor.slide);
  return (
    <form
      id="layout-picker"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (reapply) {
          const { deck, kept } = applyLayout(editor.deck, editor.slide.id, layoutId, force);
          editor.commit(deck, "Apply layout");
          context.toast("Layout applied", kept.length
            ? `${kept.length} customised object${kept.length === 1 ? " was" : "s were"} left where you put them: ${kept.join(", ")}.`
            : "Every placeholder moved to the master.");
        } else {
          editor.commit(addSlide(editor.deck, layoutId, editor.deck.index), "Add slide");
          context.toast("Slide added", `${layoutById(editor.deck, layoutId).name} layout, inserted after slide ${editor.deck.index + 1}.`);
        }
        close();
      }}
    >
      <Grid>
        {editor.deck.layouts.map((layout) => (
          <div key={layout.id} style={{ gridColumn: "span 6" }}>
            <button
              type="button"
              aria-pressed={layoutId === layout.id}
              onClick={() => setLayoutId(layout.id)}
              style={{
                width: "100%", padding: 0, border: layoutId === layout.id ? "2px solid var(--accent)" : "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", overflow: "hidden",
              }}
            >
              <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden" }}>
                <MiniSlide deck={editor.deck} slide={slideFromLayout(layout, layout.name)} width={260} />
              </div>
              <span style={{ display: "block", padding: "6px 8px", fontSize: "var(--text-sm)", textAlign: "start" }}>{layout.name}</span>
            </button>
          </div>
        ))}
      </Grid>
      {reapply && drifted.length > 0 && (
        <>
          <Notice tone="warning" title={`${drifted.length} object${drifted.length === 1 ? " has" : "s have"} been customised`}>
            {drifted.map((object) => object.name).join(", ")} sit away from the master. By default they stay exactly where they are.
          </Notice>
          <Checkbox label="Force every placeholder back to the master, overwriting the customised positions" checked={force} onChange={(event) => setForce(event.target.checked)} />
        </>
      )}
    </form>
  );
}

function ImageInsert({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const assets = useCollection("assets");
  const payload = context.overlayPayload as { objectId?: string } | undefined;
  const existing = editor.slide.objects.find((object) => object.id === payload?.objectId);
  const [assetId, setAssetId] = useState(existing?.image?.assetId ?? assets[0]?.id ?? "");
  const [alt, setAlt] = useState(existing?.image?.alt ?? "");
  const [fit, setFit] = useState<"cover" | "contain">(existing?.image?.fit ?? "cover");
  if (!record) return <Empty title="No deck is open" />;
  return (
    <form
      id="image-insert"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (existing) {
          editor.commitSlide(updateObjects(editor.slide, [existing.id], (object) => ({ ...object, image: { assetId: assetId || undefined, alt, fit, substituted: object.image?.substituted } })), "Image");
        } else {
          const object: SlideObject = {
            id: nextId("im"), type: "image", name: "Image", x: 520, y: 150, w: 340, h: 240, rotation: 0, z: 1,
            image: { assetId: assetId || undefined, alt, fit }, customised: true,
          };
          editor.commitSlide(addObject(editor.slide, object), "Insert image");
          editor.setSelectedIds([object.id]);
        }
        close();
      }}
    >
      <Notice tone="info" title="Images are held by reference">
        The slide stores the asset's record id, so the asset record stays the single source and the deck does not carry a copy.
      </Notice>
      <Field label="Asset" hint={assets.length ? undefined : "No assets are in this workspace yet, so the frame will be empty."}>
        <Select aria-label="Asset" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
          <option value="">No asset yet</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
        </Select>
      </Field>
      <Field label="Alternative text" required hint="Reported in the review when empty.">
        <TextInput aria-label="Alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} required />
      </Field>
      <Field label="Fit">
        <Select aria-label="Fit" value={fit} onChange={(event) => setFit(event.target.value as "cover" | "contain")}>
          <option value="cover">Cover the frame</option><option value="contain">Fit inside the frame</option>
        </Select>
      </Field>
    </form>
  );
}

function PropertiesOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { mode?: string } | undefined;
  const object = editor.slide.objects.find((item) => item.id === editor.selectedIds[0]);
  const [body, setBody] = useState("");
  const [text, setText] = useState(object?.text?.text ?? "");
  if (!record) return <Empty title="No deck is open" />;

  if (payload?.mode === "comment") {
    return (
      <form
        id="properties"
        className="ds-stack ds-gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return;
          editor.commit({
            ...editor.deck,
            comments: [{ id: nextId("cm"), slideId: editor.slide.id, objectId: object?.id, author: context.actor, at: context.now.toISOString(), body: body.trim(), resolved: false }, ...editor.deck.comments],
          }, "Add comment");
          close();
        }}
      >
        <Properties rows={[
          { label: "Slide", value: `${editor.deck.index + 1}. ${editor.slide.title}` },
          { label: "Object", value: object?.name ?? "The whole slide" },
        ]} />
        <Field label="Comment" required><TextArea aria-label="Comment" rows={4} value={body} onChange={(event) => setBody(event.target.value)} required autoFocus /></Field>
      </form>
    );
  }

  if (!object) return <Empty title="Select an object first" icon={<Square size={20} />} />;

  return (
    <form
      id="properties"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (object.type === "text") {
          editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, text: item.text ? { ...item.text, text } : undefined })), "Edit text");
        }
        close();
      }}
    >
      <Properties rows={[
        { label: "Object", value: object.name },
        { label: "Kind", value: object.type },
        { label: "Position", value: `${object.x}, ${object.y}` },
        { label: "Size", value: `${object.w} × ${object.h}` },
        { label: "Rotation", value: `${object.rotation}°` },
        { label: "Z order", value: String(object.z) },
      ]} />
      {object.type === "text" ? (
        <Field label="Text" required><TextArea aria-label="Text" rows={5} value={text} onChange={(event) => setText(event.target.value)} autoFocus /></Field>
      ) : <Notice tone="neutral">Edit this object's own properties in the inspector on the right.</Notice>}
    </form>
  );
}

function AiSuggestion({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const model = capabilityById("model.inference");
  const [chosen, setChosen] = useState<string[]>([]);
  if (!record) return <Empty title="No deck is open" />;

  const suggestions = editor.deck.slides.flatMap((slide) => {
    const list: { id: string; slideId: string; title: string; detail: string; apply: (deck: Deck) => Deck }[] = [];
    const titleObject = slide.objects.find((object) => object.text?.role === "title");
    if (titleObject && titleObject.text && titleObject.text.text.length > 60) {
      list.push({
        id: `shorten-${slide.id}`, slideId: slide.id,
        title: `Shorten the title on “${slide.title}”`,
        detail: `${titleObject.text.text.length} characters. A title over sixty wraps to three lines at this size.`,
        apply: (deck) => deck,
      });
    }
    for (const object of slide.objects) {
      if (object.type === "image" && !object.image?.alt.trim()) {
        list.push({
          id: `alt-${object.id}`, slideId: slide.id,
          title: `Describe the image on “${slide.title}”`,
          detail: "No alternative text. A rule cannot write a description of an image it cannot see, so this one needs a person.",
          apply: (deck) => deck,
        });
      }
      if (object.type === "text" && object.text && object.text.size < 14) {
        list.push({
          id: `size-${object.id}`, slideId: slide.id,
          title: `Raise the text size on “${slide.title}”`,
          detail: `${object.text.size}px is unreadable from the back of a room. This can be applied: it sets the box to 18px.`,
          apply: (deck) => ({
            ...deck,
            slides: deck.slides.map((item) => (item.id === slide.id ? updateObjects(item, [object.id], (current) => ({ ...current, customised: true, text: current.text ? { ...current.text, size: 18 } : undefined })) : item)),
          }),
        });
      }
      if (object.x < 0 || object.y < 0 || object.x + object.w > SLIDE_W || object.y + object.h > SLIDE_H) {
        list.push({
          id: `bleed-${object.id}`, slideId: slide.id,
          title: `Pull “${object.name}” back onto the slide`,
          detail: "It extends past the edge and would be cropped on export. This can be applied.",
          apply: (deck) => ({
            ...deck,
            slides: deck.slides.map((item) => (item.id === slide.id ? updateObjects(item, [object.id], (current) => ({
              ...current, customised: true,
              x: Math.max(0, Math.min(SLIDE_W - current.w, current.x)),
              y: Math.max(0, Math.min(SLIDE_H - current.h, current.y)),
            })) : item)),
          }),
        });
      }
    }
    return list;
  });

  return (
    <form
      id="ai-suggestion"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        let deck = editor.deck;
        let applied = 0;
        for (const suggestion of suggestions) {
          if (!chosen.includes(suggestion.id)) continue;
          const next = suggestion.apply(deck);
          if (next !== deck) { deck = next; applied += 1; }
        }
        if (applied === 0) {
          context.toast("Nothing applied", "The selected suggestions need a human edit; a rule cannot make them without changing what the slide says.", "blocked");
          close();
          return;
        }
        editor.commit(deck, "Apply suggestions");
        context.toast("Applied", `${applied} change${applied === 1 ? "" : "s"} written into the object graph. Every object is still selectable and editable.`);
        close();
      }}
    >
      <Notice tone="warning" title={`${model?.provider ?? "Model provider"} is not connected`}>
        These are deterministic rules over the object graph, not generated advice. Applying one edits the objects in place, so nothing becomes a flattened image.
      </Notice>
      {suggestions.length === 0 ? <Empty title="Nothing to suggest" icon={<Wand2 size={20} />}>Every slide has a title, readable text and nothing hanging off the edge.</Empty> : (
        <Stack gap={2}>
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={suggestion.title}
                checked={chosen.includes(suggestion.id)}
                onChange={(event) => setChosen((current) => (event.target.checked ? [...current, suggestion.id] : current.filter((id) => id !== suggestion.id)))}
              />
              <p className="ds-subtle" style={{ marginBlockStart: 4 }}>{suggestion.detail}</p>
            </div>
          ))}
        </Stack>
      )}
    </form>
  );
}

function ThemeEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { themeId?: string } | undefined;
  const target = editor.deck.themes.find((theme) => theme.id === payload?.themeId) ?? THEMES[0];
  const [force, setForce] = useState(false);
  if (!record) return <Empty title="No deck is open" />;
  const customised = editor.deck.slides.flatMap((slide) => customisedObjects(editor.deck, slide));
  return (
    <form
      id="theme-editor"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const next: Theme = { ...target, fontSubstitutions: editor.deck.theme.fontSubstitutions };
        editor.commit({ ...editor.deck, theme: next }, "Change theme");
        context.toast("Theme applied", force
          ? "Every placeholder was returned to its master position as well."
          : `Colours and fonts changed on every slide. ${customised.length} customised object${customised.length === 1 ? " kept its" : "s kept their"} position.`);
        close();
      }}
    >
      <Row gap={3} wrap>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>{target.name}</strong>
          <Row gap={1} wrap style={{ marginBlockStart: "var(--space-2)" }}>
            {(Object.keys(target.colours) as ThemeColourToken[]).map((token) => (
              <span key={token} title={token} style={{ width: 26, height: 26, borderRadius: 5, background: target.colours[token], border: "1px solid var(--border-strong)" }} />
            ))}
          </Row>
        </div>
        <div style={{ flex: 1, minWidth: 240, position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
          <MiniSlide deck={{ ...editor.deck, theme: target }} slide={editor.slide} width={280} />
        </div>
      </Row>
      <Notice tone="warning" title="A theme change never moves a customised object">
        Objects reference colour tokens, so the palette changes everywhere at once. Positions you changed by hand are left alone unless you ask otherwise.
      </Notice>
      <Checkbox label={`Also return ${customised.length} customised object${customised.length === 1 ? "" : "s"} to the master layout`} checked={force} onChange={(event) => setForce(event.target.checked)} />
    </form>
  );
}

function GlobalApplyReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { layoutId?: string; slideId?: string } | undefined;
  const slide = editor.deck.slides.find((item) => item.id === payload?.slideId) ?? editor.slide;
  const layoutId = payload?.layoutId ?? slide.layoutId;
  const [force, setForce] = useState(false);
  if (!record) return <Empty title="No deck is open" />;
  const preview = applyLayout(editor.deck, slide.id, layoutId, force);
  return (
    <form
      id="global-apply"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit(preview.deck, "Apply master");
        context.toast("Master applied", preview.kept.length
          ? `${preview.kept.length} customised object${preview.kept.length === 1 ? " was" : "s were"} kept: ${preview.kept.join(", ")}.`
          : "Every placeholder returned to the master.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Slide", value: slide.title },
        { label: "Layout", value: layoutById(editor.deck, layoutId).name },
        { label: "Objects kept as customised", value: String(preview.kept.length) },
      ]} />
      <Row gap={3} wrap>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Now</span>
          <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
            <MiniSlide deck={editor.deck} slide={slide} width={260} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>After</span>
          <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--accent)", borderRadius: "var(--radius-xs)" }}>
            <MiniSlide deck={preview.deck} slide={preview.deck.slides.find((item) => item.id === slide.id)!} width={260} />
          </div>
        </div>
      </Row>
      {preview.kept.length > 0 && (
        <Notice tone="warning" title="Customised objects are kept by default">{preview.kept.join(", ")} stay where you put them.</Notice>
      )}
      <Checkbox label="Force them back to the master too" checked={force} onChange={(event) => setForce(event.target.checked)} />
    </form>
  );
}

function FontResolver({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  if (!record) return <Empty title="No deck is open" />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Heading font", value: editor.deck.theme.headingFont },
        { label: "Body font", value: editor.deck.theme.bodyFont },
        { label: "Available locally", value: "IBM Plex Sans Condensed, IBM Plex Mono and Inter, plus the browser's generic families" },
        { label: "Substitutions recorded", value: String(editor.deck.theme.fontSubstitutions.length) },
      ]} />
      {editor.deck.theme.fontSubstitutions.length > 0 && (
        <DataGrid
          rows={editor.deck.theme.fontSubstitutions.map((item, index) => ({ ...item, id: `${item.requested}-${index}` }))}
          rowId={(row) => row.id}
          label="Font substitutions"
          dense
          filterable={false}
          columns={[
            { key: "requested", header: "Requested", primary: true, cell: (row) => row.requested },
            { key: "used", header: "Rendered as", cell: (row) => row.used },
          ]}
        />
      )}
      <Notice tone="warning" title="No font service is connected">
        A brand typeface cannot be fetched in this workspace. Every substitution is listed here and on the deck, so a reviewer knows what they are looking at.
      </Notice>
    </Stack>
  );
}

function DatasetPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const workbooks = useCollection("workbooks");
  const payload = context.overlayPayload as { objectId?: string; mode?: string } | undefined;
  const pendingRaw = String(record?.fields.pendingChart ?? "");
  const [workbookId, setWorkbookId] = useState(workbooks[0]?.id ?? "");
  const [sheetName, setSheetName] = useState("");
  const [ref, setRef] = useState("A1:B5");
  if (!record) return <Empty title="No deck is open" />;

  const workbook = workbooks.find((item) => item.id === workbookId);
  const sheets = workbook ? (workbook.body as { sheets?: { name: string }[] }).sheets ?? [] : [];

  return (
    <form
      id="dataset-picker"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pendingRaw) {
          try {
            const queued = JSON.parse(pendingRaw) as SlideObject["chart"];
            if (!queued) return;
            const object: SlideObject = {
              id: nextId("ch"), type: "chart", name: queued.title, x: 80, y: 140, w: 800, h: 300, rotation: 0, z: 1,
              chart: queued, customised: true,
            };
            editor.commitSlide(addObject(editor.slide, object), "Insert chart");
            editor.setSelectedIds([object.id]);
            await context.mutate.patch(record.id, { fields: { ...record.fields, pendingChart: "" } }, { skipHistory: true });
            context.toast("Chart inserted", `Snapshot from ${queued.sourceSheetName}!${queued.sourceRef}, captured ${context.dateTime(queued.capturedAt)}.`);
            close();
            return;
          } catch {
            context.toast("The queued chart could not be read", "Send it again from the workbook's Presentation tab.", "failed");
            return;
          }
        }
        if (!workbook || !sheetName) return;
        const target = payload?.objectId ? editor.slide.objects.find((object) => object.id === payload.objectId) : undefined;
        const chart: NonNullable<SlideObject["chart"]> = {
          kind: target?.chart?.kind ?? "bar",
          title: target?.chart?.title ?? `${sheetName} ${ref}`,
          series: target?.chart?.series ?? [],
          sourceWorkbookId: workbook.id, sourceSheetName: sheetName, sourceRef: ref.toUpperCase(),
          capturedAt: context.now.toISOString(), linked: true,
        };
        if (target) {
          editor.commitSlide(updateObjects(editor.slide, [target.id], (object) => ({ ...object, chart })), "Link chart");
          context.toast("Linked", "The chart records the workbook, sheet and range. Send the numbers across from the workbook's Presentation tab to fill it.");
        } else {
          const object: SlideObject = {
            id: nextId("ch"), type: "chart", name: chart.title, x: 80, y: 140, w: 800, h: 300, rotation: 0, z: 1,
            chart, customised: true,
          };
          editor.commitSlide(addObject(editor.slide, object), "Insert chart");
          editor.setSelectedIds([object.id]);
          context.toast("Chart frame inserted", "It names its source and holds no numbers yet. Send a snapshot from the workbook rather than typing figures here.");
        }
        close();
      }}
    >
      {pendingRaw ? (
        <>
          <Notice tone="success" title="A chart is queued from Sheets">
            It carries the workbook, sheet, range and the time its numbers were captured. Inserting it puts an editable chart object on this slide.
          </Notice>
          <Properties rows={(() => {
            try {
              const queued = JSON.parse(pendingRaw) as NonNullable<SlideObject["chart"]>;
              return [
                { label: "Title", value: queued.title },
                { label: "Source", value: `${queued.sourceSheetName}!${queued.sourceRef}` },
                { label: "Captured", value: queued.capturedAt ? context.dateTime(queued.capturedAt) : "—" },
                { label: "Points", value: String(queued.series.reduce((total, series) => total + series.points.length, 0)) },
              ];
            } catch { return [{ label: "Queued chart", value: "Could not be read" }]; }
          })()} />
        </>
      ) : (
        <>
          <Notice tone="info" title="A slide chart holds a snapshot, not a live query">
            Linking records where the numbers come from. The numbers themselves are sent across from the workbook, with the time they were captured, so a stale slide shows as stale.
          </Notice>
          <Field label="Workbook">
            <Select aria-label="Workbook" value={workbookId} onChange={(event) => { setWorkbookId(event.target.value); setSheetName(""); }}>
              {workbooks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </Field>
          <Field label="Sheet" required>
            <Select aria-label="Sheet" value={sheetName} onChange={(event) => setSheetName(event.target.value)} required>
              <option value="">Choose a sheet</option>
              {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
            </Select>
          </Field>
          <Field label="Range" required hint="Include the header row and the label column."><TextInput aria-label="Range" value={ref} onChange={(event) => setRef(event.target.value)} required /></Field>
        </>
      )}
    </form>
  );
}

function ChartInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const workbooks = useCollection("workbooks");
  const payload = context.overlayPayload as { objectId?: string } | undefined;
  const found = editor.deck.slides.flatMap((slide) => slide.objects.map((object) => ({ slide, object }))).find((entry) => entry.object.id === payload?.objectId);
  const [title, setTitle] = useState(found?.object.chart?.title ?? "");
  if (!record || !found || !found.object.chart) return <Empty title="Select a chart" />;
  const workbook = workbooks.find((item) => item.id === found.object.chart!.sourceWorkbookId);
  const freshness = chartFreshness(found.object.chart, workbook?.updatedAt);
  return (
    <form
      id="chart-inspector"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit({
          ...editor.deck,
          slides: editor.deck.slides.map((slide) => (slide.id === found.slide.id
            ? updateObjects(slide, [found.object.id], (object) => ({ ...object, chart: object.chart ? { ...object.chart, title } : undefined }))
            : slide)),
        }, "Chart title");
        close();
      }}
    >
      <Field label="Title"><TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Properties rows={[
        { label: "Slide", value: found.slide.title },
        { label: "Source", value: found.object.chart.linked ? `${found.object.chart.sourceSheetName}!${found.object.chart.sourceRef}` : "Held in the slide" },
        { label: "Workbook", value: workbook?.title ?? "Not in this workspace" },
        { label: "Captured", value: found.object.chart.capturedAt ? context.dateTime(found.object.chart.capturedAt) : "Never" },
        { label: "Freshness", value: <Pill tone={freshness.state === "stale" ? "warning" : freshness.state === "fresh" ? "success" : "neutral"}>{freshness.state}</Pill> },
      ]} />
      <div style={{ height: 200, position: "relative" }}>
        <ObjectBody object={{ ...found.object, w: 460, h: 200 }} deck={editor.deck} readOnly />
      </div>
      <Notice tone="neutral">{freshness.label}</Notice>
    </form>
  );
}

function UnlinkWarning({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { objectId?: string } | undefined;
  const found = editor.deck.slides.flatMap((slide) => slide.objects.map((object) => ({ slide, object }))).find((entry) => entry.object.id === payload?.objectId);
  if (!record || !found || !found.object.chart) return <Empty title="Select a chart" />;
  return (
    <form
      id="unlink-warning"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit({
          ...editor.deck,
          slides: editor.deck.slides.map((slide) => (slide.id === found.slide.id
            ? updateObjects(slide, [found.object.id], (object) => ({ ...object, chart: object.chart ? { ...object.chart, linked: false, sourceWorkbookId: undefined, sourceRef: undefined, sourceSheetName: undefined } : undefined }))
            : slide)),
        }, "Unlink chart");
        context.toast("Unlinked", "The chart keeps the numbers it has, and the slide now says they are held locally rather than naming a source.", "blocked");
        close();
      }}
    >
      <Notice tone="danger" title="Unlinking loses the provenance, not the numbers">
        The chart keeps its points, but it stops naming the workbook, sheet and range they came from. From then on nobody can check the figure against its source from the slide.
      </Notice>
      <Properties rows={[
        { label: "Chart", value: found.object.chart.title },
        { label: "Current source", value: `${found.object.chart.sourceSheetName}!${found.object.chart.sourceRef}` },
        { label: "Points kept", value: String(found.object.chart.series.reduce((total, series) => total + series.points.length, 0)) },
      ]} />
    </form>
  );
}

function MotionInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const object = editor.slide.objects.find((item) => item.id === editor.selectedIds[0]);
  if (!record) return <Empty title="No deck is open" />;
  if (!object) return <Empty title="Select an object first" />;
  const animation = object.animation;
  return (
    <form
      id="motion-inspector"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <Properties rows={[
        { label: "Object", value: object.name },
        { label: "Effect", value: animation?.effect ?? "none" },
        { label: "Order", value: animation ? String(animation.order) : "—" },
      ]} />
      <Field label="Effect">
        <Select aria-label="Effect"
          value={animation?.effect ?? "none"}
          onChange={(event) => {
            const effect = event.target.value as ObjectAnimation["effect"];
            const next = updateObjects(editor.slide, [object.id], (item) => ({
              ...item,
              animation: effect === "none" ? undefined : {
                effect, order: item.animation?.order ?? buildOrder(editor.slide).length + 1,
                durationMs: item.animation?.durationMs ?? 320, delayMs: item.animation?.delayMs ?? 0,
                easing: item.animation?.easing ?? "ease-out", trigger: item.animation?.trigger ?? "onAppear",
              },
            }));
            editor.commitSlide(resequenceAnimations(next), "Animation");
          }}
        >
          <option value="none">None</option><option value="fade">Fade</option><option value="riseUp">Rise up</option>
          <option value="slideLeft">Slide left</option><option value="scaleIn">Scale in</option>
        </Select>
      </Field>
      {animation && (
        <Row gap={2} wrap>
          <Field label="Delay (ms)">
            <TextInput aria-label="Delay (ms)" inputMode="numeric" align="end" value={String(animation.delayMs)} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, animation: item.animation ? { ...item.animation, delayMs: Number(event.target.value) || 0 } : undefined })), "Delay")} />
          </Field>
          <Field label="Duration (ms)">
            <TextInput aria-label="Duration (ms)" inputMode="numeric" align="end" value={String(animation.durationMs)} onChange={(event) => editor.commitSlide(updateObjects(editor.slide, [object.id], (item) => ({ ...item, animation: item.animation ? { ...item.animation, durationMs: Number(event.target.value) || 0 } : undefined })), "Duration")} />
          </Field>
        </Row>
      )}
      <Notice tone="neutral">Motion is decoration. The deck must read with it disabled, which the accessibility review checks.</Notice>
    </form>
  );
}

function AccessibilityReview({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  if (!record) return <Empty title="No deck is open" />;
  const warnings = motionWarnings(editor.deck);
  const findings = reviewDeck(editor.deck);
  const clickOnly = editor.deck.slides.flatMap((slide) => buildOrder(slide).filter((object) => object.animation!.trigger === "onClick"));
  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Motion findings" value={String(warnings.length)} />
        <Stat prov="human" label="Click-gated objects" value={String(clickOnly.length)} meta={clickOnly.length ? "Hidden until a click" : "Nothing is click-gated"} />
        <Stat prov="human" label="Reduce motion" value={editor.deck.reduceMotion ? "On" : "Off"} />
      </StatRow>
      <Notice tone="info" title="The test is simple: turn motion off and read the deck">
        With motion disabled every object is shown at once. If a slide only makes sense in sequence, it is relying on the animation to carry meaning, and that is reported below.
      </Notice>
      {warnings.length === 0 ? <Notice tone="success" title="Nothing flagged for motion">No slide depends on a build to be understood, and no effect runs long enough to read as a stall.</Notice> : (
        <Stack gap={2}>{warnings.map((warning) => <Notice key={warning.id} tone="warning">{warning.message}</Notice>)}</Stack>
      )}
      {findings.filter((finding) => finding.id.startsWith("small-") || finding.id.startsWith("alt-")).length > 0 && (
        <Card eyebrow="ACCESSIBILITY" prov="human" title="Also relevant">
          <Stack gap={2}>
            {findings.filter((finding) => finding.id.startsWith("small-") || finding.id.startsWith("alt-")).map((finding) => (
              <Notice key={finding.id} tone="warning">{finding.message}</Notice>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function PlaybackOverlay({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const order = useMemo(() => buildOrder(editor.slide), [editor.slide]);
  if (!record) return <Empty title="No deck is open" />;
  return (
    <Stack gap={4}>
      <Row gap={2}>
        <Button variant="primary" onClick={() => {
          setRevealed(new Set());
          let elapsed = 0;
          for (const object of order) {
            elapsed += object.animation!.delayMs + object.animation!.durationMs;
            window.setTimeout(() => setRevealed((current) => new Set([...current, object.id])), elapsed);
          }
        }}>Play</Button>
        <Button variant="secondary" onClick={() => setRevealed(new Set(order.map((object) => object.id)))}>Show everything</Button>
        <span className="ds-grow" />
        <Pill tone="neutral">{revealed.size} of {order.length} revealed</Pill>
      </Row>
      <SlideCanvas deck={editor.deck} slide={editor.slide} selectedIds={[]} onSelect={() => undefined} onTransform={() => undefined} readOnly scale={0.52} revealed={revealed} showGuides={false} />
    </Stack>
  );
}

function DisplaySelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const [acknowledged, setAcknowledged] = useState(false);
  if (!record) return <Empty title="No deck is open" />;
  const withNotes = editor.deck.slides.filter((slide) => slide.notes.trim()).length;
  return (
    <form
      id="display-selector"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!acknowledged) return;
        context.setTab("Audience");
        presenterUi.set((state) => ({ ...state, fullscreen: true, running: true }));
        void context.mutate.log(`Presenting ${record.title}`, { entityId: record.id, type: "present" });
        close();
      }}
    >
      <Notice tone="warning" title="Check what the room will see">
        {withNotes} slide{withNotes === 1 ? "" : "s"} carry speaker notes. The audience display renders the slide only — notes are never drawn there — but a mirrored screen would show this whole window, so confirm the display arrangement first.
      </Notice>
      <Properties rows={[
        { label: "Slides to present", value: String(editor.deck.slides.filter((slide) => !slide.hidden).length) },
        { label: "Hidden slides", value: String(editor.deck.slides.filter((slide) => slide.hidden).length) },
        { label: "Slides with notes", value: String(withNotes) },
        { label: "Second screen", value: <Pill tone="warning">Not detected</Pill> },
      ]} />
      <Checkbox label="The audience screen is extended, not mirrored" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
    </form>
  );
}

function RehearsalReport({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  if (!record) return <Empty title="No deck is open" />;
  const targets = editor.deck.slides.filter((slide) => slide.targetSeconds);
  const total = targets.reduce((sum, slide) => sum + (slide.targetSeconds ?? 0), 0);
  return (
    <Stack gap={4}>
      {targets.length === 0 ? (
        <Notice tone="warning" title="No slide has a target time">
          Set a target in the editor inspector and the rehearsal timer can report against it. Without one there is nothing to compare a run to, so no figure is invented.
        </Notice>
      ) : (
        <>
          <StatRow>
            <Stat prov="human" label="Slides with a target" value={`${targets.length} of ${editor.deck.slides.length}`} />
            <Stat prov="human" label="Total target" value={`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`} />
            <Stat prov="human" label="Longest slide" value={`${Math.max(...targets.map((slide) => slide.targetSeconds ?? 0))}s`} />
          </StatRow>
          <DataGrid
            rows={targets.map((slide, index) => ({ ...slide, id: slide.id, position: index + 1 }))}
            rowId={(row) => row.id}
            label="Target times"
            filterable={false}
            columns={[
              { key: "position", header: "#", align: "end", cell: (row) => String(row.position) },
              { key: "title", header: "Slide", primary: true, cell: (row) => row.title },
              { key: "target", header: "Target", align: "end", cell: (row) => `${row.targetSeconds}s` },
              { key: "notes", header: "Notes", cell: (row) => (row.notes.trim() ? `${row.notes.trim().split(/\s+/).length} words` : <span className="ds-subtle">None</span>) },
            ]}
          />
        </>
      )}
      <Notice tone="neutral">A rehearsal time is only recorded when you actually advance through the deck with the timer running. Nothing here is estimated.</Notice>
    </Stack>
  );
}

function VersionComparison({ context }: { context: ScreenContext }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const payload = context.overlayPayload as { snapshotId?: string } | undefined;
  if (!record) return <Empty title="No deck is open" />;
  const index = Number(payload?.snapshotId?.split("-").pop() ?? -1);
  const snapshot = record.history[index];
  if (!snapshot) return <Empty title="Version not found" />;
  const stored = readDeck(snapshot.body);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Version saved", value: context.dateTime(snapshot.at) },
        { label: "Slides then / now", value: `${stored.slides.length} → ${editor.deck.slides.length}` },
        { label: "Objects then / now", value: `${stored.slides.reduce((total, slide) => total + slide.objects.length, 0)} → ${editor.deck.slides.reduce((total, slide) => total + slide.objects.length, 0)}` },
        { label: "Theme then / now", value: `${stored.theme.name} → ${editor.deck.theme.name}` },
      ]} />
      <Grid>
        {stored.slides.map((slide, position) => {
          const now = editor.deck.slides[position];
          return (
            <Card key={slide.id} span={6} eyebrow="COMPARE" title={`Slide ${position + 1}`} subtitle={now && now.id === slide.id ? "Same slide" : "Changed or reordered"}>
              <Row gap={2} wrap>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Stored</span>
                  <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--border-default)", borderRadius: 4 }}>
                    <MiniSlide deck={stored} slide={slide} width={150} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Now</span>
                  {now ? (
                    <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", border: "1px solid var(--accent)", borderRadius: 4 }}>
                      <MiniSlide deck={editor.deck} slide={now} width={150} />
                    </div>
                  ) : <Empty title="Deleted" />}
                </div>
              </Row>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

function ExportSettings({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [format, setFormat] = useState<"html" | "notes">("html");
  if (!record) return <Empty title="No deck is open" />;
  return (
    <form
      id="export-settings"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (format === "notes") {
          downloadFile(`${record.title} - notes.txt`, notesToText(editor.deck, record.title), "text/plain");
        } else {
          downloadFile(`${record.title}.html`, toHtml(editor.deck, record.title, includeNotes), "text/html");
        }
        editor.commit({
          ...editor.deck,
          exports: [{ id: nextId("ex"), at: context.now.toISOString(), format: format === "notes" ? "Notes" : "HTML", note: includeNotes && format === "html" ? "Slides with speaker notes" : format === "html" ? "Slides only" : "Speaker notes only" }, ...editor.deck.exports],
        }, "Export");
        context.toast("Exported", "The export is recorded on the deck with its format and whether notes were included.");
        close();
      }}
    >
      <Segmented
        label="Format"
        value={format}
        onChange={setFormat}
        options={[{ value: "html", label: "HTML slides" }, { value: "notes", label: "Speaker notes" }]}
      />
      {format === "html" && (
        <>
          <Checkbox label="Include speaker notes under each slide" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          {includeNotes && <Notice tone="warning" title="Notes will be in the file">Anyone you send it to can read them. They are off by default for that reason.</Notice>}
        </>
      )}
      <Properties rows={[
        { label: "Slides exported", value: String(editor.deck.slides.filter((slide) => !slide.hidden).length) },
        { label: "Hidden slides left out", value: String(editor.deck.slides.filter((slide) => slide.hidden).length) },
        { label: "Charts with a data table", value: String(editor.deck.slides.flatMap((slide) => slide.objects.filter((object) => object.type === "chart")).length) },
      ]} />
      <Notice tone="neutral">The HTML is self-contained and positions every object at its slide coordinates, so what you see here is what opens.</Notice>
    </form>
  );
}

function ApprovalOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDeck(context);
  const editor = useDeckEditor(context, record);
  const members = useCollection("members").filter((member) => member.fields.kind === "human");
  const [reviewer, setReviewer] = useState(members[0]?.title ?? "");
  const [decision, setDecision] = useState<"approved" | "changes">("approved");
  const [note, setNote] = useState("");
  if (!record) return <Empty title="No deck is open" />;
  const openComments = editor.deck.comments.filter((comment) => !comment.resolved);
  return (
    <form
      id="approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reviewer) return;
        editor.commit({
          ...editor.deck,
          approvals: [{ id: nextId("ap"), reviewer, at: context.now.toISOString(), decision, note }, ...editor.deck.approvals],
        }, "Record approval");
        if (decision === "approved") {
          await context.mutate.patch(record.id, { status: "published" }, { event: `${record.title} approved by ${reviewer}` });
        }
        context.toast("Recorded", `${reviewer} ${decision === "approved" ? "approved" : "asked for changes to"} the deck. It is on the record, not just a toast.`);
        close();
      }}
    >
      {openComments.length > 0 && (
        <Notice tone="warning" title={`${openComments.length} comment${openComments.length === 1 ? " is" : "s are"} still open`}>
          Approving does not resolve them. They stay listed under Comments so an approval cannot bury a reviewer's objection.
        </Notice>
      )}
      <Field label="Reviewer" required>
        <Select aria-label="Reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)} required>
          {members.map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Decision">
        <Select aria-label="Decision" value={decision} onChange={(event) => setDecision(event.target.value as "approved" | "changes")}>
          <option value="approved">Approved</option><option value="changes">Changes requested</option>
        </Select>
      </Field>
      <Field label="Note"><TextArea aria-label="Note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
    </form>
  );
}

/* ====================================================================== *
 * Registration
 * ====================================================================== */

registerApp({
  code: "PRESENT",
  short: "Present",
  name: "Presentations & Storytelling",
  purpose: "Design slides as an editable object graph, then present them.",
  icon: Presentation,
  nav: [
    { label: "Library", items: [{ label: "Decks", screenId: "ARL-PRESENT-001", icon: Presentation }] },
    { label: "This deck", items: [
      { label: "Slides", screenId: "ARL-PRESENT-002", icon: LayoutTemplate },
      { label: "Theme", screenId: "ARL-PRESENT-003", icon: Palette },
      { label: "Charts & data", screenId: "ARL-PRESENT-004", icon: BarChart3 },
      { label: "Animation", screenId: "ARL-PRESENT-005", icon: Wand2 },
      { label: "Presenter", screenId: "ARL-PRESENT-006", icon: MonitorPlay },
      { label: "Review", screenId: "ARL-PRESENT-007", icon: MessageSquare },
    ] },
  ],
  screens: {
    "ARL-PRESENT-001": {
      id: "ARL-PRESENT-001",
      inspectorTitle: "Deck",
      inspector: (context) => <LibraryInspector context={context} />,
      tabs: (["Recent", "Shared", "Templates", "Archived"] as const).map((id) => ({ id, render: (context) => <DeckLibrary context={context} tab={id} /> })),
      actions: [
        { id: "Create deck", label: "New deck", placement: "primary", run: (context) => context.openOverlay("new deck") },
        { id: "import", label: "Import", placement: "secondary", run: (context) => context.openOverlay("Import") },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a deck first"),
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            const source = await import("@/platform/repo").then((module) => module.getRecord(id));
            if (!source) return;
            await context.mutate.create({
              collection: "decks", title: `${source.title} copy`, status: "draft", summary: source.summary,
              tags: source.tags, fields: { ...source.fields }, body: readDeck(source.body),
            }, `${source.title} duplicated`);
            context.toast("Duplicated", "Every slide, object and theme token was copied.");
          },
        },
        {
          id: "present", label: "Present", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a deck first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/present/decks/${context.selectedId}/present`),
        },
      ],
      overlays: [
        { id: "new deck", kind: "modal", title: "New deck", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-deck">Create</Button></>, render: (context) => <NewDeck context={context} close={context.close} /> },
        { id: "Import", kind: "drawer", title: "Import a deck", width: 600, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="import-deck">Import</Button></>, render: (context) => <ImportDeck context={context} close={context.close} /> },
        { id: "template preview", kind: "drawer", title: "Preview", width: 680, render: (context) => <TemplatePreview context={context} /> },
      ],
    },

    "ARL-PRESENT-002": {
      id: "ARL-PRESENT-002",
      chrome: "full",
      surface: (context) => <SlideEditorScreen context={context} />,
      tabs: ["Design", "Insert", "Animate", "Review", "View"].map((id) => ({ id, render: () => null })),
      actions: SLIDE_ACTIONS,
      overlays: [
        { id: "Layout picker", kind: "drawer", title: "Layouts", width: 640, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="layout-picker">Apply</Button></>, render: (context) => <LayoutPicker context={context} close={context.close} /> },
        { id: "image insert", kind: "modal", title: "Image", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="image-insert">Save</Button></>, render: (context) => <ImageInsert context={context} close={context.close} /> },
        { id: "properties", kind: "modal", title: "Object", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="properties">Save</Button></>, render: (context) => <PropertiesOverlay context={context} close={context.close} /> },
        { id: "move object", kind: "modal", title: "Move object", width: 440, footer: formFooter("present-move", "Move"), render: (context) => <MoveObject context={context} close={context.close} /> },
        { id: "resize object", kind: "modal", title: "Resize object", width: 440, footer: formFooter("present-resize", "Resize"), render: (context) => <ResizeObject context={context} close={context.close} /> },
        { id: "align objects", kind: "modal", title: "Align", width: 520, render: (context) => <AlignObjects context={context} close={context.close} /> },
        { id: "AI suggestion", kind: "drawer", title: "Suggestions", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="ai-suggestion">Apply selected</Button></>, render: (context) => <AiSuggestion context={context} close={context.close} /> },
      ],
    },

    "ARL-PRESENT-003": {
      id: "ARL-PRESENT-003",
      title: () => "Master & theme",
      tabs: (["Masters", "Colours", "Fonts", "Layouts"] as const).map((id) => ({ id, render: (context) => <ThemeScreen context={context} tab={id} /> })),
      actions: [
        { id: "Change master", label: "Change the master theme…", placement: "primary", run: (context) => context.openOverlay("Theme editor", { themeId: THEMES[1].id }) },
        { id: "create layout", label: "Create a layout…", placement: "secondary", run: (context) => context.openOverlay("create layout") },
        { id: "preview impact", label: "Preview the impact", placement: "overflow", run: (context) => context.openOverlay("global apply review") },
      ],
      overlays: [
        { id: "Theme editor", kind: "modal", title: "Apply a theme", width: 600, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="theme-editor">Apply</Button></>, render: (context) => <ThemeEditor context={context} close={context.close} /> },
        { id: "global apply review", kind: "drawer", title: "Apply the master", width: 640, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="global-apply">Apply</Button></>, render: (context) => <GlobalApplyReview context={context} close={context.close} /> },
        { id: "font resolver", kind: "modal", title: "Fonts", width: 560, render: (context) => <FontResolver context={context} /> },
        { id: "create layout", kind: "modal", title: "Create a layout", width: 480, footer: formFooter("present-create-layout", "Create"), render: (context) => <CreateLayout context={context} close={context.close} /> },
      ],
    },

    "ARL-PRESENT-004": {
      id: "ARL-PRESENT-004",
      title: () => "Charts & data",
      tabs: (["Charts", "Tables", "Sources", "Refresh"] as const).map((id) => ({ id, render: (context) => <DataScreen context={context} tab={id} /> })),
      actions: [
        { id: "Insert chart", label: "Insert chart", placement: "primary", run: (context) => context.openOverlay("Dataset picker", { mode: "create" }) },
        { id: "link sheet", label: "Link a workbook", placement: "secondary", run: (context) => context.openOverlay("Dataset picker") },
        { id: "update data", label: "Update the linked charts", placement: "overflow", run: (context) => refreshCharts(context) },
        { id: "show labels", label: "Show or hide data labels", placement: "overflow", run: (context) => toggleLabels(context) },
        { id: "freshness", label: "Check freshness", placement: "overflow", run: (context) => context.setTab("Refresh") },
      ],
      overlays: [
        { id: "Dataset picker", kind: "drawer", title: "Dataset", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="dataset-picker">Insert</Button></>, render: (context) => <DatasetPicker context={context} close={context.close} /> },
        { id: "chart inspector", kind: "drawer", title: "Chart", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="chart-inspector">Save</Button></>, render: (context) => <ChartInspector context={context} close={context.close} /> },
        { id: "unlink warning", kind: "modal", title: "Unlink this chart", tone: "danger", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Keep the link</Button><Button variant="outline-danger" type="submit" form="unlink-warning">Unlink</Button></>, render: (context) => <UnlinkWarning context={context} close={context.close} /> },
      ],
    },

    "ARL-PRESENT-005": {
      id: "ARL-PRESENT-005",
      title: () => "Transitions & animation",
      tabs: (["Slides", "Objects", "Timing", "Preview"] as const).map((id) => ({ id, render: (context) => <AnimationScreen context={context} tab={id} /> })),
      actions: [
        { id: "Add animation", label: "Add animation", placement: "primary", run: (context) => context.openOverlay("Motion inspector") },
        { id: "test", label: "Test: play the builds", placement: "secondary", run: (context) => context.openOverlay("playback") },
        { id: "sequence", label: "Sequence the builds", placement: "overflow", run: (context) => sequenceSlide(context) },
        { id: "reduce motion", label: "Reduce motion (on or off)", placement: "overflow", run: (context) => toggleReduceMotion(context) },
        { id: "accessibility", label: "Accessibility review", placement: "overflow", run: (context) => context.openOverlay("accessibility review") },
      ],
      overlays: [
        { id: "Motion inspector", kind: "modal", title: "Motion", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="motion-inspector">Done</Button></>, render: (context) => <MotionInspector context={context} close={context.close} /> },
        { id: "playback", kind: "drawer", title: "Playback", width: 640, render: (context) => <PlaybackOverlay context={context} /> },
        { id: "accessibility review", kind: "drawer", title: "Accessibility", width: 600, render: (context) => <AccessibilityReview context={context} /> },
      ],
    },

    "ARL-PRESENT-006": {
      id: "ARL-PRESENT-006",
      title: () => "Presenter mode",
      tabs: (["Audience", "Presenter", "Rehearsal"] as const).map((id) => ({ id, render: (context) => <PresenterScreen context={context} tab={id} /> })),
      actions: [
        { id: "Present", label: "Present", placement: "primary", icon: <MonitorPlay size={15} />, run: (context) => context.openOverlay("Display selector") },
        { id: "advance", label: "Advance a slide", placement: "secondary", run: (context) => advanceAction(context) },
        { id: "annotate", label: "Annotate the slide…", placement: "overflow", run: (context) => context.openOverlay("annotate") },
        { id: "end", label: "End the presentation", placement: "overflow", guard: () => (presenterUi.get().running || presenterUi.get().fullscreen ? undefined : "Nothing is being presented"), run: (context) => endAction(context) },
        {
          id: "export notes", label: "Export notes", placement: "overflow", capability: "export_data",
          run: async (context) => {
            const record = await import("@/platform/repo").then((module) => (context.params.id ? module.getRecord(context.params.id) : undefined));
            if (!record) { context.toast("No deck is open", "Open a deck first.", "blocked"); return; }
            downloadFile(`${record.title} - notes.txt`, notesToText(readDeck(record.body), record.title), "text/plain");
            context.toast("Notes exported", "One block per slide, hidden slides marked.");
          },
        },
      ],
      overlays: [
        { id: "Display selector", kind: "modal", title: "Audience display", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="display-selector">Continue</Button></>, render: (context) => <DisplaySelector context={context} close={context.close} /> },
        { id: "rehearsal report", kind: "drawer", title: "Rehearsal", width: 600, render: (context) => <RehearsalReport context={context} /> },
        { id: "annotate", kind: "modal", title: "Annotate the live slide", width: 480, footer: formFooter("present-annotate", "Add"), render: (context) => <Annotate context={context} close={context.close} /> },
        { id: "access confirmation", kind: "modal", title: "Before you present", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="display-selector">Continue</Button></>, render: (context) => <DisplaySelector context={context} close={context.close} /> },
      ],
    },

    "ARL-PRESENT-007": {
      id: "ARL-PRESENT-007",
      title: () => "Review & publish",
      tabs: (["Comments", "History", "Export", "Publish"] as const).map((id) => ({ id, render: (context) => <ReviewScreen context={context} tab={id} /> })),
      actions: [
        { id: "approve", label: "Record an approval", placement: "primary", capability: "edit_knowledge", run: (context) => context.openOverlay("approval") },
        { id: "export", label: "Export", placement: "secondary", run: (context) => context.openOverlay("export settings") },
        { id: "Resolve", label: "Resolve comments…", placement: "overflow", run: (context) => context.openOverlay("resolve comments") },
        { id: "share", label: "Share…", placement: "overflow", run: (context) => context.openOverlay("share deck") },
      ],
      overlays: [
        { id: "Version comparison", kind: "drawer", title: "Compare versions", width: 720, render: (context) => <VersionComparison context={context} /> },
        { id: "export settings", kind: "modal", title: "Export settings", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="export-settings">Export</Button></>, render: (context) => <ExportSettings context={context} close={context.close} /> },
        { id: "resolve comments", kind: "modal", title: "Resolve comments", width: 560, render: (context) => <ResolveComments context={context} close={context.close} /> },
        { id: "share deck", kind: "modal", title: "Share the deck", width: 520, footer: formFooter("present-share", "Share"), render: (context) => <ShareDeck context={context} close={context.close} /> },
        { id: "approval", kind: "modal", title: "Approval", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="approval">Record</Button></>, render: (context) => <ApprovalOverlay context={context} close={context.close} /> },
      ],
    },
  },
});
