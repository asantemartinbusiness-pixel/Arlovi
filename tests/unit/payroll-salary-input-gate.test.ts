import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { payrollSalaryGaps } from "@/applications/hr/actions";

function employee(id: string, salaryMinor?: unknown, status = "active", employment = "full-time"): Rec {
  const fields: Record<string, unknown> = { employment };
  if (salaryMinor !== undefined) fields.salaryMinor = salaryMinor;
  return {
    id, organizationId: "org-northline", collection: "employees", currency: "GBP",
    title: id, summary: "", status, fields, tags: [], revision: 1, history: [],
    createdAt: "2026-11-17T10:00:00.000Z", updatedAt: "2026-11-17T10:00:00.000Z",
    createdBy: "QA", updatedBy: "QA", ownerName: "QA",
  } as Rec;
}

describe("Payroll salary input validation", () => {
  it("blocks absent, null, blank, negative and nonnumeric salary records", () => {
    const rows = [
      employee("missing"), employee("null", null), employee("blank", ""),
      employee("negative", -100), employee("invalid", "n/a"),
      employee("valid", 5000000), employee("explicit-zero", 0),
    ];
    expect(payrollSalaryGaps(rows).map((row) => row.id))
      .toEqual(["missing", "null", "blank", "negative", "invalid"]);
  });
  it("does not treat historical alumni, terminated staff or contractors as active payroll gaps", () => {
    const rows = [
      employee("alumni", undefined, "alumni"),
      employee("terminated", undefined, "terminated"),
      employee("contractor", undefined, "active", "contractor"),
      employee("current", undefined),
    ];
    expect(payrollSalaryGaps(rows).map((row) => row.id)).toEqual(["current"]);
  });
});
