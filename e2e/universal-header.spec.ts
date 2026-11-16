import { expect, test } from "@playwright/test";

test("universal header exposes company, search, assistant, decisions, updates and profile", async ({page}) => {
  await page.goto("/o/northline/workspace/home");
  const header=page.locator(".hq-header");
  await expect(header).toBeVisible();
  await expect(header.getByRole("button",{name:/Switch company, current Northline Atelier/})).toBeVisible();
  await expect(header.getByRole("button",{name:/Search anything in Northline/})).toBeVisible();
  await expect(header.getByRole("button",{name:"Ask Arlovi"})).toBeVisible();
  await expect(header.getByRole("button",{name:/Inbox and decisions/})).toBeVisible();
  await expect(header.getByRole("button",{name:/Notifications/})).toBeVisible();
  await expect(header.getByRole("button",{name:/Profile and preferences/})).toBeVisible();
});

test("company switcher preserves safe context and cannot imply authenticated membership",async({page})=>{
  await page.goto("/o/northline/workspace/company");
  await page.getByRole("button",{name:/Switch company/}).click();
  await expect(page.getByText(/Companies here are browser-local/)).toBeVisible();
  await page.getByRole("menuitem",{name:/Harbor Supply/}).click();
  await expect(page).toHaveURL(/\/o\/harbor\//);
  await expect(page.getByRole("button",{name:/Switch company, current Harbor Supply/})).toBeVisible();
});

test("global search and native quick destinations are keyboard usable",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog",{name:/Search Northline Atelier/})).toBeVisible();
  await page.getByRole("combobox",{name:/Search screens, records and actions/}).fill("files and resources");
  await expect(page.getByRole("option",{name:/Open files and resources/})).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/resources$/);
});

test("decision inbox, notifications and local assistant are mutually exclusive",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button",{name:/Inbox and decisions/}).click();
  await expect(page.getByRole("heading",{name:"Inbox & decisions"})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:/Notifications/}).click();
  await expect(page.getByRole("heading",{name:"Notifications"})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Ask Arlovi"}).click();
  await expect(page.getByText("No language model is connected")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("profile menu keeps local role views and appearance settings separate from real account access",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button",{name:/Profile and preferences/}).click();
  await expect(page.getByText(/Role view \(not a security boundary\)/)).toBeVisible();
  await page.getByRole("menuitem",{name:"Account & data readiness"}).click();
  await expect(page).toHaveURL(/\/workspace\/account$/);
});

test("nested project context row persists across page refresh",async({page})=>{
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('.ws-entry-list a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  const context=page.getByRole("navigation",{name:"Current workspace context"});
  await expect(context).toContainText("Files");
  await page.reload();
  await expect(context).toContainText("Files");
  await expect(context.getByRole("link",{name:"Open Docs"})).toBeVisible();
});

test("header fits within the viewport without horizontal page overflow",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  const geometry=await page.evaluate(()=>{
    const header=document.querySelector(".hq-header")!.getBoundingClientRect();
    const buttons=[...document.querySelectorAll(".hq-header button")].map(node=>node.getBoundingClientRect());
    return {headerRight:header.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,outsiders:buttons.filter(b=>b.left<0||b.right>innerWidth).length};
  });
  expect(geometry.overflow).toBe(false);
  expect(geometry.headerRight).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.outsiders).toBe(0);
});
