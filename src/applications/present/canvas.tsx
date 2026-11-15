import {
  useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import {
  boundingBox, clampToCanvas, layoutById, resizeBox, SLIDE_H, SLIDE_W, snapBox,
  type Deck, type Guide, type ResizeHandle, type Slide, type SlideObject, type ThemeColourToken,
} from "./model";

/* ====================================================================== *
 * Slide canvas.
 *
 * Every object on the slide is editable: drag to move, eight handles to
 * resize, a handle above the box to rotate, and the keyboard does all three.
 * Alignment guides are computed from the other objects and the canvas, and
 * the moving object snaps to them.
 * ====================================================================== */

export const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_POSITION: Record<ResizeHandle, { x: number; y: number; cursor: string }> = {
  nw: { x: 0, y: 0, cursor: "nwse-resize" },
  n: { x: 0.5, y: 0, cursor: "ns-resize" },
  ne: { x: 1, y: 0, cursor: "nesw-resize" },
  e: { x: 1, y: 0.5, cursor: "ew-resize" },
  se: { x: 1, y: 1, cursor: "nwse-resize" },
  s: { x: 0.5, y: 1, cursor: "ns-resize" },
  sw: { x: 0, y: 1, cursor: "nesw-resize" },
  w: { x: 0, y: 0.5, cursor: "ew-resize" },
};

export interface SlideCanvasProps {
  deck: Deck;
  slide: Slide;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  /** Called continuously while dragging, then once more on release. */
  onTransform: (updates: { id: string; patch: Partial<SlideObject> }[], committed: boolean) => void;
  onEditText?: (id: string) => void;
  onTableCell?: (objectId: string, row: number, col: number, value: string) => void;
  onDelete?: (ids: string[]) => void;
  readOnly?: boolean;
  /** Scale the 960×540 stage down to fit the available width. */
  scale?: number;
  /** Objects whose build animation has already played, for the preview. */
  revealed?: Set<string>;
  showGuides?: boolean;
  children?: ReactNode;
}

export function colour(deck: Deck, token: ThemeColourToken): string {
  return deck.theme.colours[token];
}

function textStyle(object: SlideObject, deck: Deck): CSSProperties {
  const text = object.text!;
  return {
    fontSize: text.size,
    fontWeight: text.weight,
    fontStyle: text.italic ? "italic" : undefined,
    textAlign: text.align === "start" ? "left" : text.align === "end" ? "right" : "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: text.valign === "start" ? "flex-start" : text.valign === "end" ? "flex-end" : "center",
    color: colour(deck, text.colourToken),
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: text.role === "title" || text.role === "eyebrow" ? deck.theme.headingFont : deck.theme.bodyFont,
  };
}

export function ObjectBody({ object, deck, onTableCell, readOnly }: { object: SlideObject; deck: Deck; onTableCell?: (objectId: string, row: number, col: number, value: string) => void; readOnly?: boolean }) {
  if (object.type === "text" && object.text) {
    return <div style={textStyle(object, deck)}>{object.text.text || <span style={{ opacity: 0.4 }}>Empty text box</span>}</div>;
  }
  if (object.type === "shape" && object.shape) {
    const { kind, fillToken, strokeToken, strokeWidth, radius, opacity } = object.shape;
    if (kind === "line" || kind === "arrow") {
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${object.w} ${object.h}`} preserveAspectRatio="none" aria-hidden>
          <line x1={0} y1={object.h / 2} x2={object.w} y2={object.h / 2} stroke={colour(deck, fillToken)} strokeWidth={Math.max(2, strokeWidth)} />
          {kind === "arrow" && <polygon points={`${object.w},${object.h / 2} ${object.w - 14},${object.h / 2 - 7} ${object.w - 14},${object.h / 2 + 7}`} fill={colour(deck, fillToken)} />}
        </svg>
      );
    }
    if (kind === "triangle") {
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points="50,2 98,98 2,98" fill={colour(deck, fillToken)} opacity={opacity} stroke={strokeToken ? colour(deck, strokeToken) : undefined} strokeWidth={strokeWidth} />
        </svg>
      );
    }
    return (
      <div style={{
        width: "100%", height: "100%", opacity,
        background: colour(deck, fillToken),
        borderRadius: kind === "ellipse" ? "50%" : kind === "roundRect" ? radius : 0,
        border: strokeToken ? `${strokeWidth}px solid ${colour(deck, strokeToken)}` : undefined,
        boxSizing: "border-box",
      }} />
    );
  }
  if (object.type === "image" && object.image) {
    return (
      <div
        role="img"
        aria-label={object.image.alt || "Image frame with no alternative text"}
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 4,
          alignItems: "center", justifyContent: "center",
          background: colour(deck, "surface"),
          border: `1px dashed ${colour(deck, "line")}`,
          color: colour(deck, "muted"), fontSize: 13, fontFamily: "ui-monospace, monospace",
          boxSizing: "border-box", overflow: "hidden", padding: 8, textAlign: "center",
        }}
      >
        <span>{object.image.assetId ?? "No asset referenced"}</span>
        {object.image.substituted && <span style={{ fontSize: 11 }}>substituted: {object.image.substituted}</span>}
      </div>
    );
  }
  if (object.type === "table" && object.table) {
    const rows = object.table.rows;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, color: colour(deck, "ink") }}>
        {object.table.header && rows[0] && (
          <thead><tr>{rows[0].map((cell, col) => (
            <th key={col} scope="col" style={{ border: `1px solid ${colour(deck, "line")}`, padding: 0, background: colour(deck, "surface") }}>
              <input
                aria-label={`Column ${col + 1} heading`}
                value={cell}
                readOnly={readOnly}
                onChange={(event) => onTableCell?.(object.id, 0, col, event.target.value)}
                style={{ width: "100%", border: 0, background: "transparent", font: "inherit", fontWeight: 600, color: "inherit", padding: "4px 8px" }}
              />
            </th>
          ))}</tr></thead>
        )}
        <tbody>
          {(object.table.header ? rows.slice(1) : rows).map((row, index) => {
            const actual = object.table!.header ? index + 1 : index;
            return (
              <tr key={actual}>
                {row.map((cell, col) => (
                  <td key={col} style={{ border: `1px solid ${colour(deck, "line")}`, padding: 0 }}>
                    <input
                      aria-label={`Row ${actual + 1} column ${col + 1}`}
                      value={cell}
                      readOnly={readOnly}
                      onChange={(event) => onTableCell?.(object.id, actual, col, event.target.value)}
                      style={{ width: "100%", border: 0, background: "transparent", font: "inherit", color: "inherit", padding: "4px 8px" }}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  if (object.type === "chart" && object.chart) {
    const points = object.chart.series.flatMap((series) => series.points);
    if (points.length === 0) {
      return (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", border: `1px dashed ${colour(deck, "line")}`, color: colour(deck, "muted"), fontSize: 13, boxSizing: "border-box" }}>
          No data linked yet
        </div>
      );
    }
    const max = Math.max(...points.map((point) => point.value), 1);
    return (
      <figure style={{ margin: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
        <figcaption style={{ fontSize: 15, fontWeight: 600, color: colour(deck, "ink") }}>{object.chart.title}</figcaption>
        {object.chart.kind === "line" ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(10, points.length * 40)} 100`} preserveAspectRatio="none" aria-hidden>
            <polyline
              fill="none"
              stroke={colour(deck, "accent")}
              strokeWidth="2"
              points={points.map((point, index) => `${index * 40 + 20},${100 - (point.value / max) * 90}`).join(" ")}
            />
          </svg>
        ) : (
          <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "flex-end" }}>
            {points.map((point, index) => (
              <div key={`${point.label}-${index}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                <div style={{ width: "72%", height: `${Math.max(2, (point.value / max) * 100)}%`, background: colour(deck, "accent"), borderRadius: "3px 3px 0 0" }} />
                <span style={{ fontSize: 10, color: colour(deck, "muted"), textAlign: "center" }}>{point.label}</span>
              </div>
            ))}
          </div>
        )}
        <table style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          <caption>{object.chart.title}</caption>
          <tbody>{points.map((point, index) => <tr key={index}><th scope="row">{point.label}</th><td>{point.value}</td></tr>)}</tbody>
        </table>
      </figure>
    );
  }
  return null;
}

type DragState =
  | { kind: "move"; startX: number; startY: number; origins: Map<string, { x: number; y: number }> }
  | { kind: "resize"; handle: ResizeHandle; startX: number; startY: number; origin: SlideObject }
  | { kind: "rotate"; centreX: number; centreY: number; startAngle: number; origin: number; id: string };

export function SlideCanvas({
  deck, slide, selectedIds, onSelect, onTransform, onEditText, onTableCell, onDelete,
  readOnly, scale = 1, revealed, showGuides = true, children,
}: SlideCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const drag = useRef<DragState | null>(null);
  const layout = layoutById(deck, slide.layoutId);
  const ordered = [...slide.objects].sort((a, b) => a.z - b.z);
  const selected = slide.objects.filter((object) => selectedIds.includes(object.id));
  const selectionBox = boundingBox(selected);

  const toStage = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }, [scale]);

  useEffect(() => {
    if (readOnly) return;
    function onMove(event: PointerEvent) {
      const state = drag.current;
      if (!state) return;
      const point = toStage(event.clientX, event.clientY);
      if (state.kind === "move") {
        const dx = point.x - state.startX;
        const dy = point.y - state.startY;
        const others = slide.objects.filter((object) => !selectedIds.includes(object.id));
        const primary = slide.objects.find((object) => object.id === selectedIds[0]);
        let snapDx = dx;
        let snapDy = dy;
        let nextGuides: Guide[] = [];
        if (primary) {
          const origin = state.origins.get(primary.id)!;
          const snapped = snapBox({ x: origin.x + dx, y: origin.y + dy, w: primary.w, h: primary.h }, others);
          snapDx = snapped.x - origin.x;
          snapDy = snapped.y - origin.y;
          nextGuides = snapped.guides;
        }
        if (showGuides) setGuides(nextGuides);
        onTransform(selectedIds.map((id) => {
          const origin = state.origins.get(id);
          if (!origin) return { id, patch: {} };
          return { id, patch: { x: Math.round(origin.x + snapDx), y: Math.round(origin.y + snapDy), customised: true } };
        }), false);
        return;
      }
      if (state.kind === "resize") {
        const dx = point.x - state.startX;
        const dy = point.y - state.startY;
        const box = resizeBox({ x: state.origin.x, y: state.origin.y, w: state.origin.w, h: state.origin.h }, state.handle, dx, dy, event.shiftKey);
        onTransform([{ id: state.origin.id, patch: { ...box, customised: true } }], false);
        return;
      }
      const angle = Math.atan2(point.y - state.centreY, point.x - state.centreX) * (180 / Math.PI);
      const next = Math.round(state.origin + (angle - state.startAngle));
      onTransform([{ id: state.id, patch: { rotation: event.shiftKey ? Math.round(next / 15) * 15 : next, customised: true } }], false);
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      setGuides([]);
      onTransform([], true);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onTransform, readOnly, selectedIds, slide.objects, toStage, showGuides]);

  function startMove(event: ReactPointerEvent, object: SlideObject) {
    if (readOnly || object.locked) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const ids = additive
      ? (selectedIds.includes(object.id) ? selectedIds.filter((id) => id !== object.id) : [...selectedIds, object.id])
      : (selectedIds.includes(object.id) ? selectedIds : [object.id]);
    if (ids.length === 0) { onSelect([]); return; }
    onSelect(ids);
    const point = toStage(event.clientX, event.clientY);
    const origins = new Map(slide.objects.filter((item) => ids.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    drag.current = { kind: "move", startX: point.x, startY: point.y, origins };
  }

  function startResize(event: ReactPointerEvent, handle: ResizeHandle, object: SlideObject) {
    if (readOnly || object.locked) return;
    event.stopPropagation();
    const point = toStage(event.clientX, event.clientY);
    drag.current = { kind: "resize", handle, startX: point.x, startY: point.y, origin: object };
  }

  function startRotate(event: ReactPointerEvent, object: SlideObject) {
    if (readOnly || object.locked) return;
    event.stopPropagation();
    const point = toStage(event.clientX, event.clientY);
    const centreX = object.x + object.w / 2;
    const centreY = object.y + object.h / 2;
    drag.current = {
      kind: "rotate", centreX, centreY, id: object.id,
      startAngle: Math.atan2(point.y - centreY, point.x - centreX) * (180 / Math.PI),
      origin: object.rotation,
    };
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (readOnly) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") return;
    if (event.key === "Escape") { onSelect([]); return; }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const index = ordered.findIndex((object) => object.id === selectedIds[0]);
      const next = ordered[(index + (event.shiftKey ? -1 : 1) + ordered.length) % Math.max(1, ordered.length)];
      if (next) onSelect([next.id]);
      return;
    }
    if (selected.length === 0) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      onDelete?.(selectedIds);
      return;
    }
    if (event.key === "Enter" && selected.length === 1 && selected[0].type === "text") {
      event.preventDefault();
      event.stopPropagation();
      onEditText?.(selected[0].id);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const nudge: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: -step, dy: 0 }, ArrowRight: { dx: step, dy: 0 },
      ArrowUp: { dx: 0, dy: -step }, ArrowDown: { dx: 0, dy: step },
    };
    if (nudge[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      const { dx, dy } = nudge[event.key];
      if (event.altKey) {
        onTransform(selected.map((object) => ({ id: object.id, patch: clampToCanvas({ ...object, w: object.w + dx, h: object.h + dy }) })), true);
      } else {
        onTransform(selected.map((object) => ({ id: object.id, patch: { x: object.x + dx, y: object.y + dy, customised: true } })), true);
      }
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      event.stopPropagation();
      onTransform(selected.map((object) => ({ id: object.id, patch: { rotation: object.rotation + (event.key === "]" ? 5 : -5), customised: true } })), true);
    }
  }

  return (
    <div className="px-stagewrap">
      <div
        ref={stageRef}
        className="px-stage"
        tabIndex={0}
        role="application"
        aria-label={`Slide canvas: ${slide.title}. Arrow keys move the selection, Alt and arrows resize, square brackets rotate, Tab cycles objects.`}
        style={{
          width: SLIDE_W, height: SLIDE_H,
          transform: `scale(${scale})`,
          background: colour(deck, layout.backgroundToken),
        }}
        onPointerDown={() => { if (!readOnly) onSelect([]); }}
        onKeyDown={onKeyDown}
      >
        {(layout.decoration ?? []).map((item, index) => (
          <div
            key={index}
            aria-hidden
            style={{
              position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h,
              background: colour(deck, item.fillToken), opacity: item.opacity,
              borderRadius: item.kind === "ellipse" ? "50%" : 2,
            }}
          />
        ))}

        {ordered.map((object) => {
          const isSelected = selectedIds.includes(object.id);
          const animation = object.animation;
          const hidden = revealed !== undefined && animation && animation.effect !== "none" && !revealed.has(object.id);
          return (
            <div
              key={object.id}
              className={`px-object${isSelected ? " px-selected" : ""}${object.locked ? " px-locked" : ""}`}
              style={{
                left: object.x, top: object.y, width: object.w, height: object.h,
                transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
                zIndex: object.z,
                opacity: hidden ? 0 : 1,
                pointerEvents: hidden ? "none" : undefined,
              }}
              onPointerDown={(event) => startMove(event, object)}
              onDoubleClick={() => { if (object.type === "text") onEditText?.(object.id); }}
            >
              <ObjectBody object={object} deck={deck} onTableCell={onTableCell} readOnly={readOnly} />
              {isSelected && !readOnly && !object.locked && (
                <>
                  <button
                    type="button"
                    className="px-rotate"
                    aria-label={`Rotate ${object.name}`}
                    onPointerDown={(event) => startRotate(event, object)}
                  />
                  {HANDLES.map((handle) => {
                    const position = HANDLE_POSITION[handle];
                    return (
                      <button
                        key={handle}
                        type="button"
                        className="px-handle"
                        aria-label={`Resize ${object.name} from the ${handle} corner`}
                        style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, cursor: position.cursor }}
                        onPointerDown={(event) => startResize(event, handle, object)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          );
        })}

        {selectionBox && selected.length > 1 && (
          <div className="px-groupbox" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} aria-hidden />
        )}

        {guides.map((guide, index) => (
          <div
            key={`${guide.axis}-${guide.at}-${index}`}
            className={`px-guide px-guide-${guide.axis} px-guide-${guide.kind}`}
            style={guide.axis === "x" ? { left: guide.at } : { top: guide.at }}
            aria-hidden
          />
        ))}

        {children}
      </div>
    </div>
  );
}
