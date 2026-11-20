import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  LayoutTemplate, FileText, Rows3, Type as TypeIcon, Printer, MousePointer2,
  Image as ImageIcon, Square, Link2, Plus, Undo2, Redo2, ZoomIn, ZoomOut, FileImage,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, Empty, Field, FactGrid, Grid, ModalActions, Notice, OVERLAY_WIDTH, OverlayActions, OverlayCancel,
  OverlaySection, OverlaySummary, PageSection, Pill, Properties,
  KeyValueList, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, downloadText, slug,
  useStore, type DocHandle,
} from "@/applications/visual/kit";
import { canUndoShared, editShared, readShared, sharedHandle, undoShared, useGuardRefresh, useSharedDoc } from "@/applications/design/sharedDoc";
import {
  PAGE_SIZES, canvasMetrics, composeStory, effectivePpi, masterUsage, mm, overrideMasterFrame,
  preflight, preflightBlocks, threadFrames, threadHeads, toMm,
  type Box, type Composition, type Frame, type ParagraphStyle, type PreflightIssue, type PublicationDoc,
} from "./flow";
import { PageView, dragFrame, dragFrames, resizeFrame, rotateFrameDrag, useCompositions } from "./spread";
import { ArrangePanel, FrameStory, GridPanel, LayersPanel, MultiArrangePanel, exportPageSvg, useLayoutKeys, type AlignTarget } from "./editorParts";
import { locateFrame, removeFrame, updateFrame } from "./arrange";
import { normaliseAngle } from "./multi";
import "./layout.css";
import {
  BASE_STYLES, layoutUi, newImageFrame, newShapeFrame, newTextFrame,
  parsePublication, selectFrame, selectedFrameIds, setLayoutTool, starterPublication, toggleFrameSelection, type LayoutTool,
} from "./model";
import { wallMs } from "@/platform/clock";

/* ====================================================================== *
 * LAYOUT — Editorial Layout & Publishing
 * ====================================================================== */

function usePublication(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useSharedDoc<PublicationDoc>(record, parsePublication, context.screen.id);
  const compositions = useCompositions(handle.doc);
  useStore(layoutUi);
  useGuardRefresh(context);
  return { record, handle, compositions };
}

function MissingPublication({ context }: { context: ScreenContext }) {
  return (
    <Empty
      title="No publication at this address"
      icon={<LayoutTemplate size={20} />}
      action={
        <Button
          variant="primary"
          onClick={async () => {
            const made = await context.mutate.create({
              collection: "publications", title: "Untitled publication", status: "draft",
              summary: "Created in the publication editor.", body: starterPublication("Untitled publication"),
              fields: { kind: "publication", pages: 2, size: "A4 portrait" },
            }, "Publication created");
            context.navigate(context.path("/o/:org/layout/publications/:id", made.id));
          }}
        >
          Create a publication here
        </Button>
      }
    >
      {context.params.id ? <>The record <code className="ds-num">{context.params.id}</code> is not in {context.org.shortName}.</> : <>Open one from the library.</>}
    </Empty>
  );
}

function fontAvailable(family: string): boolean {
  if (typeof document === "undefined" || !("fonts" in document)) return true;
  try { return document.fonts.check(`12px "${family}"`); } catch { return true; }
}

function issuesFor(doc: PublicationDoc | null, compositions: Map<string, Composition>): PreflightIssue[] {
  if (!doc) return [];
  return preflight(doc, compositions, { minPpi: 300, minTextSize: 8, availableFont: fontAvailable });
}

/* ---------------------------- LAYOUT-001 ---------------------------- */

