import { describe, expect, it } from "vitest";
import { destinationForOrganization } from "@/app/organizationNavigation";
import { applyAttentionReceipts, attentionReceiptKey } from "@/platform/attentionReceipts";
import type { AttentionItem } from "@/platform/attention";

describe("organization navigation", () => {
  it("switches a detail page to the target organization's app entry", () => {
    const next = destinationForOrganization("/o/northline/crm/deals/nl-deals-001", "?overlay=Edit", "harbor");
    expect(next).toMatch(/^\/o\/harbor\/crm\//);
    expect(next).not.toContain("nl-deals-001");
    expect(next).not.toContain("overlay=");
  });

  it("keeps list context while dropping old overlays", () => {
    expect(destinationForOrganization("/o/northline/hq/home", "?tab=Week&overlay=Widget+picker", "harbor"))
      .toBe("/o/harbor/hq/home?tab=Week");
  });

  it("keeps the current route when no switch is needed", () => {
    expect(destinationForOrganization("/o/northline/fin/invoices", "?tab=Draft", "northline"))
      .toBe("/o/northline/fin/invoices?tab=Draft");
  });

  it("preserves a company-level area but drops a foreign project ID and tab", () => {
    expect(destinationForOrganization("/o/northline/workspace/work/project/nl-project-1", "?tab=files&overlay=Edit", "harbor"))
      .toBe("/o/harbor/workspace/work");
    expect(destinationForOrganization("/o/northline/workspace/spaces/department/nl-dept", "?tab=people", "harbor"))
      .toBe("/o/harbor/workspace/spaces");
    expect(destinationForOrganization("/o/northline/workspace/people", "", "harbor"))
      .toBe("/o/harbor/workspace/people");
    expect(destinationForOrganization("/o/northline/workspace/health", "", "harbor"))
      .toBe("/o/harbor/workspace/health");
  });

  it("removes organisation-specific modal, record, and tab parameters from native list pages", () => {
    expect(destinationForOrganization("/o/northline/fin/invoices", "?tab=Draft&overlay=Edit&record=old-id&selected=row-1", "harbor"))
      .toBe("/o/harbor/fin/invoices?tab=Draft");
  });

  it("falls back safely for unknown routes", () => {
    expect(destinationForOrganization("/broken", "?overlay=Edit", "harbor"))
      .toBe("/o/harbor/workspace/home");
  });
});

const example: AttentionItem = {
  id: "approval-42", kind: "approval", priority: "P2", title: "Review", body: "Decision required",
  at: "2026-11-16T09:00:00.000Z", audience: ["owner"], read: false,
  acknowledged: false, resolved: false, group: "Approvals",
};

describe("attention receipts", () => {
  it("separates reading from approval and resolution", () => {
    const receipts = { [attentionReceiptKey("org-northline", "owner", example.id)]: { read: true } };
    const [item] = applyAttentionReceipts([example], receipts, "org-northline", "owner");
    expect(item.read).toBe(true);
    expect(item.acknowledged).toBe(false);
    expect(item.resolved).toBe(false);
  });

  it("never leaks receipts across organizations or roles", () => {
    const receipts = { [attentionReceiptKey("org-northline", "owner", example.id)]: { read: true, acknowledged: true } };
    expect(applyAttentionReceipts([example], receipts, "org-harbor", "owner")[0].read).toBe(false);
    expect(applyAttentionReceipts([example], receipts, "org-northline", "finance")[0].read).toBe(false);
    expect(applyAttentionReceipts([example], receipts, "org-northline", "owner")[0].acknowledged).toBe(true);
  });
});
