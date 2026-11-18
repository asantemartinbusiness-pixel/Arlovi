import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import {
  counterpartiesOf, decideRound, matchesRegister, obligationState, openRound, renewalInfo, reviewDecisionBlocker, startRound,
  statusAfterDecision, suggestCompany, EMPTY_FILTER,
} from "@/applications/legal/register";
import {
  allowedMoves, canMove, deliveryOf, isBreachingOrAtRisk, queueCounts, triageCompare,
} from "@/applications/care/triage";
import { slaState, type SlaState } from "@/applications/care/sla";
import {
  addChecklistItem, healthCheck, moveChecklistItem, removeChecklistItem, unfinishedDependencies, withoutDependency,
} from "@/applications/project/taskWork";
import { completeMention, matchesConversation, mentionCandidates, mentionQuery, mentionsIn } from "@/applications/comms/compose";

const NOW = new Date("2026-11-14T09:30:00Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function rec(partial: Partial<Rec> & { fields?: Rec["fields"] }): Rec {
  return {
    id: partial.id ?? `r-${Math.random().toString(36).slice(2)}`,
    organizationId: "org", collection: partial.collection ?? "contracts", title: partial.title ?? "Record",
    status: partial.status ?? "active", ownerName: "Maya Chen", summary: partial.summary ?? "", currency: "GBP",
    tags: [], createdAt: day(-10), updatedAt: day(-1), revision: 1, createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [],
    ...partial,
    fields: partial.fields ?? {},
  };
}

describe("LEGAL contract register", () => {
  it("computes the notice date and flags a passed notice on an auto-renewing contract", () => {
    const contract = rec({ endAt: day(17), fields: { noticeDays: 30, autoRenew: true, counterparty: "Kestrel" } });
    const info = renewalInfo(contract, NOW);
    expect(info.endsInDays).toBe(17);
    expect(info.noticeInDays).toBe(-13);
    expect(info.alert).toBe("notice_passed");
    expect(info.label).toMatch(/renews/);
    expect(info.noticeBy.slice(0, 10)).toBe(day(-13).slice(0, 10));
  });

  it("distinguishes notice due, ending, clear, decided and closed", () => {
    expect(renewalInfo(rec({ endAt: day(50), fields: { noticeDays: 30 } }), NOW).alert).toBe("notice_due");
    expect(renewalInfo(rec({ endAt: day(80), fields: { noticeDays: 0 } }), NOW).alert).toBe("ending");
    expect(renewalInfo(rec({ endAt: day(400), fields: { noticeDays: 30 } }), NOW).alert).toBe("clear");
    expect(renewalInfo(rec({ endAt: day(20), fields: { noticeDays: 30, renewalDecision: "renew" } }), NOW).tone).toBe("success");
    expect(renewalInfo(rec({ status: "archived", endAt: day(-5), fields: {} }), NOW).alert).toBe("clear");
    expect(renewalInfo(rec({ fields: {} }), NOW).alert).toBe("no_end");
  });

  it("filters by counterparty, status, renewal window and text", () => {
    const a = rec({ title: "Timber supply", endAt: day(40), fields: { counterparty: "Thames Timber", noticeDays: 30 } });
    const b = rec({ title: "Lease", status: "in_review", endAt: day(400), fields: { counterparty: "Marchbank", noticeDays: 180 } });
    const rows = [a, b];
    expect(rows.filter((row) => matchesRegister(row, { ...EMPTY_FILTER, counterparty: "Marchbank" }, NOW))).toEqual([b]);
    expect(rows.filter((row) => matchesRegister(row, { ...EMPTY_FILTER, status: "in_review" }, NOW))).toEqual([b]);
    expect(rows.filter((row) => matchesRegister(row, { ...EMPTY_FILTER, window: "notice_30" }, NOW))).toEqual([a]);
    expect(rows.filter((row) => matchesRegister(row, { ...EMPTY_FILTER, query: "lease" }, NOW))).toEqual([b]);
    expect(counterpartiesOf(rows)).toEqual(["Marchbank", "Thames Timber"]);
  });

  it("does not let the person who requested a review approve it", () => {
    expect(reviewDecisionBlocker("Maya Chen", "approved", "Maya Chen")).toMatch(/cannot approve/);
    expect(reviewDecisionBlocker("Maya Chen", "changes_requested", "Maya Chen")).toBeUndefined();
    expect(reviewDecisionBlocker("Maya Chen", "rejected", "Maya Chen")).toBeUndefined();
    expect(reviewDecisionBlocker("Maya Chen", "approved", "Rowan Patel")).toBeUndefined();
    expect(reviewDecisionBlocker("", "approved", "Maya Chen")).toBeUndefined();
  });

  it("runs a review cycle: one open round, a decision, and the status it implies", () => {
    let rounds = startRound([], "Priya Shah", "Maya Chen", day(0), "r1");
    rounds = startRound(rounds, "Rowan Patel", "Maya Chen", day(0), "r2");
    expect(rounds).toHaveLength(1);
    expect(openRound(rounds)?.reviewer).toBe("Rowan Patel");
    rounds = decideRound(rounds, "changes_requested", "Rowan Patel", day(1), "Cap too low");
    expect(openRound(rounds)).toBeUndefined();
    expect(rounds[0].decision).toBe("changes_requested");
    expect(startRound(rounds, "Priya Shah", "Maya Chen", day(2), "r3")).toHaveLength(2);
    expect(statusAfterDecision("in_review", "approved")).toBe("approved");
    expect(statusAfterDecision("in_review", "rejected")).toBe("draft");
    expect(statusAfterDecision("active", "approved")).toBe("active");
  });

  it("describes obligation state and suggests a CRM company only on a close name", () => {
    expect(obligationState(rec({ status: "done", dueAt: day(-3) }), NOW).tone).toBe("success");
    expect(obligationState(rec({ status: "upcoming", dueAt: day(-3) }), NOW).label).toBe("3d late");
    expect(obligationState(rec({ status: "upcoming", dueAt: day(5) }), NOW).tone).toBe("warning");
    const companies = [rec({ id: "c1", title: "Delacroix Hotels" }), rec({ id: "c2", title: "Vale & Co" })];
    expect(suggestCompany("Delacroix Hotels SA", companies)?.id).toBe("c1");
    expect(suggestCompany("Kestrel Brokers", companies)).toBeUndefined();
  });
});

