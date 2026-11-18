import type { Rec, Snapshot } from "@/domain/types";
import { daysBetween } from "@/platform/clock";
import { newRecord } from "@/platform/repo";

/**
 * One quoted CSV cell. Text a spreadsheet would read as a formula (it starts
 * with = + - @, a tab or a carriage return) is prefixed with an apostrophe;
 * plain numbers pass through untouched.
 */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const numeric = typeof value === "number" || /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Pure, reviewable record plans; the caller commits the whole plan with
 * mutations.putMany so a stale revision rolls back every related change. */
export interface PeopleDecisionContext {
  organizationId: string;
  currency: string;
  actor: string;
  now: string;
}

export interface PeopleDecisionPlan {
  records: Rec[];
  messages: string[];
  expectedRevisions: Record<string, number>;
  eventTypes: ("create" | "update")[];
}

function ensureContext(ctx: PeopleDecisionContext): void {
  if (!ctx.organizationId || !ctx.currency || !ctx.actor.trim() || !Number.isFinite(Date.parse(ctx.now))) {
    throw new Error("Company, decision maker and time must be recorded.");
  }
}

function scoped(row: Rec | undefined, collection: string, ctx: PeopleDecisionContext): Rec {
  if (!row || row.organizationId !== ctx.organizationId || row.collection !== collection) {
    throw new Error("The source record is missing, belongs to another company or has the wrong type.");
  }
  return row;
}

function revision(row: Rec, ctx: PeopleDecisionContext, changes: Partial<Rec>): Rec {
  const previous: Snapshot = {
    title: row.title, status: row.status, summary: row.summary,
    fields: { ...row.fields }, body: row.body, amountMinor: row.amountMinor, at: ctx.now,
  };
  return {
    ...row, ...changes,
    id: row.id, collection: row.collection, organizationId: row.organizationId,
    fields: { ...row.fields, ...(changes.fields ?? {}) },
    history: [previous, ...row.history].slice(0, 25),
    revision: row.revision + 1, updatedAt: ctx.now, updatedBy: ctx.actor,
  };
}

export function leaveRequestDays(request: Rec): number {
  const amount = request.startAt && request.endAt
    ? Math.max(1, daysBetween(new Date(request.startAt), new Date(request.endAt)))
    : Number(request.fields.days ?? 1);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("A valid leave duration is required.");
  return amount;
}

export function planLeaveDecision(
  ctx: PeopleDecisionContext,
  requestInput: Rec,
  employeeInput: Rec | undefined,
  decision: "approved" | "declined",
): PeopleDecisionPlan {
  ensureContext(ctx);
  const request = scoped(requestInput, "leaveRequests", ctx);
  if (request.status !== "requested") throw new Error("This leave request has already been decided. Reload before continuing.");
  const annual = String(request.fields.type ?? "annual") === "annual";
  const employeeId = String(request.fields.employeeId ?? "");
  const employee = employeeInput && scoped(employeeInput, "employees", ctx);
  if (employee && (!employeeId || employee.id !== employeeId)) {
    throw new Error("The employee linked to this leave request does not match.");
  }

  const records: Rec[] = [];
  const messages: string[] = [];
  const expectedRevisions: Record<string, number> = { [request.id]: request.revision };
  const days = leaveRequestDays(request);

  if (decision === "approved" && annual) {
    if (!employee || employee.id !== employeeId || employee.status === "alumni") {
      throw new Error("Annual leave requires a current employee record before approval.");
    }
    if (employee.fields.leaveAllowance === undefined) {
      throw new Error("This employee has no recorded leave allowance. Set and verify it before approving annual leave.");
    }
    const allowance = Number(employee.fields.leaveAllowance);
    const taken = Number(employee.fields.leaveTaken ?? 0);
    if (![allowance, taken].every(Number.isFinite) || allowance < 0 || taken < 0 || taken + days > allowance) {
      throw new Error("The requested annual leave exceeds the recorded available allowance.");
    }
    records.push(revision(employee, ctx, {
      fields: { ...employee.fields, leaveTaken: taken + days },
    }));
    messages.push("Annual leave balance updated for " + employee.title + " (" + days + " days)");
    expectedRevisions[employee.id] = employee.revision;
  }

  records.unshift(revision(request, ctx, {
    status: decision,
    fields: { ...request.fields, decidedBy: ctx.actor, decidedAt: ctx.now },
  }));
  messages.unshift("Leave " + decision + " for " + String(request.fields.employeeName ?? request.ownerName) + " by " + ctx.actor);
  return {
    records, messages, expectedRevisions,
    eventTypes: records.map(() => "update" as const),
  };
}

/** Do not create an employee until we have an explicitly recorded acceptance.
 * A matching display name alone is not a reliable person identifier. */
