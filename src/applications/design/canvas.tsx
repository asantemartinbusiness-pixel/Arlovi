import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pill } from "@/design-system";
import {
  HANDLES, HANDLE_LABEL, angleBetween, fitRect, handleWorldPoint, matToString,
  rectFromPoints, resizeRect, rectCenter, rotateTo, rotatedCorners, screenToWorld,
  snapRect, viewMatrix, type Handle, type Pt, type Rect, type SnapGuide,
} from "@/applications/visual/geometry";
import { dragPointer, useMeasure, useStore, type DocHandle } from "@/applications/visual/kit";
import type { ScreenContext } from "@/platform/registry";
import {
  absoluteOffset, absoluteRect, activePage, addNode, applyAutoLayout, childrenOf, flatten,
  groupNodes, isEditable, makeNode, marqueeHits, pageBounds, parentOf, patchNode,
  patchNodes, removeNodes, reorder, updatePage,
  type DesignDoc, type NodeKind, type SceneNode, type ScenePage,
} from "./scene";
import { NodeView } from "./render";
import { designUi, setSelection, setTool, toggleSelection, type DesignTool } from "./model";
import { appendAnchor, nearestAnchor, pathToD, samplePath } from "./path";

/* ====================================================================== *
 * The infinite canvas: pan, zoom, draw, select, move, resize, rotate,
 * snap, marquee, keyboard parity and viewport culling.
 * ====================================================================== */

const TOOL_KIND: Partial<Record<DesignTool, NodeKind>> = {
  frame: "frame", rect: "rect", ellipse: "ellipse", line: "line", polygon: "polygon", text: "text", pen: "path",
};

export type CanvasMode = "design" | "prototype" | "inspect" | "comments";

export interface CanvasProps {
  handle: DocHandle<DesignDoc>;
  context: ScreenContext;
  mode: CanvasMode;
  /** Comment pin placement (comments mode). */
  onPlaceComment?: (point: Pt) => void;
  onLinkNodes?: (fromId: string, toId: string) => void;
}

