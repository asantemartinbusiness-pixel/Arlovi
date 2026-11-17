import type { Rec } from "@/domain/types";

/** All times used here are UTC instants. The UI must label UTC fields explicitly.
 * Legal working-time compliance is not inferred from a conflict-free roster. */
export function validShiftInterval(shift: Rec): { start: number; end: number } {
  const start = Date.parse(shift.startAt ?? "");
  const end = Date.parse(shift.endAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("The shift needs a valid start and end time, with the end after the start.");
  }
  if (end - start > 24 * 60 * 60 * 1000) {
    throw new Error("A single roster shift cannot exceed 24 hours.");
  }
  return { start, end };
}

export function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function activeShift(record: Rec): boolean {
  return record.collection === "shifts" && record.fields.kind === "shift"
    && !["cancelled", "deleted", "archived"].includes(record.status);
}

/** Called inside the repository's read-write transaction, not only from React:
 * this catches concurrent browser tabs creating overlapping schedules. */
export function assertRosterIntegrity(input: {
  organizationId: string;
  changes: Rec[];
  roster: Rec[];
  employees: Rec[];
  approvedLeave: Rec[];
  projects: Rec[];
}): void {
  const { organizationId, changes, roster, employees, approvedLeave, projects } = input;
  const changed = changes.filter(activeShift);
  const newIds = new Set(changed.map((record) => record.id));
  const current = [...roster.filter((record) => activeShift(record) && !newIds.has(record.id)), ...changed];
  for (const shift of changed) {
    if (shift.organizationId !== organizationId) throw new Error("A shift belongs to another company.");
    const employeeId = String(shift.fields.employeeId ?? "").trim();
    const employee = employees.find((record) => record.id === employeeId
      && record.collection === "employees" && record.organizationId === organizationId
      && !["alumni", "terminated"].includes(record.status));
    if (!employee) throw new Error("Choose a current employee in this company for the shift.");
    const hours = Number(shift.fields.hours);
    const interval = validShiftInterval(shift);
    if (!Number.isFinite(hours) || hours <= 0 || Math.abs((interval.end - interval.start) / 3_600_000 - hours) > 0.001) {
      throw new Error("Shift hours must be positive and match the recorded start and end.");
    }
    const projectId = String(shift.fields.projectId ?? "").trim();
    if (projectId && !projects.some((row) => row.collection === "projects"
      && row.id === projectId && row.organizationId === organizationId
      && !["cancelled", "archived", "deleted"].includes(row.status))) {
      throw new Error("The linked project is not available in this company.");
    }
    const overlapping = current.find((other) => other.id !== shift.id
      && other.organizationId === organizationId
      && String(other.fields.employeeId ?? "") === employeeId
      && intervalsOverlap(interval, validShiftInterval(other)));
    if (overlapping) throw new Error("This employee already has an overlapping shift. No roster changes were saved.");

    const onLeave = approvedLeave.some((leave) => leave.collection === "leaveRequests"
      && leave.organizationId === organizationId && leave.status === "approved"
      && String(leave.fields.employeeId ?? "") === employeeId
      && Number.isFinite(Date.parse(leave.startAt ?? "")) && Number.isFinite(Date.parse(leave.endAt ?? ""))
      && intervalsOverlap(interval, {
        start: Date.parse(leave.startAt!),
        // Approved leave is stored as an inclusive date range, not an exact shift duration.
        end: Date.parse(leave.endAt!) + 86_400_000,
      }));
    if (onLeave) throw new Error("The employee is on approved leave during this shift.");
  }
}
