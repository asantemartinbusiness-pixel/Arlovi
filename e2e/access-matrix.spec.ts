import { expect, test } from "@playwright/test";

test("administrator can inspect and save view/edit policy drafts without changing live access", async ({page})=>{
  await page.goto("/o/northline/admin/roles?tab=Roles");
  const workspace=page.getByRole("region",{name:"Roles and application access workspace"});
  await workspace.getByRole("button",{name:/Configure view & edit rights/}).click();
  const matrix=page.getByRole("region",{name:"View and edit permissions matrix"});
  await expect(matrix.getByText("Proposed permissions only — not applied to employees")).toBeVisible();
  await matrix.getByLabel("Application FIN view rule").selectOption("deny");
  await expect(matrix.getByLabel("Application FIN view rule")).toHaveValue("deny");
  await expect(matrix.getByText("Unsaved changes")).toBeVisible();
  await matrix.getByRole("button",{name:"Save permission draft"}).click();
  await expect(matrix.getByText("Saved draft",{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole("region",{name:"Roles and application access workspace"})
    .getByRole("button",{name:/Configure view & edit rights/}).click();
  await expect(page.getByLabel("Application FIN view rule")).toHaveValue("deny");
  await expect(page.getByText("Proposed permissions only — not applied to employees")).toBeVisible();
});

test("page rules, denied application views and review summary remain coherent",async({page})=>{
  await page.goto("/o/northline/admin/roles?tab=Roles");
  const workspace=page.getByRole("region",{name:"Roles and application access workspace"});
  await workspace.getByRole("button",{name:/Configure view & edit rights/}).click();
  const matrix=page.getByRole("region",{name:"View and edit permissions matrix"});
  await matrix.getByLabel("Application FIN view rule").selectOption("deny");
  await matrix.getByRole("button",{name:"Page permissions"}).click();
  await matrix.getByLabel("Select application for page permissions").selectOption("FIN");
  await expect(matrix.getByRole("region",{name:"Page permission table"})).toBeVisible();
  await matrix.getByRole("button",{name:/Review changes/}).click();
  await expect(matrix.getByText("view: deny")).toBeVisible();
  await matrix.getByRole("button",{name:"Discard changes"}).click();
  await expect(matrix.getByText("No overrides yet. The role follows its inherited template.")).toBeVisible();
});

test("role permission editor is usable at mobile viewport without outer document overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/o/northline/admin/roles?tab=Roles");
  await page.getByRole("button",{name:/Configure view & edit rights/}).click();
  await expect(page.getByRole("region",{name:"Application permission table"})).toBeVisible();
  await expect(page.getByLabel("Application FIN edit rule")).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
