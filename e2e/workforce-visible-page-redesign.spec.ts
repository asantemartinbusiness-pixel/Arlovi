import { expect, test } from "@playwright/test";

test("People Scheduling has distinct Roster, Availability, Timesheets and Exceptions experiences", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling?tab=Roster&clock=2026-11-17T09%3A00%3A00Z");
  const main = page.locator("#main");
  await expect(main.locator(".hr-bar")).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  const dayStrip = main.getByRole("group", { name: "Focus staffing day" });
  await expect(dayStrip.getByRole("button")).toHaveCount(8);
  const oneDay = dayStrip.getByRole("button").nth(2);
  await oneDay.click();
  await expect(oneDay).toHaveAttribute("aria-pressed", "true");
  await dayStrip.getByRole("button", { name: /Full week/ }).click();
  await expect(oneDay).toHaveAttribute("aria-pressed", "false");

  await page.goto("/o/northline/hr/scheduling?tab=Availability");
  await expect(main.locator(".hr-bar")).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  const search = main.getByRole("textbox", { name: "Find an employee" });
  await search.fill("qa-no-person-matches-56921");
  await expect(main).toContainText("No employees match these filters");
  await search.clear();
  await main.getByRole("button", { name: "Hide employees on leave" }).click();
  await expect(main.getByRole("button", { name: "Hide employees on leave" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/o/northline/hr/scheduling?tab=Timesheets");
  await expect(main.locator(".hr-bar")).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  await main.getByRole("button", { name: /Needs approval \(/ }).click();
  await expect(main.getByRole("button", { name: /Needs approval \(/ })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/o/northline/hr/scheduling?tab=Exceptions");
  await expect(main.locator(".hr-bar")).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  await main.getByRole("button", { name: /Critical \(/ }).click();
  await expect(main.getByRole("button", { name: /Critical \(/ })).toHaveAttribute("aria-pressed", "true");
});

test("Project Time has distinct, functional My time, Team, Costs and Approvals surfaces", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab, heading] of [
    ["My time", "Your work, recorded precisely."],
    ["Team", "Time across the team."],
    ["Costs", "Project effort, without invented prices."],
    ["Approvals", "Time decisions with a clear owner."],
  ]) {
    await page.goto(`/o/northline/project/time?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main.getByRole("button", { name: "Log time" }).first()).toBeVisible();
  }
  await page.goto("/o/northline/project/time?tab=Team");
  await main.getByRole("button", { name: "Needs approval", exact: true }).click();
  await expect(main.getByRole("button", { name: "Needs approval", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Finance Time inputs exposes distinct review filters and a non-invoice status", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Time%20inputs");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "From recorded time to accountable billing." })).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  await expect(main).toContainText("Source records, not an invoice or revenue");
  await main.getByRole("button", { name: /Needs work \(/ }).click();
  await expect(main.getByRole("button", { name: /Needs work \(/ })).toHaveAttribute("aria-pressed", "true");
  await main.getByRole("button", { name: /Ready \(/ }).click();
  await expect(main.getByRole("button", { name: /Ready \(/ })).toHaveAttribute("aria-pressed", "true");
});
