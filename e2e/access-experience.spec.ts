import {expect,test} from "@playwright/test";

test("roles workspace includes all native apps and categorised role templates",async({page})=>{
  await page.goto("/o/northline/admin/roles?tab=Roles");
  await expect(page.getByRole("heading",{name:"Understand who can access what."})).toBeVisible();
  const workbench=page.getByRole("region",{name:"Roles and application access workspace"});
  await expect(workbench.getByText("35",{exact:true})).toBeVisible();
  await workbench.getByLabel("Inspect role template").selectOption("employee");
  await expect(workbench.getByText("Template access").first()).toBeVisible();
  await workbench.getByLabel("Application category").selectOption("Operations");
  await expect(workbench.getByText("Application access",{exact:true})).toHaveCount(0);
});

test("sensitive screens and policy simulation can be inspected without granting access",async({page})=>{
  await page.goto("/o/northline/admin/roles?tab=Roles");
  const workbench=page.getByRole("region",{name:"Roles and application access workspace"});
  await workbench.getByRole("button",{name:"Pages & sensitive data"}).click();
  await workbench.getByLabel("Application to inspect").selectOption("HR");
  await expect(workbench.getByText("Payroll",{exact:true})).toBeVisible();
  await expect(workbench.getByText("Sensitive — explicit scope required").first()).toBeVisible();
  await workbench.getByRole("button",{name:"Permission simulator"}).click();
  await expect(workbench.getByText("This is an illustrative policy evaluation",{exact:false})).toBeVisible();
  await workbench.getByRole("checkbox",{name:"Add explicit example grant"}).check();
  await workbench.getByRole("checkbox",{name:"Explicit deny"}).check();
  await expect(workbench.getByText("explicit deny",{exact:false})).toBeVisible();
});

test("access workbench reflows at mobile size",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/o/northline/admin/roles?tab=Roles");
  await expect(page.getByRole("heading",{name:"Understand who can access what."})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
