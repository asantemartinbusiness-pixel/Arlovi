import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { buildAttention, mineAttentionItems, filterForRole } from "@/platform/attention";
import { positiveHours, taskMoveDecision } from "@/applications/project/progression";
import {
  createProjectFromTemplate, duplicateProjectPlan, nextProjectCopyTitle, readProjectPhases,
  type CreationContext,
} from "@/applications/project/creation";

const at = "2026-11-14T09:00:00.000Z";
const ctx: CreationContext = {
  organizationId: "org-northline", currency: "GBP", actor: "Maya Chen",
  now: new Date(at),
};
function rec(id: string, collection: string, fields: Rec["fields"] = {}, status = "active", org = ctx.organizationId): Rec {
  return {
    id, collection, organizationId: org, title: id, status,
    summary: "", ownerName: "Original Owner", currency: "GBP", tags: [],
    fields, createdAt: at, updatedAt: at, revision: 3,
    createdBy: "Original Owner", updatedBy: "Original Owner", history: [],
  };
}
const template = {
  ...rec("template-1", "templates", {kind:"project"}, "published"),
  body: { phases: [
    {name:"Discovery",tasks:["Research", "Scoping"]},
    {name:"Delivery",tasks:["Build", "Review"]},
  ] },
};

describe("Projects: atomic creation plans", () => {
  it("prepares one parent plus all template tasks with consistent dates and per-record audit", () => {
    const plan = createProjectFromTemplate(ctx,"New site",template);
    expect(plan.records).toHaveLength(5);
    expect(plan.eventTypes).toEqual(["create","create","create","create","create"]);
    expect(plan.messages).toHaveLength(plan.records.length);
    expect(plan.expectedRevisions).toEqual({[template.id]:template.revision});
    expect(plan.project.fields.templateId).toBe(template.id);
    expect(plan.tasks.map(task=>task.title)).toEqual(["Research","Scoping","Build","Review"]);
    expect(plan.tasks.map(task=>task.fields.sprint)).toEqual(["Discovery","Discovery","Delivery","Delivery"]);
    expect(plan.tasks.every(task=>task.organizationId===ctx.organizationId
      && task.parentId===plan.project.id && task.status==="backlog"
      && task.ownerName===ctx.actor && task.fields.assignee===ctx.actor)).toBe(true);
    expect(plan.tasks.every(task=>new Date(task.dueAt!).getTime()<=new Date(plan.project.endAt!).getTime())).toBe(true);
    expect(template.title).toBe("template-1");
    expect(template.revision).toBe(3);
  });

  it("extends a project end date past 60 days when the real template demands it", () => {
    const long = { ...template, body: {phases:[{name:"Delivery",tasks:Array.from({length:25},(_,i)=>`Task ${i+1}`)}]} };
    const plan=createProjectFromTemplate(ctx,"Long plan",long);
    expect(plan.tasks).toHaveLength(25);
    expect(plan.project.endAt).toBe(plan.tasks[24].dueAt);
  });

  it("does not accept a foreign, unpublished or malformed template", () => {
    expect(()=>createProjectFromTemplate(ctx,"Risky",{...template,organizationId:"org-harbor"})).toThrow(/this company/);
    expect(()=>createProjectFromTemplate(ctx,"Risky",{...template,status:"draft"})).toThrow(/published/);
    expect(()=>readProjectPhases({...template,body:{phases:[{name:"Phase",tasks:[2]}]}})).toThrow(/invalid/);
    expect(()=>createProjectFromTemplate(ctx," ",template)).toThrow(/project name/);
  });

  it("creates genuinely empty, independently tracked projects without a selected template", () => {
    const plan=createProjectFromTemplate(ctx,"  Blank  ");
    expect(plan.project.title).toBe("Blank");
    expect(plan.records).toHaveLength(1);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.expectedRevisions).toEqual({});
  });
});

