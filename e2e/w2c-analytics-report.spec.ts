import { expect, test, type Page } from "@playwright/test";

/*
 * W2C — ANALYTICS query report (ARL-ANALYTICS-004): build, recompute, explain,
 * drill down to the records, export, save and reload; mobile layout.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";

async function createQueryReport(page: Page, name: string) {
  await page.goto(`/o/northline/analytics/dashboards?${CLOCK}`);
  const library = page.getByRole("region", { name: /Reports in this company/ }).or(page.locator("section", { hasText: "Reports in this company" })).first();
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: "New report" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Report name").fill(name);
  await dialog.getByLabel("Kind of report").selectOption("query");
  await dialog.getByLabel("Records to report on").selectOption("invoices");
  await expect(dialog.getByText(/[1-9]\d* invoices records in this workspace/)).toBeVisible();
  await dialog.getByRole("button", { name: "Create report" }).click();
  await expect(page).toHaveURL(/\/analytics\/reports\/[^/?]+/);
  await expect(page.getByText("Source: This workspace's records")).toBeVisible();
}

test("build a query report, read how it is computed, drill down, export and reload", async ({ page }) => {
  await createQueryReport(page, "Invoices by status");

  // Default: sum of amount grouped by status, with the calculation spelled out.
  const how = page.locator("section", { hasText: "How this is computed" }).last();
  await expect(how.getByText(/sum\(invoices\.amount\) grouped by status/).first()).toBeVisible();
  await expect(how.getByText(/invoices records? in this workspace\./)).toBeVisible();

  // Switch to a count and filter to paid invoices only.
  await page.getByLabel("Measure", { exact: true }).selectOption("count");
  await page.getByRole("button", { name: "Add a filter" }).click();
  await page.getByLabel("Filter 1 field").selectOption("status");
  await page.getByLabel("Filter 1 test").selectOption("is");
  await page.getByLabel("Filter 1 value").fill("paid");
  await expect(how.getByText(/count\(invoices\) where status is "paid" grouped by status/).first()).toBeVisible();
  await expect(how.getByText(/1 filter: \d+ kept, \d+ removed\./)).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  // Drill down to the records behind the "paid" group and open one in Finance.
  const table = page.getByRole("region", { name: "Result table" });
  await expect(table.getByRole("rowheader", { name: "paid" })).toBeVisible();
  await table.getByRole("button", { name: /Show \d+ records?/ }).first().click();
  const drill = page.locator("section", { hasText: "DRILLDOWN" }).first();
  await expect(drill.getByRole("heading", { name: "Records in “paid”" })).toBeVisible();
  await expect(drill.getByRole("link").first()).toBeVisible();

  // CSV export comes from the browser.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("invoices-by-status.csv");

  // Save, then reload: the query comes back from storage.
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Measure", { exact: true })).toHaveValue("count");
  await expect(page.getByLabel("Filter 1 value")).toHaveValue("paid");

  // The Data tab lists every record behind the report, each linking to its own screen.
  await page.getByRole("tab", { name: "Data" }).click();
  const all = page.locator("section", { hasText: "Every record behind this report" }).first();
  const link = all.getByRole("link").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/fin\/invoices\/[^/?]+/);
});

test("an empty result explains where the records went", async ({ page }) => {
  await createQueryReport(page, "Nothing matches");
  await page.getByRole("button", { name: "Add a filter" }).click();
  await page.getByLabel("Filter 1 field").selectOption("status");
  await page.getByLabel("Filter 1 test").selectOption("is");
  await page.getByLabel("Filter 1 value").fill("no-such-status");
  await expect(page.getByText("No record matches")).toBeVisible();
  await page.getByLabel("Date range").selectOption("30d");
  await expect(page.getByText(/Last 30 days on record date: \d+ kept, \d+ outside the range, \d+ with no date\./)).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the query report fits a phone", async ({ page }) => {
    await createQueryReport(page, "Phone report");
    await expect(page.getByRole("region", { name: "Result table" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
