import { expect, test } from "@playwright/test";

for (const width of [320, 360, 390, 768, 1024, 1366, 1920]) {
  test("headquarters remains readable and navigable at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 390 ? 640 : 768 });
    await page.goto("/o/northline/hq/home");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const horizontal = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontal).toBeLessThanOrEqual(1);

    if (width < 1024) {
      const bottom = page.locator(".hq-bottom");
      await expect(bottom).toBeVisible();
      for (const target of await bottom.locator("a, button").all()) {
        const box = await target.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const open = page.getByRole("button", { name: "Open navigation" });
      await open.click();
      await expect(page.locator(".hq")).toHaveAttribute("data-nav-open", "true");
      await page.getByRole("button", { name: "Close navigation" }).first().click();
      await expect(page.locator(".hq")).toHaveAttribute("data-nav-open", "false");
    } else {
      await expect(page.locator(".hq-appnav")).toBeVisible();
      await expect(page.locator(".hq-bottom")).toBeHidden();
    }
  });
}

test("the search shortcut opens the same command palette as the header control", async ({ page }) => {
  await page.goto("/o/northline/hq/home");
  await expect(page.locator(".hq-search")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
