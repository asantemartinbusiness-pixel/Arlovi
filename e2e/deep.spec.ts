import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/*
 * Deep interaction sweep.
 *
 * A screen that renders is not a screen that works. For every approved screen
 * this sweep clicks every tab, opens every contract overlay by deep link, and
 * presses every enabled action, including those in the overflow menu. Any
 * console error, uncaught exception, or "not implemented" dialog is a failure.
 *
 * One test per application, each in a fresh browser context, so every
 * application starts from the seeded workspace.
 *
 *   npx playwright test e2e/deep.spec.ts --workers=4
 *   APPS=FIN,CRM npx playwright test e2e/deep.spec.ts
 */

interface Contract {
  id: string; title: string; route: string; applicationCode: string;
  tabs: string[]; actions: string[]; overlays: string[]; sampleId: string;
}

const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as { screens: Contract[] };
const OUT = new URL("../docs/implementation/deep-sweep/", import.meta.url);
const CLOCK = "clock=2026-11-14T09:30:00Z";
const ONLY = (process.env.APPS ?? "").split(",").map((code) => code.trim()).filter(Boolean);
const NOT_BUILT = /This overlay is not implemented yet/;

const IGNORED = [/favicon/, /Download the React DevTools/, /\[vite\]/];

function pathFor(screen: Contract): string {
  return screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult");
}

interface Check { kind: "load" | "tab" | "overlay" | "action"; name: string; ok: boolean; note?: string }
interface ScreenResult { id: string; title: string; route: string; checks: Check[]; guarded: string[] }

function watch(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED.some((pattern) => pattern.test(text))) errors.push(text.slice(0, 300));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  return {
    take(): string[] {
      const copy = errors.splice(0, errors.length);
      return copy;
    },
  };
}

async function settle(page: Page, ms = 160) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(ms);
}

async function closeDialogs(page: Page) {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.getByRole("dialog").count()) === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }
}

/**
 * Client-side navigation. The first visit is a real page load; every later one
 * pushes history and lets the router render, which exercises the same code
 * paths as following a link in the app and is far faster than reloading.
 */
async function load(page: Page, url: string) {
  const booted = await page.evaluate(() => Boolean(document.querySelector(".hq"))).catch(() => false);
  if (!booted) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } else {
    await closeDialogs(page);
    await page.evaluate((target) => {
      window.history.pushState(null, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, url);
  }
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 }).catch(() => undefined);
  await settle(page, 120);
}

async function sweepScreen(page: Page, screen: Contract, errors: ReturnType<typeof watch>): Promise<ScreenResult> {
  const base = pathFor(screen);
  const checks: Check[] = [];
  const guarded: string[] = [];

  await load(page, `${base}?${CLOCK}`);
  const heading = await page.getByRole("heading", { level: 1 }).first().textContent().catch(() => null);
  const loadErrors = errors.take();
  checks.push({ kind: "load", name: "render", ok: Boolean(heading) && loadErrors.length === 0, note: heading ? loadErrors[0] : "no level-1 heading" });

  // Tabs
  for (const tab of screen.tabs) {
    await load(page, `${base}?${CLOCK}&tab=${encodeURIComponent(tab)}`);
    const selected = await page.getByRole("tab", { selected: true }).first().textContent().catch(() => null);
    const tabErrors = errors.take();
    const hasPanel = (await page.getByRole("tabpanel").count()) > 0 || screen.tabs.length <= 1;
    checks.push({ kind: "tab", name: tab, ok: tabErrors.length === 0 && hasPanel, note: tabErrors[0] ?? (hasPanel ? undefined : `no tabpanel (selected: ${selected})`) });
  }

  // Overlays, by deep link
  for (const overlay of screen.overlays) {
    await load(page, `${base}?${CLOCK}&overlay=${encodeURIComponent(overlay)}`);
    const dialog = page.getByRole("dialog").first();
    const visible = await dialog.isVisible().catch(() => false);
    const text = visible ? await dialog.innerText().catch(() => "") : "";
    const overlayErrors = errors.take();
    const ok = visible && !NOT_BUILT.test(text) && overlayErrors.length === 0;
    checks.push({
      kind: "overlay", name: overlay, ok,
      note: !visible ? "no dialog opened" : NOT_BUILT.test(text) ? "not implemented" : overlayErrors[0],
    });
  }

  // Actions: visible header buttons, then overflow menu items, each from a fresh load.
  await load(page, `${base}?${CLOCK}`);
  errors.take();
  const header = page.locator(".pg-actions");
  const headerLabels = await header.locator("button:not([aria-label='More actions'])").allInnerTexts().catch(() => [] as string[]);
  let menuLabels: string[] = [];
  const more = header.getByRole("button", { name: "More actions" });
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(120);
    menuLabels = await page.getByRole("menuitem").allInnerTexts();
    await page.keyboard.press("Escape");
  }

  const run = async (label: string, inMenu: boolean) => {
    await load(page, `${base}?${CLOCK}`);
    errors.take();
    if (inMenu) {
      await page.locator(".pg-actions").getByRole("button", { name: "More actions" }).click();
      await page.waitForTimeout(100);
      const item = page.getByRole("menuitem", { name: label, exact: true }).first();
      if (await item.getAttribute("data-disabled") !== null) { guarded.push(label); await page.keyboard.press("Escape"); return; }
      await item.click();
    } else {
      const button = page.locator(".pg-actions").getByRole("button", { name: label, exact: true }).first();
      if (await button.isDisabled()) { guarded.push(label); return; }
      await button.click();
    }
    await page.waitForTimeout(200);
    const dialog = page.getByRole("dialog").first();
    const text = (await dialog.isVisible().catch(() => false)) ? await dialog.innerText().catch(() => "") : "";
    const actionErrors = errors.take();
    checks.push({
      kind: "action", name: label,
      ok: actionErrors.length === 0 && !NOT_BUILT.test(text),
      note: NOT_BUILT.test(text) ? "opened a not-implemented overlay" : actionErrors[0],
    });
    await closeDialogs(page);
  };

  for (const label of headerLabels.map((item) => item.trim()).filter(Boolean)) await run(label, false);
  for (const label of menuLabels.map((item) => item.trim()).filter(Boolean)) await run(label, true);

  return { id: screen.id, title: screen.title, route: base, checks, guarded };
}

const apps = [...new Set(catalog.screens.map((screen) => screen.applicationCode))].filter((code) => ONLY.length === 0 || ONLY.includes(code));

test.describe.configure({ mode: "parallel" });

for (const code of apps) {
  test(`deep sweep ${code}`, async ({ browser }) => {
    const screens = catalog.screens.filter((screen) => screen.applicationCode === code);
    test.setTimeout(screens.length * 150_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = watch(page);
    const results: ScreenResult[] = [];
    mkdirSync(OUT, { recursive: true });
    for (const screen of screens) {
      results.push(await sweepScreen(page, screen, errors));
      // Written after every screen, so a timeout never discards finished work.
      writeFileSync(new URL(`${code}.json`, OUT), `${JSON.stringify(results, null, 1)}\n`);
    }
    await context.close();

    const failures = results.flatMap((result) => result.checks.filter((check) => !check.ok).map((check) => `${result.id} ${check.kind} "${check.name}": ${check.note ?? "failed"}`));
    expect(failures, `${code}: ${failures.length} failing checks`).toEqual([]);
  });
}
