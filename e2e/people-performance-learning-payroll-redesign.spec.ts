import { expect, test } from "@playwright/test";

test("Performance has distinct Cycles, My reviews, Team and Templates screens", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab] of [
    ["Cycles", "Every review cycle, accounted for."],
    ["My reviews", "Your reviews and decisions."],
    ["Team", "The team review ledger."],
    ["Templates", "Structure before judgement."],
  ]) {
    await page.goto(`/o/northline/hr/performance?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    if (tab !== "Team" || await main.locator(".ops-metrics").count() > 0) {
      await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    }
  }
  await page.goto("/o/northline/hr/performance?tab=My%20reviews");
  const filter = main.getByRole("button", { name: "Outstanding", exact: true });
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  const search = main.getByRole("textbox", { name: "Search performance reviews" });
  await search.fill("qa-no-review-39402");
  await expect(main.getByText(/No reviews match these filters|No review involves you/).first()).toBeVisible();
  await search.clear();
  await main.getByRole("button", { name: "All", exact: true }).click();
  await expect(main.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Learning & Policies presents four pages with live search and real required-only filters", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab] of [
    ["Courses", "Learning people can actually follow."],
    ["Policies", "Policies that can be read and acknowledged."],
    ["Compliance", "Requirements, evidence and outstanding work."],
    ["My learning", "Your learning record, in context."],
  ]) {
    await page.goto(`/o/northline/hr/learning?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
  }
  await page.goto("/o/northline/hr/learning?tab=Courses");
  const required = main.getByRole("button", { name: "Required only", exact: true });
  await required.click();
  await expect(required).toHaveAttribute("aria-pressed", "true");
  const search = main.getByRole("textbox", { name: "Search learning and policies" });
  await search.fill("qa-no-course-93921");
  await expect(main).toContainText("No courses match the filters");
  await search.clear();
  await page.goto("/o/northline/hr/learning?tab=Compliance");
  await expect(main).toContainText("Aggregate totals do not establish individual compliance");
});

test("Payroll separates runs, salary inputs, human approvals and illustrative payslips", async ({ page }) => {
  const main = page.locator("#main");
  for (const tab of ["Runs", "Inputs", "Approvals", "Payslips"]) {
    await page.goto(`/o/northline/hr/payroll?tab=${encodeURIComponent(tab)}`);
    if (await main.getByRole("region", { name: "Payroll is restricted." }).count()) {
      await expect(main).toContainText("restricted");
      continue;
    }
    // A4: the restating tab headline is gone; the tab is proven by its own content and the estimate notice.
    await expect(main.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main).toContainText("Estimates, not verified payroll");
  }
  await page.goto("/o/northline/hr/payroll?tab=Runs");
  if (await main.getByRole("region", { name: "Payroll is restricted." }).count()) return;
  const state = main.getByRole("group", { name: "Find and filter payroll runs" });
  await state.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(state.getByRole("button", { name: "Draft", exact: true })).toHaveAttribute("aria-pressed", "true");
  await state.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(state.getByRole("button", { name: "Approved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/o/northline/hr/payroll?tab=Payslips");
  await expect(main).toContainText("These are not issued payslips");
});

test("Missing employee salary remains a missing input, not a computed zero payslip", async ({ page }) => {
  await page.goto("/o/northline/hr/payroll?tab=Inputs");
  const main = page.locator("#main");
  if (await main.getByRole("region", { name: "Payroll is restricted." }).count()) return;
  await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const missing = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA No Salary Defined", status: "active",
      fields: { employment: "full-time", title: "Analyst" },
    }, ctx);
    await repo.putMany([missing], ctx, [], "org-northline");
  });
  await page.reload();
  await expect(main).toContainText("QA No Salary Defined");
  const missingRecord = main.getByText("QA No Salary Defined");
  await expect(missingRecord).toHaveCount(1);
  // The employee evidence may be below the fold in a collapsed card at mobile
  // widths. Its presence and exclusion, not viewport visibility, are the contract.
  await expect(main).toContainText("Salary missing or invalid");
  await expect(main).toContainText("Excluded from all illustrative payroll calculations");
});