const state = (status: SlaState["status"], remaining: number): SlaState => ({
  status, remainingMinutes: remaining, label: status, targetMinutes: 480, usedMinutes: 480 - remaining, which: "resolution",
});

describe("CARE triage", () => {
  it("orders the worst clock first, then least time, then priority", () => {
    const urgent = rec({ collection: "tickets", fields: { priority: "urgent" } });
    const low = rec({ collection: "tickets", fields: { priority: "low" } });
    const rows = [
      { ticket: low, state: state("due", 300) },
      { ticket: urgent, state: state("due", 300) },
      { ticket: low, state: state("breached", -20) },
      { ticket: urgent, state: state("at_risk", 30) },
    ];
    const sorted = [...rows].sort(triageCompare);
    expect(sorted.map((row) => row.state.status)).toEqual(["breached", "at_risk", "due", "due"]);
    expect(sorted[2].ticket).toBe(urgent);
    expect(isBreachingOrAtRisk(state("paused", 10))).toBe(false);
  });

  it("counts mine, unassigned and breaching among open cases only", () => {
    const tickets = [
      rec({ id: "a", collection: "tickets", status: "open", fields: { assignee: "Maya Chen" } }),
      rec({ id: "b", collection: "tickets", status: "new", fields: { assignee: "" } }),
      rec({ id: "c", collection: "tickets", status: "resolved", fields: { assignee: "" } }),
    ];
    const counts = queueCounts(tickets, "Maya Chen", (ticket) => (ticket.id === "b" ? state("breached", -5) : state("due", 100)));
    expect(counts).toEqual({ open: 2, mine: 1, unassigned: 1, breaching: 1 });
  });

  it("allows only the defined status moves and reports delivery honestly", () => {
    expect(allowedMoves("new")).toContain("open");
    expect(canMove("closed", "open")).toBe(false);
    expect(canMove("resolved", "closed")).toBe(true);
    expect(deliveryOf(rec({ collection: "messages", status: "recorded", fields: { side: "agent", internal: false, delivery: "not_sent" } }))).toBe("not_sent");
    expect(deliveryOf(rec({ collection: "messages", status: "note", fields: { side: "agent", internal: true } }))).toBe("internal");
    expect(deliveryOf(rec({ collection: "messages", status: "received", fields: { side: "customer" } }))).toBe("received");
  });

  it("keeps the first-response clock running for a reply recorded but not delivered", () => {
    const policy = rec({ collection: "slas", fields: { firstResponseHours: 1, resolutionHours: 16, businessHours: "00:00-23:59" } });
    // Opened two weekday hours before a Friday-noon clock, so the 1h target is passed.
    const now = new Date(2026, 10, 13, 12, 0);
    const opened = new Date(2026, 10, 13, 10, 0).toISOString();
    const recorded = rec({ collection: "tickets", status: "open", at: opened, fields: { firstResponseRecordedAt: new Date(2026, 10, 13, 10, 30).toISOString() } });
    const recordedState = slaState(recorded, policy, now);
    expect(recordedState.which).toBe("first response");
    expect(recordedState.status).toBe("breached");
    expect(recordedState.label).toMatch(/not delivered/);
    const counts = queueCounts([recorded], "Maya Chen", (ticket) => slaState(ticket, policy, now));
    expect(counts.breaching).toBe(1);
    const delivered = rec({ collection: "tickets", status: "open", at: opened, fields: { firstResponseAt: new Date(2026, 10, 13, 10, 30).toISOString() } });
    expect(slaState(delivered, policy, now).which).toBe("resolution");
  });
});

