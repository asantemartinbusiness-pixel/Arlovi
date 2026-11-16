import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Button, Empty, Kbd, Notice, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";

export const LANES = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "doing", label: "Doing" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
] as const;

export type LaneId = (typeof LANES)[number]["id"];

export function stageOf(task: Rec): LaneId {
  const stage = String(task.fields.stage ?? task.status);
  return (LANES.find((lane) => lane.id === stage)?.id ?? "backlog") as LaneId;
}

/**
 * Task board with a keyboard path that does everything the pointer path does.
 *
 * A card is a button. Left and Right move it between lanes, Up and Down move
 * focus inside a lane, Enter opens the task drawer. The pointer path uses the
 * native drag events; both end in the same `onMove`, so a stage change is one
 * recorded mutation either way.
 */
export function TaskBoard({
  context, tasks, onMove, onOpen,
}: {
  context: ScreenContext;
  tasks: Rec[];
  onMove: (task: Rec, lane: LaneId) => Promise<void> | void;
  onOpen: (task: Rec) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusId) return;
    const node = boardRef.current?.querySelector<HTMLButtonElement>(`[data-card="${CSS.escape(focusId)}"]`);
    node?.focus();
  }, [focusId, tasks]);

  const move = useCallback(async (task: Rec, lane: LaneId) => {
    if (stageOf(task) === lane) return;
    await onMove(task, lane);
    setAnnouncement(`${task.title} moved to ${LANES.find((item) => item.id === lane)?.label}.`);
    setFocusId(task.id);
  }, [onMove]);

  function onCardKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, task: Rec) {
    const lane = stageOf(task);
    const index = LANES.findIndex((item) => item.id === lane);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = LANES[event.key === "ArrowRight" ? Math.min(LANES.length - 1, index + 1) : Math.max(0, index - 1)];
      void move(task, next.id);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const inLane = tasks.filter((item) => stageOf(item) === lane);
      const position = inLane.findIndex((item) => item.id === task.id);
      const target = inLane[event.key === "ArrowDown" ? position + 1 : position - 1];
      if (target) setFocusId(target.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(task);
    }
  }

  if (tasks.length === 0) {
    return <Empty title="No tasks on this board" >Create a task to see it in a lane.</Empty>;
  }

  return (
    <Stack gap={3}>
      <Notice tone="info" title="This board works without a mouse">
        <Row gap={2} wrap>
          <span>Focus a card, then</span>
          <Kbd>←</Kbd><Kbd>→</Kbd><span>to change its stage,</span>
          <Kbd>↑</Kbd><Kbd>↓</Kbd><span>to move within a lane and</span>
          <Kbd>Enter</Kbd><span>to open it. A stage change saves on the task record.</span>
        </Row>
      </Notice>

      <div className="pj-board" ref={boardRef}>
        {LANES.map((lane) => {
          const inLane = tasks.filter((task) => stageOf(task) === lane.id);
          return (
            <section
              key={lane.id}
              className="pj-lane"
              data-over={overLane === lane.id ? "true" : undefined}
              aria-label={`${lane.label}, ${inLane.length} tasks`}
              onDragOver={(event) => { event.preventDefault(); setOverLane(lane.id); }}
              onDragLeave={() => setOverLane((current) => (current === lane.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOverLane(null);
                const task = tasks.find((item) => item.id === dragId);
                setDragId(null);
                if (task) void move(task, lane.id);
              }}
            >
              <header className="pj-lane-head">
                <span className="ds-grow">{lane.label}</span>
                <Pill tone={lane.id === "blocked" ? "danger" : lane.id === "done" ? "success" : "neutral"}>{inLane.length}</Pill>
              </header>
              <div className="pj-lane-body">
                {inLane.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="pj-card"
                    data-card={task.id}
                    data-stage={lane.id}
                    data-priority={String(task.fields.priority ?? "normal")}
                    data-grabbed={dragId === task.id ? "true" : undefined}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => { setDragId(null); setOverLane(null); }}
                    onClick={() => onOpen(task)}
                    onKeyDown={(event) => onCardKeyDown(event, task)}
                    aria-describedby="pj-board-help"
                  >
                    <span className="pj-card-title">{task.title}</span>
                    <span className="ds-subtle">{task.summary}</span>
                    <span className="pj-card-meta">
                      <Avatar name={String(task.fields.assignee ?? task.ownerName)} size="sm" />
                      <span className="ds-subtle">{String(task.fields.assignee ?? task.ownerName)}</span>
                      <span className="ds-grow" />
                      {task.fields.kind === "milestone" && <Pill tone="accent">Milestone</Pill>}
                      {task.dueAt && <span className="ds-subtle ds-num">{context.date(task.dueAt, { day: "numeric", month: "short" })}</span>}
                    </span>
                  </button>
                ))}
                {inLane.length === 0 && <span className="ds-subtle" style={{ padding: "var(--space-2)" }}>Empty</span>}
              </div>
            </section>
          );
        })}
      </div>

      <p id="pj-board-help" className="ds-sr-only">
        Use the left and right arrow keys to change the stage of this task, and the up and down arrow keys to move between tasks in the lane.
      </p>
      <p aria-live="polite" className="ds-sr-only">{announcement}</p>
      {announcement && (
        <Row gap={2}>
          <span className="ds-subtle">{announcement}</span>
          <Button size="sm" variant="ghost" onClick={() => setAnnouncement("")}>Clear</Button>
        </Row>
      )}
    </Stack>
  );
}
