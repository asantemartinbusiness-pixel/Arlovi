import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { dragPointer, useStore } from "@/applications/visual/kit";
import {
  canvasMetrics, composeStory, fitImage, masterFrames, threadFrames, toMm,
  type Composition, type Frame, type Page, type PublicationDoc,
} from "./flow";
import { layoutUi, selectFrame, selectedFrameIds } from "./model";
import { HANDLES, handlePoint, locateFrame, resizeBox, snapLines, snapMove, type Handle } from "./arrange";
import { boundsOf, framesById, moveFrames, resizeRotated, rotationFromPointer, visualBox } from "./multi";

/* ====================================================================== *
 * Page rendering. One component draws a page for the editor, the preview,
 * the master editor and the print proof, so what is proofed is what is on
 * the canvas.
 * ====================================================================== */

export function useCompositions(doc: PublicationDoc | null): Map<string, Composition> {
  return useMemo(() => {
    const out = new Map<string, Composition>();
    if (!doc) return out;
    const metrics = canvasMetrics();
    for (const story of doc.stories) {
      const head = doc.pages
        .flatMap((page) => page.frames)
        .find((frame) => frame.kind === "text" && frame.storyId === story.id
          && !doc.pages.flatMap((page) => page.frames).some((other) => other.next === frame.id));
      if (!head) continue;
      out.set(story.id, composeStory(story, threadFrames(doc.pages, head.id), doc.paragraphStyles, metrics, doc.baseline));
    }
    return out;
  }, [doc]);
}

export interface PageViewProps {
  doc: PublicationDoc;
  page: Page;
  index: number;
  compositions: Map<string, Composition>;
  zoom: number;
  interactive?: boolean;
  onFrameDown?: (frame: Frame, event: ReactPointerEvent) => void;
  /** A selection handle was pressed: resize the frame from it. */
  onHandleDown?: (frame: Frame, handle: Handle, event: ReactPointerEvent) => void;
  /** The rotate handle above the selected frame was pressed. */
  onRotateDown?: (frame: Frame, event: ReactPointerEvent) => void;
  showGuides?: boolean;
  showBleed?: boolean;
  showBaseline?: boolean;
  /** Draw crop marks and the bleed area, for the print proof. */
  proof?: boolean;
}

