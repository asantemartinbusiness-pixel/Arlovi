import { expect, test } from "@playwright/test";

test("project template creates the complete task plan and survives reload",async({page})=>{
  test.setTimeout(120_000);
  await page.goto("/o/northline/project/projects");
  const bar=page.locator(".pg-actions");
  await expect(bar.getByRole("button",{name:"Create a project"})).toBeVisible();
  await bar.getByRole("button",{name:"Create a project"}).click();
  const dialog=page.getByRole("dialog",{name:"Create a project"});
  await dialog.getByLabel("Project name").fill("QA Atomic Commission");
  await dialog.getByLabel("Start from").selectOption({label:"Bespoke commission"});
  await expect(dialog).toContainText("Bench build");
  await dialog.getByRole("button",{name:"Create project",exact:true}).click();
  await expect(page).toHaveURL(/\/o\/northline\/project\/projects\/[0-9a-f-]{36}/);
  await expect(page.locator("#main")).toContainText("QA Atomic Commission");
  const validate=async()=>{
    return page.evaluate(async()=>{
      const path="/src/platform/repo.ts";
      const repo=await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
      const projects=await repo.listByCollection("org-northline","projects");
      const project=projects.find(row=>row.title==="QA Atomic Commission");
      if(!project) return {found:false,tasks:0,consistent:false,allBacklog:false,oneOrg:false};
      const tasks=(await repo.listByCollection("org-northline","tasks")).filter(row=>row.parentId===project.id);
      return {
        found:true,tasks:tasks.length,
        consistent:tasks.every(row=>row.parentId===project.id
          && new Date(row.dueAt!).getTime() <= new Date(project.endAt!).getTime()),
        allBacklog:tasks.every(row=>row.status==="backlog"),
        oneOrg:tasks.every(row=>row.organizationId===project.organizationId),
      };
    });
  };
  await expect.poll(validate).toEqual({
    found:true,tasks:9,consistent:true,allBacklog:true,oneOrg:true,
  });
  await page.reload();
  await expect(page.locator("#main")).toContainText("QA Atomic Commission");
  expect(await validate()).toEqual({
    found:true,tasks:9,consistent:true,allBacklog:true,oneOrg:true,
  });
  // A new project has no attachments. Generic documents carrying the
  // "project" category tag must not be mistaken for this project's files.
  await page.getByRole("tab",{name:"Files",exact:true}).click();
  await expect(page.locator("#main")).toContainText("No files attached");
  await page.getByRole("button",{name:"Attach a file",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Attach a file"})).toBeVisible();
});

test("stale project duplication rolls back the new project and every child task",async({page})=>{
  await page.goto("/o/northline/project/projects/nl-projects-020");
  await expect(page.locator("#main")).toContainText("Project overview");
  const result=await page.evaluate(async()=>{
    const repoPath="/src/platform/repo.ts";
    const helperPath="/src/applications/project/creation.ts";
    const repo=await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const helper=await import(/* @vite-ignore */ helperPath) as typeof import("../src/applications/project/creation");
    const org="org-northline";
    const source=await repo.getRecordInOrg(org,"nl-projects-020");
    if(!source)throw new Error("Seeded project was not loaded");
    const tasks=(await repo.listByCollection(org,"tasks")).filter(row=>row.parentId===source.id && row.fields.kind!=="onboarding");
    const plan=helper.duplicateProjectPlan({
      organizationId:org,currency:"GBP",actor:"Maya Chen",now:new Date("2026-11-16T12:00:00.000Z"),
    },source,tasks,"QA Stale Project Copy");
    const expected={...plan.expectedRevisions,[source.id]:source.revision+1};
    const events=plan.records.map((record,index)=>({type:"create",message:plan.messages[index],entityId:record.id}));
    let conflict=false;
    try{
      await repo.putMany(plan.records,{
        actor:"Browser QA",now:"2026-11-16T12:00:00.000Z",screenId:"qa-project-copy",
      },events,org,expected);
    }catch(error){conflict=error instanceof repo.ConflictError;}
    const rows=await repo.listByOrg(org);
    return {
      conflict,
      projectPersisted:rows.some(row=>row.id===plan.project.id),
      orphanTasks:rows.filter(row=>row.parentId===plan.project.id).length,
    };
  });
  expect(result).toEqual({conflict:true,projectPersisted:false,orphanTasks:0});
});

test("Inbox Needs me follows live Project assignments and not other colleagues' overdue work",async({page})=>{
  await page.goto("/o/northline/project/projects");
  await expect(page.locator("#main")).toContainText("Projects");
  await page.evaluate(async()=>{
    const path="/src/platform/repo.ts";
    const repo=await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const org="org-northline";
    const now="2026-11-16T09:30:00.000Z";
    const ctx={actor:"Maya Chen",now,screenId:"qa-work-assignment"};
    const make=(title:string,person:string)=>repo.newRecord({
      organizationId:org,collection:"tasks",currency:"GBP",title,status:"doing",
      dueAt:"2026-11-01T09:30:00.000Z",parentId:"nl-projects-020",
      fields:{kind:"task",stage:"doing",assignee:person,priority:"high"},
    },ctx);
    const mine=make("QA Maya overdue task","Maya Chen");
    const another=make("QA colleague overdue task","Theo Marsh");
    await repo.putMany([mine,another],ctx,[
      {type:"create",message:"QA overdue task for Maya",entityId:mine.id},
      {type:"create",message:"QA overdue task for Theo",entityId:another.id},
    ],org);
  });
  await page.goto("/o/northline/inbox/inbox");
  const mineButton=page.getByRole("button",{name:"Needs me",exact:true});
  await expect(mineButton).toBeVisible();
  await mineButton.click();
  const queue=page.locator("#main").getByRole("row",{name:/QA Maya overdue task/});
  await expect(queue).toBeVisible();
  await expect(page.locator("#main").getByRole("row",{name:/QA colleague overdue task/})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Everything",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Everything",exact:true}).click();
  await expect(page.locator("#main").getByRole("row",{name:/QA colleague overdue task/})).toBeVisible();
});
