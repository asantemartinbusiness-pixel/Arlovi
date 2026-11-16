import { expect, test } from "@playwright/test";

/* The invoice list's primary header action must be visible and wholly inside
   the viewport at phone, tablet and desktop widths. */
const CLOCK = "clock=2026-11-14T09:30:00Z";

for (const width of [375, 768, 1440]) {
  test(`invoice list primary action stays inside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/o/northline/fin/invoices?${CLOCK}`);
    await expect(page.getByRole("heading", { level: 1, name: "Invoice List" })).toBeVisible();
    const create = page.locator(".pg-actions").getByRole("button", { name: "Create an invoice", exact: true });
    await expect(create).toBeVisible();
    await expect(create).toBeInViewport({ ratio: 1 });
    const box = await create.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
    // No horizontal page scroll at this width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
