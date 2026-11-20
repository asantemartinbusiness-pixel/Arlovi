import { expect, test } from "@playwright/test";

test("redesigned personal workspace exposes useful routes without horizontal overflow", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.getByRole("heading", { name: /need you today|waiting on you/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Waiting on you" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Assigned work" })).toBeVisible();
  await page.getByRole("link", { name: /Assigned to me/ }).click();
  await expect(page).toHaveURL(/\/workspace\/work$/);
  await expect(page.getByRole("heading", { name: "Tasks & assignments" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("project task desk filters and record history are deep-linked", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  await expect(page.getByRole("button", { name: "Assigned to me" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All open" })).toBeVisible();
  await page.getByRole("button", { name: "All open" }).click();
  await expect(page.getByRole("button", { name: "All open" })).toHaveAttribute("aria-pressed","true");
  const project = page.locator('.ww-projects a[href*="/workspace/work/project/"]').first();
  await expect(project).toBeVisible();
  await project.click();
  await page.getByRole("button", { name: "Tasks & work" }).click();
  await expect(page.getByRole("heading", { name: "Every task, one clear view." })).toBeVisible();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity & changes" })).toBeVisible();
  await page.getByRole("button", { name: "Linked work" }).click();
  await expect(page.getByRole("button", { name: "Linked work" })).toHaveAttribute("aria-pressed","true");
});

for (const width of [390,768,1440]) {
  test(`workspace screens avoid horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900});
    for (const route of ["home","work","recent"]) {
      await page.goto(`/o/northline/workspace/${route}`);
      await expect(page.getByRole("heading", { level:1 }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} @ ${width}px`).toBeLessThanOrEqual(1);
    }
  });
}
