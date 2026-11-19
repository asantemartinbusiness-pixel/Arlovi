import { expect, test } from "@playwright/test";

test("Finance → Projects → Finance returns to the exact view instead of Finance home", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Draft");
  await expect(page.locator(".hq-appnav-related summary")).toBeVisible();
  await page.locator(".hq-appnav-related summary").click();
  await page.locator(".hq-appnav-related-links").getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/project\//);
  const back = page.getByRole("navigation", { name: "Return to previous workspace" })
    .getByRole("button", { name: /Back to Finance/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/invoices\?tab=Draft/);
  await expect(back).toHaveCount(0);
});

test("navigation buttons and selected tabs do not render clipped circular strokes", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  const activeRail = page.locator('.hq-rail-btn[data-active="true"]').first();
  await expect(activeRail).toBeVisible();
  const railStyle = await activeRail.evaluate(element => ({
    radius: getComputedStyle(element).borderRadius,
    shadow: getComputedStyle(element).boxShadow,
  }));
  expect(railStyle.radius).not.toBe("50%");
  expect(railStyle.shadow).toBe("none");

  await page.goto("/o/northline/fin/invoices");
  const activeTab = page.locator('.ds-tab[aria-selected="true"]').first();
  await expect(activeTab).toBeVisible();
  expect(await activeTab.evaluate(element => getComputedStyle(element).boxShadow)).toBe("none");
});

test("an organisation switch never exposes the other organisation's return trail", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  await page.locator(".hq-appnav-related summary").click();
  await page.locator(".hq-appnav-related-links").getByRole("link", { name: "Projects" }).click();
  await expect(page.locator(".hq-journey-bar")).toBeVisible();
  await page.goto("/o/harbor/project/home");
  await expect(page.locator(".hq-journey-bar")).toHaveCount(0);
});
