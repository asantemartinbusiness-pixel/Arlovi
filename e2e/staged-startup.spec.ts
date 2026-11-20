import { expect, test } from "@playwright/test";

test("workspace opens with core company data while native apps register",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading",{name:/need you today|waiting on you/i})).toBeVisible();
  await expect(page.getByRole("navigation",{name:/navigation/}).first()).toBeVisible();
});

test("deep-linked native application does not fall into missing implementation during deferred registration",async({page})=>{
  await page.goto("/o/northline/project/projects");
  await expect(page.getByText("This screen is not built yet")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:/Projects|Opening/}).first()).toBeVisible();
  await expect(page.getByText("This screen is not built yet")).toHaveCount(0);
});

test("background contributors preserve customer-created local work across reload",async({page})=>{
  await page.goto("/o/northline/workspace/work");
  await expect(page.getByRole("heading",{name:"Projects"})).toBeVisible();
  await page.goto("/o/northline/workspace/home");
  await page.reload();
  await expect(page.getByRole("heading",{name:/need you today|waiting on you/i})).toBeVisible();
});
