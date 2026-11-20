import { expect, test } from "@playwright/test";

test("flagship showcase opens from Northline workspace and deep-links to native work", async ({ page }) => {
  await page.goto("/o/collective/workspace/home");
  const gateway = page.getByRole("link", { name: /Enter the flagship/i });
  await expect(gateway).toBeVisible();
  await gateway.click();
  await expect(page).toHaveURL(/\/o\/collective\/workspace\/showcase$/);
  await expect(page.getByRole("heading", { level: 1, name: /Northline Collective/ })).toBeVisible();
  await expect(page.locator(".fs-work-card")).toHaveCount(6);
  const identity=page.locator(".fs-work-card").filter({hasText:"The Collective identity"});
  await expect(identity).toHaveAttribute("href","/o/collective/design/files/nl-designs-910");
  await expect(page.getByRole("link",{name:/Experience the website/})).toHaveAttribute("href","/northline-collective/index.html");
  await identity.click();
  await expect(page).toHaveURL(/\/o\/collective\/design\/files\/nl-designs-910$/);
  await expect(page.getByText("The route", { exact:false })).toHaveCount(0);
});

test("flagship company access cannot reveal Northline story from Harbor workspace", async ({page}) => {
  await page.goto("/o/harbor/workspace/showcase");
  await expect(page.getByRole("heading",{name:"This showcase is not in this organisation"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Return to your workspace"}))
    .toHaveAttribute("href","/o/harbor/workspace/home");
  await expect(page.locator(".fs-work-card")).toHaveCount(0);
});

for (const width of [390,834,1440]){
  test("flagship editorial hub reflows without horizontal page overflow at "+width+"px",async ({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto("/o/collective/workspace/showcase");
    await expect(page.locator(".fs-work-card")).toHaveCount(6);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("standalone editorial website exports a local enquiry instead of pretending to send mail",async ({page})=>{
  await page.goto("/northline-collective/index.html");
  await expect(page.getByRole("heading",{level:1,name:/Material.*Space.*Experience/})).toBeVisible();
  await page.getByRole("textbox",{name:"Your name"}).fill("Demo Person");
  await page.getByRole("textbox",{name:"Your email"}).fill("demo@example.invalid");
  await page.getByLabel("What are we imagining?").selectOption({label:"Objects and collections"});
  await page.getByRole("textbox",{name:"Tell us the idea"}).fill("A quiet collection of repairable reading lights.");
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:/Download demo enquiry/}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe("northline-collective-demo-brief.txt");
  await expect(page.getByRole("status")).toContainText("Nothing was sent");
});

test("flagship showcase reads its 12-month financial scenario from records, not hardcoded KPIs",async ({page})=>{
  await page.goto("/o/collective/workspace/showcase");
  await expect(page.getByRole("heading",{name:/The business, in numbers/})).toBeVisible();
  await expect(page.locator(".fs-bar-item")).toHaveCount(12);
  await expect(page.locator(".fs-scenario-total")).toContainText("£9,600,000");
  await expect(page.locator(".fs-scenario-heading")).toContainText("not recognised revenue");
  await expect(page.locator(".fs-scenario-division")).toContainText("Read-only simulation");
});
