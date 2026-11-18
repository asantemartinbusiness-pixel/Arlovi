import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  briefCompleteness, briefOf, briefProblems, canRemoveParticipant, executionSummary, milestoneProblems, milestoneStatus,
  positionIn, roster, timelineRange, type Milestone,
} from "@/applications/mission/brief";

const NOW = new Date("2026-11-14T09:30:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function rec(partial: Partial<Rec> & { id: string }): Rec {
  return {
    organizationId: "org", collection: "missionTasks", title: partial.id, status: "todo", ownerName: "Maya", summary: "", currency: "GBP", tags: [], fields: {},
    createdAt: day(-5), updatedAt: day(-1), revision: 1, createdBy: "Maya", updatedBy: "Maya", history: [], ...partial,
  };
}

const tasks = [
  rec({ id: "t1", fields: { stage: "verified", assignee: "Tomas Reiner", kind: "ai" } }),
  rec({ id: "t2", fields: { stage: "ready", assignee: "Tomas Reiner", kind: "ai" } }),
  rec({ id: "t3", fields: { stage: "todo", assignee: "Maya Chen", kind: "human", approvalRequired: true } }),
];
const ms = (taskIds: string[], due: number): Milestone => ({ id: "m", title: "M", dueAt: day(due), taskIds });

describe("milestones", () => {
  it("is reached only when every linked task is verified", () => {
    expect(milestoneStatus(ms(["t1"], 5), tasks, NOW).state).toBe("reached");
    expect(milestoneStatus(ms(["t1", "t2"], 10), tasks, NOW)).toMatchObject({ state: "on_track", verified: 1, total: 2 });
  });
  it("is at risk near the date and overdue after it", () => {
    expect(milestoneStatus(ms(["t2"], 2), tasks, NOW).state).toBe("at_risk");
    expect(milestoneStatus(ms(["t2"], -1), tasks, NOW).state).toBe("overdue");
    expect(milestoneStatus(ms([], 5), tasks, NOW).state).toBe("empty");
  });
  it("validates name, date and linked tasks", () => {
    expect(Object.keys(milestoneProblems({ title: "", dueDate: "", taskIds: [] }, []))).toEqual(["title", "dueDate", "taskIds"]);
    expect(milestoneProblems({ title: "m", dueDate: "2026-12-01", taskIds: ["t1"] }, [ms(["t1"], 3)])).toHaveProperty("title");
    expect(milestoneProblems({ title: "m", dueDate: "2026-12-01", taskIds: ["t1"] }, [ms(["t1"], 3)], "m")).toEqual({});
  });
});

describe("brief and participants", () => {
  it("falls back to the summary for the objective and measures completeness", () => {
    const brief = briefOf(rec({ id: "m1", collection: "missions", summary: "Qualify a supplier" }));
    expect(brief.objective).toBe("Qualify a supplier");
    expect(briefCompleteness(brief)).toBeCloseTo(0.2);
    expect(Object.keys(briefProblems(brief))).toEqual(["successMeasure"]);
  });
  it("merges explicit participants with task assignees, once each", () => {
    const rows = roster([{ id: "p1", recordId: "mem1", name: "Maya Chen", kind: "human", role: "owner", addedBy: "Maya", addedAt: day(-1) },
      { id: "p2", recordId: "mem2", name: "Jonah", kind: "human", role: "reviewer", addedBy: "Maya", addedAt: day(-1) }], tasks);
    expect(rows.map((row) => [row.name, row.role, row.held])).toEqual([["Maya Chen", "owner", 1], ["Jonah", "reviewer", 0], ["Tomas Reiner", "assignee", 2]]);
    expect(canRemoveParticipant(rows[0])).toMatch(/Holds 1 task/);
    expect(canRemoveParticipant(rows[1])).toBeUndefined();
    expect(canRemoveParticipant(rows[2])).toMatch(/Assigned by a task/);
  });
});

describe("execution summary", () => {
  it("reads status from steps and tasks and never claims model output", () => {
    const mission = rec({ id: "m1", collection: "missions", status: "running", fields: {} });
    const steps = [rec({ id: "s1", status: "done" }), rec({ id: "s2", status: "blocked" })];
    const summary = executionSummary(mission, steps, tasks);
    expect(summary).toMatchObject({ label: "Partly blocked", ranLocally: 1, stoppedAtBoundary: 1, awaitingApproval: 1, aiTasksOpen: 1 });
    expect(summary.lines.join(" ")).toMatch(/never generated/);
    expect(executionSummary({ ...mission, status: "proposed" }, [], tasks).label).toBe("Plan awaiting approval");
    expect(executionSummary({ ...mission, fields: { executionPaused: true } }, steps, tasks).label).toBe("Paused by a person");
  });
  it("places dates on a padded range that includes today", () => {
    const range = timelineRange([ms(["t1"], 10)], day(20), NOW);
    expect(range.start).toBeLessThan(NOW.getTime());
    expect(positionIn(range, day(10))).toBeGreaterThan(positionIn(range, NOW.toISOString()));
    expect(positionIn(range, day(20))).toBeLessThan(1);
  });
});
