import { useMemo, useState } from "react";
import {
  ChevronRight, Eye, EyeOff, Lock, Unlock, Square, Circle, Type as TypeIcon,
  Frame as FrameIcon, Minus, Hexagon, PenTool, Component, ArrowDown, ArrowUp,
} from "lucide-react";
import {
  Button, Empty, Field, Notice, Pill, Row, Select, Stack, TextInput, Properties,
} from "@/design-system";
import { ColorBox, NumberBox, PanelGroup, SliderBox, useStore, type DocHandle } from "@/applications/visual/kit";
import type { ScreenContext } from "@/platform/registry";
import {
  absoluteRect, activePage, alignTarget, applyAutoLayout, childrenOf, contrastRatio, flatten, groupNodes,
  patchNode, patchNodes, removeNodes, reorder, selectionBounds, ungroup, updatePage, wcagGrade,
  type DesignDoc, type NodeKind, type SceneNode,
} from "./scene";
import { NodeView } from "./render";
import { designUi, setSelection, toggleSelection } from "./model";
import { pathLength, subpathCount } from "./path";
import { alignOffset, distribute, type AlignMode } from "@/applications/visual/geometry";

/* ====================================================================== *
 * Panels shared by the design screens.
 * ====================================================================== */

const KIND_ICON: Record<NodeKind, typeof Square> = {
  frame: FrameIcon, group: Component, rect: Square, ellipse: Circle,
  line: Minus, polygon: Hexagon, path: PenTool, text: TypeIcon, instance: Component,
};

export function LayersPanel({ handle, context, showSearch = true }: { handle: DocHandle<DesignDoc>; context: ScreenContext; showSearch?: boolean }) {
  const ui = useStore(designUi);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const rows = flatten(page).filter((entry) => !query || entry.node.name.toLowerCase().includes(query.toLowerCase()));
  const ordered = [...rows].reverse();

  const move = (id: string, delta: number) => handle.edit((current) => updatePage(current, (p) => reorder(p, id, delta)), delta < 0 ? "Move backwards" : "Move forwards");

  return (
    <Stack gap={2}>
      {showSearch && (
        <TextInput
          placeholder="Search layers"
          aria-label="Search layers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {ordered.length === 0 ? (
        <Empty title="No layers" icon={<FrameIcon size={18} />}>Draw a frame or a shape on the canvas; every layer appears here in paint order, topmost first.</Empty>
      ) : (
        <div className="vx-tree" role="tree" aria-label="Layers, topmost first">
          {ordered.map((entry) => {
            const Icon = KIND_ICON[entry.node.kind];
            const selected = ui.selected.includes(entry.node.id);
            return (
              <div key={entry.node.id} className="ds-row" style={{ gap: 2 }}>
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={selected}
                  aria-level={entry.depth + 1}
                  className="vx-node"
                  data-selected={selected}
                  data-hidden={!entry.node.visible}
                  style={{ paddingInlineStart: 8 + entry.depth * 14 }}
                  onClick={(event) => toggleSelection(entry.node.id, event.shiftKey || event.metaKey)}
                  onDoubleClick={() => setRenaming(entry.node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "F2") { event.preventDefault(); setRenaming(entry.node.id); }
                    if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); move(entry.node.id, 1); }
                    if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); move(entry.node.id, -1); }
                  }}
                >
                  {(entry.node.kind === "frame" || entry.node.kind === "group") && <ChevronRight size={12} aria-hidden="true" />}
                  <Icon size={13} aria-hidden="true" />
                  {renaming === entry.node.id ? (
                    <input
                      autoFocus
                      className="vx-num"
                      aria-label={`Rename ${entry.node.name}`}
                      defaultValue={entry.node.name}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        handle.edit((current) => updatePage(current, (p) => patchNode(p, entry.node.id, { name: event.target.value || entry.node.name })), "Rename layer");
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(null); }}
                    />
                  ) : (
                    <span className="vx-node-label">{entry.node.name}</span>
                  )}
                  {entry.node.fill && <i className="vx-swatchdot" style={{ background: entry.node.fill.color }} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="vx-node-btn"
                  aria-label={`${entry.node.visible ? "Hide" : "Show"} ${entry.node.name}`}
                  aria-pressed={!entry.node.visible}
                  onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, entry.node.id, { visible: !entry.node.visible })), entry.node.visible ? "Hide layer" : "Show layer")}
                >
                  {entry.node.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  type="button"
                  className="vx-node-btn"
                  data-on={entry.node.locked ? "true" : undefined}
                  aria-label={`${entry.node.locked ? "Unlock" : "Lock"} ${entry.node.name}`}
                  aria-pressed={entry.node.locked}
                  onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, entry.node.id, { locked: !entry.node.locked })), entry.node.locked ? "Unlock layer" : "Lock layer")}
                >
                  {entry.node.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Row gap={1} wrap>
        <Button size="sm" variant="ghost" disabled={ui.selected.length === 0} onClick={() => ui.selected.forEach((id) => move(id, 1))} icon={<ArrowUp size={13} />}>Forwards</Button>
        <Button size="sm" variant="ghost" disabled={ui.selected.length === 0} onClick={() => ui.selected.forEach((id) => move(id, -1))} icon={<ArrowDown size={13} />}>Backwards</Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={ui.selected.length < 2}
          onClick={() => handle.edit((current) => updatePage(current, (p) => groupNodes(p, ui.selected).page), "Group selection")}
        >
          Group
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={ui.selected.length !== 1 || !["group", "frame"].includes(page.nodes[ui.selected[0]]?.kind ?? "")}
          onClick={() => handle.edit((current) => updatePage(current, (p) => ungroup(p, ui.selected[0])), "Ungroup")}
        >
          Ungroup
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={ui.selected.length === 0}
          onClick={() => {
            handle.edit((current) => updatePage(current, (p) => removeNodes(p, ui.selected)), "Delete layers");
            setSelection([]);
            context.toast("Layers deleted", `${ui.selected.length} layer${ui.selected.length === 1 ? "" : "s"} removed. Undo with ⌘Z.`);
          }}
        >
          Delete
        </Button>
      </Row>
      <p className="vx-mini">
        Shift-click adds to the selection. F2 renames. Alt with the up or down arrow reorders without the pointer.
      </p>
    </Stack>
  );
}

