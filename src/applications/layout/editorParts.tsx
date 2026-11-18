import { useEffect } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowUp, BringToFront, Copy,
  Lock, LockOpen, SendToBack, Trash2,
} from "lucide-react";
import { Button, Checkbox, Field, Notice, Row, Select, Stack, TextArea, Tool, Toolbar } from "@/design-system";
import { NumberBox, PanelGroup, downloadText, slug, useStore, type DocHandle } from "@/applications/visual/kit";
import { uid } from "@/applications/visual/geometry";
import { mm, toMm, type Frame, type PublicationDoc } from "./flow";
import {
  alignBox, columnAt, duplicateFrame, fitToColumns, frameLabel, gridColumns, locateFrame,
  nudgeFrame, pageArea, removeFrame, restackFrame, setGrid, updateFrame,
  type Alignment, type StackMove,
} from "./arrange";
import { layoutUi, selectFrame, setLayoutTool } from "./model";

/* ====================================================================== *
 * The publication editor's arranging surfaces: the layers list, the
 * alignment and stacking controls, the page grid and the keyboard.
 * ====================================================================== */

const round1 = (value: number) => Math.round(value * 10) / 10;

/* ------------------------------ layers ------------------------------ */

export function LayersPanel({ handle }: { handle: DocHandle<PublicationDoc> }) {
  const ui = useStore(layoutUi);
  const doc = handle.doc;
  if (!doc) return null;
  const page = doc.pages.find((item) => item.id === doc.activePageId);
  if (!page) return null;
  /* Last in the list draws on top, so show the list top-first. */
  const frames = [...page.frames].reverse();
  return (
    <PanelGroup title={`Frames on this page (${page.frames.length})`}>
      {frames.length === 0 ? (
        <p className="vx-mini">No frames yet. Pick the text, image or shape tool and click on the page.</p>
      ) : (
        <ul className="lx-layers" aria-label="Frames on this page, top first">
          {frames.map((frame) => (
            <li key={frame.id} className="lx-layer" data-selected={frame.id === ui.selectedFrameId}>
              <button type="button" className="lx-layer-name" onClick={() => selectFrame(frame.id)} aria-pressed={frame.id === ui.selectedFrameId}>
                {frameLabel(doc, frame)}
              </button>
              <button
                type="button"
                className="vx-node-btn"
                data-on={frame.locked ? "true" : undefined}
                aria-label={`${frame.locked ? "Unlock" : "Lock"} ${frameLabel(doc, frame)}`}
                title={frame.locked ? "Locked: click to unlock" : "Lock"}
                onClick={() => handle.edit((current) => updateFrame(current, frame.id, { locked: !frame.locked }), frame.locked ? "Unlock the frame" : "Lock the frame")}
              >
                {frame.locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelGroup>
  );
}

/* ------------------------------ arrange ------------------------------ */

const ALIGNMENTS: { id: Alignment; label: string; icon: React.ReactNode }[] = [
  { id: "left", label: "Align left", icon: <AlignStartVertical size={15} /> },
  { id: "hcenter", label: "Align centres horizontally", icon: <AlignCenterVertical size={15} /> },
  { id: "right", label: "Align right", icon: <AlignEndVertical size={15} /> },
  { id: "top", label: "Align top", icon: <AlignStartHorizontal size={15} /> },
  { id: "vcenter", label: "Align centres vertically", icon: <AlignCenterHorizontal size={15} /> },
  { id: "bottom", label: "Align bottom", icon: <AlignEndHorizontal size={15} /> },
];

export type AlignTarget = "margins" | "page";

export function ArrangePanel({ handle, frame, target, onTarget }: {
  handle: DocHandle<PublicationDoc>;
  frame: Frame;
  target: AlignTarget;
  onTarget: (next: AlignTarget) => void;
}) {
  const doc = handle.doc;
  if (!doc) return null;
  const found = locateFrame(doc, frame.id);
  const pageIndex = found?.pageIndex ?? 0;
  const area = target === "page" ? { x: 0, y: 0, w: doc.size.width, h: doc.size.height } : pageArea(doc, pageIndex);
  const columns = gridColumns(doc, pageIndex);
  const from = columnAt(frame.box, columns);
  const locked = Boolean(frame.locked);
  const stack = (move: StackMove, label: string) => handle.edit((current) => restackFrame(current, frame.id, move), label);

  return (
    <PanelGroup title="Arrange">
      <Field label="Align to">
        <Select value={target} onChange={(event) => onTarget(event.target.value as AlignTarget)} aria-label="Align to">
          <option value="margins">The margins (live area)</option>
          <option value="page">The page edge (trim)</option>
        </Select>
      </Field>
      <Toolbar label="Align the frame">
        {ALIGNMENTS.map((item) => (
          <Tool
            key={item.id}
            label={item.label}
            icon={item.icon}
            disabled={locked}
            onClick={() => handle.edit((current) => updateFrame(current, frame.id, { box: alignBox(frame.box, item.id, area) }), item.label)}
          />
        ))}
      </Toolbar>
      <Field label="Span the column grid">
        <Row gap={2}>
          <Select
            aria-label="Start column"
            disabled={locked}
            value={String(from)}
            onChange={(event) => handle.edit((current) => updateFrame(current, frame.id, { box: fitToColumns(frame.box, columns, Number(event.target.value), 1) }), "Fit the frame to a column")}
          >
            {columns.map((_, index) => <option key={index} value={index}>Column {index + 1}</option>)}
          </Select>
          <Select
            aria-label="Columns spanned"
            disabled={locked}
            value=""
            onChange={(event) => { if (event.target.value) handle.edit((current) => updateFrame(current, frame.id, { box: fitToColumns(frame.box, columns, from, Number(event.target.value)) }), "Span the frame across columns"); }}
          >
            <option value="">Span…</option>
            {columns.slice(from).map((_, index) => <option key={index} value={index + 1}>{index + 1} column{index ? "s" : ""}</option>)}
          </Select>
        </Row>
      </Field>
      <Toolbar label="Stacking order">
        <Tool label="Bring to front" icon={<BringToFront size={15} />} onClick={() => stack("front", "Bring the frame to the front")} />
        <Tool label="Bring forward" icon={<ArrowUp size={15} />} onClick={() => stack("forward", "Bring the frame forward")} />
        <Tool label="Send backward" icon={<ArrowDown size={15} />} onClick={() => stack("backward", "Send the frame backward")} />
        <Tool label="Send to back" icon={<SendToBack size={15} />} onClick={() => stack("back", "Send the frame to the back")} />
        <Tool
          label="Duplicate (⌘D)"
          icon={<Copy size={15} />}
          onClick={() => {
            const result = duplicateFrame(handle.doc!, frame.id, uid("fr"));
            if (!result.id) return;
            handle.edit(result.doc, "Duplicate the frame");
            selectFrame(result.id);
          }}
        />
        <Tool
          label={locked ? "Unlock" : "Lock"}
          icon={locked ? <Lock size={15} /> : <LockOpen size={15} />}
          pressed={locked}
          onClick={() => handle.edit((current) => updateFrame(current, frame.id, { locked: !locked }), locked ? "Unlock the frame" : "Lock the frame")}
        />
        <Tool
          label="Delete (⌫)"
          icon={<Trash2 size={15} />}
          onClick={() => { handle.edit((current) => removeFrame(current, frame.id), "Delete the frame"); selectFrame(undefined); }}
        />
      </Toolbar>
      {locked && <p className="vx-mini">Locked frames cannot be moved, resized or aligned. Unlock to change them.</p>}
    </PanelGroup>
  );
}

/* ------------------------------ story ------------------------------ */

/** Edit the copy of the story a text frame belongs to, in place. */
export function FrameStory({ handle, frame }: { handle: DocHandle<PublicationDoc>; frame: Frame }) {
  const doc = handle.doc;
  if (!doc || frame.kind !== "text") return null;
  const story = doc.stories.find((item) => item.id === frame.storyId);
  if (!story) {
    return (
      <Notice tone="warning" title="This frame has no story">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const storyId = uid("st");
            handle.edit((current) => updateFrame({ ...current, stories: [...current.stories, { id: storyId, name: `Story ${current.stories.length + 1}`, text: "" }] }, frame.id, { storyId }), "Give the frame a story");
          }}
        >
          Start a story here
        </Button>
      </Notice>
    );
  }
  const frames = doc.pages.flatMap((page) => page.frames).filter((item) => item.kind === "text" && item.storyId === story.id).length;
  return (
    <PanelGroup title="Copy">
      <TextArea
        rows={7}
        aria-label="Frame copy"
        value={story.text}
        placeholder="Type the copy for this frame. A blank line is not needed: each line is a paragraph."
        onChange={(event) => handle.live((current) => ({ ...current, stories: current.stories.map((item) => (item.id === story.id ? { ...item, text: event.target.value } : item)) }))}
        onBlur={handle.beginGesture}
      />
      <p className="vx-mini">
        {story.name} · <span className="ds-num">{story.text.split(/\s+/).filter(Boolean).length}</span> words
        {frames > 1 ? <> · flows through <span className="ds-num">{frames}</span> frames</> : null}
      </p>
      <Field label="First paragraph style">
        <Select
          value={story.styleByParagraph?.[0] ?? frame.styleId ?? doc.paragraphStyles[0]?.id}
          onChange={(event) => handle.edit((current) => ({
            ...current,
            stories: current.stories.map((item) => (item.id === story.id ? { ...item, styleByParagraph: { ...item.styleByParagraph, 0: event.target.value } } : item)),
          }), "Style the first paragraph")}
        >
          {doc.paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
        </Select>
      </Field>
      <Field label="Body style">
        <Select
          value={frame.styleId ?? doc.paragraphStyles[0]?.id}
          onChange={(event) => handle.edit((current) => updateFrame(current, frame.id, { styleId: event.target.value }), "Set the body style")}
        >
          {doc.paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
        </Select>
      </Field>
    </PanelGroup>
  );
}

/* ------------------------------ grid ------------------------------ */

export function GridPanel({ handle }: { handle: DocHandle<PublicationDoc> }) {
  const doc = handle.doc;
  if (!doc) return null;
  const margin = (key: keyof PublicationDoc["margins"], label: string) => (
    <NumberBox
      label={label}
      suffix="mm"
      step={0.5}
      min={0}
      value={round1(toMm(doc.margins[key]))}
      onChange={(next) => handle.edit((current) => setGrid(current, { margins: { [key]: mm(next) } }), `Set the ${label.toLowerCase()} margin`)}
    />
  );
  const columns = gridColumns(doc, Math.max(0, doc.pages.findIndex((page) => page.id === doc.activePageId)));
  return (
    <Stack gap={3}>
      <PanelGroup title="Margins">
        <div className="vx-fieldrow">
          {margin("top", "Top")}
          {margin("bottom", "Bottom")}
          {margin("inside", doc.facingPages ? "Inside" : "Left")}
          {margin("outside", doc.facingPages ? "Outside" : "Right")}
        </div>
        <Checkbox
          label="Facing pages (mirror inside and outside)"
          checked={doc.facingPages}
          onChange={(event) => handle.edit((current) => ({ ...current, facingPages: event.target.checked }), event.target.checked ? "Use facing pages" : "Use single pages")}
        />
      </PanelGroup>
      <PanelGroup title="Column grid">
        <div className="vx-fieldrow">
          <NumberBox label="Columns" min={1} max={12} value={doc.columns.count} onChange={(next) => handle.edit((current) => setGrid(current, { columns: { count: next } }), "Set the column count")} />
          <NumberBox label="Gutter" suffix="mm" step={0.5} min={0} value={round1(toMm(doc.columns.gutter))} onChange={(next) => handle.edit((current) => setGrid(current, { columns: { gutter: mm(next) } }), "Set the gutter")} />
        </div>
        <Checkbox
          label="Show the columns"
          checked={doc.columns.visible}
          onChange={(event) => handle.edit((current) => ({ ...current, columns: { ...current.columns, visible: event.target.checked } }), "Show or hide the columns")}
        />
        <p className="vx-mini">
          Each column is <span className="ds-num">{round1(toMm(columns[0]?.w ?? 0))}mm</span> wide. Frames snap to these edges while you drag them.
        </p>
      </PanelGroup>
      <PanelGroup title="Baseline grid">
        <NumberBox label="Increment" suffix="pt" step={0.5} min={4} value={doc.baseline.step} onChange={(next) => handle.edit((current) => setGrid(current, { baselineStep: next }), "Set the baseline increment")} />
        <p className="vx-mini">Starts at the top margin. Styles set to align to the baseline land on these lines.</p>
      </PanelGroup>
    </Stack>
  );
}

/* ------------------------------ keyboard ------------------------------ */

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Keyboard editing while the publication editor is open: arrows nudge the
 * selected frame (one point, ten with Shift), Delete removes it, ⌘D
 * duplicates, ⌘Z and ⇧⌘Z undo and redo, Escape clears the selection, and
 * V, T, F and R pick the select, text, image and shape tools.
 */
export function useLayoutKeys(handle: DocHandle<PublicationDoc>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      const doc = handle.doc;
      if (!doc) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") { event.preventDefault(); if (event.shiftKey) handle.redo(); else handle.undo(); return; }
      if (meta && key === "y") { event.preventDefault(); handle.redo(); return; }
      const selected = layoutUi.get().selectedFrameId;
      const found = locateFrame(doc, selected);
      if (meta && key === "d" && found) {
        event.preventDefault();
        const result = duplicateFrame(doc, found.frame.id, uid("fr"));
        if (result.id) { handle.edit(result.doc, "Duplicate the frame"); selectFrame(result.id); }
        return;
      }
      if (meta || event.altKey) return;
      if (event.key.startsWith("Arrow") && found) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (found.frame.locked) return;
        handle.edit((current) => nudgeFrame(current, found.frame.id, dx, dy), "Nudge the frame");
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && found) {
        event.preventDefault();
        handle.edit((current) => removeFrame(current, found.frame.id), "Delete the frame");
        selectFrame(undefined);
        return;
      }
      if (event.key === "Escape") { selectFrame(undefined); setLayoutTool("select"); return; }
      const tools: Record<string, "select" | "text" | "image" | "shape"> = { v: "select", t: "text", f: "image", r: "shape" };
      if (tools[key]) setLayoutTool(tools[key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handle]);
}

/* ------------------------------ export ------------------------------ */

/**
 * Write the pages on the canvas as one SVG file each, straight from what is
 * drawn: the same markup the editor shows, with guides and selection left
 * out. Placed images are already data URLs, so the file is self-contained.
 */
export function exportPageSvg(host: HTMLElement | null, title: string, pageNumbers: number[]): number {
  if (!host) return 0;
  const svgs = [...host.querySelectorAll<SVGSVGElement>("svg[data-page-svg]")];
  svgs.forEach((svg, index) => {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.querySelectorAll("[data-editor-only]").forEach((node) => node.remove());
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    copy.removeAttribute("style");
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
    downloadText(`${slug(title)}-page-${pageNumbers[index] ?? index + 1}.svg`, text, "image/svg+xml");
  });
  return svgs.length;
}