function PublicationLibrary({ context, lens }: { context: ScreenContext; lens: "Recent" | "Company" | "Templates" | "Archive" }) {
  const publications = useCollection("publications");
  const { relative } = useWorkspace();
  const rows = publications.filter((record) => {
    if (lens === "Templates") return record.fields.kind === "template";
    if (lens === "Archive") return record.status === "archived";
    if (lens === "Company") return record.fields.kind !== "template" && record.status !== "archived";
    return record.status !== "archived" && record.fields.kind !== "template";
  });

  if (rows.length === 0) {
    return (
      <Empty title={`No ${lens.toLowerCase()} publications`} icon={<LayoutTemplate size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Page preset")}>New publication</Button>}>
        {lens === "Templates" ? "Mark a publication as a template to reuse its masters and styles." : "Create one to start setting type."}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Publications" value={publications.length} prov="human" meta={`in ${context.org.shortName}`} />
        <Stat label="Pages in total" value={publications.reduce((sum, record) => sum + parsePublication(record.body).pages.length, 0)} prov="human" meta="counted from the documents" />
        <Stat label="With overset text" value={publications.filter((record) => { const doc = parsePublication(record.body); const metrics = canvasMetrics(); return doc.stories.some((story) => { const heads = threadHeads(doc.pages).filter((frame) => frame.storyId === story.id); return heads.some((head) => composeStory(story, threadFrames(doc.pages, head.id), doc.paragraphStyles, metrics, doc.baseline).oversetChars > 0); }); }).length} prov="human" meta="copy that does not fit" />
        <Stat label="Print provider" value="Not connected" unavailable meta="PDF comes from your browser's print dialogue" />
      </StatRow>
      <Grid>
        {rows.map((record) => {
          const doc = parsePublication(record.body);
          return (
            <Card
              key={record.id}
              span={4}
              eyebrow={lens === "Templates" ? "TEMPLATE" : "PUBLICATION"}
              prov="human"
              title={record.title}
              subtitle={<><span className="ds-num">{doc.pages.length}</span> pages · {doc.size.name} · edited {relative(record.updatedAt)}</>}
              actions={<Button size="sm" variant="secondary" onClick={() => { context.select(record.id); context.navigate(context.path("/o/:org/layout/publications/:id", record.id)); }}>Open</Button>}
            >
              <Stack gap={2}>
                <div style={{ display: "flex", gap: 6, overflow: "hidden", background: "var(--bg-sunken)", padding: 6, borderRadius: 6 }}>
                  {doc.pages.slice(0, 2).map((page, index) => (
                    <PageView key={page.id} doc={doc} page={page} index={index} compositions={new Map()} zoom={0.16} showGuides={false} showBleed={false} />
                  ))}
                </div>
                <Row gap={2} wrap>
                  <Pill tone={record.status === "archived" ? "warning" : "info"} dot>{record.status}</Pill>
                  <Pill><span className="ds-num">{Math.round(toMm(doc.size.width))}×{Math.round(toMm(doc.size.height))}mm</span></Pill>
                  <Pill>bleed <span className="ds-num">{Math.round(toMm(doc.bleed) * 10) / 10}mm</span></Pill>
                </Row>
                <Row gap={1} wrap>
                  <Button size="sm" variant="ghost" onClick={() => context.select(record.id)}>Select</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("share", { id: record.id })}>Share</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

/* ---------------------------- LAYOUT-002 ---------------------------- */

function PublicationEditor({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle, compositions } = usePublication(context);
  const ui = useStore(layoutUi);
  const stageRef = useRef<HTMLDivElement | null>(null);
  useLayoutKeys(handle);
  const doc = handle.doc;
  const tab = context.tab;
  const activeIndex = doc ? Math.max(0, doc.pages.findIndex((page) => page.id === doc.activePageId)) : 0;
  const spreadPages = doc ? (ui.spread && doc.facingPages
    ? doc.pages.slice(Math.max(0, activeIndex - (activeIndex % 2 === 0 ? 0 : 1)), Math.max(0, activeIndex - (activeIndex % 2 === 0 ? 0 : 1)) + 2)
    : [doc.pages[activeIndex]].filter(Boolean)) : [];
  const overset = [...compositions.values()].filter((composition) => composition.oversetChars > 0);
  const oversetChars = overset.reduce((sum, item) => sum + item.oversetChars, 0);

  const fitZoom = () => {
    const host = stageRef.current;
    if (!doc || !host) return;
    const width = (doc.size.width + doc.bleed * 2) * spreadPages.length + 10 * (spreadPages.length - 1);
    const height = doc.size.height + doc.bleed * 2;
    const zoom = Math.min((host.clientWidth - 48) / width, (host.clientHeight - 48) / height);
    layoutUi.set((current) => ({ ...current, zoom: Math.max(0.15, Math.min(2.5, Math.round(zoom * 100) / 100)) }));
  };

  /* Open each publication fitted to the window once, then leave zoom alone. */
  const fittedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!doc || !record || fittedFor.current === record.id) return;
    fittedFor.current = record.id;
    fitZoom();
  });

  const onHandleDown = (frame: Frame, which: Parameters<typeof resizeFrame>[2], event: ReactPointerEvent) => {
    if (!doc) return;
    resizeFrame(event, frame, which, doc, ui.zoom, (box, committed) => {
      if (committed) { handle.beginGesture(); return; }
      handle.live((current) => ({
        ...current,
        pages: current.pages.map((page) => ({ ...page, frames: page.frames.map((item) => (item.id === frame.id ? { ...item, box } : item)) })),
      }));
    });
  };

  const onRotateDown = (frame: Frame, event: ReactPointerEvent) => {
    rotateFrameDrag(event, frame, (rotation, committed) => {
      if (committed) { handle.beginGesture(); return; }
      handle.live((current) => updateFrame(current, frame.id, { rotation }));
    });
  };

  const onFrameDown = (frame: Frame, event: ReactPointerEvent) => {
    if (!doc) return;
    /* With a placing tool, a press on a frame places a new one there. */
    if (ui.tool === "text" || ui.tool === "image" || ui.tool === "shape") return;
    event.stopPropagation();
    const onPage = doc.pages.some((page) => page.frames.some((item) => item.id === frame.id));
    /* Shift-click adds a frame to the selection or takes it out. */
    if (ui.tool === "select" && event.shiftKey && onPage) {
      toggleFrameSelection(frame.id, (a, b) => locateFrame(doc, a)?.pageIndex === locateFrame(doc, b)?.pageIndex);
      return;
    }
    const ids = selectedFrameIds(ui);
    if (ui.tool === "select" && ids.length > 1 && ids.includes(frame.id)) {
      dragFrames(event, ids, doc, ui.zoom, (next) => {
        if (next === null) handle.beginGesture(); else handle.live(next);
      });
      return;
    }
    if (ui.tool === "thread" && frame.kind === "text") {
      if (!ui.threadFrom) { layoutUi.set((current) => ({ ...current, threadFrom: frame.id })); return; }
      if (ui.threadFrom !== frame.id) {
        handle.edit((current) => ({
          ...current,
          pages: current.pages.map((page) => ({ ...page, frames: page.frames.map((item) => (item.id === ui.threadFrom ? { ...item, next: frame.id } : item)) })),
        }), "Thread the frames");
        context.toast("Threaded", "Copy now flows from the first frame into the second.");
      }
      layoutUi.set((current) => ({ ...current, threadFrom: undefined, tool: "select" }));
      return;
    }
    if (frame.overriddenFrom === undefined && !doc.pages.some((page) => page.frames.some((item) => item.id === frame.id))) {
      /* A master frame: overriding it brings it onto the page. */
      context.openOverlay("override confirmation", { frameId: frame.id });
      return;
    }
    dragFrame(event, frame, doc, ui.zoom, (box, committed) => {
      const update = (current: PublicationDoc) => ({
        ...current,
        pages: current.pages.map((page) => ({ ...page, frames: page.frames.map((item) => (item.id === frame.id ? { ...item, box } : item)) })),
      });
      if (committed) handle.beginGesture(); else handle.live(update);
    });
  };

  if (!record) return <div className="pg-body"><MissingPublication context={context} /></div>;
  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Pages" }, { id: "Layout" }, { id: "Type" }, { id: "Review" }]}
      lean
      title={record.title}
      subtitle={(
        <Row gap={2} wrap>
          <SaveState handle={handle} />
          {doc && <span><span className="ds-num">{doc.pages.length}</span> pages · {doc.size.name}</span>}
          {oversetChars > 0 && (
            <button type="button" className="ds-pill lx-overset-chip" data-tone="danger" onClick={() => context.openOverlay("overset warning")}>
              <span className="ds-num">{oversetChars.toLocaleString("en")}</span> characters overset
            </button>
          )}
        </Row>
      )}
      backTo={{ label: "Layout", to: `/o/${context.org.slug}/layout/publications` }}
      tools={
        <div className="lx-tools">
          <Toolbar label="Frame tools">
            {([
              { tool: "select", label: "Select (V)", icon: <MousePointer2 size={15} /> },
              { tool: "text", label: "Text frame (T)", icon: <TypeIcon size={15} /> },
              { tool: "image", label: "Image frame (F)", icon: <ImageIcon size={15} /> },
              { tool: "shape", label: "Shape (R)", icon: <Square size={15} /> },
              { tool: "thread", label: "Thread two text frames", icon: <Link2 size={15} /> },
            ] as { tool: LayoutTool; label: string; icon: React.ReactNode }[]).map((item) => (
              <Tool key={item.tool} label={item.label} icon={item.icon} active={ui.tool === item.tool} onClick={() => setLayoutTool(item.tool)} />
            ))}
            <ToolbarSeparator />
            <Tool label="Undo (⌘Z)" icon={<Undo2 size={15} />} disabled={!handle.canUndo} onClick={handle.undo} />
            <Tool label="Redo (⇧⌘Z)" icon={<Redo2 size={15} />} disabled={!handle.canRedo} onClick={handle.redo} />
          </Toolbar>
          <Toolbar label="View">
            <Tool label="Facing-page spread" active={ui.spread} onClick={() => layoutUi.set((c) => ({ ...c, spread: !c.spread }))}>Spread</Tool>
            <Tool label="Margin and column guides" active={ui.showGuides} onClick={() => layoutUi.set((c) => ({ ...c, showGuides: !c.showGuides }))}>Guides</Tool>
            <Tool label="Baseline grid" active={ui.showBaseline} onClick={() => layoutUi.set((c) => ({ ...c, showBaseline: !c.showBaseline }))}>Baseline</Tool>
            <ToolbarSeparator />
            <Tool label="Zoom out" icon={<ZoomOut size={15} />} onClick={() => layoutUi.set((c) => ({ ...c, zoom: Math.max(0.15, c.zoom / 1.15) }))} />
            <span className="lx-zoom ds-num" aria-live="polite">{Math.round(ui.zoom * 100)}%</span>
            <Tool label="Zoom in" icon={<ZoomIn size={15} />} onClick={() => layoutUi.set((c) => ({ ...c, zoom: Math.min(2.5, c.zoom * 1.15) }))} />
            <Tool label="Fit the spread in the window" onClick={() => fitZoom()}>Fit</Tool>
            <ToolbarSeparator />
            <Tool
              label="Export the pages on screen as SVG"
              icon={<FileImage size={15} />}
              disabled={!doc}
              onClick={() => {
                if (!doc) return;
                const numbers = spreadPages.map((page) => doc.pages.findIndex((item) => item.id === page.id) + 1);
                const count = exportPageSvg(stageRef.current, record.title, numbers);
                context.toast(count ? "SVG written" : "Nothing to export", count ? `${count} page${count === 1 ? "" : "s"} saved as SVG by your browser, without guides or selection.` : "Open a page first.");
              }}
            >
              SVG
            </Tool>
          </Toolbar>
        </div>
      }
      left={
        <Stack gap={3}>
          <RecoveryNotice handle={handle as DocHandle<unknown>} />
          <PanelGroup
            title="Pages"
            actions={
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={13} />}
                onClick={() => handle.edit((current) => {
                  const id = `pg-${current.pages.length + 1}-${wallMs().toString(36)}`;
                  return { ...current, pages: [...current.pages, { id, masterId: current.masters[0]?.id, frames: [], overrides: [] }], activePageId: id };
                }, "Add a page")}
              >
                Add
              </Button>
            }
          >
            {doc && (
              <div className="ds-row ds-wrap ds-gap-2">
                {doc.pages.map((page, index) => (
                  <button
                    key={page.id}
                    type="button"
                    className="vx-pagecard"
                    data-selected={page.id === doc.activePageId}
                    aria-label={`Page ${index + 1}`}
                    onClick={() => handle.edit((current) => ({ ...current, activePageId: page.id }), "Go to the page")}
                    style={{ padding: 0, lineHeight: 0 }}
                  >
                    <PageView doc={doc} page={page} index={index} compositions={compositions} zoom={0.1} showGuides={false} showBleed={false} />
                    <span className="ds-num" style={{ position: "absolute", inset: "auto 2px 2px auto", fontSize: 9, background: "var(--bg-surface)", padding: "0 3px", borderRadius: 2 }}>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </PanelGroup>
          <LayersPanel handle={handle} />
        </Stack>
      }
      leftLabel="Pages"
      right={
        tab === "Type" ? <TypePanel handle={handle} context={context} />
          : tab === "Review" ? <ReviewPanel handle={handle} compositions={compositions} context={context} />
            : tab === "Layout" ? <GridPanel handle={handle} />
              : <FramePanel handle={handle} context={context} compositions={compositions} />
      }
      rightLabel={tab === "Type" ? "Type" : tab === "Review" ? "Review" : tab === "Layout" ? "Page grid" : "Frame"}
      status={
        <>
          <span>Tool: {ui.tool}</span>
          <span>Zoom <span className="ds-num">{Math.round(ui.zoom * 100)}%</span></span>
          {doc && <span>Page <span className="ds-num">{activeIndex + 1}</span> of <span className="ds-num">{doc.pages.length}</span></span>}
          <span className="ds-grow" />
          {ui.threadFrom && <span>Pick the frame the copy should flow into</span>}
          <span>Drag to move, handles to resize · arrows nudge 1pt (⇧ 10pt) · ⌘ while dragging turns snapping off</span>
        </>
      }
    >
      <div
        ref={stageRef}
        className="lx-stage"
        data-tool={ui.tool}
        onPointerDown={(event) => {
          if (!doc) return;
          if (ui.tool === "select" || ui.tool === "thread") { selectFrame(undefined); return; }
          const svg = (event.target as Element).closest?.("svg[data-page-svg]") as SVGSVGElement | null
            ?? stageRef.current?.querySelector<SVGSVGElement>(`svg[data-page-svg="${doc.activePageId}"]`)
            ?? stageRef.current?.querySelector<SVGSVGElement>("svg[data-page-svg]") ?? null;
          if (!svg) return;
          const pageId = svg.getAttribute("data-page-svg") ?? doc.activePageId;
          const host = svg.getBoundingClientRect();
          const bleed = ui.showBleed ? doc.bleed : 0;
          const x = (event.clientX - host.left) / ui.zoom - bleed;
          const y = (event.clientY - host.top) / ui.zoom - bleed;
          const w = ui.tool === "text" ? mm(80) : mm(60);
          const h = ui.tool === "text" ? mm(50) : mm(40);
          const box = { x: Math.max(0, Math.min(doc.size.width - w, x)), y: Math.max(0, Math.min(doc.size.height - h, y)), w, h };
          const storyId = `st-${wallMs().toString(36)}`;
          const frame = ui.tool === "text" ? newTextFrame(box, storyId) : ui.tool === "image" ? newImageFrame(box) : newShapeFrame(box);
          handle.edit((current) => ({
            ...current,
            stories: ui.tool === "text" ? [...current.stories, { id: storyId, name: `Story ${current.stories.length + 1}`, text: "" }] : current.stories,
            activePageId: pageId,
            pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: [...page.frames, frame] } : page)),
          }), `Add a ${ui.tool} frame`);
          selectFrame(frame.id);
          setLayoutTool("select");
          if (!ui.spread || context.tab !== "Pages") context.setTab("Pages");
        }}
      >
        {doc && (
          <div className="lx-spread">
            {spreadPages.map((page) => {
              const index = doc.pages.findIndex((item) => item.id === page.id);
              return (
                <PageView
                  key={page.id}
                  doc={doc}
                  page={page}
                  index={index}
                  compositions={compositions}
                  zoom={ui.zoom}
                  interactive
                  onFrameDown={onFrameDown}
                  onHandleDown={onHandleDown}
                  onRotateDown={onRotateDown}
                  showGuides={ui.showGuides}
                  showBleed={ui.showBleed}
                  showBaseline={ui.showBaseline}
                />
              );
            })}
          </div>
        )}
      </div>
    </EditorFrame>
  );
}

function FramePanel({ handle, context, compositions }: { handle: DocHandle<PublicationDoc>; context: ScreenContext; compositions: Map<string, Composition> }) {
  const ui = useStore(layoutUi);
  const [alignTarget, setAlignTarget] = useState<AlignTarget>("margins");
  const doc = handle.doc;
  if (!doc) return null;
  if (selectedFrameIds(ui).length > 1) return <MultiArrangePanel handle={handle} target={alignTarget} onTarget={setAlignTarget} />;
  const page = doc.pages.find((item) => item.id === doc.activePageId);
  const frame = page?.frames.find((item) => item.id === ui.selectedFrameId)
    ?? doc.pages.flatMap((item) => item.frames).find((item) => item.id === ui.selectedFrameId);
  if (!frame) {
    return (
      <Stack gap={3}>
        <PanelGroup title="Page">
          <Field label="Master">
            <Select
              value={page?.masterId ?? ""}
              onChange={(event) => handle.edit((current) => ({ ...current, pages: current.pages.map((item) => (item.id === current.activePageId ? { ...item, masterId: event.target.value || undefined } : item)) }), "Apply a master")}
            >
              <option value="">None</option>
              {doc.masters.map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}
            </Select>
          </Field>
          <Properties rows={[
            { label: "Size", value: <span className="ds-num">{Math.round(toMm(doc.size.width))} × {Math.round(toMm(doc.size.height))}mm</span> },
            { label: "Margins", value: <span className="ds-num">{Math.round(toMm(doc.margins.top))}/{Math.round(toMm(doc.margins.outside))}/{Math.round(toMm(doc.margins.bottom))}/{Math.round(toMm(doc.margins.inside))}mm</span> },
            { label: "Bleed", value: <span className="ds-num">{Math.round(toMm(doc.bleed) * 10) / 10}mm</span> },
            { label: "Frames on this page", value: page?.frames.length ?? 0 },
          ]} />
        </PanelGroup>
        <p className="vx-mini">Click a frame to edit it, or pick a tool and click the page to place one.</p>
      </Stack>
    );
  }

  const set = (patch: Partial<Frame>, label: string) => handle.edit((current) => ({
    ...current,
    pages: current.pages.map((item) => ({ ...item, frames: item.frames.map((entry) => (entry.id === frame.id ? { ...entry, ...patch } : entry)) })),
  }), label);
  const composed = [...compositions.values()].flatMap((composition) => composition.frames).find((item) => item.frameId === frame.id);

  return (
    <Stack gap={3}>
      <PanelGroup title={`${frame.kind} frame`}>
        <Row gap={2} wrap>
          <Pill tone="info">{frame.kind}</Pill>
          {frame.overriddenFrom && <Pill tone="warning">overrides a master frame</Pill>}
          {frame.next && <Pill tone="accent">threaded</Pill>}
        </Row>
      </PanelGroup>
      <ArrangePanel handle={handle} frame={frame} target={alignTarget} onTarget={setAlignTarget} />
      <PanelGroup title="Geometry (mm)">
        <div className="vx-fieldrow">
          {(["x", "y", "w", "h"] as const).map((key) => (
            <div key={key}>
              <label className="vx-label" htmlFor={`frame-${key}`}>{key.toUpperCase()}</label>
              <input
                id={`frame-${key}`}
                className="vx-num"
                type="number"
                step={1}
                value={Math.round(toMm(frame.box[key]) * 10) / 10}
                onChange={(event) => set({ box: { ...frame.box, [key]: mm(Number(event.target.value)) } }, "Set the frame geometry")}
              />
            </div>
          ))}
          <div>
            <label className="vx-label" htmlFor="frame-rotation">Rotation (°)</label>
            <input
              id="frame-rotation"
              className="vx-num"
              type="number"
              step={1}
              disabled={frame.locked}
              value={frame.rotation ?? 0}
              onChange={(event) => set({ rotation: normaliseAngle(Number(event.target.value)) || undefined }, "Rotate the frame")}
            />
          </div>
        </div>
      </PanelGroup>
      <FrameStory handle={handle} frame={frame} />
      {frame.kind === "text" && (
        <PanelGroup title="Text frame">
          <Field label="Columns">
            <TextInput type="number" min={1} max={6} value={frame.columns ?? 1} onChange={(event) => set({ columns: Math.max(1, Number(event.target.value)) }, "Set the column count")} />
          </Field>
          <Field label="Gutter (mm)">
            <TextInput type="number" value={Math.round(toMm(frame.gutter ?? 0) * 10) / 10} onChange={(event) => set({ gutter: mm(Number(event.target.value)) }, "Set the gutter")} />
          </Field>
          <Field label="Inset (mm)">
            <TextInput type="number" value={Math.round(toMm(frame.inset ?? 0) * 10) / 10} onChange={(event) => set({ inset: mm(Number(event.target.value)) }, "Set the inset")} />
          </Field>
          <Field label="Flows into">
            <Select value={frame.next ?? ""} onChange={(event) => set({ next: event.target.value || undefined }, "Thread the frame")}>
              <option value="">Nothing — the thread ends here</option>
              {doc.pages.flatMap((item) => item.frames).filter((item) => item.kind === "text" && item.id !== frame.id).map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </Select>
          </Field>
          <Properties rows={[
            { label: "Lines set", value: <span className="ds-num">{composed?.lines.length ?? 0}</span> },
            { label: "Columns drawn", value: <span className="ds-num">{composed?.columnBoxes.length ?? 0}</span> },
          ]} />
        </PanelGroup>
      )}
      {frame.kind === "image" && (
        <PanelGroup title="Image">
          <Field label="Fitting">
            <Select value={frame.fit ?? "cover"} onChange={(event) => set({ fit: event.target.value as Frame["fit"] }, "Set the fitting")}>
              <option value="fill">Fill the frame (distorts)</option>
              <option value="cover">Fill proportionally, crop</option>
              <option value="contain">Fit inside, letterbox</option>
              <option value="none">Place at full size</option>
            </Select>
          </Field>
          <Field label="Image file">
            <input
              type="file"
              accept="image/*"
              aria-label="Choose an image for this frame"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const src = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.readAsDataURL(file);
                });
                const image = new Image();
                await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); image.src = src; });
                set({ src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }, "Place an image");
                context.toast("Image placed", `${image.naturalWidth} × ${image.naturalHeight} pixels, ${effectivePpi(frame.box, { width: image.naturalWidth, height: image.naturalHeight }, frame.fit)} ppi at this size.`);
              }}
            />
          </Field>
          {frame.naturalWidth && (
            <Properties rows={[
              { label: "Pixels", value: <span className="ds-num">{frame.naturalWidth} × {frame.naturalHeight}</span> },
              { label: "Effective", value: <span className="ds-num">{effectivePpi(frame.box, { width: frame.naturalWidth, height: frame.naturalHeight ?? 1 }, frame.fit)} ppi</span> },
            ]} />
          )}
        </PanelGroup>
      )}
      {frame.kind === "shape" && (
        <PanelGroup title="Shape">
          <Field label="Fill">
            <Row gap={2}>
              <input type="color" aria-label="Shape fill" value={frame.fill ?? "#234FE8"} onChange={(event) => set({ fill: event.target.value }, "Set the fill")} style={{ width: 34, height: 28 }} />
              <code className="ds-num">{frame.fill}</code>
            </Row>
          </Field>
        </PanelGroup>
      )}
      <Button size="sm" variant="ghost" disabled={frame.locked} title={frame.locked ? "Locked frames cannot be deleted. Unlock it first." : undefined} onClick={() => { handle.edit((current) => removeFrame(current, frame.id), "Delete the frame"); selectFrame(undefined); }}>Delete the frame</Button>
      {frame.locked && <p className="vx-mini">This frame is locked, so it cannot be deleted. Unlock it to delete it.</p>}
    </Stack>
  );
}

