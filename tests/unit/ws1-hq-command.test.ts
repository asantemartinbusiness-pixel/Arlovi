import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  checkIns, confidence, decisionLog, decisionsDueForReview, departmentHealth, expectedProgress, keyResults, krProgress,
  newKeyResultId, objectiveProgress, validateKeyResult, withCheckIn,
} from "@/applications/hq/model";

const NOW = new Date("2026-11-14T09:30:00Z");
let n = 0;
function rec(collection: string, title: string, partial: Partial<Rec> = {}): Rec {
  n += 1;
  return {
    id: `${collection}-${n}`, organizationId: "org", collection, title, status: "active", ownerName: "Maya Chen", summary: "",
    currency: "GBP", tags: [], fields: {}, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", revision: 1,
    createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [], ...partial,
  };
}

describe("key results", () => {
  it("measure progress in either direction and clamp it", () => {
    expect(krProgress({ start: 22, current: 18, target: 14 })).toBe(0.5);
    expect(krProgress({ start: 0, current: 5, target: 10 })).toBe(0.5);
    expect(krProgress({ start: 0, current: 15, target: 10 })).toBe(1);
    expect(krProgress({ start: 10, current: 12, target: 0 })).toBe(0);
    expect(krProgress({ start: 3, current: 3, target: 3 })).toBe(1);
  });
  it("reads only well-formed key results from the body", () => {
    const objective = rec("objectives", "o", { body: { keyResults: [{ id: "kr-1", title: "A", start: 0, current: "4", target: 8, unit: "x" }, { title: "no id" }, null] } });
    expect(keyResults(objective)).toEqual([{ id: "kr-1", title: "A", start: 0, current: 4, target: 8, unit: "x", owner: undefined, updatedAt: undefined }]);
    expect(checkIns(objective)).toEqual([]);
  });
  it("averages key results, falling back to the measure with or without a baseline", () => {
    const withKrs = rec("objectives", "o", { body: { keyResults: [{ id: "a", title: "A", start: 0, current: 10, target: 10 }, { id: "b", title: "B", start: 0, current: 0, target: 10 }] } });
    expect(objectiveProgress(withKrs)).toMatchObject({ ratio: 0.5, source: "key results", done: 1, total: 2 });
    expect(objectiveProgress(rec("objectives", "m", { fields: { target: 8, current: 2 } })).ratio).toBe(0.25);
    expect(objectiveProgress(rec("objectives", "d", { fields: { target: 14, current: 19, baseline: 24 } })).ratio).toBe(0.5);
    expect(objectiveProgress(rec("objectives", "z", { fields: { target: 0, current: 2 } })).ratio).toBe(0);
    expect(objectiveProgress(rec("objectives", "none")).source).toBe("none");
  });
  it("applies a check-in only to changed values and names new ids uniquely", () => {
    const list = [{ id: "kr-1", title: "A", start: 0, current: 1, target: 5, unit: "" }, { id: "kr-2", title: "B", start: 0, current: 2, target: 5, unit: "" }];
    const next = withCheckIn(list, { "kr-1": 3, "kr-2": 2 }, "2026-11-14T09:30:00Z");
    expect(next[0]).toMatchObject({ current: 3, updatedAt: "2026-11-14T09:30:00Z" });
    expect(next[1].updatedAt).toBeUndefined();
    expect(newKeyResultId(list)).toBe("kr-3");
    expect(validateKeyResult({ title: "", start: "", target: "1" })).toMatch(/Name/);
    expect(validateKeyResult({ title: "A", start: "", target: "x" })).toMatch(/numeric target/);
    expect(validateKeyResult({ title: "A", start: "", target: "4" })).toBeUndefined();
  });
});

describe("confidence", () => {
  const periodic = (current: number) => rec("objectives", "p", {
    startAt: "2026-10-01T00:00:00Z", dueAt: "2026-12-31T00:00:00Z",
    body: { keyResults: [{ id: "a", title: "A", start: 0, current, target: 100 }] },
  });
  it("compares progress with time elapsed", () => {
    expect(expectedProgress(periodic(0), NOW)).toBeCloseTo(0.49, 2);
    expect(confidence(periodic(50), NOW).value).toBe("on_track");
    expect(confidence(periodic(30), NOW).value).toBe("at_risk");
    expect(confidence(periodic(10), NOW).value).toBe("off_track");
  });
  it("respects the owner's call", () => {
    const manual = rec("objectives", "m", { fields: { confidence: "at_risk", confidenceBy: "Theo Marsh" } });
    expect(confidence(manual, NOW)).toMatchObject({ value: "at_risk", set: "owner", reason: "Set by Theo Marsh" });
  });
});

describe("department health", () => {
  const dept = rec("departments", "Workshop", { fields: { lead: "Theo Marsh" } });
  const members = [rec("members", "Theo Marsh", { fields: { departmentId: dept.id, kind: "human" } }), rec("members", "Bot", { fields: { departmentId: dept.id, kind: "ai" } })];
  it("flags overdue work, high risks and off-track objectives with reasons", () => {
    const tasks = [
      rec("tasks", "late", { dueAt: "2026-11-01T00:00:00Z", fields: { assignee: "Theo Marsh" } }),
      rec("tasks", "done", { status: "done", dueAt: "2026-11-01T00:00:00Z", fields: { assignee: "Theo Marsh" } }),
      rec("tasks", "elsewhere", { dueAt: "2026-11-01T00:00:00Z", fields: { assignee: "Someone Else" } }),
    ];
    const risks = [rec("risks", "brass", { status: "open", fields: { severity: "high", owner: "Theo Marsh" } })];
    const health = departmentHealth(dept, { members, tasks, risks, objectives: [], now: NOW });
    expect(health).toMatchObject({ people: 1, agents: 1, open: 1, overdue: 1, highRisks: 1, status: "attention" });
    expect(health.reasons).toEqual(["1 overdue task", "1 high risk"]);
  });
  it("is steady with nothing outstanding", () => {
    expect(departmentHealth(dept, { members, tasks: [], risks: [], objectives: [], now: NOW }).status).toBe("steady");
    expect(departmentHealth(rec("departments", "No lead"), { members: [], tasks: [], risks: [], objectives: [], now: NOW })).toMatchObject({ status: "watch", reasons: ["no lead assigned"] });
  });
});

describe("decision log", () => {
  it("keeps decisions only, newest first, and finds reviews that are due", () => {
    const old = rec("timelineEvents", "old", { at: "2026-07-01T00:00:00Z", fields: { kind: "decision", reviewBy: "2026-11-01T00:00:00Z" } });
    const recent = rec("timelineEvents", "recent", { at: "2026-10-01T00:00:00Z", fields: { kind: "decision", reviewBy: "2027-01-01T00:00:00Z" } });
    const reviewed = rec("timelineEvents", "reviewed", { at: "2026-09-01T00:00:00Z", fields: { kind: "decision", reviewBy: "2026-10-01T00:00:00Z", reviewedAt: "2026-10-02T00:00:00Z" } });
    const other = rec("timelineEvents", "hire", { at: "2026-11-01T00:00:00Z", fields: { kind: "people" } });
    expect(decisionLog([old, recent, reviewed, other]).map((row) => row.title)).toEqual(["recent", "reviewed", "old"]);
    expect(decisionsDueForReview([old, recent, reviewed, other], NOW).map((row) => row.title)).toEqual(["old"]);
  });
});
