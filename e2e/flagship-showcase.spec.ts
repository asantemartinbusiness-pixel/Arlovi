import { expect, test } from "@playwright/test";

test("flagship showcase opens from Northline workspace and deep-links to native work", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  const gateway = page.getByRole("link", { name: /Enter the flagship/i });
  await expect(gateway).toBeVisible();
  await gateway.click();
  await expect(page).toHaveURL(/\/o\/northline\/workspace\/showcase$/);
  await expect(page.getByRole("heading", { level: 1, name: /Northline Collective/ })).toBeVisible();
  await expect(page.locator(".fs-work-card")).toHaveCount(6);
  const identity=page.locator(".fs-work-card").filter({hasText:"The Collective identity"});
  await expect(identity).toHaveAttribute("href","/o/northline/design/files/nl-designs-910");
  await expect(page.getByRole("link",{name:/Experience the website/})).toHaveAttribute("href","/northline-collective/");
  await identity.click();
  await expect(page).toHaveURL(/\/o\/northline\/design\/files\/nl-designs-910$/);
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
    await page.goto("/o/northline/workspace/showcase");
    await expect(page.locator(".fs-work-card")).toHaveCount(6);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("standalone editorial website exports a local enquiry instead of pretending to send mail",async ({page})=>{
  await page.goto("/northline-collective/");
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
