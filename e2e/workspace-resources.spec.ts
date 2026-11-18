import { expect, test } from "@playwright/test";

test("company resource folders are saved, searchable and survive reload", async ({ page }) => {
  await page.goto("/o/northline/workspace/resources");
  await expect(page.getByRole("heading",{level:1,name:"Files & resources"})).toBeVisible();
  const folderName="Operations filing "+Math.floor(Math.random()*1000000);
  await page.getByRole("button",{name:"New folder"}).click();
  await page.getByRole("textbox",{name:"Folder name"}).fill(folderName);
  await page.getByRole("button",{name:"Create folder"}).click();
  await expect(page.getByRole("button",{name:new RegExp(folderName)})).toBeVisible();
  await page.reload();
  await page.getByRole("textbox",{name:"Search resources"}).fill(folderName);
  await expect(page.getByRole("button",{name:new RegExp(folderName)})).toBeVisible();
  await page.getByRole("button",{name:new RegExp(folderName)}).click();
  await expect(page.getByRole("navigation",{name:"Folder location"})).toContainText(folderName);
});

test("a project files tab offers a scoped resource library", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('.ww-projects a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await expect(page.getByRole("button",{name:"Link document"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Files & resources"})).toBeVisible();
});

test("resource inspector previews the existing document and its revision",async({page})=>{
  await page.goto("/o/northline/workspace/resources");
  const row=page.locator(".rs-file-row").filter({has:page.locator("svg")}).first();
  const doc=page.locator(".rs-file-row").filter({hasText:/revision \d+/}).first();
  test.skip(await doc.count()===0,"No documents in this workspace");
  await doc.click();
  await expect(page.getByRole("complementary",{name:"Document preview"})).toBeVisible();
  await expect(page.getByText("Version history", {exact:false})).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Move document to folder"})).toBeVisible();
  void row;
});

test("linking a document to a project does not replace its original owner or project",async({page})=>{
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('.ww-projects a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await page.getByRole("button",{name:"Link document"}).click();
  const select=page.getByRole("combobox",{name:"Existing document to link"});
  const option=select.locator("option:not([value=''])").first();
  test.skip(await option.count()===0,"Requires a company document not already in the project");
  const documentId=await option.getAttribute("value");
  expect(documentId).not.toBeNull();
  const before=await page.evaluate(async(id)=>new Promise<Record<string,unknown>|null>((resolve,reject)=>{
    const open=indexedDB.open("arlovi-workspace");
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const req=db.transaction("records").objectStore("records").get(id);
      req.onsuccess=()=>{resolve(req.result?.fields??null);db.close();};
      req.onerror=()=>reject(req.error);
    };
  }),documentId!);
  await select.selectOption(documentId!);
  await page.getByRole("button",{name:/Link to/}).click();
  await expect(page.getByRole("complementary",{name:"Document preview"})).toBeVisible();
  const after=await page.evaluate(async(id)=>new Promise<Record<string,unknown>|null>((resolve,reject)=>{
    const open=indexedDB.open("arlovi-workspace");
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const req=db.transaction("records").objectStore("records").get(id);
      req.onsuccess=()=>{resolve(req.result?.fields??null);db.close();};
      req.onerror=()=>reject(req.error);
    };
  }),documentId!);
  expect(after).toEqual(before);
});
