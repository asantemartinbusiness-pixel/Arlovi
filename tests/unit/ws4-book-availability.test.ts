import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  cancellationFee, capacityConflict, reasonError, resourceCapacity, seatsOf, slotProblems,
} from "@/applications/book/availability";
import { conflictsWithLinks } from "@/applications/book/data";

function rec(id: string, collection: string, fields: Rec["fields"] = {}, extra: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "northline", collection, status: "confirmed", fields, title: id, summary: "", ownerName: "Team", amountMinor: 0,
    currency: "GBP", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", revision: 1, createdBy: "Team",
    updatedBy: "Team", tags: [], history: [], ...extra,
  };
}

const at = (h: number, m = 0) => `2026-12-01T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const booking = (id: string, resourceId: string, from: number, to: number, seats = 1, status = "confirmed") =>
  rec(id, "bookings", { resourceId, seats }, { status, startAt: at(from), endAt: at(to) });

describe("resource capacity", () => {
  it("reads capacity and seats defensively", () => {
    expect(resourceCapacity(rec("r", "resources", { capacity: 6 }))).toBe(6);
    expect(resourceCapacity(rec("r", "resources", { capacity: 0 }))).toBe(1);
    expect(resourceCapacity(undefined)).toBe(1);
    expect(seatsOf(rec("b", "bookings", { seats: "x" }))).toBe(1);
  });

  it("allows concurrent bookings up to capacity, counting seats at the peak", () => {
    const table = rec("table", "resources", { capacity: 4 });
    const bookings = [booking("a", "table", 10, 12, 2), booking("b", "table", 11, 13, 1), booking("c", "table", 10, 11, 1, "cancelled")];
    expect(capacityConflict(bookings, "northline", table, "table", at(11), at(12), undefined, 1)).toBeUndefined();
    expect(capacityConflict(bookings, "northline", table, "table", at(11), at(12), undefined, 2)?.id).toBe("a");
    // a and b never overlap with a 9–10:30 slot beyond a, so 2 seats fit there
    expect(capacityConflict(bookings, "northline", table, "table", at(9), at(10, 30), undefined, 2)).toBeUndefined();
    // ignoring the booking being edited releases its seats
    expect(capacityConflict(bookings, "northline", table, "table", at(11), at(12), "a", 3)).toBeUndefined();
  });

  it("keeps the single-occupancy rule for capacity one and applies capacity through conflictsWithLinks", () => {
    const resources = [rec("room", "resources", { capacity: 1 }), rec("table", "resources", { capacity: 2 })];
    const bookings = [booking("a", "room", 10, 11), booking("b", "table", 10, 11)];
    expect(conflictsWithLinks(bookings, resources, "northline", "room", at(10, 30), at(11, 30))).toHaveLength(1);
    expect(conflictsWithLinks(bookings, resources, "northline", "table", at(10, 30), at(11, 30))).toHaveLength(0);
    expect(conflictsWithLinks(bookings, resources, "northline", "table", at(10, 30), at(11, 30), undefined, 2)).toHaveLength(1);
  });
});

describe("slot validation", () => {
  const hours = { startHour: 9, endHour: 17, days: [1, 2, 3, 4, 5] };
  const now = new Date(2026, 11, 1, 8, 0);

  it("blocks past, reversed, blacked-out and over-capacity slots, and warns outside hours", () => {
    const start = new Date(2026, 11, 1, 10, 0); // Tuesday
    expect(slotProblems({ startAt: start, endAt: new Date(2026, 11, 1, 11, 0), now, hours, seats: 1, capacity: 1 })).toEqual([]);
    const problems = slotProblems({ startAt: new Date(2026, 10, 30, 10), endAt: new Date(2026, 10, 30, 9), now, hours, blackout: { reason: "stocktake" }, seats: 3, capacity: 2 });
    expect(problems.filter((problem) => problem.blocking).map((problem) => problem.kind).sort()).toEqual(["blackout", "capacity", "order", "past"]);
    const late = slotProblems({ startAt: new Date(2026, 11, 1, 16, 30), endAt: new Date(2026, 11, 1, 17, 30), now, hours, seats: 1, capacity: 1 });
    expect(late).toEqual([expect.objectContaining({ kind: "hours", blocking: false })]);
  });
});

describe("reasons and fees", () => {
  it("requires a reason and a note for Other", () => {
    expect(reasonError("", "")).toBeTruthy();
    expect(reasonError("other", "x")).toBeTruthy();
    expect(reasonError("other", "Van broke down")).toBeUndefined();
    expect(reasonError("duplicate", "")).toBeUndefined();
  });

  it("charges the policy fee only inside the notice period", () => {
    const now = new Date("2026-12-01T08:00:00Z");
    expect(cancellationFee({ startAt: "2026-12-01T20:00:00Z", now, noticeHours: 24, feeBp: 5000, priceMinor: 12000 })).toEqual({ insideNotice: true, hoursAway: 12, feeMinor: 6000 });
    expect(cancellationFee({ startAt: "2026-12-03T08:00:00Z", now, noticeHours: 24, feeBp: 5000, priceMinor: 12000 }).feeMinor).toBe(0);
  });
});
