import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  planHireApplicant, planLeaveDecision, planOnboardingLaunch, leaveRequestDays,
  type PeopleDecisionContext,
} from "@/applications/hr/decisions";

const now = "2026-11-17T01:00:00.000Z";
const ctx: PeopleDecisionContext = { organizationId: "org-northline", currency: "GBP", actor: "Elena Voss", now };

function row(collection: string, id: string, status: string, fields: Rec["fields"] = {}): Rec {
  return {
    id, collection, organizationId: ctx.organizationId, title: id,
    status, ownerName: "Maya Chen", summary: "Original summary", currency: "GBP",
    fields, tags: [], createdAt: now, updatedAt: now, createdBy: "QA", updatedBy: "QA",
    revision: 3, history: [], parentId: undefined,
  };
}

describe("atomic leave decisions", () => {
  const request = () => row("leaveRequests", "leave-1", "requested", {
    employeeId: "employee-1", employeeName: "Alex Example", type: "annual", days: 3,
  });
  const employee = () => row("employees", "employee-1", "active", { leaveAllowance: 25, leaveTaken: 10 });

  it("constructs one revision-checked batch with request and annual balance", () => {
    const plan = planLeaveDecision(ctx, request(), employee(), "approved");
    expect(plan.records).toHaveLength(2);
    expect(plan.records[0].status).toBe("approved");
    expect(plan.records[1].fields.leaveTaken).toBe(13);
    expect(plan.expectedRevisions).toEqual({ "leave-1": 3, "employee-1": 3 });
    expect(plan.records.map((r) => r.revision)).toEqual([4, 4]);
    expect(plan.records.every((r) => r.history[0]?.status === (r.id === "leave-1" ? "requested" : "active"))).toBe(true);
    expect(plan.eventTypes).toEqual(["update", "update"]);
  });

  it("declines once without altering an annual balance or creating an employee", () => {
    const plan = planLeaveDecision(ctx, request(), undefined, "declined");
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].status).toBe("declined");
    expect(plan.expectedRevisions).toEqual({ "leave-1": 3 });
    expect(() => planLeaveDecision(ctx, plan.records[0], undefined, "declined")).toThrow(/already been decided/);
  });

  it("blocks unknown, foreign and insufficient employee allowances", () => {
    expect(() => planLeaveDecision(ctx, request(), undefined, "approved")).toThrow(/requires a current employee/);
    const noAllowance = employee();
    delete noAllowance.fields.leaveAllowance;
    expect(() => planLeaveDecision(ctx, request(), noAllowance, "approved")).toThrow(/no recorded leave allowance/);
    const little = employee();
    little.fields.leaveTaken = 24;
    expect(() => planLeaveDecision(ctx, request(), little, "approved")).toThrow(/exceeds the recorded/);
    const foreign = employee();
    foreign.organizationId = "org-harbor";
    expect(() => planLeaveDecision(ctx, request(), foreign, "approved")).toThrow(/wrong type|another company/);
  });

  it("does not deduct annual leave when approving another leave type", () => {
    const req = request();
    req.fields.type = "sick";
    const plan = planLeaveDecision(ctx, req, employee(), "approved");
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0].status).toBe("approved");
    expect(leaveRequestDays(req)).toBe(3);
  });
});