export function DesignCanvas({ handle, context, mode, onPlaceComment, onLinkNodes }: CanvasProps) {
  const ui = useStore(designUi);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [draft, setDraft] = useState<{ kind: NodeKind; rect: Rect } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const doc = handle.doc;
  const page = doc ? activePage(doc) : null;
  const fitSeen = useRef("");

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(ui.view, { x: clientX - rect.left, y: clientY - rect.top });
  }, [ui.view]);

  /* Fit when the page opens and whenever a fit is asked for. The measured
     size is read through a ref so moving a node never refits the view. */
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const pageRef = useRef(page);
  pageRef.current = page;
  const measured = size.width > 0;
  const fitKey = `${page?.id ?? ""}:${ui.fitRequest}`;
  useEffect(() => {
    const current = pageRef.current;
    const box = sizeRef.current;
    if (!measured || !current || box.width === 0) return;
    if (fitSeen.current === fitKey) return;
    fitSeen.current = fitKey;
    designUi.set((value) => ({ ...value, view: fitRect(pageBounds(current), box.width, box.height, 72) }));
  }, [fitKey, measured]);

  /* Wheel: ctrl/⌘ zooms about the pointer, otherwise two-axis pan. */
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      designUi.set((current) => {
        if (event.ctrlKey || event.metaKey) {
          const factor = Math.exp(-event.deltaY / 220);
          const zoom = Math.max(0.05, Math.min(32, current.view.zoom * factor));
          const world = screenToWorld(current.view, point);
          return { ...current, view: { zoom, x: point.x - world.x * zoom, y: point.y - world.y * zoom } };
        }
        return { ...current, view: { ...current.view, x: current.view.x - event.deltaX, y: current.view.y - event.deltaY } };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const selectedNodes = useMemo(
    () => (page ? ui.selected.map((id) => page.nodes[id]).filter(Boolean) : []),
    [page, ui.selected],
  );
  const single = selectedNodes.length === 1 ? selectedNodes[0] : null;

  /* ---------------------------- virtualization ---------------------------- */
  const visibleWorld: Rect = useMemo(() => {
    const topLeft = screenToWorld(ui.view, { x: -200, y: -200 });
    const bottomRight = screenToWorld(ui.view, { x: size.width + 200, y: size.height + 200 });
    return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
  }, [ui.view, size.width, size.height]);

  const roots = page ? childrenOf(page, page.id) : [];
  const painted = roots.filter((node) => {
    const rect = absoluteRect(page as ScenePage, node);
    return rect.x < visibleWorld.x + visibleWorld.w && visibleWorld.x < rect.x + rect.w
      && rect.y < visibleWorld.y + visibleWorld.h && visibleWorld.y < rect.y + rect.h;
  });
  const culled = roots.length - painted.length;
  const totalNodes = page ? Object.keys(page.nodes).length : 0;

  /* ---------------------------- gestures ---------------------------- */

  const startPan = (event: ReactPointerEvent) => {
    const origin = { ...ui.view };
    dragPointer(event, {
      move: (point, _mods, start) => {
        designUi.set((current) => ({ ...current, view: { ...current.view, x: origin.x + (point.x - start.x), y: origin.y + (point.y - start.y) } }));
      },
    });
  };

  const startDraw = (event: ReactPointerEvent, kind: NodeKind) => {
    const origin = toWorld(event.clientX, event.clientY);
    setDraft({ kind, rect: { x: origin.x, y: origin.y, w: 0, h: 0 } });
    dragPointer(event, {
      move: (point, mods) => {
        let next = toWorld(point.x, point.y);
        if (mods.shift) {
          const side = Math.max(Math.abs(next.x - origin.x), Math.abs(next.y - origin.y));
          next = { x: origin.x + Math.sign(next.x - origin.x || 1) * side, y: origin.y + Math.sign(next.y - origin.y || 1) * side };
        }
        setDraft({ kind, rect: kind === "line" ? { x: origin.x, y: origin.y, w: next.x - origin.x, h: next.y - origin.y } : rectFromPoints(origin, next) });
      },
      end: () => {
        setDraft(null);
        const rect = draftRectRef.current;
        if (!rect) return;
        const final = kind === "line" ? rect : { ...rect, w: Math.max(rect.w, 8), h: Math.max(rect.h, 8) };
        const node = makeNode(kind, final, kind === "text" ? { text: "New text" } : {});
        handle.edit((current) => updatePage(current, (p) => addNode(p, node, p.id)), `Draw ${node.name.toLowerCase()}`);
        setSelection([node.id]);
        setTool("select");
        if (kind === "text") setEditingText(node.id);
      },
    });
  };
  const draftRectRef = useRef<Rect | null>(null);
  draftRectRef.current = draft?.kind === "line" ? draft.rect : draft ? { ...draft.rect } : null;

  const startMove = (event: ReactPointerEvent, node: SceneNode) => {
    if (!page || !doc) return;
    const ids = ui.selected.includes(node.id) ? ui.selected : [node.id];
    const starts = new Map(ids.map((id) => [id, { x: page.nodes[id].x, y: page.nodes[id].y }]));
    const peers = flatten(page)
      .filter((entry) => !ids.includes(entry.node.id) && entry.node.visible)
      .map((entry) => ({ id: entry.node.id, rect: absoluteRect(page, entry.node) }));
    const origin = toWorld(event.clientX, event.clientY);
    const anchorRect = absoluteRect(page, node);
    dragPointer(event, {
      move: (point, mods) => {
        const now = toWorld(point.x, point.y);
        let dx = now.x - origin.x;
        let dy = now.y - origin.y;
        if (mods.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (designUi.get().snap) {
          const result = snapRect({ ...anchorRect, x: anchorRect.x + dx, y: anchorRect.y + dy }, peers, 6 / designUi.get().view.zoom, page.grid.visible ? page.grid.size : 0);
          dx += result.dx;
          dy += result.dy;
          setGuides(result.guides);
        }
        handle.live((current) => updatePage(current, (p) => patchNodes(p, ids, (item) => {
          const start = starts.get(item.id);
          return start ? { x: start.x + dx, y: start.y + dy } : {};
        })));
      },
      end: (moved) => {
        setGuides([]);
        if (moved) {
          handle.beginGesture();
          const parent = parentOf(page, node.id);
          if (parent && parent !== page.id && page.nodes[parent]?.layout) {
            handle.edit((current) => updatePage(current, (p) => applyAutoLayout(p, parent)), "Reflow auto layout");
          }
        }
      },
    });
  };

  const startResize = (event: ReactPointerEvent, handleId: Handle) => {
    if (!page || !single) return;
    event.stopPropagation();
    const startRect = { x: single.x, y: single.y, w: single.w, h: single.h };
    const origin = toWorld(event.clientX, event.clientY);
    dragPointer(event, {
      move: (point, mods) => {
        const now = toWorld(point.x, point.y);
        const next = resizeRect(startRect, handleId, now.x - origin.x, now.y - origin.y, single.rotation, {
          aspect: mods.shift, fromCenter: mods.alt, min: 2,
        });
        handle.live((current) => updatePage(current, (p) => {
          const patched = patchNode(p, single.id, next);
          return p.nodes[single.id].layout ? applyAutoLayout(patched, single.id) : patched;
        }));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const startRotate = (event: ReactPointerEvent) => {
    if (!page || !single) return;
    event.stopPropagation();
    const abs = absoluteRect(page, single);
    const centre = rectCenter(abs);
    const startAngle = angleBetween(centre, toWorld(event.clientX, event.clientY));
    const startDeg = single.rotation;
    dragPointer(event, {
      move: (point, mods) => {
        const deg = rotateTo(centre, toWorld(point.x, point.y), startAngle, startDeg, mods.shift ? 15 : 0);
        handle.live((current) => updatePage(current, (p) => patchNode(p, single.id, { rotation: deg })));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const onBackgroundDown = (event: ReactPointerEvent) => {
    if (!page || !doc) return;
    if (event.button === 1 || spaceDown || ui.tool === "hand") { startPan(event); return; }
    if (mode === "comments") {
      const point = toWorld(event.clientX, event.clientY);
      onPlaceComment?.(point);
      return;
    }
    const kind = TOOL_KIND[ui.tool];
    if (kind && ui.tool !== "pen") { startDraw(event, kind); return; }
    if (ui.tool === "pen") {
      const point = toWorld(event.clientX, event.clientY);
      addPenPoint(point);
      return;
    }
    const origin = toWorld(event.clientX, event.clientY);
    const additive = event.shiftKey;
    const before = [...ui.selected];
    setMarquee({ x: origin.x, y: origin.y, w: 0, h: 0 });
    dragPointer(event, {
      move: (point) => {
        const now = toWorld(point.x, point.y);
        const rect = rectFromPoints(origin, now);
        setMarquee(rect);
        const hits = marqueeHits(page, rect);
        setSelection(additive ? [...new Set([...before, ...hits])] : hits);
      },
      end: (moved) => {
        setMarquee(null);
        if (!moved && !additive) setSelection([]);
      },
    });
  };

  const addPenPoint = (point: Pt) => {
    if (!doc) return;
    const current = designUi.get();
    const target = current.pathNodeId ? activePage(doc).nodes[current.pathNodeId] : undefined;
    if (target?.path) {
      const local = { x: point.x - absoluteRect(activePage(doc), target).x, y: point.y - absoluteRect(activePage(doc), target).y };
      handle.edit((value) => updatePage(value, (p) => patchNode(p, target.id, {
        path: appendAnchor(target.path!, local, `a-${Date.now().toString(36)}`),
      })), "Add point");
      return;
    }
    const node = makeNode("path", { x: point.x, y: point.y, w: 1, h: 1 }, { name: "Pen path" });
    node.path = { anchors: [{ id: `a-${Date.now().toString(36)}`, x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, type: "corner" }], closed: false, fillRule: "nonzero" };
    handle.edit((value) => updatePage(value, (p) => addNode(p, node, p.id)), "Start path");
    designUi.set((value) => ({ ...value, pathNodeId: node.id, selected: [node.id] }));
  };

  const onNodeDown = (node: SceneNode, event: ReactPointerEvent) => {
    if (!page) return;
    if (spaceDown || ui.tool === "hand") return;
    if (TOOL_KIND[ui.tool] && ui.tool !== "select") return;
    event.stopPropagation();
    if (mode === "prototype" || ui.tool === "link") {
      if (!linkFrom) { setLinkFrom(node.id); setSelection([node.id]); return; }
      if (linkFrom !== node.id) onLinkNodes?.(linkFrom, node.id);
      setLinkFrom(null);
      return;
    }
    if (!isEditable(page, node.id)) {
      context.toast("That layer is locked", `${node.name} is locked or hidden, so the canvas will not edit it. Unlock it in the layers panel.`, "blocked");
      return;
    }
    toggleSelection(node.id, event.shiftKey);
    if (!event.shiftKey) startMove(event, node);
  };

  /* ---------------------------- keyboard ---------------------------- */

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!page || !doc) return;
    const meta = event.metaKey || event.ctrlKey;
    const ids = ui.selected;
    const step = event.shiftKey ? 10 : 1;
    const nudge = (dx: number, dy: number) => {
      event.preventDefault();
      if (ids.length === 0) return;
      if (event.altKey) {
        handle.edit((current) => updatePage(current, (p) => patchNodes(p, ids, (node) => ({ w: Math.max(2, node.w + dx * step), h: Math.max(2, node.h + dy * step) }))), "Resize by keyboard");
      } else {
        handle.edit((current) => updatePage(current, (p) => patchNodes(p, ids, (node) => ({ x: node.x + dx * step, y: node.y + dy * step }))), "Nudge");
      }
    };
    if (event.key === "ArrowLeft") return nudge(-1, 0);
    if (event.key === "ArrowRight") return nudge(1, 0);
    if (event.key === "ArrowUp") return nudge(0, -1);
    if (event.key === "ArrowDown") return nudge(0, 1);
    if (event.key === "[" && meta) { event.preventDefault(); return ids.forEach((id) => handle.edit((current) => updatePage(current, (p) => reorder(p, id, -1)), "Move backwards")); }
    if (event.key === "]" && meta) { event.preventDefault(); return ids.forEach((id) => handle.edit((current) => updatePage(current, (p) => reorder(p, id, 1)), "Move forwards")); }
    if (event.key.toLowerCase() === "g" && meta && ids.length > 1) {
      event.preventDefault();
      return handle.edit((current) => updatePage(current, (p) => groupNodes(p, ids).page), "Group selection");
    }
    if (event.key.toLowerCase() === "z" && meta) { event.preventDefault(); return event.shiftKey ? handle.redo() : handle.undo(); }
    if (event.key.toLowerCase() === "d" && meta && ids.length) {
      event.preventDefault();
      return handle.edit((current) => updatePage(current, (p) => {
        let next = p;
        for (const id of ids) {
          const node = p.nodes[id];
          if (!node) continue;
          next = addNode(next, { ...node, id: `${node.id}-copy-${Date.now().toString(36)}`, x: node.x + 16, y: node.y + 16, name: `${node.name} copy` }, parentOf(p, id) ?? p.id);
        }
        return next;
      }), "Duplicate");
    }
    if ((event.key === "Delete" || event.key === "Backspace") && ids.length) {
      event.preventDefault();
      handle.edit((current) => updatePage(current, (p) => removeNodes(p, ids)), "Delete selection");
      setSelection([]);
      return;
    }
    if (event.key === "Escape") { setSelection([]); setTool("select"); designUi.set((c) => ({ ...c, pathNodeId: undefined })); return; }
    if (event.key === "Tab") {
      event.preventDefault();
      const order = flatten(page).map((entry) => entry.node.id);
      const index = order.indexOf(ids[0] ?? "");
      const next = order[(index + (event.shiftKey ? -1 : 1) + order.length) % order.length];
      if (next) setSelection([next]);
      return;
    }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); return designUi.set((c) => ({ ...c, view: { ...c.view, zoom: Math.min(32, c.view.zoom * 1.2) } })); }
    if (event.key === "-") { event.preventDefault(); return designUi.set((c) => ({ ...c, view: { ...c.view, zoom: Math.max(0.05, c.view.zoom / 1.2) } })); }
    if (event.key === "0") { event.preventDefault(); return designUi.set((c) => ({ ...c, fitRequest: c.fitRequest + 1 })); }
    if (!meta && !event.altKey) {
      const map: Record<string, DesignTool> = { v: "select", f: "frame", r: "rect", o: "ellipse", l: "line", y: "polygon", p: "pen", t: "text", h: "hand" };
      const tool = map[event.key.toLowerCase()];
      if (tool) { event.preventDefault(); setTool(tool); }
    }
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceDown(true); };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  if (!doc || !page) return <div className="ds-empty" style={{ height: "100%" }}><p>Opening the file…</p></div>;

  const matrix = matToString(viewMatrix(ui.view));
  const rawStep = page.grid.size * ui.view.zoom;
  const gridStep = rawStep < 10 ? rawStep * Math.ceil(10 / Math.max(rawStep, 0.5)) : rawStep;
  const comments = doc.comments.filter((comment) => comment.pageId === page.id);
  const editing = editingText ? page.nodes[editingText] : null;

  return (
    <div ref={frameRef} style={{ position: "absolute", inset: 0 }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="application"
        aria-label={`${page.name} canvas. ${totalNodes} layers. Arrow keys move the selection, Alt with arrows resizes it, R rotates with the handle.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onBackgroundDown}
        style={{ display: "block", background: "var(--bg-sunken)", cursor: spaceDown || ui.tool === "hand" ? "grab" : ui.tool === "select" ? "default" : "crosshair", touchAction: "none", outline: "none" }}
      >
        <defs>
          {gridStep > 5 && (
            <pattern id="vx-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={ui.view.x % gridStep} y={ui.view.y % gridStep}>
              <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="var(--border-default)" strokeWidth="1" opacity="0.7" />
            </pattern>
          )}
        </defs>
        {ui.gridVisible && gridStep > 5 && <rect width="100%" height="100%" fill="url(#vx-grid)" />}

        <g transform={matrix}>
          {painted.map((node) => (
            <NodeView
              key={node.id}
              page={page}
              node={node}
              doc={doc}
              selected={ui.selected}
              onPointerDown={onNodeDown}
              onDoubleClick={(target) => { if (target.kind === "text") setEditingText(target.id); }}
            />
          ))}

          {/* column grid overlay for frames */}
          {page.grid.visible && page.grid.kind === "columns" && childrenOf(page, page.id).filter((node) => node.kind === "frame").map((frame) => {
            const rect = absoluteRect(page, frame);
            const columnWidth = (rect.w - page.grid.gutter * (page.grid.count - 1)) / page.grid.count;
            return Array.from({ length: page.grid.count }, (_, index) => (
              <rect
                key={`${frame.id}-col-${index}`}
                x={rect.x + index * (columnWidth + page.grid.gutter)}
                y={rect.y}
                width={Math.max(0, columnWidth)}
                height={rect.h}
                fill="rgba(255,0,80,0.07)"
                pointerEvents="none"
              />
            ));
          })}

          {/* prototype links */}
          {(mode === "prototype" || ui.tool === "link") && flatten(page).map(({ node }) => {
            if (!node.link) return null;
            const target = page.nodes[node.link.to];
            if (!target) return null;
            const from = rectCenter(absoluteRect(page, node));
            const to = rectCenter(absoluteRect(page, target));
            return (
              <g key={`link-${node.id}`} pointerEvents="none">
                <path d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y} ${(from.x + to.x) / 2} ${to.y} ${to.x} ${to.y}`} fill="none" stroke="var(--accent)" strokeWidth={2 / ui.view.zoom} strokeDasharray={`${6 / ui.view.zoom} ${4 / ui.view.zoom}`} />
                <circle cx={to.x} cy={to.y} r={5 / ui.view.zoom} fill="var(--accent)" />
              </g>
            );
          })}

          {/* selection chrome */}
          {ui.selected.map((id) => {
            const node = page.nodes[id];
            if (!node) return null;
            const rect = absoluteRect(page, node);
            const corners = rotatedCorners(rect, node.rotation);
            return (
              <polygon
                key={`sel-${id}`}
                points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5 / ui.view.zoom}
                pointerEvents="none"
              />
            );
          })}

          {single && mode === "design" && (() => {
            const rect = absoluteRect(page, single);
            const centre = rectCenter(rect);
            const handleSize = 8 / ui.view.zoom;
            const rotateHandle = handleWorldPoint({ ...rect, y: rect.y - 26 / ui.view.zoom }, single.rotation, "n");
            return (
              <g>
                <line x1={centre.x} y1={centre.y} x2={rotateHandle.x} y2={rotateHandle.y} stroke="var(--accent)" strokeWidth={1 / ui.view.zoom} opacity={0.4} pointerEvents="none" />
                <circle
                  cx={rotateHandle.x}
                  cy={rotateHandle.y}
                  r={handleSize * 0.75}
                  fill="var(--bg-surface)"
                  stroke="var(--accent)"
                  strokeWidth={1.5 / ui.view.zoom}
                  style={{ cursor: "grab" }}
                  onPointerDown={startRotate}
                  data-testid="rotate-handle"
                />
                {HANDLES.map((handleId) => {
                  const point = handleWorldPoint(rect, single.rotation, handleId);
                  return (
                    <rect
                      key={handleId}
                      x={point.x - handleSize / 2}
                      y={point.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="var(--bg-surface)"
                      stroke="var(--accent)"
                      strokeWidth={1.5 / ui.view.zoom}
                      data-handle={handleId}
                      style={{ cursor: handleId === "n" || handleId === "s" ? "ns-resize" : handleId === "e" || handleId === "w" ? "ew-resize" : "nwse-resize" }}
                      onPointerDown={(event) => startResize(event, handleId)}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* path overlay while the pen is live */}
          {ui.pathNodeId && page.nodes[ui.pathNodeId]?.path && (() => {
            const node = page.nodes[ui.pathNodeId];
            const offset = absoluteRect(page, node);
            return (
              <g transform={`translate(${offset.x} ${offset.y})`} pointerEvents="none">
                <path d={pathToD(node.path!)} fill="none" stroke="var(--accent)" strokeWidth={1.5 / ui.view.zoom} />
                {node.path!.anchors.map((item) => (
                  <circle key={item.id} cx={item.x} cy={item.y} r={4 / ui.view.zoom} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={1.5 / ui.view.zoom} />
                ))}
              </g>
            );
          })()}

          {/* snap guides */}
          {guides.map((guide, index) => (
            <line
              key={`${guide.axis}-${guide.at}-${index}`}
              x1={guide.axis === "x" ? guide.at : visibleWorld.x}
              x2={guide.axis === "x" ? guide.at : visibleWorld.x + visibleWorld.w}
              y1={guide.axis === "y" ? guide.at : visibleWorld.y}
              y2={guide.axis === "y" ? guide.at : visibleWorld.y + visibleWorld.h}
              stroke="#FF2D78"
              strokeWidth={1 / ui.view.zoom}
              pointerEvents="none"
            />
          ))}

          {draft && (
            draft.kind === "line"
              ? <line x1={draft.rect.x} y1={draft.rect.y} x2={draft.rect.x + draft.rect.w} y2={draft.rect.y + draft.rect.h} stroke="var(--accent)" strokeWidth={2 / ui.view.zoom} pointerEvents="none" />
              : <rect x={draft.rect.x} y={draft.rect.y} width={draft.rect.w} height={draft.rect.h} fill="rgba(35,79,232,0.12)" stroke="var(--accent)" strokeWidth={1 / ui.view.zoom} pointerEvents="none" />
          )}

          {marquee && (
            <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(35,79,232,0.08)" stroke="var(--accent)" strokeDasharray={`${4 / ui.view.zoom} ${3 / ui.view.zoom}`} strokeWidth={1 / ui.view.zoom} pointerEvents="none" />
          )}

          {mode === "comments" && comments.map((comment, index) => (
            <g key={comment.id} transform={`translate(${comment.x} ${comment.y})`}>
              <circle r={11 / ui.view.zoom} fill={comment.resolved ? "var(--success)" : "var(--accent)"} stroke="#fff" strokeWidth={2 / ui.view.zoom} />
              <text y={4 / ui.view.zoom} textAnchor="middle" fontSize={11 / ui.view.zoom} fill="#fff" fontWeight={700}>{index + 1}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* inline text editing, positioned over the node */}
      {editing && editing.kind === "text" && (() => {
        const rect = absoluteRect(page, editing);
        const topLeft = { x: rect.x * ui.view.zoom + ui.view.x, y: rect.y * ui.view.zoom + ui.view.y };
        return (
          <textarea
            autoFocus
            aria-label={`Edit ${editing.name}`}
            value={editing.text ?? ""}
            onChange={(event) => handle.live((current) => updatePage(current, (p) => patchNode(p, editing.id, { text: event.target.value })))}
            onBlur={() => { handle.beginGesture(); setEditingText(null); }}
            style={{
              position: "absolute",
              left: topLeft.x,
              top: topLeft.y,
              width: Math.max(80, rect.w * ui.view.zoom),
              height: Math.max(32, rect.h * ui.view.zoom),
              font: `${(editing.textStyle?.weight ?? 400)} ${(editing.textStyle?.size ?? 16) * ui.view.zoom}px/${editing.textStyle?.lineHeight ?? 1.3} ${editing.textStyle?.family ?? "Inter"}`,
              color: editing.textStyle?.color ?? "#17223A",
              background: "rgba(255,255,255,0.92)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              padding: 0,
              resize: "none",
            }}
          />
        );
      })()}

      <div style={{ position: "absolute", inset: "auto auto 10px 10px", display: "flex", gap: 6, pointerEvents: "none" }}>
        <Pill tone="info">{Math.round(ui.view.zoom * 100)}%</Pill>
        {culled > 0 && <Pill tone="neutral">{culled} of {roots.length} root layers off-screen, not painted</Pill>}
        {spaceDown && <Pill tone="accent">Space held — drag to pan</Pill>}
        {linkFrom && <Pill tone="accent">Pick the destination frame</Pill>}
      </div>
    </div>
  );
}

/* ====================================================================== *
 * Path editor canvas: anchors, handles, and direct bezier editing.
 * ====================================================================== */

export function PathCanvas({ handle, nodeId, onConvert }: { handle: DocHandle<DesignDoc>; nodeId: string | undefined; onConvert?: (node: SceneNode) => void }) {
  const ui = useStore(designUi);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const doc = handle.doc;
  const page = doc ? activePage(doc) : null;
  const node = page && nodeId ? page.nodes[nodeId] : undefined;

  const toLocal = useCallback((clientX: number, clientY: number): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !page || !node) return { x: 0, y: 0 };
    const world = screenToWorld(ui.view, { x: clientX - rect.left, y: clientY - rect.top });
    const offset = absoluteOffset(page, node.id);
    return { x: world.x - node.x - offset.x, y: world.y - node.y - offset.y };
  }, [ui.view, page, node]);

  useEffect(() => {
    if (!node || size.width === 0) return;
    designUi.set((current) => ({ ...current, view: fitRect({ x: node.x - 40, y: node.y - 40, w: node.w + 80, h: node.h + 80 }, size.width, size.height, 40) }));
  }, [nodeId, size.width, size.height]);

  if (!doc || !page) return <div className="ds-empty" style={{ height: "100%" }}><p>Opening the file…</p></div>;
  if (!node?.path) {
    const convertible = Object.values(page.nodes).filter((item) => ["rect", "ellipse", "polygon"].includes(item.kind));
    return (
      <div style={{ height: "100%", display: "grid", placeContent: "center", textAlign: "center", padding: 24 }}>
        <h3 style={{ marginBottom: 8 }}>No path is open</h3>
        <p className="ds-prose" style={{ maxWidth: "48ch", margin: "0 auto 12px" }}>
          Choose the pen tool and click on the canvas to start one, or turn a shape on this page into an editable path.
        </p>
        <div className="ds-row ds-gap-2 ds-wrap" style={{ justifyContent: "center" }}>
          {convertible.length === 0
            ? <Pill tone="warning">This page has no rectangle, ellipse or polygon to convert</Pill>
            : convertible.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className="ds-btn"
                data-variant="secondary"
                data-size="sm"
                onClick={() => onConvert?.(item)}
              >
                {item.name} → path
              </button>
            ))}
        </div>
      </div>
    );
  }

  const path = node.path;
  const offset = absoluteOffset(page, node.id);
  const samples = samplePath(path, 20);

  const dragAnchor = (event: ReactPointerEvent, anchorId: string) => {
    event.stopPropagation();
    const start = toLocal(event.clientX, event.clientY);
    const original = path.anchors.find((item) => item.id === anchorId);
    if (!original) return;
    designUi.set((current) => ({ ...current, selectedAnchors: [anchorId] }));
    dragPointer(event, {
      move: (point, mods) => {
        const now = toLocal(point.x, point.y);
        let dx = now.x - start.x;
        let dy = now.y - start.y;
        if (mods.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        handle.live((current) => updatePage(current, (p) => patchNode(p, node.id, {
          path: { ...path, anchors: path.anchors.map((item) => (item.id === anchorId ? { ...item, x: original.x + dx, y: original.y + dy } : item)) },
        })));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const dragHandle = (event: ReactPointerEvent, anchorId: string, which: "in" | "out") => {
    event.stopPropagation();
    const original = path.anchors.find((item) => item.id === anchorId);
    if (!original) return;
    dragPointer(event, {
      move: (point) => {
        const now = toLocal(point.x, point.y);
        const to = { x: now.x - original.x, y: now.y - original.y };
        handle.live((current) => updatePage(current, (p) => patchNode(p, node.id, {
          path: {
            ...path,
            anchors: path.anchors.map((item) => {
              if (item.id !== anchorId) return item;
              const next = { ...item, [which]: to } as typeof item;
              if (item.type !== "corner") {
                const other = which === "in" ? "out" : "in";
                const length = item.type === "symmetric" ? Math.hypot(to.x, to.y) : Math.hypot(item[other].x, item[other].y);
                const magnitude = Math.hypot(to.x, to.y) || 1;
                next[other] = { x: (-to.x / magnitude) * length, y: (-to.y / magnitude) * length };
              }
              return next;
            }),
          },
        })));
      },
      end: (moved) => { if (moved) handle.beginGesture(); },
    });
  };

  const onBackground = (event: ReactPointerEvent) => {
    if (event.button === 1) {
      const origin = { ...ui.view };
      dragPointer(event, { move: (point, _m, start) => designUi.set((c) => ({ ...c, view: { ...c.view, x: origin.x + (point.x - start.x), y: origin.y + (point.y - start.y) } })) });
      return;
    }
    if (ui.tool === "pen") {
      const local = toLocal(event.clientX, event.clientY);
      handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: appendAnchor(path, local, `a-${Date.now().toString(36)}`) })), "Add point");
      return;
    }
    const local = toLocal(event.clientX, event.clientY);
    const near = nearestAnchor(path, local, 12 / ui.view.zoom);
    designUi.set((current) => ({ ...current, selectedAnchors: near ? [near.id] : [] }));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const ids = ui.selectedAnchors;
    if (ids.length === 0) return;
    const step = event.shiftKey ? 10 : 1;
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, {
        path: { ...path, anchors: path.anchors.map((item) => (ids.includes(item.id) ? { ...item, x: item.x + dx * step, y: item.y + dy * step } : item)) },
      })), "Move point");
    };
    if (event.key === "ArrowLeft") return move(-1, 0);
    if (event.key === "ArrowRight") return move(1, 0);
    if (event.key === "ArrowUp") return move(0, -1);
    if (event.key === "ArrowDown") return move(0, 1);
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: { ...path, anchors: path.anchors.filter((item) => !ids.includes(item.id)) } })), "Delete point");
      designUi.set((current) => ({ ...current, selectedAnchors: [] }));
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const index = path.anchors.findIndex((item) => item.id === ids[0]);
      const next = path.anchors[(index + (event.shiftKey ? -1 : 1) + path.anchors.length) % path.anchors.length];
      designUi.set((current) => ({ ...current, selectedAnchors: next ? [next.id] : [] }));
    }
  };

  return (
    <div ref={frameRef} style={{ position: "absolute", inset: 0 }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="application"
        tabIndex={0}
        aria-label={`Path editor for ${node.name}. ${path.anchors.length} anchor points. Tab moves between points, arrow keys move the selected point.`}
        onPointerDown={onBackground}
        onKeyDown={onKeyDown}
        style={{ display: "block", background: "var(--bg-sunken)", cursor: ui.tool === "pen" ? "crosshair" : "default", touchAction: "none", outline: "none" }}
      >
        <g transform={matToString(viewMatrix(ui.view))}>
          <g transform={`translate(${node.x + offset.x} ${node.y + offset.y})`}>
            <path d={pathToD(path)} fill={node.fill ? node.fill.color : "none"} fillRule={path.fillRule} stroke={node.stroke?.color ?? "var(--accent)"} strokeWidth={(node.stroke?.width ?? 1.5) / 1} />
            <path d={pathToD(path)} fill="none" stroke="var(--accent)" strokeWidth={1 / ui.view.zoom} strokeDasharray={`${3 / ui.view.zoom} ${3 / ui.view.zoom}`} pointerEvents="none" />
            {samples.filter((_, index) => index % 4 === 0).map((point, index) => (
              <circle key={`s${index}`} cx={point.x} cy={point.y} r={1.2 / ui.view.zoom} fill="var(--accent)" opacity={0.35} pointerEvents="none" />
            ))}
            {path.anchors.map((item) => {
              const chosen = ui.selectedAnchors.includes(item.id);
              return (
                <g key={item.id}>
                  {chosen && (
                    <>
                      <line x1={item.x} y1={item.y} x2={item.x + item.in.x} y2={item.y + item.in.y} stroke="var(--accent)" strokeWidth={1 / ui.view.zoom} />
                      <line x1={item.x} y1={item.y} x2={item.x + item.out.x} y2={item.y + item.out.y} stroke="var(--accent)" strokeWidth={1 / ui.view.zoom} />
                      <circle cx={item.x + item.in.x} cy={item.y + item.in.y} r={4 / ui.view.zoom} fill="var(--accent)" style={{ cursor: "grab" }} onPointerDown={(event) => dragHandle(event, item.id, "in")} />
                      <circle cx={item.x + item.out.x} cy={item.y + item.out.y} r={4 / ui.view.zoom} fill="var(--accent)" style={{ cursor: "grab" }} onPointerDown={(event) => dragHandle(event, item.id, "out")} />
                    </>
                  )}
                  <rect
                    x={item.x - 4 / ui.view.zoom}
                    y={item.y - 4 / ui.view.zoom}
                    width={8 / ui.view.zoom}
                    height={8 / ui.view.zoom}
                    fill={chosen ? "var(--accent)" : "var(--bg-surface)"}
                    stroke="var(--accent)"
                    strokeWidth={1.5 / ui.view.zoom}
                    transform={item.type === "corner" ? undefined : `rotate(45 ${item.x} ${item.y})`}
                    style={{ cursor: "grab" }}
                    onPointerDown={(event) => dragAnchor(event, item.id)}
                    data-anchor={item.id}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div style={{ position: "absolute", inset: "auto auto 10px 10px", display: "flex", gap: 6, pointerEvents: "none" }}>
        <Pill tone="info">{path.anchors.length} anchors</Pill>
        <Pill tone="neutral">{path.closed ? "closed" : "open"} · {path.fillRule}</Pill>
      </div>
    </div>
  );
}

export { HANDLE_LABEL };