export function PagesPanel({ handle }: { handle: DocHandle<DesignDoc> }) {
  const doc = handle.doc;
  if (!doc) return null;
  return (
    <PanelGroup
      title="Pages"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handle.edit((current) => {
            const id = `page-${current.pages.length + 1}`;
            return {
              ...current,
              pages: [...current.pages, { id, name: `Page ${current.pages.length + 1}`, background: "#F2F4F8", grid: { kind: "square", size: 8, count: 12, gutter: 24, visible: true }, children: { [id]: [] }, nodes: {} }],
              activePageId: id,
            };
          }, "Add page")}
        >
          Add
        </Button>
      }
    >
      <div className="vx-tree" role="list">
        {doc.pages.map((page) => (
          <button
            key={page.id}
            type="button"
            className="vx-node"
            data-selected={page.id === doc.activePageId}
            onClick={() => handle.edit((current) => ({ ...current, activePageId: page.id }), "Switch page")}
          >
            <span className="vx-node-label">{page.name}</span>
            <Pill>{Object.keys(page.nodes).length}</Pill>
          </button>
        ))}
      </div>
    </PanelGroup>
  );
}

/* ------------------------------ inspector ------------------------------ */

export function GeometryInspector({ handle, context }: { handle: DocHandle<DesignDoc>; context: ScreenContext }) {
  const ui = useStore(designUi);
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const nodes = ui.selected.map((id) => page.nodes[id]).filter(Boolean);
  const node = nodes.length === 1 ? nodes[0] : null;
  const bounds = selectionBounds(page, ui.selected);

  const set = (patch: Partial<SceneNode>, label: string) => {
    if (!node) return;
    handle.edit((current) => updatePage(current, (p) => {
      const next = patchNode(p, node.id, patch);
      return next.nodes[node.id].layout ? applyAutoLayout(next, node.id) : next;
    }), label);
  };

  if (nodes.length === 0) {
    return (
      <Stack gap={3}>
        <Notice tone="info" title="Nothing selected">Click a layer on the canvas or in the layers panel. Drag on empty canvas to marquee-select; hold shift to add.</Notice>
        <PanelGroup title="Page">
          <ColorBox label="Background" value={page.background} onChange={(value) => handle.edit((current) => updatePage(current, (p) => ({ ...p, background: value })), "Page background")} />
          <NumberBox label="Grid size" value={page.grid.size} min={1} onChange={(value) => handle.edit((current) => updatePage(current, (p) => ({ ...p, grid: { ...p.grid, size: Math.max(1, value) } })), "Grid size")} />
        </PanelGroup>
      </Stack>
    );
  }

  if (!node) {
    return (
      <Stack gap={3}>
        <PanelGroup title={`${nodes.length} layers selected`}>
          <Properties rows={[
            { label: "Bounds", value: bounds ? `${Math.round(bounds.w)} × ${Math.round(bounds.h)}` : "—" },
            { label: "Kinds", value: [...new Set(nodes.map((item) => item.kind))].join(", ") },
          ]} />
        </PanelGroup>
        <AlignControls handle={handle} />
        <PanelGroup title="Opacity">
          <SliderBox
            label="All selected"
            value={Math.round((nodes[0].opacity ?? 1) * 100)}
            min={0}
            max={100}
            onChange={(value) => handle.edit((current) => updatePage(current, (p) => patchNodes(p, ui.selected, () => ({ opacity: value / 100 }))), "Opacity")}
            format={(value) => `${Math.round(value)}%`}
          />
        </PanelGroup>
        <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => updatePage(current, (p) => groupNodes(p, ui.selected).page), "Group selection")}>Group selection</Button>
      </Stack>
    );
  }

  const absolute = absoluteRect(page, node);
  const textContrast = node.kind === "text" && node.textStyle
    ? contrastRatio(node.textStyle.color, page.background)
    : null;

  return (
    <Stack gap={3}>
      <PanelGroup title={node.name}>
        <Row gap={2} wrap>
          <Pill tone="info">{node.kind}</Pill>
          {node.locked && <Pill tone="warning">locked</Pill>}
          {!node.visible && <Pill tone="warning">hidden</Pill>}
          {node.componentId && <Pill tone="accent">instance</Pill>}
        </Row>
      </PanelGroup>

      <PanelGroup title="Position and size">
        <div className="vx-fieldrow">
          <NumberBox label="X" value={node.x} onChange={(value) => set({ x: value }, "Set X")} />
          <NumberBox label="Y" value={node.y} onChange={(value) => set({ y: value }, "Set Y")} />
          <NumberBox label="W" value={node.w} min={1} onChange={(value) => set({ w: Math.max(1, value) }, "Set width")} />
          <NumberBox label="H" value={node.h} min={1} onChange={(value) => set({ h: Math.max(1, value) }, "Set height")} />
          <NumberBox label="Rotation" suffix="deg" value={node.rotation} onChange={(value) => set({ rotation: value }, "Set rotation")} />
          {node.kind !== "line" && node.kind !== "text" && (
            <NumberBox label="Corner radius" value={node.radius ?? 0} min={0} onChange={(value) => set({ radius: Math.max(0, value) }, "Set corner radius")} />
          )}
        </div>
        <p className="vx-mini">On the page: {Math.round(absolute.x)}, {Math.round(absolute.y)}</p>
      </PanelGroup>

      <PanelGroup title="Appearance">
        <SliderBox label="Opacity" value={Math.round(node.opacity * 100)} min={0} max={100} onChange={(value) => set({ opacity: value / 100 }, "Set opacity")} format={(value) => `${Math.round(value)}%`} />
        {node.kind !== "line" && (
          <>
            <Field label="Fill">
              <Select
                value={node.fill ? node.fill.type : "none"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "none") set({ fill: undefined }, "Remove fill");
                  else if (value === "solid") set({ fill: { type: "solid", color: node.fill?.color ?? "#234FE8" } }, "Solid fill");
                  else set({ fill: { type: "linear", color: node.fill?.color ?? "#234FE8", to: node.fill?.to ?? "#36C5BA", angle: node.fill?.angle ?? 90 } }, "Gradient fill");
                }}
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="linear">Linear gradient</option>
              </Select>
            </Field>
            {node.fill && <ColorBox label={node.fill.type === "linear" ? "Gradient from" : "Fill"} value={node.fill.color} onChange={(value) => set({ fill: { ...node.fill!, color: value } }, "Set fill")} />}
            {node.fill?.type === "linear" && (
              <>
                <ColorBox label="Gradient to" value={node.fill.to ?? "#36C5BA"} onChange={(value) => set({ fill: { ...node.fill!, to: value } }, "Set gradient end")} />
                <SliderBox label="Angle" value={node.fill.angle ?? 90} min={0} max={360} onChange={(value) => set({ fill: { ...node.fill!, angle: value } }, "Set gradient angle")} format={(value) => `${Math.round(value)}°`} />
              </>
            )}
          </>
        )}
        <Field label="Stroke">
          <Select
            value={node.stroke ? "on" : "off"}
            onChange={(event) => set(event.target.value === "on" ? { stroke: { color: "#17223A", width: 1, align: "center" } } : { stroke: undefined }, "Stroke")}
          >
            <option value="off">None</option>
            <option value="on">Solid</option>
          </Select>
        </Field>
        {node.stroke && (
          <>
            <ColorBox label="Stroke colour" value={node.stroke.color} onChange={(value) => set({ stroke: { ...node.stroke!, color: value } }, "Stroke colour")} />
            <div className="vx-fieldrow">
              <NumberBox label="Width" value={node.stroke.width} min={0} step={0.5} onChange={(value) => set({ stroke: { ...node.stroke!, width: Math.max(0, value) } }, "Stroke width")} />
              <NumberBox label="Dash" value={node.stroke.dash ?? 0} min={0} onChange={(value) => set({ stroke: { ...node.stroke!, dash: value || undefined } }, "Stroke dash")} />
            </div>
          </>
        )}
        <Field label="Shadow">
          <Select
            value={node.shadow ? "on" : "off"}
            onChange={(event) => set(event.target.value === "on" ? { shadow: { x: 0, y: 2, blur: 8, spread: 0, color: "rgba(23,34,58,0.2)" } } : { shadow: undefined }, "Shadow")}
          >
            <option value="off">None</option>
            <option value="on">Drop shadow</option>
          </Select>
        </Field>
        {node.shadow && (
          <div className="vx-fieldrow">
            <NumberBox label="X" value={node.shadow.x} onChange={(value) => set({ shadow: { ...node.shadow!, x: value } }, "Shadow X")} />
            <NumberBox label="Y" value={node.shadow.y} onChange={(value) => set({ shadow: { ...node.shadow!, y: value } }, "Shadow Y")} />
            <NumberBox label="Blur" value={node.shadow.blur} min={0} onChange={(value) => set({ shadow: { ...node.shadow!, blur: Math.max(0, value) } }, "Shadow blur")} />
          </div>
        )}
      </PanelGroup>

      {node.kind === "text" && node.textStyle && (
        <PanelGroup title="Text">
          <Field label="Content"><TextInput value={node.text ?? ""} onChange={(event) => set({ text: event.target.value }, "Edit text")} /></Field>
          <div className="vx-fieldrow">
            <NumberBox label="Size" value={node.textStyle.size} min={1} onChange={(value) => set({ textStyle: { ...node.textStyle!, size: Math.max(1, value) } }, "Font size")} />
            <NumberBox label="Weight" value={node.textStyle.weight} min={100} max={900} step={50} onChange={(value) => set({ textStyle: { ...node.textStyle!, weight: value } }, "Font weight")} />
            <NumberBox label="Line height" value={node.textStyle.lineHeight} step={0.05} onChange={(value) => set({ textStyle: { ...node.textStyle!, lineHeight: value } }, "Line height")} />
            <NumberBox label="Tracking" value={node.textStyle.letterSpacing} step={0.1} onChange={(value) => set({ textStyle: { ...node.textStyle!, letterSpacing: value } }, "Letter spacing")} />
          </div>
          <ColorBox label="Colour" value={node.textStyle.color} onChange={(value) => set({ textStyle: { ...node.textStyle!, color: value } }, "Text colour")} />
          <Field label="Alignment">
            <Select value={node.textStyle.align} onChange={(event) => set({ textStyle: { ...node.textStyle!, align: event.target.value as "start" | "center" | "end" } }, "Text alignment")}>
              <option value="start">Start</option>
              <option value="center">Centre</option>
              <option value="end">End</option>
            </Select>
          </Field>
          {textContrast !== null && (
            <Notice tone={wcagGrade(textContrast, node.textStyle.size >= 24) === "fail" ? "danger" : "success"} title={`Contrast ${textContrast}:1 against the page`}>
              {wcagGrade(textContrast, node.textStyle.size >= 24) === "fail"
                ? "Below WCAG AA for this size. Darken the text or lighten the page."
                : `Meets WCAG ${wcagGrade(textContrast, node.textStyle.size >= 24)} at ${node.textStyle.size}px.`}
            </Notice>
          )}
        </PanelGroup>
      )}

      {node.kind === "path" && node.path && (
        <PanelGroup title="Path">
          <Properties rows={[
            { label: "Anchors", value: node.path.anchors.length },
            { label: "Contours", value: subpathCount(node.path) },
            { label: "Length", value: `${pathLength(node.path)} px` },
            { label: "Fill rule", value: node.path.fillRule },
          ]} />
          <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id/paths", context.params.id))}>Open the path editor</Button>
        </PanelGroup>
      )}

      {node.kind === "polygon" && (
        <PanelGroup title="Polygon">
          <NumberBox label="Sides" value={node.sides ?? 6} min={3} max={24} onChange={(value) => set({ sides: Math.max(3, Math.round(value)) }, "Polygon sides")} />
        </PanelGroup>
      )}

      <AlignControls handle={handle} />
    </Stack>
  );
}

