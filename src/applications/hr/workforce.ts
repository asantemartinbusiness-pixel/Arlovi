import type { Rec, Snapshot } from "@/domain/types";
import { assertRosterIntegrity } from "@/domain/scheduling";

export interface WorkforceContext {
  organizationId: string;
  currency: string;
  actor: string;
  now: string;
  timezone: string;
}

export interface WorkforcePlan {
  records: Rec[];
  messages: string[];
  expectedRevisions: Record<string, number>;
  eventTypes: ("create" | "update")[];
}

function scoped(record: Rec | undefined, collection: string, ctx: WorkforceContext): Rec {
  if (!record || record.organizationId !== ctx.organizationId || record.collection !== collection) {
    throw new Error("The selected record is not available in this company.");
  }
  return record;
}

function revise(record: Rec, ctx: WorkforceContext, patch: Partial<Rec>): Rec {
  const snapshot: Snapshot = {
    title: record.title, status: record.status, summary: record.summary,
    fields: { ...record.fields }, body: record.body, amountMinor: record.amountMinor, at: ctx.now,
  };
  return {
    ...record, ...patch, id: record.id, collection: record.collection, organizationId: record.organizationId,
    fields: { ...record.fields, ...(patch.fields ?? {}) },
    history: [snapshot, ...record.history].slice(0, 25),
    revision: record.revision + 1, updatedAt: ctx.now, updatedBy: ctx.actor,
  };
}

function validHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Enter a positive number of hours, no more than 24 for a single shift or time entry.");
  }
  return hours;
}

function revisionPlan(records: Rec[], original: Rec[], messages: string[],
  readOnly: Rec[] = []): WorkforcePlan {
  if (records.length !== original.length || records.length !== messages.length) {
    throw new Error("The workforce decision plan is incomplete.");
  }
  return {
    records, messages,
    expectedRevisions: Object.fromEntries([...original, ...readOnly].map((row) => [row.id, row.revision])),
    eventTypes: records.map(() => "update" as const),
  };
}

export function planShiftMove(
  ctx: WorkforceContext,
  source: Rec,
  employee: Rec,
  roster: Rec[],
  approvedLeave: Rec[],
  employees: Rec[],
  projects: Rec[],
  changes: { startAt: string; hours: number; place: string; projectId?: string },
): WorkforcePlan {
  const shift = scoped(source, "shifts", ctx);
  const person = scoped(employee, "employees", ctx);
  if (shift.fields.kind !== "shift") throw new Error("Select a roster shift, not a submitted timesheet.");
  const hours = validHours(changes.hours);
  const start = Date.parse(changes.startAt);
  if (!Number.isFinite(start)) throw new Error("Enter a valid shift start date and UTC time.");
  const place = changes.place.trim();
  if (!place) throw new Error("Choose a location for the shift.");
  const projectId = String(changes.projectId ?? "").trim();
  const project = projectId ? scoped(projects.find((row) => row.id === projectId), "projects", ctx) : undefined;
  const next = revise(shift, ctx, {
    title: place + " · " + person.title.split(" ")[0],
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + hours * 3_600_000).toISOString(),
    fields: {
      ...shift.fields, employeeId: person.id, employeeName: person.title,
      place, hours, overtime: hours > 8, timezone: "UTC",
      locationTimezone: ctx.timezone, projectId,
      movedBy: ctx.actor, movedAt: ctx.now,
    },
  });
  assertRosterIntegrity({ organizationId: ctx.organizationId, changes: [next],
    roster, employees, approvedLeave, projects });
  return revisionPlan([next], [shift],
    ["Shift scheduled for " + person.title + " by " + ctx.actor],
    [person, ...(project ? [project] : [])]);
}

export function planShiftSwap(
  ctx: WorkforceContext,
  firstInput: Rec,
  secondInput: Rec,
  roster: Rec[],
  employees: Rec[],
  leave: Rec[],
  projects: Rec[],
): WorkforcePlan {
  const a = scoped(firstInput, "shifts", ctx);
  const b = scoped(secondInput, "shifts", ctx);
  if (a.id === b.id || a.fields.kind !== "shift" || b.fields.kind !== "shift"
    || a.fields.employeeId === b.fields.employeeId) throw new Error("Choose two different employees' roster shifts.");
  const employeeA = scoped(employees.find((x) => x.id === a.fields.employeeId), "employees", ctx);
  const employeeB = scoped(employees.find((x) => x.id === b.fields.employeeId), "employees", ctx);
  const nextA = revise(a, ctx, {
    fields: { ...a.fields, employeeId: employeeB.id, employeeName: employeeB.title,
      swappedBy: ctx.actor, swappedAt: ctx.now },
  });
  const nextB = revise(b, ctx, {
    fields: { ...b.fields, employeeId: employeeA.id, employeeName: employeeA.title,
      swappedBy: ctx.actor, swappedAt: ctx.now },
  });
  assertRosterIntegrity({ organizationId: ctx.organizationId, changes: [nextA, nextB],
    roster, employees, approvedLeave: leave, projects });
  return revisionPlan([nextA, nextB], [a, b],
    ["Shift swapped to " + employeeB.title + " by " + ctx.actor,
      "Shift swapped to " + employeeA.title + " by " + ctx.actor],
    [employeeA, employeeB]);
}

export function planTimesheetApprovals(
  ctx: WorkforceContext, requested: Rec[], employees: Rec[], projects: Rec[],
): WorkforcePlan {
  if (!requested.length) throw new Error("Select a submitted timesheet before approving hours.");
  const byId = new Set<string>();
  const updated: Rec[] = [];
  const readOnly = new Map<string, Rec>();
  for (const entryInput of requested) {
    const entry = scoped(entryInput, "shifts", ctx);
    if (byId.has(entry.id)) throw new Error("The same time entry was selected more than once.");
    byId.add(entry.id);
    if (entry.fields.kind !== "time" || entry.fields.approved === true || entry.status === "approved"
      || !["submitted", "pending", "ready"].includes(entry.status)) {
      throw new Error("Only submitted, unapproved time entries can be approved.");
    }
    validHours(Number(entry.fields.hours));
    const employee = scoped(employees.find((row) => row.id === entry.fields.employeeId), "employees", ctx);
    if (["alumni", "terminated"].includes(employee.status)) {
      throw new Error("A former employee's time entry needs manual verification before approval.");
    }
    readOnly.set(employee.id, employee);
    const projectId = String(entry.fields.projectId ?? "").trim();
    if (projectId) {
      const project = scoped(projects.find((row) => row.id === projectId), "projects", ctx);
      readOnly.set(project.id, project);
    }
    updated.push(revise(entry, ctx, {
      status: "approved",
      fields: { ...entry.fields, approved: true, approvedBy: ctx.actor, approvedAt: ctx.now },
    }));
  }
  return revisionPlan(updated, requested,
    requested.map((row) => "Time entry of " + String(row.fields.hours) + "h approved by " + ctx.actor),
    [...readOnly.values()]);
}
