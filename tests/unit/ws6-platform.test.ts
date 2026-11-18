import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { evaluate, makeField, readForm, validate } from "@/applications/forms/model";
import { csvCell, resultsCsv, resultsTable, summariseQuestion } from "@/applications/forms/responses";
import {
  accessSignals, approvalBlocker, configDiff, decisionBlocker, entriesFromMembers, parseConfig, readTimeline,
  reviewProgress, riskOf, stageBlockers, stageOf, submitBlockers, withEntry,
} from "@/applications/it/register";
import { applyTransform, connectionState, defaultMapping, mappingIssues, previewMapping } from "@/applications/connect/mapping";
import { seoMessages } from "@/applications/web/seo";
import { readSite } from "@/applications/web/model";
import { layoutRows } from "@/applications/build/layout";

function rec(partial: Partial<Rec>): Rec {
  return {
    id: "r1", organizationId: "org-northline", collection: "x", title: "Record", status: "open", ownerName: "Maya Chen",
    summary: "", currency: "GBP", tags: [], fields: {}, createdAt: "2026-11-01T09:00:00.000Z", updatedAt: "2026-11-01T09:00:00.000Z",
    revision: 1, createdBy: "Maya Chen", updatedBy: "Maya Chen", history: [], ...partial,
  };
}

describe("FORMS responses", () => {
  const trade = { ...makeField("select"), label: "Trade", options: ["Retail", "Other"] };
  const other = { ...makeField("text"), label: "Tell us more", required: true };
  const spend = { ...makeField("number"), label: "Spend" };
  const secret = { ...makeField("text"), label: "Reg", sensitive: true };
  const model = { ...readForm(undefined), fields: [trade, other, spend, secret], logic: [{ id: "l1", targetId: other.id, action: "show" as const, whenFieldId: trade.id, operator: "equals" as const, value: "Other" }] };
  const subs = [
    rec({ id: "s1", at: "2026-11-02T09:00:00Z", title: "A", fields: { Trade: "Retail", Spend: 10, Reg: "123" } }),
    rec({ id: "s2", at: "2026-11-03T09:00:00Z", title: "B", fields: { Trade: "Other", "Tell us more": "Film sets", Spend: 30 } }),
  ];

  it("a hidden required question never blocks, and becomes required once shown", () => {
    expect(evaluate(model, { [trade.id]: "Retail" }).visible.has(other.id)).toBe(false);
    expect(validate(model, { [trade.id]: "Retail" })).toHaveLength(0);
    expect(validate(model, { [trade.id]: "Other" }).map((error) => error.fieldId)).toEqual([other.id]);
  });

  it("counts choices and summarises numbers", () => {
    const choice = summariseQuestion(trade, subs);
    expect(choice.kind === "choice" && choice.options).toEqual([{ label: "Retail", count: 1 }, { label: "Other", count: 1 }]);
    const numbers = summariseQuestion(spend, subs);
    expect(numbers.kind === "number" && [numbers.mean, numbers.min, numbers.max]).toEqual([20, 10, 30]);
    expect(summariseQuestion(other, subs).skipped).toBe(1);
  });

  it("builds a newest-first results table with sensitive answers redacted", () => {
    const table = resultsTable(model, subs);
    expect(table.header).toEqual(["Received", "From", "Version", "State", "Trade", "Tell us more", "Spend", "Reg"]);
    expect(table.rows[0][1]).toBe("B");
    expect(table.rows[1][7]).toBe("[redacted]");
    expect(resultsTable(model, subs, { reveal: true }).rows[1][7]).toBe("123");
  });

  it("quotes CSV cells and neutralises formulas but not negative numbers", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(resultsCsv({ header: ["a"], rows: [["1"]] })).toBe("a\r\n1");
  });
});

describe("IT lifecycle", () => {
  it("derives the stage from status and moves one gated step at a time", () => {
    const incident = rec({ collection: "incidents", status: "open", at: "2026-11-01T09:00:00Z", fields: {} });
    expect(stageOf(incident)).toBe("open");
    expect(stageBlockers(incident, "triage", { verified: false, note: "" })).toEqual(["Set a severity.", "Assign an owner."]);
    expect(stageBlockers(incident, "resolve", { verified: true, note: "" })[0]).toMatch(/one stage at a time/);
    const triaged = rec({ ...incident, status: "investigating", fields: { severity: "high", owner: "Maya Chen", stage: "triage" } });
    expect(stageOf(triaged)).toBe("triage");
    expect(stageBlockers(triaged, "mitigate", { verified: false, note: "" })).toHaveLength(1);
    expect(stageBlockers(triaged, "mitigate", { verified: false, note: "Request persistence" })).toEqual([]);
    const mitigating = rec({ ...triaged, status: "mitigating", fields: { ...triaged.fields, stage: "mitigate" } });
    expect(stageBlockers(mitigating, "resolve", { verified: false, note: "Fixed" })).toHaveLength(1);
    expect(stageBlockers(mitigating, "resolve", { verified: true, note: "Fixed" })).toEqual([]);
  });

  it("lets a status set by an older action override a stale stage", () => {
    expect(stageOf(rec({ status: "resolved", fields: { stage: "mitigate" } }))).toBe("resolve");
    expect(stageOf(rec({ status: "closed", fields: { postmortem: "x" } }))).toBe("postmortem");
  });

  it("appends timeline entries in time order", () => {
    const base = rec({ body: { timeline: [{ id: "a", at: "2026-11-02T00:00:00Z", by: "M", kind: "note", text: "second" }] } });
    const next = { ...base, ...withEntry(base, { id: "b", at: "2026-11-01T00:00:00Z", by: "M", kind: "mitigation", text: "first" }) };
    expect(readTimeline(next).map((entry) => entry.text)).toEqual(["first", "second"]);
  });
});

