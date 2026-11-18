import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  accessOf, approvalRequired, assignmentHistory, contractChanges, contractFromAgent, contractProblems,
  executionAvailability, normaliseScopeId, requiresReauthorisation, type ContractDraft,
} from "@/applications/team/contract";

function rec(partial: Partial<Rec> & { id: string; collection: string }): Rec {
  return {
    organizationId: "org", title: "Row", status: "active", ownerName: "Maya", summary: "", currency: "GBP", tags: [], fields: {},
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", revision: 3, createdBy: "Maya", updatedBy: "Maya", history: [],
    ...partial,
  };
}

const agent = rec({
  id: "a1", collection: "agents", title: "Tomas Reiner", fields: { autonomy: "draft" },
  body: {
    authority: ["Draft a purchase order", "Cannot approve or send one"],
    tools: [
      { id: "workspace.read", label: "Read workspace records", granted: true },
      { id: "email.send", label: "Send a supplier email", capability: "email.send", granted: false },
    ],
  },
});
const none = () => false;

describe("contract editing rules", () => {
  it("reads a contract and infers access for legacy scopes", () => {
    const draft = contractFromAgent(agent);
    expect(draft.approval).toBe("draft");
    expect(accessOf(draft.tools[0])).toBe("read");
    expect(accessOf(draft.tools[1])).toBe("act");
    expect(approvalRequired(draft.tools[1])).toBe(true);
    expect(normaliseScopeId(" CRM Read ")).toBe("crm.read");
  });

  it("refuses to grant a scope whose provider is not connected", () => {
    const draft = contractFromAgent(agent);
    draft.tools[1].granted = true;
    draft.approval = "act_with_approval";
    expect(contractProblems(draft, none).join(" ")).toMatch(/not connected, so it cannot be granted/);
    expect(contractProblems(draft, () => true)).toEqual([]);
  });

  it("refuses an act scope below the act-with-approval level, and empty or duplicate lines", () => {
    const draft: ContractDraft = { approval: "draft", authority: ["Draft", "draft", ""], tools: [{ id: "crm.update", label: "Update", access: "act", granted: true }] };
    const problems = contractProblems(draft, none).join(" | ");
    expect(problems).toMatch(/empty/);
    expect(problems).toMatch(/same thing/);
    expect(problems).toMatch(/approval level does not allow acting/);
  });

  it("describes changes and asks for re-authorisation unless only a label changed", () => {
    const before = contractFromAgent(agent);
    const relabel = { ...before, tools: before.tools.map((tool, i) => (i === 0 ? { ...tool, label: "Read records" } : tool)) };
    expect(contractChanges(before, relabel)).toEqual(["workspace.read relabelled"]);
    expect(requiresReauthorisation(before, relabel)).toBe(false);
    const narrowed = { ...before, authority: [before.authority[0]], tools: [{ ...before.tools[0], granted: false }, before.tools[1]] };
    expect(contractChanges(before, narrowed)).toEqual(["Permitted action removed: Cannot approve or send one", "workspace.read withdrawn"]);
    expect(requiresReauthorisation(before, narrowed)).toBe(true);
    expect(contractChanges(before, before)).toEqual([]);
  });
});

describe("execution availability and history", () => {
  it("never reports that an AI employee can execute without a provider", () => {
    const result = executionAvailability(agent, "not_connected", []);
    expect(result.canExecute).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/No model provider is connected/);
    expect(result.configured[0]).toMatch(/revision 3/);
    // Even a connected model leaves the missing trusted server as a blocker.
    expect(executionAvailability(agent, "verified_external", []).blockers).toHaveLength(1);
  });

  it("merges assignments, run requests and mission tasks, newest first, none executed", () => {
    const rows = assignmentHistory(agent, {
      assignments: [rec({ id: "as1", collection: "agentWorkAssignments", status: "awaiting_provider", parentId: "t1", fields: { agentId: "a1" }, createdAt: "2026-11-05T00:00:00.000Z" })],
      requests: [rec({ id: "rq1", collection: "agentExecutionRequests", status: "blocked", fields: { assignmentId: "as1" }, createdAt: "2026-11-06T00:00:00.000Z" })],
      missionTasks: [rec({ id: "mt1", collection: "missionTasks", parentId: "m1", fields: { assignee: "Tomas Reiner", stage: "queued" }, createdAt: "2026-11-02T00:00:00.000Z" })],
      tasks: [rec({ id: "x", collection: "tasks", fields: { assignee: "Someone else" } })],
    });
    expect(rows.map((row) => row.id)).toEqual(["rq1", "as1", "mt1"]);
    expect(rows.every((row) => row.executed === false)).toBe(true);
    expect(rows[1].detail).toMatch(/Not executed/);
    expect(rows[2].link).toEqual({ kind: "mission", id: "m1" });
  });
});
