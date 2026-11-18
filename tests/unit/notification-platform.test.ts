import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/app/nav";
import { applyAttentionReceipts, attentionReceiptKey } from "@/platform/attentionReceipts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES, NATIVE_APP_NOTIFICATION_SOURCES,
  groupNotificationUpdates, isSnoozed, mayInterrupt, notificationCategory,
  notificationSurface,
} from "@/platform/notificationPolicy";
import { buildAttention, type AttentionItem } from "@/platform/attention";
import { prepareNotificationEvent, publishLocalNotification } from "@/platform/notificationEvents";
import type { Rec } from "@/domain/types";

const base: AttentionItem = {
  id: "event-1", kind: "update", priority: "P3", title: "Document updated", body: "A colleague updated a file",
  at: "2026-11-18T16:00:00Z", audience: [], read: false,
  acknowledged: false, resolved: false, group: "Studio", entityId: "doc-7",
};
describe("platform notifications contracts", () => {
  it("defaults sensitive unaddressed events to appropriate local role views", () => {
    const records = ["HR", "FIN", "ADMIN", "IT", "LEGAL", "CRM"].map(appCode => ({
      id: appCode, fields: { appCode }, title: appCode + " event", summary: "Local update",
      status: "active", at: "2026-11-18T12:00:00Z", updatedAt: "2026-11-18T12:00:00Z",
    } as unknown as Rec));
    const items = buildAttention({
      notifications: records, invoices: [], bills: [], tasks: [], missions: [], approvals: [],
      orgSlug: "northline", now: new Date("2026-11-18T13:00:00Z"),
    });
    const roles = (id: string) => items.find(item => item.id === id)?.audience;
    expect(roles("HR")).toEqual(["owner", "people"]);
    expect(roles("FIN")).toEqual(["owner", "finance"]);
    expect(roles("ADMIN")).toEqual(["owner"]);
    expect(roles("IT")).toEqual(["owner"]);
    expect(roles("LEGAL")).toEqual(["owner"]);
    expect(roles("CRM")).toEqual([]);
  });

  it("covers each registered native application exactly once", () => {
    const expected = NAV_GROUPS.flatMap(group => group.apps.map(app => app.code)).sort();
    const configured = Object.values(NATIVE_APP_NOTIFICATION_SOURCES).flat().sort();
    expect(configured).toEqual(expected);
    expect(new Set(configured).size).toBe(expected.length);
  });
  it("preserves critical security alerts even in focus mode", () => {
    const critical: AttentionItem = {...base, kind:"system", group:"Security", priority:"P0"};
    const focused = {...DEFAULT_NOTIFICATION_PREFERENCES, focusMode:true};
    expect(notificationCategory(critical)).toBe("security");
    expect(mayInterrupt(critical,focused)).toBe(true);
    expect(notificationSurface(critical)).toBe("critical");
    expect(mayInterrupt(base,focused)).toBe(false);
    expect(mayInterrupt(base,DEFAULT_NOTIFICATION_PREFERENCES,true)).toBe(false);
    expect(mayInterrupt({...base,kind:"approval",priority:"P2"},DEFAULT_NOTIFICATION_PREFERENCES)).toBe(true);
  });
  it("groups routine updates but never combines independent approvals", () => {
    const items:AttentionItem[]=[
      base,{...base,id:"event-2"},{...base,id:"approval-1",kind:"approval"},
      {...base,id:"approval-2",kind:"approval"}
    ];
    const groups=groupNotificationUpdates(items);
    expect(groups).toHaveLength(3);
    expect(groups.find(group=>group.items.length===2)?.label).toContain("2 updates");
    expect(groups.filter(group=>group.items[0].kind==="approval")).toHaveLength(2);
  });
  it("snooze ends when its time passes",()=>{
    expect(isSnoozed("2026-11-18T17:00:00Z",new Date("2026-11-18T16:00:00Z"))).toBe(true);
    expect(isSnoozed("2026-11-18T15:00:00Z",new Date("2026-11-18T16:00:00Z"))).toBe(false);
    expect(isSnoozed("not-a-date")).toBe(false);
  });
  it("publishes scoped in-app events with idempotency and no false external delivery", async () => {
    const input = {
      sourceApp: "FIN", sourceId: "invoice-101", category: "work",
      kind: "approval" as const, priority: "P2" as const, title: "Review invoice",
      summary: "A finance approval needs review.", group: "Finance",
      route: "/o/northline/fin/invoices/invoice-101",
      audience: ["owner" as const], dedupeKey: "invoice-101:approval",
    };
    const planned = prepareNotificationEvent(input, "northline");
    expect(planned.fields.deliveryState).toBe("in_app_local");
    expect(planned.fields.audience).toBe("owner");
    expect(() => prepareNotificationEvent({ ...input, route: "/o/other/fin/invoices" }, "northline")).toThrow();
    expect(() => prepareNotificationEvent({ ...input, sourceApp: "UNKNOWN" }, "northline")).toThrow();
    const create = async () => ({ id: "new-event" } as Rec);
    const existing = [{
      id: "old-event", collection: "notifications", status: "open",
      fields: { dedupeKey: "invoice-101:approval" }
    }] as unknown as Rec[];
    const duplicate = await publishLocalNotification({ create }, existing, input, "northline");
    expect(duplicate).toEqual({ created: false, id: "old-event", reason: "A matching open event already exists." });
  });
  it("isolates read, acknowledgement and snooze by actor and preserves actions",()=>{
    const alice=attentionReceiptKey("org-1","owner",base.id,"Alice");
    const bob=attentionReceiptKey("org-1","owner",base.id,"Bob");
    expect(alice).not.toBe(bob);
    const receipts={[alice]:{read:true,acknowledged:true,snoozedUntil:"2026-11-18T19:00:00Z"}};
    const read=applyAttentionReceipts([base],receipts,"org-1","owner","Alice",new Date("2026-11-18T18:00:00Z"))[0];
    expect(read.read).toBe(true);
    expect(read.acknowledged).toBe(true);
    expect(read.resolved).toBe(false);
    expect(read.snoozed).toBe(true);
    expect(applyAttentionReceipts([base],receipts,"org-1","owner","Bob")[0].read).toBe(false);
  });
});