describe("Projects: clean copy and dependency graph",()=>{
  const source={
    ...rec("project-original","projects",{priority:"high",budgetMinor:60000,spentMinor:28000,automationPaused:true,pinnedBy:"Ella"}),
    status:"done",title:"Migration",startAt:at,dueAt:"2026-12-15T00:00:00Z",
  };
  const a={
    ...rec("source-task-a","tasks",{
      stage:"done",assignee:"Someone Else",priority:"high",estimateHours:5,loggedHours:17,
      kind:"task",sprint:"Stage One",completedBy:"Old Approver",
      completionEvidence:"PRIVATE",reviewSkippedBy:"Old Approver",
      delegatedToAgent:true,agentPayload:"SECRET",dependsOn:"",
    },"done"),
    parentId:source.id,title:"Prepare",
  };
  const b={
    ...rec("source-task-b","tasks",{
      stage:"review",assignee:"Someone Else",priority:"normal",estimateHours:8,loggedHours:2,
      kind:"task",sprint:"Stage Two",dependsOn:`${a.id},foreign-task`,
    },"review"),
    parentId:source.id,title:"Build",
  };
  it("rekeys internal dependencies and strips completed work and confidential task evidence",()=>{
    const plan=duplicateProjectPlan(ctx,source,[a,b],"Migration (copy)");
    expect(plan.records).toHaveLength(3);
    expect(plan.project.title).toBe("Migration (copy)");
    expect(plan.project.status).toBe("planning");
    expect(plan.project.fields.spentMinor).toBe(0);
    expect(plan.project.fields.automationPaused).toBe(false);
    expect(plan.project.fields.pinnedBy).toBe("");
    expect(plan.tasks.map(task=>task.status)).toEqual(["backlog","backlog"]);
    expect(plan.tasks[1].fields.dependsOn).toBe(plan.tasks[0].id);
    expect(plan.tasks[1].fields.dependsOn).not.toContain(a.id);
    expect(plan.tasks[0].fields.assignee).toBe(ctx.actor);
    expect(plan.tasks[0].fields.loggedHours).toBe(0);
    expect(plan.tasks[0].fields.delegatedToAgent).toBe(false);
    expect(plan.tasks[0].fields.completedBy).toBeUndefined();
    expect(plan.tasks[0].fields.completionEvidence).toBeUndefined();
    expect(plan.tasks[0].fields.agentPayload).toBeUndefined();
    expect(plan.tasks[0].fields.reviewSkippedBy).toBeUndefined();
    expect(plan.expectedRevisions).toEqual({[source.id]:3,[a.id]:3,[b.id]:3});
    expect(a.status).toBe("done");
    expect(a.fields.dependsOn).toBe("");
  });
  it("refuses an unrelated company's task and source project",()=>{
    expect(()=>duplicateProjectPlan(ctx,{...source,organizationId:"org-harbor"},[a],"Copy")).toThrow(/selected company/);
    expect(()=>duplicateProjectPlan(ctx,source,[{...a,organizationId:"org-harbor"}],"Copy")).toThrow(/unrelated company/);
    expect(()=>duplicateProjectPlan(ctx,source,[{...a,parentId:"another-project"}],"Copy")).toThrow(/unrelated company/);
  });
  it("chooses collision-free copy titles within the company",()=>{
    expect(nextProjectCopyTitle("Migration",["Migration","Migration (copy)","Migration (copy 2)"]))
      .toBe("Migration (copy 3)");
    expect(nextProjectCopyTitle("Migration (copy)",["Migration (copy)"]))
      .toBe("Migration (copy 2)");
  });
});

