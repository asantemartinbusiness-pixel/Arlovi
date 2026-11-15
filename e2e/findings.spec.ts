import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/* Findings from the journeys that no journey asserts (see docs/implementation/defects.json). */

const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as {
  screens: { id: string; route: string; sampleId: string }[];
};
const CLOCK = "clock=2026-11-14T09:30:00Z";

test("DEF-38 every screen has exactly one level-1 heading", async ({ page }) => {
  test.setTimeout(900_000);
  const wrong: string[] = [];
  let booted = false;
  for (const screen of catalog.screens) {
    const path = `${screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult")}?${CLOCK}`;
    if (!booted) { await page.goto(path); booted = true; }
    else await page.evaluate((target) => { window.history.pushState(null, "", target); window.dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(150);
    const count = await page.locator("h1:visible").count();
    if (count !== 1) wrong.push(`${screen.id} ${count}`);
  }
  expect(wrong).toEqual([]);
});

test("DEF-35 the audit trail lists entries newest first", async ({ page }) => {
  await page.goto(`/o/northline/admin/audit?${CLOCK}`);
  await expect(page.locator("#main time[datetime]").first()).toBeVisible();
  const stamps = await page.locator("#main tbody time[datetime]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("datetime") ?? ""));
  expect(stamps.length).toBeGreaterThan(5);
  const sorted = [...stamps].sort((a, b) => Date.parse(b) - Date.parse(a));
  expect(stamps).toEqual(sorted);
});
