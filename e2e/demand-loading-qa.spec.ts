import { expect, test } from "@playwright/test";
const appRoutes: Record<string, string> = {
  FIN: "/o/northline/fin/home",
  DOCS: "/o/northline/docs/files",
  PROJECT: "/o/northline/project/portfolios",
  COMMS: "/o/northline/comms/home",
};

test("all five headquarters areas load in a real Chromium viewport", async ({ page }, testInfo) => {
  const areas = ["home", "company", "spaces", "work", "apps"] as const;
  for (const area of areas) {
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on("pageerror", onError);
    await page.goto(`/o/northline/workspace/${area}`);
    await expect(page.locator(".hq-main h1").first()).toBeVisible();
    await expect(page.locator(".hq-rail")).toBeAttached();
    await expect(page.locator(".hq-appnav-head")).toBeAttached();
    expect(errors, `${area} should not throw a browser runtime exception`).toEqual([]);
    page.off("pageerror", onError);
  }
  await testInfo.attach("viewport", {
    body: Buffer.from(JSON.stringify(page.viewportSize())),
    contentType: "application/json",
  });
});

test("native app is not eagerly requested from an untouched headquarters session", async ({ page }) => {
  const native = "/src/applications/fin/index";
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes(native)) requests.push(request.url()); });
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-main h1").first()).toBeVisible();
  await page.waitForTimeout(1200);
  expect(requests, "Finance must not be fetched automatically on Home").toHaveLength(0);

  await page.goto(appRoutes.FIN);
  await expect.poll(() => requests.length, {timeout:30000}).toBeGreaterThan(0);
  await expect(page.getByText(/Finance.*did not load/)).toHaveCount(0);
});

test("lazy native destinations work after direct navigation and reload", async ({ page }) => {
  for (const code of ["DOCS", "PROJECT", "COMMS"] as const) {
    await page.goto(appRoutes[code]);
    const expectedName = {DOCS:"Docs",PROJECT:"Projects",COMMS:"Communications"}[code];
    await expect(page.locator(".hq-appnav-head")).toContainText(expectedName, {timeout:30000});
    await expect(page.getByText(/did not load/)).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator(".hq-appnav-head")).toContainText("Communications", {timeout:30000});
});

test("navigation and document workspaces retain working deep links", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  await expect(page.locator(".hq-main h1").first()).toBeVisible();
  const project = page.locator('a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button",{name:"Files",exact:true}).click();
  await expect(page).toHaveURL(/tab=files/);
  await page.reload();
  await expect(page.getByRole("heading",{name:"Resources"})).toBeVisible({timeout:30000});
});