export function planHireApplicant(
  ctx: PeopleDecisionContext,
  applicantInput: Rec,
  existingEmployees: Rec[],
  reason: string,
  acceptanceEvidence: string,
): PeopleDecisionPlan {
  ensureContext(ctx);
  const applicant = scoped(applicantInput, "applicants", ctx);
  const accepted = acceptanceEvidence.trim();
  if (applicant.status === "hired" || applicant.fields.stage === "hired") {
    throw new Error("This application was already hired. Reload the candidate.");
  }
  if (!reason.trim() || !accepted) {
    throw new Error("Record both the hiring decision and evidence of the candidate's acceptance.");
  }
  if (!String(applicant.fields.offerIssuedBy ?? "").trim()) {
    throw new Error("An issued offer must be recorded before hiring.");
  }
  if (Number(applicant.fields.rating ?? 0) <= 0) {
    throw new Error("A completed scorecard is required before hiring.");
  }
  const email = String(applicant.fields.email ?? "").trim().toLowerCase();
  const employees = existingEmployees.filter((row) => row.organizationId === ctx.organizationId && row.collection === "employees");
  const matches = employees.filter((row) =>
    String(row.fields.applicantId ?? "") === applicant.id ||
    (email !== "" && String(row.fields.email ?? "").trim().toLowerCase() === email));
  if (matches.length > 1) throw new Error("Multiple employee records match this applicant. Resolve the duplicate before hiring.");
  const existing = matches[0];
  if (existing && existing.fields.applicantId && existing.fields.applicantId !== applicant.id) {
    throw new Error("The matching employee is linked to another application. Resolve the identity conflict.");
  }
  if (existing?.status === "alumni") throw new Error("An alumni record needs a reviewed rehire process.");

  const employee = existing ?? newRecord({
    organizationId: ctx.organizationId, currency: ctx.currency,
    collection: "employees", title: applicant.title, status: "probation",
    summary: "Created from an accepted offer recorded locally by " + ctx.actor + ". No invitation or contract was sent.",
    startAt: String(applicant.fields.startDate ?? "") || undefined,
    fields: {
      kind: "human",
      title: String(applicant.fields.role ?? ""),
      employment: String(applicant.fields.employment ?? "Not recorded"),
      email,
      manager: String(applicant.fields.manager ?? "Unassigned"),
      office: String(applicant.fields.office ?? "Not recorded"),
      applicantId: applicant.id,
    },
  }, { actor: ctx.actor, now: ctx.now });

  const linkedEmployee = existing
    ? revision(existing, ctx, { fields: { ...existing.fields, applicantId: applicant.id } })
    : employee;
  const decided = revision(applicant, ctx, {
    status: "hired",
    fields: {
      ...applicant.fields,
      stage: "hired",
      employeeId: employee.id,
      offerAcceptedAt: ctx.now,
      offerAcceptedRecordedBy: ctx.actor,
      offerAcceptanceEvidence: accepted,
      decidedBy: ctx.actor,
      decidedAt: ctx.now,
      decisionReason: reason.trim(),
    },
  });
  return {
    records: [decided, linkedEmployee],
    messages: [
      "Applicant " + applicant.title + " hired by " + ctx.actor + " with manually recorded acceptance evidence",
      existing ? "Existing employee " + existing.title + " linked to accepted applicant" : "Employee " + employee.title + " created from accepted applicant",
    ],
    expectedRevisions: { [applicant.id]: applicant.revision, ...(existing ? { [existing.id]: existing.revision } : {}) },
    eventTypes: ["update", existing ? "update" : "create"],
  };
}

/** Create exactly one complete onboarding checklist and bind the employee's
 * launch marker in the same transaction. A concurrent second launch must fail
 * its employee revision check instead of creating duplicate child tasks. */
export function planOnboardingLaunch(
  ctx: PeopleDecisionContext,
  employeeInput: Rec,
  mentorInput: Rec,
  existingTasks: Rec[],
): PeopleDecisionPlan {
  ensureContext(ctx);
  const employee = scoped(employeeInput, "employees", ctx);
  const mentor = scoped(mentorInput, "employees", ctx);
  if (!["active", "probation"].includes(employee.status)) {
    throw new Error("Only a current employee can start an onboarding checklist.");
  }
  if (mentor.status !== "active" || mentor.id === employee.id) {
    throw new Error("Choose an active mentor other than the new starter.");
  }
  if (employee.fields.onboardingLaunchedAt ||
      existingTasks.some((task) => task.organizationId === ctx.organizationId &&
        task.collection === "tasks" && task.fields.kind === "onboarding" &&
        task.fields.employeeId === employee.id)) {
    throw new Error("This employee already has an onboarding checklist. Open the existing steps instead.");
  }
  const roles = [
    { label: "Signed contract reference reviewed", group: "People", assignee: ctx.actor, status: "ready" },
    { label: "Right to work record checked", group: "People", assignee: ctx.actor, status: "ready" },
    { label: "Request workspace sign-in access", group: "IT access", assignee: ctx.actor, status: "waiting" },
    { label: "Payroll inputs reviewed", group: "Finance", assignee: ctx.actor, status: "ready" },
    { label: "Mentor introduction with " + mentor.title, group: "Manager", assignee: mentor.title, status: "ready" },
    { label: "Health and safety learning", group: "Learning", assignee: employee.title, status: "ready" },
  ] as const;
  const updatedEmployee = revision(employee, ctx, {
    fields: { ...employee.fields, mentor: mentor.title, mentorId: mentor.id, onboardingLaunchedAt: ctx.now },
  });
  const tasks = roles.map((step) => newRecord({
    organizationId: ctx.organizationId, currency: ctx.currency,
    collection: "tasks", title: step.label, status: step.status,
    summary: step.group + " checklist step for " + employee.title + ". Completion must be verified on the actual record.",
    parentId: employee.id,
    fields: {
      kind: "onboarding", employeeId: employee.id, stage: step.status,
      assignee: step.assignee, group: step.group,
    },
  }, { actor: ctx.actor, now: ctx.now }));
  return {
    records: [updatedEmployee, ...tasks],
    messages: ["Onboarding checklist launched for " + employee.title + " by " + ctx.actor,
      ...tasks.map((task) => "Onboarding step created: " + task.title)],
    expectedRevisions: { [employee.id]: employee.revision, [mentor.id]: mentor.revision },
    eventTypes: ["update", ...tasks.map(() => "create" as const)],
  };
}
