import { expect, test } from "@playwright/test";

for (const category of ["Headquarters", "Intelligence", "Operations", "Studio"]) {
  test(`${category} category offers direct native work areas and an easy return route`, async ({ page }) => {
    await page.goto(`/o/northline/workspace/apps?category=${category}`);
    const region = page.getByRole("region", { name: `${category} application overview` });
    await expect(region).toBeVisible();
    await expect(region.getByText("tools available in this role view")).toBeVisible();
    const first = page.locator(".apps-directory-card").first();
    await expect(first.locator(".apps-directory-card-links a").first()).toBeVisible();
    const href = await first.locator(".apps-directory-card-links a").first().getAttribute("href");
    expect(href).toMatch(/^\/o\/northline\//);
    expect(href).not.toMatch(/:id|:slug/);
    await first.locator(".apps-directory-card-links a").first().click();
    await expect(page).toHaveURL(new RegExp(`${href?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    const sidebar = page.locator(".hq-appnav");
    await expect(sidebar.getByRole("link", { name: "All applications" })).toHaveAttribute(
      "href", `/o/northline/workspace/apps?category=${category}`,
    );
    await sidebar.locator(".hq-appnav-related summary").click();
    await expect(sidebar.locator(".hq-appnav-related-links a").first()).toBeVisible();
  });
}

test("all category navigation remains usable at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/o/northline/workspace/apps?category=Studio");
    await expect(page.getByRole("region", { name: "Studio application overview" })).toBeVisible();
    await expect(page.locator(".apps-directory-open")).toHaveCount(8);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
