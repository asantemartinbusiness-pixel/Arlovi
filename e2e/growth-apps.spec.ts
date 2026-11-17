import { expect, test } from "@playwright/test";

test("Growth directory exposes five apps and registered work-area shortcuts", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps?category=Growth");
  await expect(page.getByRole("heading", { name: "Reach, sell, serve and collaborate" })).toBeVisible();
  await expect(page.locator(".apps-directory-open")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Marketing: Campaigns" }))
    .toHaveAttribute("href", "/o/northline/market/campaigns");
  await expect(page.getByRole("link", { name: "Bookings: Calendar" }))
    .toHaveAttribute("href", "/o/northline/book/calendar");
  await expect(page.getByRole("link", { name: "Procurement: Receiving" }))
    .toHaveAttribute("href", "/o/northline/proc/receiving");
  await expect(page.getByRole("link", { name: "Portals: Portal directory" }))
    .toHaveAttribute("href", "/o/northline/portal/portals");

  await page.getByRole("link", { name: "Commerce: Orders" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/commerce\/orders$/);
  const sidebar = page.getByRole("navigation", { name: "Commerce navigation" });
  await expect(sidebar.getByRole("link", { name: "All applications" }))
    .toHaveAttribute("href", "/o/northline/workspace/apps?category=Growth");
  await sidebar.getByText("Other Growth apps").click();
  await expect(sidebar.getByRole("link", { name: "Marketing" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Marketing" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/market\/home$/);
});

test("Growth app entry screens offer native work areas without synthetic record links", async ({ page }) => {
  await page.goto("/o/northline/market/home");
  const overview = page.getByRole("region", { name: "Marketing & Growth workflow shortcuts" });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("link", { name: "Content calendar" }))
    .toHaveAttribute("href", "/o/northline/market/calendar");
  await expect(overview.getByRole("link", { name: "Explore products and orders" }))
    .toHaveAttribute("href", "/o/northline/commerce/home");

  await page.goto("/o/northline/portal/portals");
  const portal = page.getByRole("region", { name: "Client & Partner Portals workflow shortcuts" });
  await expect(portal).toBeVisible();
  await expect(portal.getByText(/Choose a portal below/)).toBeVisible();
  await expect(portal.locator("a[href*=':id']")).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  test(`Growth directory and overview fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/workspace/apps?category=Growth");
    await expect(page.getByRole("heading", { name: "Reach, sell, serve and collaborate" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Procurement: Purchase orders" })).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto("/o/northline/book/home");
    await expect(page.getByRole("region", { name: "Bookings & Capacity workflow shortcuts" })).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