describe("IT change requests, configuration and access reviews", () => {
  it("scores risk transparently", () => {
    expect(riskOf({ scope: "single", reversible: true, tested: true, target: "local" }).level).toBe("low");
    const high = riskOf({ scope: "workspace", reversible: false, tested: false, target: "remote" });
    expect(high.level).toBe("high");
    expect(high.score).toBe(6);
  });

  it("requires a rollback plan above low risk and separates requester from approver", () => {
    const change = rec({ status: "submitted", title: "Move diary", fields: { requestedBy: "Maya Chen", scope: "team", tested: false, plan: "x", window: "2026-11-20" } });
    expect(submitBlockers(change)).toContain("Add a rollback plan; the risk is not low.");
    expect(approvalBlocker(change, "Ada Fernsby")).toMatch(/rollback plan/);
    const ready = rec({ ...change, fields: { ...change.fields, rollbackPlan: "Delete events" } });
    expect(approvalBlocker(ready, "Maya Chen")).toMatch(/cannot approve/);
    expect(approvalBlocker(ready, "Ada Fernsby")).toBeUndefined();
  });

  it("blocks the requester from recording an approval in someone else's name", () => {
    const ready = rec({ status: "submitted", title: "Move diary", fields: { requestedBy: "Maya Chen", scope: "single", reversible: true, tested: true, plan: "x", window: "2026-11-20" } });
    expect(approvalBlocker(ready, "Ada Fernsby", "Maya Chen")).toMatch(/You requested this change/);
    expect(approvalBlocker(ready, "Ada Fernsby", "Jonah Adeyemi")).toBeUndefined();
    const noRequester = rec({ ...ready, createdBy: "Theo Marsh", fields: { ...ready.fields, requestedBy: "" } });
    expect(approvalBlocker(noRequester, "Theo Marsh", "Maya Chen")).toMatch(/cannot approve/);
  });

  it("parses configuration and reports a diff", () => {
    const before = parseConfig("os = 14\nencryption = off");
    const after = parseConfig("os = 15\nowner = Ada\n");
    expect(configDiff(before, after)).toEqual(["~ os: 14 → 15", "+ owner = Ada", "- encryption"]);
  });

  it("flags members and requires reasons for revocations and flagged keeps", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    const member = rec({ id: "m1", title: "Amara", fields: { role: "sales", mfa: false, lastAccessAt: "2026-09-01T00:00:00Z" } });
    expect(accessSignals(member, now)).toEqual(["No second factor", "Last access 78 days ago"]);
    const [entry] = entriesFromMembers([member], now);
    expect(decisionBlocker(entry, "keep", "")).toMatch(/flags/);
    expect(decisionBlocker(entry, "revoke", "Left the company")).toBeUndefined();
    expect(reviewProgress([{ ...entry, decision: "revoke" }]).complete).toBe(true);
  });
});

describe("CONNECT mapping", () => {
  it("is pending until key and title are mapped, then configured, then simulated", () => {
    const connector = rec({ collection: "connectors", status: "not_connected" });
    expect(connectionState(connector, "not_connected", "calendar.sync")).toBe("pending");
    const mapping = defaultMapping("calendar.sync");
    expect(mappingIssues(mapping, "calendar.sync").filter((issue) => issue.level === "fail")).toHaveLength(2);
    mapping.rows[0].target = "externalId";
    mapping.rows[1].target = "title";
    mapping.savedAt = "2026-11-18T10:00:00Z";
    const configured = rec({ ...connector, body: { mapping } });
    expect(connectionState(configured, "not_connected", "calendar.sync")).toBe("configured");
    const simulated = rec({ ...connector, body: { mapping: { ...mapping, simulatedAt: "2026-11-18T10:05:00Z" } } });
    expect(connectionState(simulated, "not_connected", "calendar.sync")).toBe("simulated");
    expect(connectionState(rec({ ...simulated, status: "disabled" }), "not_connected", "calendar.sync")).toBe("disconnected");
    expect(previewMapping(mapping, "calendar.sync")).toEqual([
      { target: "externalId", source: "event_id", value: "evt_77a" },
      { target: "title", source: "summary", value: "Showroom consultation" },
    ]);
  });

  it("flags duplicate targets and converts decimals to minor units", () => {
    const mapping = defaultMapping("bank.feed");
    mapping.rows[0].target = "title";
    mapping.rows[4].target = "title";
    expect(mappingIssues(mapping, "bank.feed").some((issue) => /both land in title/.test(issue.message))).toBe(true);
    expect(applyTransform("-148.20", "to_minor_units")).toBe("-14820");
  });
});

describe("WEB SEO fields and BUILD layout", () => {
  it("validates title, description and path", () => {
    const site = readSite(undefined);
    const messages = seoMessages({ pageId: "new", title: "", description: "short", path: "/About Us", noindex: false }, site);
    expect(messages.filter((message) => message.level === "error").map((message) => message.field)).toEqual(["title", "path"]);
    expect(messages.some((message) => message.field === "description" && message.level === "warning")).toBe(true);
  });

  it("packs spans into rows on desktop and stacks under 900px", () => {
    const parts = [{ id: "a", title: "A", span: 8 }, { id: "b", title: "B", span: 6 }, { id: "c", title: "C", span: 6 }];
    expect(layoutRows(parts, 1280).map((row) => row.map((item) => item.id))).toEqual([["a"], ["b", "c"]]);
    expect(layoutRows(parts, 390)).toHaveLength(3);
  });
});
