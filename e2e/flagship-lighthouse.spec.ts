import { expect, test } from "@playwright/test";

test("Lighthouse casefile follows actual project records across applications",async ({page})=>{
  await page.goto("/o/northline/workspace/showcase");
  const casefile=page.getByRole("link",{name:/Explore Lighthouse casefile/});
  await expect(casefile).toBeVisible();
  await casefile.click();
  await expect(page).toHaveURL(/\/o\/northline\/workspace\/showcase\/lighthouse$/);
  await expect(page.getByRole("heading",{level:1,name:/Light as architecture/})).toBeVisible();
  await expect(page.locator(".lh-stages .lh-stage")).toHaveCount(6);
  await expect(page.locator(".lh-measure")).toContainText("£185,000");
  await expect(page.locator(".lh-gate-banner")).toContainText("No external project delivery or approval has been verified");
  await page.getByRole("button",{name:"Design & research"}).click();
  await expect(page.locator(".lh-record")).toHaveCount(4);
  await expect(page.getByRole("link",{name:/Spatial concept boards/})).toHaveAttribute("href","/o/northline/design/files/nl-designs-911");
  await page.getByRole("button",{name:"Commercial"}).click();
  await expect(page.locator(".lh-record-grid")).toContainText("Deposit invoice");
  await expect(page.locator(".lh-note")).toContainText("unissued and unpaid");
});

test("Lighthouse's canonical draft portal exposes prepared documents, but no invited client",async ({page})=>{
  await page.goto("/o/northline/workspace/showcase/lighthouse");
  await page.getByRole("button",{name:"Client review"}).click();
  const readiness=page.locator(".lh-portal-readiness");
  await expect(readiness).toContainText("5");
  await expect(readiness).toContainText("3");
  await expect(readiness).toContainText("0");
  await expect(readiness).toContainText("Client review is not released");
  const builder=page.getByRole("link",{name:/Open internal Portal Builder/});
  await expect(builder).toHaveAttribute("href","/o/northline/portal/portals/nl-portals-900/builder");
  await builder.click();
  await expect(page).toHaveURL(/\/o\/northline\/portal\/portals\/nl-portals-900\/builder$/);
});

test("Harbor cannot see Northline's internal Lighthouse casefile",async ({page})=>{
  await page.goto("/o/harbor/workspace/showcase/lighthouse");
  await expect(page.getByRole("heading",{name:"Internal casefile unavailable"})).toBeVisible();
  await expect(page.locator(".lh-stages")).toHaveCount(0);
});

for(const width of [390,820,1440]){
  test("Lighthouse casefile has no horizontal overflow at "+width+"px",async ({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto("/o/northline/workspace/showcase/lighthouse");
    await expect(page.locator(".lh-cover")).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
