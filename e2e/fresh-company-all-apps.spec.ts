import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Fresh-company regression across every native application. */
interface Screen { id: string; applicationCode: string; route: string; sampleId: string }
const screens = (JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as {screens:Screen[]}).screens;
const entries = new Map<string, Screen>();
for (const screen of screens) {
  if (!entries.has(screen.applicationCode) && !screen.route.includes(":id") && !screen.route.includes(":slug")) entries.set(screen.applicationCode, screen);
}

test("every native app opens safely for a new company created through the four-stage blueprint", async ({ page }) => {
  test.setTimeout(35 * 15_000);
  const slug = "tenant-test-" + Math.floor(Math.random() * 9999999);
  await page.goto("/setup");
  await page.getByRole("textbox", { name: "Company name" }).fill(slug);
  await page.getByRole("textbox", { name: "Your name" }).fill("Tenant Owner");
  for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create my headquarters" }).click();
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home"));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const failures: string[] = [];
  for (const [application, screen] of entries) {
    const path = screen.route.replace(":org", slug);
    await page.goto(path);
    const main = page.locator("#main");
    await main.waitFor({timeout:8000}).catch(() => undefined);
    const content = await main.innerText().catch(() => "");
    if (!content.trim()) failures.push(application + ": blank main area");
    if (content.includes("Northline Atelier") || content.includes("Harbor Supply")) failures.push(application + ": another company's name");
    if (await page.getByRole("heading", {name:"Organization not found"}).count()) failures.push(application + ": company rejected");
    if (errors.length) failures.push(application + ": " + errors.splice(0).join("; "));
  }
  expect(entries.size).toBe(35);
  expect(failures, "Native application routing and cross-tenant information leakage").toEqual([]);
});