describe("PROJECT task editing and health", () => {
  it("adds, rejects duplicates, reorders and removes subtasks", () => {
    let items = addChecklistItem([], "Measure");
    items = addChecklistItem(items, "  measure ");
    expect(items).toHaveLength(1);
    items = addChecklistItem(items, "Order");
    items = moveChecklistItem(items, 1, -1);
    expect(items.map((item) => item.label)).toEqual(["Order", "Measure"]);
    expect(moveChecklistItem(items, 0, -1)).toBe(items);
    expect(removeChecklistItem(items, 0).map((item) => item.label)).toEqual(["Measure"]);
  });

  it("removes a dependency and finds unfinished ones", () => {
    const done = rec({ id: "t1", collection: "tasks", fields: { stage: "done" } });
    const doing = rec({ id: "t2", collection: "tasks", fields: { stage: "doing" } });
    const task = rec({ id: "t3", collection: "tasks", fields: { stage: "ready", dependsOn: "t1,t2" } });
    expect(withoutDependency(task, "t1")).toBe("t2");
    expect(unfinishedDependencies(task, [done, doing, task]).map((row) => row.id)).toEqual(["t2"]);
  });

  it("derives health signals from late, blocked, waiting work and budget", () => {
    const project = rec({ collection: "projects", endAt: day(30), fields: { health: "on_track", budgetMinor: 1000, spentMinor: 1100 } });
    const tasks = [
      rec({ id: "x", collection: "tasks", endAt: day(-2), fields: { stage: "doing" } }),
      rec({ id: "y", collection: "tasks", endAt: day(5), fields: { stage: "blocked" } }),
      rec({ id: "z", collection: "tasks", endAt: day(9), fields: { stage: "done" } }),
    ];
    const check = healthCheck(project, tasks, NOW);
    expect(check.lateCount).toBe(1);
    expect(check.blockedCount).toBe(1);
    expect(check.computed).toBe("off_track");
    const calm = healthCheck(rec({ collection: "projects", fields: { budgetMinor: 1000, spentMinor: 100 } }), [tasks[2]], NOW);
    expect(calm.computed).toBe("on_track");
    expect(calm.signals).toEqual([]);
  });
});

describe("COMMS composition", () => {
  const people = ["Maya Chen", "Marcus Reiss", "Priya Shah"];
  it("detects the mention being typed and completes it", () => {
    expect(mentionQuery("Thanks @Ma")).toBe("Ma");
    expect(mentionQuery("email me@example")).toBeNull();
    expect(mentionCandidates("ma", people)).toEqual(["Marcus Reiss", "Maya Chen"]);
    expect(mentionCandidates("shah", people)).toEqual(["Priya Shah"]);
    expect(completeMention("Thanks @Ma", "Maya Chen")).toBe("Thanks @Maya Chen ");
  });

  it("finds mentions of known people and searches a conversation", () => {
    expect(mentionsIn("Ask @Priya Shah and @Nobody Here", people)).toEqual(["Priya Shah"]);
    const message = rec({ collection: "messages", summary: "Oak delivery slipped", fields: { author: "Rowan Patel" } });
    expect(matchesConversation(message, "oak")).toBe(true);
    expect(matchesConversation(message, "rowan")).toBe(true);
    expect(matchesConversation(message, "brass")).toBe(false);
  });
});
