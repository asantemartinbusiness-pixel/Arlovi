import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  defaultExploreSpec, displayKey, exploreCsv, exploreCsvCell, inferSchema, matchesFilter, rangeWindow, readExplore, runExplore,
  type ExploreSpec,
} from "@/applications/analytics/explore";

const NOW = new Date("2026-11-14T09:30:00Z");

function rec(id: string, patch: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "org", collection: "invoices", title: id, status: "paid", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "x", updatedBy: "x", history: [], ...patch,
  };
}

const records: Rec[] = [
  rec("a", { amountMinor: 10_000, at: "2026-11-02T10:00:00Z", status: "paid", fields: { hours: 2 } }),
  rec("b", { amountMinor: 5_000, at: "2026-11-10T10:00:00Z", status: "sent", fields: { hours: 3 } }),
  rec("c", { amountMinor: 2_500, at: "2026-06-01T10:00:00Z", status: "paid" }),
  rec("d", { at: "2026-10-20T10:00:00Z", status: "draft" }),
  rec("e", { status: "draft" }),
  rec("z", { collection: "deals", amountMinor: 99_999, at: "2026-11-01T00:00:00Z" }),
];

const base = (patch: Partial<ExploreSpec> = {}): ExploreSpec => ({ ...defaultExploreSpec("invoices"), field: "amountMinor", agg: "sum", ...patch });

describe("explore schema", () => {
  it("reads the fields the collection really carries and types them", () => {
    const schema = inferSchema(records, "invoices");
    const byKey = Object.fromEntries(schema.map((field) => [field.key, field]));
    expect(byKey.amountMinor.type).toBe("money");
    expect(byKey.amountMinor.present).toBe(3);
    expect(byKey.amountMinor.total).toBe(5);
    expect(byKey.at.type).toBe("date");
    expect(byKey["fields.hours"].type).toBe("number");
    expect(byKey.status.values[0]).toBe("paid");
    expect(byKey.dueAt).toBeUndefined();
  });
});

describe("runExplore", () => {
  it("sums one collection only, grouped by status, and leaves missing values out rather than as zero", () => {
    const result = runExplore(base({ groupBy: "status" }), records, NOW);
    expect(result.inCollection).toBe(5);
    expect(result.total).toBe(17_500);
    expect(result.missingValue).toBe(2);
    expect(result.rows.find((row) => row.key === "paid")).toMatchObject({ value: 12_500, count: 2, recordIds: ["a", "c"] });
    expect(result.rows[0].key).toBe("paid");
    expect(result.formula).toBe("sum(invoices.amount) grouped by status");
    expect(result.steps.join(" ")).toMatch(/2 had no value and were left out, not counted as zero/);
  });

  it("applies the date range and reports what it excluded and why", () => {
    const result = runExplore(base({ agg: "count", range: { preset: "30d" } }), records, NOW);
    expect(result.included).toBe(3);
    expect(result.outsideRange).toBe(1);
    expect(result.withoutDate).toBe(1);
    expect(result.steps[1]).toBe("Last 30 days on record date: 3 kept, 1 outside the range, 1 with no date.");
  });

  it("filters, groups by month chronologically and averages", () => {
    const result = runExplore(base({ agg: "avg", groupBy: "month", filters: [{ id: "f", field: "status", op: "is", value: "PAID" }] }), records, NOW);
    expect(result.included).toBe(2);
    expect(result.removedByFilters).toBe(3);
    expect(result.rows.map((row) => row.key)).toEqual(["2026-06", "2026-11"]);
    expect(result.total).toBe(6_250);
    expect(displayKey("2026-06", result.spec)).toBe("Jun 2026");
    expect(result.formula).toBe('avg(invoices.amount) where status is "PAID" grouped by month of record date');
  });

  it("compares money filters in major units against minor-unit amounts", () => {
    expect(matchesFilter(records[0], { id: "f", field: "amountMinor", op: "greater than", value: "99.99" }, "money")).toBe(true);
    expect(matchesFilter(records[0], { id: "f", field: "amountMinor", op: "greater than", value: "100" }, "money")).toBe(false);
    expect(matchesFilter(records[3], { id: "f", field: "amountMinor", op: "is empty", value: "" }, "money")).toBe(true);
  });

  it("reports a non-numeric field, an unknown filter field and mixed currencies as problems", () => {
    expect(runExplore(base({ field: "status" }), records, NOW).problems.join(" ")).toMatch(/is not a number/);
    expect(runExplore(base({ filters: [{ id: "f", field: "fields.nope", op: "is", value: "x" }] }), records, NOW).problems.join(" ")).toMatch(/names a field no invoices record carries/);
    const mixed = [...records, rec("u", { amountMinor: 100, currency: "USD", at: "2026-11-03T00:00:00Z" })];
    expect(runExplore(base(), mixed, NOW).problems.join(" ")).toMatch(/GBP and USD/);
  });

  it("limits drawn groups but keeps them in the total and the CSV", () => {
    const result = runExplore(base({ groupBy: "status", limit: 1 }), records, NOW);
    expect(result.rows).toHaveLength(1);
    expect(result.hiddenGroups).toBe(2);
    expect(result.total).toBe(17_500);
    const csv = exploreCsv(base({ groupBy: "status", limit: 1 }), records, NOW, (value) => String(value));
    expect(csv).toContain('"Source","This workspace\'s records"');
    expect(csv.split("\n").filter((line) => /^"(paid|sent|draft)"/.test(line))).toHaveLength(3);
  });
});

