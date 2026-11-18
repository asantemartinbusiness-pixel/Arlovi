import { expect, test } from "@playwright/test";

test("display scaling and density save under the new 0–100 control", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  const dialog = page.getByRole("dialog", { name: "Display & scaling" });
  const slider = dialog.getByRole("slider", { name: "Interface scale" });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "100");
  await slider.focus();
  await slider.press("Home");
  for (let step = 0; step < 10; step++) await slider.press("ArrowRight");
  await expect(dialog.locator("output")).toHaveText("50%");
  await expect.poll(() => page.locator("html").evaluate(el =>
    getComputedStyle(el).getPropertyValue("--interface-scale").trim())).toBe("0.7");
  await dialog.getByRole("radio", { name: "Compact" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  await expect(page.getByRole("dialog", { name: "Display & scaling" }).locator("output")).toHaveText("50%");
  await page.getByRole("button", { name: "Reset defaults" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "balanced");
  await expect(page.getByRole("dialog", { name: "Display & scaling" }).locator("output")).toHaveText("100%");
  await expect.poll(() => page.locator("html").evaluate(el =>
    getComputedStyle(el).getPropertyValue("--interface-scale").trim())).toBe("0.8");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  for (const scale of [0, 25, 50, 75, 100]) {
    test(`display scales at ${scale}% on ${viewport.width}px viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => {
        localStorage.setItem("arlovi-ui", JSON.stringify({
          interfaceScale: value, interfaceScaleVersion: 2, density: "balanced",
        }));
      }, scale);
      await page.goto("/o/northline/workspace/home");
      await expect(page.locator("#main")).toBeVisible();
      const actualScale = 0.6 + (0.8 - 0.6) * scale / 100;
      const rendered = await page.locator("html").evaluate(el =>
        Number(getComputedStyle(el).getPropertyValue("--interface-scale")));
      expect(rendered).toBeCloseTo(actualScale);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow, "Document should not overflow horizontally").toBe(false);
    });
  }
}
