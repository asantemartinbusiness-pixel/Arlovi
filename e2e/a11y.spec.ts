import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/o/northline/hq/home", "/o/northline/fin/home", "/o/northline/docs/documents/nl-documents-001", "/o/northline/crm/deals"];

for (const route of routes) {
  test(`axe ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
  });
}
