import { expect, test } from "@playwright/test";

test("workspace health is read-only and shows company-scoped diagnostics",async({page})=>{
  await page.goto("/o/northline/workspace/health");
  await expect(page.getByRole("heading",{level:1,name:"Workspace health"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Workspace diagnostics"})).toBeVisible();
  await expect(page.getByText("Company records", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Application loading/ })).toBeVisible();
  await expect(page.getByRole("link",{name:/Go to account & company archive/})).toBeVisible();
  await page.getByRole("button",{name:"Run checks"}).click();
  await expect(page.getByRole("heading",{name:/Data integrity/})).toBeVisible();
  await page.getByRole("link",{name:/Go to account & company archive/}).click();
  await expect(page).toHaveURL(/\/workspace\/account$/);
});

test("workspace auxiliary sections use correct contextual sidebar title",async({page})=>{
  for(const [path,title] of [["health","Workspace health"],["resources","Files & resources"],["people","People & collaboration"],["account","Account & data"],["recent","Recent & saved"]]) {
    await page.goto(`/o/northline/workspace/${path}`);
    await expect(page.getByRole("navigation",{name:`${title} navigation`})).toBeVisible();
    await expect(page.locator('.hq-rail-btn[data-active="true"]')).toHaveCount(1);
  }
});

test("keyboard navigation focuses page heading after a route change",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("link",{name:"Work",exact:true}).first().click();
  await expect(page).toHaveURL(/\/workspace\/work$/);
  await expect(page.locator(".hq-scroll h1").first()).toBeFocused();
});
