import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  AGENT_TEAMS, emptyTeamDraft, readTeam, teamNotices, teamProblems, teamRecordInput, teamsForAgent, type AgentTeamDraft,
} from "@/applications/team/agentTeams";

function rec(id: string, patch: Partial<Rec> = {}): Rec {
  return {
    id, organizationId: "org", collection: "agents", title: id, status: "active", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    revision: 1, createdBy: "x", updatedBy: "x", history: [], ...patch,
  };
}

const agents = [rec("a1", { title: "Tomas" }), rec("a2", { title: "Wren", status: "paused" }), rec("a3", { title: "Old", status: "archived" }), rec("a4", { title: "Draft", status: "draft" })];
const people = ["Jonah Adeyemi", "Maya Chen"];
const existing = readTeam(rec("t1", { collection: AGENT_TEAMS, title: "Supplier desk", summary: "x", fields: { leadId: "a1", approvalPolicy: "person_each", approver: "Maya Chen" }, body: { memberIds: ["a2"] } }));

const good: AgentTeamDraft = { name: "Close crew", purpose: "Month-end close drafts.", leadId: "a1", memberIds: ["a1", "a2"], policy: "lead_then_person", approver: "Jonah Adeyemi" };

describe("agent teams", () => {
  it("reads a stored team and always counts the lead as a member", () => {
    expect(existing.memberIds).toEqual(["a1", "a2"]);
    expect(existing.policy).toBe("person_each");
    expect(teamsForAgent([existing], "a2").map((team) => team.id)).toEqual(["t1"]);
    expect(teamsForAgent([{ ...existing, status: "archived" }], "a2")).toEqual([]);
  });

  it("accepts a complete team", () => {
    expect(teamProblems(good, { agents, teams: [existing], people })).toEqual({});
  });

  it("requires a name, purpose, members, a lead among them, a policy and a real person as approver", () => {
    const problems = teamProblems(emptyTeamDraft(), { agents, teams: [existing], people });
    expect(Object.keys(problems).sort()).toEqual(["approver", "leadId", "members", "name", "purpose"]);
    expect(teamProblems({ ...good, leadId: "a4" }, { agents, teams: [], people }).leadId).toBe("The lead must be one of the members.");
    expect(teamProblems({ ...good, approver: "Tomas" }, { agents, teams: [], people }).approver).toBe("The approver must be a person in this workspace.");
    expect(teamProblems({ ...good, policy: "" }, { agents, teams: [], people }).policy).toMatch(/Choose how/);
  });

  it("refuses a duplicate name and archived or unknown members", () => {
    expect(teamProblems({ ...good, name: "supplier DESK" }, { agents, teams: [existing], people }).name).toBe("A team with this name exists.");
    expect(teamProblems({ ...good, name: "Supplier desk" }, { agents, teams: [existing], people, selfId: "t1" }).name).toBeUndefined();
    expect(teamProblems({ ...good, memberIds: ["a1", "a3"] }, { agents, teams: [], people }).members).toBe("Old is archived and cannot join a team.");
    expect(teamProblems({ ...good, memberIds: ["a1", "ghost"] }, { agents, teams: [], people }).members).toMatch(/not an AI employee/);
  });

  it("notes paused and draft members without blocking", () => {
    const notes = teamNotices({ ...good, memberIds: ["a1", "a2", "a4"] }, agents);
    expect(notes.join(" ")).toMatch(/Wren is paused/);
    expect(notes.join(" ")).toMatch(/Draft is a draft contract/);
  });

  it("saves the lead into the member list", () => {
    expect(teamRecordInput({ ...good, memberIds: ["a2"] }).body.memberIds).toEqual(["a1", "a2"]);
    expect(teamRecordInput(good).fields).toEqual({ leadId: "a1", approvalPolicy: "lead_then_person", approver: "Jonah Adeyemi" });
  });
});
