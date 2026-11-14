import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1440]) {
  test(`primary actions stay visible at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/o/northline/fin/invoices");
    await expect(page.getByRole("heading", { level: 1, name: "Invoice List" })).toBeVisible();
    const create = page.locator("#main").getByRole("button", { name: "Create", exact: true });
    await expect(create).toBeVisible();
    const box = await create.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  });
}
