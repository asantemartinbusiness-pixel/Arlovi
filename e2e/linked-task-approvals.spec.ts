import { expect, test } from "@playwright/test";

test("task completion requires explicit approval and survives a reload", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  const project = page.locator('.ws-entry-list a[href*="/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  const name = "Review release checklist " + Math.floor(Math.random()*1000000);
  await page.getByRole("button",{name:"Create in this space"}).click();
  await page.getByRole("textbox",{name:"Name"}).fill(name);
  await page.getByRole("button",{name:"Create task"}).click();
  await page.getByRole("button",{name:"Approvals"}).click();
  const taskRow = page.locator(".ws-approval-row").filter({hasText:name}).first();
  await expect(taskRow).toContainText("backlog");
  await taskRow.getByRole("button",{name:"Request completion"}).click();
  await expect(page.getByRole("heading",{name:/Awaiting review/})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Approvals"}).click();
  const pending = page.locator(".ws-approval-row").filter({hasText:name}).first();
  await pending.getByRole("button",{name:"Approve"}).click();
  await expect(page.getByText("Completion approved")).toBeVisible();
  await expect(page.getByText("Recent decisions")).toBeVisible();
  const stored = await page.evaluate(async title=>new Promise<{status:string,stage:unknown}|null>((resolve,reject)=>{
    const open=indexedDB.open("arlovi-workspace");
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const req=db.transaction("records").objectStore("records").getAll();
      req.onsuccess=()=>{
        const record=(req.result as Array<{title:string,collection:string,status:string,fields:Record<string,unknown>}>).find(x=>x.collection==="tasks"&&x.title===title);
        resolve(record?{status:record.status,stage:record.fields.stage}:null);
        db.close();
      };
      req.onerror=()=>reject(req.error);
    };
  }),name);
  expect(stored).toEqual({status:"completed",stage:"completed"});
});
