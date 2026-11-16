import { expect, test } from "@playwright/test";

test("Apps directory exposes all tools with capability search and category navigation", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps");
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
  await expect(page.locator(".apps-directory-open")).toHaveCount(35);
  const search = page.getByRole("textbox", { name: "Find an application" });
  await search.fill("invoices");
  await expect(page.getByRole("link", { name: "Finance", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Design", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/q=invoices/);
  await page.getByRole("button", { name: "Clear application search" }).click();
  await page.getByRole("navigation", { name: "Application categories" })
    .getByRole("button", { name: /^Studio/ }).click();
  await expect(page.locator(".apps-directory-open")).toHaveCount(8);
  await expect(page).toHaveURL(/category=Studio/);
  await page.reload();
  await expect(page.locator(".apps-directory-open")).toHaveCount(8);
});

test("pinning an app updates native navigation and remains scoped to the company", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps");
  const pin = page.getByRole("button", { name: "Pin Finance" });
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(page.getByRole("button", { name: "Unpin Finance" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Finance" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Unpin Finance" })).toBeVisible();
  await page.getByRole("button", { name: /Switch company/ }).click();
  await page.getByRole("menuitem", { name: /Harbor Supply/ }).click();
  await expect(page).toHaveURL(/\/o\/harbor\/workspace\/apps$/);
  await expect(page.getByRole("button", { name: "Pin Finance" })).toBeVisible();
});

test("role view hides unavailable native applications without claiming authentication", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: "Client", exact: true }).click();
  await expect(page.locator(".apps-directory-open")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Portals", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finance", exact: true })).toHaveCount(0);
  await expect(page.getByText(/they do not grant cloud account access/)).toBeVisible();
});

for (const width of [390, 820, 1440]) {
  test("Apps hub stays usable without horizontal overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/workspace/apps");
    await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Find an application" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pin Finance" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
