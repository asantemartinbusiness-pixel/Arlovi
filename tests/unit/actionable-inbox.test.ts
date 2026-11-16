import { describe, expect, it } from "vitest";
import { buildAttention, filterForRole, headerAttentionCounts, isDecisionItem } from "@/platform/attention";
import { applyAttentionReceipts, attentionReceiptKey } from "@/platform/attentionReceipts";
import type { Rec } from "@/domain/types";

const now = new Date("2026-11-16T12:00:00.000Z");
function approval(id: string, fields: Rec["fields"] = {}, status = "awaiting_approval"): Rec {
  return {
    id, organizationId:"org-northline", collection:"workflowApprovals",
    title:"Complete: Prepare report", status, summary:"Review task completion.",
    ownerName:"Tester", currency:"GBP", tags:[], fields,
    createdAt:now.toISOString(),updatedAt:now.toISOString(),
    createdBy:"Tester",updatedBy:"Tester",revision:1,history:[],
  };
}
function input(requests: Rec[]) {
  return {notifications:[], invoices:[], bills:[], tasks:[], missions:[],
    approvals:[],workflowApprovals:requests,orgSlug:"northline",now};
}
describe("actionable header Inbox integration",()=>{
  it("links an outstanding task review to its parent project approvals",()=>{
    const list=buildAttention(input([approval("approval-1",{taskId:"task-1",projectId:"project-123"})]));
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("approval");
    expect(list[0].route).toBe("/o/northline/workspace/work/project/project-123?tab=approvals");
    expect(filterForRole(list,"owner")).toHaveLength(1);
    expect(filterForRole(list,"member")).toHaveLength(0);
    expect(headerAttentionCounts(list)).toEqual({decisions:1,unreadUpdates:0});
  });
  it("routes department requests correctly and falls back to the global Work board",()=>{
    const list=buildAttention(input([approval("a",{departmentId:"dep-1"}),approval("b")]));
    expect(list.map(item=>item.route)).toEqual([
      "/o/northline/workspace/spaces/department/dep-1?tab=approvals",
      "/o/northline/workspace/work",
    ]);
  });
  it("excludes already approved, rejected and withdrawn requests",()=>{
    const list=buildAttention(input([
      approval("pending"),approval("done",{},"approved"),
      approval("no",{},"rejected"),approval("withdrawn",{},"withdrawn"),
    ]));
    expect(list.map(item=>item.id)).toEqual(["task-approval-pending"]);
  });
  it("keeps unresolved work visible after reading and acknowledging",()=>{
    const original=buildAttention(input([approval("a")]));
    const receipts={[attentionReceiptKey("org-northline","owner",original[0].id)]:{read:true,acknowledged:true}};
    const read=applyAttentionReceipts(original,receipts,"org-northline","owner");
    expect(read[0].read).toBe(true);
    expect(read[0].acknowledged).toBe(true);
    expect(isDecisionItem(read[0])).toBe(true);
    expect(headerAttentionCounts(read).decisions).toBe(1);
  });
  it("distinguishes unread informational notifications from pending decisions",()=>{
    const base=buildAttention(input([approval("a")]));
    const notices=[
      {...base[0],id:"update",kind:"update" as const,read:false},
      {...base[0],id:"read-update",kind:"update" as const,read:true},
      {...base[0],id:"resolved-update",kind:"update" as const,read:false,resolved:true},
    ];
    expect(headerAttentionCounts([...base,...notices])).toEqual({decisions:1,unreadUpdates:1});
  });
});
