import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { runWorkflow, type WorkflowGraph } from "@/applications/auto/engine";
import {
  ancestorsOf, bindingsAt, checkNodeReferences, closest, describePath, recordFields, referenceIssues, referencesOf, sampleOptions,
} from "@/applications/auto/schema";
import { validateWorkflow } from "@/applications/auto/validate";

const NOW = new Date("2026-11-14T09:30:00Z");

function rec(id: string, patch: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "org", collection: "invoices", title: id, status: "sent", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "x", updatedBy: "x", history: [], ...patch,
  };
}

const records: Rec[] = [
  rec("inv-old", { title: "INV-1", amountMinor: 50_000, dueAt: "2026-10-01T00:00:00Z", fields: { reminderCount: 2 } }),
  rec("inv-new", { title: "INV-2", amountMinor: 10_000, dueAt: "2026-11-10T00:00:00Z" }),
  rec("inv-paid", { title: "INV-3", amountMinor: 7_000, status: "paid", dueAt: "2026-09-01T00:00:00Z" }),
];

function graph(): WorkflowGraph {
  return {
    nodes: [
      { id: "t", type: "trigger", label: "Overdue invoice", x: 0, y: 0, config: { collection: "invoices", event: "record.overdue" } },
      { id: "s", type: "set", label: "Total", x: 0, y: 0, config: { name: "atRisk", expr: "sum(trigger.matched.amountMinor)" } },
      { id: "c", type: "condition", label: "Older than 7 days", x: 0, y: 0, config: { left: "overdueDays", op: "gt", right: "7" } },
      { id: "a", type: "action", label: "Draft letter", x: 0, y: 0, config: { kind: "record.create", target: "messages", titleExpr: "Chase {record.title}", summaryExpr: "{atRisk} at risk" } },
      { id: "l", type: "action", label: "Log", x: 0, y: 0, config: { kind: "log.note", summaryExpr: "{record.title} is recent" } },
    ],
    edges: [
      { from: "t", to: "s", port: "out" },
      { from: "s", to: "c", port: "out" },
      { from: "c", to: "a", port: "then" },
      { from: "c", to: "l", port: "else" },
    ],
  };
}

describe("trigger schema", () => {
  it("lists the fields the trigger's records actually carry", () => {
    const paths = recordFields(graph(), records).map((field) => field.path);
    expect(paths).toContain("record.amountMinor");
    expect(paths).toContain("record.reminderCount");
    expect(paths).not.toContain("record.startAt");
    const reminder = recordFields(graph(), records).find((field) => field.path === "record.reminderCount");
    expect(reminder).toMatchObject({ type: "number", coverage: { present: 1, total: 3 } });
  });

  it("binds a variable only after the node that sets it", () => {
    const g = graph();
    expect([...ancestorsOf(g, "a")].sort()).toEqual(["c", "s", "t"]);
    expect(bindingsAt(g, records, "a").map((binding) => binding.path)).toContain("atRisk");
    expect(bindingsAt(g, records, "s").map((binding) => binding.path)).not.toContain("atRisk");
    expect(bindingsAt(g, records, "s").map((binding) => binding.path)).toContain("trigger.matched.amountMinor");
  });

  it("extracts references from conditions, expressions, templates and filters", () => {
    const g = graph();
    expect(referencesOf(g.nodes[1])).toEqual([{ path: "trigger.matched.amountMinor", where: "expression" }]);
    expect(referencesOf(g.nodes[3]).map((ref) => ref.path)).toEqual(["record.title", "atRisk"]);
    expect(referencesOf({ ...g.nodes[0], config: { ...g.nodes[0].config, filters: [{ field: "record.status", op: "neq", value: "paid" }] } })).toEqual([{ path: "record.status", where: "filter 1" }]);
  });
});

describe("reference validation", () => {
  it("accepts a well-formed graph", () => {
    expect(referenceIssues(graph(), records)).toEqual([]);
  });

  it("reports an unknown field with the nearest real one", () => {
    const g = graph();
    g.nodes[2].config = { left: "record.amountMinr", op: "gt", right: "0" };
    const [check] = checkNodeReferences(g, records, g.nodes[2]);
    expect(check.state).toBe("unknown");
    expect(check.suggestion).toBe("record.amountMinor");
    expect(validateWorkflow(g, records).some((issue) => issue.severity === "error" && issue.nodeId === "c")).toBe(true);
  });

  it("reports a variable used before the node that binds it", () => {
    const g = graph();
    g.nodes[1].config = { name: "atRisk", expr: "atRisk * 2" };
    const [check] = checkNodeReferences(g, records, g.nodes[1]);
    expect(check.state).toBe("unbound");
    expect(check.message).toMatch(/does not run before this step/);
  });

  it("cannot check a record field with no records, and says so rather than erroring", () => {
    const issues = referenceIssues(graph(), []);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(validateWorkflow(graph(), []).filter((issue) => issue.id.startsWith("ref-"))).toEqual([]);
  });

  it("suggests only near matches", () => {
    expect(closest("overdueDay", ["overdueDays", "now"])).toBe("overdueDays");
    expect(closest("completelyDifferent", ["now"])).toBeUndefined();
  });
});

describe("local test with a chosen sample", () => {
  it("binds the chosen record, follows its branch and says when it would not match", () => {
    const g = graph();
    const options = sampleOptions(g, records, NOW);
    expect(options.map((option) => [option.id, option.matches])).toEqual([["inv-old", true], ["inv-new", true], ["inv-paid", false]]);

    const recent = runWorkflow({ graph: g, records, now: NOW, actor: "Maya Chen", mode: "dry", sampleId: "inv-new" });
    expect(recent.steps.map((step) => step.nodeId)).toEqual(["t", "s", "c", "l"]);
    const path = describePath(g, recent);
    expect(path.steps[2].decision).toMatch(/took “when false”/);
    expect(path.notReached.map((node) => node.id)).toEqual(["a"]);

    const old = runWorkflow({ graph: g, records, now: NOW, actor: "Maya Chen", mode: "dry", sampleId: "inv-old" });
    expect(old.steps.map((step) => step.nodeId)).toEqual(["t", "s", "c", "a"]);

    const paid = runWorkflow({ graph: g, records, now: NOW, actor: "Maya Chen", mode: "dry", sampleId: "inv-paid" });
    expect(paid.steps[0].message).toMatch(/does not match the trigger/);
    expect(paid.steps[0].input).toMatchObject({ sample: "inv-paid", sampleMatchesTrigger: false });
  });

  it("ignores the sample in a live run", () => {
    const live = runWorkflow({ graph: graph(), records, now: NOW, actor: "Maya Chen", mode: "live", sampleId: "inv-paid" });
    expect(live.steps[0].input).not.toHaveProperty("sample");
  });

  it("describes an assumed approval as an assumption", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "t", type: "trigger", label: "T", x: 0, y: 0, config: { collection: "invoices", event: "record.overdue" } },
        { id: "p", type: "approval", label: "Finance approves", x: 0, y: 0, config: { approvers: "Finance" } },
      ],
      edges: [{ from: "t", to: "p", port: "out" }],
    };
    const run = runWorkflow({ graph: g, records, now: NOW, actor: "Maya Chen", mode: "dry", decisions: { p: "approved" } });
    expect(describePath(g, run).steps[1].decision).toMatch(/Assumed approved for this test\. No decision was recorded/);
    const waiting = runWorkflow({ graph: g, records, now: NOW, actor: "Maya Chen", mode: "dry" });
    expect(describePath(g, waiting).steps[1].decision).toMatch(/A local test stops here/);
  });
});
