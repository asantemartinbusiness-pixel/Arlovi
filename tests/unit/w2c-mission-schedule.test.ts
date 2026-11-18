import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { barGeometry, dateProblems, dependencyConflicts, isScheduled, scheduleRange, toInput, toStored } from "@/applications/mission/schedule";

function task(id: string, patch: Partial<Rec> = {}, dependsOn: string[] = []): Rec {
  return {
    id, organizationId: "org", collection: "missionTasks", title: id, status: "ready", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, body: { dependsOn }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "x", updatedBy: "x", history: [], ...patch,
  };
}
const deps = (record: Rec) => ((record.body as { dependsOn?: string[] }).dependsOn ?? []);

describe("mission task schedule", () => {
  it("validates dates a person enters", () => {
    expect(dateProblems("", "")).toEqual({ due: "Enter a start date, a due date or both." });
    expect(dateProblems("2026-11-20", "2026-11-18").due).toBe("The due date is before the start date.");
    expect(dateProblems("2026-13-40", "").start).toBe("Use a real date.");
    expect(dateProblems("2026-11-18", "")).toEqual({});
  });

  it("stores whole days and reads them back", () => {
    expect(toStored("2026-11-18", "2026-11-20")).toEqual({ startAt: "2026-11-18T00:00:00.000Z", dueAt: "2026-11-20T23:59:59.000Z" });
    expect(toStored("", "2026-11-20").startAt).toBeUndefined();
    expect(toInput("2026-11-20T23:59:59.000Z")).toBe("2026-11-20");
    expect(isScheduled(task("a"))).toBe(false);
  });

  it("reports a task that starts before its dependency is due, and only for dated pairs", () => {
    const tasks = [
      task("terms", { dueAt: "2026-11-20T23:59:59.000Z" }),
      task("compare", { startAt: "2026-11-19T00:00:00.000Z", dueAt: "2026-11-25T23:59:59.000Z" }, ["terms"]),
      task("decide", { startAt: "2026-11-26T00:00:00.000Z" }, ["compare"]),
      task("undated", {}, ["terms"]),
    ];
    expect(dependencyConflicts(tasks, deps)).toEqual([{ taskId: "compare", dependsOnId: "terms", message: "compare starts before terms is due." }]);
  });

  it("places bars inside the range; a single date is a one-day mark", () => {
    const now = new Date("2026-11-14T09:30:00Z");
    const tasks = [task("a", { startAt: "2026-11-18T00:00:00.000Z", dueAt: "2026-11-28T23:59:59.000Z" }), task("b", { dueAt: "2026-12-10T23:59:59.000Z" })];
    const range = scheduleRange(tasks, undefined, now);
    expect(range.start).toBeLessThan(now.getTime());
    const a = barGeometry(tasks[0], range);
    const b = barGeometry(tasks[1], range);
    expect(a.point).toBe(false);
    expect(b.point).toBe(true);
    expect(a.left).toBeGreaterThan(0);
    expect(a.left + a.width).toBeLessThan(b.left + b.width);
    expect(b.left + b.width).toBeLessThanOrEqual(1);
  });
});
