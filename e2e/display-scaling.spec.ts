import { expect, test } from "@playwright/test";

test("display scaling saves and restores global preference", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  const dialog = page.getByRole("dialog", { name: "Display & scaling" });
  await expect(dialog).toBeVisible();
  const slider = dialog.getByRole("slider", { name: "Interface scale" });
  await slider.evaluate((node: HTMLInputElement) => { node.value = "125"; node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect(dialog.locator("output")).toHaveText("125%");
  await expect.poll(() => page.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--interface-scale").trim())).toBe("1.25");
  await dialog.getByText("Compact", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-scale-tier", "large");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  await expect(page.getByRole("dialog", { name: "Display & scaling" }).locator("output")).toHaveText("125%");
  await page.getByRole("button", { name: "Reset defaults" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-scale-tier", "standard");
  await expect(page.locator("html")).toHaveAttribute("data-density", "balanced");
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  for (const scale of [75, 100, 125, 150]) {
    test(`display scales at ${scale}% on ${viewport.width}px viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => {
        localStorage.setItem("arlovi-ui", JSON.stringify({ interfaceScale: value, density: "balanced" }));
      }, scale);
      await page.goto("/o/northline/workspace/home");
      await expect(page.locator("#main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-scale-tier", scale >= 120 ? "large" : scale <= 85 ? "small" : "standard");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow, "Document should not overflow horizontally").toBe(false);
    });
  }
}
