import type { CSSProperties, ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button, KeyValueList, Notice, OverlayActions, Pill, Row, Stack } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById, type ProviderCapability } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { downloadFile } from "@/runtime/db";
import "./kit.css";

/* ====================================================================== *
 * Team 6 kit — primitives shared by the five platform applications.
 * Nothing here belongs in the design system: it is specific to builders
 * (reorderable canvases, provider-boundary copy, export helpers).
 * ====================================================================== */

/* ------------------------- Overlay footer ------------------------- */

export function submitFooter(formId: string, label: string) {
  return function Footer({ close }: { close: () => void }) {
    return (
      <OverlayActions
        primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
        end={<Button variant="ghost" onClick={close}>Cancel</Button>}
      />
    );
  };
}

/** Confirmation footer: [Cancel] … [Confirm], for dialogs that ask before doing something hard to undo. */
export function confirmFooter(formId: string, label: string, tone: "primary" | "danger" = "primary") {
  return function Footer({ close }: { close: () => void }) {
    return (
      <OverlayActions
        variant="confirm"
        primary={<Button variant={tone} type="submit" form={formId}>{label}</Button>}
        end={<Button variant="ghost" onClick={close}>Cancel</Button>}
      />
    );
  };
}

export function closeFooter(label = "Close") {
  return function Footer({ close }: { close: () => void }) {
    return (
      <>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={close}>{label}</Button>
      </>
    );
  };
}

/* ------------------------- Provider boundary ------------------------- */

export function CapabilityState({ id }: { id: string }) {
  const capability = capabilityById(id);
  if (!capability) return <Pill tone="warning">Not connected</Pill>;
  return <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>;
}

/** The honest boundary block: what the provider would do, what happened instead. */
export function BoundaryNotice({
  id, action, tone = "warning", children,
}: { id: string; action: string; tone?: "warning" | "info"; children?: ReactNode }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return (
    <Notice tone={tone} title={`${action} stops at the ${capability.provider.toLowerCase()} boundary`}>
      <p>{capability.note}</p>
      <p style={{ marginBlockStart: 4 }}><strong>Kept here instead:</strong> {capability.localEquivalent}</p>
      {children}
    </Notice>
  );
}

export function CapabilityCard({ capability, scopes }: { capability: ProviderCapability; scopes: string[] }) {
  return (
    <Stack gap={3}>
      <KeyValueList items={[
        { label: "Provider", value: capability.provider },
        { label: "State", value: <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill> },
        { label: "Would enable", value: capability.label },
        { label: "Done locally", value: capability.localEquivalent },
        { label: "Scopes it would need", value: scopes.length ? scopes.join(", ") : "No scope model published" },
      ]} />
      <p className="ds-subtle">{capability.note}</p>
    </Stack>
  );
}

/* ------------------------- Reordering ------------------------- */

export function ReorderArea({
  ids, onDragEnd, children, label,
}: { ids: string[]; onDragEnd: (event: DragEndEvent) => void; children: ReactNode; label: string }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements: {
      onDragStart: ({ active }) => `Picked up ${String(active.id)}. Use the arrow keys to move it, space to drop.`,
      onDragOver: () => undefined,
      onDragEnd: ({ active, over }) => (over ? `Dropped ${String(active.id)} onto ${String(over.id)}.` : `Dropped ${String(active.id)}.`),
      onDragCancel: ({ active }) => `Cancelled moving ${String(active.id)}.`,
    } }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div role="list" aria-label={label} className="t6-reorder">{children}</div>
      </SortableContext>
    </DndContext>
  );
}

export interface RowHandle {
  style: CSSProperties;
  dragging: boolean;
  setRef: (node: HTMLElement | null) => void;
  handle: ReactNode;
}

/** One sortable row. Pointer drag, dnd-kit keyboard sensor, and explicit move buttons. */
export function SortableRow({
  id, name, index, count, onMove, children, selected, onSelect, plain,
}: {
  id: string; name: string; index: number; count: number;
  onMove: (from: number, to: number) => void;
  children: (handle: RowHandle) => ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  /** Transparent chrome, for a row that already draws its own surface. */
  plain?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined };
  const handle = (
    <Row gap={1} className="t6-handle-row">
      <button
        type="button"
        className="t6-grip"
        aria-label={`Reorder ${name}. Press space, then use the arrow keys.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp size={14} aria-hidden="true" />
      </Button>
      <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown size={14} aria-hidden="true" />
      </Button>
    </Row>
  );
  return (
    <div
      role="listitem"
      ref={setNodeRef}
      style={style}
      className="t6-sortable"
      data-plain={plain ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
    >
      {children({ style, dragging: isDragging, setRef: setNodeRef, handle })}
    </div>
  );
}

/** A palette entry: click inserts at the insertion point, drag drops at a position. */
export function PaletteChip({
  type, label, hint, icon, onInsert,
}: { type: string; label: string; hint?: string; icon?: ReactNode; onInsert: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { palette: type } });
  return (
    <div className="t6-palette-item" ref={setNodeRef} data-dragging={isDragging ? "true" : undefined}>
      <button type="button" className="t6-palette-grip" aria-label={`Drag ${label} onto the canvas`} {...attributes} {...listeners}>
        <GripVertical size={13} aria-hidden="true" />
      </button>
      <button type="button" className="t6-palette-insert" aria-label={`Insert ${label}`} onClick={onInsert}>
        <span className="t6-palette-icon" aria-hidden="true">{icon}</span>
        <span className="ds-grow">
          <strong>{label}</strong>
          {hint && <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{hint}</span>}
        </span>
      </button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/* ------------------------- Export helpers ------------------------- */

export function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  downloadFile(filename, toCsv(header, rows), "text/csv");
}

export function downloadJson(filename: string, value: unknown): void {
  downloadFile(filename, JSON.stringify(value, null, 2), "application/json");
}

export { downloadFile };

/* ------------------------- Misc ------------------------- */

export function plural(count: number, noun: string, plural?: string): string {
  return `${count} ${count === 1 ? noun : plural ?? `${noun}s`}`;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

export function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="t6-minifield">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Stable per-screen record resolution: the route id, else the first record. */
export function pickRecord<T extends { id: string }>(rows: T[], id: string | undefined): T | undefined {
  return rows.find((row) => row.id === id) ?? rows[0];
}

export function screenHref(context: ScreenContext, suffix: string): string {
  return `/o/${context.org.slug}${suffix}`;
}
