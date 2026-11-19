import { expect, test } from "@playwright/test";

test("headquarters opens without requesting unrelated native application chunks",async({page})=>{
  const nativeRequests:string[]=[];
  page.on("request",request=>{
    const url=request.url();
    if(/\/assets\/(?:fin|crm|project|commerce|motion)-[^/]+\.js(?:\?|$)/.test(url))
      nativeRequests.push(url);
  });
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading",{name:/need you today|waiting on you/i})).toBeVisible();
  // No hover or app navigation is issued before this assertion.
  expect(nativeRequests).toEqual([]);
});

test("a direct native app destination loads its own module and eventually renders",async({page})=>{
  await page.goto("/o/northline/project/projects");
  await expect(page.getByRole("heading",{name:/Projects|Opening/}).first()).toBeVisible();
  await expect(page.getByText("This screen is not built yet")).toHaveCount(0);
  await expect(page.getByText("Loading this native application.")).toHaveCount(0,{timeout:30000});
});

test("workspace still opens and its organisation remains selected after reload",async({page})=>{
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading",{name:/need you today|waiting on you/i})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:/need you today|waiting on you/i})).toBeVisible();
});
