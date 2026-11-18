import { expect, test } from "@playwright/test";

/**
 * Design contract: entry and onboarding should feel like the same white/ink
 * working environment as Executive Home, not a separate blue illustration UI.
 */
test("entry uses Executive Home typography, action tokens and no simulated dashboard", async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/welcome");
  await expect(page.getByRole("heading",{name:/Make room for what matters/})).toBeVisible();
  await expect(page.locator(".entry-product")).toHaveCount(0);
  await expect(page.locator(".entry-editorial-row")).toHaveCount(3);
  const style = await page.locator(".entry-primary").first().evaluate(el => {
    const css = getComputedStyle(el);
    return { background:css.backgroundColor, radius:Number.parseFloat(css.borderTopLeftRadius), color:css.color };
  });
  expect(style.background).toBe("rgb(13, 13, 13)");
  expect(style.radius).toBeGreaterThanOrEqual(20);
  expect(style.color).toBe("rgb(255, 255, 255)");
});

for (const width of [375, 768, 1024, 1440]) {
  test("identity and four-stage setup avoid horizontal overflow at " + width + "px", async ({page}) => {
    await page.setViewportSize({width,height:844});
    for (const url of ["/welcome","/auth/sign-in","/choose-workspace","/setup"]) {
      await page.goto(url);
      await expect(page.locator("main")).toBeVisible();
      const overflow=await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url + " overflows horizontally at " + width).toBeLessThanOrEqual(1);
    }
  });
}

test("company setup shows factual summary and four stages instead of decorative metrics", async ({page}) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading",{name:"Start with your company."})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Company setup stages"}).getByRole("button")).toHaveCount(4);
  await expect(page.locator(".onb-blueprint-row")).toHaveCount(6);
  await expect(page.locator(".onb-blueprint-counters")).toHaveCount(0);
  await page.getByRole("textbox",{name:"Company name"}).fill("Editorial Studio");
  await expect(page.getByRole("complementary",{name:"Company setup context"})).toContainText("Editorial Studio");
});
