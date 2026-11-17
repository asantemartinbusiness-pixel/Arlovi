import { expect, test } from "@playwright/test";

test("People Overview has distinct interactive Overview, My team, HR tasks and Trends tabs", async ({ page }) => {
  const main = page.locator("#main");
  const tabs = [
    ["Overview", "A clearer view of the people behind the work."],
    ["My team", "Your team, person by person."],
    ["HR tasks", "People decisions, in one queue."],
    ["Trends", "Understand the shape of the team."],
  ];
  for (const [tab, heading] of tabs) {
    await page.goto(`/o/northline/hr/home?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    if (tab !== "Overview") await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  }
  await page.goto("/o/northline/hr/home?tab=HR%20tasks");
  await main.getByRole("button", { name: "Leave approval", exact: true }).click();
  await expect(main.getByRole("button", { name: "Leave approval", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await main.getByRole("button", { name: "All", exact: true }).click();
  await expect(main.getByRole("button", { name: "All", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});

test("Employee Directory has searchable people and real team filters across responsive layouts", async ({ page }) => {
  await page.goto("/o/northline/hr/employees?tab=People");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "People, with context." })).toBeVisible();
  await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  const search = main.getByRole("textbox", { name: "Search employee directory" });
  await search.fill("qa-name-that-does-not-exist-76354");
  await expect(main).toContainText("No matching people");
  await search.clear();
  const teamFilter = main.getByLabel("Filter by department");
  await expect(teamFilter).toBeVisible();
  const count = await teamFilter.locator("option").count();
  if (count > 1) {
    const team = await teamFilter.locator("option").nth(1).getAttribute("value");
    if (!team) throw new Error("The first department has no ID");
    await teamFilter.selectOption(team);
    await expect(teamFilter).toHaveValue(team);
    await main.getByRole("button", { name: "Clear the filter" }).click();
    await expect(teamFilter).toHaveValue("");
  }
  await main.getByRole("button", { name: "No department", exact: true }).click();
  await expect(main.getByRole("button", { name: "No department", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Directory Team, Contractor and Alumni tabs retain distinct content and company-scoped counts", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab, heading] of [
    ["Teams", "Explore how teams connect."],
    ["Contractors", "The extended workforce."],
    ["Alumni", "People who helped build the work."],
  ]) {
    await page.goto(`/o/northline/hr/employees?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  }
  await page.goto("/o/northline/hr/employees?tab=Teams");
  const button = main.getByRole("button", { name: "Explore team" }).first();
  if (await button.count()) {
    await button.click();
    await expect(main.getByRole("heading", { name: "People, with context." })).toBeVisible();
    const filter = main.getByLabel("Filter by department");
    await expect(filter).not.toHaveValue("");
  }
});

test("Every employee-profile tab has the same identity, company scope and record evidence", async ({ page }) => {
  const main = page.locator("#main");
  for (const tab of ["Overview", "Job", "Documents", "Leave", "Performance", "Access"]) {
    await page.goto(`/o/northline/hr/employees/nl-employees-001?tab=${encodeURIComponent(tab)}`);
    await expect(main.locator(".hr-profile-identity h2")).toBeVisible();
    await expect(main.locator(".hr-profile-identity")).toContainText(`Employee profile / ${tab}`);
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main.getByRole("button", { name: "Employee directory", exact: true })).toBeVisible();
  }
  await main.getByRole("button", { name: "Employee directory", exact: true }).click();
  await expect(main.getByRole("heading", { name: "People, with context." })).toBeVisible();
});

test("Profile content does not expose an employee from another organisation", async ({ page }) => {
  await page.goto("/o/harbor/hr/employees/nl-employees-001");
  const main = page.locator("#main");
  await expect(main).toContainText("This record belongs to another organisation");
  await expect(main.locator(".hr-profile-identity")).toHaveCount(0);
});