export function PageView({
  doc, page, index, compositions, zoom, interactive, onFrameDown, onHandleDown, onRotateDown,
  showGuides = true, showBleed = true, showBaseline = false, proof = false,
}: PageViewProps) {
  const ui = useStore(layoutUi);
  const bleed = proof ? doc.bleed : showBleed ? doc.bleed : 0;
  const mark = proof ? doc.slug : 0;
  const outer = {
    x: -(bleed + mark),
    y: -(bleed + mark),
    w: doc.size.width + (bleed + mark) * 2,
    h: doc.size.height + (bleed + mark) * 2,
  };
  const isLeft = doc.facingPages && index % 2 === 1;
  const inside = isLeft ? doc.margins.outside : doc.margins.inside;
  const outside = isLeft ? doc.margins.inside : doc.margins.outside;
  const masters = masterFrames(doc, page, index);
  const frames = [...masters, ...page.frames];

  const lineFor = (frameId: string) => {
    for (const composition of compositions.values()) {
      const found = composition.frames.find((item) => item.frameId === frameId);
      if (found) return found;
    }
    return undefined;
  };

  const columnGuides = () => {
    const count = doc.columns.count;
    const width = (doc.size.width - inside - outside - doc.columns.gutter * (count - 1)) / count;
    return Array.from({ length: count }, (_, column) => ({
      x: inside + column * (width + doc.columns.gutter),
      w: width,
    }));
  };

  return (
    <svg
      width={outer.w * zoom}
      height={outer.h * zoom}
      viewBox={`${outer.x} ${outer.y} ${outer.w} ${outer.h}`}
      role="img"
      data-page-svg={interactive ? page.id : undefined}
      aria-label={`Page ${index + 1} of ${doc.pages.length}, ${Math.round(toMm(doc.size.width))} by ${Math.round(toMm(doc.size.height))} millimetres`}
      style={{ display: "block", background: "var(--bg-sunken)", flex: "none" }}
    >
      {(bleed > 0 || proof) && (
        <rect x={-bleed} y={-bleed} width={doc.size.width + bleed * 2} height={doc.size.height + bleed * 2} fill="#EDE7DD" />
      )}
      <rect x={0} y={0} width={doc.size.width} height={doc.size.height} fill="#FFFFFF" />

      {showGuides && !proof && (
        <g pointerEvents="none" data-editor-only="">
          <rect x={inside} y={doc.margins.top} width={doc.size.width - inside - outside} height={doc.size.height - doc.margins.top - doc.margins.bottom} fill="none" stroke="#C9A227" strokeWidth={0.5} />
          {doc.columns.visible && columnGuides().map((column, columnIndex) => (
            <rect key={columnIndex} x={column.x} y={doc.margins.top} width={column.w} height={doc.size.height - doc.margins.top - doc.margins.bottom} fill="rgba(35,79,232,0.045)" />
          ))}
        </g>
      )}

      {showBaseline && !proof && (
        <g pointerEvents="none" data-editor-only="">
          {Array.from({ length: Math.floor((doc.size.height - doc.baseline.start) / doc.baseline.step) }, (_, step) => (
            <line
              key={step}
              x1={inside}
              x2={doc.size.width - outside}
              y1={doc.baseline.start + step * doc.baseline.step}
              y2={doc.baseline.start + step * doc.baseline.step}
              stroke="rgba(54,197,186,0.55)"
              strokeWidth={0.3}
            />
          ))}
        </g>
      )}

      {frames.map((frame) => turned(frame, (() => {
        const selected = ui.selectedFrameId === frame.id;
        const common = {
          onPointerDown: interactive && onFrameDown ? (event: ReactPointerEvent) => onFrameDown(frame, event) : undefined,
          style: { cursor: interactive ? (frame.locked ? "not-allowed" : "move") : "default" } as React.CSSProperties,
          "data-frame-id": interactive ? frame.id : undefined,
          "data-frame-kind": interactive ? frame.kind : undefined,
        };
        if (frame.kind === "shape") {
          return (
            <rect
              key={frame.id}
              x={frame.box.x} y={frame.box.y}
              width={Math.max(frame.box.w, 0.4)} height={Math.max(frame.box.h, 0.4)}
              rx={frame.radius ?? 0}
              fill={frame.fill ?? "#234FE8"}
              stroke={frame.stroke?.color}
              strokeWidth={frame.stroke?.width}
              {...common}
            />
          );
        }
        if (frame.kind === "image") {
          const placement = fitImage(frame.box, { width: frame.naturalWidth ?? 0, height: frame.naturalHeight ?? 0 }, frame.fit);
          return (
            <g key={frame.id} {...common}>
              <clipPath id={`clip-${frame.id}`}><rect x={frame.box.x} y={frame.box.y} width={frame.box.w} height={frame.box.h} /></clipPath>
              {frame.src
                ? <image href={frame.src} x={placement.x} y={placement.y} width={placement.w} height={placement.h} clipPath={`url(#clip-${frame.id})`} preserveAspectRatio="none" />
                : (
                  <>
                    <rect x={frame.box.x} y={frame.box.y} width={frame.box.w} height={frame.box.h} fill="#F1EDE6" stroke="#C9C2B6" strokeWidth={0.5} />
                    <line x1={frame.box.x} y1={frame.box.y} x2={frame.box.x + frame.box.w} y2={frame.box.y + frame.box.h} stroke="#C9C2B6" strokeWidth={0.5} />
                    <line x1={frame.box.x + frame.box.w} y1={frame.box.y} x2={frame.box.x} y2={frame.box.y + frame.box.h} stroke="#C9C2B6" strokeWidth={0.5} />
                    <text x={frame.box.x + frame.box.w / 2} y={frame.box.y + frame.box.h / 2} textAnchor="middle" fontSize={7} fill="#8A8278">no image linked</text>
                  </>
                )}
            </g>
          );
        }
        if (frame.kind === "folio") {
          const style = doc.paragraphStyles.find((item) => item.id === frame.styleId) ?? doc.paragraphStyles[4] ?? doc.paragraphStyles[0];
          return (
            <text
              key={frame.id}
              x={isLeft ? frame.box.x : frame.box.x + frame.box.w}
              y={frame.box.y}
              textAnchor={isLeft ? "start" : "end"}
              fontFamily={style.family}
              fontSize={style.size}
              fill={style.color}
              {...common}
            >
              {frame.template}
            </text>
          );
        }
        const composed = lineFor(frame.id);
        return (
          <g key={frame.id} {...common}>
            <rect x={frame.box.x} y={frame.box.y} width={frame.box.w} height={frame.box.h} fill="transparent" />
            {composed?.lines.map((line, lineIndex) => {
              const style = doc.paragraphStyles.find((item) => item.id === line.styleId) ?? doc.paragraphStyles[0];
              return (
                <text
                  key={lineIndex}
                  x={line.x}
                  y={line.y}
                  fontFamily={style.family}
                  fontSize={style.size}
                  fontWeight={style.weight}
                  letterSpacing={style.tracking}
                  wordSpacing={line.wordSpacing}
                  fill={style.color}
                >
                  {line.text}
                </text>
              );
            })}
            {interactive && (
              <rect
                data-editor-only=""
                x={frame.box.x} y={frame.box.y}
                width={frame.box.w} height={frame.box.h}
                fill="none"
                stroke={selected ? "#234FE8" : "#B9B2A6"}
                strokeWidth={selected ? 1.2 : 0.4}
                strokeDasharray={selected ? undefined : "3 2"}
              />
            )}
            {interactive && frame.next && (
              <circle data-editor-only="" cx={frame.box.x + frame.box.w} cy={frame.box.y + frame.box.h} r={2.4} fill="#234FE8" />
            )}
          </g>
        );
      })()))}

      {interactive && (() => {
        if (selectedFrameIds(ui).length > 1) return null;
        const selectedFrame = page.frames.find((frame) => frame.id === ui.selectedFrameId);
        if (!selectedFrame) return null;
        const box = selectedFrame.box;
        const size = 7 / zoom;
        const deg = selectedFrame.rotation ?? 0;
        const knob = { x: box.x + box.w / 2, y: box.y - 18 / zoom };
        return (
          <g data-selection={selectedFrame.id} data-editor-only="" transform={deg ? `rotate(${deg} ${box.x + box.w / 2} ${box.y + box.h / 2})` : undefined}>
            <rect x={box.x} y={box.y} width={box.w} height={Math.max(box.h, 0.4)} fill="none" stroke="#234FE8" strokeWidth={1.2 / zoom} pointerEvents="none" />
            {!selectedFrame.locked && onRotateDown && selectedFrame.kind !== "folio" && (
              <>
                <line x1={knob.x} y1={box.y} x2={knob.x} y2={knob.y} stroke="#234FE8" strokeWidth={1 / zoom} pointerEvents="none" />
                <circle
                  data-handle="rotate"
                  cx={knob.x}
                  cy={knob.y}
                  r={4.5 / zoom}
                  fill="#FFFFFF"
                  stroke="#234FE8"
                  strokeWidth={1 / zoom}
                  style={{ cursor: "grab" }}
                  onPointerDown={(event) => { event.stopPropagation(); onRotateDown(selectedFrame, event); }}
                >
                  <title>Rotate (Shift snaps to 15°)</title>
                </circle>
              </>
            )}
            {!selectedFrame.locked && onHandleDown && HANDLES.map((handle) => {
              const point = handlePoint(box, handle);
              return (
                <rect
                  key={handle}
                  data-handle={handle}
                  x={point.x - size / 2}
                  y={point.y - size / 2}
                  width={size}
                  height={size}
                  fill="#FFFFFF"
                  stroke="#234FE8"
                  strokeWidth={1 / zoom}
                  style={{ cursor: HANDLE_CURSOR[handle] }}
                  onPointerDown={(event) => { event.stopPropagation(); onHandleDown(selectedFrame, handle, event); }}
                />
              );
            })}
          </g>
        );
      })()}

      {interactive && (() => {
        const ids = selectedFrameIds(ui);
        if (ids.length < 2) return null;
        const chosen = framesById(doc, ids).map(({ frame }) => frame).filter((frame) => page.frames.some((item) => item.id === frame.id));
        if (chosen.length === 0) return null;
        const union = boundsOf(chosen.map((frame) => visualBox(frame)));
        return (
          <g data-multiselect={chosen.length} data-editor-only="" pointerEvents="none">
            {chosen.map((frame) => (
              <rect
                key={frame.id}
                x={frame.box.x} y={frame.box.y} width={frame.box.w} height={Math.max(frame.box.h, 0.4)}
                transform={frame.rotation ? `rotate(${frame.rotation} ${frame.box.x + frame.box.w / 2} ${frame.box.y + frame.box.h / 2})` : undefined}
                fill="rgba(35,79,232,0.06)" stroke="#234FE8" strokeWidth={1.2 / zoom}
              />
            ))}
            <rect x={union.x} y={union.y} width={union.w} height={union.h} fill="none" stroke="#234FE8" strokeWidth={0.8 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
          </g>
        );
      })()}

      {interactive && ui.snapGuide?.pageId === page.id && (
        <g pointerEvents="none" data-editor-only="" stroke="#E5398A" strokeWidth={0.8 / zoom}>
          {ui.snapGuide.x !== undefined && <line x1={ui.snapGuide.x} x2={ui.snapGuide.x} y1={-bleed} y2={doc.size.height + bleed} />}
          {ui.snapGuide.y !== undefined && <line y1={ui.snapGuide.y} y2={ui.snapGuide.y} x1={-bleed} x2={doc.size.width + bleed} />}
        </g>
      )}

      {proof && (
        <g pointerEvents="none" stroke="#1A1917" strokeWidth={0.4}>
          {[[0, 0], [doc.size.width, 0], [0, doc.size.height], [doc.size.width, doc.size.height]].map(([x, y], cornerIndex) => (
            <g key={cornerIndex}>
              <line x1={x} y1={y - bleed - mark} x2={x} y2={y - bleed - mark / 3} />
              <line x1={x} y1={y + bleed + mark / 3} x2={x} y2={y + bleed + mark} />
              <line x1={x - bleed - mark} y1={y} x2={x - bleed - mark / 3} y2={y} />
              <line x1={x + bleed + mark / 3} y1={y} x2={x + bleed + mark} y2={y} />
            </g>
          ))}
          <text x={0} y={doc.size.height + bleed + mark - 2} fontSize={5} fill="#1A1917" stroke="none">
            {`page ${index + 1} · ${Math.round(toMm(doc.size.width))}×${Math.round(toMm(doc.size.height))}mm · bleed ${Math.round(toMm(doc.bleed) * 10) / 10}mm · RGB`}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Draw a frame turned about its centre when it has a rotation. */
function turned(frame: Frame, element: React.ReactElement): React.ReactElement {
  const deg = frame.rotation ?? 0;
  if (!deg) return element;
  const cx = frame.box.x + frame.box.w / 2;
  const cy = frame.box.y + frame.box.h / 2;
  return <g key={frame.id} transform={`rotate(${deg} ${cx} ${cy})`} data-rotation={deg}>{element}</g>;
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

/** Snap lines for a frame: the page grid plus the other frames on its page. */
function linesFor(doc: PublicationDoc, frame: Frame) {
  const found = locateFrame(doc, frame.id);
  const pageIndex = found?.pageIndex ?? 0;
  const others = (doc.pages[pageIndex]?.frames ?? []).filter((item) => item.id !== frame.id).map((item) => item.box);
  return { pageIndex, pageId: doc.pages[pageIndex]?.id ?? "", lines: snapLines(doc, pageIndex, others) };
}

function clearGuide(): void {
  layoutUi.set((current) => (current.snapGuide ? { ...current, snapGuide: undefined } : current));
}

/**
 * Drag a frame, snapping its edges and centre to the margins, the column
 * guides and the other frames on the page. Holding ⌘ or Ctrl turns snapping
 * off; Shift keeps the move horizontal or vertical.
 */
export function dragFrame(
  event: ReactPointerEvent,
  frame: Frame,
  doc: PublicationDoc,
  zoom: number,
  apply: (box: Frame["box"], committed: boolean) => void,
): void {
  if (frame.locked) { selectFrame(frame.id); return; }
  const start = { ...frame.box };
  const { pageId, lines } = linesFor(doc, frame);
  const tolerance = 6 / zoom;
  selectFrame(frame.id);
  dragPointer(event, {
    move: (point, modifiers, origin) => {
      let dx = (point.x - origin.x) / zoom;
      let dy = (point.y - origin.y) / zoom;
      if (modifiers.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const moved = { ...start, x: start.x + dx, y: start.y + dy };
      if (modifiers.meta) { clearGuide(); apply(moved, false); return; }
      const snapped = snapMove(moved, lines, tolerance);
      layoutUi.set((current) => ({ ...current, snapGuide: { pageId, x: snapped.guideX, y: snapped.guideY } }));
      apply(snapped.box, false);
    },
    end: (moved) => { clearGuide(); if (moved) apply({ ...start }, true); },
  });
}

/** Resize a frame from one of its handles. Shift on a corner keeps the proportions. */
export function resizeFrame(
  event: ReactPointerEvent,
  frame: Frame,
  handle: Handle,
  doc: PublicationDoc,
  zoom: number,
  apply: (box: Frame["box"], committed: boolean) => void,
): void {
  if (frame.locked) return;
  const start = { ...frame.box };
  const { pageId, lines } = linesFor(doc, frame);
  const tolerance = 6 / zoom;
  const deg = frame.rotation ?? 0;
  if (deg) {
    /* A turned frame resizes in its own axes; the page guides do not apply. */
    dragPointer(event, {
      move: (point, modifiers, origin) => apply(resizeRotated(start, deg, handle, (point.x - origin.x) / zoom, (point.y - origin.y) / zoom, {
        keepRatio: modifiers.shift || (frame.kind === "image" && Boolean(frame.src) && !modifiers.alt),
      }), false),
      end: (moved) => { if (moved) apply({ ...start }, true); },
    });
    return;
  }
  dragPointer(event, {
    move: (point, modifiers, origin) => {
      const box = resizeBox(start, handle, (point.x - origin.x) / zoom, (point.y - origin.y) / zoom, {
        keepRatio: modifiers.shift || (frame.kind === "image" && Boolean(frame.src) && !modifiers.alt),
        lines: modifiers.meta ? undefined : lines,
        tolerance,
      });
      const edgeX = handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : undefined;
      const edgeY = handle.startsWith("n") ? box.y : handle.startsWith("s") ? box.y + box.h : undefined;
      layoutUi.set((current) => ({
        ...current,
        snapGuide: {
          pageId,
          x: edgeX !== undefined && lines.xs.includes(edgeX) && !modifiers.meta ? edgeX : undefined,
          y: edgeY !== undefined && lines.ys.includes(edgeY) && !modifiers.meta ? edgeY : undefined,
        },
      }));
      apply(box, false);
    },
    end: (moved) => { clearGuide(); if (moved) apply({ ...start }, true); },
  });
}

/**
 * Turn a frame with the rotate handle: the angle of the pointer around the
 * frame's centre, measured from straight up. Shift snaps to 15°.
 */
export function rotateFrameDrag(
  event: ReactPointerEvent,
  frame: Frame,
  apply: (rotation: number, committed: boolean) => void,
): void {
  if (frame.locked) return;
  const svg = (event.currentTarget as SVGElement).ownerSVGElement;
  const matrix = svg?.getScreenCTM();
  if (!matrix) return;
  const inverse = matrix.inverse();
  dragPointer(event, {
    move: (point, modifiers) => {
      const local = new DOMPoint(point.x, point.y).matrixTransform(inverse);
      apply(rotationFromPointer(frame.box, { x: local.x, y: local.y }, modifiers.shift ? 15 : 0), false);
    },
    end: (moved) => { if (moved) apply(frame.rotation ?? 0, true); },
  });
}

/**
 * Drag a multi-selection together. The selection's outline snaps like a
 * single frame does, to the page grid and the frames that are not selected.
 */
export function dragFrames(
  event: ReactPointerEvent,
  ids: string[],
  doc: PublicationDoc,
  zoom: number,
  apply: (next: PublicationDoc | null) => void,
): void {
  const chosen = framesById(doc, ids);
  if (chosen.length === 0) return;
  const pageIndex = chosen[0].pageIndex;
  const pageId = doc.pages[pageIndex]?.id ?? "";
  const others = (doc.pages[pageIndex]?.frames ?? []).filter((item) => !ids.includes(item.id)).map((item) => visualBox(item));
  const lines = snapLines(doc, pageIndex, others);
  const start = boundsOf(chosen.map(({ frame }) => visualBox(frame)));
  const tolerance = 6 / zoom;
  dragPointer(event, {
    move: (point, modifiers, origin) => {
      let dx = (point.x - origin.x) / zoom;
      let dy = (point.y - origin.y) / zoom;
      if (modifiers.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!modifiers.meta) {
        const snapped = snapMove({ ...start, x: start.x + dx, y: start.y + dy }, lines, tolerance);
        dx = snapped.box.x - start.x;
        dy = snapped.box.y - start.y;
        layoutUi.set((current) => ({ ...current, snapGuide: { pageId, x: snapped.guideX, y: snapped.guideY } }));
      } else clearGuide();
      apply(moveFrames(doc, ids, dx, dy));
    },
    end: (moved) => { clearGuide(); if (moved) apply(null); },
  });
}
