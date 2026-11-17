import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  dailyCoverage, employeeOnLeave, localDayKey,
  rosterShiftsForDay, rosterWeekDays, shiftDays,
} from "@/applications/hr/rosterView";

const stamp = "2026-11-17T09:00:00.000Z";
function record(id: string, collection: string, fields: Rec["fields"], patch: Partial<Rec> = {}): Rec {
  return {
    id, collection, organizationId: "org-northline", title: id,
    status: "planned", ownerName: "QA", summary: "", currency: "GBP",
    fields, tags: [], createdAt: stamp, updatedAt: stamp, createdBy: "QA", updatedBy: "QA",
    revision: 1, history: [], ...patch,
  };
}
const employee = (id: string) => record(id, "employees", { employment: "full-time" }, { status: "active" });
const shift = (id: string, start: string, end: string, employeeId = "emp-1") =>
  record(id, "shifts", { kind: "shift", employeeId, hours: (Date.parse(end) - Date.parse(start)) / 3_600_000 }, {
    startAt: start, endAt: end,
  });

describe("company-local weekly roster", () => {
  it("builds Monday-to-Sunday dates in the organisation's timezone with stable week offsets", () => {
    expect(rosterWeekDays(new Date("2026-11-17T02:00:00.000Z"), "Europe/London")).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    // The same UTC instant is still Monday in Los Angeles, even though London is Tuesday.
    expect(rosterWeekDays(new Date("2026-11-17T02:00:00.000Z"), "America/Los_Angeles")[0]).toBe("2026-11-16");
    expect(rosterWeekDays(new Date("2026-11-17T02:00:00.000Z"), "Europe/London", 1)[0]).toBe("2026-11-23");
  });

  it("keeps all non-overlapping shifts belonging to the same employee and day", () => {
    const a = shift("a", "2026-11-17T09:00:00.000Z", "2026-11-17T12:00:00.000Z");
    const b = shift("b", "2026-11-17T15:00:00.000Z", "2026-11-17T18:00:00.000Z");
    const c = shift("c", "2026-11-17T10:00:00.000Z", "2026-11-17T13:00:00.000Z", "emp-2");
    expect(rosterShiftsForDay([b, c, a], "emp-1", "2026-11-17", "Europe/London").map((row) => row.id)).toEqual(["a", "b"]);
    expect(dailyCoverage([a, b, c], [employee("emp-1"), employee("emp-2")], "2026-11-17", "Europe/London"))
      .toEqual({ people: 2, shifts: 3 });
  });

  it("shows an overnight shift on each affected local day but not after an exclusive midnight end", () => {
    const night = shift("night", "2026-11-17T23:00:00.000Z", "2026-11-18T03:00:00.000Z");
    expect(shiftDays(night, "Europe/London")).toEqual({ startKey: "2026-11-17", endKey: "2026-11-18" });
    expect(rosterShiftsForDay([night], "emp-1", "2026-11-18", "Europe/London")).toHaveLength(1);
    const midnight = shift("midnight", "2026-11-17T20:00:00.000Z", "2026-11-18T00:00:00.000Z");
    expect(shiftDays(midnight, "Europe/London")?.endKey).toBe("2026-11-17");
    expect(rosterShiftsForDay([midnight], "emp-1", "2026-11-18", "Europe/London")).toEqual([]);
  });

  it("uses location-specific day boundaries across daylight saving transitions", () => {
    expect(localDayKey("2026-03-29T00:30:00.000Z", "Europe/London")).toBe("2026-03-29");
    expect(localDayKey("2026-03-29T23:30:00.000Z", "Europe/London")).toBe("2026-03-30");
    expect(localDayKey("2026-11-17T00:30:00.000Z", "America/Los_Angeles")).toBe("2026-11-16");
  });

  it("shows approved leave without hiding scheduled shifts underneath it", () => {
    const approved = record("leave", "leaveRequests", { employeeId: "emp-1" }, {
      status: "approved", startAt: "2026-11-17T00:00:00.000Z", endAt: "2026-11-17T00:00:00.000Z",
    });
    const scheduled = shift("one", "2026-11-17T11:00:00.000Z", "2026-11-17T15:00:00.000Z");
    expect(employeeOnLeave([approved], "emp-1", "2026-11-17", "Europe/London")).toBe(true);
    expect(rosterShiftsForDay([scheduled], "emp-1", "2026-11-17", "Europe/London")).toHaveLength(1);
  });
});
