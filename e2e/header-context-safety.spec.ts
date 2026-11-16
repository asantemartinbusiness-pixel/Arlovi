import { expect, test } from "@playwright/test";

test("switching companies from project Files returns to the target company's Work area", async ({page})=>{
  await page.goto("/o/northline/workspace/work");
  const project=page.locator('.ws-entry-list a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await expect(page).toHaveURL(/tab=files/);
  await page.getByRole("button",{name:/Switch company/}).click();
  await page.getByRole("menuitem",{name:/Harbor Supply/}).click();
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/work$/);
  await expect(page.locator(".hq-header")).toBeVisible();
});

test("switching companies from Company utilities preserves a safe section", async ({page})=>{
  await page.goto("/o/northline/workspace/people");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button",{name:/Switch company/}).click();
  await page.getByRole("menuitem",{name:/Harbor Supply/}).click();
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/people$/);
});

test("search does not expose synthetic detail URLs and keeps keyboard focus inside its modal",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog=page.getByRole("dialog",{name:/Search Northline/});
  const search=dialog.getByRole("combobox",{name:/Search screens, records and actions/});
  await expect(search).toBeFocused();
  await expect(dialog.locator('[role="option"][id^="page-"]')).not.toHaveAttribute("data-synthetic","true");
  const urls=await dialog.locator('[role="option"][id^="page-"]').count();
  expect(urls).toBeGreaterThan(0);
  await search.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await search.focus();
  await search.fill("files and resources");
  await expect(dialog.getByRole("option",{name:/Open files and resources/})).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/resources$/);
});

test("account menu and search survive navigation between two native applications",async({page})=>{
  await page.goto("/o/northline/workspace/apps");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.getByRole("button",{name:/Profile and preferences/}).click();
  await expect(page.getByText(/Role view \(not a security boundary\)/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox",{name:/Search screens, records and actions/}).fill("Account and data settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workspace\/account$/);
});
