import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as {
  screens: { id: string; route: string; applicationCode: string; sampleId: string }[];
};

/** One screen per application, so every app is checked rather than four routes. */
const sample = Object.values(
  catalog.screens.reduce<Record<string, (typeof catalog.screens)[number]>>((acc, screen) => {
    acc[screen.applicationCode] ??= screen;
    return acc;
  }, {}),
);

for (const screen of sample) {
  test(`axe ${screen.applicationCode} ${screen.id}`, async ({ page }) => {
    const route = `${screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult")}?clock=2026-11-14T09:30:00Z`;
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious.map((item) => `${item.id}: ${item.help} (${item.nodes.length})`)).toEqual([]);
  });
}

test("dark appearance keeps contrast", async ({ page }) => {
  await page.goto("/o/northline/hq/home?clock=2026-11-14T09:30:00Z");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.waitForTimeout(200);
  const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
  const contrast = results.violations.filter((item) => item.id === "color-contrast");
  expect(contrast.map((item) => item.nodes.map((node) => node.html.slice(0, 120)))).toEqual([]);
});

test("keyboard reaches the main content and the command palette", async ({ page }) => {
  await page.goto("/o/northline/hq/home?clock=2026-11-14T09:30:00Z");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // Route navigation moves focus to its page h1. Verify the skip action
  // explicitly instead of assuming a fresh document's first Tab position.
  const skip=page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: /Search Northline/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Search Northline/ })).toBeHidden();
});
