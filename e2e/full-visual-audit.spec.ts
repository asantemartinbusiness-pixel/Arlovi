import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** Visual proof is captured, not declared complete. Independently review images. */
interface Contract { id: string; title: string; applicationCode: string; route: string; sampleId: string }
const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as { screens: Contract[] };
const ONLY = (process.env.VISUAL_APPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const VIEWPORTS = (process.env.VISUAL_VIEWPORTS ?? "390x844,1440x900").split(",").map((v) => {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(v.trim());
  if (!match) throw new Error("Invalid viewport: " + v);
  return { width: Number(match[1]), height: Number(match[2]) };
});
const OUT = resolve(process.env.VISUAL_OUT ?? "qa/visual-audit");
const apps = [...new Set(catalog.screens.map((screen) => screen.applicationCode))]
  .filter((code) => ONLY.length === 0 || ONLY.includes(code));
test.skip(process.env.VISUAL_SWEEP !== "1", "Opt in with VISUAL_SWEEP=1 npm run test:visual");

async function capture(page: Page, screen: Contract, width: number, height: number) {
  const target = screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult");
  const errors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text().slice(0, 250));
  };
  const onError = (error: Error) => errors.push(error.message.slice(0, 250));
  page.on("console", onConsole); page.on("pageerror", onError);
  try {
    await page.setViewportSize({ width, height });
    await page.goto(target + "?clock=2026-11-14T09:30:00Z", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 12_000 }).catch(() => undefined);
    await page.evaluate(async () => { await document.fonts.ready; });
    const heading = await page.getByRole("heading", { level: 1 }).first().textContent().catch(() => null);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const directory = resolve(OUT, screen.applicationCode, screen.id);
    mkdirSync(directory, { recursive: true });
    const screenshot = resolve(directory, String(width) + "x" + String(height) + ".png");
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    return {
      id: screen.id, application: screen.applicationCode, route: target,
      viewport: String(width) + "x" + String(height), screenshot, heading,
      overflow, errors, reviewStatus: "awaiting_independent_visual_review",
    };
  } finally {
    page.off("console", onConsole); page.off("pageerror", onError);
  }
}

for (const app of apps) {
  test("capture complete screen and viewport evidence for " + app, async ({ browser }) => {
    const screens = catalog.screens.filter((screen) => screen.applicationCode === app);
    test.setTimeout(Math.max(120_000, screens.length * VIEWPORTS.length * 30_000));
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const checks: Awaited<ReturnType<typeof capture>>[] = [];
    const problems: string[] = [];
    mkdirSync(resolve(OUT, "results"), { recursive: true });
    try {
      for (const screen of screens) {
        for (const vp of VIEWPORTS) {
          try {
            const result = await capture(page, screen, vp.width, vp.height);
            checks.push(result);
            if (!result.heading) problems.push(result.id + ": missing page heading");
            if (result.overflow > 1) problems.push(result.id + ": overflow " + result.overflow + "px");
            if (result.errors.length) problems.push(result.id + ": " + result.errors.join("; "));
          } catch (error) {
            problems.push(screen.id + " " + vp.width + "x" + vp.height + ": " + String(error));
          }
          writeFileSync(resolve(OUT, "results", app + ".json"), JSON.stringify({
            application: app, capturedAt: new Date().toISOString(),
            screenshotsAreNotApproval: true, checks, problems,
          }, null, 2));
        }
      }
    } finally { await context.close(); }
    expect(checks.length).toBe(screens.length * VIEWPORTS.length);
    expect(problems, "Fix browser console errors, horizontal page overflow and missing content").toEqual([]);
  });
}
