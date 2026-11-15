import { useSyncExternalStore } from "react";
import { Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import type { Rec } from "@/domain/types";

/* Shared by the case list panel and the care actions; imports neither. */

export interface CaseFilterValue { priority: string; queue: string; owner: string }
let caseFilterValue: CaseFilterValue = { priority: "", queue: "", owner: "" };
const caseListeners = new Set<() => void>();
export function setCaseFilter(next: CaseFilterValue): void { caseFilterValue = next; caseListeners.forEach((listener) => listener()); }
export function useCaseFilter(): CaseFilterValue {
  return useSyncExternalStore((listener) => { caseListeners.add(listener); return () => caseListeners.delete(listener); }, () => caseFilterValue);
}
export function matchesCase(ticket: Rec, filter: CaseFilterValue): boolean {
  return (!filter.priority || String(ticket.fields.priority ?? "") === filter.priority)
    && (!filter.queue || String(ticket.fields.queue ?? "") === filter.queue)
    && (!filter.owner || (filter.owner === "__none" ? !ticket.fields.assignee : String(ticket.fields.assignee ?? "") === filter.owner));
}


export function caseFilterNow(): CaseFilterValue { return caseFilterValue; }

/** Coaching tab addition: the coaching actually assigned. */
export function CoachingAssignments({ context }: { context: ScreenContext }) {
  const tasks = useCollections(["tasks"]).tasks.filter((task) => task.fields.kind === "coaching");
  if (tasks.length === 0) return <span className="ds-subtle">No coaching is assigned.</span>;
  return (
    <Stack gap={2}>
      {tasks.map((task) => (
        <Row key={task.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
          <span className="ds-grow">{task.title}</span>
          <span className="ds-subtle">{task.dueAt ? `by ${context.date(task.dueAt)}` : ""}</span>
          <Pill>{task.status}</Pill>
        </Row>
      ))}
    </Stack>
  );
}
