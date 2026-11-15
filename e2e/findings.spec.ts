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

test("DEF-36 a write under a frozen clock is stamped with the workspace time", async ({ page }) => {
  await page.goto(`/o/northline/hq/home?${CLOCK}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(page.getByText("Recommendation dismissed")).toBeVisible();

  // The sandbox's real date differs from the frozen date, so wall time cannot pass for it.
  const stamped = await page.evaluate(async () => {
    const open = indexedDB.open((await indexedDB.databases()).find((db) => db.name)?.name ?? "");
    const db: IDBDatabase = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const all = <T,>(store: string): Promise<T[]> => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
    const records = await all<{ updatedAt: string; collection: string }>("records");
    const events = await all<{ at: string }>("events");
    const newest = (rows: { updatedAt?: string; at?: string }[]) => rows.map((row) => row.updatedAt ?? row.at ?? "").sort().at(-1) ?? "";
    return { record: newest(records), event: newest(events), wall: new Date().toISOString() };
  });
  expect(stamped.record.startsWith("2026-11-14T09:30")).toBe(true);
  expect(stamped.event.startsWith("2026-11-14T09:30")).toBe(true);
  expect(stamped.wall.startsWith("2026-11-14T09:30")).toBe(false);
});