function TypePanel({ handle, context }: { handle: DocHandle<PublicationDoc>; context: ScreenContext }) {
  const doc = handle.doc;
  if (!doc) return null;
  const story = doc.stories[0];
  return (
    <Stack gap={3}>
      <PanelGroup title="Story">
        {story ? (
          <>
            <TextArea
              rows={10}
              aria-label={`${story.name} text`}
              value={story.text}
              onChange={(event) => handle.live((current) => ({ ...current, stories: current.stories.map((item) => (item.id === story.id ? { ...item, text: event.target.value } : item)) }))}
              onBlur={handle.beginGesture}
            />
            <p className="vx-mini"><span className="ds-num">{story.text.length}</span> characters, <span className="ds-num">{story.text.split(/\s+/).filter(Boolean).length}</span> words. The composition recalculates as you type.</p>
          </>
        ) : <p className="vx-mini">This publication has no story yet.</p>}
      </PanelGroup>
      <PanelGroup title="Paragraph styles">
        {doc.paragraphStyles.map((style) => (
          <Row key={style.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <span className="ds-grow">{style.name}</span>
            <span className="ds-num">{style.size}/{style.leading}</span>
          </Row>
        ))}
        <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/layout/publications/:id/typography", context.params.id))}>Open typography</Button>
      </PanelGroup>
    </Stack>
  );
}

function ReviewPanel({ handle, compositions, context }: { handle: DocHandle<PublicationDoc>; compositions: Map<string, Composition>; context: ScreenContext }) {
  const doc = handle.doc;
  const issues = issuesFor(doc, compositions);
  if (!doc) return null;
  return (
    <Stack gap={3}>
      <PanelGroup title={`${issues.length} preflight findings`}>
        {issues.length === 0 ? <Notice tone="success" title="Nothing found">Every frame fits, every image is linked and the fonts are available.</Notice> : issues.slice(0, 6).map((issue) => (
          <Notice key={issue.id} tone={issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "info"} title={issue.title}>{issue.detail}</Notice>
        ))}
      </PanelGroup>
      <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/layout/publications/:id/preflight", context.params.id))}>Open preflight</Button>
    </Stack>
  );
}

/* ---------------------------- LAYOUT-003 ---------------------------- */

function MastersScreen({ context, lens }: { context: ScreenContext; lens: "Masters" | "Variables" | "Usage" }) {
  const { record, handle, compositions } = usePublication(context);
  const [selected, setSelected] = useState<string | null>(null);
  if (!record) return <MissingPublication context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the publication…" />;
  const master = doc.masters.find((item) => item.id === selected) ?? doc.masters[0];

  if (lens === "Usage") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A master change reaches every page that uses it">
          Pages that have overridden a frame keep their own copy of that frame; the count below says how many.
        </Notice>
        {doc.masters.map((item) => {
          const usage = masterUsage(doc, item.id);
          return (
            <Card key={item.id} eyebrow="MASTER" prov="human" title={item.name} subtitle={<><span className="ds-num">{usage.length}</span> of <span className="ds-num">{doc.pages.length}</span> pages</>}>
              {usage.length === 0 ? <Empty title="Not applied to any page" /> : (
                <DataGrid
                  rows={usage}
                  rowId={(row) => row.page.id}
                  label={`${item.name} usage`}
                  columns={[
                    { key: "page", header: "Page", primary: true, cell: (row) => <span className="ds-num">{row.index + 1}</span>, sortValue: (row) => row.index },
                    { key: "frames", header: "Own frames", align: "end", cell: (row) => <span className="ds-num">{row.page.frames.length}</span> },
                    { key: "over", header: "Overrides", align: "end", cell: (row) => (row.overridden ? <Pill tone="warning">{row.overridden}</Pill> : "—") },
                    {
                      key: "go", header: "", align: "end", cell: (row) => (
                        <Button size="sm" variant="ghost" onClick={() => { handle.edit((current) => ({ ...current, activePageId: row.page.id }), "Go to the page"); context.navigate(context.path("/o/:org/layout/publications/:id", context.params.id)); }}>Open</Button>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (lens === "Variables") {
    return (
      <Grid>
        <Card span={6} eyebrow="VARIABLES" prov="human" title="Folio variables" subtitle="Substituted when a page is drawn">
          <Properties rows={[
            { label: "{page}", value: "The page number, counted from one" },
            { label: "{pages}", value: "How many pages the publication has" },
          ]} />
          <Notice tone="info" title="Where they are used">A folio frame on a master carries a template. Each page renders it with its own values, so there is one frame and many results.</Notice>
        </Card>
        <Card span={6} eyebrow="FOLIOS" prov="human" title="Folio frames on this master">
          {!master ? <Empty title="No master" /> : (
            <Stack gap={2}>
              {master.frames.filter((frame) => frame.kind === "folio").map((frame) => (
                <Field key={frame.id} label={`Template for ${frame.id}`}>
                  <TextInput
                    value={frame.template ?? ""}
                    onChange={(event) => handle.edit((current) => ({
                      ...current,
                      masters: current.masters.map((item) => (item.id === master.id
                        ? { ...item, frames: item.frames.map((entry) => (entry.id === frame.id ? { ...entry, template: event.target.value } : entry)) }
                        : item)),
                    }), "Change the folio template")}
                  />
                </Field>
              ))}
              {master.frames.filter((frame) => frame.kind === "folio").length === 0 && <p className="ds-subtle">This master has no folio frame.</p>}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handle.edit((current) => ({
                  ...current,
                  masters: current.masters.map((item) => (item.id === master.id
                    ? { ...item, frames: [...item.frames, { id: `mf-${wallMs().toString(36)}`, kind: "folio" as const, box: { x: mm(18), y: current.size.height - mm(14), w: current.size.width - mm(36), h: 14 }, template: "{page}", styleId: "ps-caption" }] }
                    : item)),
                }), "Add a folio")}
              >
                Add a folio frame
              </Button>
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={4} eyebrow="MASTERS" prov="human" title="Masters" subtitle={<><span className="ds-num">{doc.masters.length}</span> in this publication</>}>
        <Stack gap={2}>
          <div className="vx-tree">
            {doc.masters.map((item) => (
              <button key={item.id} type="button" className="vx-node" data-selected={item.id === master?.id} onClick={() => setSelected(item.id)}>
                <span className="vx-node-label">{item.name}</span>
                <Pill>{item.side}</Pill>
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => handle.edit((current) => ({
              ...current,
              masters: [...current.masters, { id: `mp-${wallMs().toString(36)}`, name: `Master ${current.masters.length + 1}`, side: "both" as const, frames: [] }],
            }), "Create a master")}
          >
            Create a master
          </Button>
          {master && (
            <>
              <Field label="Name"><TextInput value={master.name} onChange={(event) => handle.edit((current) => ({ ...current, masters: current.masters.map((item) => (item.id === master.id ? { ...item, name: event.target.value } : item)) }), "Rename the master")} /></Field>
              <Field label="Applies to">
                <Select value={master.side} onChange={(event) => handle.edit((current) => ({ ...current, masters: current.masters.map((item) => (item.id === master.id ? { ...item, side: event.target.value as "both" } : item)) }), "Change which pages the master applies to")}>
                  <option value="both">Both sides</option>
                  <option value="left">Left-hand pages</option>
                  <option value="right">Right-hand pages</option>
                </Select>
              </Field>
            </>
          )}
        </Stack>
      </Card>
      <Card
        span={8}
        eyebrow="MASTER"
        prov="human"
        title={master ? master.name : "No master"}
        subtitle={master ? (() => {
          const usage = masterUsage(doc, master.id);
          const overridden = usage.reduce((sum, item) => sum + item.overridden, 0);
          return <>Edits reach <span className="ds-num">{usage.length}</span> of <span className="ds-num">{doc.pages.length}</span> pages{overridden > 0 && <> · <span className="ds-num">{overridden}</span> overridden frame{overridden === 1 ? " keeps" : "s keep"} their own copy</>}</>;
        })() : undefined}
        actions={master ? <Button size="sm" variant="ghost" onClick={() => context.openOverlay("master preview")}>Preview the impact</Button> : undefined}
      >
        {!master ? <Empty title="Create a master to begin" /> : (
          <Stack gap={3}>
            <div style={{ display: "grid", placeContent: "center", background: "var(--bg-sunken)", padding: 16, borderRadius: 8 }}>
              <PageView
                doc={{ ...doc, pages: [{ id: "preview", masterId: master.id, frames: [], overrides: [] }] }}
                page={{ id: "preview", masterId: master.id, frames: [], overrides: [] }}
                index={0}
                compositions={compositions}
                zoom={0.46}
                showGuides
                showBleed={false}
              />
            </div>
            <DataGrid
              rows={master.frames}
              rowId={(row) => row.id}
              label="Master frames"
              columns={[
                { key: "id", header: "Frame", primary: true, cell: (row) => <span className="ds-num">{row.id}</span> },
                { key: "kind", header: "Kind", cell: (row) => row.kind },
                { key: "box", header: "Box (mm)", align: "end", cell: (row) => <span className="ds-num">{Math.round(toMm(row.box.x))},{Math.round(toMm(row.box.y))} {Math.round(toMm(row.box.w))}×{Math.round(toMm(row.box.h))}</span> },
                { key: "tpl", header: "Template", cell: (row) => row.template ?? "—" },
              ]}
              empty={<Empty title="No frames on this master">Add a folio on the Variables tab, or a rule below.</Empty>}
            />
            <Row gap={2} wrap>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handle.edit((current) => ({
                  ...current,
                  masters: current.masters.map((item) => (item.id === master.id
                    ? { ...item, frames: [...item.frames, { id: `mf-${wallMs().toString(36)}`, kind: "shape" as const, box: { x: mm(18), y: mm(24), w: current.size.width - mm(36), h: 0.6 }, fill: "#D9D4CB" }] }
                    : item)),
                }), "Add a rule to the master")}
              >
                Add a rule
              </Button>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Master editor")}>Apply to pages…</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("override confirmation")}>Overrides…</Button>
            </Row>
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

/* ---------------------------- LAYOUT-004 ---------------------------- */

function TypographyScreen({ context, lens }: { context: ScreenContext; lens: "Paragraph" | "Character" | "Flow" | "Accessibility" }) {
  const { record, handle, compositions } = usePublication(context);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  if (!record) return <MissingPublication context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the publication…" />;
  const style = doc.paragraphStyles.find((item) => item.id === selectedStyle) ?? doc.paragraphStyles[0];

  const setStyle = (patch: Partial<ParagraphStyle>, label: string) => handle.edit((current) => ({
    ...current,
    paragraphStyles: current.paragraphStyles.map((item) => (item.id === style.id ? { ...item, ...patch } : item)),
  }), label);

  if (lens === "Flow") {
    const heads = threadHeads(doc.pages);
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Threads are deterministic">
          A thread is an ordered chain of frames. Composition walks it in order, fills each column in turn, and carries what is left to the next frame. The same document always produces the same breaks.
        </Notice>
        {heads.map((head) => {
          const chain = threadFrames(doc.pages, head.id);
          const story = doc.stories.find((item) => item.id === head.storyId);
          const composition = story ? compositions.get(story.id) : undefined;
          return (
            <Card
              key={head.id}
              eyebrow="THREAD"
              prov="human"
              title={story?.name ?? head.id}
              subtitle={<><span className="ds-num">{chain.length}</span> frames · <span className="ds-num">{composition?.totalLines ?? 0}</span> lines set</>}
            >
              <Stack gap={3}>
                <Row gap={2} wrap>
                  {chain.map((frame, index) => (
                    <Row key={frame.id} gap={1}>
                      <Pill tone={frame.id === composition?.oversetFrom && composition.oversetChars > 0 ? "danger" : "info"}>
                        <span className="ds-num">{frame.id}</span>
                      </Pill>
                      {index < chain.length - 1 && <span aria-hidden="true">→</span>}
                    </Row>
                  ))}
                </Row>
                {composition && composition.oversetChars > 0 ? (
                  <Notice tone="danger" title={`${composition.oversetChars} characters do not fit`}>
                    <p>The thread ends at <span className="ds-num">{composition.oversetFrom}</span>. The text below is still held by the document:</p>
                    <blockquote style={{ marginBlockStart: 8, paddingInlineStart: 12, borderInlineStart: "2px solid var(--danger)" }}>
                      {composition.oversetText.slice(0, 400)}{composition.oversetText.length > 400 ? "…" : ""}
                    </blockquote>
                    <Row gap={2} style={{ marginBlockStart: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const last = chain[chain.length - 1];
                          const id = `pg-${wallMs().toString(36)}`;
                          const frameId = `fr-${wallMs().toString(36)}`;
                          handle.edit((current) => ({
                            ...current,
                            pages: [
                              ...current.pages.map((page) => ({ ...page, frames: page.frames.map((frame) => (frame.id === last.id ? { ...frame, next: frameId } : frame)) })),
                              {
                                id, masterId: current.masters[0]?.id, overrides: [],
                                frames: [{ ...last, id: frameId, next: undefined }],
                              },
                            ],
                            activePageId: id,
                          }), "Add a page for the overset text");
                          context.toast("Page added", "A copy of the last frame is on the new page and the thread now continues into it.");
                        }}
                      >
                        Add a page and continue the thread
                      </Button>
                    </Row>
                  </Notice>
                ) : (
                  <Notice tone="success" title="Everything fits">All the copy is placed in this thread.</Notice>
                )}
              </Stack>
            </Card>
          );
        })}
        {heads.length === 0 && <Empty title="No text frames yet" />}
      </Stack>
    );
  }

  if (lens === "Accessibility") {
    const problems: { title: string; detail: string; tone: "danger" | "warning" | "info" }[] = [];
    for (const item of doc.paragraphStyles) {
      if (item.size < 9) problems.push({ title: `${item.name} is ${item.size}pt`, detail: "Below nine points is hard to read in print and fails most on-screen guidance.", tone: "warning" });
      if (item.leading / item.size < 1.2) problems.push({ title: `${item.name} has tight leading`, detail: `Leading is ${(item.leading / item.size).toFixed(2)}× the type size. WCAG asks for at least 1.5× in body copy on screen.`, tone: item.leading / item.size < 1.1 ? "danger" : "warning" });
      if (item.align === "justify" && item.hyphenate === false) problems.push({ title: `${item.name} is justified without hyphenation`, detail: "Justified text without hyphenation opens rivers of white space and hurts readability.", tone: "warning" });
    }
    return (
      <Stack gap={4}>
        <Card eyebrow="ACCESSIBILITY" prov="human" title="Type checks" subtitle={<><span className="ds-num">{problems.length}</span> findings across <span className="ds-num">{doc.paragraphStyles.length}</span> styles</>}>
          {problems.length === 0 ? <Notice tone="success" title="Nothing found">Every style sets a readable size with comfortable leading.</Notice> : (
            <Stack gap={2}>{problems.map((problem, index) => <Notice key={index} tone={problem.tone} title={problem.title}>{problem.detail}</Notice>)}</Stack>
          )}
        </Card>
        <Card eyebrow="EXPORT" prov="human" title="What an accessible export would need" subtitle="Stated rather than claimed">
          <Properties rows={[
            { label: "Reading order", value: "The thread order is the reading order, and it is explicit in this document." },
            { label: "Tagged PDF", value: "Not produced. The browser's print dialogue writes an untagged PDF." },
            { label: "Alternative text", value: "Image frames do not carry alternative text yet." },
            { label: "HTML export", value: "Produces semantic headings and paragraphs from the paragraph styles, which is the accessible route available here." },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (lens === "Character") {
    return (
      <Grid>
        <Card span={5} eyebrow="CHARACTER" prov="human" title="Character styles" subtitle={<><span className="ds-num">{doc.characterStyles.length}</span> defined</>}>
          {doc.characterStyles.length === 0 ? (
            <Empty title="No character styles">A character style overrides part of a paragraph — a lead-in, a byline, a run of small caps.</Empty>
          ) : (
            <Stack gap={2}>
              {doc.characterStyles.map((item) => (
                <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <span className="ds-grow">{item.name}</span>
                  <span className="ds-num">{item.weight ?? "—"}</span>
                </Row>
              ))}
            </Stack>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handle.edit((current) => ({
              ...current,
              characterStyles: [...current.characterStyles, { id: `cs-${wallMs().toString(36)}`, name: `Character ${current.characterStyles.length + 1}`, weight: 700 }],
            }), "Create a character style")}
          >
            New character style
          </Button>
          <Notice tone="warning" title="Character styles are not applied to runs yet">
            A style can be defined and stored here, but the composer sets whole paragraphs. Applying a style to part of a line is not implemented, and this screen does not pretend it is.
          </Notice>
        </Card>
        <Card span={7} eyebrow="TRACKING" prov="human" title="Tracking and leading" subtitle={style.name}>
          <Stack gap={3}>
            <Field label="Tracking (points per character)">
              <input className="vx-range" type="range" min={-1} max={3} step={0.05} value={style.tracking} aria-label="Tracking" onChange={(event) => setStyle({ tracking: Number(event.target.value) }, "Adjust the tracking")} />
            </Field>
            <Field label="Leading (points)">
              <input className="vx-range" type="range" min={style.size} max={style.size * 2.4} step={0.5} value={style.leading} aria-label="Leading" onChange={(event) => setStyle({ leading: Number(event.target.value) }, "Adjust the leading")} />
            </Field>
            <Properties rows={[
              { label: "Tracking", value: <span className="ds-num">{style.tracking.toFixed(2)}pt</span> },
              { label: "Leading", value: <span className="ds-num">{style.leading}pt ({(style.leading / style.size).toFixed(2)}×)</span> },
            ]} />
            <StylePreview doc={doc} style={style} />
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={4} eyebrow="STYLES" prov="human" title="Paragraph styles">
        <Stack gap={2}>
          <div className="vx-tree">
            {doc.paragraphStyles.map((item) => (
              <button key={item.id} type="button" className="vx-node" data-selected={item.id === style.id} onClick={() => setSelectedStyle(item.id)}>
                <span className="vx-node-label">{item.name}</span>
                <span className="ds-num">{item.size}/{item.leading}</span>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handle.edit((current) => ({
              ...current,
              paragraphStyles: [...current.paragraphStyles, { ...BASE_STYLES[0], id: `ps-${wallMs().toString(36)}`, name: `Style ${current.paragraphStyles.length + 1}` }],
            }), "Create a paragraph style")}
          >
            New style
          </Button>
        </Stack>
      </Card>
      <Card span={8} eyebrow="STYLE" prov="human" title={style.name} subtitle="Changing a value recomposes every frame that uses it">
        <Stack gap={3}>
          <Row gap={3} wrap>
            <Field label="Name"><TextInput value={style.name} onChange={(event) => setStyle({ name: event.target.value }, "Rename the style")} /></Field>
            <Field label="Family">
              <Select value={style.family} onChange={(event) => setStyle({ family: event.target.value }, "Change the family")}>
                {["Georgia", "Inter", "Times New Roman", "Courier New", "Helvetica Neue", "Palatino"].map((family) => (
                  <option key={family} value={family}>{family}{fontAvailable(family) ? "" : " — not loaded"}</option>
                ))}
              </Select>
            </Field>
          </Row>
          <div className="vx-fieldrow">
            <div><label className="vx-label" htmlFor="ps-size">Size (pt)</label><input id="ps-size" className="vx-num" type="number" step={0.5} value={style.size} onChange={(event) => setStyle({ size: Number(event.target.value) }, "Change the size")} /></div>
            <div><label className="vx-label" htmlFor="ps-lead">Leading (pt)</label><input id="ps-lead" className="vx-num" type="number" step={0.5} value={style.leading} onChange={(event) => setStyle({ leading: Number(event.target.value) }, "Change the leading")} /></div>
            <div><label className="vx-label" htmlFor="ps-weight">Weight</label><input id="ps-weight" className="vx-num" type="number" step={50} value={style.weight} onChange={(event) => setStyle({ weight: Number(event.target.value) }, "Change the weight")} /></div>
            <div><label className="vx-label" htmlFor="ps-indent">First indent (pt)</label><input id="ps-indent" className="vx-num" type="number" value={style.firstLineIndent} onChange={(event) => setStyle({ firstLineIndent: Number(event.target.value) }, "Change the indent")} /></div>
            <div><label className="vx-label" htmlFor="ps-before">Space before</label><input id="ps-before" className="vx-num" type="number" value={style.spaceBefore} onChange={(event) => setStyle({ spaceBefore: Number(event.target.value) }, "Change the space before")} /></div>
            <div><label className="vx-label" htmlFor="ps-after">Space after</label><input id="ps-after" className="vx-num" type="number" value={style.spaceAfter} onChange={(event) => setStyle({ spaceAfter: Number(event.target.value) }, "Change the space after")} /></div>
          </div>
          <Row gap={3} wrap>
            <Field label="Alignment">
              <Select value={style.align} onChange={(event) => setStyle({ align: event.target.value as ParagraphStyle["align"] }, "Change the alignment")}>
                {["left", "right", "center", "justify"].map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
            <Checkbox label="Hyphenate" checked={style.hyphenate} onChange={(event) => setStyle({ hyphenate: event.target.checked }, "Toggle hyphenation")} />
            <Checkbox label="Snap to the baseline grid" checked={style.alignToBaseline} onChange={(event) => setStyle({ alignToBaseline: event.target.checked }, "Toggle baseline alignment")} />
          </Row>
          <StylePreview doc={doc} style={style} />
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Text style")}>Apply to a frame…</Button>
        </Stack>
      </Card>
      <Card span={12} eyebrow="BASELINE" prov="human" title="Baseline grid" subtitle={<>Every line in a snapping style lands on a multiple of <span className="ds-num">{doc.baseline.step}pt</span></>}>
        <Row gap={3} wrap>
          <Field label="First baseline (pt)"><TextInput type="number" value={doc.baseline.start} onChange={(event) => handle.edit((current) => ({ ...current, baseline: { ...current.baseline, start: Number(event.target.value) } }), "Change the baseline start")} /></Field>
          <Field label="Step (pt)"><TextInput type="number" value={doc.baseline.step} onChange={(event) => handle.edit((current) => ({ ...current, baseline: { ...current.baseline, step: Math.max(1, Number(event.target.value)) } }), "Change the baseline step")} /></Field>
          <Checkbox label="Show it on the canvas" checked={layoutUi.get().showBaseline} onChange={(event) => layoutUi.set((current) => ({ ...current, showBaseline: event.target.checked }))} />
        </Row>
      </Card>
    </Grid>
  );
}

function StylePreview({ doc, style }: { doc: PublicationDoc; style: ParagraphStyle }) {
  const sample = "Brushed brass and linen, assembled in Clerkenwell. Three week lead time on trade orders of four or more, and a consultation in the showroom for anything larger.";
  const lines = useMemo(() => {
    const metrics = canvasMetrics();
    const composition = composeStory(
      { id: "preview", name: "preview", text: sample },
      [{ id: "preview-frame", kind: "text", box: { x: 0, y: 0, w: 380, h: 200 }, columns: 1, gutter: 0, inset: 0, storyId: "preview" }],
      [style],
      metrics,
      doc.baseline,
    );
    return composition.frames[0]?.lines ?? [];
  }, [style, doc.baseline]);
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-default)", borderRadius: 6, padding: 8 }}>
      <svg width="100%" viewBox={`0 0 380 ${Math.max(60, lines.length * style.leading + 20)}`} role="img" aria-label={`${style.name} sample, ${lines.length} lines`}>
        {lines.map((line, index) => (
          <text key={index} x={line.x} y={line.y} fontFamily={style.family} fontSize={style.size} fontWeight={style.weight} letterSpacing={style.tracking} wordSpacing={line.wordSpacing} fill={style.color}>
            {line.text}
          </text>
        ))}
      </svg>
      <p className="vx-mini"><span className="ds-num">{lines.length}</span> lines at <span className="ds-num">{style.size}/{style.leading}pt</span> in a 380pt column, measured by this browser.</p>
    </div>
  );
}

/* ---------------------------- LAYOUT-005 ---------------------------- */

function PreflightScreen({ context, lens }: { context: ScreenContext; lens: "Preflight" | "Proof" | "Export" | "History" }) {
  const { record, handle, compositions } = usePublication(context);
  if (!record) return <MissingPublication context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the publication…" />;
  const issues = issuesFor(doc, compositions);
  const blocked = preflightBlocks(issues);

  if (lens === "Proof") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="The proof is the same renderer as the canvas">
          Crop marks, the bleed area and the slug are drawn at the real sizes. What is proofed is what the editor composed.
        </Notice>
        <Card eyebrow="PROOF" prov="human" title="Print proof" subtitle={<>Bleed <span className="ds-num">{Math.round(toMm(doc.bleed) * 10) / 10}mm</span> · slug <span className="ds-num">{Math.round(toMm(doc.slug))}mm</span> · {doc.colourMode}</>} flush>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16, background: "var(--bg-sunken)", justifyContent: "center" }}>
            {doc.pages.map((page, index) => (
              <PageView key={page.id} doc={doc} page={page} index={index} compositions={compositions} zoom={0.34} proof showGuides={false} />
            ))}
          </div>
        </Card>
      </Stack>
    );
  }

  if (lens === "History") {
    return (
      <Grid>
        <Card span={6} eyebrow="SESSION" prov="human" title="This session" subtitle={<><span className="ds-num">{handle.historyLabels.length}</span> undoable steps</>}>
          {handle.historyLabels.length === 0 ? <Empty title="Nothing yet" /> : (
            <Stack gap={1}>
              {[...handle.historyLabels].reverse().slice(0, 20).map((label, index) => (
                <Row key={index} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}><span className="ds-grow">{label}</span><span className="ds-num">{handle.historyLabels.length - index}</span></Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={6} eyebrow="RECORD" prov="posted" title="Record snapshots" subtitle={<>revision <span className="ds-num">{record.revision}</span></>}>
          {record.history.length === 0 ? <p className="ds-subtle">No snapshots yet.</p> : (
            <DataGrid
              rows={record.history.map((item, index) => ({ ...item, id: String(index) }))}
              rowId={(row) => row.id}
              label="Snapshots"
              columns={[
                { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
                { key: "status", header: "Status", cell: (row) => row.status },
              ]}
            />
          )}
        </Card>
      </Grid>
    );
  }

  if (lens === "Export") {
    return (
      <Grid>
        <Card span={6} eyebrow="HTML" prov="human" title="HTML export" subtitle="Written by this browser, with the thread order as the reading order">
          <Stack gap={3}>
            <p className="ds-prose">Each paragraph style becomes a semantic element — a headline becomes a heading, body copy becomes a paragraph — so the export is readable and accessible. Frame positions are not reproduced; the export is a document, not a facsimile.</p>
            <Button
              variant="primary"
              onClick={() => {
                downloadText(`${slug(record.title)}.html`, publicationToHtml(doc, record.title), "text/html");
                context.toast("HTML written", "The file downloaded from this browser.");
              }}
            >
              Download HTML
            </Button>
          </Stack>
        </Card>
        <Card span={6} eyebrow="PDF" prov="unknown" title="Press PDF" subtitle="What this page can and cannot do">
          <Stack gap={3}>
            <Notice tone="warning" title="This page cannot write a PDF">
              There is no PDF writer here and no print service is connected. What it can do is lay the proof out at the true size with crop marks and hand it to the browser's own print dialogue, where Save as PDF produces a file.
            </Notice>
            <Properties rows={[
              { label: "Colour", value: "RGB. No separation to CMYK happens, so a printer would convert it." },
              { label: "Fonts", value: "Named, not embedded by this page. The browser embeds what it has when it writes the PDF." },
              { label: "Bleed", value: <span className="ds-num">{Math.round(toMm(doc.bleed) * 10) / 10}mm drawn, included in the proof</span> },
              { label: "Preflight", value: blocked ? "Blocking errors are outstanding" : "No blocking errors" },
            ]} />
            <Button
              variant={blocked ? "outline-danger" : "primary"}
              onClick={() => {
                if (blocked) { context.openOverlay("Preflight detail"); return; }
                const html = proofToHtml(doc, record.title);
                const frame = window.open("", "_blank");
                if (!frame) { context.toast("The browser blocked the print window", "Allow pop-ups for this page, or use the HTML export instead.", "blocked"); return; }
                frame.document.write(html);
                frame.document.close();
                frame.focus();
                context.toast("Proof opened", "Use the browser's print dialogue and choose Save as PDF. This page did not write the file itself.");
              }}
            >
              {blocked ? `${issues.filter((issue) => issue.severity === "error").length} errors must be cleared first` : "Open the print proof"}
            </Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  const checks: { id: string; label: string; match: (issue: PreflightIssue) => boolean; pass: string }[] = [
    { id: "overset", label: "Overset text", match: (issue) => issue.id.startsWith("overset-"), pass: "Every story is placed" },
    { id: "missing", label: "Missing images", match: (issue) => issue.id.startsWith("missing-"), pass: "Every image frame is linked" },
    { id: "ppi", label: "Image resolution", match: (issue) => issue.id.startsWith("ppi-"), pass: "At or above the target ppi" },
    { id: "bleed", label: "Bleed", match: (issue) => issue.id.startsWith("bleed-") || issue.id === "nobleed", pass: "Edges reach the bleed" },
    { id: "fonts", label: "Fonts", match: (issue) => issue.id.startsWith("font-"), pass: "Available in this browser" },
    { id: "type", label: "Type size", match: (issue) => issue.id.startsWith("small-"), pass: `No style below ${8}pt` },
  ];
  const errors = byseverityCount(issues, "error");
  const warnings = byseverityCount(issues, "warning");
  const findIssueAction = (issue: PreflightIssue) => (
    <Row gap={1}>
      {issue.pageIndex !== undefined && (
        <Button size="sm" variant="ghost" onClick={() => { handle.edit((current) => ({ ...current, activePageId: current.pages[issue.pageIndex!]?.id ?? current.activePageId }), "Go to the page"); if (issue.frameId) selectFrame(issue.frameId); context.navigate(context.path("/o/:org/layout/publications/:id", context.params.id)); }}>
          Page {issue.pageIndex + 1}
        </Button>
      )}
      {issue.fix === "add-bleed" && (
        <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => ({ ...current, bleed: mm(3) }), "Set a 3mm bleed")}>Set 3mm bleed</Button>
      )}
      {issue.fix === "add-page" && (
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("overset warning")}>Resolve the overset</Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Preflight detail", { id: issue.id })}>Detail</Button>
    </Row>
  );
  return (
    <Stack gap={4}>
      {blocked
        ? <Notice tone="danger" title={`${errors} error${errors === 1 ? "" : "s"} block the press export`}>{warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"} to check as well. ` : ""}Clear the errors below; the proof stays available.</Notice>
        : warnings > 0
          ? <Notice tone="warning" title={`Clear to export with ${warnings} warning${warnings === 1 ? "" : "s"}`}>Nothing blocks the press export. Check the warnings before sending.</Notice>
          : <Notice tone="success" title="Preflight is clean">Every frame fits, every image is linked at a usable resolution, and the fonts are available in this browser.</Notice>}
      <Grid>
        <PageSection title="Checks" hint="Computed from the document" span={7} flush>
          <ul className="vx-uselist">
            {checks.map((check) => {
              const found = issues.filter(check.match);
              const worst = found.some((issue) => issue.severity === "error") ? "danger" : found.length ? "warning" : "success";
              return (
                <li key={check.id} className="vx-use">
                  <span className="ds-grow"><strong>{check.label}</strong><span className="vx-mini"> · {found.length ? `${found.length} to look at` : check.pass}</span></span>
                  <Pill tone={worst}>{found.length ? (worst === "danger" ? "error" : "warning") : "pass"}</Pill>
                </li>
              );
            })}
          </ul>
        </PageSection>
        <PageSection title="Print setup" hint="What the proof and export use" span={5}>
          <KeyValueList
            items={[
              { label: "Trim", value: `${Math.round(toMm(doc.size.width))} × ${Math.round(toMm(doc.size.height))} mm`, mono: true },
              { label: "Bleed", value: `${Math.round(toMm(doc.bleed) * 10) / 10} mm`, mono: true },
              { label: "Slug", value: `${Math.round(toMm(doc.slug))} mm`, mono: true },
              { label: "Colour", value: doc.colourMode },
              { label: "Pages", value: `${doc.pages.length}${doc.facingPages ? " · facing" : ""}`, mono: true },
            ]}
          />
        </PageSection>
      </Grid>
      {issues.length > 0 && (
        <PageSection title="Findings" hint={<><span className="ds-num">{errors}</span> errors, <span className="ds-num">{warnings}</span> warnings</>}>
          <Stack gap={2}>
            {issues.map((issue) => (
              <Notice key={issue.id} tone={severityTone(issue.severity)} title={issue.title} actions={findIssueAction(issue)}>
                {issue.detail}
              </Notice>
            ))}
          </Stack>
        </PageSection>
      )}
    </Stack>
  );
}

function byseverityCount(issues: PreflightIssue[], severity: PreflightIssue["severity"]): number {
  return issues.filter((issue) => issue.severity === severity).length;
}


/* ------------------------------ export helpers ------------------------------ */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function publicationToHtml(doc: PublicationDoc, title: string): string {
  const body = doc.stories.map((story) => {
    const paragraphs = story.text.split(/\n+/);
    return paragraphs.map((paragraph, index) => {
      const style = doc.paragraphStyles.find((item) => item.id === (story.styleByParagraph?.[index] ?? "")) ?? doc.paragraphStyles[0];
      const tag = style.size >= 24 ? "h1" : style.size >= 16 ? "h2" : "p";
      return `<${tag} class="${style.id}">${escapeHtml(paragraph)}</${tag}>`;
    }).join("\n");
  }).join("\n");
  const css = doc.paragraphStyles.map((style) => `.${style.id}{font-family:${JSON.stringify(style.family)},serif;font-size:${style.size}pt;line-height:${style.leading}pt;font-weight:${style.weight};letter-spacing:${style.tracking}pt;text-align:${style.align};margin:${style.spaceBefore}pt 0 ${style.spaceAfter}pt;color:${style.color}}`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{max-width:${Math.round(doc.size.width - doc.margins.inside - doc.margins.outside)}pt;margin:40px auto;padding:0 16px;background:#fff}
${css}</style></head>
<body>
${body}
<hr><p class="ps-caption">Exported from Arlovi Layout in a browser. Reading order follows the text thread. Frame positions are not reproduced: this is a document, not a facsimile of the page.</p>
</body></html>`;
}

function proofToHtml(doc: PublicationDoc, title: string): string {
  const pages = doc.pages.map((_page, index) => {
    const paragraphs = doc.stories[0]?.text.split(/\n+/) ?? [];
    return `<section class="page"><header class="folio">${escapeHtml(title)} · page ${index + 1} of ${doc.pages.length}</header>
<div class="cols">${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div></section>`;
  }).join("\n");
  const style = doc.paragraphStyles[0];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} — proof</title>
<style>
@page { size: ${Math.round(doc.size.width)}pt ${Math.round(doc.size.height)}pt; margin: 0; }
body { margin: 0; background: #fff; }
.page { width: ${Math.round(doc.size.width)}pt; height: ${Math.round(doc.size.height)}pt; padding: ${Math.round(doc.margins.top)}pt ${Math.round(doc.margins.outside)}pt ${Math.round(doc.margins.bottom)}pt ${Math.round(doc.margins.inside)}pt; box-sizing: border-box; page-break-after: always; position: relative; }
.cols { column-count: ${doc.columns.count}; column-gap: ${Math.round(doc.columns.gutter)}pt; font-family: ${JSON.stringify(style.family)}, serif; font-size: ${style.size}pt; line-height: ${style.leading}pt; text-align: ${style.align}; }
.folio { position: absolute; bottom: ${Math.round(doc.margins.bottom / 2)}pt; left: ${Math.round(doc.margins.inside)}pt; font: 8pt Inter, sans-serif; color: #6B6760; }
p { margin: 0 0 ${style.spaceAfter}pt; }
</style></head><body>${pages}
<script>window.addEventListener("load", function () { window.print(); });</script>
</body></html>`;
}

/* ====================================================================== *
 * Overlays and registration
 * ====================================================================== */

function PagePreset({ context, close }: { context: ScreenContext; close: () => void }) {
  const [name, setName] = useState("");
  const [sizeId, setSizeId] = useState("a4");
  const [facing, setFacing] = useState(true);
  const [bleedMm, setBleedMm] = useState(3);
  const [columns, setColumns] = useState(2);
  const [kind, setKind] = useState("publication");
  return (
    <form
      id="layout-page-preset"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const doc = starterPublication(name || "Untitled publication", sizeId);
        doc.facingPages = facing;
        doc.bleed = mm(bleedMm);
        doc.columns = { ...doc.columns, count: columns };
        doc.pages = doc.pages.map((page) => ({ ...page, frames: page.frames.map((frame) => (frame.kind === "text" ? { ...frame, columns } : frame)) }));
        const made = await context.mutate.create({
          collection: "publications", title: name || "Untitled publication",
          status: kind === "template" ? "template" : "draft",
          summary: `${doc.size.name}, ${columns} columns, ${bleedMm}mm bleed.`,
          body: doc,
          fields: { kind, size: doc.size.name, pages: doc.pages.length, bleedMm },
        }, `Publication ${name || "Untitled"} created`);
        context.toast("Created", `${made.title} opens with two threaded pages.`);
        close();
        context.navigate(context.path("/o/:org/layout/publications/:id", made.id));
      }}
    >
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="Trade lookbook" /></Field>
      <Field label="Page size">
        <Select value={sizeId} onChange={(event) => setSizeId(event.target.value)}>
          {PAGE_SIZES.map((size) => <option key={size.id} value={size.id}>{size.name} — {Math.round(toMm(size.width))} × {Math.round(toMm(size.height))}mm</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Columns"><TextInput type="number" min={1} max={6} value={columns} onChange={(event) => setColumns(Math.max(1, Number(event.target.value)))} /></Field>
        <Field label="Bleed (mm)"><TextInput type="number" step={0.5} value={bleedMm} onChange={(event) => setBleedMm(Number(event.target.value))} /></Field>
      </Row>
      <Checkbox label="Facing pages" checked={facing} onChange={(event) => setFacing(event.target.checked)} />
      <Field label="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="publication">Publication</option>
          <option value="template">Template</option>
        </Select>
      </Field>
      <p className="vx-mini">Stored in points, shown in millimetres. Nothing is rounded to pixels on the way in or out.</p>
    </form>
  );
}

function ImportReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  return (
    <Stack gap={3}>
      <p className="vx-mini"># starts a headline, ## a subhead; everything else is body copy, poured through a two-page thread.</p>
      <Field label="Publication name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Text">
        <TextArea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder={"# Winter collection\nBrushed brass and linen…"} />
      </Field>
      <Field label="Or choose a file">
        <input
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          aria-label="Choose a text file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setText(await file.text());
            if (!name) setName(file.name.replace(/\.(txt|md)$/i, ""));
          }}
        />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={!text.trim() || !name.trim()}
              onClick={async () => {
          const doc = starterPublication(name);
          const paragraphs = text.split(/\n+/);
          const styleByParagraph: Record<number, string> = {};
          const cleaned = paragraphs.map((paragraph, index) => {
            if (paragraph.startsWith("## ")) { styleByParagraph[index] = "ps-sub"; return paragraph.slice(3); }
            if (paragraph.startsWith("# ")) { styleByParagraph[index] = "ps-head"; return paragraph.slice(2); }
            return paragraph;
          });
          doc.stories = [{ id: "story-1", name: `${name} — main story`, text: cleaned.join("\n"), styleByParagraph }];
          const made = await context.mutate.create({
            collection: "publications", title: name, status: "draft",
            summary: `Imported ${text.length} characters of copy.`,
            body: doc, fields: { kind: "publication", size: doc.size.name, pages: doc.pages.length },
          }, `Imported copy into ${name}`);
          context.toast("Imported", `${cleaned.length} paragraphs poured into the thread. Any overset is reported on the Flow tab.`);
          close();
          context.navigate(context.path("/o/:org/layout/publications/:id", made.id));
        }}
      >
        Import and pour the copy
      </Button>
          }
          end={<OverlayCancel />}
        />
      </ModalActions>
    </Stack>
  );
}

function SharePanel({ context }: { context: ScreenContext }) {
  const sharePayload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(sharePayload?.id ?? context.selectedId);
  if (!record) return <Empty title="Select a publication first" />;
  return (
    <Stack gap={3}>
      <FactGrid
        dense
        items={[
          { label: "Owner", value: record.ownerName },
          { label: "Revision", value: record.revision, mono: true },
        ]}
      />
      <Notice tone="warning" title="There is no sharing service">
        Nothing can be published to a link from here. A reader can be given the HTML export, written in this browser.
      </Notice>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" onClick={() => context.navigate(`${context.path("/o/:org/layout/publications/:id/preflight", record.id)}?tab=Export`)}>Open the export</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function recordSummary(context: ScreenContext) {
  return <RecordSummary context={context} />;
}

function RecordSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!record) return null;
  const size = String(record.fields.size ?? "");
  return (
    <OverlaySummary
      eyebrow="Publication"
      title={record.title}
      status={<Pill tone={record.status === "template" ? "accent" : "neutral"}>{record.status}</Pill>}
      meta={[size, record.fields.pages ? `${String(record.fields.pages)} pages` : ""]}
    />
  );
}

function FrameEditorOverlay({ context }: { context: ScreenContext }) {
  const { record, handle, compositions } = usePublication(context);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  return <FramePanel handle={handle} context={context} compositions={compositions} />;
}

function PageSettings({ context }: { context: ScreenContext }) {
  const { record, handle } = usePublication(context);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <OverlaySection title="Page">
        <Field label="Page size">
          <Select
            value={doc.size.id}
            onChange={(event) => {
              const size = PAGE_SIZES.find((item) => item.id === event.target.value);
              if (size) handle.edit((current) => ({ ...current, size }), "Change the page size");
            }}
          >
            {PAGE_SIZES.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
          </Select>
        </Field>
        <Checkbox label="Facing pages" checked={doc.facingPages} onChange={(event) => handle.edit((current) => ({ ...current, facingPages: event.target.checked }), "Toggle facing pages")} />
      </OverlaySection>
      <OverlaySection title="Margins" hint="Millimetres, measured from the trim">
        <div className="vx-fieldrow">
          {(["top", "bottom", "inside", "outside"] as const).map((side) => (
            <div key={side}>
              <label className="vx-label" htmlFor={`margin-${side}`}>Margin {side} (mm)</label>
              <input
                id={`margin-${side}`}
                className="vx-num"
                type="number"
                value={Math.round(toMm(doc.margins[side]) * 10) / 10}
                onChange={(event) => handle.edit((current) => ({ ...current, margins: { ...current.margins, [side]: mm(Number(event.target.value)) } }), "Change the margins")}
              />
            </div>
          ))}
        </div>
      </OverlaySection>
      <OverlaySection title="Print setup" hint="Bleed is what preflight checks edges against">
        <div className="vx-fieldrow">
          <div>
            <label className="vx-label" htmlFor="bleed">Bleed (mm)</label>
            <input id="bleed" className="vx-num" type="number" step={0.5} value={Math.round(toMm(doc.bleed) * 10) / 10} onChange={(event) => handle.edit((current) => ({ ...current, bleed: mm(Number(event.target.value)) }), "Change the bleed")} />
          </div>
          <div>
            <label className="vx-label" htmlFor="cols">Columns</label>
            <input id="cols" className="vx-num" type="number" min={1} max={6} value={doc.columns.count} onChange={(event) => handle.edit((current) => ({ ...current, columns: { ...current.columns, count: Math.max(1, Number(event.target.value)) } }), "Change the column count")} />
          </div>
        </div>
        <Checkbox label="Show column guides" checked={doc.columns.visible} onChange={(event) => handle.edit((current) => ({ ...current, columns: { ...current.columns, visible: event.target.checked } }), "Toggle the column guides")} />
      </OverlaySection>
      <p className="vx-mini">Changes apply as you type and can be undone from the editor.</p>
      <ModalActions><OverlayActions primary={<OverlayCancel>Done</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/** Add a page after the one holding `lastFrameId` and thread a copy of that frame onto it, so the copy keeps flowing. */
function continueOnNewPage(doc: PublicationDoc, lastFrameId: string): PublicationDoc {
  const found = findFrame(doc, lastFrameId);
  if (!found) return doc;
  const { frame, pageIndex } = found;
  const source = doc.pages[pageIndex];
  const pageId = `pg-${wallMs().toString(36)}-${doc.pages.length + 1}`;
  const next: Frame = { ...newTextFrame({ ...frame.box }, frame.storyId ?? ""), columns: frame.columns, gutter: frame.gutter, inset: frame.inset, styleId: frame.styleId, storyId: frame.storyId };
  const pages = doc.pages.map((page) => (page.id === source.id ? { ...page, frames: page.frames.map((item) => (item.id === frame.id ? { ...item, next: next.id } : item)) } : page));
  pages.splice(pageIndex + 1, 0, { id: pageId, masterId: source.masterId, frames: [next], overrides: [] });
  return { ...doc, pages, activePageId: pageId };
}

function oversetSummary(context: ScreenContext) {
  return <OversetSummary context={context} />;
}

function OversetSummary({ context }: { context: ScreenContext }) {
  const { record, handle, compositions } = usePublication(context);
  const overset = [...compositions.values()].filter((composition) => composition.oversetChars > 0);
  if (!record || !handle.doc) return null;
  const chars = overset.reduce((sum, item) => sum + item.oversetChars, 0);
  return (
    <OverlaySummary
      eyebrow="Overset text"
      title={chars > 0 ? <><span className="ds-num">{chars.toLocaleString("en")}</span> characters do not fit</> : "Nothing is overset"}
      status={chars > 0 ? <Pill tone="danger">kept, not placed</Pill> : <Pill tone="success">all placed</Pill>}
      meta={[record.title, overset.length > 0 ? `${overset.length} stor${overset.length === 1 ? "y" : "ies"} affected` : ""]}
    />
  );
}

function OversetWarning({ context }: { context: ScreenContext }) {
  const { record, handle, compositions } = usePublication(context);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const overset = [...compositions.entries()].filter(([, composition]) => composition.oversetChars > 0);
  const exporting = Boolean((context.overlayPayload as { exporting?: boolean } | undefined)?.exporting);
  if (overset.length === 0) {
    return <p className="vx-mini">Every character of every story is placed in a frame.</p>;
  }
  const first = overset[0][1];
  return (
    <Stack gap={3}>
      {overset.map(([storyId, composition]) => {
        const story = doc.stories.find((item) => item.id === storyId);
        const last = composition.oversetFrom ? findFrame(doc, composition.oversetFrom) : undefined;
        return (
          <OverlaySection key={storyId} title={story?.name ?? storyId} tone="danger" hint={last ? <>Thread ends on page <span className="ds-num">{last.pageIndex + 1}</span></> : undefined}>
            <FactGrid
              dense
              items={[
                { label: "Characters over", value: composition.oversetChars.toLocaleString("en"), mono: true, tone: "danger" },
                { label: "Words over", value: composition.oversetText.split(/\s+/).filter(Boolean).length.toLocaleString("en"), mono: true },
              ]}
            />
            <blockquote className="lx-overset-quote">
              {composition.oversetText.slice(0, 420)}{composition.oversetText.length > 420 ? "…" : ""}
            </blockquote>
          </OverlaySection>
        );
      })}
      <p className="vx-mini">The document still holds this text. Adding a page threads a copy of the last frame onto it so the copy keeps flowing; it may take more than one page.</p>
      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={!first.oversetFrom}
              onClick={() => {
                const target = first.oversetFrom;
                if (!target) return;
                handle.edit((current) => continueOnNewPage(current, target), "Add a page and continue the thread");
                context.toast("Page added", "A new page now receives the copy from the last frame. Check the editor for what is still overset.");
                context.closeOverlay();
              }}
            >
              Add a page and keep flowing
            </Button>
          }
          secondary={<Button variant="secondary" onClick={() => context.navigate(`${context.path("/o/:org/layout/publications/:id/typography", context.params.id)}?tab=Flow`)}>Open the flow</Button>}
          end={exporting
            ? <><Button variant="outline-danger" onClick={async () => { context.closeOverlay(); await exportHtml(context, doc); }}>Export anyway, without the overset text</Button><OverlayCancel>Close</OverlayCancel></>
            : <OverlayCancel>Close</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

function MasterEditorOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePublication(context);
  const [masterId, setMasterId] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const master = doc.masters.find((item) => item.id === (masterId || doc.masters[0]?.id));
  if (!master) return <Empty title="No masters yet">Create a master first.</Empty>;
  const onIt = masterUsage(doc, master.id);
  const changing = doc.pages.map((page, index) => ({ page, index })).filter(({ page }) => page.masterId !== master.id);
  const keptOverrides = doc.pages.reduce((sum, page) => sum + (page.masterId !== master.id ? page.overrides.length : 0), 0);
  return (
    <Stack gap={3}>
      <Field label="Master">
        <Select value={master.id} onChange={(event) => setMasterId(event.target.value)}>
          {doc.masters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <OverlaySection title="What changes" tone={changing.length > 0 ? "warning" : "neutral"}>
        <FactGrid
          columns={3}
          dense
          items={[
            { label: "Already on it", value: `${onIt.length} of ${doc.pages.length}`, mono: true },
            { label: "Pages that change", value: changing.length, mono: true, tone: changing.length > 0 ? "warning" : undefined },
            { label: "Overrides kept", value: keptOverrides, mono: true, hint: "Local frame copies stay" },
          ]}
        />
        {changing.length > 0 && (
          <p className="vx-mini">Pages {changing.map(({ index }) => index + 1).join(", ")} take {master.name}. Frames a page has overridden keep their own version.</p>
        )}
      </OverlaySection>
      <ModalActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={changing.length === 0}
              onClick={() => {
                handle.edit((current) => ({ ...current, pages: current.pages.map((page) => ({ ...page, masterId: master.id })) }), "Apply a master to every page");
                context.toast("Applied", `${master.name} is now on all ${doc.pages.length} pages.`);
                close();
              }}
            >
              {changing.length === 0 ? "Already on every page" : `Apply to ${changing.length} page${changing.length === 1 ? "" : "s"}`}
            </Button>
          }
          end={<OverlayCancel />}
        />
      </ModalActions>
    </Stack>
  );
}

function OverrideConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePublication(context);
  const payload = context.overlayPayload as { frameId?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const index = doc.pages.findIndex((page) => page.id === doc.activePageId);
  const page = doc.pages[index];
  const master = doc.masters.find((item) => item.id === page?.masterId);
  const frames = master?.frames ?? [];
  return (
    <Stack gap={3}>
      <FactGrid
        columns={3}
        dense
        items={[
          { label: "Page", value: index + 1, mono: true },
          { label: "Master", value: master?.name ?? "none" },
          { label: "Already overridden", value: page?.overrides.length ?? 0, mono: true },
        ]}
      />
      <OverlaySection title="Master frames" tone="warning" hint="Overriding puts a copy on this page. Later changes to the master no longer reach it.">
        {frames.length === 0 ? <p className="vx-mini">This page has no master frames to override.</p> : (
          <ul className="vx-uselist">
            {frames.map((frame) => {
              const done = page?.overrides.includes(frame.id);
              return (
                <li key={frame.id} className="vx-use" data-focus={payload?.frameId === frame.id || undefined}>
                  <span className="ds-grow"><span className="ds-num">{frame.id}</span> · {frame.kind}</span>
                  <Button
                    size="sm"
                    variant={done ? "ghost" : payload?.frameId === frame.id ? "primary" : "secondary"}
                    disabled={done}
                    onClick={() => {
                      handle.edit((current) => overrideMasterFrame(current, current.activePageId, frame.id, index), "Override a master frame");
                      context.toast("Overridden", `${frame.id} is now on page ${index + 1} and can be edited there.`);
                      close();
                    }}
                  >
                    {done ? "Already overridden" : "Override"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </OverlaySection>
      <ModalActions><OverlayActions end={<OverlayCancel>Close</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function TextStyleOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePublication(context);
  const ui = useStore(layoutUi);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const current = ui.selectedFrameId ? findFrame(doc, ui.selectedFrameId)?.frame : undefined;
  return (
    <Stack gap={3}>
      {!ui.selectedFrameId && <Notice tone="info" title="Select a text frame first">Open the editor and click a text frame; paragraphs that name their own style keep it.</Notice>}
      <OverlaySection title="Paragraph styles" hint="The style becomes the frame's default" flush>
        <ul className="vx-uselist">
          {doc.paragraphStyles.map((style) => (
            <li key={style.id} className="vx-use">
              <span className="ds-grow">{style.name}{current?.styleId === style.id && <> <Pill tone="accent">in use</Pill></>}</span>
              <span className="ds-num vx-mini">{style.size}/{style.leading}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!ui.selectedFrameId || current?.styleId === style.id}
                onClick={() => {
                  handle.edit((c) => ({
                    ...c,
                    pages: c.pages.map((page) => ({ ...page, frames: page.frames.map((frame) => (frame.id === ui.selectedFrameId ? { ...frame, styleId: style.id } : frame)) })),
                  }), "Apply a paragraph style");
                  close();
                }}
              >
                Apply
              </Button>
            </li>
          ))}
        </ul>
      </OverlaySection>
      <ModalActions><OverlayActions end={<OverlayCancel>Close</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function FlowOptions({ context }: { context: ScreenContext }) {
  const { record, handle } = usePublication(context);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <KeyValueList
        items={[
          { label: "Order", value: "Frames fill in thread order; columns fill left to right." },
          { label: "Baseline", value: <>Snaps to <span className="ds-num">{doc.baseline.step}pt</span> from <span className="ds-num">{doc.baseline.start}pt</span></> },
          { label: "Hyphenation", value: "Per paragraph style; a word wider than the column splits when the style allows." },
          { label: "Overset", value: "Reported with the characters that did not fit. Never discarded." },
        ]}
      />
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" onClick={() => context.navigate(`${context.path("/o/:org/layout/publications/:id/typography", context.params.id)}?tab=Flow`)}>Open the flow view</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function severityTone(severity: PreflightIssue["severity"]): "danger" | "warning" | "info" {
  return severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
}

function PreflightDetail({ context }: { context: ScreenContext }) {
  const { record, handle, compositions } = usePublication(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const issues = issuesFor(doc, compositions);
  const issue = issues.find((item) => item.id === payload?.id);
  const goToPage = (pageIndex: number, frameId?: string) => {
    handle.edit((current) => ({ ...current, activePageId: current.pages[pageIndex]?.id ?? current.activePageId }), "Go to the page");
    if (frameId) selectFrame(frameId);
    context.navigate(context.path("/o/:org/layout/publications/:id", context.params.id));
  };
  if (!issue) {
    const errors = issues.filter((item) => item.severity === "error").length;
    return (
      <Stack gap={3}>
        <OverlaySection title="Findings" tone={errors ? "danger" : "success"} hint={errors ? `${errors} block a press export` : "Nothing blocks a press export"} flush>
          {issues.length === 0 ? <p className="vx-mini" style={{ padding: "var(--space-3)" }}>Every frame fits, every image is linked and the fonts are available.</p> : (
            <ul className="vx-uselist">
              {issues.map((item) => (
                <li key={item.id}>
                  <button type="button" className="vx-use" onClick={() => context.openOverlay("Preflight detail", { id: item.id })}>
                    <Pill tone={severityTone(item.severity)}>{item.severity}</Pill>
                    <span className="ds-grow">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OverlaySection>
        <DrawerActions><OverlayActions end={<OverlayCancel>Close</OverlayCancel>} /></DrawerActions>
      </Stack>
    );
  }
  return (
    <Stack gap={3}>
      <OverlaySection title={issue.title} tone={severityTone(issue.severity) === "info" ? "info" : severityTone(issue.severity)}>
        <p className="ds-prose">{issue.detail}</p>
      </OverlaySection>
      <FactGrid
        columns={3}
        dense
        items={[
          { label: "Severity", value: issue.severity },
          { label: "Page", value: issue.pageIndex !== undefined ? issue.pageIndex + 1 : "whole document", mono: issue.pageIndex !== undefined },
          { label: "Frame", value: issue.frameId ?? "none", mono: Boolean(issue.frameId) },
        ]}
      />
      <DrawerActions>
        <OverlayActions
          primary={issue.pageIndex !== undefined
            ? <Button variant="primary" onClick={() => goToPage(issue.pageIndex!, issue.frameId)}>Go to page {issue.pageIndex + 1}</Button>
            : issue.fix === "add-bleed"
              ? <Button variant="primary" onClick={() => { handle.edit((current) => ({ ...current, bleed: mm(3) }), "Set a 3mm bleed"); context.closeOverlay(); }}>Set a 3mm bleed</Button>
              : issue.id.startsWith("overset-")
                ? <Button variant="primary" onClick={() => context.openOverlay("overset warning")}>Resolve the overset</Button>
                : undefined}
          secondary={<Button variant="secondary" onClick={() => context.openOverlay("Preflight detail")}>All findings</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function MissingAsset({ context }: { context: ScreenContext }) {
  const { record, handle } = usePublication(context);
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const missing = doc.pages.flatMap((item, index) => item.frames.filter((frame) => frame.kind === "image" && !frame.src).map((frame) => ({ frame, index })));
  if (missing.length === 0) return <Notice tone="success" title="Every image frame is linked">Nothing is missing from the {doc.pages.length} pages.</Notice>;
  return (
    <Stack gap={3}>
      <OverlaySection title={`${missing.length} image frame${missing.length === 1 ? "" : "s"} with no image`} tone="danger" hint="An empty frame is drawn with its diagonals; it is never filled with a stand-in picture." flush>
        <ul className="vx-uselist">
          {missing.map(({ frame, index }) => (
            <li key={frame.id} className="vx-use">
              <span className="ds-grow">Page <span className="ds-num">{index + 1}</span> · <span className="ds-num">{frame.id}</span></span>
              <Button size="sm" variant="secondary" onClick={() => { handle.edit((current) => ({ ...current, activePageId: current.pages[index].id }), "Go to the page"); selectFrame(frame.id); context.navigate(context.path("/o/:org/layout/publications/:id", context.params.id)); }}>Open</Button>
            </li>
          ))}
        </ul>
      </OverlaySection>
      <ModalActions><OverlayActions end={<OverlayCancel>Close</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

async function withPublication(context: ScreenContext, change: (doc: PublicationDoc) => PublicationDoc, event: string): Promise<void> {
  await editShared<PublicationDoc>(context, parsePublication, change, event);
}

function openPublication(context: ScreenContext): PublicationDoc | undefined {
  return sharedHandle<PublicationDoc>(context.params.id)?.doc ?? undefined;
}

/** The same composition the editor draws, computed outside a component. */
function composeAll(doc: PublicationDoc): Map<string, Composition> {
  const out = new Map<string, Composition>();
  const metrics = canvasMetrics();
  const frames = doc.pages.flatMap((page) => page.frames);
  for (const story of doc.stories) {
    const head = frames.find((frame) => frame.kind === "text" && frame.storyId === story.id && !frames.some((other) => other.next === frame.id));
    if (head) out.set(story.id, composeStory(story, threadFrames(doc.pages, head.id), doc.paragraphStyles, metrics, doc.baseline));
  }
  return out;
}

function findFrame(doc: PublicationDoc, id: string | undefined): { frame: Frame; pageIndex: number } | undefined {
  if (!id) return undefined;
  for (const [pageIndex, page] of doc.pages.entries()) {
    const frame = page.frames.find((item) => item.id === id);
    if (frame) return { frame, pageIndex };
  }
  return undefined;
}

function patchFrame(doc: PublicationDoc, id: string, patch: Partial<Frame>): PublicationDoc {
  return { ...doc, pages: doc.pages.map((page) => ({ ...page, frames: page.frames.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)) })) };
}

/** The live area of a page: inside the margins, mirrored for a left-hand page. */
function liveArea(doc: PublicationDoc, pageIndex: number): Box {
  const left = doc.facingPages && pageIndex % 2 === 1 ? doc.margins.outside : doc.margins.inside;
  const right = doc.facingPages && pageIndex % 2 === 1 ? doc.margins.inside : doc.margins.outside;
  return { x: left, y: doc.margins.top, w: doc.size.width - left - right, h: doc.size.height - doc.margins.top - doc.margins.bottom };
}

/** Why a link from one frame to another would break the thread, if it would. */
function linkProblem(doc: PublicationDoc, fromId: string, toId: string): string | undefined {
  const from = findFrame(doc, fromId)?.frame;
  const to = findFrame(doc, toId)?.frame;
  if (!from || !to) return "Choose two text frames.";
  if (from.kind !== "text" || to.kind !== "text") return "Only text frames can be threaded.";
  if (from.id === to.id) return "A frame cannot flow into itself.";
  if (from.next) return "The first frame already flows into another; unlink it first.";
  const frames = doc.pages.flatMap((page) => page.frames);
  if (frames.some((frame) => frame.next === to.id)) return "The second frame already receives text from another frame.";
  for (let cursor: Frame | undefined = to; cursor; cursor = cursor.next ? frames.find((frame) => frame.id === cursor!.next) : undefined) {
    if (cursor.id === from.id) return "That link would make the thread loop back on itself.";
  }
  const ownStory = to.storyId && to.storyId !== from.storyId ? doc.stories.find((story) => story.id === to.storyId) : undefined;
  if (ownStory?.text.trim()) return `The second frame holds its own story (${ownStory.name}); linking would hide it.`;
  return undefined;
}

function linkFrames(doc: PublicationDoc, fromId: string, toId: string): PublicationDoc {
  const from = findFrame(doc, fromId)!.frame;
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      frames: page.frames.map((frame) => (frame.id === fromId ? { ...frame, next: toId } : frame.id === toId ? { ...frame, storyId: from.storyId, styleId: frame.styleId ?? from.styleId } : frame)),
    })),
  };
}

const needsPublication = (context: ScreenContext) => (context.params.id ? undefined : "Open a publication first");

const EDITOR_ACTIONS: ActionDef[] = [
  {
    id: "Create page", label: "Add a page", placement: "primary",
    guard: needsPublication,
    run: (context) => withPublication(context, (doc) => {
      const id = `pg-${wallMs().toString(36)}`;
      const active = doc.pages.find((page) => page.id === doc.activePageId);
      return { ...doc, pages: [...doc.pages, { id, masterId: active?.masterId ?? doc.masters[0]?.id, frames: [], overrides: [] }], activePageId: id };
    }, "Add a page"),
  },
  {
    id: "place frame", label: "Place a text frame", placement: "toolbar",
    guard: needsPublication,
    run: async (context) => {
      const doc = openPublication(context);
      if (!doc) return;
      const pageIndex = Math.max(0, doc.pages.findIndex((page) => page.id === doc.activePageId));
      const area = liveArea(doc, pageIndex);
      const storyId = `st-${wallMs().toString(36)}`;
      const frame = newTextFrame({ x: area.x, y: area.y, w: area.w, h: Math.min(area.h, mm(60)) }, storyId);
      await withPublication(context, (current) => ({
        ...current,
        stories: [...current.stories, { id: storyId, name: `Story ${current.stories.length + 1}`, text: "" }],
        pages: current.pages.map((page, index) => (index === pageIndex ? { ...page, frames: [...page.frames, frame] } : page)),
      }), "Place a text frame");
      selectFrame(frame.id);
    },
  },
  { id: "text tool", label: "Text frame tool (T)", placement: "overflow", run: () => setLayoutTool("text") },
  {
    id: "flow text", label: "Flow the overset text onward", placement: "toolbar",
    guard: () => (layoutUi.get().selectedFrameId ? undefined : "Select a text frame first"),
    run: async (context) => {
      const doc = openPublication(context);
      const found = doc ? findFrame(doc, layoutUi.get().selectedFrameId) : undefined;
      if (!doc || !found || found.frame.kind !== "text") { context.toast("Select a text frame", "Flowing continues a story from a text frame.", "blocked"); return; }
      const frames = doc.pages.flatMap((page) => page.frames);
      let tail = found.frame;
      let tailPage = found.pageIndex;
      while (tail.next) {
        const next = findFrame(doc, tail.next);
        if (!next) break;
        tail = next.frame;
        tailPage = next.pageIndex;
      }
      const composition = tail.storyId ? composeAll(doc).get(tail.storyId) : undefined;
      if (!composition || composition.oversetChars === 0) { context.toast("Nothing is overset", "Every character of this story already fits its frames.", "info"); return; }
      const pageIndex = tailPage + 1;
      const area = liveArea(doc, pageIndex);
      const frame = newTextFrame(area, tail.storyId!);
      const addPage = pageIndex >= doc.pages.length;
      await withPublication(context, (current) => {
        const pages = addPage ? [...current.pages, { id: `pg-${wallMs().toString(36)}`, masterId: current.pages[tailPage]?.masterId, frames: [], overrides: [] }] : current.pages;
        const withFrame = { ...current, pages: pages.map((page, index) => (index === pageIndex ? { ...page, frames: [...page.frames, { ...frame, styleId: tail.styleId }] } : page)) };
        return patchFrame(withFrame, tail.id, { next: frame.id });
      }, `Flow the text onto page ${pageIndex + 1}`);
      context.toast("Text flowed", `${composition.oversetChars} overset characters continue in a new frame on page ${pageIndex + 1}${addPage ? ", which was added" : ""}.${frames.length ? "" : ""}`);
    },
  },
  { id: "thread tool", label: "Thread tool (link two frames)", placement: "overflow", run: () => setLayoutTool("thread") },
  {
    id: "snap", label: "Snap the frame to the guides", placement: "overflow",
    guard: () => (layoutUi.get().selectedFrameId ? undefined : "Select a frame first"),
    run: async (context) => {
      const doc = openPublication(context);
      const found = doc ? findFrame(doc, layoutUi.get().selectedFrameId) : undefined;
      if (!doc || !found) return;
      if (found.frame.locked) { context.toast("The frame is locked", "Unlock it before moving it.", "blocked"); return; }
      const area = liveArea(doc, found.pageIndex);
      const columnWidth = (area.w - doc.columns.gutter * (doc.columns.count - 1)) / doc.columns.count;
      const xs = [area.x, area.x + area.w, ...Array.from({ length: doc.columns.count }, (_, index) => area.x + index * (columnWidth + doc.columns.gutter)), ...Array.from({ length: doc.columns.count }, (_, index) => area.x + index * (columnWidth + doc.columns.gutter) + columnWidth)];
      const ys = [area.y, area.y + area.h];
      const nearest = (value: number, guides: number[]) => guides.reduce((best, guide) => (Math.abs(guide - value) < Math.abs(best - value) ? guide : best), guides[0]);
      const box = found.frame.box;
      const x = nearest(box.x, xs);
      const right = nearest(box.x + box.w, xs.filter((guide) => guide > x));
      const y = nearest(box.y, ys);
      const next = { x, y, w: Math.max(mm(10), (right ?? box.x + box.w) - x), h: Math.min(box.h, area.y + area.h - y) };
      await withPublication(context, (current) => patchFrame(current, found.frame.id, { box: next }), "Snap the frame to the guides");
    },
  },
  { id: "guides", label: "Show or hide the guides", placement: "overflow", run: () => layoutUi.set((current) => ({ ...current, showGuides: !current.showGuides })) },
  {
    id: "export", label: "Export HTML", placement: "secondary",
    guard: needsPublication,
    run: async (context) => {
      const doc = openPublication(context) ?? await readShared<PublicationDoc>(context, parsePublication);
      if (!doc) return;
      const overset = [...composeAll(doc).values()].reduce((sum, composition) => sum + composition.oversetChars, 0);
      if (overset > 0) { context.openOverlay("overset warning", { exporting: true }); return; }
      await exportHtml(context, doc);
    },
  },
  { id: "press export", label: "Press export and preflight", placement: "overflow", run: (context) => context.navigate(`${context.path("/o/:org/layout/publications/:id/preflight", context.params.id)}?tab=Export`) },
  {
    id: "undo", label: "Undo", placement: "overflow", shortcut: "⌘Z",
    guard: (context) => (canUndoShared(context) ? undefined : "Nothing to undo yet"),
    run: (context) => { undoShared(context); },
  },
];

async function exportHtml(context: ScreenContext, doc: PublicationDoc): Promise<void> {
  const { db } = await import("@/runtime/db");
  const record = context.params.id ? await db.records.get(context.params.id) : undefined;
  const name = `${slug(record?.title ?? "publication")}.html`;
  downloadText(name, publicationToHtml(doc, record?.title ?? "Publication"), "text/html");
  if (context.params.id) await context.mutate.log(`Exported ${name}`, { entityId: context.params.id, type: "export" });
  context.toast("HTML written", `${name} downloaded from this browser, with the thread order as the reading order.`);
}

/** Apply every fix preflight knows how to make; report what is left for a person. */
async function fixPreflight(context: ScreenContext): Promise<void> {
  const doc = openPublication(context) ?? await readShared<PublicationDoc>(context, parsePublication);
  if (!doc) return;
  const issues = issuesFor(doc, composeAll(doc));
  const fixable = issues.filter((issue) => issue.fix === "add-bleed" || issue.fix === "add-page");
  if (fixable.length === 0) {
    context.toast(issues.length ? "Nothing here can be fixed automatically" : "Preflight is clean", issues.length ? `${issues.length} findings need a person: each one says what to change.` : "There is nothing to fix.", "info");
    return;
  }
  const done: string[] = [];
  await withPublication(context, (current) => {
    let next = current;
    if (fixable.some((issue) => issue.fix === "add-bleed")) { next = { ...next, bleed: mm(3) }; done.push("set a 3mm bleed"); }
    if (fixable.some((issue) => issue.fix === "add-page")) {
      const id = `pg-${wallMs().toString(36)}`;
      next = { ...next, pages: [...next.pages, { id, masterId: next.pages.at(-1)?.masterId, frames: [], overrides: [] }] };
      done.push("added a page for the overset text to flow onto");
    }
    return next;
  }, "Apply the preflight fixes");
  const left = issues.length - fixable.length;
  context.toast("Fixes applied", `${done.join(" and ")}.${left ? ` ${left} findings still need a person.` : ""} Overset text still needs a frame on the new page; use Flow the text in the editor.`);
}

function openProof(context: ScreenContext, doc: PublicationDoc, title: string, label: string): void {
  const frame = window.open("", "_blank");
  if (!frame) { context.toast("The browser blocked the print window", "Allow pop-ups for this page, or use the HTML export instead.", "blocked"); return; }
  frame.document.write(proofToHtml(doc, title));
  frame.document.close();
  frame.focus();
  context.toast(label, "Use the browser's print dialogue and choose Save as PDF. This page did not write the file itself, and no print service is connected.");
}

/* --------------------------- action overlays --------------------------- */

function MasterPreview({ context }: { context: ScreenContext }) {
  const { record, handle, compositions } = usePublication(context);
  const [masterId, setMasterId] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const master = doc.masters.find((item) => item.id === (masterId || doc.masters[0]?.id));
  if (!master) return <Empty title="No masters yet" />;
  const usage = masterUsage(doc, master.id);
  return (
    <Stack gap={3}>
      <Field label="Master">
        <Select value={master.id} onChange={(event) => setMasterId(event.target.value)}>
          {doc.masters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Notice tone={usage.length ? "warning" : "info"} title={`A change to ${master.name} reaches ${usage.length} page${usage.length === 1 ? "" : "s"}`}>
        {usage.filter((item) => item.overridden > 0).length} of them have overridden frames, which keep their local version.
      </Notice>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, background: "var(--bg-sunken)", padding: 12, borderRadius: 8 }}>
        {usage.map((item) => (
          <div key={item.page.id}>
            <PageView doc={doc} page={item.page} index={item.index} compositions={compositions} zoom={0.18} showGuides={false} />
            <p className="vx-mini">Page {item.index + 1}{item.overridden ? ` · ${item.overridden} overridden` : ""}</p>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function LinkFramesForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePublication(context);
  const [from, setFrom] = useState(layoutUi.get().selectedFrameId ?? "");
  const [to, setTo] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const texts = doc.pages.flatMap((page, index) => page.frames.filter((frame) => frame.kind === "text").map((frame) => ({ frame, index })));
  const story = (frame: Frame) => doc.stories.find((item) => item.id === frame.storyId)?.name ?? "no story";
  const problem = from && to ? linkProblem(doc, from, to) : undefined;
  return (
    <form
      id="layout-link-frames"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!from || !to || problem) return;
        handle.edit((current) => linkFrames(current, from, to), "Link two text frames");
        void context.mutate.log("Linked two text frames into one thread", { entityId: record.id, type: "update" });
        close();
      }}
    >
      <Field label="Flow from" required>
        <Select value={from} onChange={(event) => setFrom(event.target.value)} required>
          <option value="">Choose a frame</option>
          {texts.map(({ frame, index }) => <option key={frame.id} value={frame.id}>Page {index + 1} · {story(frame)}{frame.next ? " (already flows on)" : ""}</option>)}
        </Select>
      </Field>
      <Field label="Into" required>
        <Select value={to} onChange={(event) => setTo(event.target.value)} required>
          <option value="">Choose a frame</option>
          {texts.filter(({ frame }) => frame.id !== from).map(({ frame, index }) => <option key={frame.id} value={frame.id}>Page {index + 1} · {story(frame)}</option>)}
        </Select>
      </Field>
      {problem && <Notice tone="danger" title="Cannot link these">{problem}</Notice>}
      <Notice tone="info" title="The order stays deterministic">Text runs frame to frame in thread order, whatever the page order, and a link that would loop or hide another story is refused.</Notice>
    </form>
  );
}

function StyleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = usePublication(context);
  const payload = context.overlayPayload as { focus?: "tracking" } | undefined;
  const [styleId, setStyleId] = useState("");
  const [draft, setDraft] = useState<Partial<ParagraphStyle>>({});
  if (!record || !handle.doc) return <Empty title="Open a publication first" />;
  const doc = handle.doc;
  const selected = findFrame(doc, layoutUi.get().selectedFrameId)?.frame;
  const style = doc.paragraphStyles.find((item) => item.id === (styleId || selected?.styleId || doc.paragraphStyles[0]?.id));
  if (!style) return <Empty title="No paragraph styles" />;
  const value = { ...style, ...draft };
  const number = (key: "size" | "leading" | "tracking" | "spaceBefore" | "spaceAfter", label: string, step = 0.5) => (
    <Field label={label}>
      <TextInput type="number" step={step} value={value[key]} autoFocus={payload?.focus === key} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} />
    </Field>
  );
  const uses = doc.pages.flatMap((page) => page.frames).filter((frame) => frame.styleId === style.id).length;
  const invalid = value.size <= 0 || value.leading < value.size * 0.8;
  return (
    <form
      id="layout-style-editor"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        handle.edit((current) => ({ ...current, paragraphStyles: current.paragraphStyles.map((item) => (item.id === style.id ? { ...item, ...draft } : item)) }), `Edit the style ${style.name}`);
        void context.mutate.log(`Edited the paragraph style ${style.name}`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      <Field label="Style">
        <Select value={style.id} onChange={(event) => { setStyleId(event.target.value); setDraft({}); }}>
          {doc.paragraphStyles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Row gap={2} wrap>
        {number("size", "Size (pt)")}
        {number("leading", "Leading (pt)")}
        {number("tracking", "Tracking (pt)", 0.05)}
        {number("spaceBefore", "Space before (pt)")}
        {number("spaceAfter", "Space after (pt)")}
      </Row>
      {invalid && <Notice tone="danger" title="Leading is too tight">Leading below 80% of the size makes lines collide.</Notice>}
      <Notice tone="info" title={`${uses} frame${uses === 1 ? "" : "s"} use ${style.name} as their default`}>Saving recomposes every story that uses it; the composer reports any overset the change causes.</Notice>
    </form>
  );
}

registerApp({
  code: "LAYOUT",
  short: "Layout",
  name: "Editorial Layout & Publishing",
  purpose: "Multi-page documents with real text flow, masters and a baseline grid.",
  icon: LayoutTemplate,
  nav: [
    { label: "Library", items: [{ label: "Publications", screenId: "ARL-LAYOUT-001", icon: FileText }] },
    {
      label: "The open publication",
      items: [
        { label: "Editor", screenId: "ARL-LAYOUT-002", icon: LayoutTemplate },
        { label: "Master pages", screenId: "ARL-LAYOUT-003", icon: Rows3 },
        { label: "Typography and flow", screenId: "ARL-LAYOUT-004", icon: TypeIcon },
        { label: "Print and preflight", screenId: "ARL-LAYOUT-005", icon: Printer },
      ],
    },
  ],
  screens: {
    "ARL-LAYOUT-001": {
      id: "ARL-LAYOUT-001",
      tabs: (["Recent", "Company", "Templates", "Archive"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PublicationLibrary context={context} lens={lens} />,
      })),
      actions: [
        { id: "New publication", label: "New publication", placement: "primary", run: (context) => context.openOverlay("Page preset") },
        { id: "import", label: "Import copy", placement: "secondary", run: (context) => context.openOverlay("import review") },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a publication first"),
          run: async (context) => {
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(context.selectedId!);
            if (!record) return;
            const made = await context.mutate.create({
              collection: "publications", title: `${record.title} copy`, status: "draft",
              summary: record.summary, body: parsePublication(record.body), fields: { ...record.fields, kind: "publication" },
            }, `Duplicated ${record.title}`);
            context.toast("Duplicated", `${made.title} has its own record and history.`);
          },
        },
        {
          id: "open", label: "Open", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a publication first"),
          run: (context) => context.navigate(context.path("/o/:org/layout/publications/:id", context.selectedId)),
        },
      ],
      overlays: [
        { id: "Page preset", kind: "modal", title: "New publication", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <PagePreset context={context} close={close} />, footer: ({ close }) => (<><Button variant="ghost" onClick={close}>Cancel</Button><span className="ds-grow" /><Button variant="primary" type="submit" form="layout-page-preset">Create</Button></>) },
        { id: "import review", kind: "modal", title: "Import copy", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ImportReview context={context} close={close} /> },
        { id: "share", kind: "drawer", title: "Share", width: OVERLAY_WIDTH.compact, summary: recordSummary, render: ({ ...context }) => <SharePanel context={context} /> },
      ],
    },

    "ARL-LAYOUT-002": {
      id: "ARL-LAYOUT-002",
      chrome: "full",
      surface: (context) => <PublicationEditor context={context} actions={EDITOR_ACTIONS} />,
      tabs: (["Pages", "Layout", "Type", "Review"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PublicationEditor context={context} actions={EDITOR_ACTIONS} />,
      })),
      actions: EDITOR_ACTIONS,
      overlays: [
        { id: "Frame editor", kind: "drawer", title: "Frame", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <FrameEditorOverlay context={context} /> },
        { id: "page settings", kind: "modal", title: "Page settings", width: OVERLAY_WIDTH.form, summary: recordSummary, render: ({ ...context }) => <PageSettings context={context} /> },
        { id: "overset warning", kind: "modal", title: "Overset text", tone: "danger", width: OVERLAY_WIDTH.modal, summary: oversetSummary, render: ({ ...context }) => <OversetWarning context={context} /> },
      ],
    },

    "ARL-LAYOUT-003": {
      id: "ARL-LAYOUT-003",
      tabs: (["Masters", "Variables", "Usage"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <MastersScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Create master", label: "Create a master", placement: "primary",
          run: (context) => withPublication(context, (doc) => ({
            ...doc,
            masters: [...doc.masters, { id: `mp-${wallMs().toString(36)}`, name: `Master ${doc.masters.length + 1}`, side: "both", frames: [] }],
          }), "Create a master"),
        },
        { id: "apply", label: "Apply to pages", placement: "secondary", run: (context) => context.openOverlay("Master editor") },
        { id: "override", label: "Override a frame", placement: "secondary", run: (context) => context.openOverlay("override confirmation") },
        { id: "preview", label: "Preview the impact", placement: "overflow", guard: needsPublication, run: (context) => context.openOverlay("master preview") },
      ],
      overlays: [
        { id: "Master editor", kind: "modal", title: "Apply a master", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <MasterEditorOverlay context={context} close={close} /> },
        { id: "override confirmation", kind: "modal", title: "Override a master frame", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <OverrideConfirmation context={context} close={close} /> },
        { id: "master preview", kind: "modal", title: "What a master change reaches", width: 760, render: ({ ...context }) => <MasterPreview context={context} /> },
      ],
    },

    "ARL-LAYOUT-004": {
      id: "ARL-LAYOUT-004",
      tabs: (["Paragraph", "Character", "Flow", "Accessibility"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <TypographyScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Edit styles", label: "Edit a paragraph style…", placement: "primary",
          guard: needsPublication,
          run: (context) => context.openOverlay("style editor"),
        },
        {
          id: "new style", label: "New paragraph style", placement: "overflow",
          guard: needsPublication,
          run: (context) => withPublication(context, (doc) => ({
            ...doc,
            paragraphStyles: [...doc.paragraphStyles, { ...BASE_STYLES[0], id: `ps-${wallMs().toString(36)}`, name: `Style ${doc.paragraphStyles.length + 1}` }],
          }), "Create a paragraph style"),
        },
        { id: "link frames", label: "Link frames…", placement: "secondary", guard: needsPublication, run: (context) => context.openOverlay("link frames") },
        { id: "adjust tracking", label: "Adjust the tracking…", placement: "overflow", guard: needsPublication, run: (context) => context.openOverlay("style editor", { focus: "tracking" }) },
        { id: "inspect overset", label: "Inspect overset text", placement: "secondary", run: (context) => context.openOverlay("preflight issue") },
      ],
      overlays: [
        { id: "Text style", kind: "modal", title: "Apply a paragraph style", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TextStyleOverlay context={context} close={close} /> },
        { id: "flow options", kind: "drawer", title: "How the flow works", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <FlowOptions context={context} /> },
        { id: "preflight issue", kind: "modal", title: "Overset text", width: OVERLAY_WIDTH.modal, summary: oversetSummary, render: ({ ...context }) => <OversetWarning context={context} /> },
        { id: "style editor", kind: "modal", title: "Edit a paragraph style", width: 560, render: ({ close, ...context }) => <StyleEditor context={context} close={close} />, footer: layoutFooter("layout-style-editor", "Save the style") },
        { id: "link frames", kind: "modal", title: "Link text frames", width: 520, render: ({ close, ...context }) => <LinkFramesForm context={context} close={close} />, footer: layoutFooter("layout-link-frames", "Link") },
      ],
    },

    "ARL-LAYOUT-005": {
      id: "ARL-LAYOUT-005",
      tabs: (["Preflight", "Proof", "Export", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PreflightScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Inspect issue", label: "Inspect the findings", placement: "secondary", run: (context) => context.openOverlay("Preflight detail") },
        { id: "fix", label: "Fix what can be fixed", placement: "secondary", guard: needsPublication, run: (context) => fixPreflight(context) },
        {
          id: "proof", label: "Open a proof", placement: "primary",
          guard: needsPublication,
          run: async (context) => {
            const doc = openPublication(context) ?? await readShared<PublicationDoc>(context, parsePublication);
            const { db } = await import("@/runtime/db");
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!doc || !record) return;
            context.setTab("Proof");
            openProof(context, doc, record.title, "Proof opened for checking");
          },
        },
        {
          id: "export press PDF", label: "Export a press PDF", placement: "overflow",
          guard: needsPublication,
          run: async (context) => {
            const doc = openPublication(context) ?? await readShared<PublicationDoc>(context, parsePublication);
            const { db } = await import("@/runtime/db");
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!doc || !record) return;
            const issues = issuesFor(doc, composeAll(doc));
            if (preflightBlocks(issues)) {
              context.openOverlay("Preflight detail");
              context.toast("Blocked by preflight", `${issues.filter((issue) => issue.severity === "error").length} errors must be cleared before a press export. Nothing was written.`, "blocked");
              return;
            }
            await context.mutate.log("Press proof handed to the browser's print dialogue", { entityId: record.id, type: "export" });
            openProof(context, doc, record.title, "Press proof opened");
          },
        },
      ],
      overlays: [
        { id: "Preflight detail", kind: "drawer", title: "Preflight", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <PreflightDetail context={context} /> },
        { id: "export setup", kind: "modal", title: "Export", width: 560, render: ({ ...context }) => <PreflightScreen context={context} lens="Export" /> },
        { id: "missing asset", kind: "modal", title: "Missing images", tone: "danger", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <MissingAsset context={context} /> },
      ],
    },
  },
});

function layoutFooter(form: string, label: string) {
  return ({ close }: { close: () => void }) => (
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <span className="ds-grow" />
      <Button variant="primary" type="submit" form={form}>{label}</Button>
    </>
  );
}
