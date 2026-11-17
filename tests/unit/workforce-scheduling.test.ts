import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { assertRosterIntegrity, intervalsOverlap } from "@/domain/scheduling";
import { planShiftMove, planShiftSwap, planTimesheetApprovals, type WorkforceContext } from "@/applications/hr/workforce";
import { buildAttention, filterForRole, mineAttentionItems } from "@/platform/attention";

const at = "2026-11-17T08:00:00.000Z";
const ctx: WorkforceContext = {
  organizationId: "org-northline", currency: "GBP", actor: "Elena Voss",
  now: at, timezone: "Europe/London",
};
function rec(collection: string, id: string, fields: Rec["fields"] = {}, patch: Partial<Rec> = {}): Rec {
  return {
    id, collection, organizationId: ctx.organizationId, title: id,
    status: "active", ownerName: "Elena Voss", summary: "", currency: "GBP",
    fields, tags: [], createdAt: at, updatedAt: at, createdBy: "QA", updatedBy: "QA",
    revision: 2, history: [], ...patch,
  };
}
const people = [rec("employees", "a"), rec("employees", "b"), rec("employees", "c")];
const projects = [rec("projects", "p", {}, { title: "QA Project", status: "planning" })];
const shift = (id: string, employeeId: string, startAt = "2026-11-19T09:00:00.000Z", hours = 8): Rec =>
  rec("shifts", id, { kind: "shift", employeeId, employeeName: employeeId, hours, place: "Workshop",
    timezone: "UTC", projectId: "p" }, {
    title: "Workshop shift", startAt, endAt: new Date(Date.parse(startAt) + hours * 3_600_000).toISOString(),
  });

describe("transactional workforce scheduling", () => {
  it("permits touching time boundaries but rejects overlaps, invalid hours and wrong employees", () => {
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    const a = shift("s1", "a");
    const adjacent = shift("s2", "a", "2026-11-19T17:00:00.000Z", 3);
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [adjacent], roster: [a], employees: people, approvedLeave: [], projects })).not.toThrow();
    const overlapping = shift("s3", "a", "2026-11-19T16:30:00.000Z", 2);
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [overlapping], roster: [a], employees: people, approvedLeave: [], projects })).toThrow(/overlapping shift/);
    const outsider = shift("s4", "unknown");
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [outsider], roster: [], employees: people, approvedLeave: [], projects })).toThrow(/current employee/);
  });

  it("blocks approved leave, foreign projects and missing shift dates", () => {
    const row = shift("s1", "a");
    const leave = rec("leaveRequests", "leave1", { employeeId: "a" }, {
      status: "approved", startAt: "2026-11-19T00:00:00.000Z", endAt: "2026-11-19T00:00:00.000Z",
    });
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [row], roster: [], employees: people, approvedLeave: [leave], projects })).toThrow(/approved leave/);
    const badProject = shift("s2", "a");
    badProject.fields.projectId = "foreign";
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [badProject], roster: [], employees: people, approvedLeave: [], projects })).toThrow(/linked project/);
    const noTime = shift("s3", "a");
    noTime.endAt = undefined;
    expect(() => assertRosterIntegrity({ organizationId: ctx.organizationId,
      changes: [noTime], roster: [], employees: people, approvedLeave: [], projects })).toThrow(/valid start and end/);
  });

  it("plans a shift move preserving history and checking employee + project versions", () => {
    const source = shift("s1", "a");
    const plan = planShiftMove(ctx, source, people[1], [source], [], people, projects,
      { startAt: "2026-11-19T12:00:00.000Z", hours: 4, place: "Showroom", projectId: "p" });
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].fields.employeeId).toBe("b");
    expect(plan.records[0].fields.projectId).toBe("p");
    expect(plan.records[0].fields.locationTimezone).toBe("Europe/London");
    expect(plan.records[0].fields.timezone).toBe("UTC");
    expect(plan.records[0].history[0]?.status).toBe("active");
    expect(plan.records[0].revision).toBe(3);
    expect(plan.expectedRevisions).toEqual({ s1: 2, b: 2, p: 2 });
    expect(source.fields.employeeId).toBe("a");
  });

  it("swaps two shifts as a single plan and rejects a leave conflict", () => {
    const a = shift("s1", "a");
    const b = shift("s2", "b", "2026-11-20T09:00:00.000Z");
    const plan = planShiftSwap(ctx, a, b, [a, b], people, [], projects);
    expect(plan.records.map((row) => row.fields.employeeId)).toEqual(["b", "a"]);
    expect(plan.eventTypes).toEqual(["update", "update"]);
    expect(plan.expectedRevisions).toEqual({ s1: 2, s2: 2, a: 2, b: 2 });
    const leave = rec("leaveRequests", "leave1", { employeeId: "b" }, {
      status: "approved", startAt: "2026-11-19T00:00:00.000Z", endAt: "2026-11-19T00:00:00.000Z",
    });
    expect(() => planShiftSwap(ctx, a, b, [a, b], people, [leave], projects)).toThrow(/approved leave/);
  });
});

describe("timesheet approval and Inbox", () => {
  const time = (id: string, employeeId = "a", projectId = "p") =>
    rec("shifts", id, { kind: "time", employeeId, employeeName: "Alex",
      projectId, hours: 6, approved: false }, { status: "submitted" });

  it("approves a batch once with an auditable reviewer and read-only source revisions", () => {
    const plan = planTimesheetApprovals(ctx, [time("t1"), time("t2", "b")], people, projects);
    expect(plan.records).toHaveLength(2);
    expect(plan.records.every((row) => row.status === "approved" && row.fields.approved === true &&
      row.fields.approvedBy === "Elena Voss" && row.fields.approvedAt === at)).toBe(true);
    expect(plan.expectedRevisions).toEqual({ t1: 2, t2: 2, a: 2, b: 2, p: 2 });
    expect(plan.eventTypes).toEqual(["update", "update"]);
  });

  it("blocks duplicate, approved, orphaned and foreign-project time entries", () => {
    const entry = time("t1");
    expect(() => planTimesheetApprovals(ctx, [entry, entry], people, projects)).toThrow(/selected more than once/);
    entry.fields.approved = true;
    expect(() => planTimesheetApprovals(ctx, [entry], people, projects)).toThrow(/unapproved/);
    expect(() => planTimesheetApprovals(ctx, [time("t2", "missing")], people, projects)).toThrow(/not available/);
    expect(() => planTimesheetApprovals(ctx, [time("t3", "a", "foreign")], people, projects)).toThrow(/not available/);
  });

  it("surfaces only pending People time approvals and routes to the native Timesheets tab", () => {
    const get = (shifts: Rec[]) => buildAttention({
      notifications: [], invoices: [], bills: [], tasks: [], missions: [], approvals: [],
      shifts, orgSlug: "northline", now: new Date(at),
    });
    const entry = time("t1");
    const items = get([entry]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "time-approval-t1", kind: "approval",
      route: "/o/northline/hr/scheduling?tab=Timesheets",
      group: "Time approvals", audience: ["owner", "people"] });
    expect(filterForRole(items, "people")).toHaveLength(1);
    expect(filterForRole(items, "sales")).toHaveLength(0);
    expect(mineAttentionItems(items, "Elena Voss")).toHaveLength(1);
    entry.status = "approved"; entry.fields.approved = true;
    expect(get([entry])).toHaveLength(0);
  });
});
