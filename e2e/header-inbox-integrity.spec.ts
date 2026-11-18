import { expect, test } from "@playwright/test";

test("header decision and notification controls remain distinct and accessible on each viewport",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  const header=page.locator(".hq-header");
  await expect(header).toBeVisible();
  const inbox=header.getByRole("button",{name:/Inbox and decisions/});
  const notifications=header.getByRole("button",{name:/Notifications/});
  await expect(inbox).toBeVisible();
  await expect(notifications).toBeVisible();
  await inbox.click();
  await expect(page.getByRole("heading",{name:"Inbox & decisions"})).toBeVisible();
  await page.keyboard.press("Escape");
  await notifications.click();
  await expect(page.getByRole("heading",{name:"Notifications"})).toBeVisible();
  await expect(page.getByText("Reading is not approval.")).toBeVisible();
});

test("header stays within available screen width and remains usable on a project detail",async({page})=>{
  await page.goto("/o/northline/workspace/work");
  await expect(page.locator(".hq-header")).toBeVisible();
  const project=page.locator('.ww-projects a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await expect(page.getByRole("navigation",{name:"Current workspace context"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});
