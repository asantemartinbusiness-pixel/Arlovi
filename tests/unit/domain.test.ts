import { describe, expect, it } from "vitest";
import { localAssistantReply } from "../../src/domain/assistant";
import { reduceAction, type ScreenRef } from "../../src/domain/engine";
import { evaluateSheet } from "../../src/domain/formulas";
import { statements } from "../../src/domain/finance";
import { findBookingConflict } from "../../src/domain/ops";
import { buildSeed } from "../../src/domain/seed";
import { runAllScenarios } from "../../src/domain/scenarios";
import { ORG_HARBOR, ORG_NORTHLINE } from "../../src/domain/types";
import { matchPath } from "../../src/app/match";
import catalog from "../../src/generated/catalog.json";

describe("ledger", () => {
  const { records } = buildSeed();
  it("balances both organizations", () => {
    for (const orgId of [ORG_NORTHLINE, ORG_HARBOR]) {
      const report = statements(records, orgId);
      expect(report.booksBalance).toBe(true);
      expect(report.equationHolds).toBe(true);
      expect(report.debit).toBeGreaterThan(0);
    }
  });

  it("keeps harbor invoices out of northline", () => {
    const northIds = new Set(records.filter((item) => item.organizationId === ORG_NORTHLINE).map((item) => item.id));
    const harborContacts = records.filter((item) => item.organizationId === ORG_HARBOR && item.collection === "contacts");
    expect(harborContacts.every((item) => !northIds.has(item.id))).toBe(true);
    expect(harborContacts.some((item) => item.title === "Chris Hale")).toBe(true);
  });
});

describe("formulas", () => {
  it("sums a range and respects precedence", () => {
    const sheet = evaluateSheet({ A1: "=1+2*3", B2: "10", B3: "5", B4: "=SUM(B2:B3)", B5: "=AVERAGE(B2:B3)" });
    expect(sheet.A1.value).toBe(7);
    expect(sheet.B4.value).toBe(15);
    expect(sheet.B5.value).toBe(7.5);
  });

  it("reports cycles and division by zero", () => {
    const cycle = evaluateSheet({ A1: "=B1", B1: "=A1" });
    expect(cycle.A1.error).toBe("#CYCLE");
    const zero = evaluateSheet({ A1: "=1/0" });
    expect(zero.A1.error).toBe("#DIV/0");
  });
});

describe("bookings", () => {
  const { records } = buildSeed();
  it("detects an overlapping hold", () => {
    const conflict = findBookingConflict(records, ORG_NORTHLINE, "nl-resources-001", "2026-11-18T14:15:00.000Z", "2026-11-18T15:00:00.000Z");
    expect(conflict?.id).toBe("nl-bookings-001");
    const clear = findBookingConflict(records, ORG_NORTHLINE, "nl-resources-001", "2026-11-19T14:00:00.000Z", "2026-11-19T15:00:00.000Z");
    expect(clear).toBeUndefined();
  });
});

describe("workflows", () => {
  const { records } = buildSeed();
  it("completes all twenty local scenarios", () => {
    const results = runAllScenarios(records);
    expect(results).toHaveLength(20);
    const failed = results.filter((item) => !item.ok).map((item) => `${item.id}: ${item.notes.join(" ")}`);
    expect(failed).toEqual([]);
  });
});

describe("actions", () => {
  const { records } = buildSeed();
  const screen = (partial: Partial<ScreenRef>): ScreenRef => ({
    id: "ARL-FIN-003",
    title: "General Ledger",
    route: "/o/:org/fin/ledger",
    archetype: "table",
    applicationCode: "FIN",
    collection: "journals",
    actions: ["Post approved journal"],
    overlays: ["Journal form", "balancing validator"],
    tabs: ["Entries"],
    ...partial,
  });
  let n = 0;
  const ids = () => `test-${n++}`;

  it("posts a balanced draft and refuses a member", () => {
    const posted = reduceAction(records, {
      screen: screen({}),
      action: "Post approved journal",
      role: "finance",
      orgId: ORG_NORTHLINE,
      actor: "Jonah Adeyemi",
      now: "2026-11-14T12:00:00.000Z",
      selectedId: "nl-journals-008",
      ids,
    });
    expect(posted.tone).toBe("ok");
    expect(posted.records.find((item) => item.id === "nl-journals-008")?.status).toBe("posted");
    const report = statements(posted.records, ORG_NORTHLINE);
    expect(report.booksBalance).toBe(true);
    expect(report.equationHolds).toBe(true);

    const denied = reduceAction(records, {
      screen: screen({}),
      action: "Post approved journal",
      role: "member",
      orgId: ORG_NORTHLINE,
      actor: "Priya Shah",
      now: "2026-11-14T12:00:00.000Z",
      selectedId: "nl-journals-008",
      ids,
    });
    expect(denied.tone).toBe("blocked");
    expect(denied.records.find((item) => item.id === "nl-journals-008")?.status).toBe("draft");
  });

  it("does not claim a connected send", () => {
    const effect = reduceAction(records, {
      screen: screen({ id: "ARL-FIN-005", collection: "invoices", title: "Invoice Detail", actions: ["send"] }),
      action: "send",
      role: "finance",
      orgId: ORG_NORTHLINE,
      actor: "Jonah Adeyemi",
      now: "2026-11-14T12:00:00.000Z",
      selectedId: "nl-invoices-002",
      ids,
    });
    expect(effect.capability).toBe("not_connected");
    expect(effect.toastTitle).toBe("Service not connected");
  });
});

describe("assistant", () => {
  it("cites ledger records without inventing a feed", () => {
    const { records } = buildSeed();
    const reply = localAssistantReply(records, ORG_NORTHLINE, "Which invoices are open?");
    expect(reply.text).toContain("INV-1048");
    expect(reply.text.toLowerCase()).not.toContain("bank feed balance is");
    expect(reply.citations.length).toBeGreaterThan(0);
  });
});

describe("registry routes", () => {
  const screens = catalog.screens.map((screen) => ({
    id: screen.id,
    title: screen.title,
    route: screen.route,
  }));

  it("matches every registered route and keeps static segments first", () => {
    expect(catalog.screens).toHaveLength(316);
    expect(catalog.screens.reduce((sum, screen) => sum + screen.tabs.length, 0)).toBe(1323);
    expect(catalog.screens.reduce((sum, screen) => sum + screen.actions.length, 0)).toBe(1328);
    expect(catalog.screens.reduce((sum, screen) => sum + screen.overlays.length, 0)).toBe(956);
    for (const screen of catalog.screens) {
      const path = screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult");
      const match = matchPath(path, screens);
      expect(match?.screen.id).toBe(screen.id);
    }
    const created = matchPath("/o/northline/team/agents/new", screens);
    expect(created?.screen.id).toBe("ARL-TEAM-004");
    const detail = matchPath("/o/northline/team/agents/nl-agents-001", screens);
    expect(detail?.screen.id).toBe("ARL-TEAM-003");
  });
});