describe("atomic recruitment-to-employee handoff", () => {
  const applicant = () => row("applicants", "candidate-1", "active", {
    stage: "offer", rating: 4, offerIssuedBy: "Elena Voss",
    email: "alex@example.test", role: "Designer",
    consentUntil: "2027-01-01", source: "Recruitment",
  });

  it("creates an employee and preserves every original candidate field with acceptance evidence", () => {
    const plan = planHireApplicant(ctx, applicant(), [], "Meets the role criteria", "Accepted by email on 16 Nov");
    expect(plan.records.map((rec) => rec.collection)).toEqual(["applicants", "employees"]);
    expect(plan.records[0].fields.stage).toBe("hired");
    expect(plan.records[0].fields.source).toBe("Recruitment");
    expect(plan.records[0].fields.consentUntil).toBe("2027-01-01");
    expect(plan.records[0].fields.offerAcceptanceEvidence).toBe("Accepted by email on 16 Nov");
    expect(plan.records[0].fields.employeeId).toBe(plan.records[1].id);
    expect(plan.records[1].fields.applicantId).toBe("candidate-1");
    expect(plan.records[1].fields.salaryMinor).toBeUndefined();
    expect(plan.records[1].fields.leaveAllowance).toBeUndefined();
    expect(plan.eventTypes).toEqual(["update", "create"]);
    expect(plan.expectedRevisions).toEqual({ "candidate-1": 3 });
  });

  it("links by verified applicant ID or email, not the display name", () => {
    const sameName = row("employees", "employee-other", "active", { email: "different@example.test" });
    sameName.title = "candidate-1";
    const plan = planHireApplicant(ctx, applicant(), [sameName], "Approved", "Confirmed response");
    expect(plan.records[1].id).not.toBe(sameName.id);

    const match = row("employees", "employee-linked", "active", { email: "alex@example.test" });
    const linked = planHireApplicant(ctx, applicant(), [match], "Approved", "Confirmed response");
    expect(linked.records[1].id).toBe("employee-linked");
    expect(linked.eventTypes).toEqual(["update", "update"]);
    expect(linked.expectedRevisions["employee-linked"]).toBe(3);
  });

  it("rejects missing manual acceptance, missing scorecard, mismatches and duplicate identities", () => {
    expect(() => planHireApplicant(ctx, applicant(), [], "Approved", "")).toThrow(/acceptance/);
    const missingScore = applicant();
    missingScore.fields.rating = 0;
    expect(() => planHireApplicant(ctx, missingScore, [], "Approved", "Accepted")).toThrow(/scorecard/);
    const other = row("employees", "employee-other", "active", { email: "alex@example.test", applicantId: "different-candidate" });
    expect(() => planHireApplicant(ctx, applicant(), [other], "Approved", "Accepted")).toThrow(/another application/);
    const twin = row("employees", "employee-second", "active", { email: "alex@example.test" });
    expect(() => planHireApplicant(ctx, applicant(), [other, twin], "Approved", "Accepted")).toThrow(/Multiple employee/);
    const hired = applicant();
    hired.status = "hired";
    expect(() => planHireApplicant(ctx, hired, [], "Approved", "Accepted")).toThrow(/already hired/);
  });
});

describe("single-transaction onboarding checklists", () => {
  const starter = () => row("employees", "employee-starter", "probation", { employment: "full-time" });
  const mentor = () => row("employees", "employee-mentor", "active", { email: "mentor@example.test" });

  it("creates all six tasks and an employee launch marker in one guarded plan", () => {
    const plan = planOnboardingLaunch(ctx, starter(), mentor(), []);
    expect(plan.records).toHaveLength(7);
    expect(plan.records[0].fields.mentorId).toBe("employee-mentor");
    expect(plan.records[0].fields.onboardingLaunchedAt).toBe(ctx.now);
    expect(plan.records[0].revision).toBe(4);
    expect(plan.records.slice(1).every((task) => task.collection === "tasks" &&
      task.parentId === "employee-starter" && task.fields.employeeId === "employee-starter")).toBe(true);
    expect(plan.eventTypes).toEqual(["update", ...Array(6).fill("create")]);
    expect(plan.expectedRevisions).toEqual({ "employee-starter": 3, "employee-mentor": 3 });
    const access = plan.records.find((task) => task.fields.group === "IT access");
    expect(access?.status).toBe("waiting");
    expect(access?.title).not.toContain("granted");
  });

  it("rejects relaunch, self-mentoring and foreign mentors without any records", () => {
    const begun = starter();
    begun.fields.onboardingLaunchedAt = ctx.now;
    expect(() => planOnboardingLaunch(ctx, begun, mentor(), [])).toThrow(/already has/);
    const existing = row("tasks", "onboard-task", "ready", { kind: "onboarding", employeeId: "employee-starter" });
    expect(() => planOnboardingLaunch(ctx, starter(), mentor(), [existing])).toThrow(/already has/);
    const self = starter();
    self.status = "active";
    expect(() => planOnboardingLaunch(ctx, self, self, [])).toThrow(/other than/);
    const otherOrg = mentor();
    otherOrg.organizationId = "org-harbor";
    expect(() => planOnboardingLaunch(ctx, starter(), otherOrg, [])).toThrow(/another company/);
  });
});
