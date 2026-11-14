import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface Contract {
  id: string; title: string; route: string; applicationCode: string;
  tabs: string[]; actions: string[]; overlays: string[]; sampleId: string;
}

const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as { screens: Contract[] };

function pathFor(screen: Contract, slug = "northline"): string {
  return screen.route.replace(":org", slug).replace(":id", screen.sampleId).replace(":slug", "showroom-consult");
}

/** Fixed clock so every time-dependent view is deterministic in CI. */
const CLOCK = "clock=2026-11-14T09:30:00Z";

interface Result {
  id: string; route: string; app: string; heading: string | null;
  tabsFound: number; tabsRequired: number; errors: string[];
}

test.describe("screen contract sweep", () => {
  test.describe.configure({ mode: "serial" });

  test("every approved screen renders without a console error", async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const results: Result[] = [];

    for (const screen of catalog.screens) {
      const errors: string[] = [];
      const onConsole = (message: { type: () => string; text: () => string }) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 240));
      };
      const onPageError = (error: Error) => errors.push(`pageerror: ${error.message.slice(0, 240)}`);
      page.on("console", onConsole);
      page.on("pageerror", onPageError);

      const route = `${pathFor(screen)}?${CLOCK}`;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(220);

      const heading = await page.getByRole("heading", { level: 1 }).first().textContent().catch(() => null);
      const tabsFound = await page.getByRole("tab").count();

      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      results.push({
        id: screen.id, route, app: screen.applicationCode, heading,
        tabsFound, tabsRequired: screen.tabs.length,
        errors: errors.filter((text) => !text.includes("favicon") && !text.includes("Download the React DevTools")),
      });
    }

    writeFileSync(new URL("../docs/implementation/screen-sweep.json", import.meta.url), `${JSON.stringify(results, null, 2)}\n`);

    const broken = results.filter((row) => row.errors.length > 0);
    const headless = results.filter((row) => !row.heading);
    expect.soft(headless.map((row) => row.id), "screens with no level-1 heading").toEqual([]);
    expect(broken.map((row) => `${row.id} ${row.route}: ${row.errors[0]}`), "screens with console errors").toEqual([]);
  });
});

test.describe("organisation scoping", () => {
  test("switching company changes the records every global surface reads", async ({ page }) => {
    await page.goto(`/o/northline/hq/home?${CLOCK}`);
    await expect(page.getByRole("heading", { level: 1, name: "Executive Home" })).toBeVisible();

    await page.goto(`/o/harbor/hq/home?${CLOCK}`);
    await expect(page.getByRole("button", { name: /Search Harbor/ })).toBeVisible();

    await page.getByRole("button", { name: /Search Harbor/ }).click();
    const dialog = page.getByRole("dialog", { name: /Search Harbor Supply/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("Northline");
    await expect(dialog.getByText(/Nothing in Harbor Supply matches/)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Ask Arlovi/ }).first().click();
    await expect(page.getByText("Reading Harbor Supply only")).toBeVisible();
  });
});

test.describe("command palette", () => {
  test("a record hit navigates to the record", async ({ page }) => {
    await page.goto(`/o/northline/hq/home?${CLOCK}`);
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: /Search Northline/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("INV");
    const option = dialog.getByRole("option").first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).not.toHaveURL(/hq\/home/);
  });
});

async function overflowAt(page: Page, width: number, route: string): Promise<number> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(260);
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("responsive anatomy", () => {
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
  const routes = [
    "/o/northline/hq/home",
    "/o/northline/fin/invoices",
    "/o/northline/crm/deals",
    "/o/northline/ai/chat",
    "/o/northline/project/tasks",
  ];
  for (const route of routes) {
    test(`no horizontal overflow across widths: ${route}`, async ({ page }) => {
      const bad: string[] = [];
      for (const width of widths) {
        const overflow = await overflowAt(page, width, `${route}?${CLOCK}`);
        if (overflow > 2) bad.push(`${width}px overflows by ${overflow}px`);
      }
      expect(bad, route).toEqual([]);
    });
  }
});