export function AlignControls({ handle }: { handle: DocHandle<DesignDoc> }) {
  const ui = useStore(designUi);
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const bounds = alignTarget(page, ui.selected);
  const toParent = ui.selected.length === 1 && bounds !== null;
  const modes: { mode: AlignMode; label: string }[] = [
    { mode: "left", label: "Left" }, { mode: "center-x", label: "Centre" }, { mode: "right", label: "Right" },
    { mode: "top", label: "Top" }, { mode: "center-y", label: "Middle" }, { mode: "bottom", label: "Bottom" },
  ];
  const align = (mode: AlignMode) => {
    if (!bounds) return;
    handle.edit((current) => updatePage(current, (p) => patchNodes(p, ui.selected, (node) => {
      const offset = alignOffset(absoluteRect(p, node), bounds, mode);
      return { x: node.x + offset.x, y: node.y + offset.y };
    })), `Align ${mode}`);
  };
  return (
    <PanelGroup title="Align and distribute">
      <Row gap={1} wrap>
        {modes.map((item) => (
          <Button key={item.mode} size="sm" variant="ghost" disabled={!bounds} aria-label={`Align ${item.label.toLowerCase()}${toParent ? " in the parent" : ""}`} onClick={() => align(item.mode)}>{item.label}</Button>
        ))}
      </Row>
      <Row gap={1} wrap>
        {(["x", "y"] as const).map((axis) => (
          <Button
            key={axis}
            size="sm"
            variant="ghost"
            disabled={ui.selected.length < 3}
            onClick={() => handle.edit((current) => updatePage(current, (p) => {
              const offsets = distribute(ui.selected.map((id) => ({ id, rect: absoluteRect(p, p.nodes[id]) })), axis);
              return patchNodes(p, ui.selected, (node) => (axis === "x" ? { x: node.x + (offsets[node.id] ?? 0) } : { y: node.y + (offsets[node.id] ?? 0) }));
            }), `Distribute ${axis}`)}
          >
            Distribute {axis === "x" ? "horizontally" : "vertically"}
          </Button>
        ))}
      </Row>
      {toParent && <p className="vx-mini">One layer aligns inside its parent frame or group.</p>}
      {!bounds && <p className="vx-mini">Select two layers to align (or one inside a frame), three to distribute.</p>}
    </PanelGroup>
  );
}

/* ------------------------------ thumbnail ------------------------------ */

export function DesignThumb({ doc, height = 132, pageId }: { doc: DesignDoc; height?: number; pageId?: string }) {
  const page = pageId ? doc.pages.find((item) => item.id === pageId) ?? doc.pages[0] : doc.pages.find((item) => item.id === doc.activePageId) ?? doc.pages[0];
  const bounds = useMemo(() => {
    const roots = childrenOf(page, page.id);
    if (roots.length === 0) return { x: 0, y: 0, w: 960, h: 540 };
    const rects = roots.map((node) => absoluteRect(page, node));
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    return { x: minX - 8, y: minY - 8, w: Math.max(16, maxX - minX + 16), h: Math.max(16, maxY - minY + 16) };
  }, [page]);
  return (
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      style={{ display: "block", width: "100%", height, background: page.background, borderRadius: "var(--radius-sm)" }}
      role="img"
      aria-label={`${page.name}: ${Object.keys(page.nodes).length} layers`}
      preserveAspectRatio="xMidYMid meet"
    >
      {childrenOf(page, page.id).map((node) => (
        <NodeView key={node.id} page={page} node={node} doc={doc} selected={[]} />
      ))}
    </svg>
  );
}
