import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowRight, Check, CircleSlash, Clock, GitBranch, Maximize2, Minus, MousePointer2,
  Plus, ShieldCheck, Trash2, Variable, Zap,
} from "lucide-react";
import {
  Button, Empty, Field, Notice, Pill, Row, Select, Stack, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import {
  CONDITION_OPS, ACTION_KINDS, defaultConfigFor, portsFor,
  type GraphIssue, type NodeKind, type PortId, type StepResult, type WfNode, type WorkflowGraph,
} from "./engine";
import { bindingsAt, checkNodeReferences } from "./schema";
import type { Rec } from "@/domain/types";

export const NODE_WIDTH = 184;
const PORT_TOP = 18;
const PORT_GAP = 22;

export const NODE_KINDS: { id: NodeKind; label: string; hint: string; icon: typeof Zap }[] = [
  { id: "trigger", label: "Trigger", hint: "Starts a run from records in this workspace", icon: Zap },
  { id: "condition", label: "Condition", hint: "Splits the path on a test it evaluates", icon: GitBranch },
  { id: "set", label: "Variable", hint: "Binds a computed number for later steps", icon: Variable },
  { id: "action", label: "Action", hint: "Writes a record, logs, or stops at a provider", icon: MousePointer2 },
  { id: "approval", label: "Approval", hint: "Stops the run until a person decides", icon: ShieldCheck },
  { id: "delay", label: "Delay", hint: "Records a wait a scheduler would honour", icon: Clock },
];

export function nodeIcon(type: NodeKind) {
  const found = NODE_KINDS.find((item) => item.id === type);
  return found ? found.icon : MousePointer2;
}

export function nodeSummary(node: WfNode): string {
  const config = node.config ?? {};
  if (node.type === "trigger") return `${config.event ?? "record.matches"} on ${config.collection ?? "no collection"}`;
  if (node.type === "condition") return `${config.left ?? "?"} ${CONDITION_OPS.find((op) => op.id === config.op)?.label ?? "?"} ${config.right ?? ""}`.trim();
  if (node.type === "set") return `${config.name ?? "value"} = ${config.expr ?? "?"}`;
  if (node.type === "approval") return `Waits for ${config.approvers ?? "nobody yet"}`;
  if (node.type === "delay") return `Holds ${config.minutes ?? 0} minutes`;
  if (config.kind === "provider.call") return `Provider: ${config.capability ?? "none chosen"}`;
  if (config.kind === "record.create") return `Creates a ${config.target ?? "?"} record`;
  return ACTION_KINDS.find((kind) => kind.id === config.kind)?.label ?? "No action chosen";
}

export function nextNodeId(graph: WorkflowGraph): string {
  let n = graph.nodes.length + 1;
  const used = new Set(graph.nodes.map((node) => node.id));
  while (used.has(`n${n}`)) n += 1;
  return `n${n}`;
}

export function addNode(graph: WorkflowGraph, type: NodeKind, label?: string, at?: { x: number; y: number }): WorkflowGraph {
  const id = nextNodeId(graph);
  const name = label ?? NODE_KINDS.find((kind) => kind.id === type)?.label ?? "Step";
  const column = graph.nodes.length % 4;
  const row = Math.floor(graph.nodes.length / 4);
  const node: WfNode = {
    id,
    type,
    label: name,
    x: at?.x ?? 40 + column * 230,
    y: at?.y ?? 60 + row * 150,
    config: defaultConfigFor(type, name),
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function connect(graph: WorkflowGraph, from: string, port: PortId, to: string): WorkflowGraph {
  if (from === to) return graph;
  const exists = graph.edges.some((edge) => edge.from === from && (edge.port ?? "out") === port && edge.to === to);
  if (exists) return graph;
  const withoutSamePort = graph.edges.filter((edge) => !(edge.from === from && (edge.port ?? "out") === port));
  return { ...graph, edges: [...withoutSamePort, { id: `e${graph.edges.length + 1}-${from}-${to}`, from, to, port }] };
}

export function disconnect(graph: WorkflowGraph, from: string, port: PortId): WorkflowGraph {
  return { ...graph, edges: graph.edges.filter((edge) => !(edge.from === from && (edge.port ?? "out") === port)) };
}

export function removeNode(graph: WorkflowGraph, id: string): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
  };
}

/* ====================================================================== *
 * Node palette
 * ====================================================================== */

export function NodePalette({ onAdd, disabled }: { onAdd: (type: NodeKind) => void; disabled?: boolean }) {
  return (
    <div className="auto-palette">
      {NODE_KINDS.map((kind) => {
        const Icon = kind.icon;
        return (
          <button
            key={kind.id}
            type="button"
            className="auto-palette-item"
            aria-disabled={disabled || undefined}
            draggable={!disabled}
            onDragStart={(event) => event.dataTransfer.setData("text/arlovi-node", kind.id)}
            onClick={() => { if (!disabled) onAdd(kind.id); }}
          >
            <Icon size={16} />
            <span>
              <strong>{kind.label}</strong>
              <span>{kind.hint}</span>
            </span>
          </button>
        );
      })}
      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
        Drag a card onto the canvas, or press it to drop the node at the next free slot. Every drag has a keyboard equivalent in the list view.
      </p>
    </div>
  );
}

/* ====================================================================== *
 * Canvas
 * ====================================================================== */

interface CanvasProps {
  graph: WorkflowGraph;
  onChange: (next: WorkflowGraph, note: string) => void;
  selectedId?: string;
  onSelect: (id?: string) => void;
  issues: GraphIssue[];
  steps?: StepResult[];
  readOnly?: boolean;
}

export function GraphCanvas({ graph, onChange, selectedId, onSelect, issues, steps, readOnly }: CanvasProps) {
  const [view, setView] = useState({ x: 16, y: 12, zoom: 1 });
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [pending, setPending] = useState<{ from: string; port: PortId } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  const stepByNode = useMemo(() => {
    const map = new Map<string, StepResult>();
    for (const step of steps ?? []) map.set(step.nodeId, step);
    return map;
  }, [steps]);

  const errorNodes = useMemo(
    () => new Set(issues.filter((issue) => issue.severity === "error" && issue.nodeId).map((issue) => issue.nodeId as string)),
    [issues],
  );

  const announce = useCallback((text: string) => setAnnouncement(text), []);

  function onBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("auto-canvas-layer")) return;
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current) {
      setView((current) => ({
        ...current,
        x: panRef.current!.originX + (event.clientX - panRef.current!.startX),
        y: panRef.current!.originY + (event.clientY - panRef.current!.startY),
      }));
      return;
    }
    if (dragRef.current) {
      const { startX, startY, id } = dragRef.current;
      setDrag({ id, dx: (event.clientX - startX) / view.zoom, dy: (event.clientY - startY) / view.zoom });
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current) {
      panRef.current = null;
      try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    }
    if (dragRef.current && drag) {
      const moved = graph.nodes.find((node) => node.id === dragRef.current!.id);
      if (moved && (Math.abs(drag.dx) > 1 || Math.abs(drag.dy) > 1)) {
        const x = Math.max(0, Math.round((moved.x + drag.dx) / 8) * 8);
        const y = Math.max(0, Math.round((moved.y + drag.dy) / 8) * 8);
        onChange({ ...graph, nodes: graph.nodes.map((node) => (node.id === moved.id ? { ...node, x, y } : node)) }, `${moved.label} moved to ${x}, ${y}`);
        announce(`${moved.label} moved to ${x}, ${y}.`);
      }
    }
    dragRef.current = null;
    setDrag(null);
  }

  function onNodePointerDown(event: ReactPointerEvent<HTMLElement>, node: WfNode) {
    if (readOnly) return;
    event.stopPropagation();
    onSelect(node.id);
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y };
    setDrag({ id: node.id, dx: 0, dy: 0 });
    wrapRef.current?.setPointerCapture(event.pointerId);
  }

  function nudge(node: WfNode, dx: number, dy: number) {
    const x = Math.max(0, node.x + dx);
    const y = Math.max(0, node.y + dy);
    onChange({ ...graph, nodes: graph.nodes.map((item) => (item.id === node.id ? { ...item, x, y } : item)) }, `${node.label} moved to ${x}, ${y}`);
    announce(`${node.label} at ${x}, ${y}.`);
  }

  function onNodeKeyDown(event: KeyboardEvent<HTMLDivElement>, node: WfNode) {
    const stride = event.shiftKey ? 32 : 8;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (readOnly) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") nudge(node, -stride, 0);
      if (event.key === "ArrowRight") nudge(node, stride, 0);
      if (event.key === "ArrowUp") nudge(node, 0, -stride);
      if (event.key === "ArrowDown") nudge(node, 0, stride);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (pending && pending.from !== node.id) {
        onChange(connect(graph, pending.from, pending.port, node.id), `Connected ${pending.from} (${pending.port}) to ${node.label}`);
        announce(`Connected to ${node.label}.`);
        setPending(null);
        return;
      }
      onSelect(node.id);
      announce(`${node.label} selected. Arrow keys move it, c starts a connection, Delete removes it.`);
      return;
    }
    if (event.key.toLowerCase() === "c" && !readOnly) {
      event.preventDefault();
      const port = portsFor(node.type)[0].id;
      setPending({ from: node.id, port });
      announce(`Connecting from ${node.label} (${port}). Move to the target node and press Enter, or press Escape to cancel.`);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
      event.preventDefault();
      onChange(removeNode(graph, node.id), `${node.label} removed`);
      onSelect(undefined);
      announce(`${node.label} removed.`);
      return;
    }
    if (event.key === "Escape" && pending) {
      setPending(null);
      announce("Connection cancelled.");
    }
  }

  const bounds = useMemo(() => {
    const maxX = Math.max(600, ...graph.nodes.map((node) => node.x + NODE_WIDTH + 80));
    const maxY = Math.max(420, ...graph.nodes.map((node) => node.y + 160));
    return { width: maxX, height: maxY };
  }, [graph.nodes]);

  const fitView = useCallback(() => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) { setView({ x: 16, y: 12, zoom: 1 }); return; }
    const zoom = Math.max(0.55, Math.min(1, (box.width - 48) / bounds.width, (box.height - 48) / bounds.height));
    setView({ x: 20, y: 16, zoom });
  }, [bounds]);

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || graph.nodes.length === 0) return;
    fitted.current = true;
    fitView();
  }, [fitView, graph.nodes.length]);

  function portPoint(node: WfNode, port: PortId): { x: number; y: number } {
    const ports = portsFor(node.type);
    const index = Math.max(0, ports.findIndex((item) => item.id === port));
    return { x: node.x + NODE_WIDTH, y: node.y + PORT_TOP + index * PORT_GAP + 8 };
  }

  function nodeAt(id: string): WfNode | undefined {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return undefined;
    if (drag && drag.id === id) return { ...node, x: node.x + drag.dx, y: node.y + drag.dy };
    return node;
  }

  return (
    <Stack gap={2}>
      <div
        ref={wrapRef}
        className="auto-canvas-wrap"
        data-connecting={pending ? "true" : undefined}
        role="application"
        aria-label="Workflow graph canvas. Drag with a pointer, or use the list view for keyboard editing."
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setView((current) => ({ ...current, zoom: Math.min(1.8, Math.max(0.5, current.zoom - event.deltaY * 0.0015)) }));
        }}
        onDragOver={(event) => { if (!readOnly) event.preventDefault(); }}
        onDrop={(event) => {
          if (readOnly) return;
          const type = event.dataTransfer.getData("text/arlovi-node") as NodeKind;
          if (!NODE_KINDS.some((kind) => kind.id === type)) return;
          event.preventDefault();
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          const x = Math.max(0, Math.round(((event.clientX - rect.left - view.x) / view.zoom) / 8) * 8);
          const y = Math.max(0, Math.round(((event.clientY - rect.top - view.y) / view.zoom) / 8) * 8);
          const next = addNode(graph, type, undefined, { x, y });
          onChange(next, `${type} node added`);
          onSelect(next.nodes[next.nodes.length - 1].id);
          announce(`${type} node added at ${x}, ${y}.`);
        }}
      >
        <div className="auto-canvas-bar">
          <Toolbar label="Canvas view">
            <Tool label="Zoom out" icon={<Minus size={15} />} onClick={() => setView((current) => ({ ...current, zoom: Math.max(0.5, current.zoom - 0.1) }))} />
            <span className="ds-num" style={{ fontSize: "var(--text-xs)", minWidth: 42, textAlign: "center" }}>{Math.round(view.zoom * 100)}%</span>
            <Tool label="Zoom in" icon={<Plus size={15} />} onClick={() => setView((current) => ({ ...current, zoom: Math.min(1.8, current.zoom + 0.1) }))} />
            <ToolbarSeparator />
            <Tool label="Fit the graph to the view" icon={<Maximize2 size={15} />} onClick={fitView} />
          </Toolbar>
        </div>

        <div className="auto-canvas-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <svg className="auto-edges" width={bounds.width} height={bounds.height} aria-hidden="true">
            {graph.edges.map((edge) => {
              const from = nodeAt(edge.from);
              const to = nodeAt(edge.to);
              if (!from || !to) return null;
              const start = portPoint(from, edge.port ?? "out");
              const end = { x: to.x - 2, y: to.y + PORT_TOP + 8 };
              const mid = Math.max(40, Math.abs(end.x - start.x) / 2);
              const path = `M ${start.x} ${start.y} C ${start.x + mid} ${start.y}, ${end.x - mid} ${end.y}, ${end.x} ${end.y}`;
              const live = stepByNode.has(edge.from) && stepByNode.has(edge.to);
              return (
                <g key={edge.id ?? `${edge.from}-${edge.to}-${edge.port}`}>
                  <path className="auto-edge" d={path} data-port={edge.port ?? "out"} data-live={live ? "true" : undefined} />
                  {(edge.port === "then" || edge.port === "else" || edge.port === "approved" || edge.port === "rejected") && (
                    <text className="auto-edge-label" x={start.x + 8} y={start.y - 6}>{edge.port}</text>
                  )}
                  {!readOnly && (
                    <path
                      className="auto-edge-hit"
                      d={path}
                      onClick={() => {
                        onChange(disconnect(graph, edge.from, edge.port ?? "out"), `Connection from ${edge.from} removed`);
                        announce("Connection removed.");
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {graph.nodes.map((raw) => {
            const node = nodeAt(raw.id)!;
            const Icon = nodeIcon(node.type);
            const step = stepByNode.get(node.id);
            const ports = portsFor(node.type);
            return (
              <div
                key={node.id}
                className="auto-node"
                data-type={node.type}
                data-selected={selectedId === node.id ? "true" : undefined}
                data-dragging={drag?.id === node.id ? "true" : undefined}
                data-issue={errorNodes.has(node.id) ? "error" : undefined}
                style={{ left: node.x, top: node.y }}
                tabIndex={0}
                role="button"
                aria-label={`${node.type} node ${node.label}. ${nodeSummary(node)}. ${graph.edges.filter((edge) => edge.from === node.id).length} outgoing connections.${step ? ` Last run: ${step.status}.` : ""}`}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onKeyDown={(event) => onNodeKeyDown(event, node)}
                onDoubleClick={() => onSelect(node.id)}
              >
                <span className="auto-node-kind"><Icon size={11} /> {node.type}</span>
                <span className="auto-node-title">{node.label}</span>
                <span className="auto-node-note">{nodeSummary(node)}</span>
                {step && (
                  <span className="auto-node-run">
                    <Pill tone={step.status === "ok" ? "success" : step.status === "failed" ? "danger" : step.status === "blocked" ? "warning" : "info"} dot>{step.status}</Pill>
                  </span>
                )}
                {errorNodes.has(node.id) && <span className="auto-node-note" style={{ color: "var(--danger)" }}>Needs configuration</span>}

                <button
                  type="button"
                  className="auto-port auto-port-in"
                  aria-label={`Input of ${node.label}${pending ? `. Press to connect from ${pending.from}` : ""}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!pending || readOnly) return;
                    onChange(connect(graph, pending.from, pending.port, node.id), `Connected ${pending.from} to ${node.label}`);
                    announce(`Connected to ${node.label}.`);
                    setPending(null);
                  }}
                >
                  {pending && <Check size={9} />}
                </button>

                {ports.map((port, index) => (
                  <button
                    key={port.id}
                    type="button"
                    className="auto-port auto-port-out"
                    style={{ top: PORT_TOP + index * PORT_GAP }}
                    data-active={pending?.from === node.id && pending.port === port.id ? "true" : undefined}
                    aria-label={`${port.label} output of ${node.label}. Press to start a connection.`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (readOnly) return;
                      setPending((current) => (current && current.from === node.id && current.port === port.id ? null : { from: node.id, port: port.id }));
                      announce(`Connecting from ${node.label} ${port.label}. Press an input port, or Escape to cancel.`);
                    }}
                  >
                    <ArrowRight size={9} />
                  </button>
                ))}
              </div>
            );
          })}

          {graph.nodes.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <Empty title="Empty canvas" icon={<Zap size={20} />}>Add a trigger from the palette to start the graph.</Empty>
            </div>
          )}
        </div>

        <p className="auto-canvas-hint">
          {pending
            ? `Connecting from ${graph.nodes.find((node) => node.id === pending.from)?.label ?? pending.from} (${pending.port}). Choose an input port, or press Escape.`
            : "Drag the background to pan, Ctrl and scroll to zoom, drag a node to move it. With a node focused: arrows move, c connects, Delete removes."}
        </p>
      </div>
      <p className="ds-sr-only" role="status" aria-live="polite">{announcement}</p>
    </Stack>
  );
}

/* ====================================================================== *
 * Keyboard equivalent — every canvas gesture as an explicit command
 * ====================================================================== */

export function GraphList({ graph, onChange, selectedId, onSelect, readOnly }: Omit<CanvasProps, "issues" | "steps">) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const [port, setPort] = useState<Record<string, PortId>>({});
  const [announcement, setAnnouncement] = useState("");
  const ordered = useMemo(() => [...graph.nodes].sort((left, right) => (left.y - right.y) || (left.x - right.x)), [graph.nodes]);

  function swap(index: number, delta: number) {
    const other = ordered[index + delta];
    const node = ordered[index];
    if (!other || !node) return;
    onChange({
      ...graph,
      nodes: graph.nodes.map((item) =>
        item.id === node.id ? { ...item, x: other.x, y: other.y }
          : item.id === other.id ? { ...item, x: node.x, y: node.y } : item),
    }, `${node.label} and ${other.label} swapped position`);
    setAnnouncement(`${node.label} swapped with ${other.label}.`);
  }

  if (graph.nodes.length === 0) {
    return <Empty title="No nodes yet" icon={<Zap size={20} />}>Add a trigger from the palette; it appears here as a row with move and connect commands.</Empty>;
  }

  return (
    <Stack gap={2}>
      <Notice tone="info" title="Keyboard equivalent of the canvas">
        Every pointer gesture on the canvas has a command here: order, position, connections and removal. Changes made here show on the canvas immediately.
      </Notice>
      {ordered.map((node, index) => {
        const outgoing = graph.edges.filter((edge) => edge.from === node.id);
        const ports = portsFor(node.type);
        const chosenPort = port[node.id] ?? ports[0].id;
        return (
          <div key={node.id} className="auto-list-row" data-selected={selectedId === node.id ? "true" : undefined}>
            <div>
              <Row gap={2}><Pill tone="neutral">{index + 1}</Pill><strong>{node.label}</strong></Row>
              <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{node.type} · {nodeSummary(node)}</p>
            </div>
            <div className="ds-num" style={{ fontSize: "var(--text-xs)" }}>x {node.x} · y {node.y}</div>
            <div style={{ fontSize: "var(--text-xs)" }}>
              {outgoing.length === 0 ? <span className="ds-subtle">No outgoing connection</span> : outgoing.map((edge) => (
                <Row key={`${edge.from}-${edge.to}-${edge.port}`} gap={2}>
                  <span>{edge.port ?? "out"} → {graph.nodes.find((item) => item.id === edge.to)?.label ?? edge.to}</span>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => { onChange(disconnect(graph, edge.from, edge.port ?? "out"), "Connection removed"); setAnnouncement("Connection removed."); }}>
                      Disconnect
                    </Button>
                  )}
                </Row>
              ))}
            </div>
            <Row gap={1} wrap>
              <Button size="sm" variant="secondary" onClick={() => onSelect(node.id)}>Configure</Button>
              {!readOnly && (
                <>
                  <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => swap(index, -1)}>Move up</Button>
                  <Button size="sm" variant="ghost" disabled={index === ordered.length - 1} onClick={() => swap(index, 1)}>Move down</Button>
                  <Field label={`Connect ${node.label} from`} htmlFor={`port-${node.id}`}>
                    <Select id={`port-${node.id}`} value={chosenPort} onChange={(event) => setPort((current) => ({ ...current, [node.id]: event.target.value as PortId }))}>
                      {ports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="to" htmlFor={`target-${node.id}`}>
                    <Select aria-label="to" id={`target-${node.id}`} value={target[node.id] ?? ""} onChange={(event) => setTarget((current) => ({ ...current, [node.id]: event.target.value }))}>
                      <option value="">Choose a node</option>
                      {graph.nodes.filter((item) => item.id !== node.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </Select>
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!target[node.id]}
                    onClick={() => {
                      const to = target[node.id];
                      if (!to) return;
                      onChange(connect(graph, node.id, chosenPort, to), `Connected ${node.label} (${chosenPort}) to ${graph.nodes.find((item) => item.id === to)?.label ?? to}`);
                      setAnnouncement(`Connected ${node.label} to ${graph.nodes.find((item) => item.id === to)?.label ?? to}.`);
                    }}
                  >
                    Connect
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => { onChange(removeNode(graph, node.id), `${node.label} removed`); setAnnouncement(`${node.label} removed.`); onSelect(undefined); }}>
                    Remove
                  </Button>
                </>
              )}
            </Row>
          </div>
        );
      })}
      <p className="ds-sr-only" role="status" aria-live="polite">{announcement}</p>
    </Stack>
  );
}

/* ====================================================================== *
 * Node inspector
 * ====================================================================== */

export function NodeInspector({
  graph, nodeId, onChange, collections, readOnly, records, lastStep,
}: {
  graph: WorkflowGraph;
  nodeId?: string;
  onChange: (next: WorkflowGraph, note: string) => void;
  collections: string[];
  readOnly?: boolean;
  /** The trigger collection's records; with them every reference is checked. */
  records?: Rec[];
  /** This node's step in the last local test, if it was reached. */
  lastStep?: StepResult;
}) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return <Empty title="No node selected" icon={<MousePointer2 size={20} />}>Choose a node on the canvas or in the list view to edit what it does.</Empty>;
  }
  const config = node.config ?? {};
  const checks = records ? checkNodeReferences(graph, records, node) : [];
  const available = records ? bindingsAt(graph, records, node.id) : [];
  const listId = `auto-bindings-${node.id}`;
  const problemIn = (where: string) => {
    const bad = checks.filter((check) => check.where === where && check.state !== "ok");
    return bad.length ? bad.map((check) => check.message).join(" ") : undefined;
  };
  function patch(next: Partial<WfNode>, note: string) {
    onChange({ ...graph, nodes: graph.nodes.map((item) => (item.id === node!.id ? { ...item, ...next } : item)) }, note);
  }
  function patchConfig(next: Partial<typeof config>, note: string) {
    patch({ config: { ...config, ...next } }, note);
  }
  const op = CONDITION_OPS.find((item) => item.id === (config.op ?? "gt"));

  return (
    <Stack gap={4}>
      <Field label="Label" htmlFor={`label-${node.id}`}>
        <TextInput aria-label="Label" id={`label-${node.id}`} value={node.label} disabled={readOnly} onChange={(event) => patch({ label: event.target.value }, "Node renamed")} />
      </Field>

      {node.type === "trigger" && (
        <>
          <Field label="Collection watched" hint="The trigger reads records from this company only.">
            <Select aria-label="Collection watched" value={config.collection ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ collection: event.target.value }, "Trigger collection changed")}>
              <option value="">Choose a collection</option>
              {collections.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Event">
            <Select aria-label="Event" value={config.event ?? "record.matches"} disabled={readOnly} onChange={(event) => patchConfig({ event: event.target.value as typeof config.event }, "Trigger event changed")}>
              <option value="record.matches">Any record in the collection</option>
              <option value="record.overdue">Record past its due date and not closed</option>
              <option value="schedule">On a schedule</option>
              <option value="webhook">On an inbound webhook</option>
            </Select>
          </Field>
          <Field label="Time zone" hint="Schedules and date tests resolve in this zone.">
            <Select aria-label="Time zone" value={config.timezone ?? "Europe/London"} disabled={readOnly} onChange={(event) => patchConfig({ timezone: event.target.value }, "Trigger time zone changed")}>
              {["Europe/London", "America/New_York", "Europe/Paris", "UTC"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </Select>
          </Field>
          {(config.event === "schedule" || config.event === "webhook") && (
            <Notice tone="warning" title="Nothing is listening">
              A schedule or an inbound webhook needs a server. In this browser the trigger is evaluated only when a run is started by hand; the Trigger configuration screen records what would be registered.
            </Notice>
          )}
        </>
      )}

      {node.type === "condition" && (
        <>
          <Field label="Field" hint="A binding path, for example record.amountMinor or overdueDays. Suggestions are the fields this trigger's records carry." error={problemIn("field")}>
            <TextInput aria-label="Field" list={listId} invalid={Boolean(problemIn("field"))} value={config.left ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ left: event.target.value }, "Condition field changed")} />
          </Field>
          <Field label="Test">
            <Select aria-label="Test" value={config.op ?? "gt"} disabled={readOnly} onChange={(event) => patchConfig({ op: event.target.value as typeof config.op }, "Condition operator changed")}>
              {CONDITION_OPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </Field>
          {op?.needsValue && (
            <Field label="Value">
              <TextInput aria-label="Value" value={config.right ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ right: event.target.value }, "Condition value changed")} />
            </Field>
          )}
          <Notice tone="info" title="Both branches are real">
            The true port and the false port lead to different steps. A condition with no false branch simply ends the run there.
          </Notice>
        </>
      )}

      {node.type === "set" && (
        <>
          <Field label="Variable name">
            <TextInput aria-label="Variable name" value={config.name ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ name: event.target.value }, "Variable renamed")} />
          </Field>
          <Field label="Expression" hint="A number, a binding path, sum/count/avg/max of a path, or a path combined with a number." error={problemIn("expression")}>
            <TextInput aria-label="Expression" invalid={Boolean(problemIn("expression"))} value={config.expr ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ expr: event.target.value }, "Expression changed")} />
          </Field>
        </>
      )}

      {node.type === "action" && (
        <>
          <Field label="What this step does">
            <Select aria-label="What this step does" value={config.kind ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ kind: event.target.value as typeof config.kind }, "Action kind changed")}>
              <option value="">Choose an action</option>
              {ACTION_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </Select>
          </Field>
          {config.kind === "provider.call" && (
            <Field label="Provider capability">
              <Select aria-label="Provider capability" value={config.capability ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ capability: event.target.value }, "Capability changed")}>
                <option value="">Choose a capability</option>
                {["email.send", "payment.capture", "bank.feed", "calendar.sync", "telephony", "model.inference", "site.publish", "tax.file"].map((id) => <option key={id} value={id}>{id}</option>)}
              </Select>
            </Field>
          )}
          {config.kind === "record.create" && (
            <>
              <Field label="Destination collection">
                <Select aria-label="Destination collection" value={config.target ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ target: event.target.value }, "Destination changed")}>
                  <option value="">Choose a collection</option>
                  {collections.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Title template" hint="Use {record.title} or {overdueDays} to insert a binding." error={problemIn("title template")}>
                <TextInput aria-label="Title template" invalid={Boolean(problemIn("title template"))} value={config.titleExpr ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ titleExpr: event.target.value }, "Title template changed")} />
              </Field>
              <Field label="Summary template" error={problemIn("summary template")}>
                <TextInput aria-label="Summary template" invalid={Boolean(problemIn("summary template"))} value={config.summaryExpr ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ summaryExpr: event.target.value }, "Summary template changed")} />
              </Field>
            </>
          )}
          {config.kind === "record.tag" && (
            <Field label="Tag applied">
              <TextInput aria-label="Tag applied" value={config.tag ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ tag: event.target.value }, "Tag changed")} />
            </Field>
          )}
          {config.kind === "log.note" && (
            <Field label="Log line" hint="Bindings in braces are substituted when the step runs." error={problemIn("log line")}>
              <TextInput aria-label="Log line" invalid={Boolean(problemIn("log line"))} value={config.summaryExpr ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ summaryExpr: event.target.value }, "Log line changed")} />
            </Field>
          )}
          <Field label="Retries" hint="Attempts after the first, with exponential backoff recorded on each attempt.">
            <Select aria-label="Retries" value={String(config.retries ?? 0)} disabled={readOnly} onChange={(event) => patchConfig({ retries: Number(event.target.value) }, "Retries changed")}>
              {[0, 1, 2, 3, 5].map((count) => <option key={count} value={count}>{count}</option>)}
            </Select>
          </Field>
          <Field label="On failure">
            <Select aria-label="On failure" value={config.onError ?? "halt"} disabled={readOnly} onChange={(event) => patchConfig({ onError: event.target.value as "halt" | "continue" }, "Failure policy changed")}>
              <option value="halt">Stop the run</option>
              <option value="continue">Record the failure and continue</option>
            </Select>
          </Field>
          <Field label="Impact" hint="A high-impact step never runs from a dry run.">
            <Select aria-label="Impact" value={config.impact ?? "low"} disabled={readOnly} onChange={(event) => patchConfig({ impact: event.target.value as "low" | "high" }, "Impact changed")}>
              <option value="low">Low — reversible in this workspace</option>
              <option value="high">High — would move money or reach a person</option>
            </Select>
          </Field>
        </>
      )}

      {node.type === "approval" && (
        <Field label="Approver" hint="A name or a role. The run stops here until a decision is recorded.">
          <TextInput aria-label="Approver" value={config.approvers ?? ""} disabled={readOnly} onChange={(event) => patchConfig({ approvers: event.target.value }, "Approver changed")} />
        </Field>
      )}

      {node.type === "delay" && (
        <Field label="Minutes held">
          <TextInput aria-label="Minutes held" type="number" min={0} value={String(config.minutes ?? 0)} disabled={readOnly} onChange={(event) => patchConfig({ minutes: Number(event.target.value) }, "Delay changed")} />
        </Field>
      )}

      {checks.some((check) => check.where.startsWith("filter") && check.state !== "ok") ? (
        <Notice tone="danger" title="A trigger filter names an unknown field">
          {checks.filter((check) => check.where.startsWith("filter") && check.state !== "ok").map((check) => `${check.where}: ${check.message}`).join(" ")}
        </Notice>
      ) : null}

      {records && available.length > 0 && (
        <details className="auto-bindings">
          <summary>{available.length} bindings available at this step</summary>
          <datalist id={listId}>{available.map((binding) => <option key={binding.path} value={binding.path} />)}</datalist>
          <ul>
            {available.map((binding) => (
              <li key={binding.path}><code>{binding.path}</code> <span className="ds-subtle">{binding.type} · {binding.note}</span></li>
            ))}
          </ul>
        </details>
      )}

      {lastStep && (
        <div className="auto-laststep" data-status={lastStep.status}>
          <strong>Last local test: {lastStep.status}{lastStep.branch ? ` → ${lastStep.branch === "then" ? "when true" : lastStep.branch === "else" ? "when false" : lastStep.branch}` : ""}</strong>
          <p>{lastStep.message}</p>
        </div>
      )}

      {!readOnly && (
        <Row gap={2} wrap>
          <Button variant="ghost" icon={<CircleSlash size={14} />} onClick={() => onChange(disconnect(graph, node.id, portsFor(node.type)[0].id), "Connection removed")}>
            Clear first connection
          </Button>
          <Button variant="outline-danger" icon={<Trash2 size={14} />} onClick={() => onChange(removeNode(graph, node.id), `${node.label} removed`)}>
            Remove node
          </Button>
        </Row>
      )}
    </Stack>
  );
}