describe("Inbox: Projects assignee is the source of truth",()=>{
  const overdue=(assignee:string,status="doing")=>({
    ...rec("task-17","tasks",{kind:"task",assignee},status),
    title:"Review public launch",ownerName:"Old Owner",
    dueAt:"2026-11-10T12:00:00.000Z",
  });
  const input=(tasks:Rec[])=>({
    notifications:[] as Rec[],invoices:[] as Rec[],bills:[] as Rec[],
    tasks,missions:[] as Rec[],approvals:[] as Rec[],orgSlug:"northline",
    now:new Date("2026-11-17T12:00:00.000Z"),
  });
  it("routes an overdue task to the native Project detail and only its assignee's Mine queue",()=>{
    const items=buildAttention(input([overdue("Maya Chen")]));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("assignment");
    expect(items[0].assignee).toBe("Maya Chen");
    expect(items[0].route).toBe("/o/northline/project/tasks/task-17");
    expect(mineAttentionItems(items,"Maya Chen")).toHaveLength(1);
    expect(mineAttentionItems(items,"Ella Graham")).toHaveLength(0);
    expect(filterForRole(items,"member")).toHaveLength(1);
  });
  it("immediately changes Mine ownership when a task is reassigned or completed",()=>{
    const before=buildAttention(input([overdue("Maya Chen")]));
    const after=buildAttention(input([overdue("Ella Graham")]));
    expect(mineAttentionItems(before,"Maya Chen")).toHaveLength(1);
    expect(mineAttentionItems(after,"Maya Chen")).toHaveLength(0);
    expect(mineAttentionItems(after,"Ella Graham")).toHaveLength(1);
    expect(buildAttention(input([overdue("Ella Graham","done")]))).toHaveLength(0);
  });
  it("retains approval requests assigned to you, not ones addressed to another person",()=>{
    const approval=(id:string,assignee:string)=>({
      ...rec(id,"approvals",{assignee},"awaiting_approval"),title:`Approve ${id}`,
    });
    const items=buildAttention({
      ...input([]),approvals:[approval("mine","Maya Chen"),approval("theirs","Ella Graham")],
    });
    expect(mineAttentionItems(items,"Maya Chen").map(item=>item.title)).toEqual(["Approve mine"]);
    expect(mineAttentionItems(items,"Ella Graham").map(item=>item.title)).toEqual(["Approve theirs"]);
  });
});

describe("Projects: identical move rules for task detail, mouse board and keyboard board", () => {
  const projectId="project-moves";
  const dependent={...rec("task-dependency","tasks",{stage:"doing",kind:"task"},"doing"),parentId:projectId,title:"Finish research"};
  const target={...rec("task-target","tasks",{
    stage:"doing",priority:"high",dependsOn:dependent.id,kind:"task",
  },"doing"),parentId:projectId,title:"Deliver final review"};

  it("blocks completion until every dependency is actually done",()=>{
    const blocked=taskMoveDecision(target,"done",[dependent,target]);
    expect(blocked.blocked).toMatch(/Finish research/);
    expect(blocked.needsReviewDecision).toBe(false);
    expect(taskMoveDecision(target,"review",[dependent,target]).blocked).toBeUndefined();
  });

  it("treats missing or cross-project dependencies as blockers, never as completed",()=>{
    expect(taskMoveDecision(target,"done",[target]).blocked).toMatch(/Missing or unrelated task/);
    expect(taskMoveDecision(target,"done",[{...dependent,parentId:"different-project"},target]).blocked)
      .toMatch(/Missing or unrelated task/);
  });

  it("requires explicit review override for high-priority direct completion",()=>{
    const ready={...dependent,status:"done",fields:{...dependent.fields,stage:"done"}};
    const decision=taskMoveDecision(target,"done",[ready,target]);
    expect(decision.blocked).toBeUndefined();
    expect(decision.needsReviewDecision).toBe(true);
    const reviewed={...target,status:"review",fields:{...target.fields,stage:"review"}};
    expect(taskMoveDecision(reviewed,"done",[ready,reviewed]).needsReviewDecision).toBe(false);
  });

  it("does not declare an unchanged or foreign-collection record to be moved",()=>{
    expect(taskMoveDecision(target,"doing",[target]).blocked).toMatch(/already/);
    expect(taskMoveDecision({...target,collection:"invoices"},"done",[dependent]).blocked).toMatch(/valid task/);
  });

  it("rejects bad task capacity estimates before they can pollute the People workload view",()=>{
    expect(positiveHours("8.5")).toBe(8.5);
    expect(positiveHours("0")).toBe(0);
    expect(()=>positiveHours("-1")).toThrow(/non-negative/);
    expect(()=>positiveHours("Infinity")).toThrow(/non-negative/);
    expect(()=>positiveHours("abc")).toThrow(/non-negative/);
    expect(()=>positiveHours("")).toThrow(/Enter an estimate/);
  });
});
