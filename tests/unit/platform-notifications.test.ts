import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/app/nav";
import { buildAttention, isDecisionItem, type AttentionItem } from "@/platform/attention";
import { applyAttentionReceipts, applyInboxAttentionState, attentionReceiptKey, attentionSnoozed } from "@/platform/attentionReceipts";
import { isRegisteredNativeEvent, NATIVE_NOTIFICATION_CONTRACTS } from "@/platform/notificationContracts";
import { alertContract, attentionPresentation, DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences, notificationCategory, notificationPreferenceKey, safeNotificationPath } from "@/platform/notificationExperience";
import type { Rec } from "@/domain/types";

const item = (patch: Partial<AttentionItem> = {}): AttentionItem => ({
  id: "evt-1", kind: "update", priority: "P3", title: "Updated", body: "Document changed",
  at: "2026-11-18T14:00:00Z", audience: [], read: false,
  acknowledged: false, resolved: false, group: "Projects", ...patch,
});

describe("Arlovi platform notification policies", () => {
  it("registers explicit event contracts for all native applications", () => {
    const codes = NAV_GROUPS.flatMap(group => group.apps.map(app => app.code));
    expect(codes).toHaveLength(35);
    expect(Object.keys(NATIVE_NOTIFICATION_CONTRACTS).sort()).toEqual([...codes].sort());
    for (const code of codes) expect(NATIVE_NOTIFICATION_CONTRACTS[code].events.length).toBeGreaterThan(0);
    expect(isRegisteredNativeEvent("IT", "security.incident")).toBe(true);
    expect(isRegisteredNativeEvent("IT", "fake.event")).toBe(false);
  });
  it("keeps security visible regardless of category settings and focus", () => {
    const preferences = normalizeNotificationPreferences({
      categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, security: "quiet" },
      focusMode: true,
    });
    expect(preferences.categories.security).toBe("immediate");
    const critical = item({ kind: "system", priority: "P0" });
    expect(notificationCategory(critical)).toBe("security");
    expect(attentionPresentation(critical, preferences)).toBe("interrupt");
    expect(attentionPresentation(item({kind:"mention"}), preferences)).toBe("quiet");
  });
  it("preserves event access while treating preferences only as presentation choices", () => {
    const preferences = normalizeNotificationPreferences({ categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, projects: "digest" } });
    expect(attentionPresentation(item(), preferences)).toBe("digest");
    expect(alertContract("P0", true)).toMatchObject({ surface: "modal", accessibleRole: "alert" });
    expect(alertContract("P5", false)).toMatchObject({ surface: "inline" });
  });
  it("refuses cross-organisation and external links", () => {
    expect(safeNotificationPath("/o/northline/fin/invoices/a?tab=Details", "northline")).toBe("/o/northline/fin/invoices/a?tab=Details");
    expect(safeNotificationPath("/o/other/fin/invoices/a", "northline")).toBeNull();
    expect(safeNotificationPath("//evil.example/o/northline", "northline")).toBeNull();
    expect(safeNotificationPath("javascript:alert(1)", "northline")).toBeNull();
  });
  it("keeps local receipts per actor and does not resolve approval items", () => {
    const original = item({ kind: "approval", priority: "P2" });
    const key = attentionReceiptKey("org", "Jane", original.id);
    const receipts = { [key]: { read: true, acknowledged: true, snoozedUntil: "2026-11-19T14:00:00Z" } };
    expect(notificationPreferenceKey("org", "Jane")).not.toBe(notificationPreferenceKey("org", "John"));
    const jane = applyAttentionReceipts([original], receipts, "org", "Jane");
    const john = applyAttentionReceipts([original], receipts, "org", "John");
    expect(jane[0].read).toBe(true);
    expect(john[0].read).toBe(false);
    expect(isDecisionItem(jane[0])).toBe(true);
    expect(attentionSnoozed(jane[0], receipts, "org", "Jane", new Date("2026-11-18T16:00:00Z"))).toBe(true);
    expect(attentionSnoozed(john[0], receipts, "org", "John", new Date("2026-11-18T16:00:00Z"))).toBe(false);
  });
  it("prevents snoozing critical system alerts", () => {
    const critical = item({ kind: "system", priority: "P0" });
    const receipts = { [attentionReceiptKey("org", "Jane", critical.id)]: { snoozedUntil: "2100-01-01T00:00:00Z" } };
    expect(attentionSnoozed(critical, receipts, "org", "Jane", new Date())).toBe(false);
  });
  it("reconciles the full Inbox local state without changing underlying work", () => {
    const row = { id: "triage", fields: { itemId: "evt-1", read: true, acknowledged: true, resolved: false, snoozedUntil: "2026-11-20T00:00:00Z" } } as unknown as Rec;
    const result = applyInboxAttentionState([item({kind:"approval"})], [row]);
    expect(result[0]).toMatchObject({ read: true, acknowledged: true, resolved: false });
    expect(result[0].snoozedUntil).toBe("2026-11-20T00:00:00Z");
  });
  it("routes sensitive app notification records only to relevant role views by default", () => {
    const record = { id: "n1", title: "Salary review", summary: "Confidential",
      fields: { appCode: "HR" }, status: "open",
      at: "2026-11-18T16:00:00Z", updatedAt: "2026-11-18T16:00:00Z" } as unknown as Rec;
    const rows = buildAttention({ notifications: [record], invoices:[], bills:[], tasks:[], missions:[], approvals:[], orgSlug:"northline", now:new Date("2026-11-18T16:00:00Z")});
    expect(rows[0].audience).toEqual(["owner","people"]);
    expect(rows[0].group).toBe("People");
  });
});
