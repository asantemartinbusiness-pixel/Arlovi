import { expect, test } from "@playwright/test";

const areas = [
  {path:"home",heading:"My Workspace",inside:"MY DAY",outside:"Company overview"},
  {path:"company",heading:"Company Headquarters",inside:"ORGANISATION",outside:"My tasks & projects"},
  {path:"spaces",heading:"Spaces",inside:"WORKSPACES",outside:"Account & data"},
  {path:"work",heading:"Work",inside:"DELIVERY",outside:"Files & resources"},
  {path:"apps",heading:"Applications",inside:"APPLICATIONS",outside:"Company overview"},
] as const;

for(const area of areas) {
  test(`${area.path} has its own contextual secondary navigation`,async({page})=>{
    await page.goto(`/o/northline/workspace/${area.path}`);
    const navigation = page.getByRole("navigation",{name:`${area.heading} navigation`});
    await expect(navigation).toBeVisible();
    await expect(navigation).toContainText(area.inside);
    await expect(navigation).not.toContainText(area.outside);
    await expect(page.locator('.hq-rail-btn[data-active="true"]')).toHaveCount(1);
    await expect(page.getByRole("navigation",{name:"Primary navigation"}).getByRole("link",{name:area.path==="apps"?"Apps":area.path.charAt(0).toUpperCase()+area.path.slice(1)})).toHaveAttribute("aria-current","page");
  });
}
test("auxiliary pages retain the correct owning rail section",async({page})=>{
  for(const [section,rail] of [["recent","Home"],["resources","Spaces"],["people","Company"],["account","Company"],["health","Company"]]) {
    await page.goto(`/o/northline/workspace/${section}`);
    await expect(page.locator('.hq-rail-btn[data-active="true"]')).toHaveCount(1);
    await expect(page.getByRole("navigation",{name:"Primary navigation"}).getByRole("link",{name:rail})).toHaveAttribute("aria-current","page");
  }
});
test("workspace detail tabs are deep-linked, durable, and in contextual navigation",async({page})=>{
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  const url=new URL(page.url());
  const detail=url.pathname;
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await expect(page).toHaveURL(/\?tab=files/);
  await page.reload();
  await expect(page.getByRole("heading",{name:"Files & resources"})).toBeVisible();
  const detailNavigation=page.getByRole("navigation",{name:/navigation$/}).filter({has:page.getByRole("link",{name:"Files",exact:true})});
  await expect(detailNavigation.getByRole("link",{name:"Files",exact:true})).toHaveAttribute("aria-current","page");
  await page.goto(detail+"?tab=people");
  await expect(page.getByRole("heading",{name:"People & collaboration"})).toBeVisible();
});
