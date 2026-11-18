import { expect, test } from "@playwright/test";

async function openScalePreferences(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  return page.getByRole("dialog", { name: "Display & scaling" });
}

test("new default is visually old 80%, shown as 100% in a 0–100 slider", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  const dialog = await openScalePreferences(page);
  const range = dialog.getByRole("slider", { name: "Interface scale" });
  await expect(range).toHaveAttribute("min", "0");
  await expect(range).toHaveAttribute("max", "100");
  await expect(range).toHaveValue("100");
  await expect(dialog.getByText("100% · Default")).toBeVisible();
  const rootScale = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--interface-scale").trim());
  expect(Number(rootScale)).toBeCloseTo(0.8);
});

test("the lowest labelled scale stays usable and reset restores default", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  const dialog = await openScalePreferences(page);
  const range = dialog.getByRole("slider", { name: "Interface scale" });
  await range.focus();
  await range.press("Home");
  await expect(range).toHaveValue("0");
  let scale = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--interface-scale").trim());
  expect(Number(scale)).toBeCloseTo(0.6);
  await dialog.getByRole("button", { name: "Reset defaults" }).click();
  await expect(range).toHaveValue("100");
  scale = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--interface-scale").trim());
  expect(Number(scale)).toBeCloseTo(0.8);
});

test("migrates existing saved 80 percent exactly once and survives reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("arlovi-ui")) {
      localStorage.setItem("arlovi-ui", JSON.stringify({ interfaceScale: 80, density: "compact" }));
    }
  });
  await page.goto("/o/northline/workspace/home");
  let dialog = await openScalePreferences(page);
  await expect(dialog.getByRole("slider", { name: "Interface scale" })).toHaveValue("100");
  await dialog.getByRole("button", { name: "Done" }).click();
  // Changing a setting persists the new scale schema version.
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: /Display & scaling/ }).click();
  dialog = page.getByRole("dialog", { name: "Display & scaling" });
  await dialog.getByRole("slider", { name: "Interface scale" }).focus();
  await dialog.getByRole("slider", { name: "Interface scale" }).press("ArrowLeft");
  await expect(dialog.getByRole("slider", { name: "Interface scale" })).toHaveValue("95");
  await page.reload();
  dialog = await openScalePreferences(page);
  await expect(dialog.getByRole("slider", { name: "Interface scale" })).toHaveValue("95");
  const savedVersion = await page.evaluate(() => JSON.parse(localStorage.getItem("arlovi-ui") ?? "{}").interfaceScaleVersion);
  expect(savedVersion).toBe(2);
});