describe("spec storage", () => {
  it("reads a stored spec defensively and computes preset windows", () => {
    expect(readExplore(undefined)).toBeUndefined();
    expect(readExplore({ collection: "deals", agg: "bogus" })).toMatchObject({ collection: "deals", agg: "count", filters: [], limit: 12 });
    expect(rangeWindow({ preset: "ytd" }, NOW).from).toBe("2026-01-01T00:00:00.000Z");
    expect(rangeWindow({ preset: "custom", from: "2026-11-01", to: "2026-11-02" }, NOW)).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-02T23:59:59.999Z" });
    expect(rangeWindow({ preset: "all" }, NOW)).toEqual({});
  });
});

describe("explore CSV and time limits", () => {
  it("guards CSV cells against spreadsheet formula injection", () => {
    expect(exploreCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(exploreCsvCell("+1")).toBe(`"'+1"`);
    expect(exploreCsvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(exploreCsvCell("\tcmd")).toBe(`"'\tcmd"`);
    expect(exploreCsvCell("\rcmd")).toBe(`"'\rcmd"`);
    expect(exploreCsvCell("-2+3")).toBe(`"'-2+3"`);
    expect(exploreCsvCell("-12.5")).toBe(`"-12.5"`);
    expect(exploreCsvCell(-3)).toBe(`"-3"`);
    expect(exploreCsvCell("Paid")).toBe(`"Paid"`);
    const hostile = [rec("x", { status: "=cmd|' /C calc'!A0", amountMinor: 100, at: "2026-11-01T00:00:00Z" })];
    const csv = exploreCsv(base({ groupBy: "status", range: { preset: "all" } }), hostile, NOW, (value) => String(value));
    expect(csv).not.toMatch(/(^|,)"=/m);
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`);
  });

  it("keeps the most recent groups when a time dimension is limited", () => {
    const result = runExplore(base({ agg: "count", groupBy: "month", limit: 2, range: { preset: "all" } }), records.filter((row) => row.at), NOW);
    expect(result.hiddenGroups).toBe(1);
    expect(result.rows.map((row) => row.key)).toEqual(["2026-10", "2026-11"]);
    expect(result.steps.join(" ")).toMatch(/the 2 shown are the most recent, 1 more are in the CSV/);
  });
});
